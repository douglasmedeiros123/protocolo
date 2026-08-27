'use strict';

const env = require('../../config/env');

const API_VERSION = 'v20.0';
const FIELDS = [
  'campaign_name', 'campaign_id', 'adset_name', 'adset_id', 'ad_name', 'ad_id',
  'spend', 'impressions', 'clicks', 'cpm', 'ctr', 'actions', 'action_values',
].join(',');

/**
 * Coleta insights por anúncio para UM dia (fuso da conta = BRT). Retorna o payload bruto da API
 * (nunca inclui o token — ele só existe como querystring da requisição, nunca no corpo salvo).
 */
async function collectMeta(dateStr) {
  const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID } = env.get('meta');

  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('time_range', JSON.stringify({ since: dateStr, until: dateStr }));
  url.searchParams.set('access_token', META_ACCESS_TOKEN);

  const res = await fetch(url);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Meta API error (${dateStr}): ${json.error.message || JSON.stringify(json.error)}`);
  }

  return {
    source: 'meta',
    date: dateStr,
    fetched_at: new Date().toISOString(),
    ad_account_id: META_AD_ACCOUNT_ID,
    rows: json.data || [],
  };
}

module.exports = { collectMeta };
