'use strict';

const path = require('path');
const { aggregatePeriod } = require('../profit/aggregate');
const { readJson } = require('../utils/fs');
const { safeDiv } = require('../metrics/safeDiv');

const DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

/**
 * CURRENT ECONOMICS (PASSO 10, item 6) — reusa profit/aggregate.js (mesma soma-e-recalcula do
 * projeto inteiro). Hotmart é a fonte de verdade financeira; Meta Purchase NUNCA é tratado como
 * buyer financeiro aqui (nem sequer é lido pra economia da oferta).
 */
function computeOfferEconomics(dates, dataDir) {
  const agg = aggregatePeriod(dates, dataDir);
  const { sum } = agg;

  return {
    period: { dates_requested: dates.length, days_found: agg.days_found.length, days_missing: agg.days_missing, data_completeness: agg.data_completeness },
    gross_revenue: sum.gross_revenue,
    net_revenue: sum.net_revenue,
    buyers: sum.orders_count,
    gross_aov: safeDiv(sum.gross_revenue, sum.orders_count),
    net_aov: safeDiv(sum.net_revenue, sum.orders_count),
    refunds_count: sum.refunds_count,
    refund_amount: sum.refunds_gross,
    refund_rate: safeDiv(sum.refunds_gross, sum.gross_revenue),
    main_product_revenue: sum.gross_revenue - sum.order_bump_gross, // aproximação aditiva (bruto): total menos bump — nunca dupla contagem
    order_bump_revenue_gross: sum.order_bump_gross,
    order_bump_revenue_net: sum.order_bump_net,
    order_bump_attach_rate: safeDiv(sum.order_bumps_count, sum.orders_count),
    order_bump_attach_rate_metric_type: 'TRANSACTION_LEVEL_PROXY', // linhas de bump / pedidos financeiros — NÃO é buyer-level (ver offer/buyerAttribution.js, PASSO 10.1 item 1-3)
    order_bumps_count: sum.order_bumps_count,
    source: 'Hotmart real (analytics/data/daily/, via profit/aggregate.js) — fonte de verdade financeira única.',
    denominators: {
      // PASSO 10.1, item 8 — gross_aov/net_aov usam FINANCIAL BUYERS (sum.orders_count, transações
      // com counted_as_revenue=true), NUNCA contagem bruta de transações (que incluiria teste/
      // cancelado/expirado/reembolsado). Ver offer/transactionAccounting.js pra decomposição real.
      gross_aov: 'gross_revenue / buyers (financial_buyer_count = transações counted_as_revenue=true) — não transaction count bruto.',
      net_aov: 'net_revenue / buyers (mesmo denominador financeiro de gross_aov).',
      order_bump_attach_rate: 'order_bumps_count (linhas de bump vendidas) / buyers — proxy no nível de TRANSAÇÃO, não de comprador único (ver buyer_level_attach_rate em buyerAttribution.js).',
    },
  };
}

const RELEVANT_STATUSES = new Set(['COMPLETE', 'APPROVED', 'REFUNDED']); // já alcançaram estado de venda — exclui CANCELLED/EXPIRED (nunca viraram venda)

function normalizeName(name) { return String(name || '').trim().toLowerCase(); }

/**
 * Refund por componente (PASSO 10, item 24; refinado no PASSO 10.1, itens 6-7) — só atribuído
 * quando a transação em si já carrega is_main_product; NUNCA distribuído proporcionalmente entre
 * componentes. "refund rate" tem 3 denominadores DIFERENTES e cada um é calculado e documentado
 * separadamente — nunca um único número ambíguo:
 *  - refund_transaction_rate = transações refundadas / transações RELEVANTES (não-teste, status
 *    COMPLETE/APPROVED/REFUNDED — exclui CANCELLED/EXPIRED, que nunca foram venda).
 *  - refund_buyer_rate = compradores refundados distintos / compradores relevantes distintos
 *    (buyer_name normalizado).
 *  - refund_value_rate = valor refundado / receita bruta ANTES da remoção do refund (contada +
 *    refundada).
 * Se relevant_transaction_count===0, todas as três ficam 'UNKNOWN' (nunca 0 — item 10 do PASSO 10).
 */
