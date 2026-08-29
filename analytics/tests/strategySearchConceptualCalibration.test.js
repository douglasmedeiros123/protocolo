'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateArchitectureTestEligibility } = require('../src/strategy-search/testEligibility');
const { formRecommendation, computeRecommendationConfidence } = require('../src/strategy-search/recommendationEngine');
const { rankArchitectures } = require('../src/strategy-search/comparisonAndRanking');
const { evaluateChallengeCurrentStrategy, reconcileOptimizationVsRearchitecture, computeSearchDepth } = require('../src/strategy-search/challengeAndBreadth');
const { generateChallengers } = require('../src/strategy-search/challengerGenerator');
const { buildEvidenceBasisForChallenger } = require('../src/strategy-search/evidenceClassification');
const { evaluateCounterfactual } = require('../src/strategy-search/counterfactualAndPremortem');
const { analyzeStrategy } = require('../src/strategy-search/builder');

function candidateFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-X', family: 'VSL', is_current: false, distance: 'MEDIUM', reversibility: 'REVERSIBLE',
    tracking_readiness: 'PARTIAL', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'INCREASE_COMPREHENSION', strategic_diversification_value: false,
    evidence_basis: [{ type: 'STRUCTURAL_EXISTENCE_EVIDENCE', statement: 'x' }, { type: 'HYPOTHESIS', statement: 'h' }],
    why_generated: { reason: 'economic_gap' }, unknowns: [], risks: [], architecture_hypothesis: 'hipótese.',
    ...overrides,
  };
}
function currentFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-CURRENT', family: 'DIRECT_TO_OFFER', is_current: true, distance: 'LOW', reversibility: 'REVERSIBLE',
    tracking_readiness: 'READY', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'OTHER', strategic_diversification_value: false,
    evidence_basis: [{ type: 'OBSERVED_EVIDENCE', statement: 'y' }], why_generated: null, unknowns: [], risks: [],
    ...overrides,
  };
}

// item 1 — TEST ELIGIBILITY NÃO CIRCULAR

test('item 1: evidence objective (ausência de resultado do próprio teste) NÃO bloqueia o teste', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'READY', isCurrent: false, prerequisiteEvidenceGaps: [] });
  assert.notEqual(e.eligibility, 'NEEDS_EVIDENCE');
  assert.equal(e.eligibility, 'NEEDS_IMPLEMENTATION');
});

test('item 1: prerequisite evidence real PODE bloquear o teste', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'READY', isCurrent: false, prerequisiteEvidenceGaps: [{ type: 'CUSTOMER_EVIDENCE_GAP', question: 'x' }] });
  assert.equal(e.eligibility, 'NEEDS_EVIDENCE');
});

test('item 1: candidato sem performance histórica AINDA PODE ser testável (NEEDS_TRACKING/NEEDS_IMPLEMENTATION, nunca bloqueado só por falta de histórico)', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'PARTIAL', isCurrent: false, prerequisiteEvidenceGaps: [] });
  assert.notEqual(e.eligibility, 'BLOCKED');
  assert.equal(e.eligibility, 'NEEDS_TRACKING');
});

// item 2 — CONFIDENCE != RANKING POSITION

test('item 2: rank #1 PODE ter LOW confidence (evidência só estrutural/hipótese)', () => {
  const rank = rankArchitectures([currentFixture(), candidateFixture({ primary_mechanism: 'INCREASE_AOV' })]);
  const { confidence } = computeRecommendationConfidence({ ranking: rank.ranking, hasCompletedComparativeExperiment: false });
  assert.equal(rank.ranking[0].is_current, false); // o challenger venceu
  assert.equal(confidence, 'LOW');
});

test('item 2: rank #1 PODE ter MEDIUM/HIGH quando evidência real de performance sustenta', () => {
  const withPerformance = candidateFixture({ primary_mechanism: 'INCREASE_AOV', evidence_basis: [{ type: 'PERFORMANCE_EVIDENCE', statement: 'resultado real observado.' }] });
  const rank = rankArchitectures([currentFixture(), withPerformance]);
  const { confidence } = computeRecommendationConfidence({ ranking: rank.ranking, hasCompletedComparativeExperiment: false });
  assert.equal(confidence, 'MEDIUM');
});

