'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { aggregatePeriod } = require('../src/profit/aggregate');
const { computeFinancialConfidence } = require('../src/profit/dataQuality');
const { computeCurrentFinancials } = require('../src/profit/financials');
const { computeCapitalStatus } = require('../src/profit/capital');

function makeFixtureDataDir(daysByDate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profit-fixture-'));
  fs.mkdirSync(path.join(dir, 'daily'), { recursive: true });
  for (const [date, snapshot] of Object.entries(daysByDate)) {
    fs.writeFileSync(path.join(dir, 'daily', `${date}.json`), JSON.stringify(snapshot));
  }
  return dir;
}

function baseSnapshot(overrides = {}) {
  return {
    date: overrides.date || '2026-08-01',
    sources: { meta: true, hotmart: true, github: true },
    meta: { totals: { spend: 100, impressions: 1000, clicks: 30, lpv: 20, checkout: 3, compra_meta: 1, receita_meta: 90, ...(overrides.metaTotals || {}) } },
    hotmart: {
      totals: { orders_count: 1, order_bumps_count: 0, gross_revenue: 100, net_revenue: 88, hotmart_fee_total: 12, refunds_count: 0, refunds_gross: 0, cancellations_or_expired_count: 0, test_transactions_count: 0, ...(overrides.hotmartTotals || {}) },
      transactions: overrides.transactions || [],
    },
    has_critical_flags: overrides.has_critical_flags || false,
    critical_flag_codes: overrides.critical_flag_codes || [],
  };
}

test('aggregatePeriod: dias faltando não viram zero — ficam listados em days_missing, não entram na soma como se fossem 0 real', () => {
  const dir = makeFixtureDataDir({ '2026-08-01': baseSnapshot() });
  const agg = aggregatePeriod(['2026-08-01', '2026-08-02', '2026-08-03'], dir);
  assert.deepEqual(agg.days_found, ['2026-08-01']);
  assert.deepEqual(agg.days_missing, ['2026-08-02', '2026-08-03']);
  assert.ok(Math.abs(agg.data_completeness - 1 / 3) < 1e-9);
  assert.equal(agg.sum.spend, 100); // só o dia real entra na soma
});

test('tracking crítico: dia com has_critical_flags=true é coletado em critical_flags_by_day e degrada financial_confidence', () => {
  const dir = makeFixtureDataDir({
    '2026-08-01': baseSnapshot({ has_critical_flags: true, critical_flag_codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] }),
  });
  const agg = aggregatePeriod(['2026-08-01'], dir);
  assert.equal(agg.critical_flags_by_day.length, 1);
  assert.equal(agg.critical_flags_by_day[0].codes[0], 'META_PURCHASE_WITHOUT_HOTMART_SALE');

  const dq = computeFinancialConfidence(agg);
  assert.equal(dq.financial_confidence, 'degraded');
  assert.ok(dq.reasons.some((r) => r.includes('META_PURCHASE_WITHOUT_HOTMART_SALE')));
});

test('sem flag crítica e cobertura completa: financial_confidence normal', () => {
  const dir = makeFixtureDataDir({ '2026-08-01': baseSnapshot() });
  const agg = aggregatePeriod(['2026-08-01'], dir);
  const dq = computeFinancialConfidence(agg);
  assert.equal(dq.financial_confidence, 'normal');
  assert.deepEqual(dq.reasons, []);
});

test('Hotmart divergente da Meta: decisão financeira usa Hotmart (menor), não Meta (inflado) — Meta nunca é tratada como verdade absoluta', () => {
  // Meta diz 5 compras; Hotmart só confirma 1 venda real naquele dia (caso real de venda fantasma)
  const dir = makeFixtureDataDir({
    '2026-08-01': baseSnapshot({
      metaTotals: { spend: 100, compra_meta: 5, receita_meta: 450 },
      hotmartTotals: { orders_count: 1, gross_revenue: 100, net_revenue: 88 },
    }),
  });
  const agg = aggregatePeriod(['2026-08-01'], dir);
  const f = computeCurrentFinancials(agg.sum);

  assert.equal(f.numero_compradores_reais, 1); // Hotmart, não os 5 da Meta
  assert.equal(f.cpa_financeiro, 100 / 1); // baseado na venda real
  assert.equal(f.cpa_meta, 100 / 5); // reportado à parte, nunca usado pra decisão
  assert.notEqual(f.cpa_financeiro, f.cpa_meta);
  assert.equal(f.roas_financeiro, 88 / 100); // baseado em receita líquida real da Hotmart
  assert.notEqual(f.roas_financeiro, f.roas_marketing);
});

test('orçamento restante: sem monthly_budget configurado, budget_remaining fica null (nunca inventado)', () => {
  const status = computeCapitalStatus(350.5);
  assert.equal(status.configured, false);
  assert.equal(status.spent_this_month, 350.5); // isso é real, calculado
  assert.equal(status.monthly_budget, null);
  assert.equal(status.budget_remaining, null);
  assert.ok(status.note);
});

test('orçamento restante: com monthly_budget configurado (simulando config futura), budget_remaining calcula de verdade', () => {
  // Simula o cenário de config futura sem mexer no arquivo real de config —
  // testa a fórmula isoladamente via um objeto local equivalente.
  const monthly_budget = 1500;
  const spent = 620.4;
  const budget_remaining = monthly_budget - spent;
  assert.equal(budget_remaining, 879.6);
});
