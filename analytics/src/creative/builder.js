'use strict';

const { resolveProductId } = require('../../config/product');
const { resolveAssetOrigin } = require('../learning/assetOrigin');
const { minimumEvidenceFor } = require('../experiments/evidence');
const { aggregateCreativeMetrics, listAvailableDates } = require('./metricsAggregator');
const { buildCreativeDNA } = require('./dna');
const { classifyCreativeMessage } = require('./messageClassification');
const { inferFormatHintFromName } = require('./formats');
const { diagnosePerformanceLayers } = require('./performanceLayers');
const { computeCreativeScore } = require('./score');
const { classifyCreativeStatus } = require('./status');
const { generateNextCreativeCandidates } = require('./candidateGenerator');

/**
 * Deriva um creative_id ESTÁVEL e determinístico a partir do ad_name real da Meta. "Criativo NN
 * - ..." vira CREATIVE-NN (o vocabulário que o próprio Douglas já usa: "Creative 01", "Creative
 * 05"). "... - Variante B" é reconhecida como genealogia real (geração 2, pai = a base sem o
 * sufixo) — não inventada, é o que o próprio nome do anúncio já diz. Ad names fora do padrão
 * "Criativo NN" viram um slug estável prefixado AD- (nunca perdem o dado, nunca travam).
 */
function deriveCreativeIdentity(adName) {
  const variantMatch = adName.match(/^(.*?)\s*-\s*Variante\s+([A-Z0-9]+)\s*$/i);
  if (variantMatch) {
    const [, baseName, variantLabel] = variantMatch;
    const base = deriveCreativeIdentity(baseName.trim());
    return { creative_id: `${base.creative_id}-VARIANTE-${variantLabel.toUpperCase()}`, parent_creative_id: base.creative_id, generation: 2, base_name: baseName.trim() };
  }
  const numberedMatch = adName.match(/^Criativo\s+(\d+)/i);
  if (numberedMatch) {
    return { creative_id: `CREATIVE-${numberedMatch[1].padStart(2, '0')}`, parent_creative_id: null, generation: 1, base_name: adName };
  }
  const slug = adName.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { creative_id: `AD-${slug}`, parent_creative_id: null, generation: 1, base_name: adName };
}

/**
 * Descobre e analisa TODOS os criativos reais já reportados pelo Meta (nunca chama API — lê
 * analytics/data/daily/). Nenhum dado financeiro por criativo é inventado (Hotmart não atribui
 * por anúncio — ver metricsAggregator.js). O peer group pra normalização/score é "todos os
 * criativos do mesmo product_id com amostra suficiente" — comparação justa, sem benchmark externo.
 */