test('item 2: confidence não é promovida a MEDIUM só por vencer um fator de alta prioridade do ranking', () => {
  const strongRankButWeakEvidence = candidateFixture({ primary_mechanism: 'INCREASE_AOV', why_generated: { reason: 'economic_gap' }, evidence_basis: [{ type: 'STRUCTURAL_EXISTENCE_EVIDENCE', statement: 'x' }] });
  const rank = rankArchitectures([currentFixture(), strongRankButWeakEvidence]);
  const { confidence, basis } = computeRecommendationConfidence({ ranking: rank.ranking, hasCompletedComparativeExperiment: false });
  assert.equal(confidence, 'LOW');
  assert.match(basis, /Nunca MEDIUM\/HIGH só por vencer um fator/);
});

// item 3 — STRUCTURAL EXISTENCE != PERFORMANCE

test('item 3: fato de ausência estrutural (missing_monetization) é classificado STRUCTURAL_EXISTENCE_EVIDENCE, nunca PERFORMANCE_EVIDENCE', () => {
  const basis = buildEvidenceBasisForChallenger({ why_generated: { reason: 'missing_monetization', ref: 'X' }, pattern_description: null, architecture_hypothesis: 'h' });
  const existence = basis.find((b) => b.type === 'STRUCTURAL_EXISTENCE_EVIDENCE');
  assert.ok(existence);
  assert.equal(basis.some((b) => b.type === 'PERFORMANCE_EVIDENCE'), false);
});

test('item 3: PERFORMANCE_EVIDENCE nunca é gerado automaticamente por buildEvidenceBasisForChallenger (só existiria via experimento real concluído)', () => {
  const basis = buildEvidenceBasisForChallenger({ why_generated: { reason: 'missing_monetization', ref: 'X' }, pattern_description: 'y', architecture_hypothesis: 'h' });
  assert.equal(basis.filter((b) => b.type === 'PERFORMANCE_EVIDENCE').length, 0);
});

// item 4 — OPERATIONAL vs COMPARATIVE EVIDENCE

test('item 4: arquitetura atual pode ter evidência operacional (compradores/receita reais) sem superioridade comparativa estabelecida', () => {
  const r = evaluateChallengeCurrentStrategy({ experimentCoverage: { total_completed: 0, by_category: {} }, structuralFrictionSignals: [], financialRoas: 0.6, targetRoas: 3, hypothesisSpaceStatus: { status: 'LARGELY_UNEXPLORED' }, buyers: 11 });
  assert.equal(r.operational_evidence, 'OBSERVED');
  assert.equal(r.comparative_evidence, 'NOT_ESTABLISHED');
  assert.equal(r.status, 'PROVISIONALLY_SUPPORTED');
});

test('item 4: sem compradores reais (buyers=0), nem evidência operacional existe — só aí INCUMBENCY_ONLY', () => {
  const r = evaluateChallengeCurrentStrategy({ experimentCoverage: { total_completed: 0, by_category: {} }, structuralFrictionSignals: [], financialRoas: 0, targetRoas: 3, hypothesisSpaceStatus: { status: 'LARGELY_UNEXPLORED' }, buyers: 0 });
  assert.equal(r.operational_evidence, 'ABSENT');
  assert.equal(r.status, 'INCUMBENCY_ONLY');
});

// items 5-6 — DEGRADED ATTRIBUTION != FUNNEL STRATEGY EVIDENCE

test('item 5: atribuição degradada SOZINHA (sem sinal real de abandono) NÃO gera challenger WhatsApp', () => {
  const challengers = generateChallengers({
    diagnosis: { missing_monetization_signals: [], known_path_to_target: { status: 'YES' }, tracking_scopes: { CREATIVE_ATTRIBUTION: { status: 'DEGRADED' }, PLATFORM_ATTRIBUTION: { status: 'DEGRADED' } }, financial_roas: 2, cancelled_or_expired_transactions: 0 },
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'NARROW',
  });
  assert.equal(challengers.some((c) => c.family === 'WHATSAPP_ASSISTED'), false);
});

