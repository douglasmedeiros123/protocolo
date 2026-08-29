'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildActionContract, resetActionCounter, transitionAction } = require('../src/execution/actionContract');
const { evaluateActionWithPolicyEngine } = require('../src/execution/policyEngine');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');
const { classifyBlastRadius } = require('../src/execution/blastRadius');
const { evaluatePolicyChangeRequest, PROTECTED_POLICY_DOMAINS } = require('../src/execution/selfModificationProtection');
const { CAPITAL_SAFETY_PROFILE_KEYS } = require('../src/execution/capitalSafety');

function baseContext(overrides = {}) {
  return {
    capitalSafetyConfig: loadCapitalSafetyConfig(),
    measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] },
    blastRadiusResult: classifyBlastRadius('EXPERIMENT'),
    rateLimitResult: { excessive_action_frequency: false, violations: [] },
    circuitBreakerResult: { state: 'CLOSED', action: 'ALLOW_EXECUTION' },
    ...overrides,
  };
}

// 1. LLM recommendation não executa diretamente.
test('1: um Action Contract nasce em PROPOSED — nunca EXECUTING, mesmo vindo de uma recomendação de alta confiança', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'START_EXPERIMENT', subjectType: 'EXPERIMENT', subjectId: 'X', sourceAgent: 'STRATEGY_SEARCH', requestedChange: 'r', currentState: {}, targetState: {}, confidence: 'HIGH' });
  assert.equal(action.status, 'PROPOSED');
  assert.notEqual(action.status, 'EXECUTING');
  // recomendação isolada nunca pula direto pra EXECUTING — a transição não existe no grafo.
  const attempted = transitionAction(action, 'EXECUTING', 'tentativa de pular etapas');
  assert.equal(attempted.transition_rejected, true);
});

// 2. Policy Engine pode negar recomendação HIGH confidence.
test('2: confidence=HIGH da recomendação não sobrepõe uma política que nega (ex.: GLOBAL_FREEZE_POLICY ativo)', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'START_EXPERIMENT', subjectType: 'EXPERIMENT', subjectId: 'X', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, confidence: 'HIGH', experimentId: 'exp-1' });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ circuitBreakerResult: { state: 'OPEN', action: 'GLOBAL_FREEZE', reason: 'fonte financeira comprometida.' } }) });
  assert.equal(r.final_result, 'DENY');
  assert.ok(r.decisive_policies.includes('GLOBAL_FREEZE_POLICY'));
});

// 3. Policy Engine pode exigir aprovação humana.
test('3: reversibility=UNKNOWN ou HARD_TO_REVERSE sempre exige REQUIRE_HUMAN_APPROVAL', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'UPDATE_PRODUCT_PRICE', subjectType: 'PRODUCT', subjectId: 'P', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, reversibility: 'HARD_TO_REVERSE' });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ blastRadiusResult: classifyBlastRadius('PRODUCT') }) });
  assert.equal(r.final_result, 'REQUIRE_HUMAN_APPROVAL');
  assert.ok(r.decisive_policies.includes('REVERSIBILITY_POLICY'));
});

// 13. LLM não altera seus próprios limites.
test('13: origem LLM_RECOMMENDATION nunca é autorizada a alterar um domínio protegido (capital limits/circuit breaker/etc.)', () => {
  for (const domain of PROTECTED_POLICY_DOMAINS) {
    const r = evaluatePolicyChangeRequest({ domain, requestedByOrigin: 'LLM_RECOMMENDATION' });
    assert.equal(r.allowed, false);
  }
  const authorized = evaluatePolicyChangeRequest({ domain: 'CAPITAL_LIMITS', requestedByOrigin: 'HUMAN_OPERATOR' });
  assert.equal(authorized.allowed, true);
});

// 14. Missing policy = NOT_CONFIGURED/UNKNOWN, não zero.
test('14: capital safety config sem override é NOT_CONFIGURED em toda chave — nunca 0', () => {
  const config = loadCapitalSafetyConfig();
  for (const key of CAPITAL_SAFETY_PROFILE_KEYS) {
    assert.equal(config[key], 'NOT_CONFIGURED');
    assert.notEqual(config[key], 0);
  }
  const r = evaluateActionWithPolicyEngine({
    action: buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 100 }),
    context: baseContext({ blastRadiusResult: classifyBlastRadius('CAMPAIGN') }),
  });
  // sem política configurada, CAPITAL_LIMIT_POLICY nunca vira ALLOW por omissão — fica DEFER.
  const capitalCategory = r.category_results.find((c) => c.category === 'CAPITAL_LIMIT_POLICY');
  assert.equal(capitalCategory.result, 'DEFER');
});

// 17. Blast radius influencia policy.
test('17: blast_radius=ACCOUNT/GLOBAL sempre gera HUMAN_APPROVAL_POLICY=REQUIRE_HUMAN_APPROVAL', () => {
  const accountRadius = classifyBlastRadius('TRACKING_CONFIG'); // mapeado pra ACCOUNT
  assert.equal(accountRadius.blast_radius, 'ACCOUNT');
  const action = buildActionContract({ actionType: 'UPDATE_TRACKING_CONFIG', subjectType: 'TRACKING_CONFIG', subjectId: 'T', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, reversibility: 'REVERSIBLE' });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ blastRadiusResult: accountRadius }) });
  assert.equal(r.final_result, 'REQUIRE_HUMAN_APPROVAL');
});

// PASSO 13.1, item 20 — cobertura extra: a Policy Engine nunca "falha aberto" (erro numa
// categoria vira DEFER, nunca ALLOW silencioso).
test('extra: erro numa categoria de política nunca vira ALLOW silencioso — DEFER explícito', () => {
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {} });
  const r = evaluateActionWithPolicyEngine({ action, context: baseContext({ measurementSignals: null }) });
  const measurementCategory = r.category_results.find((c) => c.category === 'MEASUREMENT_READINESS_POLICY');
  assert.equal(measurementCategory.result, 'DEFER');
});
