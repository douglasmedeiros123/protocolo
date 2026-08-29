'use strict';

// PASSO 14B, item 12 — Action Capital Assessment. UNKNOWN permanece UNKNOWN — nenhuma
// probabilidade é inventada. Todo campo aceita 'UNKNOWN' explicitamente; nunca um default
// numérico silencioso.
function buildActionCapitalAssessment({
  expectedUpside, expectedDownside, valueOfInformation, capitalAtRisk, worstCaseBoundedLoss,
  reversibility, confidence, timeToSignal, opportunityCost,
}) {
  const numeric = (v) => (typeof v === 'number' ? v : 'UNKNOWN');
  const expectedValue = (typeof expectedUpside === 'number' && typeof expectedDownside === 'number')
    ? expectedUpside - expectedDownside // aproximação simples e explícita — nunca pondera por probabilidade inventada
    : 'UNKNOWN';

  return {
    expected_upside: numeric(expectedUpside),
    expected_downside: numeric(expectedDownside),
    expected_value: expectedValue,
    value_of_information: valueOfInformation ?? 'NOT_ASSESSABLE',
    capital_at_risk: numeric(capitalAtRisk),
    worst_case_bounded_loss: numeric(worstCaseBoundedLoss),
    reversibility: reversibility || 'UNKNOWN',
    confidence: confidence || 'NOT_ASSESSABLE',
    time_to_signal: timeToSignal || 'UNKNOWN',
    opportunity_cost: opportunityCost ?? 'UNKNOWN',
    note: 'nenhum campo UNKNOWN foi aproximado por um número — UNKNOWN permanece UNKNOWN (item 12/21: UNKNOWN EV != zero EV).',
  };
}

module.exports = { buildActionCapitalAssessment };
