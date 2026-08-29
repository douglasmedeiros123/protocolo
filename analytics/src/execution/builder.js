'use strict';

const { aggregatePeriod } = require('../profit/aggregate');
const { computeCurrentFinancials } = require('../profit/financials');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');
const { resolveProductId } = require('../../config/product');
const { deriveActionProposalFromStrategyWinner } = require('./strategyDecisionHandoff');
const { pullMeasurementSignals } = require('./measurementHandoff');
const { loadCapitalSafetyConfig } = require('./capitalSafety');
const { createInMemoryRateLimitCounter, evaluateRateLimits } = require('./rateLimit');
const { runDryRun } = require('./dryRunEngine');
const { loadCircuitBreakerState, loadExposureRegistry } = require('./registry');
const { OWNERSHIP_BOUNDARIES, ARCHITECTURAL_DEBT, READ_WRITE_PATH_SEPARATION, NEXT_RECOMMENDED_STEP } = require('./boundaries');
const { SAFE_MODE } = require('./safeMode');
const { isHistoricalBackfillRequiredForNextExperiment } = require('./exposureIdentityRegistry');
const { recommendInitialAuthorityPosture } = require('./authorityPosture');
const { buildDefaultAuthorityTiers } = require('./authorityTiers');
const { buildCapitalBucketDefinitions } = require('./capitalBuckets');
const { SCALE_LADDER_DEFINITIONS, classifyCurrentStage } = require('./scaleLadder');
const { recommendInitialRealLimits } = require('./realLimitRecommendations');
const { buildCircuitBreakerEconomicInputs } = require('./circuitBreakerEconomicInputs');
const { simulateCapitalPosture } = require('./capitalPostureSimulation');
const { listParametersNeedingDefinitionBeforeRealExecution } = require('./capitalPolicyConfig');

const EXECUTION_VERSION = 'EXECUTION-SAFETY-V1';

/**
 * proposeAndDryRunNextAction() — PASSO 14A, orquestrador only-leitura/simulação. Deriva a
 * próxima Action Proposal do vencedor REAL do Strategy Search, consome sinais REAIS do
 * Measurement Agent, e roda um dry-run completo — NUNCA executa nada externamente (item 14A
 * regra absoluta). Este é o único fluxo "end-to-end" desta arquitetura, e é inteiramente
 * DRY_RUN/SIMULATION/READ_ONLY.
 */