function computeComponentRefundRates(dates, dataDir = DAILY_DIR) {
  const all = [];
  for (const date of dates) {
    const snapshot = readJson(path.join(dataDir, `${date}.json`));
    if (!snapshot || !snapshot.hotmart) continue;
    for (const t of snapshot.hotmart.transactions || []) all.push(t);
  }

  function computeForComponent(transactions) {
    const relevant = transactions.filter((t) => !t.is_known_test_buyer && RELEVANT_STATUSES.has(t.status));
    const refunded = relevant.filter((t) => t.status === 'REFUNDED');
    const countedGross = relevant.filter((t) => t.counted_as_revenue).reduce((s, t) => s + t.gross, 0);
    const refundedGross = refunded.reduce((s, t) => s + t.gross, 0);
    const relevantBuyers = new Set(relevant.map((t) => normalizeName(t.buyer_name)));
    const refundedBuyers = new Set(refunded.map((t) => normalizeName(t.buyer_name)));

    if (relevant.length === 0) {
      return {
        refund_transaction_rate: 'UNKNOWN', refund_buyer_rate: 'UNKNOWN', refund_value_rate: 'UNKNOWN',
        relevant_transaction_count: 0, relevant_buyer_count: 0,
        refunded_transaction_count: 0, refunded_buyer_count: 0, refunded_gross_amount: 0,
      };
    }

    return {
      refund_transaction_rate: Math.round((refunded.length / relevant.length) * 10000) / 10000,
      refund_buyer_rate: relevantBuyers.size > 0 ? Math.round((refundedBuyers.size / relevantBuyers.size) * 10000) / 10000 : 'UNKNOWN',
      refund_value_rate: (countedGross + refundedGross) > 0 ? Math.round((refundedGross / (countedGross + refundedGross)) * 10000) / 10000 : 'UNKNOWN',
      relevant_transaction_count: relevant.length,
      relevant_buyer_count: relevantBuyers.size,
      refunded_transaction_count: refunded.length,
      refunded_buyer_count: refundedBuyers.size,
      refunded_gross_amount: Math.round(refundedGross * 100) / 100,
    };
  }

  const mainRates = computeForComponent(all.filter((t) => t.is_main_product));
  const bumpRates = computeForComponent(all.filter((t) => !t.is_main_product));

  return {
    main_product: mainRates,
    order_bump: bumpRates,
    // compatibilidade retroativa: mesmos nomes de campo do PASSO 10, agora com denominador CORRIGIDO
    // (transações relevantes, não "todas as transações incluindo teste/cancelado/expirado").
    main_product_refund_rate: mainRates.refund_transaction_rate,
    order_bump_refund_rate: bumpRates.refund_transaction_rate,
    denominators: {
      refund_transaction_rate: 'refunded_transaction_count / relevant_transaction_count — relevant = status COMPLETE/APPROVED/REFUNDED, excluindo CANCELLED/EXPIRED (nunca viraram venda) e is_known_test_buyer=true.',
      refund_buyer_rate: 'refunded_buyer_count (buyer_name normalizado, distinto) / relevant_buyer_count (buyer_name normalizado, distinto) — mesmo universo de transações relevantes acima.',
      refund_value_rate: 'refunded_gross_amount / (receita bruta CONTADA do componente + refunded_gross_amount) — ou seja, receita bruta ANTES da remoção do refund.',
    },
    note: 'Atribuído via is_main_product de cada transação real — nunca distribuído proporcionalmente (item 24). Três taxas com denominadores explicitamente diferentes e documentados (PASSO 10.1, itens 6-7) — nunca um único "refund_rate" ambíguo.',
  };
}

module.exports = { computeOfferEconomics, computeComponentRefundRates };
