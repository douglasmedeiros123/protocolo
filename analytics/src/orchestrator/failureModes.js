'use strict';

const { FAILURE_MODES } = require('./enums');

// item 26 — falha nunca vira decisão inventada. Detecta os 10 modos de falha mínimos a partir do
// estado real consumido.
function detectFailureModes(stateContract, diagnosis, candidates) {
  const detected = [];

  if (stateContract.data_freshness.is_stale) detected.push({ mode: 'STALE_DATA', evidence: `days_missing=${JSON.stringify(stateContract.data_freshness.days_missing)}, além do esperado (D0/D-1).` });
  if (diagnosis.measurement_state.financial_truth_health === 'BLOCKED') detected.push({ mode: 'MISSING_FINANCIAL_TRUTH', evidence: 'FINANCIAL_TRANSACTION_TRUTH=BLOCKED.' });
  if (diagnosis.cross_agent_conflicts.length > 0) detected.push({ mode: 'CONFLICTING_AGENTS', evidence: `${diagnosis.cross_agent_conflicts.length} conflito(s) real(is) detectado(s) (resolvidos pela hierarquia, mas registrados).` });
  if (candidates.length === 0) detected.push({ mode: 'NO_ACTIONABLE_CANDIDATE', evidence: 'nenhum candidato real gerado neste ciclo.' });
  if (diagnosis.measurement_state.current_architecture_capital_gate === 'BLOCKED_BY_MEASUREMENT') detected.push({ mode: 'MEASUREMENT_BLOCKED', evidence: `capital_gate=BLOCKED_BY_MEASUREMENT.` });
  if (diagnosis.execution_state.policy_result === 'DENY') detected.push({ mode: 'POLICY_BLOCKED', evidence: 'policy_result=DENY.' });
  if (diagnosis.capital_state.authority_tier === 'TIER_0_ANALYZE_ONLY') detected.push({ mode: 'AUTHORITY_BLOCKED', evidence: 'authority_tier=TIER_0 — nenhuma execução autônoma real possível.' });
  if (diagnosis.execution_state.circuit_breaker_state === 'OPEN' || diagnosis.execution_state.circuit_breaker_state === 'MANUAL_LOCK') detected.push({ mode: 'CIRCUIT_BREAKER_OPEN', evidence: `circuit_breaker_state=${diagnosis.execution_state.circuit_breaker_state}.` });
  if (diagnosis.product_viability_state.viability_status === 'INSUFFICIENT_EVIDENCE') detected.push({ mode: 'INSUFFICIENT_EVIDENCE', evidence: 'viability_status=INSUFFICIENT_EVIDENCE.' });
  if (candidates.some((c) => c.dependencies.length > 0)) detected.push({ mode: 'DEPENDENCY_BLOCKED', evidence: 'pelo menos 1 candidato tem dependência real registrada neste ciclo.' });

  return { detected, all_modes: FAILURE_MODES, never_becomes_invented_decision: true };
}

module.exports = { detectFailureModes, FAILURE_MODES };
