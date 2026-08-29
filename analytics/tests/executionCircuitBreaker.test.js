'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateCircuitBreaker, CIRCUIT_BREAKER_STATES } = require('../src/execution/circuitBreaker');
const { evaluateActionWithPolicyEngine } = require('../src/execution/policyEngine');
const { buildActionContract, resetActionCounter } = require('../src/execution/actionContract');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');
const { classifyBlastRadius } = require('../src/execution/blastRadius');

function baseContext(overrides = {}) {
  return {
    capitalSafetyConfig: loadCapitalSafetyConfig(),
    measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] },
    blastRadiusResult: classifyBlastRadius('CAMPAIGN'),
    rateLimitResult: { excessive_action_frequency: false, violations: [] },
    circuitBreakerResult: { state: 'CLOSED', action: 'ALLOW_EXECUTION' },
    ...overrides,
  };
}

// 8. Action storm abre Circuit Breaker.
test('8: DUPLICATE_ACTION_STORM sozinho já abre o circuito (FREEZE_SCOPE) — trigger severo', () => {
  const r = evaluateCircuitBreaker({ signals: { duplicateActionStormDetected: true }, currentState: 'CLOSED', scope: 'CAMPAIGN-1' });
  assert.equal(r.state, 'OPEN');
  assert.equal(r.action, 'FREEZE_SCOPE');
  assert.equal(r.affected_scope, 'CAMPAIGN-1');
});

test('8b: dois triggers leves simultâneos (frequência + aceleração de orçamento) também abrem o circuito', () => {
  const r = evaluateCircuitBreaker({ signals: { excessiveActionFrequency: true, budgetAcceleration: true }, currentState: 'CLOSED', scope: 'CAMPAIGN-1' });
  assert.equal(r.state, 'OPEN');
  assert.equal(r.action, 'FREEZE_SCOPE');
});

test('8c: um único trigger leve isolado gera só WARNING, não OPEN', () => {
  const r = evaluateCircuitBreaker({ signals: { budgetAcceleration: true }, currentState: 'CLOSED', scope: 'CAMPAIGN-1' });
  assert.equal(r.state, 'WARNING');
  assert.equal(r.action, 'BLOCK_EXECUTION');
});

// 9. Financial truth BLOCKED pode bloquear dependent execution.
test('9: financialTruthBlocked sempre gera GLOBAL_FREEZE (a única condição excepcional)', () => {
  const r = evaluateCircuitBreaker({ signals: { financialTruthBlocked: true }, currentState: 'CLOSED', scope: 'CAMPAIGN-1' });
  assert.equal(r.action, 'GLOBAL_FREEZE');
  assert.equal(r.state, 'OPEN');
});

// 10. Platform attribution DEGRADED não bloqueia ação independente.
test('10: FINANCIAL_TRUTH_POLICY só olha financial_truth_health — PLATFORM_ATTRIBUTION_HEALTH degradado não aparece nela', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 10, reversibility: 'REVERSIBLE' });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] } }) });
  const financialCategory = r.category_results.find((c) => c.category === 'FINANCIAL_TRUTH_POLICY');
  assert.equal(financialCategory.result, 'ALLOW');
});

// 11. Measurement anomaly bloqueia somente decisão dependente.
test('11: ANOMALY_POLICY só nega quando existe anomalia CAPITAL_BLOCKING nos anomalies passados pra ESTA decisão (já contextualizados a montante)', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'START_EXPERIMENT', subjectType: 'EXPERIMENT', subjectId: 'X', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, experimentId: 'e1' });
  const withBlocking = evaluateActionWithPolicyEngine({ action, context: baseContext({ measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [{ type: 'DUPLICATE_SUSPECTED', severity: 'CAPITAL_BLOCKING' }] } }) });
  const withoutBlocking = evaluateActionWithPolicyEngine({ action, context: baseContext({ measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [{ type: 'VALUE_MISMATCH', severity: 'WARNING' }] } }) });
  assert.equal(withBlocking.final_result, 'DENY');
  assert.notEqual(withoutBlocking.final_result, 'DENY');
});

// 12. GLOBAL_FREEZE é excepcional.
test('12: nenhum trigger leve ou severo isolado (exceto financial truth) alcança GLOBAL_FREEZE — só FREEZE_SCOPE no máximo', () => {
  const { CIRCUIT_BREAKER_TRIGGERS } = require('../src/execution/enums');
  for (const trigger of CIRCUIT_BREAKER_TRIGGERS) {
    if (trigger === 'FINANCIAL_TRUTH_BLOCKED') continue;
    const signalKey = trigger.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const r = evaluateCircuitBreaker({ signals: { [signalKey]: true }, currentState: 'CLOSED', scope: 'X' });
    assert.notEqual(r.action, 'GLOBAL_FREEZE');
  }
});

// 20. Circuit Breaker override da LLM.
test('20: mesmo um Action com policy_result=ALLOW em todas as outras categorias, GLOBAL_FREEZE_POLICY (circuit breaker) ainda vence — LLM não pode contornar', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 10, reversibility: 'REVERSIBLE', confidence: 'HIGH' });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ circuitBreakerResult: { state: 'OPEN', action: 'GLOBAL_FREEZE', reason: 'financial truth blocked' } }) });
  assert.equal(r.final_result, 'DENY');
  assert.ok(r.decisive_policies.includes('GLOBAL_FREEZE_POLICY'));
  assert.equal(r.llm_override_possible, false);
});

test('estados canônicos do circuit breaker são exatamente os 4 documentados', () => {
  assert.deepEqual(CIRCUIT_BREAKER_STATES.sort(), ['CLOSED', 'MANUAL_LOCK', 'OPEN', 'WARNING'].sort());
});

test('MANUAL_LOCK nunca é auto-liberado por trigger nenhum', () => {
  const r = evaluateCircuitBreaker({ signals: {}, currentState: 'MANUAL_LOCK', scope: 'X' });
  assert.equal(r.state, 'MANUAL_LOCK');
});
