'use strict';

const path = require('path');
const { readJson } = require('../utils/fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Lê os snapshots diários já persistidos (analytics/data/daily/) para uma lista de datas —
 * NUNCA consulta API nenhuma. Soma as quantidades ADITIVAS (gasto, receita, pedidos...) em vez
 * de fazer média de razões já calculadas (ROAS/CPA médio de médias distorce — Simpson's paradox
 * na prática); as razões (ROAS, CPA, AOV) são recalculadas uma vez, no fim, sobre a soma.
 */
function aggregatePeriod(dates, dataDir = DATA_DIR) {
  const daysFound = [];
  const daysMissing = [];
  const criticalFlagsByDay = [];

  const sum = {
    spend: 0, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0, receita_meta: 0,
    gross_revenue: 0, net_revenue: 0, hotmart_fee_total: 0,
    orders_count: 0, order_bumps_count: 0,
    order_bump_gross: 0, order_bump_net: 0,
    refunds_count: 0, refunds_gross: 0,
    cancellations_or_expired_count: 0, test_transactions_count: 0,
  };

  for (const date of dates) {
    const snapshot = readJson(path.join(dataDir, 'daily', `${date}.json`));
    if (!snapshot) {
      daysMissing.push(date);
      continue;
    }
    daysFound.push(date);

    if (snapshot.meta) {
      const m = snapshot.meta.totals;
      sum.spend += m.spend; sum.impressions += m.impressions; sum.clicks += m.clicks;
      sum.lpv += m.lpv; sum.checkout += m.checkout;
      sum.compra_meta += m.compra_meta; sum.receita_meta += m.receita_meta;
    }

    if (snapshot.hotmart) {
      const h = snapshot.hotmart.totals;
      sum.gross_revenue += h.gross_revenue; sum.net_revenue += h.net_revenue;
      sum.hotmart_fee_total += h.hotmart_fee_total;
      sum.orders_count += h.orders_count; sum.order_bumps_count += h.order_bumps_count;
      sum.refunds_count += h.refunds_count; sum.refunds_gross += h.refunds_gross;
      sum.cancellations_or_expired_count += h.cancellations_or_expired_count;
      sum.test_transactions_count += h.test_transactions_count;

      for (const t of snapshot.hotmart.transactions || []) {
        if (t.counted_as_revenue && !t.is_main_product) {
          sum.order_bump_gross += t.gross;
          sum.order_bump_net += t.net ?? 0;
        }
      }
    }

    if (snapshot.has_critical_flags) {
      criticalFlagsByDay.push({ date, codes: snapshot.critical_flag_codes || [] });
    }
  }

  return {
    dates_requested: dates,
    days_found: daysFound,
    days_missing: daysMissing,
    data_completeness: dates.length ? daysFound.length / dates.length : null,
    critical_flags_by_day: criticalFlagsByDay,
    sum,
  };
}

module.exports = { aggregatePeriod };
