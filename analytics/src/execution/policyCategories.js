'use strict';

const { evaluateCapitalLimit, isConfigured } = require('./capitalSafety');

// item 14A.3 — as 11 categorias de política mínimas exigidas. Cada uma é uma função PURA e
// determinística — regra rígida, nunca julgamento livre de LLM (item 14A.2: "a Policy Engine não
// deve usar julgamento livre de LLM para regras rígidas").

function capitalLimitPolicy({ action, capitalSafetyConfig }) {
  const r = evaluateCapitalLimit({ config: capitalSafetyConfig, key: 'max_capital_per_action', requestedValue: action.capital_required });
  return { category: 'CAPITAL_LIMIT_POLICY', result: r.result === 'ALLOW' ? 'ALLOW' : r.result === 'DENY' ? 'DENY' : 'DEFER', rationale: r.reason };
}

function budgetDeltaPolicy({ action, capitalSafetyConfig }) {
  if (action.action_type !== 'ADJUST_BUDGET') return { category: 'BUDGET_DELTA_POLICY', result: 'ALLOW', rationale: 'não é uma ação de orçamento — política não se aplica.' };
  const configured = isConfigured(capitalSafetyConfig, 'max_budget_delta_percent') || isConfigured(capitalSafetyConfig, 'max_budget_delta_absolute');
  if (!configured) return { category: 'BUDGET_DELTA_POLICY', result: 'DEFER', rationale: 'max_budget_delta_percent/absolute estão NOT_CONFIGURED — sem política real, não é possível confirmar o delta como seguro.' };
  return { category: 'BUDGET_DELTA_POLICY', result: 'ALLOW', rationale: 'delta dentro dos limites configurados.' };
}

function actionFrequencyPolicy({ rateLimitResult }) {
  if (!rateLimitResult) return { category: 'ACTION_FREQUENCY_POLICY', result: 'DEFER', rationale: 'sem dado de frequência disponível — nunca presume seguro.' };
  return rateLimitResult.excessive_action_frequency
    ? { category: 'ACTION_FREQUENCY_POLICY', result: 'DENY', rationale: `violação(ões): ${rateLimitResult.violations.join('; ')}.` }
    : { category: 'ACTION_FREQUENCY_POLICY', result: 'ALLOW', rationale: 'frequência dentro dos limites.' };
}

function cooldownPolicy({ capitalSafetyConfig, msSinceLastActionOnSubject }) {
  if (!isConfigured(capitalSafetyConfig, 'cooldown_after_change')) return { category: 'COOLDOWN_POLICY', result: 'DEFER', rationale: 'cooldown_after_change está NOT_CONFIGURED.' };
  if (msSinceLastActionOnSubject == null) return { category: 'COOLDOWN_POLICY', result: 'DEFER', rationale: 'tempo desde a última ação neste subject é UNKNOWN — nunca presume que o cooldown já passou.' };
  return msSinceLastActionOnSubject >= capitalSafetyConfig.cooldown_after_change
    ? { category: 'COOLDOWN_POLICY', result: 'ALLOW', rationale: 'cooldown já cumprido.' }
    : { category: 'COOLDOWN_POLICY', result: 'DENY', rationale: `ainda dentro do período de cooldown (${msSinceLastActionOnSubject}ms < ${capitalSafetyConfig.cooldown_after_change}ms).` };
}

function measurementReadinessPolicy({ measurementSignals }) {
  if (!measurementSignals || !measurementSignals.capital_gate) return { category: 'MEASUREMENT_READINESS_POLICY', result: 'DEFER', rationale: 'sem sinal de measurement disponível — nunca presume pronto.' };
  const state = measurementSignals.capital_gate.state;
  if (state === 'READY_FOR_CAPITAL') return { category: 'MEASUREMENT_READINESS_POLICY', result: 'ALLOW', rationale: 'capital_gate=READY_FOR_CAPITAL.' };
  if (state === 'BLOCKED_BY_MEASUREMENT') return { category: 'MEASUREMENT_READINESS_POLICY', result: 'DENY', rationale: 'capital_gate=BLOCKED_BY_MEASUREMENT.' };
  return { category: 'MEASUREMENT_READINESS_POLICY', result: 'ALLOW_DRY_RUN_ONLY', rationale: `capital_gate=${state} — mensuração ainda não pronta pra capital real, mas dry-run/simulação permanece seguro.` };
}

function financialTruthPolicy({ measurementSignals }) {
  const status = measurementSignals?.financial_truth_health?.status;
  if (status == null) return { category: 'FINANCIAL_TRUTH_POLICY', result: 'DEFER', rationale: 'financial_truth_health desconhecido.' };
  return status === 'BLOCKED'
    ? { category: 'FINANCIAL_TRUTH_POLICY', result: 'DENY', rationale: 'FINANCIAL_TRUTH_HEALTH=BLOCKED — nenhuma ação de capital é responsável enquanto isso persistir.' }
    : { category: 'FINANCIAL_TRUTH_POLICY', result: 'ALLOW', rationale: `FINANCIAL_TRUTH_HEALTH=${status}.` };
}

