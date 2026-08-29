'use strict';

const { DECISION_QUALITY_STATES } = require('./enums');

// item 22 — framework de avaliação futura das decisões do próprio CEO. Resultado bom NÃO prova
// decisão boa; resultado ruim NÃO prova decisão ruim. Sem outcome real disponível ainda,
// permanece INSUFFICIENT_EVIDENCE_TO_JUDGE — nunca inventado.
function evaluateDecisionQuality({ evidenceAvailableAtDecisionTime, policyCompliant, expectedOutcome, observedOutcome, wasAvoidableError }) {
  if (observedOutcome == null) {
    return { status: 'INSUFFICIENT_EVIDENCE_TO_JUDGE', reason: 'nenhum outcome real disponível ainda — nunca julga uma decisão sem o resultado real observado.' };
  }
  if (!policyCompliant) {
    return { status: 'BAD_DECISION_BAD_OUTCOME', reason: 'violou política mesmo — má decisão por construção, independente do outcome.' };
  }
  const goodDecision = evidenceAvailableAtDecisionTime === 'SUFFICIENT' && !wasAvoidableError;
  const goodOutcome = observedOutcome === 'POSITIVE';
  if (goodDecision && goodOutcome) return { status: 'GOOD_DECISION_GOOD_OUTCOME', reason: 'evidência suficiente no momento da decisão, sem erro evitável, e o resultado real foi positivo.' };
  if (goodDecision && !goodOutcome) return { status: 'GOOD_DECISION_BAD_OUTCOME', reason: 'decisão bem fundamentada na evidência disponível, mas o resultado real foi negativo — incerteza inevitável, não erro de processo.' };
  if (!goodDecision && goodOutcome) return { status: 'BAD_DECISION_GOOD_OUTCOME', reason: 'resultado positivo, mas a decisão em si não tinha evidência suficiente/teve erro evitável — sorte, não processo correto.' };
  return { status: 'BAD_DECISION_BAD_OUTCOME', reason: 'evidência insuficiente/erro evitável no momento da decisão E resultado negativo.' };
}

module.exports = { evaluateDecisionQuality, DECISION_QUALITY_STATES };
