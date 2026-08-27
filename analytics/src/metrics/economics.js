'use strict';

const { safeDiv } = require('./safeDiv');

/**
 * Economia unitária do dia, cruzando totais Meta (metaTotals) com totais Hotmart (hotmartTotals).
 * "Financeiro" = baseado em venda real confirmada na Hotmart (COMPLETE/APPROVED, sem teste).
 * "Meta" = baseado no que o pixel/API da Meta reporta (pode divergir — ver data quality).
 */
function computeEconomicsMetrics(metaTotals, hotmartTotals) {
  const { spend, lpv, compra_meta, receita_meta } = metaTotals;
  const { orders_count, order_bumps_count, gross_revenue, net_revenue, refunds_gross } = hotmartTotals;

  const totalOrdersIncludingBumps = orders_count; // AOV é por PEDIDO do produto principal, bump é add-on do mesmo pedido

  return {
    cpa_meta: safeDiv(spend, compra_meta),
    cpa_financeiro: safeDiv(spend, orders_count),
    roas_meta: safeDiv(receita_meta, spend),
    roas_financeiro: safeDiv(net_revenue, spend),
    aov_bruto: safeDiv(gross_revenue, totalOrdersIncludingBumps),
    aov_liquido: safeDiv(net_revenue, totalOrdersIncludingBumps),
    receita_por_visitante: safeDiv(net_revenue, lpv),
    taxa_reembolso: safeDiv(refunds_gross, gross_revenue),
    order_bump_attach_rate: safeDiv(order_bumps_count, orders_count),
  };
}

module.exports = { computeEconomicsMetrics };
