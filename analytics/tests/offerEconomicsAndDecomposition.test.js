'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeOfferEconomics, computeComponentRefundRates } = require('../src/offer/economics');
const { decomposeAov } = require('../src/offer/aovDecomposition');
const { buildRealRevenueTree } = require('../src/offer/revenueTree');
const { computeIncrementalRevenuePerBuyer, computeObservedIncrementalRevenuePerBuyer } = require('../src/offer/incrementalRevenue');
const { dateRange } = require('../src/utils/dates');

const DATES = dateRange('2026-07-30', '2026-08-28');

test('economics: gross vs net são campos DISTINTOS, nunca confundidos', () => {
  const econ = computeOfferEconomics(DATES);
  assert.notEqual(econ.gross_revenue, econ.net_revenue);
  assert.notEqual(econ.gross_aov, econ.net_aov);
  assert.ok(econ.gross_revenue > econ.net_revenue); // líquido sempre <= bruto
});

test('economics: Hotmart é a fonte de verdade — nenhum campo vem de Meta', () => {
  const econ = computeOfferEconomics(DATES);
  assert.match(econ.source, /Hotmart/);
  assert.doesNotMatch(econ.source, /Meta/);
});

test('economics: refund_amount e refund_rate calculados a partir de dado real', () => {
  const econ = computeOfferEconomics(DATES);
  assert.equal(typeof econ.refunds_count, 'number');
  assert.equal(typeof econ.refund_amount, 'number');
  assert.ok(econ.refund_rate >= 0 && econ.refund_rate <= 1);
});

test('component refund rate: atribuído via is_main_product real, NUNCA distribuído proporcionalmente', () => {
  const r = computeComponentRefundRates(DATES);
  assert.match(r.note, /nunca distribuído proporcionalmente/);
  // dado real: o único refund do período é do produto principal, nenhum bump foi reembolsado
  assert.equal(r.order_bump_refund_rate, 0);
  assert.ok(r.main_product_refund_rate > 0);
});

test('component refund rate: quando não há transação nenhuma no período, vira UNKNOWN (nunca 0 forçado)', () => {
  const r = computeComponentRefundRates([]); // período vazio
  assert.equal(r.main_product_refund_rate, 'UNKNOWN');
  assert.equal(r.order_bump_refund_rate, 'UNKNOWN');
});

test('AOV decomposition: componentes conhecidos somam ao gross_aov agregado (reconciliação real, nunca forçada)', () => {
  const econ = computeOfferEconomics(DATES);
  const decomp = decomposeAov(econ);
  assert.equal(decomp.reconciliation.matches_gross_aov, true);
});

test('AOV decomposition: bundle/upsell/downsell inexistentes viram NOT_IMPLEMENTED, nunca 0', () => {
  const econ = computeOfferEconomics(DATES);
  const decomp = decomposeAov(econ);
  assert.equal(decomp.components.bundle_contribution, 'NOT_IMPLEMENTED');
  assert.equal(decomp.components.upsell_contribution, 'NOT_IMPLEMENTED');
  assert.equal(decomp.components.downsell_contribution, 'NOT_IMPLEMENTED');
});

test('AOV decomposition: net_revenue_per_buyer é o mesmo conceito que net_aov, nomeado explicitamente (item 11)', () => {
  const econ = computeOfferEconomics(DATES);
  const decomp = decomposeAov(econ);
  assert.equal(decomp.net_revenue_per_buyer, decomp.net_aov);
});

test('incremental revenue: nunca inventa taxa — price/rate ausentes viram null, não 0', () => {
  const r = computeIncrementalRevenuePerBuyer({ price: null, netPriceIfKnown: null, rate: null });
  assert.equal(r.gross_incremental_revenue_per_buyer, null);
  assert.equal(r.net_incremental_revenue_per_buyer, null);
});

test('incremental revenue: gross = price * rate; net só quando net_price_if_known existe', () => {
  const r = computeIncrementalRevenuePerBuyer({ price: 20, netPriceIfKnown: 17, rate: 0.25 });
  assert.equal(r.gross_incremental_revenue_per_buyer, 5);
  assert.equal(r.net_incremental_revenue_per_buyer, 4.25);
});

test('incremental revenue observada: usa receita/attach REAL do período, não simulado', () => {
  const r = computeObservedIncrementalRevenuePerBuyer({ grossRevenue: 100, netRevenue: 80, buyers: 10 });
  assert.equal(r.gross_incremental_revenue_per_buyer, 10);
  assert.equal(r.net_incremental_revenue_per_buyer, 8);
});

test('revenue tree: sem dupla contagem — bump e pós-compra são galhos separados', () => {
  const econ = computeOfferEconomics(DATES);
  const decomp = decomposeAov(econ);
  const tree = buildRealRevenueTree(econ, decomp);
  assert.equal(tree.buyer.post_purchase.upsell.gross_revenue_per_buyer, 'NOT_IMPLEMENTED');
  assert.equal(tree.buyer.post_purchase.downsell_path.gross_revenue_per_buyer, 'NOT_IMPLEMENTED');
  assert.equal(tree.expected_gross_revenue_per_buyer, econ.gross_aov);
});

test('revenue tree: attach_rate do bump está presente e é o mesmo valor real da economia agregada', () => {
  const econ = computeOfferEconomics(DATES);
  const decomp = decomposeAov(econ);
  const tree = buildRealRevenueTree(econ, decomp);
  assert.equal(tree.buyer.bumps.attach_rate, econ.order_bump_attach_rate);
});
