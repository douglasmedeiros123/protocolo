'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCurrentFunnelMetrics } = require('../src/strategy-search/currentFunnel');
const { buildRoasTypes, buildFrontendEconomics } = require('../src/strategy-search/economicsAndHooks');
const { rankArchitectures, TIE_BREAK_FACTOR_ORDER } = require('../src/strategy-search/comparisonAndRanking');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { TARGET_FINANCIAL_ROAS } = require('../src/decision/northStar');
const { dateRange } = require('../src/utils/dates');

const DATES = dateRange('2026-07-30', '2026-08-28');

function candidateFixture(overrides = {}) {
  return {
    architecture_id: 'ARCH-X', family: 'VSL', is_current: false, distance: 'MEDIUM', reversibility: 'REVERSIBLE',
    tracking_readiness: 'PARTIAL', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'INCREASE_COMPREHENSION', strategic_diversification_value: false,
    evidence_basis: [], why_generated: { reason: 'economic_gap' }, unknowns: [], risks: [],
    ...overrides,
  };
}

// ===== item 105 — TESTES ECONOMICS =====

test('item 105: current_economics reusa profit/aggregate.js (mesmo engine), nunca recalcula com fórmula própria', () => {
  const funnel = buildCurrentFunnelMetrics(DATES);
  assert.match(funnel.source, /profit\/aggregate\.js/);
});

test('item 105: financial purchase != Meta purchase — campos explicitamente separados', () => {
  const funnel = buildCurrentFunnelMetrics(DATES);
  assert.notEqual(funnel.financial_purchases, undefined);
  assert.notEqual(funnel.meta_purchases, undefined);
  assert.notEqual(funnel.financial_purchases, funnel.meta_purchases); // dado real: valores diferem
});

test('item 105: economia lifetime indisponível permanece indisponível — LIFETIME_ROAS sempre NOT_AVAILABLE', () => {
  const r = buildRoasTypes({ mainProductRevenue: 700, totalRevenue: 800, spend: 1000 });
  assert.equal(r.LIFETIME_ROAS, 'NOT_AVAILABLE');
});

test('item 105: receita de backend nunca é inventada — backend_revenue_assumed é sempre 0/ausente sem Lifecycle Agent', () => {
  const r = buildFrontendEconomics({ financialRoas: 0.6, targetRoas: 3, lucroPrejuizo: -100 });
  assert.equal(r.backend_revenue_assumed, 0);
});

