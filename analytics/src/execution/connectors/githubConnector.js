'use strict';

const { collectGithub } = require('../../collectors/github');
const env = require('../../../config/env');

// PASSO 18.5, item 17 — READ_REPO apenas. WORKFLOW_EXECUTION e SECRETS_ACCESS nunca foram
// solicitados/usados por este projeto — nunca implementados aqui.
async function readRepoStatus(dateStr) {
  const { ok } = env.status().github;
  if (!ok) return { available: false, reason: 'CREDENTIAL_SETUP_REQUIRED', platform: 'GITHUB' };
  const raw = await collectGithub(dateStr);
  return { available: true, platform: 'GITHUB', date: dateStr, repo: raw.repo, commits: raw.commits };
}

const CAPABILITY_SCOPES = {
  READ_REPO: 'IMPLEMENTED (analytics/src/collectors/github.js).',
  WRITE_REPO: 'usado diretamente via git CLI nesta sessão (commit/push) — nunca via este connector/adapter tipado.',
  WORKFLOW_EXECUTION: 'NOT_IMPLEMENTED — nunca solicitado.',
  SECRETS_ACCESS: 'NEVER — este projeto nunca cria endpoint pra retornar valor de secret (item 17, regra crítica).',
};

module.exports = { readRepoStatus, CAPABILITY_SCOPES };
