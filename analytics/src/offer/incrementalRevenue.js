'use strict';

const { safeDiv } = require('../metrics/safeDiv');

// INCREMENTAL REVENUE PER BUYER (PASSO 10, item 12) — price × rate (attach ou take), em bruto e
// em líquido quando o preço líquido for conhecido. Nunca inventa taxa: se attach/take rate ou
// preço forem null/desconhecidos, o resultado fica null (nunca 0).
function computeIncrementalRevenuePerBuyer({ price, netPriceIfKnown, rate }) {
  const gross = price != null && rate != null ? Math.round(price * rate * 100) / 100 : null;
  const effectiveNetPrice = netPriceIfKnown ?? null;
  const net = effectiveNetPrice != null && rate != null ? Math.round(effectiveNetPrice * rate * 100) / 100 : null;
  return {
    gross_incremental_revenue_per_buyer: gross,
    net_incremental_revenue_per_buyer: net,
    inputs_used: { price, net_price_if_known: netPriceIfKnown, rate },
  };
}

/** A partir de dado REAL já observado (não hipotético) — usa a receita/attach real, não simulado. */
function computeObservedIncrementalRevenuePerBuyer({ grossRevenue, netRevenue, buyers }) {
  return {
    gross_incremental_revenue_per_buyer: safeDiv(grossRevenue, buyers),
    net_incremental_revenue_per_buyer: safeDiv(netRevenue, buyers),
  };
}

module.exports = { computeIncrementalRevenuePerBuyer, computeObservedIncrementalRevenuePerBuyer };
