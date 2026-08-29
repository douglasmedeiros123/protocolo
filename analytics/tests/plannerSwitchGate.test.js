'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSwitchProductGate, MINIMUM_INVALIDATION_EVIDENCE } = require('../src/planner/switchGate');
const { analyzePlan } = require('../src/planner/builder');

function baseArgs(overrides = {}) {
  return {
    economicsSnapshot: { period: { data_completeness: 0.95 }, financials: { numero_compradores_reais: 20 } },
    experimentCoverage: { total_completed: 5 },
    levers: [
      { lever_id: 'CREATIVE', completed_experiments: 1 },
      { lever_id: 'CRO', completed_experiments: 1 },
      { lever_id: 'OFFER', completed_experiments: 1 },
    ],
    learningEvidence: { total_hypotheses: 5, by_category: { CREATIVE: { invalidated_hypotheses: 2 }, CRO: { invalidated_hypotheses: 0 }, OFFER: { invalidated_hypotheses: 0 }, AOV: { invalidated_hypotheses: 0 }, CHECKOUT: { invalidated_hypotheses: 0 }, TRACKING: { invalidated_hypotheses: 0 }, MEDIA_BUYING: { invalidated_hypotheses: 0 } } },
    knownPathToTarget: { status: 'NO_KNOWN_PATH', reason: 'gap não fecha' },
    capitalPlan: { available: 100 },
    expectedEconomicValueOfContinuing: { status: 'NEGATIVE' },
    valueOfInformationOfContinuing: { status: 'LOW' },
    expectedEconomicValueOfSwitching: { status: 'POSITIVE' },
    financialTruthStatus: 'RELIABLE',
    ...overrides,
  };
}

test('item 79: evidência insuficiente bloqueia o switch (volume mínimo de compradores)', () => {
  const g = evaluateSwitchProductGate(baseArgs({ economicsSnapshot: { period: { data_completeness: 0.95 }, financials: { numero_compradores_reais: 3 } } }));
  assert.equal(g.eligible, false);
  assert.equal(g.criteria.minimum_evidence_volume.status, 'FAIL');
});

test('PASSO 11.1, item 2/3: FINANCIAL_TRUTH BLOCKED bloqueia invalidação forte', () => {
  const g = evaluateSwitchProductGate(baseArgs({ financialTruthStatus: 'BLOCKED' }));
  assert.equal(g.eligible, false);
  assert.equal(g.criteria.tracking_sufficiency.status, 'FAIL');
});

test('PASSO 11.1, item 2: FINANCIAL_TRUTH DEGRADED (Meta-only) NÃO reprova tracking_sufficiency sozinho', () => {
  const g = evaluateSwitchProductGate(baseArgs({ financialTruthStatus: 'DEGRADED' }));
  assert.equal(g.criteria.tracking_sufficiency.status, 'PASS');
});

test('item 79: alavanca-chave importante não explorada bloqueia switch', () => {
  const g = evaluateSwitchProductGate(baseArgs({ levers: [{ lever_id: 'CREATIVE', completed_experiments: 1 }, { lever_id: 'CRO', completed_experiments: 0 }, { lever_id: 'OFFER', completed_experiments: 1 }] }));
  assert.equal(g.eligible, false);
  assert.equal(g.criteria.key_levers_explored.status, 'FAIL');
  assert.match(g.criteria.key_levers_explored.reason, /CRO/);
});

test('item 79: experimentos falhos adequados aumentam evidência de switch (critério passa)', () => {
  const g = evaluateSwitchProductGate(baseArgs());
  assert.equal(g.criteria.completed_experiments.status, 'PASS');
  assert.equal(g.criteria.relevant_hypotheses_invalidated.status, 'PASS');
});

test('item 79: EV negativo de continuar só sustenta switch quando evidência é suficiente (gate completo)', () => {
  const g = evaluateSwitchProductGate(baseArgs());
  assert.equal(g.eligible, true); // todos os 10 critérios passam neste fixture
  const gInsufficient = evaluateSwitchProductGate(baseArgs({ experimentCoverage: { total_completed: 0 } }));
  assert.equal(gInsufficient.eligible, false);
});

test('PASSO 11.1, item 12: HIGH value of information reprova o critério de EV mesmo com economic EV NEGATIVE', () => {
  const g = evaluateSwitchProductGate(baseArgs({ valueOfInformationOfContinuing: { status: 'HIGH' } }));
  assert.equal(g.criteria.expected_value_of_continuing.status, 'FAIL');
  assert.match(g.criteria.expected_value_of_continuing.reason, /valor de aprendizado/);
});

test('PASSO 11.1, item 11/12: economic EV UNKNOWN + VOI HIGH é uma combinação válida que NÃO libera switch (nunca exige EV positivo artificialmente, mas HIGH VOI ainda barra saída)', () => {
  const g = evaluateSwitchProductGate(baseArgs({ expectedEconomicValueOfContinuing: { status: 'UNKNOWN' }, valueOfInformationOfContinuing: { status: 'HIGH' } }));
  assert.equal(g.eligible, false);
  assert.equal(g.criteria.expected_value_of_continuing.status, 'FAIL');
});

test('item 79: EV de alternativa desconhecido permanece UNKNOWN, nunca inventado', () => {
  const g = evaluateSwitchProductGate(baseArgs({ expectedEconomicValueOfSwitching: { status: 'UNKNOWN' } }));
  assert.equal(g.criteria.opportunity_cost_of_testing_alternative.status, 'UNKNOWN');
  assert.equal(g.eligible, false); // UNKNOWN nunca libera o gate
});

test('MINIMUM_INVALIDATION_EVIDENCE é documentado, não um número mágico único', () => {
  assert.ok(MINIMUM_INVALIDATION_EVIDENCE.min_completed_experiments_total >= 1);
  assert.ok(Array.isArray(MINIMUM_INVALIDATION_EVIDENCE.key_levers));
  assert.ok(MINIMUM_INVALIDATION_EVIDENCE.description.length > 0);
});

test('10 critérios documentados no item 19 estão todos presentes', () => {
  const g = evaluateSwitchProductGate(baseArgs());
  const keys = Object.keys(g.criteria);
  assert.equal(keys.length, 10);
});

test('integração real: switch_gate nunca elegível hoje (0 experimentos concluídos)', () => {
  const r = analyzePlan({});
  assert.equal(r.switch_gate.eligible, false);
  assert.ok(r.switch_gate.fail_count > 0 || r.switch_gate.unknown_count > 0);
});
