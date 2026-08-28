'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { bestUseOfNextCapital } = require('../src/decision/nextCapital');
const { buildDecision } = require('../src/decision/builder');

function winnerExperiment(overrides = {}) {
  return { experiment_id: 'CRO-001', budget_limit: 281.8, ...overrides };
}
function recommended(overrides = {}) {
  return { action_type: 'RUN_EXPERIMENT', reason: 'x', expected_value: { expected_value_score: 100 }, ...overrides };
}
function capitalCycle(overrides = {}) {
  return { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, ...overrides };
}
function capitalTranches(firstAmount = 140.9, secondAmount = 140.9) {
  return {
    tranches: [
      { amount: firstAmount, release_condition: 'liberação inicial — nenhuma evidência prévia exigida.', stop_condition: 'stop A' },
      { amount: secondAmount, release_condition: 'tranche 1 não atingiu failure_condition e mostrou sinal parcial.', stop_condition: 'stop B' },
    ],
    total_allocated: firstAmount + secondAmount,
  };
}

test('next capital = 100, tranche planejada = 140,90 -> release = 100 (nunca mais que o amount perguntado)', () => {
  const r = bestUseOfNextCapital(100, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) });
  assert.equal(r.capital_release_initial, 100);
  assert.equal(r.available_decision_capital, 100);
  assert.equal(r.recommended_tranche_size, 140.9);
  assert.equal(r.capital_release_max, 281.8); // macro, não limitado pelo amount
});

test('next capital = 50 -> release <= 50', () => {
  const r = bestUseOfNextCapital(50, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) });
  assert.ok(r.capital_release_initial <= 50);
  assert.equal(r.capital_release_initial, 50);
});

test('next capital = 500, budget remaining = 281,80 -> release <= 281,80 (nunca mais que o budget do experimento)', () => {
  const r = bestUseOfNextCapital(500, {
    recommended: recommended(),
    capitalCycle: capitalCycle({ cycle_available: 5000 }),
    winnerExperiment: winnerExperiment({ budget_limit: 281.8 }),
    capitalTranches: capitalTranches(281.8, 0), // tranche única cobrindo o budget inteiro, pra isolar o teto de budget_remaining
  });
  assert.ok(r.capital_release_initial <= 281.8);
  assert.equal(r.capital_release_initial, 281.8);
});

test('cycle_available menor que amount -> respeita cycle_available', () => {
  const r = bestUseOfNextCapital(100, { recommended: recommended(), capitalCycle: capitalCycle({ cycle_available: 30 }), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) });
  assert.equal(r.capital_release_initial, 30);
});

test('budget_remaining menor que amount -> respeita experiment_budget_remaining', () => {
  const r = bestUseOfNextCapital(100, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment({ budget_limit: 20 }), capitalTranches: capitalTranches(140.9, 140.9) });
  assert.equal(r.capital_release_initial, 20);
});

test('recommended_tranche_size menor que amount -> respeita a tranche planejada pelo modelo de risco/evidência', () => {
  const r = bestUseOfNextCapital(500, { recommended: recommended(), capitalCycle: capitalCycle({ cycle_available: 5000 }), winnerExperiment: winnerExperiment({ budget_limit: 5000 }), capitalTranches: capitalTranches(75, 75) });
  assert.equal(r.capital_release_initial, 75);
});

test('DO_NOT_SPEND continua retornando release 0, mesmo com capital disponível', () => {
  const r = bestUseOfNextCapital(100, { recommended: recommended({ action_type: 'MAINTAIN', reason: 'nada com EV positivo' }), capitalCycle: capitalCycle(), winnerExperiment: null, capitalTranches: { tranches: [], total_allocated: 0 } });
  assert.equal(r.action, 'DO_NOT_SPEND');
  assert.equal(r.capital_release_initial, 0);
  assert.equal(r.capital_release_max, 0);
});

test('valor zero é tratado de forma segura -> release 0, sem quebrar', () => {
  const r = bestUseOfNextCapital(0, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches() });
  assert.equal(r.available_decision_capital, 0);
  assert.equal(r.capital_release_initial, 0);
  assert.equal(r.action, 'DO_NOT_SPEND');
});

test('valor negativo ou inválido (NaN/undefined) é tratado de forma segura -> release 0, sem lançar erro', () => {
  for (const bad of [-100, NaN, undefined, null]) {
    const r = bestUseOfNextCapital(bad, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches() });
    assert.equal(r.available_decision_capital, 0);
    assert.equal(r.capital_release_initial, 0);
  }
});

test('capital_cycle não configurado -> cycle_available null, não trava o cálculo (outros limites ainda valem)', () => {
  const r = bestUseOfNextCapital(100, { recommended: recommended(), capitalCycle: { status: 'CAPITAL_NOT_CONFIGURED' }, winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) });
  assert.equal(r.cycle_available, null);
  assert.equal(r.capital_release_initial, 100); // limitado pelo amount/tranche/budget, não pelo ciclo (que não existe)
});

test('determinismo: mesmos inputs sempre produzem o mesmo resultado', () => {
  const input = { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) };
  const a = bestUseOfNextCapital(100, input);
  const b = bestUseOfNextCapital(100, input);
  assert.deepEqual(a, b);
});

test('genérico: funciona igual pra qualquer amount positivo (50/100/250/500), regra capital_release_initial <= amount sempre vale', () => {
  for (const amount of [50, 100, 250, 500]) {
    const r = bestUseOfNextCapital(amount, { recommended: recommended(), capitalCycle: capitalCycle(), winnerExperiment: winnerExperiment(), capitalTranches: capitalTranches(140.9, 140.9) });
    assert.ok(r.capital_release_initial <= amount, `amount=${amount} violou a regra`);
    assert.ok(r.capital_release_initial <= r.cycle_available);
    assert.ok(r.capital_release_initial <= r.experiment_budget_remaining);
    assert.ok(r.capital_release_initial <= r.recommended_tranche_size);
  }
});

test('idempotência preservada: buildDecision() com o mesmo estado ainda produz o mesmo decision_id após a correção do next capital', () => {
  const experiment = {
    experiment_id: 'CRO-001', status: 'DRAFT', category: 'CRO', target_metric: 'taxa_lpv_checkout',
    hypothesis: { statement: 'x' }, baseline: { cpa_financeiro: 109.79 }, budget_limit: 281.8,
    budget_check: { max_budget_percent_of_cycle: 0.3 }, priority: { factors: { confidence: 0.8, risk: 1 }, speed_dias_estimado: 7 },
    minimum_evidence: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
    expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } },
    failure_condition: 'piorou', success_condition: 'melhorou 20%+', attacks_path: 'CPA',
  };
  const win = { current_financials: { roas_financeiro: 0.62 }, data_quality: { data_completeness: 0.97, financial_confidence: 'normal' }, period: { from: '2026-01-01', to: '2026-01-30' } };
  const profitSnapshotResult = { found: true, snapshot_date: '2026-01-30', is_stale: false, snapshot: { windows: { last_30d: win, last_14d: win, last_7d: win } } };
  const cycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' };

  const d1 = buildDecision({ productId: null, profitSnapshotResult, experiments: [experiment], hypotheses: [], capitalCycle: cycle });
  const d2 = buildDecision({ productId: null, profitSnapshotResult, experiments: [experiment], hypotheses: [], capitalCycle: cycle });
  assert.equal(d1.decision_id, d2.decision_id);
  assert.equal(d1.best_use_of_next_100.capital_release_initial, d2.best_use_of_next_100.capital_release_initial);
  assert.ok(d1.best_use_of_next_100.capital_release_initial <= 100);
});
