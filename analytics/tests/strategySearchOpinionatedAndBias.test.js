'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formRecommendation } = require('../src/strategy-search/recommendationEngine');
const { rankArchitectures } = require('../src/strategy-search/comparisonAndRanking');
const { analyzeStrategy } = require('../src/strategy-search/builder');

function candidateFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-X', family: 'VSL', is_current: false, distance: 'MEDIUM', reversibility: 'REVERSIBLE',
    tracking_readiness: 'PARTIAL', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'INCREASE_COMPREHENSION', strategic_diversification_value: false,
    evidence_basis: [{ type: 'PRODUCT_SPECIFIC_EVIDENCE', statement: 'x' }],
    why_generated: { reason: 'economic_gap' }, unknowns: [], risks: [],
    architecture_hypothesis: 'hipótese X.',
    ...overrides,
  };
}
function currentFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-CURRENT', family: 'DIRECT_TO_OFFER', is_current: true, distance: 'LOW', reversibility: 'REVERSIBLE',
    tracking_readiness: 'READY', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'OTHER', strategic_diversification_value: false,
    evidence_basis: [{ type: 'OBSERVED_EVIDENCE', statement: 'y' }],
    why_generated: null, unknowns: [], risks: [],
    ...overrides,
  };
}

// ===== item 101 — OPINIONATED INTELLIGENCE =====

test('item 101: ranking defensável com alternativa forte -> recomendação obrigatória, nunca só opções', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ primary_mechanism: 'INCREASE_AOV' })]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'ARCH-CURRENT', counterfactual: { answer: 'UNKNOWN' }, preMortem: {} });
  assert.notEqual(rec.recommendation_type, 'NO_DEFENSIBLE_PREFERENCE');
  assert.ok(rec.recommended_architecture_id);
});

test('item 101: recomendação NUNCA é só uma lista de opções — sempre tem recommended_architecture_id quando defensável', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture()]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_VARIANT', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.equal(typeof rec.recommended_architecture_id, 'string');
  assert.equal('options' in rec, false);
});

test('item 101/5: confidence baixa AINDA retorna recomendação — nunca escondida atrás de status vazio', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ automation_fitness: 'LOW', tracking_readiness: 'NOT_READY' })]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_VARIANT', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.ok(['LOW', 'VERY_LOW', 'MEDIUM', 'HIGH'].includes(rec.confidence));
  assert.ok(rec.recommended_architecture_id);
});

test('item 101/6: verdadeira incomparabilidade (empate em TODOS os 14 fatores) -> NO_DEFENSIBLE_PREFERENCE', () => {
  const a = candidateFixture({ architecture_id: 'ARCH-A' });
  const b = candidateFixture({ architecture_id: 'ARCH-B' });
  const rank = rankArchitectures([a, b]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.equal(rec.recommendation_type, 'NO_DEFENSIBLE_PREFERENCE');
  assert.ok(rec.what_would_break_the_tie.length > 0); // mesmo aqui, recomenda o que coletar
});

test('item 101: preferência humana NUNCA é usada como input de ranking — nenhum parâmetro de "gosto" existe na função', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture()]);
  assert.equal('human_preference' in rank.ranking[0], false);
});

test('item 101/4: fronteira de autorização é separada de estratégia — recomendação não pede opinião, só autorização de ação material (validado via ausência de campo "ask_human_opinion")', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture()]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.equal('ask_human_opinion' in rec, false);
});

// ===== item 102 — BIAS =====

test('item 102: arquitetura atual NÃO recebe bônus de performance por incumbência — economic_relevance da atual é derivado do mecanismo real (OTHER=0), não inflado', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ primary_mechanism: 'INCREASE_AOV' })]);
  const current = rank.ranking.find((r) => r.is_current);
  assert.equal(current.comparison_dimensions.economic_relevance_rank, 0);
});

test('item 102: vantagem de implementação é permitida — atual tem implementation_cost_rank/measurement_capital_rank máximos, mas SÓ nessas 2 dimensões', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture()]);
  const current = rank.ranking.find((r) => r.is_current);
  assert.equal(current.comparison_dimensions.implementation_cost_rank, 3);
  assert.equal(current.comparison_dimensions.measurement_capital_rank, 3);
  assert.equal(current.comparison_dimensions.economic_relevance_rank, 0); // não vaza pra outras dimensões
});

test('item 102: arquitetura nova NÃO recebe bônus de novidade — nenhuma dimensão de comparação usa "is_new" ou "family" como critério de mérito', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture()]);
  const dims = Object.keys(rank.ranking[0].comparison_dimensions);
  assert.equal(dims.includes('novelty_rank'), false);
  assert.equal(dims.includes('family_rank'), false);
});

test('item 102: sofisticação não recebe bônus — VSL/QUIZ/ADVERTORIAL não têm peso extra na tabela de mecanismo econômico só por serem essas famílias', () => {
  const vsl = rankArchitectures([currentFixture(), candidateFixture({ family: 'VSL', primary_mechanism: 'INCREASE_COMPREHENSION' })]);
  const direct = rankArchitectures([currentFixture(), candidateFixture({ family: 'DIRECT_TO_OFFER', primary_mechanism: 'INCREASE_COMPREHENSION' })]);
  assert.equal(vsl.ranking.find((r) => !r.is_current).comparison_dimensions.economic_relevance_rank, direct.ranking.find((r) => !r.is_current).comparison_dimensions.economic_relevance_rank);
});

test('item 102: evidência PODE fazer a arquitetura atual vencer (sem bônus, mas também sem penalidade artificial)', () => {
  const weakChallenger = candidateFixture({ primary_mechanism: 'OTHER', tracking_readiness: 'NOT_READY', automation_fitness: 'LOW', why_generated: { reason: 'strategic_diversification' }, evidence_basis: [] });
  const rank = rankArchitectures([currentFixture(), weakChallenger]);
  assert.equal(rank.ranking[0].is_current, true);
});

test('item 102: evidência PODE fazer o challenger vencer (sem exigir bônus artificial pra isso)', () => {
  const strongChallenger = candidateFixture({ primary_mechanism: 'INCREASE_AOV', why_generated: { reason: 'missing_monetization' } });
  const rank = rankArchitectures([currentFixture(), strongChallenger]);
  assert.equal(rank.ranking[0].is_current, false);
});

test('integração real: recomendação real não é NO_DEFENSIBLE_PREFERENCE hoje (há base defensável real)', () => {
  const r = analyzeStrategy({});
  assert.notEqual(r.analysis.recommendation.recommendation_type, 'NO_DEFENSIBLE_PREFERENCE');
  assert.ok(r.analysis.recommendation.recommended_architecture_id);
});
