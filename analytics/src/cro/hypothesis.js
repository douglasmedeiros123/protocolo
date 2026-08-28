'use strict';

// CRO HYPOTHESIS (PASSO 9, item 17) — "Se alterarmos X, esperamos Y porque Z." Nunca tratada
// como fato (item 1: OBSERVAÇÃO -> DIAGNÓSTICO -> HIPÓTESE -> EVIDÊNCIA -> ... -> LEARNING).
const EXPECTED_DIRECTIONS = ['INCREASE', 'DECREASE'];

function buildCroHypothesis({ productId, landingPageId, variableChanged, currentState, proposedDirection, targetMetric, expectedDirection, reason, evidence, causality, confidence, priorLearningStatus }) {
  if (!variableChanged) throw new Error('variableChanged é obrigatório.');
  if (!EXPECTED_DIRECTIONS.includes(expectedDirection)) throw new Error(`expectedDirection inválido: ${expectedDirection}.`);

  return {
    hypothesis_id: `CRO-HYP-${variableChanged}-${targetMetric}`.toUpperCase(),
    product_id: productId,
    landing_page_id: landingPageId,
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

module.exports = { buildCroHypothesis, EXPECTED_DIRECTIONS };
