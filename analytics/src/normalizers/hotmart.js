'use strict';

const { MAIN_PRODUCT_NAME, KNOWN_TEST_BUYERS, SALE_STATUSES_COUNTED_AS_REVENUE } = require('../../config/product');

function net(item) {
  return item.purchase.price.value - (item.purchase.hotmart_fee ? item.purchase.hotmart_fee.total : 0);
}

function isTestBuyer(item) {
  return KNOWN_TEST_BUYERS.includes((item.buyer.name || '').trim());
}

function isCountedRevenue(item) {
  return SALE_STATUSES_COUNTED_AS_REVENUE.includes(item.purchase.status);
}

/**
 * Raw da Hotmart (itens de todos os status relevantes) -> transações normalizadas + agregados do dia.
 * Regra: só COMPLETE/APPROVED entram em receita. REFUNDED/CANCELLED/EXPIRED ficam registrados
 * (para os checks de qualidade e para auditoria) mas não contam como venda.
 */
function normalizeHotmart(raw) {
  const transactions = raw.items.map((item) => ({
    transaction_id: item.purchase.transaction,
    order_date_utc: new Date(item.purchase.order_date).toISOString(),
    product_name: item.product.name,
    is_main_product: item.product.name === MAIN_PRODUCT_NAME,
    status: item.purchase.status,
    gross: item.purchase.price.value,
    hotmart_fee: item.purchase.hotmart_fee ? item.purchase.hotmart_fee.total : null,
    net: item.purchase.hotmart_fee ? net(item) : null,
    payment_method: item.purchase.payment ? item.purchase.payment.method : null,
    buyer_name: (item.buyer.name || '').trim(),
    is_known_test_buyer: isTestBuyer(item),
    counted_as_revenue: isCountedRevenue(item) && !isTestBuyer(item),
  }));

  const revenueTx = transactions.filter((t) => t.counted_as_revenue);
  const mainSales = revenueTx.filter((t) => t.is_main_product);
  const orderBumps = revenueTx.filter((t) => !t.is_main_product);
  const refunds = transactions.filter((t) => t.status === 'REFUNDED');
  const cancellationsOrExpired = transactions.filter((t) => ['CANCELLED', 'EXPIRED'].includes(t.status));
  const testTransactions = transactions.filter((t) => t.is_known_test_buyer);

  const gross_revenue = revenueTx.reduce((s, t) => s + t.gross, 0);
  const net_revenue = revenueTx.reduce((s, t) => s + (t.net ?? 0), 0);
  const hotmart_fee_total = revenueTx.reduce((s, t) => s + (t.hotmart_fee ?? 0), 0);

  return {
    date: raw.date,
    transactions,
    totals: {
      orders_count: mainSales.length, // 1 "pedido" = 1 venda do produto principal contada como receita
      order_bumps_count: orderBumps.length,
      gross_revenue,
      net_revenue,
      hotmart_fee_total,
      refunds_count: refunds.length,
      refunds_gross: refunds.reduce((s, t) => s + t.gross, 0),
      cancellations_or_expired_count: cancellationsOrExpired.length,
      test_transactions_count: testTransactions.length,
    },
  };
}

module.exports = { normalizeHotmart };