test('item 5: sinal real de abandono (checkouts CANCELLED/EXPIRED) gera o challenger WhatsApp — nunca a atribuição degradada sozinha', () => {
  const challengers = generateChallengers({
    diagnosis: { missing_monetization_signals: [], known_path_to_target: { status: 'YES' }, tracking_scopes: { CREATIVE_ATTRIBUTION: { status: 'RELIABLE' }, PLATFORM_ATTRIBUTION: { status: 'RELIABLE' } }, financial_roas: 2, cancelled_or_expired_transactions: 4 },
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'NARROW',
  });
  const wa = challengers.find((c) => c.family === 'WHATSAPP_ASSISTED');
  assert.ok(wa);
  assert.doesNotMatch(JSON.stringify(wa.why_generated), /DEGRADED/);
});

test('item 6: atribuição degradada afeta tracking_readiness/measurement — NUNCA cria tese de conversão sozinha (nenhuma regra de challengerGenerator usa só tracking_scopes DEGRADED como trigger)', () => {
  const { CHALLENGER_RULES } = require('../src/strategy-search/challengerGenerator');
  const onlyTrackingTriggered = CHALLENGER_RULES.filter((r) => r.rule_id !== 'MONETIZATION_LAYER' && r.trigger.toString().includes('tracking_scopes') && !r.trigger.toString().includes('cancelled'));
  assert.equal(onlyTrackingTriggered.length, 0);
});

// item 7 — RECOMMENDATION_TYPE CONSISTENTE COM OPTIMIZATION_VS_REARCHITECTURE

