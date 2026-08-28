'use strict';

// FÓRMULA (documentada, sem opinião de IA no momento do cálculo — os componentes são números
// reais, o score é média ponderada): confidence = média ponderada de 4 componentes, cada um
// 0-100:
//
//   evidence_completeness (peso 30%): % do minimum_evidence realmente atingido (capado em 100
//     mesmo se excedido muito — passar de 100% não vale "mais que confiável")
//   repetition_score      (peso 25%): min(100, times_observed * 33.33) — 1 observação = 33,
//     2 = 67, 3+ = 100 (satura em 3 repetições independentes)
//   consistency_score     (peso 25%): % das observações que apontam na MESMA direção
//     (SUCCESS+SUCCESS = 100%, SUCCESS+FAILURE = 50%, só INCONCLUSIVE não conta pra direção)
//   data_quality_score    (peso 20%): 100 - (flags_criticos_conhecidos * 30), piso 0.
//     Default 100 quando não há dado de tracking_flags disponível pro experimento — não é uma
//     alegação de "verificamos e está limpo", é "nenhuma penalidade conhecida ainda"; o campo
//     `data_quality_checked` ao lado disso deixa claro se isso foi checado de verdade.
//
// Pesos somam 100%. Mudar os pesos é uma decisão de produto, não desta função — ficam nomeados
// aqui pra serem auditáveis.
const WEIGHTS = { evidence_completeness: 0.30, repetition: 0.25, consistency: 0.25, data_quality: 0.20 };

function evidenceCompletenessScore(minimumEvidence, actualResult) {
  if (!minimumEvidence || !actualResult) return { score: 0, checked: false };
  const pairs = [['lpv', 'lpv'], ['checkouts', 'checkouts'], ['compras', 'compras'], ['spend', 'spend']];
  const ratios = [];
  for (const [minKey, actKey] of pairs) {
    const min = minimumEvidence[minKey];
    const act = actualResult[actKey];
    if (min != null && act != null && min > 0) ratios.push(Math.min(1, act / min));
  }
  if (ratios.length === 0) return { score: 0, checked: false };
  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  return { score: avg * 100, checked: true };
}

function repetitionScore(timesObserved) {
  return Math.min(100, timesObserved * (100 / 3));
}

/** results: array de 'SUCCESS'|'FAILURE'|'INCONCLUSIVE'. INCONCLUSIVE não conta pra direção. */
function consistencyScore(results) {
  const directional = results.filter((r) => r === 'SUCCESS' || r === 'FAILURE');
  if (directional.length === 0) return { score: 0, checked: false };
  const successCount = directional.filter((r) => r === 'SUCCESS').length;
  const failureCount = directional.length - successCount;
  const majority = Math.max(successCount, failureCount);
  return { score: (majority / directional.length) * 100, checked: true };
}

function dataQualityScore(criticalFlagsCount, checked) {
  if (!checked) return { score: 100, checked: false };
  return { score: Math.max(0, 100 - criticalFlagsCount * 30), checked: true };
}

/**
 * Monta o confidence final (0-100) + o detalhamento de cada componente, pra auditoria.
 * @param {object} input { minimumEvidence, actualResult, timesObserved, results[], criticalFlagsCount, trackingChecked }
 */
function computeConfidence({ minimumEvidence, actualResult, timesObserved, results, criticalFlagsCount, trackingChecked }) {
  const ec = evidenceCompletenessScore(minimumEvidence, actualResult);
  const rep = { score: repetitionScore(timesObserved), checked: true };
  const cons = consistencyScore(results || []);
  const dq = dataQualityScore(criticalFlagsCount || 0, !!trackingChecked);

  const confidence =
    ec.score * WEIGHTS.evidence_completeness +
    rep.score * WEIGHTS.repetition +
    cons.score * WEIGHTS.consistency +
    dq.score * WEIGHTS.data_quality;

  return {
    confidence: Math.round(confidence * 100) / 100,
    components: {
      evidence_completeness: ec,
      repetition: rep,
      consistency: cons,
      data_quality: dq,
    },
    weights: WEIGHTS,
  };
}

module.exports = { computeConfidence, evidenceCompletenessScore, repetitionScore, consistencyScore, dataQualityScore, WEIGHTS };
