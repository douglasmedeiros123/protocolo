'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeCapitalCycle, computeCommittedBudget } = require('../src/experiments/capitalCycle');
const { validateBudgetLimit } = require('../src/experiments/budget');
const { normalizeScores } = require('../src/experiments/priority');

function makeFixtureDataDir(daysByDate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capital-cycle-fixture-'));
  fs.mkdirSync(path.join(dir, 'daily'), { recursive: true });
  for (const [date, snapshot] of Object.entries(daysByDate)) {
    fs.writeFileSync(path.join(dir, 'daily', `${date}.json`), JSON.stringify(snapshot));
  }
  return dir;
}

// NOTA: computeCapitalCycle usa aggregatePeriod com o DATA_DIR real do projeto (não recebe
// override de diretório) — os testes abaixo cobrem a lógica com datas que não têm snapshot
// real nenhum (passado/futuro fora do que já foi coletado), que é exatamente o caso de
// "histórico não deve vazar pra dentro do ciclo futuro" sem precisar mockar arquivo.

test('capital não configurado: sem cycle_budget/start/end, status vira CAPITAL_NOT_CONFIGURED (nunca 0, nunca Infinity)', () => {
  const c = computeCapitalCycle({});
  assert.equal(c.status, 'CAPITAL_NOT_CONFIGURED');
  assert.equal(c.cycle_budget, null);
  assert.equal(c.cycle_available, null);
});

test('capital não configurado: só cycle_budget sem as datas também não configura', () => {
  const c = computeCapitalCycle({ cycleBudget: 1000 });
  assert.equal(c.status, 'CAPITAL_NOT_CONFIGURED');
});

test('histórico não consome orçamento futuro: ciclo em datas SEM snapshot real tem cycle_spent = 0, não herda gasto de outro período', () => {
  const c = computeCapitalCycle({ cycleBudget: 1000, cycleStart: '2027-01-01', cycleEnd: '2027-01-07', committedFromExperiments: 0 });
  assert.equal(c.status, 'CONFIGURED');
  assert.equal(c.cycle_spent, 0); // nenhum snapshot real nessas datas -> soma real é 0, não o R$1207 de outro período
  assert.equal(c.days_with_real_spend_data, 0);
  assert.equal(c.days_missing_in_cycle.length, 7);
});

test('histórico não vaza pra dentro do ciclo (fixture real): gasto histórico FORA da janela do ciclo não entra na soma, só o que está DENTRO conta', () => {
  const dir = makeFixtureDataDir({
    '2026-07-28': { sources: { meta: true, hotmart: true }, meta: { totals: { spend: 1207.72, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0, receita_meta: 0 } }, hotmart: { totals: { orders_count: 0, order_bumps_count: 0, gross_revenue: 0, net_revenue: 0, hotmart_fee_total: 0, refunds_count: 0, refunds_gross: 0, cancellations_or_expired_count: 0, test_transactions_count: 0 }, transactions: [] }, has_critical_flags: false },
    '2027-02-02': { sources: { meta: true, hotmart: true }, meta: { totals: { spend: 40, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0, receita_meta: 0 } }, hotmart: { totals: { orders_count: 0, order_bumps_count: 0, gross_revenue: 0, net_revenue: 0, hotmart_fee_total: 0, refunds_count: 0, refunds_gross: 0, cancellations_or_expired_count: 0, test_transactions_count: 0 }, transactions: [] }, has_critical_flags: false },
  });
  const c = computeCapitalCycle({ cycleBudget: 1000, cycleStart: '2027-02-01', cycleEnd: '2027-02-03', dataDir: dir });
  assert.equal(c.cycle_spent, 40); // só o dia 02/02 (dentro do ciclo) — o R$1207,72 histórico de 28/07 nunca entra
  assert.equal(c.cycle_available, 1000 - 40 - 0);
});

test('capital disponível: cycle_available = budget - spent - committed', () => {
  const c = computeCapitalCycle({ cycleBudget: 1000, cycleStart: '2027-01-01', cycleEnd: '2027-01-07', committedFromExperiments: 150 });
  assert.equal(c.cycle_spent, 0);
  assert.equal(c.cycle_committed, 150);
  assert.equal(c.cycle_available, 1000 - 0 - 150);
});

