'use strict';

const { resolveProductId } = require('../../config/product');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');
const { computeNorthStar, TARGET_FINANCIAL_ROAS } = require('../decision/northStar');
const { loadAllExperiments } = require('../experiments/registry');
const { loadHypotheses } = require('../learning/registry');
const { loadCandidates: loadCreativeCandidates } = require('../creative/registry');
const { loadCandidates: loadCroCandidates, loadDiagnostics: loadCroDiagnostics } = require('../cro/registry');
const { loadCandidates: loadOfferCandidates, loadDiagnostics: loadOfferDiagnostics } = require('../offer/registry');

const { buildEconomicsSnapshot } = require('./economicsSnapshot');
const { buildExperimentCoverage, buildLearningEvidence, classifyHypothesisSpaceStatus } = require('./experimentCoverage');
const { buildLevers, computeLeverExhaustionScore } = require('./leverRegistry');
const { buildEvidenceMatrix } = require('./evidenceMatrix');
const { buildTrackingScopeMatrix } = require('./trackingScopes');
const { computeCapitalPosture } = require('./capitalPosture');
const { determineKnownPathToTarget, buildPathToRoas3 } = require('./knownPath');
const { buildEvidenceGapRegistry } = require('./evidenceGaps');
const {
  computeExpectedEconomicValueOfContinuing, computeValueOfInformationOfContinuing,
  computeExpectedEconomicValueOfSwitching, computeValueOfInformationOfSwitching, computeOpportunityCostOfContinuing,
} = require('./expectedValue');
const { evaluateSwitchProductGate } = require('./switchGate');
const { evaluateScaleGate } = require('./scaleGate');
const { computeVerdict } = require('./verdictEngine');
const { buildCapitalPlan } = require('./capitalPlan');
const { buildTargetPlanning, evaluateOnTrack } = require('./reverseEngineering');
const { assembleStrategicActions } = require('./actionAssembler');
const { rankStrategicActions } = require('./ranking');
const { buildRoadmap, buildBestNextStrategicAction } = require('./roadmap');
const { buildStrategicPaths } = require('./strategicPaths');
const { buildStopKillConditions, buildSwitchConditions, buildScaleConditions } = require('./killConditions');
const { buildProductLearningPackage, buildNextProductCandidates, buildPortfolioPlaceholder } = require('./futureInterfaces');
const { OWNERSHIP_BOUNDARIES } = require('./boundaries');

const PLAN_VERSION = 'PLAN-V1';

/**
 * analyzePlan() — PASSO 11 + 11.1. Orquestrador only-leitura: nunca escreve fora do que o
 * chamador decidir persistir (sempre em analytics/data/planner/), nunca chama API externa, nunca
 * executa nenhuma ação real. Consome as integrações já existentes (decision/*Integration.js) e
 * os engines centrais (profit/experiments/learning) — nunca reimplementa a lógica deles.
 */
