'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/fs');
const { safeDiv } = require('../metrics/safeDiv');

const DEFAULT_DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

function listAvailableDates(dataDir = DEFAULT_DAILY_DIR) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

/**
 * Descobre e agrega criativos REAIS a partir do que o Meta já reportou por anúncio
 * (analytics/data/daily/*.json -> meta.by_ad) — NUNCA chama API, só lê o que já foi coletado.
 * Agrupa por (ad_id, ad_name) — ad_id é a chave estável de verdade; ad_name é só o rótulo
 * legível. Soma quantidades ADITIVAS ao longo dos dias (mesmo princípio de profit/aggregate.js
 * — nunca média de razão diária, sempre soma-e-recalcula no fim).
 */
function aggregateCreativeMetrics(dates, dataDir = DEFAULT_DAILY_DIR) {
  const byAdId = new Map();

  for (const date of dates) {
    const snapshot = readJson(path.join(dataDir, `${date}.json`));
    if (!snapshot || !snapshot.meta || !snapshot.meta.by_ad) continue;

    for (const r of snapshot.meta.by_ad) {
      if (!byAdId.has(r.ad_id)) {
        byAdId.set(r.ad_id, {
          ad_id: r.ad_id, ad_name: r.ad_name, campaign_name: r.campaign_name, adset_name: r.adset_name,
          spend: 0, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0, receita_meta: 0,
          days_with_spend: 0, first_seen_at: date, last_seen_at: date,
        });
      }
      const t = byAdId.get(r.ad_id);
      t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks;
      t.lpv += r.lpv; t.checkout += r.checkout; t.compra_meta += r.compra_meta; t.receita_meta += r.receita_meta;
      if (r.spend > 0) t.days_with_spend += 1;
      if (date < t.first_seen_at) t.first_seen_at = date;
      if (date > t.last_seen_at) t.last_seen_at = date;
    }
  }

  const results = [];
  for (const t of byAdId.values()) {
    results.push({
      ad_id: t.ad_id,
      ad_name: t.ad_name,
      campaign_name: t.campaign_name,
      adset_name: t.adset_name,
      performance: {
        spend: Math.round(t.spend * 100) / 100,
        impressions: t.impressions,
        reach: null, // não coletado pelo Data Agent hoje — nunca inventado
        frequency: null, // idem
        clicks: t.clicks,
        lpv: t.lpv,
        checkout: t.checkout,
        meta_purchases: t.compra_meta,
        meta_revenue: Math.round(t.receita_meta * 100) / 100,
        cpm: safeDiv(t.spend * 1000, t.impressions),
        ctr: safeDiv(t.clicks, t.impressions),
        cpc: safeDiv(t.spend, t.clicks),
        cost_per_lpv: safeDiv(t.spend, t.lpv),
        cost_per_checkout: safeDiv(t.spend, t.checkout),
        lpv_to_checkout_rate: safeDiv(t.checkout, t.lpv),
        checkout_to_meta_purchase_rate: safeDiv(t.compra_meta, t.checkout),
        meta_cpa: safeDiv(t.spend, t.compra_meta),
        roas_marketing: safeDiv(t.receita_meta, t.spend),
        // Financeiro (Hotmart) por criativo NÃO existe hoje — Hotmart não recebe nenhum
        // identificador de anúncio/criativo na transação (ver checagem real feita na sessão:
        // hotmart.transactions não tem ad_id/utm). Nunca inventado — sempre explícito.
        financial_buyers: null,
        financial_revenue: null,
        financial_roas: null,
        financial_attribution: 'NOT_AVAILABLE — Hotmart não recebe ad_id/UTM na transação; meta_purchases != financial buyers reais.',
      },
      fatigue: {
        first_seen_at: t.first_seen_at,
        last_seen_at: t.last_seen_at,
        days_running: t.days_with_spend,
        // trends exigem série temporal comparável (ex: CTR por semana) — não construída ainda
        // nesta etapa; ficam null pra nunca inventar uma tendência sem cálculo real por trás.
        ctr_trend: null,
        cpa_trend: null,
        roas_trend: null,
      },
    });
  }

  return results;
}

module.exports = { aggregateCreativeMetrics, listAvailableDates, DEFAULT_DAILY_DIR };