test('capital comprometido: computeCommittedBudget soma só READY/RUNNING', () => {
  const experiments = [
    { status: 'DRAFT', budget_limit: 300 },
    { status: 'READY', budget_limit: 200 },
    { status: 'RUNNING', budget_limit: 100 },
    { status: 'SUCCESS', budget_limit: 250 },
    { status: 'CANCELLED', budget_limit: 400 },
  ];
  assert.equal(computeCommittedBudget(experiments), 300); // só 200 (READY) + 100 (RUNNING)
});

test('DRAFT não compromete verba nenhuma', () => {
  const experiments = [{ status: 'DRAFT', budget_limit: 500 }, { status: 'DRAFT', budget_limit: 500 }];
  assert.equal(computeCommittedBudget(experiments), 0);
});

test('READY e RUNNING comprometem verba igualmente', () => {
  const ready = computeCommittedBudget([{ status: 'READY', budget_limit: 300 }]);
  const running = computeCommittedBudget([{ status: 'RUNNING', budget_limit: 300 }]);
  assert.equal(ready, 300);
  assert.equal(running, 300);
});

test('experimento dentro do orçamento e do percentual: budget_check OK', () => {
  const cycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 700 };
  const v = validateBudgetLimit(200, cycle, 0.3); // 20% do ciclo, dentro dos 30% permitidos
  assert.equal(v.status, 'OK');
  assert.equal(v.valid, true);
});

test('experimento ACIMA do limite percentual configurado: BUDGET_TOO_LARGE_FOR_CYCLE', () => {
  const cycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 900 };
  const v = validateBudgetLimit(400, cycle, 0.3); // 40% do ciclo > 30% permitido (mesmo cabendo no disponível)
  assert.equal(v.flags.includes('BUDGET_TOO_LARGE_FOR_CYCLE'), true);
  assert.equal(v.valid, false);
});

test('sem max_budget_percent_of_cycle configurado, o check simplesmente não é avaliado (não inventa 15% nem nenhum outro número)', () => {
  const cycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 900 };
  const v = validateBudgetLimit(400, cycle, undefined);
  assert.equal(v.budget_too_large_for_cycle, 'not_evaluated (nenhum percentual máximo configurado)');
  assert.equal(v.valid, true); // 400 <= 900 disponível, e sem teto percentual pra reprovar
});

test('experimento acima do cycle_available (mas dentro do percentual) ainda reprova', () => {
  const cycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 100 };
  const v = validateBudgetLimit(150, cycle, 0.5); // 15% do budget total, mas só R$100 disponível de verdade
  assert.equal(v.within_cycle_available, false);
  assert.equal(v.valid, false);
});

test('score normalizado (0-100) preserva o mesmo ranking que o score bruto', () => {
  const experiments = [
    { experiment_id: 'A', priority: { score: 0.0169 } },
    { experiment_id: 'B', priority: { score: 0.0120 } },
    { experiment_id: 'C', priority: { score: 0.0024 } },
    { experiment_id: 'D', priority: { score: 0.0004 } },
  ];
  const normalized = normalizeScores(experiments);
  const rawOrder = [...experiments].sort((a, b) => b.priority.score - a.priority.score).map((e) => e.experiment_id);
  const normOrder = [...normalized].sort((a, b) => b.priority.score_normalized_0_100 - a.priority.score_normalized_0_100).map((e) => e.experiment_id);
  assert.deepEqual(normOrder, rawOrder);
  assert.equal(normalized.find((e) => e.experiment_id === 'A').priority.score_normalized_0_100, 100); // maior score bruto -> 100
  assert.equal(normalized.find((e) => e.experiment_id === 'D').priority.score_normalized_0_100, 0); // menor score bruto -> 0
});

test('score normalizado: com todos os scores iguais (range=0), todos viram 100 (não quebra dividindo por zero)', () => {
  const experiments = [{ experiment_id: 'A', priority: { score: 5 } }, { experiment_id: 'B', priority: { score: 5 } }];
  const normalized = normalizeScores(experiments);
  assert.equal(normalized[0].priority.score_normalized_0_100, 100);
  assert.equal(normalized[1].priority.score_normalized_0_100, 100);
});
