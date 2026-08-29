'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formRecommendation } = require('../src/strategy-search/recommendationEngine');
const { rankArchitectures } = require('../src/strategy-search/comparisonAndRanking');
const { buildTrackingContractRequirements, buildClaritySurfacesRequired, evaluateTrackingReadiness } = require('../src/strategy-search/architectureProperties');
const { buildPostMortemTemplate } = require('../src/strategy-search/counterfactualAndPremortem');
const { evaluateArchitectureTestEligibility } = require('../src/strategy-search/testEligibility');
const { analyzeStrategy } = require('../src/strategy-search/builder');

function candidateFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-X', family: 'VSL', is_current: false, distance: 'MEDIUM', reversibility: 'REVERSIBLE',
    tracking_readiness: 'PARTIAL', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'INCREASE_COMPREHENSION', strategic_diversification_value: false,
    evidence_basis: [], why_generated: { reason: 'economic_gap' }, unknowns: [], risks: [],
    architecture_hypothesis: 'h.',
    ...overrides,
  };
}
function currentFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-CURRENT', family: 'DIRECT_TO_OFFER', is_current: true, distance: 'LOW', reversibility: 'REVERSIBLE',
    tracking_readiness: 'READY', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'OTHER', strategic_diversification_value: false,
    evidence_basis: [], why_generated: null, unknowns: [], risks: [],
    ...overrides,
  };
}

// ===== item 109 — TESTES FALLBACK =====

test('item 109: vencedor tem fallback', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ primary_mechanism: 'INCREASE_AOV' }), candidateFixture({ architecture_id: 'ARCH-Y', primary_mechanism: 'REDUCE_CPA' })]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: rank.ranking[1].architecture_id, counterfactual: {}, preMortem: {} });
  assert.ok(rec.fallback_architecture_id);
});

test('item 109: fallback difere do vencedor', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ primary_mechanism: 'INCREASE_AOV' }), candidateFixture({ architecture_id: 'ARCH-Y', primary_mechanism: 'REDUCE_CPA' })]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: rank.ranking[1].architecture_id, counterfactual: {}, preMortem: {} });
  assert.notEqual(rec.fallback_architecture_id, rec.recommended_architecture_id);
});

test('item 109: sem fallback real disponível, nunca inventa um — usa NO_FALLBACK_AVAILABLE literal', () => {
  const rank = rankArchitectures([currentFixture()]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'OPTIMIZE_CURRENT', hasCompletedComparativeExperiment: false, fallbackId: 'NO_FALLBACK_AVAILABLE', counterfactual: {}, preMortem: {} });
  assert.equal(rec.fallback_architecture_id, 'NO_FALLBACK_AVAILABLE');
});

test('item 109: falha de teste atualiza aprendizado, nunca declara morte automática de produto (post-mortem template)', () => {
  const template = buildPostMortemTemplate({ architecture_id: 'ARCH-X' });
  assert.match(template.what_should_not_be_concluded, /produto é inviável/);
  assert.equal(template.status, 'TEMPLATE_NOT_YET_APPLICABLE');
});

// ===== item 110 — TESTES TRACKING PLACEHOLDER =====

test('item 110: arquitetura tem tracking_contract_requirements com todos os 6 campos do item 75', () => {
  const c = buildTrackingContractRequirements(['AD', 'SALES_PAGE', 'CHECKOUT']);
  for (const f of ['stages', 'events', 'identifiers', 'revenue_events', 'attribution_requirements', 'behavioral_measurement_surfaces']) assert.ok(f in c);
});

test('item 110: UTM_CONTINUITY é um requisito explícito', () => {
  const c = buildTrackingContractRequirements(['AD', 'CHECKOUT']);
  assert.ok(c.attribution_requirements.includes('UTM_CONTINUITY'));
});

test('item 110: identity continuity é um placeholder (session_id/click_id/transaction_id/customer_id), nunca IDs reais afirmados', () => {
  const c = buildTrackingContractRequirements(['CHECKOUT']);
  assert.deepEqual(c.identifiers.sort(), ['click_id', 'customer_id', 'session_id', 'transaction_id'].sort());
  assert.match(c.note, /requisitos futuros/);
});

test('item 110: revenue_event requirement presente quando há CHECKOUT/ORDER_BUMP/etc', () => {
  const c = buildTrackingContractRequirements(['CHECKOUT', 'ORDER_BUMP']);
  assert.deepEqual(c.revenue_events.sort(), ['CHECKOUT', 'ORDER_BUMP'].sort());
});

test('item 110: Clarity só pra superfícies observáveis/controláveis — CHECKOUT (Hotmart externo) nunca entra', () => {
  const surfaces = buildClaritySurfacesRequired(['SALES_PAGE', 'CHECKOUT', 'VSL']);
  assert.equal(surfaces.includes('CHECKOUT'), false);
  assert.ok(surfaces.includes('SALES_PAGE'));
});

test('item 110: arquitetura NOT_READY não pode receber capital de teste ainda (eligibility != READY)', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'NOT_READY', mvaTest: { estimated_measurement_capital: 'NOT_ESTIMABLE' }, isCurrent: false });
  assert.notEqual(e.eligibility, 'READY');
});

test('integração real: todo challenger real tem tracking_contract_requirements presente', () => {
  const r = analyzeStrategy({});
  for (const c of r.analysis.challengers) assert.ok(c.tracking_contract_requirements);
});
