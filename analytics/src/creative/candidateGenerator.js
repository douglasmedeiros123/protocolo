'use strict';

const { buildCreativeHypothesis } = require('./hypothesis');
const { checkCreativePriorLearning } = require('./priorLearning');
const { toExperimentCompatibleFields } = require('./experimentCompat');
const { adjustConfidenceForPriorLearning, normalizeExpectedValueScores } = require('../decision/expectedValue');
const { nextGenerationId } = require('./genealogy');
const { ACTIONABLE_LAYERS } = require('./performanceLayers');

// Cada camada ACIONÁVEL de performance (ver performanceLayers.js) tem UMA variável de criativo e
// UMA métrica-alvo "naturais" pra atacá-la — documentado, não é escolha arbitrária por
// candidato. FINANCIAL_ECONOMICS nunca entra aqui (NOT_ATTRIBUTABLE — nada acionável a testar).
const LAYER_TO_VARIABLE = { ATTENTION: 'hook', TRAFFIC_EFFICIENCY: 'hook', INTENT: 'proof', META_CONVERSION: 'cta', PLATFORM_ECONOMICS: 'promise' };
const LAYER_TO_TARGET_METRIC = { ATTENTION: 'ctr', TRAFFIC_EFFICIENCY: 'cost_per_lpv', INTENT: 'lpv_to_checkout_rate', META_CONVERSION: 'checkout_to_meta_purchase_rate', PLATFORM_ECONOMICS: 'roas_marketing' };
const EXPECTED_DIRECTION_FOR_METRIC = { ctr: 'INCREASE', cost_per_lpv: 'DECREASE', lpv_to_checkout_rate: 'INCREASE', checkout_to_meta_purchase_rate: 'INCREASE', roas_marketing: 'INCREASE' };

// TARGET_METRIC_SOURCE (PASSO 8.1, item 6) — TODA métrica-alvo hoje vem do lado Meta/plataforma,
// NUNCA do Hotmart (não existe atribuição financeira por criativo). roas_marketing em especial
// precisa desse rótulo explícito pra nunca ser confundido com ROAS financeiro real.
const TARGET_METRIC_SOURCE = 'META_PLATFORM';

// CAUSAL_DISTANCE (PASSO 8.1, item 7) — quão direta é a cadeia causal entre a variável mudada e
// a métrica-alvo. Documentado par a par; combinação não mapeada cai no default conservador
// INTERMEDIATE (nunca assume DIRECT por padrão).
//   hook  -> ctr                            : DIRECT       (o hook É o que decide o thumbstop)
//   hook  -> cost_per_lpv                   : INTERMEDIATE (afeta CTR, que só depois vira LPV)
//   proof -> lpv_to_checkout_rate           : DIRECT       (prova/objeção atua exatamente na decisão LPV->checkout)
//   cta   -> checkout_to_meta_purchase_rate : INDIRECT     (CTA está no anúncio; a conclusão da compra
//                                                            depende de preço/checkout/confiança na LP,
//                                                            muitos passos depois do CTA do anúncio)
//   promise -> roas_marketing               : INDIRECT     (ROAS agrega todo o funil — clique, LPV,
//                                                            checkout, compra — muitos confundidores)
const CAUSAL_DISTANCE = {
  hook: { ctr: 'DIRECT', cost_per_lpv: 'INTERMEDIATE' },
  proof: { lpv_to_checkout_rate: 'DIRECT' },
  cta: { checkout_to_meta_purchase_rate: 'INDIRECT' },
  promise: { roas_marketing: 'INDIRECT' },
};
const CAUSAL_DISTANCE_MULTIPLIER = { DIRECT: 1.0, INTERMEDIATE: 0.85, INDIRECT: 0.65 };

function resolveCausalDistance(variableChanged, targetMetric) {
  return CAUSAL_DISTANCE[variableChanged]?.[targetMetric] || 'INTERMEDIATE';
}

