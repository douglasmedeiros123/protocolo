'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRawLearning, CLOSED_STATUSES } = require('../src/learning/learningBuilder');
const { buildHypothesisRegistry } = require('../src/learning/hypothesisRegistry');
const { buildPatterns } = require('../src/learning/patternEngine');
const { ASSET_ORIGINS, isValidAssetOrigin, resolveAssetOrigin } = require('../src/learning/assetOrigin');
const { buildGlobalHypothesisKey, buildProductHypothesisKey } = require('../src/learning/canonicalKey');
const { PRODUCT_ID, resolveProductId } = require('../config/product');
const { loadAllExperiments } = require('../src/experiments/registry');

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

test('product context: product_id é persistido no learning, usando o default centralizado quando o experimento não informa', () => {
  const raw = buildRawLearning(makeExperiment());
  assert.equal(raw.product_id, PRODUCT_ID);
});

test('product context: product_id explícito no experimento é respeitado (não hardcoded)', () => {
  const raw = buildRawLearning(makeExperiment({ product_id: 'outro_produto_futuro' }));
  assert.equal(raw.product_id, 'outro_produto_futuro');
});

test('product context: resolveProductId nunca retorna null/undefined, mesmo sem nenhuma fonte', () => {
  assert.equal(resolveProductId(), PRODUCT_ID);
  assert.equal(resolveProductId(null), PRODUCT_ID);
  assert.equal(resolveProductId({}), PRODUCT_ID);
});

test('product context: dois produtos diferentes NÃO colidem na memória — hipóteses ficam em grupos separados mesmo com mesma categoria/métrica/mecanismo', () => {
  const rawA = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', product_id: 'produto_a' }), { mechanism: 'concentracao_budget' });
  const rawB = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-200', product_id: 'produto_b' }), { mechanism: 'concentracao_budget' });
  const { hypotheses } = buildHypothesisRegistry([rawA, rawB]);
  assert.equal(hypotheses.length, 2, 'devem ficar 2 hipóteses separadas, uma por produto');
  assert.notEqual(rawA.product_hypothesis_key, rawB.product_hypothesis_key);
});

test('product context: mesmo mecanismo em produtos diferentes tem global_hypothesis_key IGUAL (comparável no futuro), mas product_hypothesis_key diferente', () => {
  const rawA = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', product_id: 'produto_a' }), { mechanism: 'concentracao_budget' });
  const rawB = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-200', product_id: 'produto_b' }), { mechanism: 'concentracao_budget' });
  assert.equal(rawA.global_hypothesis_key, rawB.global_hypothesis_key);
  assert.notEqual(rawA.product_hypothesis_key, rawB.product_hypothesis_key);
  // e a chave global bate com o que buildGlobalHypothesisKey calcularia direto
  assert.equal(rawA.global_hypothesis_key, buildGlobalHypothesisKey({ category: 'CREATIVE', target_metric: 'cpa_financeiro', mechanism: 'concentracao_budget' }));
});

test('product context: buildProductHypothesisKey namespacea corretamente por produto, sem ambiguidade no parse', () => {
  const keyA = buildProductHypothesisKey('produto_a', { category: 'CREATIVE', target_metric: 'cpa_financeiro' });
  const keyB = buildProductHypothesisKey('produto_b', { category: 'CREATIVE', target_metric: 'cpa_financeiro' });
  assert.notEqual(keyA, keyB);
  assert.ok(keyA.startsWith('produto_a::'));
});

test('learning scope: default é sempre PRODUCT_SPECIFIC, mesmo com repetição/confidence alta (nunca vira GLOBAL sozinho)', () => {
  const raw1 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), { mechanism: 'x' });
  const raw2 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101' }), { mechanism: 'x' });
  const raw3 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-102' }), { mechanism: 'x' });
  const { learnings, hypotheses } = buildHypothesisRegistry([raw1, raw2, raw3]);
  assert.equal(hypotheses[0].status, 'STRONG'); // 3 sucessos, confidence alta
  for (const l of learnings) assert.equal(l.learning_scope, 'PRODUCT_SPECIFIC');
});

test('asset_origin: enum tem exatamente os 5 valores pedidos', () => {
  assert.deepEqual(ASSET_ORIGINS.sort(), ['EXTERNAL', 'HUMAN', 'MACHINE', 'MIXED', 'UNKNOWN'].sort());
});

test('asset_origin: valor válido explícito no experimento é respeitado', () => {
  assert.equal(isValidAssetOrigin('MACHINE'), true);
  const raw = buildRawLearning(makeExperiment({ asset_origin: 'MACHINE' }));
  assert.equal(raw.asset_origin, 'MACHINE');
});

