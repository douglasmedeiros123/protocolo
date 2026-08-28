'use strict';

const { resolveProductId } = require('../../config/product');
const { resolveAssetOrigin } = require('../learning/assetOrigin');
const { loadExperiment } = require('../experiments/registry');
const { loadAssets: loadCreativeAssets } = require('../creative/registry');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');

const { resolveLandingPageSourceOfTruth } = require('./sourceOfTruth');
const { readAndParseLandingPage } = require('./htmlParser');
const { buildSectionMap } = require('./sectionMap');
const { extractCroDnaFromParsedPage } = require('./croDna');
const { loadCurrentBehaviorSnapshot } = require('./claritySnapshot');
const { computeHistoricalFunnelMetrics } = require('./funnelMetrics');
const { diagnoseCroPerformanceLayers } = require('./performanceLayers');
const { buildCroDiagnostics, buildTechnicalActions } = require('./diagnostics');
const { diagnoseMessageMatch, buildCreativeLpPairs } = require('./messageMatch');
const { analyzeCro001 } = require('./cro001Analysis');
const { generateCroCandidates } = require('./candidateGenerator');
const { rankCroCandidates } = require('./ranking');

const LANDING_PAGE_ID = 'LP-V1'; // única versão conhecida hoje — baseline (PASSO 9, item 4)

/**
 * Orquestra a análise completa da LP real (PASSO 9). Só LEITURA: nunca escreve em
 * teste-b/index.html, vercel.json, nem em qualquer arquivo fora de analytics/data/cro/ (ver
 * registry.js) — quem chama decide persistir.
 */
function analyzeCro({ productId, dataDir, creativeDir, referenceDate } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();

  const sourceOfTruth = resolveLandingPageSourceOfTruth();
  const parsed = sourceOfTruth.found && sourceOfTruth.landing_page_file
    ? readAndParseLandingPage(sourceOfTruth.landing_page_file)
    : { found: false, reason: 'source_of_truth não resolvido.' };

  const sectionMap = parsed.found ? buildSectionMap(parsed.sections) : [];
  const croDna = parsed.found ? extractCroDnaFromParsedPage(parsed, sectionMap) : null;

  const claritySnapshot = loadCurrentBehaviorSnapshot();

  const dates = standardWindows(refDate).last_30d.dates;
  const funnelMetrics = computeHistoricalFunnelMetrics(dates, dataDir);

  const performanceLayers = diagnoseCroPerformanceLayers({
    funnelMetrics, claritySnapshot, dnaCheckoutTransition: croDna ? croDna.checkout_transition : null,
  });

  const diagnostics = parsed.found
    ? buildCroDiagnostics({ parsed, sectionMap, funnelMetrics, performanceLayers, claritySnapshot })
    : [];
  const technicalActions = buildTechnicalActions(diagnostics);

  const messageMatchFindings = diagnoseMessageMatch(creativeDir);
  const creativeAssets = loadCreativeAssets(creativeDir);
  const creativeLpPairs = buildCreativeLpPairs(creativeAssets, LANDING_PAGE_ID);

  const cro001Experiment = loadExperiment('CRO-001');
  const cro001Analysis = analyzeCro001(cro001Experiment, technicalActions);

  const candidatesRaw = parsed.found
    ? generateCroCandidates({
      productId: resolvedProductId, landingPageId: LANDING_PAGE_ID, funnelMetrics, cro001Analysis,
      hypotheses: [], croDna,
    })
    : [];
  const rankedResult = rankCroCandidates(candidatesRaw);
  const candidates = rankedResult.ranking;

  const landingPage = {
    landing_page_id: LANDING_PAGE_ID,
    product_id: resolvedProductId,
    version: 1,
    status: 'BASELINE',
    path: sourceOfTruth.considered_path || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parent_version: null,
    // asset_origin NUNCA inferido retroativamente sem registro explícito (PASSO 9, item 3) — a
    // LP atual não tem nenhum campo de origem gravado em lugar nenhum do repositório, então fica
    // UNKNOWN por padrão honesto, igual ao Creative Agent fez pros criativos reais.
    asset_origin: resolveAssetOrigin({}),
    experiment_id: cro001Experiment ? cro001Experiment.experiment_id : null,
    sections: sectionMap,
    cro_dna: croDna,
    performance: funnelMetrics,
    diagnostics: diagnostics.map((d) => d.diagnostic_id),
    hypotheses: candidates.map((c) => c.hypothesis.hypothesis_id),
  };

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    source_of_truth: sourceOfTruth,
    landing_page_id: LANDING_PAGE_ID,
    parsed_page_found: parsed.found,
    section_map: sectionMap,
    cro_dna: croDna,
    clarity_current_behavior_snapshot: claritySnapshot,
    historical_funnel_metrics: funnelMetrics,
    performance_layers: performanceLayers,
    message_match_findings: messageMatchFindings,
    creative_lp_pairs: creativeLpPairs,
    cro_001_analysis: cro001Analysis,
    landing_page: landingPage,
    diagnostics,
    technical_actions: technicalActions,
    candidates,
    decision_tie: rankedResult.decision_tie,
    decision_tie_candidates: rankedResult.decision_tie_candidates,
    tie_break_factor_order: rankedResult.tie_break_factor_order,
  };
}

module.exports = { analyzeCro, LANDING_PAGE_ID };
