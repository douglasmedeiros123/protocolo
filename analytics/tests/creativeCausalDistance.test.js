'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCausalDistance, CAUSAL_DISTANCE_MULTIPLIER, TARGET_METRIC_SOURCE, generateNextCreativeCandidates } = require('../src/creative/candidateGenerator');
const { analyzeRealCreatives } = require('../src/creative/builder');

test('causal_distance: hook -> ctr é DIRECT (o hook decide o thumbstop)', () => {
  assert.equal(resolveCausalDistance('hook', 'ctr'), 'DIRECT');
});

test('causal_distance: proof -> lpv_to_checkout_rate é DIRECT', () => {
  assert.equal(resolveCausalDistance('proof', 'lpv_to_checkout_rate'), 'DIRECT');
});

test('causal_distance: hook -> cost_per_lpv é INTERMEDIATE (passa por CTR antes)', () => {
  assert.equal(resolveCausalDistance('hook', 'cost_per_lpv'), 'INTERMEDIATE');
});

test('causal_distance: cta -> checkout_to_meta_purchase_rate é INDIRECT (muitos passos entre o CTA do anúncio e a conclusão da compra)', () => {
  assert.equal(resolveCausalDistance('cta', 'checkout_to_meta_purchase_rate'), 'INDIRECT');
});

test('causal_distance: promise -> roas_marketing é INDIRECT (ROAS agrega o funil inteiro)', () => {
  assert.equal(resolveCausalDistance('promise', 'roas_marketing'), 'INDIRECT');
});

test('causal_distance: combinação não mapeada cai no default conservador INTERMEDIATE, nunca assume DIRECT', () => {
  assert.equal(resolveCausalDistance('objection', 'ctr'), 'INTERMEDIATE');
});

test('causal_distance: DIRECT/INTERMEDIATE/INDIRECT são os 3 únicos valores', () => {
  assert.deepEqual(Object.keys(CAUSAL_DISTANCE_MULTIPLIER).sort(), ['DIRECT', 'INDIRECT', 'INTERMEDIATE'].sort());
});

test('causal_distance: multiplicador é estritamente decrescente (DIRECT > INTERMEDIATE > INDIRECT)', () => {
  assert.ok(CAUSAL_DISTANCE_MULTIPLIER.DIRECT > CAUSAL_DISTANCE_MULTIPLIER.INTERMEDIATE);
  assert.ok(CAUSAL_DISTANCE_MULTIPLIER.INTERMEDIATE > CAUSAL_DISTANCE_MULTIPLIER.INDIRECT);
});

test('hipótese INDIRECT recebe confidence/priority MENOR que uma hipótese DIRECT equivalente', () => {
  const assets = analyzeRealCreatives({ hypotheses: [] }).assets;
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const direct = candidates.filter((c) => c.causal_distance === 'DIRECT');
  const indirect = candidates.filter((c) => c.causal_distance === 'INDIRECT');
  assert.ok(direct.length > 0 && indirect.length > 0, 'esperava pelo menos 1 candidato DIRECT e 1 INDIRECT nos dados reais');
  const avgDirectConfidence = direct.reduce((s, c) => s + c.confidence, 0) / direct.length;
  const avgIndirectConfidence = indirect.reduce((s, c) => s + c.confidence, 0) / indirect.length;
  assert.ok(avgIndirectConfidence < avgDirectConfidence);
});

test('target_metric_source: TODO candidato declara explicitamente que a métrica-alvo é de plataforma (Meta), nunca financeira', () => {
  const assets = analyzeRealCreatives({ hypotheses: [] }).assets;
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  assert.equal(TARGET_METRIC_SOURCE, 'META_PLATFORM');
  for (const c of candidates) {
    assert.equal(c.target_metric_source, 'META_PLATFORM');
    assert.equal(c.expected_effect.target_metric_source, 'META_PLATFORM');
  }
});

test('candidato que mira roas_marketing (Candidate #3 original) fica corretamente rotulado como métrica de plataforma, nunca como financial ROAS', () => {
  const assets = analyzeRealCreatives({ hypotheses: [] }).assets;
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const roasCandidate = candidates.find((c) => c.target_metric === 'roas_marketing');
  if (roasCandidate) {
    assert.equal(roasCandidate.target_metric_source, 'META_PLATFORM');
    assert.match(roasCandidate.expected_effect.note, /NÃO é uma projeção financeira nem financial_roas/);
  }
});

test('cadeia causal do CTA -> checkout_to_meta_purchase_rate é explicada por extenso (não é uma classificação sem justificativa)', () => {
  const assets = analyzeRealCreatives({ hypotheses: [] }).assets;
  const candidates = generateNextCreativeCandidates({ assets, hypotheses: [], productId: null, count: 4 });
  const ctaCandidate = candidates.find((c) => c.variable_changed === 'cta');
  if (ctaCandidate) {
    assert.ok(ctaCandidate.causal_chain_explanation.length > 20);
    assert.match(ctaCandidate.causal_chain_explanation, /checkout|fricção|preço|confiança/i);
  }
});
