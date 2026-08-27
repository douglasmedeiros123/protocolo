'use strict';

const env = require('../../config/env');
const { brtDayBounds } = require('../utils/dates');

const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history';

// A consulta "sem filtro" da Hotmart não devolve REFUNDED/CANCELLED/EXPIRED (confirmado
// empiricamente nesta sessão) — só o status default (aprovadas/completas). Para enxergar
// reembolsos e tentativas falhas (necessário pros flags de data quality), é preciso pedir
// cada status explicitamente.
const EXTRA_STATUSES = ['REFUNDED', 'CANCELLED', 'EXPIRED'];

async function getAccessToken({ HOTMART_CLIENT_ID, HOTMART_CLIENT_SECRET }) {
  const url = new URL(TOKEN_URL);
  url.searchParams.set('grant_type', 'client_credentials');
  url.searchParams.set('client_id', HOTMART_CLIENT_ID);
  url.searchParams.set('client_secret', HOTMART_CLIENT_SECRET);
  const auth = Buffer.from(`${HOTMART_CLIENT_ID}:${HOTMART_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}` } });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Hotmart OAuth falhou: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function fetchSales(accessToken, startMs, endMs, transactionStatus) {
  const url = new URL(SALES_URL);
  url.searchParams.set('start_date', String(startMs));
  url.searchParams.set('end_date', String(endMs));
  url.searchParams.set('max_results', '200');
  if (transactionStatus) url.searchParams.set('transaction_status', transactionStatus);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (json.error) throw new Error(`Hotmart sales/history error: ${JSON.stringify(json.error)}`);
  return json.items || [];
}

/** Coleta transações Hotmart (todos os status relevantes) para UM dia BRT. */
async function collectHotmart(dateStr) {
  const creds = env.get('hotmart');
  const { startMs, endMs } = brtDayBounds(dateStr);

  const accessToken = await getAccessToken(creds);

  const defaultItems = await fetchSales(accessToken, startMs, endMs, undefined);
  const extraLists = await Promise.all(
    EXTRA_STATUSES.map((status) => fetchSales(accessToken, startMs, endMs, status))
  );

  const byTransaction = new Map();
  for (const item of [...defaultItems, ...extraLists.flat()]) {
    // dedupe pelo id real da transação — evita duplicar se um status aparecer em mais de uma lista
    byTransaction.set(item.purchase.transaction, item);
  }

  // A API da Hotmart não garante ordem estável entre chamadas para o mesmo intervalo — sem essa
  // ordenação, duas coletas idênticas produziriam arquivos com diff textual (itens em ordem
  // diferente) mesmo sem nenhuma mudança real, quebrando a checagem de "só commitar se mudou".
  const items = [...byTransaction.values()].sort((a, b) =>
    a.purchase.transaction.localeCompare(b.purchase.transaction)
  );

  return {
    source: 'hotmart',
    date: dateStr,
    fetched_at: new Date().toISOString(),
    window: { startMs, endMs },
    items,
  };
}

module.exports = { collectHotmart };
