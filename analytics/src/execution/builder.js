'use strict';

const { resolveProductId } = require('../../config/product');
const { deriveActionProposalFromStrategyWinner } = require('./strategyDecisionHandoff');
const { pullMeasurementSignals } = require('./measurementHandoff');
const { loadCapitalSafetyConfig } = require('./capitalSafety');
const { createInMemoryRateLimitCounter, evaluateRateLimits } = require('./rateLimit');
const { runDryRun } = require('./dryRunEngine');
const { loadCircuitBreakerState, loadExposureRegistry } = require('./registry');
const { OWNERSHIP_BOUNDARIES } = require('./boundaries');
const { SAFE_MODE } = require('./safeMode');
const { isHistoricalBackfillRequiredForNextExperiment } = require('./exposureIdentityRegistry');

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
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
    would_execute_externally: false,
    real_action_confirmation: 'nenhuma ação real foi executada — este é um dry-run completo sobre o estado real do sistema (item 14A regra absoluta).',
    generated_at: new Date().toISOString(),
  };
}

module.exports = { proposeAndDryRunNextAction, EXECUTION_VERSION };
