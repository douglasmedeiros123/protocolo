'use strict';

// Nenhum segredo vive neste arquivo nem em nenhum outro arquivo versionado. Tudo vem de
// variáveis de ambiente (localmente via .env, carregado manualmente pelo shell — este projeto
// não adiciona a dependência `dotenv` — ou, em automação futura, via GitHub Secrets).
// Ver analytics/.env.example para a lista de variáveis e analytics/README.md para como obter cada uma.

const REQUIRED = {
  meta: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  hotmart: ['HOTMART_CLIENT_ID', 'HOTMART_CLIENT_SECRET'],
  clarity: ['CLARITY_API_TOKEN'],
  github: ['ANALYTICS_GITHUB_TOKEN', 'GITHUB_REPO'],
};

function checkSource(source) {
  const vars = REQUIRED[source];
  if (!vars) throw new Error(`config/env: fonte desconhecida "${source}"`);
  const missing = vars.filter((name) => !process.env[name]);
  return { ok: missing.length === 0, missing };
}

function get(source) {
  const { ok, missing } = checkSource(source);
  if (!ok) {
    throw new Error(
      `Faltam variáveis de ambiente para "${source}": ${missing.join(', ')}. ` +
      `Veja analytics/.env.example.`
    );
  }
  const out = {};
  for (const name of REQUIRED[source]) out[name] = process.env[name];
  return out;
}

/** Não lança erro — usado pelo orquestrador para pular uma fonte ausente e registrar o motivo. */
function status() {
  return Object.fromEntries(Object.keys(REQUIRED).map((s) => [s, checkSource(s)]));
}

module.exports = { get, status, REQUIRED };
