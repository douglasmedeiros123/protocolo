'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { safeDiv } = require('../src/metrics/safeDiv');
const { computeFunnelMetrics } = require('../src/metrics/funnel');
const { computeEconomicsMetrics } = require('../src/metrics/economics');

test('safeDiv: divisão normal', () => {
  assert.equal(safeDiv(10, 2), 5);
});

test('safeDiv: divisão por zero retorna null (nunca NaN/Infinity)', () => {
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(0, 0), null);
});

test('safeDiv: entradas não-numéricas retornam null', () => {
  assert.equal(safeDiv(undefined, 5), null);
  assert.equal(safeDiv(5, null), null);
});

test('CTR: calculado corretamente a partir de cliques/impressões', () => {
  const totals = { spend: 100, impressions: 1000, clicks: 30, lpv: 20, checkout: 5, compra_meta: 1 };
  const m = computeFunnelMetrics(totals);
  assert.equal(m.ctr, 0.03); // 3%, como fração
});

test('CTR: 0 impressões não quebra (retorna null, não Infinity)', () => {
  const totals = { spend: 0, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0 };
  const m = computeFunnelMetrics(totals);
  assert.equal(m.ctr, null);
  assert.equal(m.cpm, null);
});

test('CPM: spend/impressions * 1000', () => {
  const totals = { spend: 41.27, impressions: 1000, clicks: 10, lpv: 5, checkout: 1, compra_meta: 0 };
  const m = computeFunnelMetrics(totals);
  assert.equal(m.cpm, 41.27);
});

test('taxa_lpv_checkout e taxa_checkout_compra batem com o funil real de 27/08 desta sessão', () => {
  // valores reais medidos manualmente na sessão: 535 LPV, 47 checkout, 14 compra
  const totals = { spend: 1207.72, impressions: 29261, clicks: 803, lpv: 535, checkout: 47, compra_meta: 14 };
  const m = computeFunnelMetrics(totals);
  assert.ok(Math.abs(m.taxa_lpv_checkout - 0.08785) < 0.0001);
  assert.ok(Math.abs(m.taxa_checkout_compra - 0.29787) < 0.0001);
});

test('CPA financeiro: gasto / número de pedidos reais confirmados na Hotmart', () => {
  const metaTotals = { spend: 1207.72, lpv: 535, compra_meta: 14, receita_meta: 801.30 };
  const hotmartTotals = { orders_count: 11, order_bumps_count: 3, gross_revenue: 808.55, net_revenue: 716.20, refunds_gross: 0 };
  const e = computeEconomicsMetrics(metaTotals, hotmartTotals);
  assert.ok(Math.abs(e.cpa_financeiro - (1207.72 / 11)) < 0.01);
  assert.ok(Math.abs(e.cpa_meta - (1207.72 / 14)) < 0.01);
});

test('ROAS financeiro vs ROAS meta divergem quando pixel e Hotmart divergem', () => {
  const metaTotals = { spend: 1207.72, lpv: 535, compra_meta: 14, receita_meta: 801.30 };
  const hotmartTotals = { orders_count: 11, order_bumps_count: 3, gross_revenue: 808.55, net_revenue: 716.20, refunds_gross: 0 };
  const e = computeEconomicsMetrics(metaTotals, hotmartTotals);
  assert.ok(Math.abs(e.roas_meta - (801.30 / 1207.72)) < 0.001);
  assert.ok(Math.abs(e.roas_financeiro - (716.20 / 1207.72)) < 0.001);
  assert.notEqual(e.roas_meta, e.roas_financeiro);
});

test('AOV bruto e líquido: soma de receita dividida pelo número de pedidos (produto principal)', () => {
  const metaTotals = { spend: 0, lpv: 0, compra_meta: 0, receita_meta: 0 };
  const hotmartTotals = { orders_count: 11, order_bumps_count: 3, gross_revenue: 808.55, net_revenue: 716.20, refunds_gross: 0 };
  const e = computeEconomicsMetrics(metaTotals, hotmartTotals);
  assert.ok(Math.abs(e.aov_bruto - (808.55 / 11)) < 0.01);
  assert.ok(Math.abs(e.aov_liquido - (716.20 / 11)) < 0.01);
});

test('AOV com 0 pedidos retorna null, não divide por zero', () => {
  const metaTotals = { spend: 0, lpv: 0, compra_meta: 0, receita_meta: 0 };
  const hotmartTotals = { orders_count: 0, order_bumps_count: 0, gross_revenue: 0, net_revenue: 0, refunds_gross: 0 };
  const e = computeEconomicsMetrics(metaTotals, hotmartTotals);
  assert.equal(e.aov_bruto, null);
  assert.equal(e.aov_liquido, null);
});
