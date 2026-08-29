'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeVerdict } = require('../src/planner/verdictEngine');
const { analyzePlan } = require('../src/planner/builder');
const { VERDICTS, VIABILITY_STATUSES } = require('../src/planner/enums');

function economicsFixture(overrides = {}) {
  return {
    period: { data_completeness: 0.97, days_missing: [] },
    financials: { roas_financeiro: 0.4, lucro_prejuizo: -300, numero_compradores_reais: 11 },
    roas3_gap: { target_roas: 3.0 },
    ...overrides,
  };
}
function hypothesisSpaceFixture(status, reason = 'fixture') { return { status, reason }; }
function economicEvFixture(status, basis = 'fixture') { return { status, basis, confidence: 'MEDIUM', monetary_estimate: 'NOT_ESTIMABLE' }; }
function knownPathFixture(status, reason = 'fixture') { return { status, reason }; }
function switchGateFixture(eligible, reason = 'fixture') { return { eligible, reason, criteria: {}, pass_count: 0, fail_count: eligible ? 0 : 1, unknown_count: 0 }; }
function scaleGateFixture(status, reason = 'fixture') { return { status, reason, marginal_return: 'NOT_ESTIMABLE' }; }

function baseArgs(overrides = {}) {
  return {
    economicsSnapshot: economicsFixture(),
    hypothesisSpaceStatus: hypothesisSpaceFixture('LARGELY_UNEXPLORED'),
    expectedEconomicValueOfContinuing: economicEvFixture('UNKNOWN'),
    knownPathToTarget: knownPathFixture('NO_KNOWN_PATH'),
    switchGate: switchGateFixture(false),
    scaleGate: scaleGateFixture('NOT_ELIGIBLE'),
    financialTruthStatus: 'RELIABLE',
    ...overrides,
  };
}

test('item 76: low ROAS sozinho NUNCA produz SWITCH_PRODUCT (item 20, teste obrigatório)', () => {
  const r = computeVerdict(baseArgs({
    switchGate: switchGateFixture(false, '0 experimentos concluídos, CRO/Offer não explorados'),
  }));
  assert.notEqual(r.verdict, 'SWITCH_PRODUCT');
  assert.ok(['CONTINUE_VALIDATION', 'HOLD'].includes(r.verdict));
});

test('item 76: zero experimentos concluídos != produto invalidado', () => {
  const r = computeVerdict(baseArgs({ knownPathToTarget: knownPathFixture('UNKNOWN') }));
  assert.notEqual(r.viability_status, 'INVALIDATED');
});

test('item 76: CRO não explorado impede invalidação prematura (switch gate reprova key_levers_explored)', () => {
  const r = computeVerdict(baseArgs({ switchGate: switchGateFixture(false, 'CRO lever sem experimento concluído') }));
  assert.notEqual(r.verdict, 'SWITCH_PRODUCT');
});

test('item 76: Offer não explorado impede invalidação prematura', () => {
  const r = computeVerdict(baseArgs({ switchGate: switchGateFixture(false, 'Offer lever sem experimento concluído') }));
  assert.notEqual(r.verdict, 'SWITCH_PRODUCT');
});

test('item 76: experimento DRAFT != concluído — hypothesis_space_status LARGELY_UNEXPLORED bloqueia OPTIMIZE mesmo com EV positivo', () => {
  const r = computeVerdict(baseArgs({
    hypothesisSpaceStatus: hypothesisSpaceFixture('LARGELY_UNEXPLORED', 'todos os experimentos em DRAFT'),
    expectedEconomicValueOfContinuing: economicEvFixture('POSITIVE'),
  }));
  assert.equal(r.verdict, 'CONTINUE_VALIDATION');
});

test('PASSO 11.1, item 1/5: tracking DEGRADED (Meta-only) NUNCA produz HOLD sozinho — só BLOCKED força HOLD', () => {
  const r = computeVerdict(baseArgs({ financialTruthStatus: 'DEGRADED' }));
  assert.notEqual(r.verdict, 'HOLD');
});

test('item 76/PASSO 11.1 item 1: FINANCIAL_TRUTH=BLOCKED produz HOLD, mesmo com outros sinais positivos', () => {
  const r = computeVerdict(baseArgs({
    financialTruthStatus: 'BLOCKED',
    hypothesisSpaceStatus: hypothesisSpaceFixture('WELL_EXPLORED'),
    expectedEconomicValueOfContinuing: economicEvFixture('POSITIVE'),
    knownPathToTarget: knownPathFixture('PARTIAL'),
    scaleGate: scaleGateFixture('ELIGIBLE_FOR_SCALE'),
  }));
  assert.equal(r.verdict, 'HOLD');
});

