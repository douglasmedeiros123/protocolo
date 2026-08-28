'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRawLearning } = require('../src/learning/learningBuilder');
const { buildHypothesisRegistry } = require('../src/learning/hypothesisRegistry');
const { buildPatterns } = require('../src/learning/patternEngine');
const { checkPriorLearning } = require('../src/learning/checkPriorLearning');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CREATIVE-100',
    status: 'SUCCESS',
    category: 'CREATIVE',
    target_metric: 'cpa_financeiro',
    hypothesis: { statement: 'concentrar orçamento nos criativos com sinal reduz CPA' },
    baseline: { cpa_financeiro: 100 },
    actual_result: { cpa_financeiro: 80, lpv: 40, checkouts: 6, tracking_flags: [] },
    minimum_evidence: { lpv: 30, checkouts: 5, compras: null, spend: null, duration_days: 7 },
    conclusion: 'CPA caiu',
    learning: { summary: 'funcionou', what_not_to_repeat: null, next_test_suggestion: null },
    attacks_path: 'CPA',
    ...overrides,
  };
}

const TAGS = { mechanism: 'concentracao_budget' };

test('hypothesisRegistry: 1 sucesso isolado fica PROVISIONAL (não é verdade absoluta)', () => {
  const raw = [buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS)];
  const { hypotheses } = buildHypothesisRegistry(raw);
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0].status, 'PROVISIONAL');
  assert.equal(hypotheses[0].times_tested, 1);
});

test('hypothesisRegistry: repetir sucesso na MESMA hipótese eleva confidence e progride o status', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101' }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0].successes, 2);
  assert.equal(hypotheses[0].status, 'SUPPORTED');

  const raw3 = [...raw, buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-102' }), TAGS)];
  const { hypotheses: h3 } = buildHypothesisRegistry(raw3);
  assert.equal(h3[0].successes, 3);
  assert.equal(h3[0].status, 'STRONG');
  assert.ok(h3[0].current_confidence > hypotheses[0].current_confidence, 'confidence deve subir com mais repetição');
});

test('hypothesisRegistry: sucesso + falha na MESMA hipótese vira CONTRADICTED e reduz confidence vs. só-sucesso', () => {
  const onlySuccess = buildHypothesisRegistry([buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS)]);
  const contradicted = buildHypothesisRegistry([
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'FAILURE', actual_result: { cpa_financeiro: 130 } }), TAGS),
  ]);
  assert.equal(contradicted.hypotheses[0].status, 'CONTRADICTED');
  assert.ok(contradicted.hypotheses[0].current_confidence < onlySuccess.hypotheses[0].current_confidence);
});

test('hypothesisRegistry: contradição NUNCA apaga o learning anterior — só marca relação (contradicts_learning_ids)', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'FAILURE', actual_result: { cpa_financeiro: 130 } }), TAGS),
  ];
  const { learnings } = buildHypothesisRegistry(raw);
  assert.equal(learnings.length, 2); // ambos preservados
  const success = learnings.find((l) => l.result === 'SUCCESS');
  const failure = learnings.find((l) => l.result === 'FAILURE');
  assert.deepEqual(success.contradicts_learning_ids, [failure.learning_id]);
  assert.deepEqual(failure.contradicts_learning_ids, [success.learning_id]);
});

test('hypothesisRegistry: 2 falhas sem sucesso vira INVALIDATED', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', status: 'FAILURE', actual_result: { cpa_financeiro: 130 } }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'FAILURE', actual_result: { cpa_financeiro: 140 } }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  assert.equal(hypotheses[0].status, 'INVALIDATED');
});

test('hypothesisRegistry: flag crítico de tracking penaliza confidence do grupo (usa o PIOR caso, não a média)', () => {
  const clean = buildHypothesisRegistry([buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS)]);
  const withFlag = buildHypothesisRegistry([
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', actual_result: { cpa_financeiro: 80, tracking_flags: [{ code: 'DUPLICATE_PURCHASE_APPLE_PAY', severity: 'critical' }] } }), TAGS),
  ]);
  assert.ok(withFlag.hypotheses[0].current_confidence < clean.hypotheses[0].current_confidence);
  assert.ok(withFlag.hypotheses[0].current_confidence > 0, 'penaliza mas nunca zera');
});

