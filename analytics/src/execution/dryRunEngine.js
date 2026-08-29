'use strict';

const { evaluateActionWithPolicyEngine } = require('./policyEngine');
const { classifyBlastRadius } = require('./blastRadius');
const { classifyRiskLevel } = require('./riskLevel');
const { buildRollbackContract } = require('./rollbackContract');
const { evaluateCircuitBreaker } = require('./circuitBreaker');
const { resolveAdapter } = require('./executionAdapters');
const { enforceSafeMode } = require('./safeMode');
const { evaluateApprovalPolicy } = require('./approvalPolicy');
const { buildRecommendationRange, evaluateExecutionAuthority } = require('./executionAuthorityLimits');

// item 14A.9 — toda ação suporta DRY_RUN. NUNCA executa nada externamente — o adapter real
// (executionAdapters.js) é só consultado por simulate(), nunca por execute() aqui.
/**
 * runDryRun() — item 14A.9, recalibrado no PASSO 14A.1 (items 1-2/5/6/12). Produz what_would_
 * change/current_value/proposed_value/policy_result/capital_impact/affected_scope/halt_possible/
 * rollback_possible/measurement_readiness/anomaly_state/human_approval_required/
 * circuit_breaker_state — human_approval_required agora vem da Approval Policy dedicada
 * (approvalPolicy.js), nunca de "policy_result != REQUIRE_HUMAN_APPROVAL implica false"
 * (item 1: POLICY_DEFER != HUMAN_APPROVAL_NOT_REQUIRED).
 */
function runDryRun({ action, measurementSignals, capitalSafetyConfig, rateLimitResult = null, circuitBreakerState = 'CLOSED', circuitBreakerSignals = {}, recommendedValue = null }) {
  const blastRadiusResult = classifyBlastRadius(action.subject_type);
  const circuitBreakerResult = evaluateCircuitBreaker({ signals: circuitBreakerSignals, currentState: circuitBreakerState, scope: action.subject_id });

  const policyResult = evaluateActionWithPolicyEngine({
    action,
    context: { capitalSafetyConfig, measurementSignals, blastRadiusResult, rateLimitResult, circuitBreakerResult },
  });

  const worstAnomaly = (measurementSignals?.anomalies || []).reduce((worst, a) => {
    const order = ['NORMAL', 'WARNING', 'CRITICAL', 'CAPITAL_BLOCKING'];
    return order.indexOf(a.severity) > order.indexOf(worst) ? a.severity : worst;
  }, 'NORMAL');

  const riskResult = classifyRiskLevel({
    capitalAtRisk: action.capital_at_risk,
    reversibility: action.reversibility,
    measurementCapitalGateState: measurementSignals?.capital_gate?.state || null,
    confidence: action.confidence,
    anomalySeverity: worstAnomaly,
    subjectType: action.subject_type,
  });

  const rollback = buildRollbackContract({ actionType: action.action_type, currentState: action.current_state, reversibility: action.reversibility });

  const adapter = resolveAdapter(action.action_type);
  const safeModeResult = enforceSafeMode({ actionStatus: 'APPROVED', connectorIsMutable: adapter ? adapter.mutable : true });

  // item 1-2 — Approval Policy é uma regra de AUTORIDADE separada da Policy Engine operacional e
  // do SAFE_MODE técnico. POLICY_DEFER (ex.: CAPITAL_LIMIT_POLICY sem config) NUNCA implica
  // human_approval_required=false por si só — a Approval Policy roda sempre, independente do
  // resultado da Policy Engine.
  const approvalResult = evaluateApprovalPolicy({
    riskLevel: riskResult.risk_level,
    capitalAtRisk: action.capital_at_risk,
    reversibility: action.reversibility,
    capitalSafetyProfile: capitalSafetyConfig,
  });
  // policy_result=REQUIRE_HUMAN_APPROVAL ou blast_radius=HUMAN_APPROVAL_REQUIRED elevam a
  // exigência também — a Approval Policy nunca REDUZ o que essas outras camadas já exigem, só
  // pode aumentar.
  const humanApprovalRequired = approvalResult.human_approval_required
    || policyResult.final_result === 'REQUIRE_HUMAN_APPROVAL'
    || blastRadiusResult.approval_requirement === 'HUMAN_APPROVAL_REQUIRED';

  // item 3/12 — intelligence != authority. A recomendação nunca é truncada; só sua elegibilidade
  // de execução autônoma/aprovada é classificada.
  const recommendationRange = buildRecommendationRange({ recommendedValue: recommendedValue ?? action.capital_required, currentValue: action.capital_at_risk });
  const authorityResult = evaluateExecutionAuthority({ recommendationRange, capitalSafetyProfile: capitalSafetyConfig });

  return {
    action_id: action.action_id,
    what_would_change: action.requested_change,
    current_value: action.current_state,
    proposed_value: action.target_state,
    policy_result: policyResult,
    capital_impact: { capital_required: action.capital_required, capital_at_risk: action.capital_at_risk, note: action.capital_required == null ? 'UNKNOWN — não inventado (item 14A.4/13).' : undefined },
    affected_scope: blastRadiusResult.blast_radius,
    halt_possible: rollback.halt_supported, // item 6 — capacidade de PARAR, nunca confundida com restaurar
    rollback_possible: rollback.rollback_supported, // item 6-7 — sempre false nesta arquitetura (nunca validado de verdade)
    rollback_contract: rollback,
    measurement_readiness: measurementSignals?.capital_gate?.state || 'UNKNOWN',
    current_measurement_blocker: measurementSignals?.current_blocker || null,
    anomaly_state: worstAnomaly,
    human_approval_required: humanApprovalRequired,
    approval_authority: approvalResult, // item 1-2 — nunca escondido atrás de um booleano só
    execution_authority: authorityResult, // item 3/12 — recommendation_range vs limites, nunca fundidos
    circuit_breaker_state: circuitBreakerResult.state,
    circuit_breaker_action: circuitBreakerResult.action,
    risk_level: riskResult.risk_level,
    risk_factors: riskResult.factors,
    safe_mode_enforcement: safeModeResult,
    would_execute_externally: false, // SEMPRE false neste PASSO — dry-run nunca alcança execução real
    generated_at: new Date().toISOString(),
  };
}

module.exports = { runDryRun };
