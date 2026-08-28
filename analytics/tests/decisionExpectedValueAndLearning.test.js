'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeExpectedValue, normalizeExpectedValueScores, adjustConfidenceForPriorLearning } = require('../src/decision/expectedValue');
const { buildDecision } = require('../src/decision/builder');
const { buildProductHypothesisKey } = require('../src/learning/canonicalKey');
const { PRODUCT_ID } = require('../config/product');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CRO-001',
    status: 'DRAFT',
    category: 'CRO',
    target_metric: 'taxa_lpv_checkout',
    hypothesis: { statement: 'reduzir fricção da LP aumenta a taxa LPV->checkout' },
    baseline: { cpa_financeiro: 109.79 },
    budget_limit: 281.8,
    budget_check: { max_budget_percent_of_cycle: 0.3 },
    priority: { factors: { confidence: 0.8, risk: 1 }, speed_dias_estimado: 7 },
    minimum_evidence: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
    expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } },
    failure_condition: 'target_metric piorou',
    success_condition: 'target_metric melhorou 20%+',
    attacks_path: 'CPA',
    ...overrides,
  };
}

function makeProfitSnapshot() {
  const win = { current_financials: { roas_financeiro: 0.62 }, data_quality: { data_completeness: 0.97, financial_confidence: 'normal' }, period: { from: '2026-01-01', to: '2026-01-30' } };
  return { found: true, snapshot_date: '2026-01-30', is_stale: false, snapshot: { windows: { last_30d: win, last_14d: win, last_7d: win } } };
}

const CYCLE = { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' };

test('expectedValue: fórmula raw_ev = (delta * adjusted_confidence) / (capital * tempo * risco)', () => {
  const r = computeExpectedValue({ expectedProfitDelta: 100, expectedRoasDelta: 0.1, confidence: 0.5, priorLearningVerdict: 'NO_PRIOR_EVIDENCE', capitalRequired: 100, risk: 2, timeToEvidence: 5 });
  const expected = (100 * 0.5) / (100 * 5 * 2);
  assert.equal(r.raw_ev, expected);
});

test('expectedValue: denominadores nunca zero (capital/tempo/risco mínimo 1)', () => {
  const r = computeExpectedValue({ expectedProfitDelta: 100, confidence: 1, priorLearningVerdict: 'NO_PRIOR_EVIDENCE', capitalRequired: 0, risk: 0, timeToEvidence: 0 });
  assert.equal(Number.isFinite(r.raw_ev), true);
});

test('expectedValue: SUPPORTING_EVIDENCE aumenta a confidence ajustada (capada em 1.0)', () => {
  const boosted = adjustConfidenceForPriorLearning(0.9, 'SUPPORTING_EVIDENCE');
  const neutral = adjustConfidenceForPriorLearning(0.9, 'NO_PRIOR_EVIDENCE');
  assert.ok(boosted > neutral);
  assert.ok(boosted <= 1.0);
  assert.equal(adjustConfidenceForPriorLearning(1.0, 'SUPPORTING_EVIDENCE'), 1.0); // capado
});

test('expectedValue: CONTRADICTORY_EVIDENCE reduz a confidence ajustada, mas não zera', () => {
  const r = adjustConfidenceForPriorLearning(0.8, 'CONTRADICTORY_EVIDENCE');
  assert.ok(r < 0.8 && r > 0);
});

test('expectedValue: PREVIOUSLY_INVALIDATED penaliza fortemente a confidence ajustada', () => {
  const invalidated = adjustConfidenceForPriorLearning(0.8, 'PREVIOUSLY_INVALIDATED');
  const contradicted = adjustConfidenceForPriorLearning(0.8, 'CONTRADICTORY_EVIDENCE');
  assert.ok(invalidated < contradicted);
  assert.ok(invalidated > 0);
});

test('expectedValue: reason_to_retest suaviza (mas não remove) a penalidade de PREVIOUSLY_INVALIDATED', () => {
  const semRetest = adjustConfidenceForPriorLearning(0.8, 'PREVIOUSLY_INVALIDATED', null);
  const comRetest = adjustConfidenceForPriorLearning(0.8, 'PREVIOUSLY_INVALIDATED', 'contexto diferente: nova LP, novo público');
  assert.ok(comRetest > semRetest);
  assert.ok(comRetest < 0.8); // ainda penalizado, só suavizado
});

test('normalizeExpectedValueScores: o melhor candidato positivo vira 100, os demais são proporcionais', () => {
  const candidates = [
    { id: 'A', expected_value: { raw_ev: 0.5 } },
    { id: 'B', expected_value: { raw_ev: 0.25 } },
  ];
  const r = normalizeExpectedValueScores(candidates);
  assert.equal(r.find((c) => c.id === 'A').expected_value.expected_value_score, 100);
  assert.equal(r.find((c) => c.id === 'B').expected_value.expected_value_score, 50);
});

test('normalizeExpectedValueScores: raw_ev <= 0 SEMPRE vira score 0, mesmo sendo "o menos ruim"', () => {
  const candidates = [
    { id: 'A', expected_value: { raw_ev: -1 } },
    { id: 'B', expected_value: { raw_ev: -5 } },
  ];
  const r = normalizeExpectedValueScores(candidates);
  assert.equal(r.find((c) => c.id === 'A').expected_value.expected_value_score, 0);
  assert.equal(r.find((c) => c.id === 'B').expected_value.expected_value_score, 0);
});

test('normalizeExpectedValueScores: candidato único positivo vira 100', () => {
  const r = normalizeExpectedValueScores([{ id: 'A', expected_value: { raw_ev: 0.001 } }]);
  assert.equal(r[0].expected_value.expected_value_score, 100);
});

test('builder + Learning Engine: hipótese PREVIOUSLY_INVALIDATED penaliza o candidato o suficiente pra perder de um sem histórico', () => {
  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CRO', target_metric: 'taxa_lpv_checkout' });
  const hypotheses = [{ product_hypothesis_key: key, global_hypothesis_key: 'cro|taxa_lpv_checkout|unspecified|unspecified|unspecified|unspecified', product_id: PRODUCT_ID, category: 'CRO', status: 'INVALIDATED', current_confidence: 30, times_tested: 2, successes: 0, failures: 2 }];

  // CRO-001 tem impacto esperado MAIOR, mas hipótese já invalidada -> deve perder pro CREATIVE-001
  const cro = makeExperiment({ experiment_id: 'CRO-001', category: 'CRO', target_metric: 'taxa_lpv_checkout', expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 100 } } });
  const creative = makeExperiment({ experiment_id: 'CREATIVE-001', category: 'CREATIVE', target_metric: 'cpa_financeiro', expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 30 } } });

  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [cro, creative], hypotheses, capitalCycle: CYCLE });
  assert.equal(decision.experiment_id, 'CREATIVE-001');
  const croAlt = decision.alternative_actions.find((a) => a.experiment_id === 'CRO-001');
  assert.equal(croAlt.rank, 2);
});