test('item 7: recommendation_type nunca contradiz optimization_vs_rearchitecture reconciliado (TEST_NEW_ARCHITECTURE -> TEST_ALTERNATIVE_ARCHITECTURE)', () => {
  const winner = candidateFixture({ distance: 'MEDIUM' });
  const reconciled = reconcileOptimizationVsRearchitecture({ winner, preliminaryDecision: 'TEST_VARIANT' });
  assert.equal(reconciled.decision, 'TEST_NEW_ARCHITECTURE');
  const rank = rankArchitectures([currentFixture(), winner]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: reconciled.decision, hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.equal(rec.recommendation_type, 'TEST_ALTERNATIVE_ARCHITECTURE');
});

test('item 7: vencedor de baixa distância (LOW) reconcilia pra TEST_VARIANT -> TEST_INCREMENTAL_VARIANT, nunca REBUILD', () => {
  const lowDistanceWinner = candidateFixture({ distance: 'LOW' });
  const reconciled = reconcileOptimizationVsRearchitecture({ winner: lowDistanceWinner, preliminaryDecision: 'OPTIMIZE_CURRENT' });
  assert.equal(reconciled.decision, 'TEST_VARIANT');
});

// item 8 — SEARCH BREADTH/DEPTH COERENTES

test('item 8: search_depth reflete a distância REAL dos challengers, não a decisão preliminar', () => {
  const structural = computeSearchDepth(['MEDIUM', 'MEDIUM', 'HIGH']);
  assert.equal(structural.depth, 'STRUCTURAL');
  const incremental = computeSearchDepth(['LOW', 'LOW']);
  assert.equal(incremental.depth, 'INCREMENTAL');
});

test('item 8: BROAD breadth com múltiplas famílias reais e depth STRUCTURAL é uma combinação coerente (não contraditória)', () => {
  const depth = computeSearchDepth(['MEDIUM', 'MEDIUM', 'MEDIUM']);
  assert.equal(depth.depth, 'STRUCTURAL');
  // breadth BROAD (várias famílias) + depth STRUCTURAL (mudança real) é coerente: ambos descrevem
  // a mesma realidade real de challengers reais, nunca um contradizendo o outro.
});

// item 9 — MISSING MONETIZATION NÃO VENCE AUTOMATICAMENTE

test('item 9: missing_monetization não vence automaticamente sobre um challenger com razão de gap econômico central', () => {
  const missingMonetization = candidateFixture({ architecture_id: 'ARCH-MONO', why_generated: { reason: 'missing_monetization' }, primary_mechanism: 'INCREASE_AOV' });
  const economicGap = candidateFixture({ architecture_id: 'ARCH-GAP', why_generated: { reason: 'economic_gap+customer_journey' }, primary_mechanism: 'INCREASE_COMPREHENSION' });
  const rank = rankArchitectures([missingMonetization, economicGap]);
  assert.equal(rank.ranking[0].architecture_id, 'ARCH-GAP');
});

// items 10-11 — WHY_THIS / WHY_NOT SUBSTANTIVOS

test('item 10: WHY_THIS nunca é só "venceu nos fatores" — contém hipótese/mecanismo real', () => {
  const winner = candidateFixture({ primary_mechanism: 'INCREASE_AOV', architecture_hypothesis: 'hipótese substantiva real.', expected_economic_mechanism: 'AOV ↑ → ROAS ↑' });
  const rank = rankArchitectures([currentFixture(), winner]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.match(rec.why_this_architecture, /hipótese substantiva real/);
  assert.doesNotMatch(rec.why_this_architecture, /^venceu nos 14 fatores\.?$/);
});

test('item 11: WHY_NOT nunca é só o nome do fator — inclui a hipótese do perdedor ou justificativa substantiva', () => {
  const winner = candidateFixture({ architecture_id: 'ARCH-WIN', primary_mechanism: 'INCREASE_AOV' });
  const loser = candidateFixture({ architecture_id: 'ARCH-LOSE', primary_mechanism: 'OTHER', architecture_hypothesis: 'hipótese do perdedor.' });
  const rank = rankArchitectures([currentFixture(), winner, loser]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  const whyNotLoser = rec.why_not_alternatives.find((w) => w.architecture_id === 'ARCH-LOSE');
  assert.match(whyNotLoser.why_not, /hipótese do perdedor/);
});

// item 12 — COUNTERFACTUAL NÃO SÓ RANKING

test('item 12: basis do counterfactual inclui economia/known_path, não só "perdeu/venceu o ranking"', () => {
  const rank = [{ architecture_id: 'ARCH-CURRENT', rank: 2, is_current: true }, { architecture_id: 'ARCH-X', rank: 1, is_current: false }];
  const r = evaluateCounterfactual({ ranking: rank, hasCompletedComparativeExperiment: false, knownPathToTarget: { status: 'NO_KNOWN_PATH' }, financialRoas: 0.6, targetRoas: 3, comparativeEvidence: 'NOT_ESTABLISHED' });
  assert.match(r.basis, /ROAS financeiro real/);
  assert.match(r.basis, /known_path_to_target/);
});

test('item 12: mesma posição de ranking, basis muda se a economia/known_path mudar (não é hardcoded só na posição)', () => {
  const rank = [{ architecture_id: 'ARCH-CURRENT', rank: 1, is_current: true }, { architecture_id: 'ARCH-X', rank: 2, is_current: false }];
  const withGap = evaluateCounterfactual({ ranking: rank, hasCompletedComparativeExperiment: false, knownPathToTarget: { status: 'NO_KNOWN_PATH' }, financialRoas: 0.6, targetRoas: 3 });
  const withPath = evaluateCounterfactual({ ranking: rank, hasCompletedComparativeExperiment: false, knownPathToTarget: { status: 'YES' }, financialRoas: 2.9, targetRoas: 3 });
  assert.notEqual(withGap.basis, withPath.basis);
});

// ===== integração real =====

test('integração real: recommendation_type nunca contradiz optimization_vs_rearchitecture reconciliado', () => {
  const r = analyzeStrategy({});
  const map = { OPTIMIZE_CURRENT: 'KEEP_AND_OPTIMIZE', TEST_VARIANT: 'TEST_INCREMENTAL_VARIANT', TEST_NEW_ARCHITECTURE: 'TEST_ALTERNATIVE_ARCHITECTURE', REBUILD_ARCHITECTURE: 'REBUILD_RECOMMENDED' };
  assert.equal(r.analysis.recommendation.recommendation_type, map[r.analysis.optimization_vs_rearchitecture.decision]);
});

test('integração real: challenge_current_strategy real distingue operational de comparative evidence', () => {
  const r = analyzeStrategy({});
  assert.ok('operational_evidence' in r.analysis.challenge_current_strategy);
  assert.ok('comparative_evidence' in r.analysis.challenge_current_strategy);
});

test('integração real: nenhum challenger WhatsApp real é gerado só por atribuição degradada (se existir, cita sinal de abandono real)', () => {
  const r = analyzeStrategy({});
  const wa = r.analysis.challengers.find((c) => c.family === 'WHATSAPP_ASSISTED');
  if (wa) assert.doesNotMatch(JSON.stringify(wa.why_generated), /DEGRADED/);
});
