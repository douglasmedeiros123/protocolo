'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateNextCreativeCandidates, PRINCIPAL_TEST_VARIABLES } = require('../src/creative/candidateGenerator');
const { analyzeRealCreatives } = require('../src/creative/builder');
const { buildProductHypothesisKey } = require('../src/learning/canonicalKey');
const { PRODUCT_ID } = require('../config/product');

function realAssets() {
  return analyzeRealCreatives({ hypotheses: [] }).assets;
}

test('generateNextCreativeCandidates: retorna entre 3 e 5 candidatos com dados reais suficientes', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  assert.ok(candidates.length >= 3 && candidates.length <= 5);
});

test('generateNextCreativeCandidates: sem NENHUM asset com amostra suficiente -> retorna vazio, nunca inventa candidato', () => {
  const candidates = generateNextCreativeCandidates({ assets: [{ creative_id: 'X', sample_sufficient: false }], hypotheses: [], productId: null, count: 4 });
  assert.deepEqual(candidates, []);
});

test('EXPLOIT vs EXPLORE: existem os dois modos entre os candidatos gerados', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  const modes = new Set(candidates.map((c) => c.mode));
  assert.ok(modes.has('EXPLOIT'));
  assert.ok(modes.has('EXPLORE'));
});

test('EXPLOIT: parte do melhor sinal atual (mesmo parent do best_current_signal)', () => {
  const assets = realAssets();
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const exploit = candidates.filter((c) => c.mode === 'EXPLOIT');
  const leader = [...assets].filter((a) => a.sample_sufficient).sort((a, b) => b.score_result.creative_score - a.score_result.creative_score)[0];
  for (const c of exploit) assert.equal(c.parent_creative_id, leader.creative_id);
});

test('cada candidato muda EXATAMENTE 1 variável principal (isolamento causal)', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  for (const c of candidates) {
    assert.equal(typeof c.variable_changed, 'string');
    assert.ok(PRINCIPAL_TEST_VARIABLES.includes(c.variable_changed));
    assert.equal(c.preserved_elements.includes(c.variable_changed), false);
  }
});

test('cada candidato tem hipótese explícita completa (variable_changed, metric_expected_to_move, reason, expected_direction)', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  for (const c of candidates) {
    assert.equal(c.hypothesis.variable_changed, c.variable_changed);
    assert.ok(c.hypothesis.metric_expected_to_move);
    assert.ok(c.hypothesis.reason);
    assert.ok(['INCREASE', 'DECREASE'].includes(c.hypothesis.expected_direction));
    assert.match(c.hypothesis.statement, /Se alterarmos/);
  }
});

test('priority_score: 0-100, o melhor candidato do lote vira 100', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  for (const c of candidates) assert.ok(c.priority_score >= 0 && c.priority_score <= 100);
  assert.ok(candidates.some((c) => c.priority_score === 100));
});

test('experiment compatibility: candidato já vem com category=CREATIVE, minimum_evidence, success/failure_condition', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  for (const c of candidates) {
    assert.equal(c.category, 'CREATIVE');
    assert.ok(c.minimum_evidence);
    assert.match(c.success_condition, new RegExp(c.target_metric));
    assert.match(c.failure_condition, new RegExp(c.target_metric));
  }
});

test('prior learning: hipótese PREVIOUSLY_INVALIDATED reduz a confidence do candidato correspondente', () => {
  const assets = realAssets();
  const leader = [...assets].filter((a) => a.sample_sufficient).sort((a, b) => b.score_result.creative_score - a.score_result.creative_score)[0];

  const withoutHistory = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const targetCandidate = withoutHistory.find((c) => c.parent_creative_id === leader.creative_id);

  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CREATIVE', target_metric: targetCandidate.target_metric, mechanism: targetCandidate.variable_changed });
  const invalidatedHypotheses = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category: 'CREATIVE', status: 'INVALIDATED', current_confidence: 20 }];

  const withHistory = generateNextCreativeCandidates({ assets, hypotheses: invalidatedHypotheses, productId: null, count: 4 });
  const penalized = withHistory.find((c) => c.candidate_id === targetCandidate.candidate_id);

  assert.equal(penalized.prior_learning_status, 'PREVIOUSLY_INVALIDATED');
  assert.ok(penalized.confidence < targetCandidate.confidence);
});

test('prior learning: SUPPORTING_EVIDENCE aumenta a confidence do candidato correspondente', () => {
  const assets = realAssets();
  const leader = [...assets].filter((a) => a.sample_sufficient).sort((a, b) => b.score_result.creative_score - a.score_result.creative_score)[0];

  const withoutHistory = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const targetCandidate = withoutHistory.find((c) => c.parent_creative_id === leader.creative_id);

  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CREATIVE', target_metric: targetCandidate.target_metric, mechanism: targetCandidate.variable_changed });
  const supportedHypotheses = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category: 'CREATIVE', status: 'SUPPORTED', current_confidence: 80 }];

  const withHistory = generateNextCreativeCandidates({ assets, hypotheses: supportedHypotheses, productId: null, count: 4 });
  const boosted = withHistory.find((c) => c.candidate_id === targetCandidate.candidate_id);

  assert.equal(boosted.prior_learning_status, 'SUPPORTING_EVIDENCE');
  assert.ok(boosted.confidence >= targetCandidate.confidence);
});

test('cross-product separation: hipótese de OUTRO produto não afeta o prior_learning_status de um candidato', () => {
  const assets = realAssets();
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const target = candidates[0];

  const key = buildProductHypothesisKey('outro_produto_diferente', { category: 'CREATIVE', target_metric: target.target_metric, mechanism: target.variable_changed });
  const otherProductHypotheses = [{ product_hypothesis_key: key, product_id: 'outro_produto_diferente', category: 'CREATIVE', status: 'INVALIDATED', current_confidence: 10 }];

  const stillNoEvidence = generateNextCreativeCandidates({ assets, hypotheses: otherProductHypotheses, productId: null, count: 4 });
  assert.equal(stillNoEvidence.find((c) => c.candidate_id === target.candidate_id).prior_learning_status, 'NO_PRIOR_EVIDENCE');
});

test('determinismo: rodar duas vezes com o mesmo estado produz exatamente os mesmos candidatos', () => {
  const assets = realAssets();
  const a = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const b = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  assert.deepEqual(a, b);
});

test('nenhum candidato gera imagem/asset real — new_value é sempre null, é um brief', () => {
  const candidates = generateNextCreativeCandidates({ assets: realAssets(), hypotheses: [], productId: null, count: 4 });
  for (const c of candidates) {
    assert.equal(c.new_value, null);
    assert.ok(c.creative_brief);
    assert.equal(typeof c.creative_brief.objective, 'string');
  }
});
