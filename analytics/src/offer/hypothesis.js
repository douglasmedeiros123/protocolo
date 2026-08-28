'use strict';

// OFFER HYPOTHESIS (PASSO 10, item 28) — "Se alterarmos X, esperamos Y porque Z." Nunca tratada
// como fato (item 1: OBSERVAÇÃO -> ECONOMIA ATUAL -> DIAGNÓSTICO -> HIPÓTESE -> MODELAGEM -> ...).
const EXPECTED_DIRECTIONS = ['INCREASE', 'DECREASE'];

function buildOfferHypothesis({ productId, offerId, variableChanged, currentState, proposedDirection, targetMetric, expectedDirection, reason, evidence, causality, confidence, priorLearningStatus }) {
  if (!variableChanged) throw new Error('variableChanged é obrigatório.');
  if (!EXPECTED_DIRECTIONS.includes(expectedDirection)) throw new Error(`expectedDirection inválido: ${expectedDirection}.`);

  return {
    hypothesis_id: `OFFER-HYP-${variableChanged}-${targetMetric}`.toUpperCase(),
    product_id: productId,
    offer_id: offerId,
    variable_changed: variableChanged,
    current_state: currentState ?? null,
    proposed_direction: proposedDirection ?? null,
    target_metric: targetMetric,
    expected_direction: expectedDirection,
    reason,
    evidence: evidence ?? null,
    causality: causality ?? null,
    confidence: confidence ?? null,
    prior_learning_status: priorLearningStatus ?? null,
    statement: `Se alterarmos ${variableChanged}, esperamos que ${targetMetric} ${expectedDirection === 'INCREASE' ? 'aumente' : 'diminua'} porque ${String(reason).replace(/\.+$/, '')}.`,
  };
}

module.exports = { buildOfferHypothesis, EXPECTED_DIRECTIONS };
