'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, addDays } = require('../src/decision');
const { loadLatestProfitSnapshot } = require('../src/decision/profitSnapshot');
const { loadAllExperiments } = require('../src/experiments/registry');
const { loadHypotheses } = require('../src/learning/registry');
const { buildDecision } = require('../src/decision/builder');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CRO-001',
    status: 'DRAFT',
    category: 'CRO',
    target_metric: 'taxa_lpv_checkout',
    hypothesis: { statement: 'x' },
    baseline: { cpa_financeiro: 109.79 },
    budget_limit: 281.8,
    budget_check: { max_budget_percent_of_cycle: 0.3 },
    priority: { factors: { confidence: 0.8, risk: 1 }, speed_dias_estimado: 7 },
    minimum_evidence: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
    expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } },
    failure_condition: 'piorou',
    success_condition: 'melhorou 20%+',
    attacks_path: 'CPA',
    ...overrides,
  };
}

function makeProfitSnapshot(roas) {
  const win = { current_financials: { roas_financeiro: roas }, data_quality: { data_completeness: 0.97, financial_confidence: 'normal' }, period: { from: '2026-01-01', to: '2026-01-30' } };
  return { found: true, snapshot_date: '2026-01-30', is_stale: false, snapshot: { windows: { last_30d: win, last_14d: win, last_7d: win } } };
}

const CYCLE = { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' };

test('CLI parseArgs: reconhece --date --product --summary --explain --simulate-cycle-budget', () => {
  const args = parseArgs(['--date', '2026-08-28', '--product', 'x', '--summary', '--explain', '--simulate-cycle-budget', '1000']);
  assert.equal(args.date, '2026-08-28');
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.explain, true);
  assert.equal(args.simulateCycleBudget, 1000);
});

test('CLI parseArgs: sem flags, tudo undefined/falsy', () => {
  const args = parseArgs([]);
  assert.equal(args.date, undefined);
  assert.equal(args.summary, undefined);
  assert.equal(args.simulateCycleBudget, undefined);
});

test('addDays: soma dias corretamente, nunca subtrai', () => {
  assert.equal(addDays('2026-01-01', 6), '2026-01-07');
  assert.equal(addDays('2026-01-28', 6), '2026-02-03'); // atravessa mês
});

test('Profit Engine integration: loadLatestProfitSnapshot lê o snapshot real mais recente sem chamar API nenhuma', () => {
  const result = loadLatestProfitSnapshot();
  assert.equal(result.found, true);
  assert.ok(result.snapshot.windows.last_30d.current_financials);
  assert.equal(typeof result.snapshot.windows.last_30d.current_financials.roas_financeiro, 'number');
});

test('Profit Engine integration: referenceDate sem snapshot exato usa o mais recente ANTERIOR, nunca um futuro', () => {
  const result = loadLatestProfitSnapshot('2026-01-01'); // antes de qualquer snapshot real existir
  assert.equal(result.found, false);
});

test('Experiment Engine integration: buildDecision usa loadAllExperiments() real e reconhece os 4 DRAFTs sem quebrar', () => {
  const experiments = loadAllExperiments();
  assert.equal(experiments.length, 4);
  const decision = buildDecision({ productId: null, profitSnapshotResult: loadLatestProfitSnapshot(), experiments, hypotheses: [], capitalCycle: CYCLE });
  assert.ok(['RUN_EXPERIMENT', 'MAINTAIN', 'PROTECT_CAPITAL', 'FIX_TRACKING', 'COLLECT_MORE_DATA', 'PREPARE_SCALE'].includes(decision.action_type));
});

test('Learning Engine integration: buildDecision consulta hypotheses reais (0 aprendizados ainda) sem quebrar e sem inventar prior evidence', () => {
  const hypotheses = loadHypotheses();
  assert.deepEqual(hypotheses, []); // estado real atual: nenhum experimento fechado ainda
  const decision = buildDecision({ productId: null, profitSnapshotResult: loadLatestProfitSnapshot(), experiments: loadAllExperiments(), hypotheses, capitalCycle: CYCLE });
  assert.equal(decision.prior_learning_status === 'NO_PRIOR_EVIDENCE' || decision.prior_learning_status === null, true);
});

test('North Star permanece 3.0 em TODOS os modos de decisão', () => {
  const scenarios = [
    { roas: 0.5, hasStrong: false, hasSupported: false }, // RECOVERY
    { roas: 1.1, hasStrong: false, hasSupported: false }, // VALIDATION
    { roas: 1.3, hasStrong: false, hasSupported: true }, // GROWTH
    { roas: 1.5, hasStrong: true, hasSupported: true }, // SCALE
  ];
  for (const s of scenarios) {
    const hypotheses = s.hasStrong ? [{ product_id: 'p', status: 'STRONG' }] : s.hasSupported ? [{ product_id: 'p', status: 'SUPPORTED' }] : [];
    const decision = buildDecision({ productId: 'p', profitSnapshotResult: makeProfitSnapshot(s.roas), experiments: [makeExperiment()], hypotheses, capitalCycle: CYCLE });
    assert.equal(decision.north_star.target_roas, 3.0, `modo ${decision.decision_mode} deveria manter North Star 3.0`);
  }
});

test('GROWTH: evidência crescente mantém RUN_EXPERIMENT disponível como recomendação (capital CONTROLLED)', () => {
  const decision = buildDecision({
    productId: 'p',
    profitSnapshotResult: makeProfitSnapshot(1.3),
    experiments: [makeExperiment()],
    hypotheses: [{ product_id: 'p', status: 'SUPPORTED' }],
    capitalCycle: CYCLE,
  });
  assert.equal(decision.decision_mode, 'GROWTH');
  assert.equal(decision.capital_policy, 'CONTROLLED');
});

test('SCALE: capital_policy vira EXPANDABLE (nunca implica gasto automático — é só sinalização)', () => {
  const decision = buildDecision({
    productId: 'p',
    profitSnapshotResult: makeProfitSnapshot(1.5),
    experiments: [makeExperiment()],
    hypotheses: [{ product_id: 'p', status: 'STRONG' }],
    capitalCycle: CYCLE,
  });
  assert.equal(decision.decision_mode, 'SCALE');
  assert.equal(decision.capital_policy, 'EXPANDABLE');
  assert.equal(decision.decision_status, 'RECOMMENDED'); // nunca "EXECUTED"
});
