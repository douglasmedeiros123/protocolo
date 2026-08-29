'use strict';

// PASSO 15.1, items 1-4 — STALE != FALSE. Uma claim antiga não é um erro; pode ser válida
// historicamente e ainda assim não servir mais pra decisão ATUAL. Nunca apaga história pra
// forçar concordância entre agentes (importante pro aprendizado futuro, item 3).
const TEMPORAL_STATUSES = ['CURRENT_STATE', 'HISTORICAL_STATE', 'STALE_STATE', 'UNKNOWN_FRESHNESS'];

/**
 * buildClaimTemporalStatus() — item 2. Nunca inventa timestamp ausente — freshness fica
 * UNKNOWN_FRESHNESS quando observed_at não é fornecido.
 */
function buildClaimTemporalStatus({ source, observedAt = null, referencePeriod = null, supersededBy = null }) {
  let temporalStatus;
  if (!observedAt && !referencePeriod) temporalStatus = 'UNKNOWN_FRESHNESS';
  else if (supersededBy) temporalStatus = 'STALE_STATE';
  else temporalStatus = 'CURRENT_STATE';

  return {
    source,
    observed_at: observedAt || 'UNKNOWN',
    reference_period: referencePeriod || 'UNKNOWN',
    freshness: observedAt || referencePeriod ? 'KNOWN' : 'UNKNOWN',
    temporal_status: temporalStatus,
    superseded_by: supersededBy,
    // item 2 — STALE_STATE nunca é automaticamente inusável: uma claim histórica continua válida
    // PRA DECISÕES HISTÓRICAS. Só fica inusável PRA DECISÃO ATUAL quando há uma claim mais
    // específica/atual que a substitui (supersededBy != null).
    usable_for_current_decision: temporalStatus === 'CURRENT_STATE',
    usable_for_historical_analysis: true, // NUNCA apagado (item 3)
  };
}

/**
 * buildSupersessionExplanation() — item 3-4. Preserva a claim antiga, marca
 * SUPERSEDED_FOR_CURRENT_DECISION — nunca "apagada" nem tratada como "errada".
 */
function buildSupersessionExplanation({ historicalClaim, currentClaim, reason }) {
  return {
    historical_claim: { ...historicalClaim, status_for_current_decision: 'SUPERSEDED_FOR_CURRENT_DECISION' },
    current_claim: currentClaim,
    explanation: `${historicalClaim.source} não está necessariamente errado(a) — sua claim foi SUPERSEDED_FOR_CURRENT_DECISION por ${currentClaim.source}, mais específico(a)/atualizado(a) pra esta claim. ${reason}`,
    stale_does_not_mean_false: true,
  };
}

module.exports = { TEMPORAL_STATUSES, buildClaimTemporalStatus, buildSupersessionExplanation };