function analyzeRealCreatives({ productId, dates, dataDir, hypotheses = [] } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const effectiveDates = dates || listAvailableDates(dataDir);
  const raw = aggregateCreativeMetrics(effectiveDates, dataDir);
  const minEvidence = minimumEvidenceFor('CREATIVE');

  const withIdentity = raw.map((r) => {
    const identity = deriveCreativeIdentity(r.ad_name);
    const formatHint = inferFormatHintFromName(r.ad_name);
    const dna = buildCreativeDNA({ dominant_message: r.ad_name, format: null });
    const sample_sufficient = (r.performance.lpv ?? 0) >= (minEvidence.lpv ?? 0) && (r.performance.checkout ?? 0) >= (minEvidence.checkouts ?? 0);
    return {
      creative_id: identity.creative_id,
      product_id: resolvedProductId,
      name: r.ad_name,
      asset_origin: resolveAssetOrigin({}), // nenhum registro humano/máquina explícito ainda -> UNKNOWN, nunca inferido retroativamente (PASSO 8, item 14)
      format_hint: formatHint.format_hint,
      format_hint_confidence: formatHint.confidence,
      platform: 'META',
      placement: null, // não coletado pelo Data Agent hoje
      generation: identity.generation,
      parent_creative_id: identity.parent_creative_id,
      hypothesis_id: null,
      experiment_id: null,
      dna,
      message_classification: classifyCreativeMessage(dna),
      performance: r.performance,
      fatigue: r.fatigue,
      sample_sufficient,
      minimum_evidence: minEvidence,
      learning_status: null,
    };
  });

  const eligibleForComparison = withIdentity.filter((a) => a.sample_sufficient);
  const peerPerformances = eligibleForComparison.map((a) => a.performance);

  const scored = withIdentity.map((a) => {
    if (!a.sample_sufficient) {
      return { ...a, performance_layers: null, score_result: computeCreativeScore(a.performance, [], false) };
    }
    return {
      ...a,
      performance_layers: diagnosePerformanceLayers(a.performance, peerPerformances),
      score_result: computeCreativeScore(a.performance, peerPerformances, true),
    };
  });

  const bestScore = Math.max(-1, ...eligibleForComparison.map((a) => scored.find((s) => s.creative_id === a.creative_id).score_result.creative_score ?? -1));

  const productHypotheses = hypotheses.filter((h) => h.product_id === resolvedProductId && h.category === 'CREATIVE');

  const withStatus = scored.map((a) => {
    const scoreGapFromBest = a.sample_sufficient && a.score_result.creative_score != null ? bestScore - a.score_result.creative_score : null;
    const isBestAmongCompared = a.sample_sufficient && a.score_result.creative_score === bestScore && bestScore >= 0;
    // hasChampionEvidence: existe hipótese STRONG do Learning Engine pra CREATIVE neste produto
    // (não amarrado a este creative_id específico ainda — o Learning Engine não referencia
    // creative_id hoje; é um sinal agregado da categoria, documentado como tal).
    const hasChampionEvidence = productHypotheses.some((h) => h.status === 'STRONG');
    // experimentConcludedFailure: nunca inferido — só true se um experimento REAL do Experiment
    // Engine, referenciando este creative_id, já concluiu FAILURE (nenhum experimento real
    // referencia creative_id hoje, então fica sempre false até essa ligação existir).
    const experimentConcludedFailure = false;
    const statusResult = classifyCreativeStatus({
      sampleSufficient: a.sample_sufficient, isArchived: false, isFatigued: false,
      isBestAmongCompared, hasChampionEvidence, scoreGapFromBest,
      scoreConfidence: a.score_result.score_confidence, experimentConcludedFailure,
    });
    return { ...a, status: statusResult.status, status_reason: statusResult.reason };
  });

  const bestCurrentSignal = withStatus.find((a) => a.status === 'BEST_SIGNAL' || a.status === 'CHAMPION') || null;
  const champion = withStatus.find((a) => a.status === 'CHAMPION') || null;

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    dates_analyzed: effectiveDates,
    total_creatives_found: withStatus.length,
    creatives_with_sufficient_sample: eligibleForComparison.length,
    best_current_signal: bestCurrentSignal ? bestCurrentSignal.creative_id : null,
    champion: champion ? champion.creative_id : null,
    assets: withStatus,
  };
}

function buildAssetsForRegistry(analysis) {
  return analysis.assets.map((a) => ({
    creative_id: a.creative_id,
    product_id: a.product_id,
    name: a.name,
    status: a.status,
    status_reason: a.status_reason,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    asset_origin: a.asset_origin,
    format: a.dna.format,
    format_hint: a.format_hint,
    platform: a.platform,
    placement: a.placement,
    generation: a.generation,
    parent_creative_id: a.parent_creative_id,
    hypothesis_id: a.hypothesis_id,
    experiment_id: a.experiment_id,
    creative_dna: a.dna,
    message_classification: a.message_classification,
    performance: a.performance,
    fatigue: a.fatigue,
    performance_layers: a.performance_layers,
    score: a.score_result,
    sample_sufficient: a.sample_sufficient,
    learning_status: a.learning_status,
  }));
}

/** Orquestra análise + geração de candidatos (não persiste sozinho — quem chama decide salvar). */
function runCreativeIntelligence({ productId, dates, dataDir, hypotheses = [], candidateCount = 4 } = {}) {
  const analysis = analyzeRealCreatives({ productId, dates, dataDir, hypotheses });
  const assetsForRegistry = buildAssetsForRegistry(analysis);
  const candidates = generateNextCreativeCandidates({ assets: analysis.assets, hypotheses, productId: analysis.product_id, count: candidateCount });
  return { analysis, assets: assetsForRegistry, candidates };
}

module.exports = { analyzeRealCreatives, buildAssetsForRegistry, runCreativeIntelligence, deriveCreativeIdentity };