function analyzePlan({ productId, dataDir, referenceDate, config = {}, croDir, creativeDir, offerDir } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();
  const dates = standardWindows(refDate).last_30d.dates;

  const economicsSnapshot = buildEconomicsSnapshot(dates, dataDir);
  const northStar = computeNorthStar(economicsSnapshot.financials.roas_financeiro);

  const experiments = loadAllExperiments();
  const hypotheses = loadHypotheses();
  const experimentCoverage = buildExperimentCoverage(experiments);
  const learningEvidence = buildLearningEvidence(hypotheses);
  const hypothesisSpaceStatus = classifyHypothesisSpaceStatus(experimentCoverage, learningEvidence);

  const creativeCandidates = loadCreativeCandidates();
  const croCandidates = loadCroCandidates();
  const croDiagnostics = loadCroDiagnostics();
  const offerCandidates = loadOfferCandidates();
  const offerDiagnostics = loadOfferDiagnostics();

  const levers = buildLevers({ creativeCandidates, croCandidates, offerCandidates, experiments });
  const leverExhaustionScore = computeLeverExhaustionScore(levers);

  // PASSO 11.1, items 1-3 — tracking avaliado por ESCOPO, reusando decision/trackingAssessment.js.
  const { scopes: trackingScopes, assessment: trackingAssessment } = buildTrackingScopeMatrix({ criticalFlagsByDay: economicsSnapshot.critical_flags_by_day, experiments });
  const financialTruthStatus = trackingScopes.FINANCIAL_TRUTH.status;

  const evidenceMatrix = buildEvidenceMatrix({ economicsSnapshot, levers, experimentCoverage, learningEvidence, hypothesisSpaceStatus });

  const bestCombinedScenarioRoas = economicsSnapshot.best_combined_scenario ? economicsSnapshot.best_combined_scenario.expected_financial_roas : null;
  const knownPathToTarget = determineKnownPathToTarget({
    currentRoas: economicsSnapshot.financials.roas_financeiro, targetRoas: economicsSnapshot.roas3_gap.target_roas, bestCombinedScenarioRoas,
  });
  const pathToRoas3 = buildPathToRoas3({ economicsSnapshot, levers, knownPathToTarget });

  const evidenceGaps = buildEvidenceGapRegistry({ productId: resolvedProductId, croDiagnostics, offerDiagnostics, knownPathToTarget, leverExhaustionScore });

  const capitalPlan = buildCapitalPlan(config.capital);

  // PASSO 11.1, items 8-11 — EV econômico (estrito) SEPARADO de VOI (qualitativo). Nunca conflar.
  const expectedEconomicValueOfContinuing = computeExpectedEconomicValueOfContinuing({ learningEvidence, knownPathToTarget });
  const valueOfInformationOfContinuing = computeValueOfInformationOfContinuing({ evidenceGaps, hypothesisSpaceStatus });
  const expectedEconomicValueOfSwitching = computeExpectedEconomicValueOfSwitching();
  const valueOfInformationOfSwitching = computeValueOfInformationOfSwitching();
  const opportunityCostOfContinuing = computeOpportunityCostOfContinuing(expectedEconomicValueOfSwitching);

  const switchGate = evaluateSwitchProductGate({
    economicsSnapshot, experimentCoverage, levers, learningEvidence, knownPathToTarget, capitalPlan,
    expectedEconomicValueOfContinuing, valueOfInformationOfContinuing, expectedEconomicValueOfSwitching, financialTruthStatus,
  });
  const scaleGate = evaluateScaleGate({ economicsSnapshot, financialTruthStatus });

  const verdictResult = computeVerdict({ economicsSnapshot, hypothesisSpaceStatus, expectedEconomicValueOfContinuing, knownPathToTarget, switchGate, scaleGate, financialTruthStatus });

  const { actions: rawActions, contradictions } = assembleStrategicActions({
    productId: resolvedProductId, trackingScopes, capitalAvailable: capitalPlan.available, croDir, creativeDir, offerDir,
  });
  const rankedResult = rankStrategicActions(rawActions);

  // PASSO 11.1, item 6 — capital_posture SEPARADO do verdict: permite CONTINUE_VALIDATION + SELECTIVE.
  const capitalPosture = computeCapitalPosture({ financialTruthStatus, actions: rankedResult.ranking, scaleGateStatus: scaleGate.status });

  const roadmap = buildRoadmap(rankedResult.ranking);
  const bestNextAction = buildBestNextStrategicAction(rankedResult.ranking);
  const strategicPaths = buildStrategicPaths(rankedResult.ranking);

  const stopKillConditions = buildStopKillConditions(config.killConditions);
  const switchConditions = buildSwitchConditions(switchGate);
  const scaleConditions = buildScaleConditions(scaleGate);

  const targetPlanning = buildTargetPlanning(config.targets);
  const onTrack = evaluateOnTrack({ targetPlanning, periodRevenue: economicsSnapshot.financials.receita_liquida_hotmart, periodLabel: `últimos ${dates.length} dias` });

  const productLearningPackage = buildProductLearningPackage({ productEnded: false });
  const nextProductCandidates = buildNextProductCandidates();
  const portfolio = buildPortfolioPlaceholder();

  const planId = `PLAN-${resolvedProductId}-${refDate}`;

  const plan = {
    plan_id: planId,
    product_id: resolvedProductId,
    version: PLAN_VERSION,
    created_at: new Date().toISOString(),
    analysis_period: { reference_date: refDate, dates_requested: dates.length, ...economicsSnapshot.period },
    north_star: { target_financial_roas: TARGET_FINANCIAL_ROAS, ...northStar },
    current_state: {
      financial_roas: economicsSnapshot.financials.roas_financeiro,
      financial_cpa: economicsSnapshot.financials.cpa_financeiro,
      net_revenue_per_buyer: economicsSnapshot.financials.aov_liquido,
      profit_status: economicsSnapshot.profit_status,
      milestone_progress: economicsSnapshot.milestone_progress,
      financial_milestone: economicsSnapshot.financial_milestone,
    },
    target_state: { target_roas: economicsSnapshot.roas3_gap.target_roas, required_net_revenue_per_buyer_at_current_cpa: economicsSnapshot.roas3_gap.required_net_revenue_per_buyer_at_current_cpa, required_cpa_at_current_net_revenue_per_buyer: economicsSnapshot.roas3_gap.required_cpa_at_current_net_revenue_per_buyer },
    verdict: verdictResult.verdict,
    verdict_confidence: verdictResult.verdict_confidence,
    viability_status: verdictResult.viability_status,
    verdict_reasoning: verdictResult.reasoning,
    capital_posture: capitalPosture.posture,
    capital_posture_reason: capitalPosture.reason,
    strategy: { strategic_paths: strategicPaths, roadmap, best_next_strategic_action: bestNextAction },
    milestones: economicsSnapshot.milestone_progress,
    recommended_actions: rankedResult.ranking,
    evidence_gaps: evidenceGaps,
    capital_plan: capitalPlan,
    scenario_analysis: { scenarios: economicsSnapshot.scenarios, known_path_to_target: knownPathToTarget, path_to_roas3: pathToRoas3 },
    risks: { contradictions, financial_truth_status: financialTruthStatus, tracking_scopes: trackingScopes },
    kill_conditions: stopKillConditions,
    scale_conditions: scaleConditions,
    switch_conditions: switchConditions,
  };

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    plan,
    economics_snapshot: economicsSnapshot,
    evidence_matrix: evidenceMatrix,
    tracking_scopes: trackingScopes,
    tracking_assessment: trackingAssessment,
    experiment_coverage: experimentCoverage,
    learning_evidence: learningEvidence,
    hypothesis_space_status: hypothesisSpaceStatus,
    levers,
    lever_exhaustion_score: leverExhaustionScore,
    known_path_to_target: knownPathToTarget,
    path_to_roas3: pathToRoas3,
    evidence_gaps: evidenceGaps,
    actions: rankedResult.ranking,
    decision_tie: rankedResult.decision_tie,
    decision_tie_action_ids: rankedResult.decision_tie_action_ids,
    tie_break_factor_order: rankedResult.tie_break_factor_order,
    contradictions,
    capital_posture: capitalPosture,
    roadmap,
    best_next_strategic_action: bestNextAction,
    strategic_paths: strategicPaths,
    switch_gate: switchGate,
    scale_gate: scaleGate,
    expected_economic_value_of_continuing: expectedEconomicValueOfContinuing,
    value_of_information_of_continuing: valueOfInformationOfContinuing,
    expected_economic_value_of_switching: expectedEconomicValueOfSwitching,
    value_of_information_of_switching: valueOfInformationOfSwitching,
    opportunity_cost_of_continuing: opportunityCostOfContinuing,
    capital_plan: capitalPlan,
    target_planning: targetPlanning,
    on_track: onTrack,
    stop_kill_conditions: stopKillConditions,
    switch_conditions: switchConditions,
    scale_conditions: scaleConditions,
    product_learning_package: productLearningPackage,
    next_product_candidates: nextProductCandidates,
    portfolio,
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
  };
}

module.exports = { analyzePlan, PLAN_VERSION };