function causalChainExplanation(variableChanged, targetMetric, causalDistance) {
  const CHAINS = {
    'hook->ctr': 'o hook é o elemento que decide se a pessoa para o scroll — efeito direto sobre CTR.',
    'hook->cost_per_lpv': 'o hook afeta CTR, e CTR afeta o custo por LPV — um passo intermediário (CPM/qualidade do clique também influenciam).',
    'proof->lpv_to_checkout_rate': 'a prova/objeção atua exatamente na hesitação entre ver a LP e avançar pro checkout — efeito direto.',
    'cta->checkout_to_meta_purchase_rate': 'o CTA está no anúncio, mas a conclusão da compra depende de preço, fricção do checkout e confiança na própria LP — vários passos entre a variável e a métrica.',
    'promise->roas_marketing': 'roas_marketing agrega TODO o funil (clique->LPV->checkout->compra->receita) — muitos confundidores entre a promessa do anúncio e esse resultado agregado.',
  };
  return CHAINS[`${variableChanged}->${targetMetric}`] || `relação entre "${variableChanged}" e "${targetMetric}" não documentada explicitamente — tratada como ${causalDistance} por padrão conservador.`;
}

// EXPLOIT = variação próxima do melhor sinal atual (risco/custo relativo menor, mais rápido).
// EXPLORE = hipótese estruturalmente diferente, pra descobrir caminho novo (risco/custo maior,
// mas maior valor de aprendizado quando dá certo — ver LEARNING_VALUE_MULTIPLIER).
const RELATIVE_COST = { EXPLOIT: 1, EXPLORE: 2 };
const RISK = { EXPLOIT: 1, EXPLORE: 2 };
const TIME_TO_EVIDENCE_DAYS = 7; // minimum_evidence.duration_days da categoria CREATIVE (evidence.js)
// Multiplicador (não aditivo) — EXPLORE já é penalizado por custo/risco maiores no denominador;
// este fator é só um reconhecimento PARCIAL de que descobrir um caminho novo tem valor de
// aprendizado além do impacto imediato, não uma sobreposição que anule custo/risco/confiança.
const LEARNING_VALUE_MULTIPLIER = { EXPLOIT: 1.0, EXPLORE: 1.3 };

// Ordem de "pior primeiro" com o vocabulário STRONGER/WEAKER/MIXED/INSUFFICIENT_DATA — MIXED
// fica entre WEAKER e STRONGER (sinal parcialmente ruim, não claramente ruim). Camadas
// NOT_ATTRIBUTABLE (FINANCIAL_ECONOMICS) nunca entram aqui — nada acionável a testar.
function worstLayersRanked(diagnosis) {
  const order = { WEAKER: 0, MIXED: 1, INSUFFICIENT_DATA: 1.5, STRONGER: 2 };
  return Object.entries(diagnosis)
    .filter(([layer]) => ACTIONABLE_LAYERS.includes(layer))
    .sort((a, b) => order[a[1].classification] - order[b[1].classification])
    .map(([layer]) => layer);
}

function buildCandidate({ id, parentAsset, variableChanged, targetMetric, mode, hypothesisReason, productId, hypotheses }) {
  const expectedDirection = EXPECTED_DIRECTION_FOR_METRIC[targetMetric];
  const hypothesis = buildCreativeHypothesis({
    variableChanged, metricExpectedToMove: targetMetric, reason: hypothesisReason, expectedDirection,
  });

  const priorLearning = checkCreativePriorLearning({ productId, targetMetric, variableChanged }, hypotheses || []);
  const baseConfidence = parentAsset.score_result?.score_confidence != null ? parentAsset.score_result.score_confidence / 100 : 0.3;
  const priorAdjustedConfidence = adjustConfidenceForPriorLearning(baseConfidence, priorLearning.verdict);

  const causalDistance = resolveCausalDistance(variableChanged, targetMetric);
  const adjustedConfidence = Math.min(1, priorAdjustedConfidence * CAUSAL_DISTANCE_MULTIPLIER[causalDistance]);

  // "impacto esperado" aqui é um PROXY determinístico (não uma projeção financeira como no
  // Experiment Engine — não existe simulador de criativo->receita ainda): o gap relativo do
  // criativo-pai pro peer_median na métrica-alvo, maior gap = mais espaço de melhora possível.
  const layerDiag = parentAsset.performance_layers?.[layerForVariable(variableChanged)];
  const impactProxy = layerDiag && layerDiag.ratio_to_peer_median != null ? Math.abs(1 - layerDiag.ratio_to_peer_median) : 0.2;

  const relativeCost = RELATIVE_COST[mode];
  const risk = RISK[mode];
  const rawPriority = (impactProxy * adjustedConfidence * LEARNING_VALUE_MULTIPLIER[mode]) / (relativeCost * TIME_TO_EVIDENCE_DAYS * risk);

  const candidate = {
    candidate_id: id,
    parent_creative_id: parentAsset.creative_id,
    product_id: productId,
    generation: (parentAsset.generation || 1) + 1,
    mode, // EXPLOIT | EXPLORE
    preserved_elements: PRINCIPAL_TEST_VARIABLES.filter((v) => v !== variableChanged),
    variable_changed: variableChanged,
    new_value: null, // brief, não gera copy/imagem real (PASSO 8)
    hypothesis,
    target_metric: targetMetric,
    target_metric_source: TARGET_METRIC_SOURCE, // PASSO 8.1 item 6 — nunca confundir com financeiro
    causal_distance: causalDistance,
    causal_chain_explanation: causalChainExplanation(variableChanged, targetMetric, causalDistance),
    expected_effect: {
      target_metric: targetMetric,
      target_metric_source: TARGET_METRIC_SOURCE,
      expected_direction: expectedDirection,
      parent_current_value: parentAsset.performance ? parentAsset.performance[targetMetric] : null,
      peer_median: layerDiag ? layerDiag.peer_median : null,
      note: 'Proxy determinístico (gap vs peer group), métrica de PLATAFORMA (Meta) — NÃO é uma projeção financeira nem financial_roas. Nenhum número de resultado é garantido.',
    },
    risk,
    confidence: Math.round(adjustedConfidence * 100) / 100,
    prior_learning_status: priorLearning.verdict,
    reason_to_test: hypothesisReason,
    recommended_format: parentAsset.format_hint || null,
    creative_brief: buildCreativeBrief({ parentAsset, variableChanged, hypothesis }),
    _raw_priority: rawPriority,
  };

  return { ...candidate, ...toExperimentCompatibleFields(candidate) };
}