function proposeAndDryRunNextAction({ productId, dataDir, referenceDate } = {}) {
  const resolvedProductId = resolveProductId(productId);

  const proposal = deriveActionProposalFromStrategyWinner({ productId: resolvedProductId, dataDir, referenceDate });
  if (!proposal.proposed) {
    return { safe_mode: SAFE_MODE, proposed: false, reason: proposal.reason, strategy_result_consumed: proposal.strategy_result_consumed, ownership_boundaries: OWNERSHIP_BOUNDARIES, version: EXECUTION_VERSION };
  }

  const measurementSignals = pullMeasurementSignals({ productId: resolvedProductId, dataDir, referenceDate, subjectId: proposal.strategy_result_consumed.winner_architecture_id });
  const capitalSafetyConfig = loadCapitalSafetyConfig(); // NOT_CONFIGURED em tudo — estado real, nunca inventado

  const rateLimitCounter = createInMemoryRateLimitCounter(); // sem histórico real de ações ainda — contador vazio, honesto
  const rateLimitResult = evaluateRateLimits({ counter: rateLimitCounter, limits: capitalSafetyConfig });

  const circuitBreakerState = loadCircuitBreakerState(); // CLOSED por padrão até que um humano/trigger real mude isso

  // item 10 — o registry real está vazio hoje (nenhuma entrada persistida ainda) — a avaliação
  // honesta é feita sobre esse estado real, nunca assumindo que já existe uma marcação.
  const exposureRegistry = loadExposureRegistry();
  const hasCurrentArchitectureMarkerEntry = exposureRegistry.some((e) => e.architecture_id === measurementSignals.current_architecture_id && e.status === 'ACTIVE');
  const historicalBackfillAssessment = isHistoricalBackfillRequiredForNextExperiment({ hasCurrentArchitectureMarkerEntry });

  // PASSO 14B — financeiro real do período (mesma fonte do Measurement Agent, nunca recalculado
  // com lógica divergente) + postura de autoridade/capital derivada do estado real de hoje.
  const dates = standardWindows(referenceDate || todayBRT()).last_30d.dates;
  const agg = aggregatePeriod(dates, dataDir);
  const financialsSnapshot = computeCurrentFinancials(agg.sum);

  const authorityPosture = recommendInitialAuthorityPosture({
    financialRoasStatus: financialsSnapshot.roas_financeiro == null ? 'UNKNOWN' : (financialsSnapshot.roas_financeiro < 1 ? 'BELOW_BREAK_EVEN' : (financialsSnapshot.roas_financeiro < 3 ? 'BREAK_EVEN' : 'ABOVE_BREAK_EVEN')),
    financialTruthHealthStatus: measurementSignals.financial_truth_health.status,
    platformAttributionHealthStatus: measurementSignals.platform_attribution_health.status,
    reconciliationHealthStatus: measurementSignals.reconciliation_health.status,
    completedExperiments: 0, // estado real hoje — nenhum experimento real de arquitetura foi concluído (mesmo fato já usado pelo Strategy Search/Measurement)
    strategyWinnerConfidence: proposal.strategy_result_consumed.confidence,
    currentMeasurementBlocker: measurementSignals.current_blocker,
    capitalPolicyConfigured: false, // NOT_CONFIGURED hoje (capitalSafety.js) — estado real, nunca inventado
    safeModeActive: SAFE_MODE,
  });

  const capitalPostureSimulation = simulateCapitalPosture({ measurementSignals, strategyResultConsumed: { ...proposal.strategy_result_consumed, winner_architecture_id: proposal.strategy_result_consumed.winner_architecture_id }, financialsSnapshot });

  const scaleStage = classifyCurrentStage({
    financialRoas: financialsSnapshot.roas_financeiro, sampleSufficient: false, marginalRoasKnown: false,
    hasCompletedValidation: false, hasSignalConfirmed: false,
  });

  const realLimitRecommendations = recommendInitialRealLimits({
    financialRoasFinanceiro: financialsSnapshot.roas_financeiro, cpaFinanceiro: financialsSnapshot.cpa_financeiro,
    completedExperiments: 0, financialTruthHealthStatus: measurementSignals.financial_truth_health.status,
    currentAuthorityTier: authorityPosture.recommended_tier, // item 1 (calibração) — nunca hardcoded TIER_0, lido do que a authorityPosture real recomendou
  });

  const dryRun = runDryRun({
    action: proposal.action,
    measurementSignals,
    capitalSafetyConfig,
    rateLimitResult,
    circuitBreakerState: circuitBreakerState.state,
    circuitBreakerSignals: { financialTruthBlocked: measurementSignals.financial_truth_health.status === 'BLOCKED' },
  });

  return {
    version: EXECUTION_VERSION,
    safe_mode: SAFE_MODE,
    proposed: true,
    action: proposal.action,
    strategy_result_consumed: proposal.strategy_result_consumed,
    measurement_signals_consumed: measurementSignals,
    dry_run: dryRun,
    historical_backfill_assessment: historicalBackfillAssessment,
    financials_snapshot: financialsSnapshot,
    authority_posture_recommendation: authorityPosture,
    authority_tiers: buildDefaultAuthorityTiers(),
    capital_buckets: buildCapitalBucketDefinitions(),
    scale_ladder: { current_stage: scaleStage, definitions: SCALE_LADDER_DEFINITIONS },
    real_limit_recommendations: realLimitRecommendations,
    circuit_breaker_economic_inputs: buildCircuitBreakerEconomicInputs({ agg, previousDayAgg: null }),
    capital_posture_simulation: capitalPostureSimulation,
    capital_policy_parameters_needing_definition: listParametersNeedingDefinitionBeforeRealExecution(),
    architectural_debt: ARCHITECTURAL_DEBT,
    read_write_path_separation: READ_WRITE_PATH_SEPARATION,
    next_recommended_step: NEXT_RECOMMENDED_STEP,
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
    would_execute_externally: false,
    real_action_confirmation: 'nenhuma ação real foi executada — este é um dry-run completo sobre o estado real do sistema (item 14A regra absoluta).',
    generated_at: new Date().toISOString(),
  };
}

module.exports = { proposeAndDryRunNextAction, EXECUTION_VERSION };
