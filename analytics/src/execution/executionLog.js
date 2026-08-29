'use strict';

// item 14A.18 — log de auditoria immutable-style. Cada entrada é append-only (nunca editada
// depois de escrita) — persistência em arquivo local só como protótipo (item 14A.18: NÃO
// introduzir Postgres agora), com interface pronta pra uma futura Persistence Layer real.
function buildExecutionLogEntry({ actionId, policyResult, approval, dryRunResult, executionAttempt, executionResult, rollbackResult, circuitBreakerState }) {
  return {
    log_id: `LOG-${actionId}-${Date.now()}`,
    action_id: actionId,
    policy_result: policyResult || null,
    approval: approval || null,
    dry_run_result: dryRunResult || null,
    execution_attempt: executionAttempt || null, // sempre null/DRY_RUN neste PASSO — nunca uma tentativa real
    execution_result: executionResult || null,
    rollback_result: rollbackResult || null,
    circuit_breaker_state: circuitBreakerState || null,
    recorded_at: new Date().toISOString(),
    immutable: true,
  };
}

/** appendToLog() — nunca sobrescreve uma entrada existente, só acrescenta. */
function appendToLog(log, entry) {
  return [...log, Object.freeze({ ...entry })];
}

module.exports = { buildExecutionLogEntry, appendToLog };