const PRINCIPAL_TEST_VARIABLES = ['hook', 'angle', 'pain', 'desire', 'mechanism', 'promise', 'proof', 'objection', 'cta', 'visual_style', 'format'];

function layerForVariable(variable) {
  return Object.entries(LAYER_TO_VARIABLE).find(([, v]) => v === variable)?.[0] || 'PLATFORM_ECONOMICS';
}

function buildCreativeBrief({ parentAsset, variableChanged, hypothesis }) {
  return {
    objective: `Testar isoladamente "${variableChanged}" a partir de ${parentAsset.creative_id} (${parentAsset.name}), preservando as demais variáveis principais.`,
    audience_context: 'Mesmo público/posicionamento do criativo-pai (não redefinido nesta etapa).',
    hook: variableChanged === 'hook' ? 'A DEFINIR — escrever novo hook conforme a hipótese abaixo.' : 'Preservar o hook do criativo-pai (conteúdo real ainda não catalogado no DNA — reaproveitar o ativo original).',
    headline: null,
    body: variableChanged === 'promise' || variableChanged === 'mechanism' ? 'A DEFINIR — ajustar conforme a hipótese abaixo.' : 'Preservar do criativo-pai.',
    proof: variableChanged === 'proof' ? 'A DEFINIR — incluir prova/evidência nova conforme a hipótese abaixo.' : 'Preservar do criativo-pai.',
    cta: variableChanged === 'cta' ? 'A DEFINIR — testar novo CTA conforme a hipótese abaixo.' : 'Preservar do criativo-pai.',
    visual_direction: variableChanged === 'visual_style' || variableChanged === 'format' ? 'A DEFINIR — nova direção visual conforme a hipótese abaixo.' : 'Preservar o estilo visual do criativo-pai.',
    format: parentAsset.format_hint || 'UNKNOWN — sem confirmação de formato real do criativo-pai.',
    aspect_ratio: null,
    placement: null,
    preserve: PRINCIPAL_TEST_VARIABLES.filter((v) => v !== variableChanged),
    change: [variableChanged],
    avoid: 'Não alterar mais de uma variável principal ao mesmo tempo (isolamento causal) — ver genealogy.js.',
    hypothesis_statement: hypothesis.statement,
  };
}

/**
 * generateNextCreativeCandidates() (PASSO 8, item 12) — NÃO gera imagem, só briefs
 * estruturados. Combina EXPLOIT (variações do melhor sinal atual, atacando a camada mais fraca
 * primeiro) com EXPLORE (1-2 hipóteses de um criativo estruturalmente diferente) — diversidade
 * controlada (item 23). Cada candidato carrega causal_distance (PASSO 8.1) — hipóteses INDIRECT
 * têm confidence/priority reduzidas automaticamente (ver CAUSAL_DISTANCE_MULTIPLIER).
 */