test('asset_origin: valor inválido é rejeitado e cai pra UNKNOWN (nunca inventa MACHINE/HUMAN)', () => {
  assert.equal(isValidAssetOrigin('ALIEN'), false);
  const raw = buildRawLearning(makeExperiment({ asset_origin: 'ALIEN' }));
  assert.equal(raw.asset_origin, 'UNKNOWN');
  assert.equal(resolveAssetOrigin({ asset_origin: 'ALIEN' }), 'UNKNOWN');
});

test('asset_origin: experimento sem o campo vira UNKNOWN, nunca MACHINE por dedução', () => {
  const raw = buildRawLearning(makeExperiment());
  assert.equal(raw.asset_origin, 'UNKNOWN');
});

test('asset references: são opcionais — um teste de criativo pode ter creative_id sem landing_page_version', () => {
  const raw = buildRawLearning(makeExperiment({ creative_id: 'CRIATIVO_01' }));
  assert.equal(raw.asset_refs.creative_id, 'CRIATIVO_01');
  assert.equal(raw.asset_refs.landing_page_version, null);
  assert.equal(raw.asset_refs.offer_version, null);
});

test('asset references: um teste CRO pode ter landing_page_version sem creative_id', () => {
  const raw = buildRawLearning(makeExperiment({ landing_page_version: 'v3' }));
  assert.equal(raw.asset_refs.landing_page_version, 'v3');
  assert.equal(raw.asset_refs.creative_id, null);
});

test('asset references: todas as 5 referências opcionais existem no shape, mesmo quando ausentes (null explícito, não undefined)', () => {
  const raw = buildRawLearning(makeExperiment());
  assert.deepEqual(raw.asset_refs, {
    creative_id: null, landing_page_version: null, offer_version: null, funnel_version: null, relationship_sequence_id: null,
  });
});

test('backward compatibility: os 4 DRAFTs reais atuais continuam carregando sem quebrar e sem gerar learning', () => {
  const experiments = loadAllExperiments(); // diretório real analytics/data/experiments/
  assert.equal(experiments.length, 4);
  for (const exp of experiments) {
    assert.equal(CLOSED_STATUSES.includes(exp.status), false, `${exp.experiment_id} deveria ser DRAFT`);
    assert.equal(buildRawLearning(exp), null);
  }
});

test('backward compatibility: se um DRAFT real fosse fechado sem os novos campos, asset_origin vira UNKNOWN (nunca inventado)', () => {
  const experiments = loadAllExperiments();
  const simulatedClosed = { ...experiments[0], status: 'INCONCLUSIVE', actual_result: { [experiments[0].target_metric]: 1 } };
  const raw = buildRawLearning(simulatedClosed);
  assert.equal(raw.asset_origin, 'UNKNOWN');
  assert.equal(raw.product_id, PRODUCT_ID);
  assert.deepEqual(raw.asset_refs, { creative_id: null, landing_page_version: null, offer_version: null, funnel_version: null, relationship_sequence_id: null });
});

test('patterns: com um único produto, product_ids_observed tem só 1 item e cross_product_observations é 0 (nunca inventa cross-product)', () => {
  const raw1 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100' }), { mechanism: 'x' });
  const raw2 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', actual_result: { cpa_financeiro: 70, tracking_flags: [] } }), { mechanism: 'y' });
  const { learnings } = buildHypothesisRegistry([raw1, raw2]);
  const patterns = buildPatterns(learnings);
  assert.equal(patterns.length, 1);
  assert.deepEqual(patterns[0].product_ids_observed, [PRODUCT_ID]);
  assert.equal(patterns[0].cross_product_observations, 0);
});

test('patterns: com produtos DIFERENTES observados na mesma categoria/métrica, product_ids_observed lista ambos e cross_product_observations conta as observações fora do produto majoritário', () => {
  const rawA1 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-100', product_id: 'produto_a' }), { mechanism: 'x' });
  const rawA2 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-101', product_id: 'produto_a', actual_result: { cpa_financeiro: 75, tracking_flags: [] } }), { mechanism: 'y' });
  const rawB1 = buildRawLearning(makeExperiment({ experiment_id: 'CREATIVE-200', product_id: 'produto_b', actual_result: { cpa_financeiro: 90, tracking_flags: [] } }), { mechanism: 'z' });
  const { learnings } = buildHypothesisRegistry([rawA1, rawA2, rawB1]);
  const patterns = buildPatterns(learnings);
  assert.equal(patterns.length, 1); // mesma categoria/métrica agrupa junto no pattern (não na hipótese)
  assert.deepEqual(patterns[0].product_ids_observed.sort(), ['produto_a', 'produto_b']);
  assert.equal(patterns[0].cross_product_observations, 1); // 1 observação (produto_b) fora do majoritário (produto_a, 2 obs)
});
