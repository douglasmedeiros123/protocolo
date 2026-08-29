'use strict';

const { aggregatePeriod } = require('../profit/aggregate');
const { safeDiv } = require('../metrics/safeDiv');

/**
 * buildCurrentFunnelMetrics() — item 18. Reusa profit/aggregate.js (nunca fórmula paralela).
 * Distingue explicitamente financial purchase (Hotmart, orders_count) de Meta purchase
 * (compra_meta) — a mesma disciplina de PASSO 11.1 aplicada ao funil.
 */
function buildCurrentFunnelMetrics(dates, dataDir) {
  const agg = aggregatePeriod(dates, dataDir);
  const { sum } = agg;

  return {
    period: { dates_requested: dates.length, days_found: agg.days_found.length, data_completeness: agg.data_completeness },
    impressions: sum.impressions,
    clicks: sum.clicks,
    lpv: sum.lpv,
    checkout_initiated: sum.checkout,
    meta_purchases: sum.compra_meta,
    financial_purchases: sum.orders_count, // Hotmart real — nunca confundido com meta_purchases
    cancelled_or_expired_transactions: sum.cancellations_or_expired_count, // sinal real de abandono de checkout (Hotmart) — item 5
    rates: {
      ctr: safeDiv(sum.clicks, sum.impressions),
      lpv_to_checkout_rate: safeDiv(sum.checkout, sum.lpv),
      checkout_to_meta_purchase_rate: safeDiv(sum.compra_meta, sum.checkout),
      checkout_to_financial_purchase_rate: safeDiv(sum.orders_count, sum.checkout),
      meta_purchase_vs_financial_purchase_ratio: safeDiv(sum.compra_meta, sum.orders_count), // >1 = sinal de compra fantasma (ver tracking_scopes)
    },
    note: 'financial_purchases (Hotmart) é a fonte de verdade; meta_purchases (pixel) pode incluir eventos fantasma — nunca tratados como equivalentes (PASSO 11.1).',
    source: 'profit/aggregate.js — mesmo engine usado por Profit/Decision/Offer/Planner, nunca recalculado com fórmula própria.',
  };
}

module.exports = { buildCurrentFunnelMetrics };
