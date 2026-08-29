'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createInMemoryIdempotencyStore, simulateConcurrentInvocations } = require('../src/execution/idempotency');
const { createInMemoryRateLimitCounter, evaluateRateLimits } = require('../src/execution/rateLimit');

// 6. Duplicate action não executa duas vezes.
test('6: same request twice — segunda tentativa com a mesma idempotency_key é bloqueada', () => {
  const store = createInMemoryIdempotencyStore();
  const first = store.recordExecutionAttempt('ACTION-00001');
  const second = store.recordExecutionAttempt('ACTION-00001');
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.execution_count, 2);
});

// 7. Retry não gera duplicidade.
test('7: network retry (mesma key reenviada) nunca gera uma segunda execução real', () => {
  const store = createInMemoryIdempotencyStore();
  store.recordExecutionAttempt('ACTION-00002');
  const retry1 = store.recordExecutionAttempt('ACTION-00002');
  const retry2 = store.recordExecutionAttempt('ACTION-00002');
  assert.equal(retry1.allowed, false);
  assert.equal(retry2.allowed, false);
});

test('7b: orchestrator repeated recommendation (mesma key, N tentativas) — só a primeira permitida, nunca mais de uma', () => {
  const store = createInMemoryIdempotencyStore();
  const results = simulateConcurrentInvocations(store, 'ACTION-00003', 5);
  assert.equal(results.filter((r) => r.allowed).length, 1);
  assert.equal(results[0].allowed, true);
  for (let i = 1; i < results.length; i += 1) assert.equal(results[i].allowed, false);
});

test('7c: concurrent invocation (chaves diferentes) cada uma é independente — não interfere uma na outra', () => {
  const store = createInMemoryIdempotencyStore();
  const a = store.recordExecutionAttempt('ACTION-A');
  const b = store.recordExecutionAttempt('ACTION-B');
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);
  assert.equal(store._debugSize(), 2);
});

// cobertura extra — rate limit / action storm counters (base pro teste 8 no arquivo de circuit breaker)
test('extra: rate limit counter conta ações reais na janela e detecta violação quando configurada', () => {
  const counter = createInMemoryRateLimitCounter();
  const now = new Date('2026-08-29T12:00:00.000Z').toISOString();
  for (let i = 0; i < 5; i += 1) counter.recordAction({ at: new Date(Date.parse(now) - i * 1000).toISOString() });
  const withoutLimit = evaluateRateLimits({ counter, nowIso: now, limits: { max_changes_per_hour: 'NOT_CONFIGURED', max_changes_per_day: 'NOT_CONFIGURED' } });
  assert.equal(withoutLimit.excessive_action_frequency, false); // sem política configurada, nunca marca violação por omissão
  const withLimit = evaluateRateLimits({ counter, nowIso: now, limits: { max_changes_per_hour: 3, max_changes_per_day: 'NOT_CONFIGURED' } });
  assert.equal(withLimit.excessive_action_frequency, true);
});
