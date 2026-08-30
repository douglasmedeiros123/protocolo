'use strict';

const env = require('../../../config/env');

// PASSO 18.5, item 21 — health check por connector, SEM NUNCA vazar credencial (nem no valor
// retornado, nem em mensagem de erro — qualquer erro real é sanitizado antes de retornar).
const HEALTH_STATES = ['AUTHENTICATED', 'UNAUTHENTICATED', 'EXPIRED', 'PERMISSION_DENIED', 'RATE_LIMITED', 'API_ERROR', 'NOT_CONFIGURED'];

// nunca deixa passar um token/segredo acidentalmente parado numa mensagem de erro real (defesa
// em profundidade — mesmo que uma lib de terceiro inclua o valor no corpo do erro).
function sanitizeErrorMessage(message, secretsToRedact = []) {
  let safe = String(message || '');
  for (const secret of secretsToRedact) {
    if (secret) safe = safe.split(secret).join('[REDACTED]');
  }
  return safe;
}

function classifyHttpError(status) {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  return 'API_ERROR';
}

async function checkMetaHealth() {
  const { ok, missing } = env.status().meta;
  if (!ok) return { platform: 'META', health: 'NOT_CONFIGURED', missing_credentials: missing };
  try {
    const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID } = env.get('meta');
    const url = new URL(`https://graph.facebook.com/v20.0/${META_AD_ACCOUNT_ID}`);
    url.searchParams.set('fields', 'id,name');
    url.searchParams.set('access_token', META_ACCESS_TOKEN);
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) return { platform: 'META', health: classifyHttpError(json.error.code === 190 ? 401 : res.status), reason: sanitizeErrorMessage(json.error.message, [META_ACCESS_TOKEN]) };
    return { platform: 'META', health: 'AUTHENTICATED', account_id_confirmed: json.id === META_AD_ACCOUNT_ID };
  } catch (e) {
    return { platform: 'META', health: 'API_ERROR', reason: sanitizeErrorMessage(e.message) };
  }
}

async function checkHotmartHealth() {
  const { ok, missing } = env.status().hotmart;
  if (!ok) return { platform: 'HOTMART', health: 'NOT_CONFIGURED', missing_credentials: missing };
  try {
    const { HOTMART_CLIENT_ID, HOTMART_CLIENT_SECRET } = env.get('hotmart');
    const url = new URL('https://api-sec-vlc.hotmart.com/security/oauth/token');
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', HOTMART_CLIENT_ID);
    url.searchParams.set('client_secret', HOTMART_CLIENT_SECRET);
    const auth = Buffer.from(`${HOTMART_CLIENT_ID}:${HOTMART_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}` } });
    const json = await res.json();
    if (!json.access_token) return { platform: 'HOTMART', health: classifyHttpError(res.status), reason: sanitizeErrorMessage(JSON.stringify(json), [HOTMART_CLIENT_SECRET]) };
    return { platform: 'HOTMART', health: 'AUTHENTICATED' };
  } catch (e) {
    return { platform: 'HOTMART', health: 'API_ERROR', reason: sanitizeErrorMessage(e.message) };
  }
}

async function checkClarityHealth() {
  const { ok, missing } = env.status().clarity;
  if (!ok) return { platform: 'CLARITY', health: 'NOT_CONFIGURED', missing_credentials: missing };
  try {
    const { CLARITY_API_TOKEN } = env.get('clarity');
    const url = new URL('https://www.clarity.ms/export-data/api/v1/project-live-insights');
    url.searchParams.set('numOfDays', '1');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${CLARITY_API_TOKEN}` } });
    const json = await res.json();
    if (json.error) return { platform: 'CLARITY', health: classifyHttpError(res.status), reason: sanitizeErrorMessage(JSON.stringify(json.error), [CLARITY_API_TOKEN]) };
    return { platform: 'CLARITY', health: 'AUTHENTICATED' };
  } catch (e) {
    return { platform: 'CLARITY', health: 'API_ERROR', reason: sanitizeErrorMessage(e.message) };
  }
}

async function checkGithubHealth() {
  const { ok, missing } = env.status().github;
  if (!ok) return { platform: 'GITHUB', health: 'NOT_CONFIGURED', missing_credentials: missing };
  try {
    const { ANALYTICS_GITHUB_TOKEN, GITHUB_REPO } = env.get('github');
    const url = new URL(`https://api.github.com/repos/${GITHUB_REPO}`);
    const res = await fetch(url, { headers: { Authorization: `token ${ANALYTICS_GITHUB_TOKEN}` } });
    const json = await res.json();
    if (res.status !== 200) return { platform: 'GITHUB', health: classifyHttpError(res.status), reason: sanitizeErrorMessage(json.message, [ANALYTICS_GITHUB_TOKEN]) };
    return { platform: 'GITHUB', health: 'AUTHENTICATED', repo_confirmed: json.full_name === GITHUB_REPO };
  } catch (e) {
    return { platform: 'GITHUB', health: 'API_ERROR', reason: sanitizeErrorMessage(e.message) };
  }
}

// Vercel nunca teve credencial própria (deploy via Git) — health é sempre NOT_CONFIGURED por
// design, nunca um erro (item 18, PASSO 18.5: não introduzir token desnecessário).
function checkVercelHealth() {
  return { platform: 'VERCEL', health: 'NOT_CONFIGURED', reason: 'nenhum token Vercel é necessário — deploy funciona via GitHub->Vercel nativo (confirmado real no PASSO 18).' };
}

async function checkAllConnectorsHealth() {
  const [meta, hotmart, clarity, github] = await Promise.all([checkMetaHealth(), checkHotmartHealth(), checkClarityHealth(), checkGithubHealth()]);
  return { META: meta, HOTMART: hotmart, CLARITY: clarity, GITHUB: github, VERCEL: checkVercelHealth() };
}

module.exports = { HEALTH_STATES, sanitizeErrorMessage, checkMetaHealth, checkHotmartHealth, checkClarityHealth, checkGithubHealth, checkVercelHealth, checkAllConnectorsHealth };