test('hypothesisRegistry: hipóteses DIFERENTES (categoria ou métrica diferente) não se misturam', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CRO-100', category: 'CRO' }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  assert.equal(hypotheses.length, 2);
});

test('checkPriorLearning: sem hipótese prévia retorna NO_PRIOR_EVIDENCE (nunca bloqueia, só informa)', () => {
  const r = checkPriorLearning({ category: 'OFFER', target_metric: 'aov_liquido' }, []);
  assert.equal(r.verdict, 'NO_PRIOR_EVIDENCE');
});

test('checkPriorLearning: hipótese com status INVALIDATED retorna PREVIOUSLY_INVALIDATED', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', status: 'FAILURE', actual_result: { cpa_financeiro: 130 } }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'FAILURE', actual_result: { cpa_financeiro: 140 } }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  const r = checkPriorLearning({ category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' }, hypotheses);
  assert.equal(r.verdict, 'PREVIOUSLY_INVALIDATED');
});

test('checkPriorLearning: hipótese SUPPORTED com confidence suficiente retorna SUPPORTING_EVIDENCE', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101' }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  const r = checkPriorLearning({ category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' }, hypotheses);
  assert.equal(r.verdict, 'SUPPORTING_EVIDENCE');
});

test('checkPriorLearning: hipótese CONTRADICTED retorna CONTRADICTORY_EVIDENCE', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS),
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'FAILURE', actual_result: { cpa_financeiro: 130 } }), TAGS),
  ];
  const { hypotheses } = buildHypothesisRegistry(raw);
  const r = checkPriorLearning({ category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' }, hypotheses);
  assert.equal(r.verdict, 'CONTRADICTORY_EVIDENCE');
});

test('checkPriorLearning: PROVISIONAL (1 sucesso só) retorna INSUFFICIENT_EVIDENCE, não SUPPORTING', () => {
  const raw = [buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS)];
  const { hypotheses } = buildHypothesisRegistry(raw);
  const r = checkPriorLearning({ category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' }, hypotheses);
  assert.equal(r.verdict, 'INSUFFICIENT_EVIDENCE');
});

test('patternEngine: só agrega padrão a partir de evidência REAL (SUCCESS/FAILURE) — nunca inventa a partir de DRAFT', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS), // -20%
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', actual_result: { cpa_financeiro: 70 } }), { mechanism: 'outro_mecanismo' }), // -30%, hipótese diferente mas mesma categoria/métrica
  ];
  const { learnings } = buildHypothesisRegistry(raw);
  const patterns = buildPatterns(learnings);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].category, 'CREATIVE');
  assert.equal(patterns[0].target_metric, 'cpa_financeiro');
  assert.equal(patterns[0].observations, 2);
  assert.ok(patterns[0].average_effect < 0); // efeito real: CPA caiu nos dois
});

test('patternEngine: INCONCLUSIVE entra na contagem de observações mas NÃO distorce o average_effect', () => {
  const raw = [
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), TAGS), // SUCCESS, -20%
    buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', status: 'INCONCLUSIVE', actual_result: { cpa_financeiro: 500 } }), { mechanism: 'outro' }), // efeito absurdo, mas INCONCLUSIVE
  ];
  const { learnings } = buildHypothesisRegistry(raw);
  const patterns = buildPatterns(learnings);
  assert.equal(patterns[0].observations, 2);
  assert.equal(patterns[0].average_effect, -0.2); // só o SUCCESS entra na média
});

test('patternEngine: sem nenhum learning real, não há padrões (array vazio, nunca inventado)', () => {
  assert.deepEqual(buildPatterns([]), []);
});