function generateNextCreativeCandidates({ assets, hypotheses, productId, count = 4 }) {
  const eligible = assets.filter((a) => a.sample_sufficient && a.performance_layers);
  if (eligible.length === 0) return [];

  const sorted = [...eligible].sort((a, b) => (b.score_result?.creative_score ?? -1) - (a.score_result?.creative_score ?? -1));
  const leader = sorted[0];
  const challenger = sorted[1] || null;

  const exploreCount = count >= 4 ? 2 : (count >= 2 ? 1 : 0);
  const exploitCount = Math.max(0, count - exploreCount);

  const existingIds = assets.map((a) => a.creative_id);
  const candidates = [];

  const worstLayers = worstLayersRanked(leader.performance_layers);
  const usedVariables = new Set();
  for (const layer of worstLayers) {
    if (candidates.filter((c) => c.mode === 'EXPLOIT').length >= exploitCount) break;
    const variable = LAYER_TO_VARIABLE[layer];
    if (usedVariables.has(variable)) continue;
    usedVariables.add(variable);
    const id = nextGenerationId(leader.creative_id, [...existingIds, ...candidates.map((c) => c.candidate_id)]);
    candidates.push(buildCandidate({
      id, parentAsset: leader, variableChanged: variable, targetMetric: LAYER_TO_TARGET_METRIC[layer], mode: 'EXPLOIT',
      hypothesisReason: `${leader.creative_id} está ${layer} abaixo do peer group (ver performance_layers) — ${variable} é a alavanca mais direta pra essa camada`,
      productId, hypotheses,
    }));
  }

  if (challenger && exploreCount > 0) {
    const challengerWorstLayers = worstLayersRanked(challenger.performance_layers).filter((l) => !usedVariables.has(LAYER_TO_VARIABLE[l]));
    const layer = challengerWorstLayers[0] || worstLayersRanked(challenger.performance_layers)[0];
    const variable = LAYER_TO_VARIABLE[layer];
    const id = nextGenerationId(challenger.creative_id, [...existingIds, ...candidates.map((c) => c.candidate_id)]);
    candidates.push(buildCandidate({
      id, parentAsset: challenger, variableChanged: variable, targetMetric: LAYER_TO_TARGET_METRIC[layer], mode: 'EXPLORE',
      hypothesisReason: `Explorar um ângulo estruturalmente diferente a partir de ${challenger.creative_id} (não apenas otimizar o líder atual) — ${layer} é a camada mais fraca dele`,
      productId, hypotheses,
    }));
  }

  // 2ª EXPLORE, se pedido e ainda houver espaço: variável AINDA não testada em nenhum candidato,
  // no próprio líder — descoberta de um caminho novo mesmo partindo do melhor sinal atual.
  if (exploreCount > 1) {
    const untested = Object.values(LAYER_TO_VARIABLE).find((v) => !usedVariables.has(v) && !candidates.some((c) => c.variable_changed === v));
    if (untested) {
      const layer = Object.entries(LAYER_TO_VARIABLE).find(([, v]) => v === untested)[0];
      const id = nextGenerationId(leader.creative_id, [...existingIds, ...candidates.map((c) => c.candidate_id)]);
      candidates.push(buildCandidate({
        id, parentAsset: leader, variableChanged: untested, targetMetric: LAYER_TO_TARGET_METRIC[layer], mode: 'EXPLORE',
        hypothesisReason: `Hipótese ainda não coberta pelos outros candidatos — testar "${untested}" no melhor sinal atual pra descobrir se essa dimensão também importa`,
        productId, hypotheses,
      }));
    }
  }

  const normalized = normalizeExpectedValueScores(candidates.map((c) => ({ ...c, expected_value: { raw_ev: c._raw_priority } })));
  return normalized.map(({ _raw_priority, expected_value, ...c }) => ({ ...c, priority_score: expected_value.expected_value_score }));
}

module.exports = {
  generateNextCreativeCandidates, LAYER_TO_VARIABLE, LAYER_TO_TARGET_METRIC, worstLayersRanked,
  PRINCIPAL_TEST_VARIABLES, resolveCausalDistance, CAUSAL_DISTANCE, CAUSAL_DISTANCE_MULTIPLIER, TARGET_METRIC_SOURCE,
};
