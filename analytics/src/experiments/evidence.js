'use strict';

// Limiares mínimos ANTES de qualquer conclusão (SUCCESS/FAILURE/INCONCLUSIVE) — evita decidir
// em cima de amostra pequena demais (mesmo princípio dos intervalos de Wilson já usados no
// dashboard de decisão). Documentado por categoria porque o volume necessário pra confiar num
// resultado muda conforme a etapa do funil que o experimento mexe.
const MINIMUM_EVIDENCE_BY_CATEGORY = {
  CREATIVE: { lpv: 30, checkouts: 5, compras: null, spend: null, duration_days: 7 },
  CRO: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
  OFFER: { lpv: null, checkouts: null, compras: 15, spend: null, duration_days: 14 },
  AOV: { lpv: null, checkouts: null, compras: 15, spend: null, duration_days: 14 },
  CHECKOUT: { lpv: null, checkouts: 20, compras: null, spend: null, duration_days: 7 },
  TRACKING: { lpv: null, checkouts: null, compras: 10, spend: null, duration_days: 5 },
  MEDIA_BUYING: { lpv: null, checkouts: null, compras: 5, spend: 300, duration_days: 5 },
};

function minimumEvidenceFor(category) {
  const rule = MINIMUM_EVIDENCE_BY_CATEGORY[category];
  if (!rule) throw new Error(`Sem regra de minimum_evidence pra categoria "${category}"`);
  return { ...rule };
}

/**
 * Estima quantos dias, no ritmo médio diário REAL observado (do Profit Engine), levaria pra
 * bater o minimum_evidence — usado como `speed_dias` no score de prioridade. Pega o gargalo
 * (a métrica que demora mais), não a média simples.
 */
function estimateDaysToEvidence(minEvidence, dailyRates) {
  const candidates = [];
  if (minEvidence.lpv != null && dailyRates.lpv_per_day > 0) candidates.push(minEvidence.lpv / dailyRates.lpv_per_day);
  if (minEvidence.checkouts != null && dailyRates.checkouts_per_day > 0) candidates.push(minEvidence.checkouts / dailyRates.checkouts_per_day);
  if (minEvidence.compras != null && dailyRates.compras_per_day > 0) candidates.push(minEvidence.compras / dailyRates.compras_per_day);
  if (minEvidence.spend != null && dailyRates.spend_per_day > 0) candidates.push(minEvidence.spend / dailyRates.spend_per_day);
  candidates.push(minEvidence.duration_days);
  return Math.max(...candidates);
}

module.exports = { MINIMUM_EVIDENCE_BY_CATEGORY, minimumEvidenceFor, estimateDaysToEvidence };
