'use strict';

const { loadCandidates } = require('../creative/registry');

/**
 * DECISION ENGINE INTEGRATION (PASSO 8, item 19) — função de CONSULTA pura e aditiva. NÃO altera
 * decision/builder.js nem a hierarquia de decisão principal (evita regressão). Permite, no
 * futuro, ao Decision Engine perguntar "qual o melhor creative experiment candidate disponível?"
 * sem que o Creative Intelligence Agent precise conhecer o Decision Engine.
 */
function getBestCreativeExperimentCandidate(dir) {
  const candidates = loadCandidates(dir);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.priority_score - a.priority_score)[0];
}

module.exports = { getBestCreativeExperimentCandidate };
