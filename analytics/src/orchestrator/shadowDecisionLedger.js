'use strict';

const crypto = require('crypto');

// item 21 — ledger append-only-STYLE (nunca alega imutabilidade transacional real em protótipo
// de arquivo/Git — item 21 explícito). Cada ciclo registra um snapshot completo da decisão.
let cycleCounter = 0;
function resetCycleCounter() { cycleCounter = 0; }

function hashObservedState(stateContract) {
  // hash determinístico do estado observado (exclui timestamps) — permite comparar se dois
  // ciclos observaram o "mesmo mundo" sem persistir o payload inteiro de novo.
  const { generated_at, ...rest } = stateContract; // eslint-disable-line no-unused-vars
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

function buildLedgerEntry({ stateContract, dominantConstraint, candidates, recommendation, challengerResult, policyHandoffResult, shadowResult }) {
  cycleCounter += 1;
  return {
    cycle_id: `CEO-CYCLE-${String(cycleCounter).padStart(5, '0')}`,
    reference_period: stateContract.reference_date,
    observed_state_hash: hashObservedState(stateContract),
    dominant_constraint: dominantConstraint.category,
    considered_candidates: candidates.map((c) => c.candidate_id),
    recommended_action: recommendation.recommended_candidate_id,
    confidence: recommendation.confidence || null,
    challenger_result: { flags_raised: challengerResult.flags.length, decides: false },
    policy_result: policyHandoffResult.policy_allows,
    approval_result: policyHandoffResult.approval_requires,
    circuit_breaker_result: policyHandoffResult.circuit_breaker_state,
    shadow_execution_result: shadowResult.would_execute,
    expected_success_signal: 'ver actionability_contract.success_signal do mesmo ciclo.',
    expected_failure_signal: 'ver actionability_contract.failure_signal do mesmo ciclo.',
    outcome_status: 'PENDING', // nunca inventado — só preenchido quando um outcome real existir
    outcome_when_available: null,
    decision_quality_status: 'INSUFFICIENT_EVIDENCE_TO_JUDGE', // até existir outcome real
    learning_reference: null,
    recorded_at: new Date().toISOString(),
    immutable_style: true, // nunca "imutável de verdade" em protótipo file/Git (item 21)
  };
}

function appendToLedger(ledger, entry) { return [...ledger, Object.freeze({ ...entry })]; }

module.exports = { resetCycleCounter, hashObservedState, buildLedgerEntry, appendToLedger };