test('builder + Learning Engine: SUPPORTING_EVIDENCE aumenta a confiança do candidato (prior_learning_status refletido na decisão)', () => {
  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CRO', target_metric: 'taxa_lpv_checkout' });
  const hypotheses = [{ product_hypothesis_key: key, global_hypothesis_key: 'x', product_id: PRODUCT_ID, category: 'CRO', status: 'SUPPORTED', current_confidence: 80, times_tested: 2, successes: 2, failures: 0 }];

  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses, capitalCycle: CYCLE });
  assert.equal(decision.prior_learning_status, 'SUPPORTING_EVIDENCE');
});

test('builder + Learning Engine: CONTRADICTORY_EVIDENCE aparece refletida como prior_learning_status na decisão', () => {
  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CRO', target_metric: 'taxa_lpv_checkout' });
  const hypotheses = [{ product_hypothesis_key: key, global_hypothesis_key: 'x', product_id: PRODUCT_ID, category: 'CRO', status: 'CONTRADICTED', current_confidence: 50, times_tested: 2, successes: 1, failures: 1 }];

  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses, capitalCycle: CYCLE });
  assert.equal(decision.prior_learning_status, 'CONTRADICTORY_EVIDENCE');
});

test('builder + Learning Engine: sem hipótese prévia -> NO_PRIOR_EVIDENCE, nunca bloqueia a recomendação', () => {
  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE });
  assert.equal(decision.prior_learning_status, 'NO_PRIOR_EVIDENCE');
  assert.equal(decision.action_type, 'RUN_EXPERIMENT');
});
