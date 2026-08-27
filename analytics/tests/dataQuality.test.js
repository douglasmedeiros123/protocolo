'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkMetaPurchaseWithoutHotmartSale,
  checkSuspiciousRepeatedPurchaseValue,
  checkNegativeOrImpossibleRevenue,
  checkCpaInconsistent,
  checkDuplicateTransaction,
  checkSuddenMetricChange,
} = require('../src/metrics/dataQuality');

function tx({ id, gross, net, counted = true }) {
  return { transaction_id: id, gross, net, counted_as_revenue: counted, is_main_product: true };
}

test('Purchase fantasma: Meta reporta compra sem venda real na Hotmart (caso real Apple Pay 25/08)', () => {
  const meta = { totals: { compra_meta: 2 } };
  const hotmart = { totals: { orders_count: 0, order_bumps_count: 0 } };
  const flag = checkMetaPurchaseWithoutHotmartSale(meta, hotmart);
  assert.ok(flag);
  assert.equal(flag.code, 'META_PURCHASE_WITHOUT_HOTMART_SALE');
  assert.equal(flag.details.delta, 2);
});

test('Sem Purchase fantasma quando a contagem bate', () => {
  const meta = { totals: { compra_meta: 1 } };
  const hotmart = { totals: { orders_count: 1, order_bumps_count: 0 } };
  const flag = checkMetaPurchaseWithoutHotmartSale(meta, hotmart);
  assert.equal(flag, null);
});

test('valor de Purchase suspeitamente repetido: não bate com nenhuma transação real (caso real R$56,88)', () => {
  const meta = { totals: { compra_meta: 1, receita_meta: 56.88 } };
  const hotmart = { transactions: [tx({ id: 'HP1', gross: 67, net: 59.37 })] };
  const flag = checkSuspiciousRepeatedPurchaseValue(meta, hotmart);
  assert.ok(flag);
  assert.equal(flag.code, 'SUSPICIOUS_REPEATED_PURCHASE_VALUE');
});

test('sem flag quando o valor da Meta bate com o valor líquido real', () => {
  const meta = { totals: { compra_meta: 1, receita_meta: 59.37 } };
  const hotmart = { transactions: [tx({ id: 'HP1', gross: 67, net: 59.37 })] };
  const flag = checkSuspiciousRepeatedPurchaseValue(meta, hotmart);
  assert.equal(flag, null);
});

test('sem flag quando o valor da Meta bate com o valor bruto real', () => {
  const meta = { totals: { compra_meta: 1, receita_meta: 67 } };
  const hotmart = { transactions: [tx({ id: 'HP1', gross: 67, net: 59.37 })] };
  const flag = checkSuspiciousRepeatedPurchaseValue(meta, hotmart);
  assert.equal(flag, null);
});

test('receita negativa é sinalizada como impossível', () => {
  const meta = { totals: { receita_meta: -10 } };
  const hotmart = { totals: { gross_revenue: 100, net_revenue: 90 } };
  const flags = checkNegativeOrImpossibleRevenue(meta, hotmart);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].code, 'NEGATIVE_OR_IMPOSSIBLE_REVENUE');
});

test('CPA inconsistente quando meta e financeiro divergem muito (>3x)', () => {
  const economics = { cpa_meta: 30, cpa_financeiro: 110 };
  const flag = checkCpaInconsistent(economics);
  assert.ok(flag);
  assert.equal(flag.code, 'CPA_INCONSISTENT');
});

test('CPA não é sinalizado quando a divergência é pequena', () => {
  const economics = { cpa_meta: 86.27, cpa_financeiro: 109.79 };
  const flag = checkCpaInconsistent(economics);
  assert.equal(flag, null);
});

test('deduplicação: transaction_id duplicado é detectado', () => {
  const hotmart = { transactions: [tx({ id: 'HP1', gross: 67, net: 59.37 }), tx({ id: 'HP1', gross: 67, net: 59.37 })] };
  const flag = checkDuplicateTransaction(hotmart);
  assert.ok(flag);
  assert.equal(flag.code, 'DUPLICATE_TRANSACTION');
  assert.deepEqual(flag.details.duplicate_ids, ['HP1']);
});

test('sem transaction_id duplicado, sem flag', () => {
  const hotmart = { transactions: [tx({ id: 'HP1', gross: 67, net: 59.37 }), tx({ id: 'HP2', gross: 67, net: 59.37 })] };
  const flag = checkDuplicateTransaction(hotmart);
  assert.equal(flag, null);
});

test('mudança brusca de métrica é sinalizada dia-a-dia', () => {
  const economics = { roas_financeiro: 2.0, cpa_financeiro: 50 };
  const previousDaySnapshot = { metrics: { economics: { roas_financeiro: 0.5, cpa_financeiro: 48 } } };
  const flags = checkSuddenMetricChange(economics, previousDaySnapshot);
  const roasFlag = flags.find((f) => f.details.field === 'roas_financeiro');
  assert.ok(roasFlag);
});

test('sem dia anterior, não quebra (retorna null)', () => {
  const economics = { roas_financeiro: 2.0, cpa_financeiro: 50 };
  const flags = checkSuddenMetricChange(economics, null);
  assert.equal(flags, null);
});
