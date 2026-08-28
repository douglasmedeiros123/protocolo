'use strict';

// DECISION CONFIDENCE (PASSO 7, item 16) — 0-100, combinação ponderada e documentada, nunca
// opinião de IA no momento do cálculo:
const WEIGHTS = {
  data_coverage: 0.20, // % de dias com snapshot real na janela de referência (last_30d)
  tracking_quality: 0.25, // trackingAssessment.confidence_score (0 se bloqueante)
  experiment_confidence: 0.20, // confidence do candidato #1 (0-1 -> 0-100)
  prior_learning: 0.20, // veredicto do checkPriorLearning do candidato #1, mapeado 0-100
  financial_confidence: 0.15, // 'normal' -> 100, 'degraded' -> 60 (dado real, com ressalva conhecida)
};

const PRIOR_LEARNING_CONFIDENCE_POINTS = {
  SUPPORTING_EVIDENCE: 100,
  NO_PRIOR_EVIDENCE: 60, // neutro, mas não é "confirmado" — fica no meio
  INSUFFICIENT_EVIDENCE: 50,
  CONTRADICTORY_EVIDENCE: 25,
  PREVIOUSLY_INVALIDATED: 5,
};

function computeDecisionConfidence({ dataCompleteness, trackingConfidenceScore, experimentConfidence, priorLearningVerdict, financialConfidence }) {
  const data_coverage_score = (dataCompleteness ?? 0) * 100;
  const tracking_score = trackingConfidenceScore ?? 0;
  const experiment_score = (experimentConfidence ?? 0) * 100;
  const prior_learning_score = priorLearningVerdict != null ? (PRIOR_LEARNING_CONFIDENCE_POINTS[priorLearningVerdict] ?? 50) : 50;
  const financial_score = financialConfidence === 'normal' ? 100 : financialConfidence === 'degraded' ? 60 : 40;

  const confidence =
    data_coverage_score * WEIGHTS.data_coverage +
    tracking_score * WEIGHTS.tracking_quality +
    experiment_score * WEIGHTS.experiment_confidence +
    prior_learning_score * WEIGHTS.prior_learning +
    financial_score * WEIGHTS.financial_confidence;

  return {
    decision_confidence: Math.round(confidence * 100) / 100,
    components: {
      data_coverage: data_coverage_score,
      tracking_quality: tracking_score,
      experiment_confidence: experiment_score,
      prior_learning: prior_learning_score,
      financial_confidence: financial_score,
    },
    weights: WEIGHTS,
  };
}

module.exports = { computeDecisionConfidence, WEIGHTS, PRIOR_LEARNING_CONFIDENCE_POINTS };
