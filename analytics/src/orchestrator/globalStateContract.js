'use strict';

const { resolveProductId } = require('../../config/product');
const { analyzePlan } = require('../planner/builder');
const { analyzeStrategy } = require('../strategy-search/builder');
const { analyzeMeasurement } = require('../measurement/builder');
const { proposeAndDryRunNextAction } = require('../execution/builder');
const { loadCircuitBreakerState } = require('../execution/registry');

/**
 * buildGlobalStateContract() — item 2. Consome, SEM DUPLICAR, os outputs reais de cada agente
 * especializado (Planner já consome Data/Profit/Experiment/Memory/Decision/Creative/CRO/Offer;
 * Strategy Search consome Planner; Measurement consome Strategy Search; Execution consome
 * Measurement+Strategy Search). O CEO nunca recalcula nenhuma métrica que pertence a esses
 * agentes — só lê o resultado real de cada um, nesta chamada, e organiza pra diagnóstico.
 */
function buildGlobalStateContract({ productId, dataDir, referenceDate } = {}) {
  const resolvedProductId = resolveProductId(productId);

  const plannerResult = analyzePlan({ productId: resolvedProductId, dataDir, referenceDate });
  const strategyResult = analyzeStrategy({ productId: resolvedProductId, dataDir, referenceDate });
  const measurementResult = analyzeMeasurement({ productId: resolvedProductId, dataDir, referenceDate });
  const executionResult = proposeAndDryRunNextAction({ productId: resolvedProductId, dataDir, referenceDate });
  const circuitBreakerPersistedState = loadCircuitBreakerState();

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    reference_date: referenceDate || plannerResult.plan.analysis_period.reference_date,
    // cada agente é exposto por inteiro, read-only — o CEO nunca escreve aqui de volta.
    data: {
      planner: plannerResult,
      strategy_search: strategyResult,
      measurement: measurementResult,
      execution: executionResult,
      circuit_breaker_persisted_state: circuitBreakerPersistedState,
    },
    data_freshness: {
      days_found: plannerResult.plan.analysis_period.days_found,
      days_missing: plannerResult.plan.analysis_period.days_missing,
      data_completeness: plannerResult.plan.analysis_period.data_completeness,
      is_stale: plannerResult.plan.analysis_period.days_missing.length > 2, // 2 dias faltando (D0/D-1) é esperado (coleta ainda não rodou); mais que isso é sinal real de atraso
    },
  };
}

module.exports = { buildGlobalStateContract };
