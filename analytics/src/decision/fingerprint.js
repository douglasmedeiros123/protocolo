'use strict';

const crypto = require('crypto');
const { canonicalize } = require('../utils/canonical');

/**
 * Fingerprint determinística dos inputs relevantes pra uma decisão (PASSO 7, item 19) — mesmo
 * estado de entrada (mesmos experimentos/status/budget, mesmo snapshot de profit, mesmo estado
 * do Learning Engine, mesmo capital_cycle simulado) sempre produz a MESMA fingerprint. O
 * decision_id é derivado direto dela (ver decision/registry.js), então rodar o Decision Engine
 * duas vezes com o mesmo estado nunca cria decisões duplicadas — sobrescreve o mesmo arquivo.
 */
function computeDecisionFingerprint(inputs) {
  const canonical = canonicalize(inputs);
  const json = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(json).digest('hex');
}

module.exports = { computeDecisionFingerprint };
