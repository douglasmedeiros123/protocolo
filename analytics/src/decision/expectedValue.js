'use strict';

// EXPECTED VALUE (PASSO 7, item 10) — PRIOR_LEARNING_MULTIPLIER ajusta a confidence de base
// conforme o veredito do checkPriorLearning() (Learning Engine). Documentado, nunca opinião de
// IA no momento do cálculo:
//   SUPPORTING_EVIDENCE     : x1.15 (evidência real de sucesso prévio na mesma hipótese)
//   NO_PRIOR_EVIDENCE       : x1.00 (neutro — não sabemos ainda)
//   INSUFFICIENT_EVIDENCE   : x1.00 (1 observação isolada não deve mudar a confiança de base)
//   CONTRADICTORY_EVIDENCE  : x0.50 (sucesso E falha já observados na mesma hipótese)
//   PREVIOUSLY_INVALIDATED  : x0.10 (falhou repetidamente sem sucesso algum — penalidade forte,
//                                     nunca zero: contexto materialmente diferente ainda pode
//                                     justificar reteste, ver reason_to_retest no builder)
// adjusted_confidence é sempre capada em 1.0 (nunca "mais que 100% confiante").
const PRIOR_LEARNING_MULTIPLIER = {
  SUPPORTING_EVIDENCE: 1.15,
  NO_PRIOR_EVIDENCE: 1.0,
  INSUFFICIENT_EVIDENCE: 1.0,
  CONTRADICTORY_EVIDENCE: 0.5,
  PREVIOUSLY_INVALIDATED: 0.1,
};

// reason_to_retest (item 9): se informado, a penalidade de PREVIOUSLY_INVALIDATED é suavizada
// (não removida — ainda exige mais confiança pra vencer) porque existe contexto materialmente
// diferente alegado por quem está montando o candidato.
const RETEST_MULTIPLIER_OVERRIDE = 0.6;

function adjustConfidenceForPriorLearning(baseConfidence, priorLearningVerdict, reasonToRetest) {
  let multiplier = PRIOR_LEARNING_MULTIPLIER[priorLearningVerdict] ?? 1.0;
  if (priorLearningVerdict === 'PREVIOUSLY_INVALIDATED' && reasonToRetest) multiplier = RETEST_MULTIPLIER_OVERRIDE;
  return Math.min(1, baseConfidence * multiplier);
}

/**
 * FÓRMULA (mesma forma do priority.score do Experiment Engine, com confidence ajustada por
 * prior learning):
 *
 *   raw_ev = (expected_profit_delta * adjusted_confidence) / (capital_required * time_to_evidence * risk)
 *
 * expected_profit_delta é SEMPRE o delta vs. "não fazer nada" (nunca o lucro projetado
 * absoluto) — mesma correção do impactModel do Experiment Engine (PASSO 5). Denominadores
 * nunca zero (mínimo 1). raw_ev negativo é preservado — quem decide DO_NOT_SPEND é o builder,
 * olhando o conjunto inteiro de candidatos.
 */
function computeExpectedValue({ expectedProfitDelta, expectedRoasDelta, confidence, priorLearningVerdict, reasonToRetest, capitalRequired, risk, timeToEvidence }) {
  const adjusted_confidence = adjustConfidenceForPriorLearning(confidence, priorLearningVerdict, reasonToRetest);
  const safeCapital = Math.max(capitalRequired, 1);
  const safeTime = Math.max(timeToEvidence, 1);
  const safeRisk = Math.max(risk, 1);
  const raw_ev = (expectedProfitDelta * adjusted_confidence) / (safeCapital * safeTime * safeRisk);

  return {
    expected_profit_delta: expectedProfitDelta,
    expected_roas_delta: expectedRoasDelta,
    confidence,
    adjusted_confidence,
    prior_learning_verdict: priorLearningVerdict,
    capital_required: capitalRequired,
    risk,
    time_to_evidence: timeToEvidence,
    raw_ev,
    formula: 'raw_ev = (expected_profit_delta * adjusted_confidence) / (capital_required * time_to_evidence * risk); adjusted_confidence = confidence * PRIOR_LEARNING_MULTIPLIER[verdict], capado em 1.0',
  };
}

/**
 * Normaliza o raw_ev de um conjunto de candidatos pra 0-100 como RAZÃO do melhor candidato
 * (não min-max): o score vira "% do melhor uso possível desses R$" — interpretável mesmo com 1
 * candidato só (vira 100 se positivo, 0 se não-positivo). raw_ev <= 0 SEMPRE vira score 0 (uma
 * oportunidade que pioraria o lucro esperado nunca recebe score > 0, mesmo relativamente "menos
 * ruim" que as outras).
 */
function normalizeExpectedValueScores(candidatesWithEv) {
  const positiveRaw = candidatesWithEv.map((c) => c.expected_value.raw_ev).filter((v) => v > 0);
  const maxRaw = positiveRaw.length ? Math.max(...positiveRaw) : 0;
  return candidatesWithEv.map((c) => {
    const raw = c.expected_value.raw_ev;
    const score = maxRaw > 0 && raw > 0 ? Math.round((raw / maxRaw) * 100) : 0;
    return { ...c, expected_value: { ...c.expected_value, expected_value_score: score } };
  });
}

module.exports = { computeExpectedValue, normalizeExpectedValueScores, adjustConfidenceForPriorLearning, PRIOR_LEARNING_MULTIPLIER, RETEST_MULTIPLIER_OVERRIDE };
