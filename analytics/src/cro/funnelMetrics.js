'use strict';

const { aggregatePeriod } = require('../profit/aggregate');
const { safeDiv } = require('../metrics/safeDiv');

/**
 * FUNNEL PERFORMANCE / CURRENT BASELINE (PASSO 9, itens 8-9) — HISTORICAL_FUNNEL_METRICS, pra
 * nunca confundir com o CURRENT_BEHAVIOR_SNAPSHOT do Clarity (ver claritySnapshot.js). Reusa
 * profit/aggregate.js (mesma soma-e-recalcula-no-fim de todo o projeto) — lê SOMENTE
 * analytics/data/daily/, nunca chama API. financial_buyers/financial_revenue/financial_roas só
 * aparecem quando a Hotmart reportou dado real no período; NUNCA atribuídos por seção/LP/
 * criativo (não existe granularidade pra isso).
 */
function computeHistoricalFunnelMetrics(dates, dataDir) {
  const agg = aggregatePeriod(dates, dataDir);
  const { sum } = agg;

  const click_to_lpv_rate = safeDiv(sum.lpv, sum.clicks);
  const lpv_to_checkout_rate = safeDiv(sum.checkout, sum.lpv);
  const checkout_to_meta_purchase_rate = safeDiv(sum.compra_meta, sum.checkout);

  return {
    type: 'HISTORICAL_FUNNEL_METRICS',
    period: { dates_requested: dates.length, days_found: agg.days_found.length, days_missing: agg.days_missing, data_completeness: agg.data_completeness },
    raw: { clicks: sum.clicks, lpv: sum.lpv, checkout: sum.checkout, meta_purchases: sum.compra_meta, spend: sum.spend, gross_revenue: sum.gross_revenue, net_revenue: sum.net_revenue, orders_count: sum.orders_count },
    click_to_lpv_rate,
    lpv_to_checkout_rate,
    checkout_to_meta_purchase_rate,
    financial_buyers: sum.orders_count, // Hotmart real — nunca confundido com meta_purchases (ver nota abaixo)
    financial_revenue_net: sum.net_revenue,
    financial_roas: safeDiv(sum.net_revenue, sum.spend),
    financial_attribution_note: 'financial_buyers/financial_revenue/financial_roas são do FUNIL INTEIRO (toda a conta), nunca atribuídos a uma seção específica da LP, versão de LP ou criativo — não existe granularidade suficiente pra isso hoje. meta_purchases (Meta) e financial_buyers (Hotmart) são contagens DIFERENTES, nunca tratadas como sinônimos.',
    confidence: computeSampleConfidence(sum.lpv, sum.checkout),
  };
}

// Confiança determinística de amostra pro baseline — reusa o mesmo minimum_evidence da
// categoria CRO (evidence.js: lpv=100, checkouts=10), saturando em 100 a 3x o mínimo.
function computeSampleConfidence(lpv, checkout) {
  const { minimumEvidenceFor } = require('../experiments/evidence');
  const min = minimumEvidenceFor('CRO');
  const lpvRatio = min.lpv ? Math.min(3, (lpv || 0) / min.lpv) / 3 : 1;
  const checkoutRatio = min.checkouts ? Math.min(3, (checkout || 0) / min.checkouts) / 3 : 1;
  return Math.round(((lpvRatio + checkoutRatio) / 2) * 100);
}

module.exports = { computeHistoricalFunnelMetrics, computeSampleConfidence };
