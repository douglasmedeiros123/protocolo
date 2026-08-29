'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMinimumViableArchitectureTest, classifyTestType, resetMvaCounter } = require('../src/strategy-search/mvaTestBuilder');
const { evaluateCounterfactual } = require('../src/strategy-search/counterfactualAndPremortem');
const { analyzeStrategy } = require('../src/strategy-search/builder');

function archFixture(overrides = {}) {
  return { architecture_id: 'ARCH-X', stage_types: ['AD', 'SALES_PAGE', 'CHECKOUT', 'VSL'], primary_mechanism: 'INCREASE_COMPREHENSION', architecture_hypothesis: 'hipótese.', ...overrides };
}

// ===== item 107 — TESTES MVA =====

test('item 107: teste de arquitetura mínima viável é gerado com todos os campos do item 39', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture(), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  for (const f of ['test_id', 'architecture_id', 'hypothesis', 'minimum_changes', 'preserved_components', 'changed_components', 'primary_metric', 'secondary_metrics', 'required_tracking', 'minimum_evidence', 'estimated_implementation_cost', 'estimated_measurement_capital', 'success_condition', 'failure_condition', 'kill_condition', 'redecision_condition']) {
    assert.ok(f in mva, `campo ausente: ${f}`);
  }
});

test('item 107: preserva componentes existentes quando possível', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture(), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  assert.deepEqual(mva.preserved_components.sort(), ['AD', 'CHECKOUT', 'SALES_PAGE'].sort());
});

test('item 107: componentes mudados são explícitos', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture(), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  assert.deepEqual(mva.changed_components, ['VSL']);
});

test('item 107/40: teste multi-componente é rotulado explicitamente quando >1 estágio muda', () => {
  const t = classifyTestType(3);
  assert.equal(t, 'MULTI_COMPONENT_ARCHITECTURE_TEST');
});

test('item 107/40: confiança causal é reduzida (nota explícita) em teste multi-componente', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture({ stage_types: ['AD', 'SALES_PAGE', 'CHECKOUT', 'VSL', 'WHATSAPP'] }), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  assert.equal(mva.test_type, 'MULTI_COMPONENT_ARCHITECTURE_TEST');
  assert.match(mva.causal_confidence_note, /reduzida/);
});

test('item 107/43-44: measurement_capital desconhecido permanece NOT_ESTIMABLE, nunca R$1.000 assumido', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture(), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  assert.equal(mva.estimated_measurement_capital, 'NOT_ESTIMABLE');
  assert.notEqual(mva.estimated_measurement_capital, 1000);
});

test('item 107: kill_condition sempre presente', () => {
  resetMvaCounter();
  const mva = buildMinimumViableArchitectureTest({ productId: 'p', architecture: archFixture(), currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'] });
  assert.ok(mva.kill_condition);
});

// ===== item 108 — TESTES COUNTERFACTUAL =====

function rankingFixture(currentRank, currentId = 'ARCH-CURRENT', winnerId = 'ARCH-X') {
  const entries = [];
  entries.push({ architecture_id: currentRank === 1 ? currentId : winnerId, rank: 1, is_current: currentRank === 1 });
  entries.push({ architecture_id: currentRank === 1 ? winnerId : currentId, rank: 2, is_current: currentRank !== 1 });
  return entries;
}

test('item 108: funil atual pode retornar PROBABLY_NO quando perde o ranking', () => {
  const r = evaluateCounterfactual({ ranking: rankingFixture(2), hasCompletedComparativeExperiment: false });
  assert.equal(r.answer, 'PROBABLY_NO');
});

test('item 108: funil atual pode retornar PROBABLY_YES quando vence o ranking', () => {
  const r = evaluateCounterfactual({ ranking: rankingFixture(1), hasCompletedComparativeExperiment: false });
  assert.equal(r.answer, 'PROBABLY_YES');
});

test('item 108: basis é obrigatório em toda resposta counterfactual', () => {
  const r1 = evaluateCounterfactual({ ranking: rankingFixture(1), hasCompletedComparativeExperiment: false });
  const r2 = evaluateCounterfactual({ ranking: rankingFixture(2), hasCompletedComparativeExperiment: false });
  assert.ok(r1.basis);
  assert.ok(r2.basis);
});

test('item 108: nunca hardcoded — resposta muda conforme o ranking real muda (mesma função, entradas diferentes, saídas diferentes)', () => {
  const r1 = evaluateCounterfactual({ ranking: rankingFixture(1), hasCompletedComparativeExperiment: false });
  const r2 = evaluateCounterfactual({ ranking: rankingFixture(2), hasCompletedComparativeExperiment: false });
  assert.notEqual(r1.answer, r2.answer);
});

test('item 108: YES/NO absolutos só com experimento comparativo real concluído', () => {
  const withExp = evaluateCounterfactual({ ranking: rankingFixture(1), hasCompletedComparativeExperiment: true });
  const withoutExp = evaluateCounterfactual({ ranking: rankingFixture(1), hasCompletedComparativeExperiment: false });
  assert.equal(withExp.answer, 'YES');
  assert.equal(withoutExp.answer, 'PROBABLY_YES');
});

test('integração real: counterfactual real vem com answer válido e basis', () => {
  const r = analyzeStrategy({});
  assert.ok(['YES', 'PROBABLY_YES', 'PROBABLY_NO', 'NO', 'UNKNOWN'].includes(r.analysis.counterfactual.answer));
  assert.ok(r.analysis.counterfactual.basis);
});
