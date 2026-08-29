'use strict';

const { buildActionContract, resetActionCounter } = require('../execution/actionContract');
const { runDryRun } = require('../execution/dryRunEngine');
const { loadCapitalSafetyConfig } = require('../execution/capitalSafety');
const { createInMemoryRateLimitCounter, evaluateRateLimits } = require('../execution/rateLimit');
const { loadCircuitBreakerState } = require('../execution/registry');

// item 19 — TODA recomendação que implicaria execução passa pela MESMA Policy Engine/Approval
// Policy/Circuit Breaker/Dry Run já construídas nos PASSOs 14A/14A.1/14B — o CEO NUNCA bypassa
// nenhuma camada, nunca reimplementa a lógica. Registra separadamente CEO_RECOMMENDS/
// POLICY_ALLOWS/APPROVAL_REQUIRES/CIRCUIT_BREAKER_STATE/WOULD_EXECUTE — nada fundido.
const ACTION_CLASS_TO_ACTION_TYPE = {
  START_EXPERIMENT: 'START_EXPERIMENT', COLLECT_EVIDENCE: 'UPDATE_TRACKING_CONFIG', // registrar exposure identity é conceitualmente um ajuste de config de tracking/medição
  HOLD_CAPITAL: 'OTHER', DO_NOT_EXECUTE: 'OTHER', KILL_HYPOTHESIS: 'OTHER', SWITCH_PRODUCT: 'OTHER',
};

function handoffToPolicyEngine({ winnerCandidate, measurementSignals }) {
  if (!winnerCandidate) {
    return { ceo_recommends: null, policy_allows: null, approval_requires: null, circuit_breaker_state: null, would_execute: false, reason: 'nenhum candidato vencedor — nada a submeter à Policy Engine.' };
  }

  resetActionCounter();
  const action = buildActionContract({
    actionType: ACTION_CLASS_TO_ACTION_TYPE[winnerCandidate.action_class] || 'OTHER',
    subjectType: winnerCandidate.action_class === 'START_EXPERIMENT' ? 'EXPERIMENT' : 'TRACKING_CONFIG',
    subjectId: winnerCandidate.candidate_id,
    sourceAgent: 'CEO_ORCHESTRATOR',
    requestedChange: winnerCandidate.hypothesis,
    currentState: { candidate_id: winnerCandidate.candidate_id },
    targetState: { action_class: winnerCandidate.action_class },
    capitalRequired: typeof winnerCandidate.capital_required === 'number' ? winnerCandidate.capital_required : null,
    confidence: winnerCandidate.confidence,
    reversibility: winnerCandidate.reversibility,
  });

  const capitalSafetyConfig = loadCapitalSafetyConfig();
  const rateLimitCounter = createInMemoryRateLimitCounter();
  const rateLimitResult = evaluateRateLimits({ counter: rateLimitCounter, limits: capitalSafetyConfig });
  const circuitBreakerState = loadCircuitBreakerState();

  const dryRun = runDryRun({
    action, measurementSignals, capitalSafetyConfig, rateLimitResult,
    circuitBreakerState: circuitBreakerState.state,
    circuitBreakerSignals: { financialTruthBlocked: measurementSignals.financial_truth_health.status === 'BLOCKED' },
  });

  return {
    ceo_recommends: { candidate_id: winnerCandidate.candidate_id, action_class: winnerCandidate.action_class },
    policy_allows: dryRun.policy_result.final_result,
    approval_requires: dryRun.human_approval_required,
    circuit_breaker_state: dryRun.circuit_breaker_state,
    would_execute: dryRun.would_execute_externally, // SEMPRE false em SHADOW_MODE — ver shadowMode.js
    action_contract: action,
    dry_run: dryRun,
    // PASSO 15.1, item 5-7 — auditoria semântica REAL do candidato (nunca do domínio que a ação
    // descreve). blast_radius acima (dry_run.affected_scope) continua vindo da classificação
    // conservadora existente (execution/blastRadius.js, fora do write boundary deste PASSO —
    // ver architectural_debt) — action_semantics mostra o que seria semanticamente correto,
    // registrado como debt pra uma futura extensão de execution/blastRadius.js, nunca aplicado
    // silenciosamente aqui.
    action_semantics: winnerCandidate.action_semantics,
    actual_mutation_scope: winnerCandidate.action_semantics.mutation_scope,
  };
}

module.exports = { handoffToPolicyEngine, ACTION_CLASS_TO_ACTION_TYPE };
