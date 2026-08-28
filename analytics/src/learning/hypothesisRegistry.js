'use strict';

const { computeConfidence } = require('./confidence');
const { classifyHypothesisStatus } = require('./status');

/**
 * Recebe TODOS os raw learnings (de buildRawLearning) e:
 *  1. agrupa por hypothesis_key;
 *  2. calcula times_tested/successes/failures/inconclusive por grupo;
 *  3. calcula confidence (média das confidences individuais, mesma fórmula de confidence.js
 *     aplicada por learning, considerando o grupo inteiro pra repetição/consistência);
 *  4. classifica o status da hipótese (status.js);
 *  5. preenche contradicts_learning_ids/supports_learning_ids em CADA learning do grupo
 *     (nunca apaga um learning anterior — só relaciona).
 *
 * Retorna { learnings (enriquecidos), hypotheses (um registro por chave canônica) }.
 */
function buildHypothesisRegistry(rawLearnings) {
  // Agrupa por product_hypothesis_key (namespaced por produto) — NUNCA por global_hypothesis_key
  // sozinha, pra um aprendizado do Produto A nunca virar evidência agregada do Produto B só
  // porque a hipótese é textualmente igual (PASSO 6.1, item 5).
  const byKey = new Map();
  for (const l of rawLearnings) {
    if (!byKey.has(l.product_hypothesis_key)) byKey.set(l.product_hypothesis_key, []);
    byKey.get(l.product_hypothesis_key).push(l);
  }

  const enrichedLearnings = [];
  const hypotheses = [];

  for (const [key, group] of byKey.entries()) {
    const successes = group.filter((l) => l.result === 'SUCCESS').length;
    const failures = group.filter((l) => l.result === 'FAILURE').length;
    const inconclusive = group.filter((l) => l.result === 'INCONCLUSIVE').length;
    const timesTested = group.length;
    const results = group.map((l) => l.result);

    // confidence do GRUPO: usa o pior caso de evidence_completeness/critical flags do grupo
    // (não a média otimista) — se qualquer teste do grupo teve flag crítico, isso pesa.
    const worstCriticalFlags = Math.max(0, ...group.map((l) => l.tracking_flags_responsible.length));
    const anyTrackingChecked = group.some((l) => l.tracking_checked);
    const avgEvidenceRatio = group.reduce((sum, l) => {
      const c = computeConfidence({
        minimumEvidence: l.minimum_evidence, actualResult: l.evidence,
        timesObserved: timesTested, results, criticalFlagsCount: worstCriticalFlags, trackingChecked: anyTrackingChecked,
      });
      return sum + c.components.evidence_completeness.score;
    }, 0) / group.length;

    const confidenceResult = computeConfidence({
      minimumEvidence: group[0].minimum_evidence, actualResult: group[0].evidence,
      timesObserved: timesTested, results, criticalFlagsCount: worstCriticalFlags, trackingChecked: anyTrackingChecked,
    });
    // substitui o componente de evidência pela média do grupo (mais representativo que só o 1º item)
    confidenceResult.components.evidence_completeness.score = avgEvidenceRatio;
    const confidence =
      avgEvidenceRatio * confidenceResult.weights.evidence_completeness +
      confidenceResult.components.repetition.score * confidenceResult.weights.repetition +
      confidenceResult.components.consistency.score * confidenceResult.weights.consistency +
      confidenceResult.components.data_quality.score * confidenceResult.weights.data_quality;
    const roundedConfidence = Math.round(confidence * 100) / 100;

    const { status, reason } = classifyHypothesisStatus({ successes, failures, confidence: roundedConfidence });

    const successIds = group.filter((l) => l.result === 'SUCCESS').map((l) => l.learning_id);
    const failureIds = group.filter((l) => l.result === 'FAILURE').map((l) => l.learning_id);

    for (const l of group) {
      const contradicts = l.result === 'SUCCESS' ? failureIds : (l.result === 'FAILURE' ? successIds : []);
      const supports = l.result === 'SUCCESS' ? successIds.filter((id) => id !== l.learning_id) : (l.result === 'FAILURE' ? failureIds.filter((id) => id !== l.learning_id) : []);
      enrichedLearnings.push({
        ...l,
        confidence: roundedConfidence,
        data_quality_penalty: confidenceResult.components.data_quality.score < 100 ? 100 - confidenceResult.components.data_quality.score : 0,
        times_observed: timesTested,
        status,
        contradicts_learning_ids: contradicts,
        supports_learning_ids: supports,
      });
    }

    hypotheses.push({
      product_hypothesis_key: key,
      global_hypothesis_key: group[0].global_hypothesis_key,
      product_id: group[0].product_id,
      category: group[0].category,
      times_tested: timesTested,
      successes, failures, inconclusive,
      last_tested_at: null, // preenchido pelo orquestrador (sabe created_at/updated_at reais)
      current_confidence: roundedConfidence,
      status,
      status_reason: reason,
      learning_ids: group.map((l) => l.learning_id),
    });
  }

  return { learnings: enrichedLearnings, hypotheses };
}

module.exports = { buildHypothesisRegistry };