test('item 76: caminho suportado (hypothesis space além de LARGELY_UNEXPLORED + EV econômico positivo) produz OPTIMIZE', () => {
  const r = computeVerdict(baseArgs({
    hypothesisSpaceStatus: hypothesisSpaceFixture('PARTIALLY_EXPLORED'),
    expectedEconomicValueOfContinuing: economicEvFixture('POSITIVE', 'hipótese real SUPPORTED em CREATIVE'),
    knownPathToTarget: knownPathFixture('PARTIAL'),
  }));
  assert.equal(r.verdict, 'OPTIMIZE');
});

test('item 76: economia sustentável real produz elegibilidade de SCALE', () => {
  const r = computeVerdict(baseArgs({
    economicsSnapshot: economicsFixture({ financials: { roas_financeiro: 3.2, lucro_prejuizo: 500, numero_compradores_reais: 30 } }),
    hypothesisSpaceStatus: hypothesisSpaceFixture('WELL_EXPLORED'),
    expectedEconomicValueOfContinuing: economicEvFixture('POSITIVE'),
    knownPathToTarget: knownPathFixture('YES'),
    scaleGate: scaleGateFixture('ELIGIBLE_FOR_SCALE', 'ROAS 3.2 >= target, 30 compradores.'),
  }));
  assert.equal(r.verdict, 'SCALE');
  assert.equal(r.viability_status, 'PROVEN');
});

test('item 76: invalidação cross-lever forte (switch gate 100% PASS) permite SWITCH_PRODUCT', () => {
  const r = computeVerdict(baseArgs({
    hypothesisSpaceStatus: hypothesisSpaceFixture('NEAR_EXHAUSTED'),
    expectedEconomicValueOfContinuing: economicEvFixture('NEGATIVE'),
    switchGate: switchGateFixture(true, 'todos os 10 critérios passaram'),
  }));
  assert.equal(r.verdict, 'SWITCH_PRODUCT');
});

test('item 76: SWITCH_PRODUCT nunca é execução automática — computeVerdict só retorna uma string de recomendação, nenhum campo "executed"', () => {
  const r = computeVerdict(baseArgs({
    hypothesisSpaceStatus: hypothesisSpaceFixture('NEAR_EXHAUSTED'),
    expectedEconomicValueOfContinuing: economicEvFixture('NEGATIVE'),
    switchGate: switchGateFixture(true),
  }));
  assert.equal(typeof r.verdict, 'string');
  assert.equal('executed' in r, false);
  assert.equal('product_switched' in r, false);
});

test('enums: VERDICTS e VIABILITY_STATUSES batem com o spec (items 7-8)', () => {
  assert.deepEqual(VERDICTS.sort(), ['CONTINUE_VALIDATION', 'OPTIMIZE', 'HOLD', 'SCALE', 'SWITCH_PRODUCT'].sort());
  assert.deepEqual(VIABILITY_STATUSES.sort(), ['UNKNOWN', 'INSUFFICIENT_EVIDENCE', 'PLAUSIBLE', 'PROMISING', 'PROVEN', 'AT_RISK', 'UNLIKELY', 'INVALIDATED'].sort());
});

test('viability_status é campo separado de verdict — CONTINUE_VALIDATION + INSUFFICIENT_EVIDENCE é válido (item 8)', () => {
  const r = computeVerdict(baseArgs());
  assert.equal(r.verdict, 'CONTINUE_VALIDATION');
  assert.equal(r.viability_status, 'INSUFFICIENT_EVIDENCE');
});

test('reasoning: sempre explica why_this_verdict, what_would_change_it, what_remains_unknown (item 87)', () => {
  const r = computeVerdict(baseArgs());
  assert.ok(r.reasoning.why_this_verdict);
  assert.ok(r.reasoning.what_would_change_it);
  assert.ok(r.reasoning.what_remains_unknown);
});

test('integração real: analyzePlan() produz verdict/viability válidos a partir de dados reais persistidos', () => {
  const r = analyzePlan({});
  assert.ok(VERDICTS.includes(r.plan.verdict));
  assert.ok(VIABILITY_STATUSES.includes(r.plan.viability_status));
  assert.notEqual(r.plan.verdict, 'SWITCH_PRODUCT'); // estado real hoje: 0 experimentos concluídos
});

test('idempotência: analyzePlan() com o mesmo estado real produz o mesmo verdict', () => {
  const a = analyzePlan({});
  const b = analyzePlan({});
  assert.equal(a.plan.verdict, b.plan.verdict);
  assert.equal(a.plan.viability_status, b.plan.viability_status);
  assert.deepEqual(a.known_path_to_target, b.known_path_to_target);
});