test('item 105: mecanismo econômico pode ser qualitativo — expected_economic_mechanism de um challenger é sempre string descritiva, nunca um número', () => {
  const { generateChallengers } = require('../src/strategy-search/challengerGenerator');
  const challengers = generateChallengers({
    diagnosis: { missing_monetization_signals: [{ diagnostic_id: 'X' }], known_path_to_target: { status: 'NO_KNOWN_PATH' }, tracking_scopes: { CREATIVE_ATTRIBUTION: { status: 'RELIABLE' }, PLATFORM_ATTRIBUTION: { status: 'RELIABLE' } }, financial_roas: 0.6 },
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  for (const c of challengers) assert.equal(typeof c.expected_economic_mechanism, 'string');
});

test('item 105: ROAS3 reusado centralmente — nunca duplicado', () => {
  assert.equal(TARGET_FINANCIAL_ROAS, 3.0);
  const r = analyzeStrategy({});
  assert.equal(r.analysis.current_economics.target_roas, TARGET_FINANCIAL_ROAS);
});

// ===== item 106 — TESTES RANKING =====

test('item 106: ranking determinístico — mesma entrada produz o mesmo resultado', () => {
  const a = candidateFixture({ architecture_id: 'A' });
  const b = candidateFixture({ architecture_id: 'B', primary_mechanism: 'INCREASE_AOV' });
  const r1 = rankArchitectures([a, b]);
  const r2 = rankArchitectures([a, b]);
  assert.deepEqual(r1.ranking.map((x) => x.architecture_id), r2.ranking.map((x) => x.architecture_id));
});

test('item 106: ordem do array de entrada é irrelevante', () => {
  const a = candidateFixture({ architecture_id: 'A' });
  const b = candidateFixture({ architecture_id: 'B', primary_mechanism: 'INCREASE_AOV' });
  const r1 = rankArchitectures([a, b]);
  const r2 = rankArchitectures([b, a]);
  assert.deepEqual(r1.ranking.map((x) => x.architecture_id), r2.ranking.map((x) => x.architecture_id));
});

test('item 106: tie-break explícito — ordem de 14 fatores documentada e testável', () => {
  assert.equal(TIE_BREAK_FACTOR_ORDER.length, 14);
  assert.equal(TIE_BREAK_FACTOR_ORDER[0], 'decision_relevance_rank');
});

test('item 106: architecture_id nunca é evidência de mérito — só desempata apresentação em empate real', () => {
  const a = candidateFixture({ architecture_id: 'Z' });
  const b = candidateFixture({ architecture_id: 'A' });
  const r = rankArchitectures([a, b]);
  assert.equal(r.decision_tie, true);
  assert.deepEqual(r.decision_tie_architecture_ids.sort(), ['A', 'Z']);
});

test('item 106: DECISION_TIE declarado quando os 14 fatores são idênticos', () => {
  const a = candidateFixture({ architecture_id: 'A' });
  const b = candidateFixture({ architecture_id: 'B' });
  const r = rankArchitectures([a, b]);
  assert.equal(r.decision_tie, true);
});

test('item 106/61: custo não domina — implementation_cost_rank/measurement_capital_rank ficam nas posições 7-8 de 14, nunca 1ª', () => {
  const idx1 = TIE_BREAK_FACTOR_ORDER.indexOf('implementation_cost_rank');
  const idx2 = TIE_BREAK_FACTOR_ORDER.indexOf('measurement_capital_rank');
  assert.ok(idx1 >= 6 && idx2 >= 6);
});

test('item 106/62: sofisticação não domina — nenhum fator de ranking usa "family" ou nome de padrão como critério', () => {
  assert.equal(TIE_BREAK_FACTOR_ORDER.some((f) => /family|sophist/i.test(f)), false);
});

test('item 106: information_gain entra no ranking (tracking_readiness usado como proxy documentado)', () => {
  const readyCandidate = candidateFixture({ architecture_id: 'R', tracking_readiness: 'READY' });
  const notReadyCandidate = candidateFixture({ architecture_id: 'N', tracking_readiness: 'NOT_READY' });
  const r = rankArchitectures([readyCandidate, notReadyCandidate]);
  assert.equal(r.ranking[0].architecture_id, 'R');
});

test('item 106: relevância econômica entra no ranking (mecanismo INCREASE_AOV > IMPROVE_QUALIFICATION)', () => {
  const aov = candidateFixture({ architecture_id: 'AOV', primary_mechanism: 'INCREASE_AOV' });
  const qual = candidateFixture({ architecture_id: 'QUAL', primary_mechanism: 'IMPROVE_QUALIFICATION' });
  const r = rankArchitectures([aov, qual]);
  assert.equal(r.ranking[0].architecture_id, 'AOV');
});

test('item 106: risco/reversibilidade entram no ranking (REVERSIBLE > HARD_TO_REVERSE em igualdade dos demais fatores)', () => {
  const rev = candidateFixture({ architecture_id: 'REV', reversibility: 'REVERSIBLE' });
  const hard = candidateFixture({ architecture_id: 'HARD', reversibility: 'HARD_TO_REVERSE' });
  const r = rankArchitectures([rev, hard]);
  assert.equal(r.ranking[0].architecture_id, 'REV');
});

test('integração real: ranking real produz 14 dimensões pra cada arquitetura, incluindo a atual', () => {
  const r = analyzeStrategy({});
  for (const entry of r.analysis.ranking) assert.equal(Object.keys(entry.comparison_dimensions).length, 14);
});
