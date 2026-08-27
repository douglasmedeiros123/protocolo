'use strict';

function actionValue(actions, type) {
  const found = (actions || []).find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

/**
 * Raw da Meta (por anúncio) -> registros normalizados por anúncio + totais do dia.
 * `compra_meta`/`receita_meta` usam action_type 'purchase' com fallback pra 'omni_purchase'
 * (mesmo critério usado manualmente a sessão inteira — omni_purchase aparece em alguns dias
 * no lugar de purchase, dependendo de como o evento foi atribuído).
 */
function normalizeMeta(raw) {
  const byAd = (raw.rows || []).map((r) => {
    const acts = r.actions || [];
    const vals = r.action_values || [];
    const compra = actionValue(acts, 'purchase') || actionValue(acts, 'omni_purchase');
    const receita = actionValue(vals, 'purchase') || actionValue(vals, 'omni_purchase');
    return {
      campaign_id: r.campaign_id, campaign_name: r.campaign_name,
      adset_id: r.adset_id, adset_name: r.adset_name,
      ad_id: r.ad_id, ad_name: r.ad_name,
      spend: parseFloat(r.spend || 0),
      impressions: parseInt(r.impressions || 0, 10),
      clicks: parseInt(r.clicks || 0, 10),
      cpm: parseFloat(r.cpm || 0),
      ctr: parseFloat(r.ctr || 0),
      lpv: actionValue(acts, 'landing_page_view'),
      checkout: actionValue(acts, 'initiate_checkout'),
      compra_meta: compra,
      receita_meta: receita,
    };
  });

  const totals = byAd.reduce((t, r) => ({
    spend: t.spend + r.spend,
    impressions: t.impressions + r.impressions,
    clicks: t.clicks + r.clicks,
    lpv: t.lpv + r.lpv,
    checkout: t.checkout + r.checkout,
    compra_meta: t.compra_meta + r.compra_meta,
    receita_meta: t.receita_meta + r.receita_meta,
  }), { spend: 0, impressions: 0, clicks: 0, lpv: 0, checkout: 0, compra_meta: 0, receita_meta: 0 });

  return {
    date: raw.date,
    ad_account_id: raw.ad_account_id,
    by_ad: byAd,
    totals,
  };
}

module.exports = { normalizeMeta };
