'use strict';

// item 14A.7 — a mesma action_id/idempotency_key nunca pode ser executada duas vezes. Adapter em
// memória por padrão (interface pronta pra uma futura Persistence Layer real — item 14A.8/18,
// nunca Postgres introduzido aqui).
function createInMemoryIdempotencyStore() {
  const seen = new Map(); // idempotency_key -> { first_seen_at, execution_count }
  return {
    /** hasBeenExecuted() — nunca executa, só consulta. */
    hasBeenExecuted(key) { return seen.has(key); },
    /**
     * recordExecutionAttempt() — item 14A.7. Retorna { allowed, reason }. A PRIMEIRA tentativa
     * pra uma key é sempre allowed=true; qualquer tentativa subsequente (retry de rede,
     * recomendação repetida do orchestrator, invocação concorrente) é allowed=false — nunca gera
     * uma segunda execução.
     */
    recordExecutionAttempt(key) {
      if (seen.has(key)) {
        const entry = seen.get(key);
        entry.execution_count += 1;
        return { allowed: false, execution_count: entry.execution_count, reason: `idempotency_key '${key}' já foi executada em ${entry.first_seen_at} — tentativa #${entry.execution_count} bloqueada, nunca executa duas vezes (item 14A.7).` };
      }
      const first_seen_at = new Date().toISOString();
      seen.set(key, { first_seen_at, execution_count: 1 });
      return { allowed: true, execution_count: 1, reason: 'primeira tentativa pra esta idempotency_key — permitida.' };
    },
    _debugSize() { return seen.size; },
  };
}

/**
 * simulateConcurrentInvocations() — item 14A.7 (testável): dado N tentativas "simultâneas" com a
 * mesma key, garante determinísticamente que só a primeira é allowed=true.
 */
function simulateConcurrentInvocations(store, key, attempts) {
  const results = [];
  for (let i = 0; i < attempts; i += 1) results.push(store.recordExecutionAttempt(key));
  return results;
}

module.exports = { createInMemoryIdempotencyStore, simulateConcurrentInvocations };
