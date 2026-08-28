'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHypothesisKey, parseHypothesisKey } = require('../src/learning/canonicalKey');
const { buildRawLearning, CLOSED_STATUSES } = require('../src/learning/learningBuilder');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CREATIVE-100',
    status: 'DRAFT',
    category: 'CREATIVE',
    target_metric: 'cpa_financeiro',
    hypothesis: { statement: 'concentrar orçamento nos criativos com sinal reduz CPA' },
    baseline: { cpa_financeiro: 100 },
    actual_result: null,
    minimum_evidence: { lpv: 30, checkouts: 5, compras: null, spend: null, duration_days: 7 },
    conclusion: null,
    learning: null,
    attacks_path: 'CPA',
    ...overrides,
  };
}

test('canonicalKey: chave é determinística — mesma entrada sempre produz a mesma chave', () => {
  const fields = { category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' };
  assert.equal(buildHypothesisKey(fields), buildHypothesisKey(fields));
});

test('canonicalKey: campos ausentes viram "unspecified" (nunca omitidos, nunca inventados)', () => {
  const key = buildHypothesisKey({ category: 'CREATIVE', target_metric: 'cpa_financeiro' });
  const parsed = parseHypothesisKey(key);
  assert.equal(parsed.mechanism, 'unspecified');
  assert.equal(parsed.context, 'unspecified');
  assert.equal(parsed.funnel_stage, 'unspecified');
  assert.equal(parsed.asset_type, 'unspecified');
});

test('canonicalKey: normaliza case e espaços — "Media Buying" e "media_buying" colidem na mesma chave', () => {
  const a = buildHypothesisKey({ category: 'Media Buying', target_metric: 'CPA' });
  const b = buildHypothesisKey({ category: 'media_buying', target_metric: 'cpa' });
  assert.equal(a, b);
});

test('canonicalKey: NÃO usa embeddings/LLM — é só string join determinística de campos estruturados', () => {
  const key = buildHypothesisKey({ category: 'CREATIVE', target_metric: 'cpa_financeiro' });
  assert.equal(typeof key, 'string');
  assert.equal(key.split('|').length, 6);
});

test('learningBuilder: experimento SUCCESS gera raw learning corretamente', () => {
  const exp = makeExperiment({
    status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, lpv: 40, checkouts: 6, tracking_flags: [] },
    conclusion: 'CPA caiu 20% concentrando budget nos 2 criativos com sinal',
    learning: { summary: 'Concentrar orçamento em criativos validados reduz CPA', what_not_to_repeat: 'Não fragmentar budget em 20+ variantes sem amostra', next_test_suggestion: 'Testar com 3 criativos e orçamento maior' },
  });
  const raw = buildRawLearning(exp);
  assert.equal(raw.learning_id, 'LEARN-CREATIVE-100');
  assert.equal(raw.result, 'SUCCESS');
  assert.equal(raw.metric_before, 100);
  assert.equal(raw.metric_after, 80);
  assert.equal(raw.delta_absolute, -20);
  assert.equal(raw.delta_percent, -0.2);
  assert.equal(raw.what_worked, 'Concentrar orçamento em criativos validados reduz CPA');
  assert.equal(raw.what_failed, null);
  assert.equal(raw.what_not_to_repeat, 'Não fragmentar budget em 20+ variantes sem amostra');
  assert.equal(raw.reusable_insight, 'Testar com 3 criativos e orçamento maior');
  assert.equal(raw.tracking_checked, true);
  assert.deepEqual(raw.tracking_flags_responsible, []);
});

test('learningBuilder: experimento FAILURE gera raw learning corretamente (what_failed preenchido, what_worked null)', () => {
  const exp = makeExperiment({
    status: 'FAILURE',
    actual_result: { cpa_financeiro: 130 },
    conclusion: 'CPA piorou',
    learning: { summary: 'Concentrar budget nesses 2 criativos piorou o CPA', what_not_to_repeat: 'Não repetir com esses criativos específicos' },
  });
  const raw = buildRawLearning(exp);
  assert.equal(raw.result, 'FAILURE');
  assert.equal(raw.what_failed, 'Concentrar budget nesses 2 criativos piorou o CPA');
  assert.equal(raw.what_worked, null);
  assert.equal(raw.delta_absolute, 30);
});

test('learningBuilder: experimento INCONCLUSIVE gera raw learning (sem what_worked/what_failed)', () => {
  const exp = makeExperiment({ status: 'INCONCLUSIVE', actual_result: { cpa_financeiro: 99 }, conclusion: 'Amostra insuficiente pra concluir' });
  const raw = buildRawLearning(exp);
  assert.equal(raw.result, 'INCONCLUSIVE');
  assert.equal(raw.what_worked, null);
  assert.equal(raw.what_failed, null);
});

for (const status of ['DRAFT', 'READY', 'RUNNING', 'PAUSED']) {
  test(`learningBuilder: experimento ${status} NÃO gera aprendizado conclusivo (retorna null)`, () => {
    const exp = makeExperiment({ status });
    assert.equal(buildRawLearning(exp), null);
  });
}

test('learningBuilder: CANCELLED também não gera learning (só os 3 status de CLOSED_STATUSES geram)', () => {
  assert.deepEqual(CLOSED_STATUSES.sort(), ['FAILURE', 'INCONCLUSIVE', 'SUCCESS'].sort());
  assert.equal(buildRawLearning(makeExperiment({ status: 'CANCELLED' })), null);
});

test('learningBuilder: divisão por zero — baseline 0 não gera delta_percent como Infinity/NaN, vira null', () => {
  const exp = makeExperiment({ status: 'SUCCESS', baseline: { cpa_financeiro: 0 }, actual_result: { cpa_financeiro: 10 } });
  const raw = buildRawLearning(exp);
  assert.equal(raw.delta_absolute, 10);
  assert.equal(raw.delta_percent, null);
});

test('learningBuilder: métrica ausente no actual_result não quebra — metric_after vira null, delta null', () => {
  const exp = makeExperiment({ status: 'SUCCESS', actual_result: { outra_coisa: 1 } });
  const raw = buildRawLearning(exp);
  assert.equal(raw.metric_after, null);
  assert.equal(raw.delta_absolute, null);
  assert.equal(raw.delta_percent, null);
});

test('learningBuilder: baseline ausente não quebra — metric_before vira null', () => {
  const exp = makeExperiment({ status: 'SUCCESS', baseline: null, actual_result: { cpa_financeiro: 80 } });
  const raw = buildRawLearning(exp);
  assert.equal(raw.metric_before, null);
  assert.equal(raw.delta_absolute, null);
});

test('learningBuilder: flags críticos de tracking são identificados (tracking_flags_responsible)', () => {
  const exp = makeExperiment({
    status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, tracking_flags: [{ code: 'DUPLICATE_PURCHASE_APPLE_PAY', severity: 'critical' }, { code: 'MINOR_DELAY', severity: 'warning' }] },
  });
  const raw = buildRawLearning(exp);
  assert.deepEqual(raw.tracking_flags_responsible, ['DUPLICATE_PURCHASE_APPLE_PAY']);
  assert.equal(raw.tracking_checked, true);
});

test('learningBuilder: sem tracking_flags no actual_result, tracking_checked é false (não afirma "está limpo")', () => {
  const exp = makeExperiment({ status: 'SUCCESS', actual_result: { cpa_financeiro: 80 } });
  const raw = buildRawLearning(exp);
  assert.equal(raw.tracking_checked, false);
  assert.deepEqual(raw.tracking_flags_responsible, []);
});

module.exports = { makeExperiment };