function anomalyPolicy({ measurementSignals }) {
  const anomalies = measurementSignals?.anomalies || [];
  const blocking = anomalies.find((a) => a.severity === 'CAPITAL_BLOCKING');
  if (blocking) return { category: 'ANOMALY_POLICY', result: 'DENY', rationale: `anomalia ${blocking.type} classificada CAPITAL_BLOCKING.` };
  const critical = anomalies.find((a) => a.severity === 'CRITICAL');
  if (critical) return { category: 'ANOMALY_POLICY', result: 'REQUIRE_HUMAN_APPROVAL', rationale: `anomalia ${critical.type} classificada CRITICAL — revisão humana recomendada antes de prosseguir.` };
  return { category: 'ANOMALY_POLICY', result: 'ALLOW', rationale: 'nenhuma anomalia CRITICAL/CAPITAL_BLOCKING ativa.' };
}

function experimentPolicy({ action }) {
  if (action.action_type !== 'START_EXPERIMENT') return { category: 'EXPERIMENT_POLICY', result: 'ALLOW', rationale: 'não é início de experimento.' };
  if (!action.experiment_id) return { category: 'EXPERIMENT_POLICY', result: 'DENY', rationale: 'START_EXPERIMENT sem experiment_id associado.' };
  return { category: 'EXPERIMENT_POLICY', result: 'ALLOW', rationale: 'experiment_id presente e rastreável.' };
}

function reversibilityPolicy({ action }) {
  if (action.reversibility == null) return { category: 'REVERSIBILITY_POLICY', result: 'REQUIRE_HUMAN_APPROVAL', rationale: 'reversibility=UNKNOWN — nunca presume reversível, exige revisão humana.' };
  if (action.reversibility === 'HARD_TO_REVERSE' || action.reversibility === 'IRREVERSIBLE') {
    return { category: 'REVERSIBILITY_POLICY', result: 'REQUIRE_HUMAN_APPROVAL', rationale: `reversibility=${action.reversibility} — exige aprovação humana antes de prosseguir.` };
  }
  return { category: 'REVERSIBILITY_POLICY', result: 'ALLOW', rationale: `reversibility=${action.reversibility}.` };
}

function humanApprovalPolicy({ blastRadiusResult }) {
  if (!blastRadiusResult) return { category: 'HUMAN_APPROVAL_POLICY', result: 'DEFER', rationale: 'blast radius não avaliado.' };
  if (blastRadiusResult.approval_requirement === 'HUMAN_APPROVAL_REQUIRED') {
    return { category: 'HUMAN_APPROVAL_POLICY', result: 'REQUIRE_HUMAN_APPROVAL', rationale: `blast_radius=${blastRadiusResult.blast_radius} exige aprovação humana.` };
  }
  return { category: 'HUMAN_APPROVAL_POLICY', result: 'ALLOW', rationale: `blast_radius=${blastRadiusResult.blast_radius} não exige aprovação humana por si só.` };
}

function globalFreezePolicy({ circuitBreakerResult }) {
  if (circuitBreakerResult && circuitBreakerResult.action === 'GLOBAL_FREEZE') {
    return { category: 'GLOBAL_FREEZE_POLICY', result: 'DENY', rationale: circuitBreakerResult.reason };
  }
  if (circuitBreakerResult && circuitBreakerResult.action === 'FREEZE_SCOPE') {
    return { category: 'GLOBAL_FREEZE_POLICY', result: 'DENY', rationale: `${circuitBreakerResult.reason} (escopo: ${circuitBreakerResult.affected_scope})` };
  }
  return { category: 'GLOBAL_FREEZE_POLICY', result: 'ALLOW', rationale: 'circuit breaker fechado — sem freeze ativo.' };
}

const POLICY_FUNCTIONS = {
  CAPITAL_LIMIT_POLICY: capitalLimitPolicy,
  BUDGET_DELTA_POLICY: budgetDeltaPolicy,
  ACTION_FREQUENCY_POLICY: actionFrequencyPolicy,
  COOLDOWN_POLICY: cooldownPolicy,
  MEASUREMENT_READINESS_POLICY: measurementReadinessPolicy,
  FINANCIAL_TRUTH_POLICY: financialTruthPolicy,
  ANOMALY_POLICY: anomalyPolicy,
  EXPERIMENT_POLICY: experimentPolicy,
  REVERSIBILITY_POLICY: reversibilityPolicy,
  HUMAN_APPROVAL_POLICY: humanApprovalPolicy,
  GLOBAL_FREEZE_POLICY: globalFreezePolicy,
};

module.exports = { POLICY_FUNCTIONS, capitalLimitPolicy, budgetDeltaPolicy, actionFrequencyPolicy, cooldownPolicy, measurementReadinessPolicy, financialTruthPolicy, anomalyPolicy, experimentPolicy, reversibilityPolicy, humanApprovalPolicy, globalFreezePolicy };
