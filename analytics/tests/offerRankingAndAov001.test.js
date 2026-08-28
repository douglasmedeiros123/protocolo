'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { rankOfferCandidates, computeTieBreakComponents, TIE_BREAK_FACTOR_ORDER } = require('../src/offer/ranking');
const { analyzeAov001, detectBundledVariables } = require('../src/offer/aov001Analysis');
const { analyzeOffer } = require('../src/offer/builder');

function candidateFixture(overrides = {}) {
  return {
    candidate_id: 'OFFER-CAND-X',
    priority_score: 100,
    causality: { status: 'VALID' },
    evidence_sources: [{ type: 'X', source: 'x' }],
    confidence: 0.6,
    implementation_cost: 'LOW',
    information_gain_per_real: 40,
    learning_value: 'MEDIUM',
    risk: 1,
    ...overrides,
  };
}

test('tie-break: resultado NÃO depende da ordem do array de entrada', () => {
  const a = candidateFixture({ candidate_id: 'OFFER-CAND-A' });
  const b = candidateFixture({ candidate_id: 'OFFER-CAND-B' });
  const r1 = rankOfferCandidates([a, b]);
  const r2 = rankOfferCandidates([b, a]);
  assert.deepEqual(r1.ranking.map((c) => c.candidate_id), r2.ranking.map((c) => c.candidate_id));
});

test('tie-break: candidate_id NUNCA é evidência de mérito — só ordena apresentação de um empate real', () => {
  const a = candidateFixture({ candidate_id: 'OFFER-CAND-Z' });
  const b = candidateFixture({ candidate_id: 'OFFER-CAND-A' });
  const r = rankOfferCandidates([a, b]);
  assert.equal(r.decision_tie, true);
  assert.deepEqual(r.decision_tie_candidates.sort(), ['OFFER-CAND-A', 'OFFER-CAND-Z']);
});

test('DECISION_TIE: quando todos os fatores são idênticos, declara empate explícito', () => {
  const a = candidateFixture({ candidate_id: 'A' });
  const b = candidateFixture({ candidate_id: 'B' });
  const r = rankOfferCandidates([a, b]);
  assert.equal(r.decision_tie, true);
  assert.match(r.ranking[0].final_rank_reason, /DECISION_TIE/);
});

test('evidence_quality maior vence em empate de priority_score, sem precisar de DECISION_TIE', () => {
  const strong = candidateFixture({ candidate_id: 'A', evidence_sources: [{ type: 'X', source: '1' }, { type: 'Y', source: '2' }] });
  const weak = candidateFixture({ candidate_id: 'B', evidence_sources: [{ type: 'X', source: '1' }] });
  const r = rankOfferCandidates([weak, strong]);
  assert.equal(r.ranking[0].candidate_id, 'A');
  assert.equal(r.decision_tie, false);
});

test('ordem de fatores documentada (item 52, mesmo padrão do CRO)', () => {
  assert.deepEqual(TIE_BREAK_FACTOR_ORDER, [
    'priority_score', 'causal_strength', 'evidence_quality', 'confidence',
    'implementation_cost_rank', 'information_gain_per_real', 'learning_value_rank', 'risk_rank',
  ]);
});

test('AOV-001 analysis: detecta múltiplas variáveis bundladas (BUMP_COPY + BUNDLE_DISCOUNT)', () => {
  const experiment = require('../data/experiments/AOV-001.json');
  const r = analyzeAov001(experiment);
  assert.equal(r.is_multi_variable, true);
  assert.ok(r.bundled_variables_detected.some((b) => b.variable === 'BUMP_COPY'));
  assert.ok(r.bundled_variables_detected.some((b) => b.variable === 'BUNDLE_DISCOUNT'));
});

test('AOV-001 analysis: NUNCA altera o objeto do experimento recebido', () => {
  const experiment = require('../data/experiments/AOV-001.json');
  const before = JSON.stringify(experiment);
  analyzeAov001(experiment);
  assert.equal(JSON.stringify(experiment), before);
});

test('AOV-001 analysis: recomenda o componente EXISTENTE (BUMP_COPY) sobre o NOVO (BUNDLE_DISCOUNT) só porque a causalidade real diferencia — não hardcoded', () => {
  const experiment = require('../data/experiments/AOV-001.json');
  const r = analyzeAov001(experiment);
  assert.equal(r.recommended_variable_to_isolate_first.variable, 'BUMP_COPY');
  assert.equal(r.recommended_variable_to_isolate_first.status, 'VALID');
});

test('AOV-001 analysis: identifica que o budget real reprova no capital_cycle simulado', () => {
  const experiment = require('../data/experiments/AOV-001.json');
  const r = analyzeAov001(experiment);
  assert.equal(r.is_testable_at_current_cycle, false);
  assert.match(r.refinement_recommendation, /reprova no capital_cycle/);
});

test('AOV-001 analysis: experimento inexistente retorna found:false, nunca inventa análise', () => {
  assert.equal(analyzeAov001(null).found, false);
});

test('detectBundledVariables: texto de 1 variável só não é multi-variable', () => {
  assert.equal(detectBundledVariables('reforçarmos a oferta de order bump').length, 1);
});

test('integração real: builder.js gera ranking + decision_tie coerentes contra dados reais', () => {
  const r = analyzeOffer({});
  assert.ok(Array.isArray(r.candidates));
  assert.ok(r.candidates.length >= 3);
  assert.equal('decision_tie' in r, true);
  for (const c of r.candidates) assert.ok('rank' in c && 'tie_break_components' in c);
});

test('idempotência: analyzeOffer() com o mesmo estado real produz o mesmo ranking', () => {
  const a = analyzeOffer({});
  const b = analyzeOffer({});
  assert.deepEqual(a.candidates.map((c) => ({ id: c.candidate_id, rank: c.rank })), b.candidates.map((c) => ({ id: c.candidate_id, rank: c.rank })));
  assert.equal(a.decision_tie, b.decision_tie);
});
