'use strict';

const { safeDiv } = require('./safeDiv');

/**
 * Métricas de funil a partir dos totais normalizados da Meta (por dia). Todas puramente
 * determinísticas — mesma fórmula usada manualmente (engine.js) a sessão inteira.
 * Retorna null onde a divisão não é possível, nunca 0 forçado nem estimativa.
 */
function computeFunnelMetrics(metaTotals) {
  const { spend, impressions, clicks, lpv, checkout, compra_meta } = metaTotals;
  return {
    ctr: safeDiv(clicks, impressions), // fração (não %) — multiplique por 100 na apresentação
    cpm: safeDiv(spend, impressions) !== null ? safeDiv(spend, impressions) * 1000 : null,
    cpc: safeDiv(spend, clicks),
    custo_por_lpv: safeDiv(spend, lpv),
    taxa_lpv_checkout: safeDiv(checkout, lpv),
    taxa_checkout_compra: safeDiv(compra_meta, checkout),
  };
}

module.exports = { computeFunnelMetrics };
