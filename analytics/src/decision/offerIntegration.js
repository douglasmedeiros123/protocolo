'use strict';

const { loadCandidates } = require('../offer/registry');

/**
 * DECISION ENGINE INTEGRATION (PASSO 10, item 41) — função de CONSULTA pura e aditiva, mesmo
 * padrão de decision/creativeIntegration.js e decision/croIntegration.js. NÃO altera
 * decision/builder.js nem a hierarquia de decisão principal.
 */
function getBestOfferCandidate(dir) {
  const candidates = loadCandidates(dir);
  const eligible = candidates.filter((c) => c.causality && c.causality.status !== 'INVALID');
  if (eligible.length === 0) return null;
  const best = [...eligible].sort((a, b) => b.priority_score - a.priority_score)[0];
  return {
    ...best,
    expected_impact: best.expected_effect,
    confidence: best.confidence,
    capital_requirement: best.budget_estimate ?? null,
    risk: best.risk,
  };
}

module.exports = { getBestOfferCandidate };
