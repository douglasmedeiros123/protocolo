'use strict';

const { minimumEvidenceFor, estimateDaysToEvidence } = require('../experiments/evidence');

// EXPERIMENT ENGINE INTEGRATION (PASSO 9, item 27) — só prepara campos compatíveis com o
// schema real do Experiment Engine (category=CRO usa o MESMO minimum_evidence de CRO-001: ver
// experiments/evidence.js). NÃO cria nem executa experimento — só estrutura.
function estimateBudgetForCroCandidate(funnelMetrics, minimumEvidence) {
  const days = funnelMetrics.period.days_found || 1;
  const dailyRates = {
    lpv_per_day: funnelMetrics.raw.lpv / days,
    checkouts_per_day: funnelMetrics.raw.checkout / days,
    compras_per_day: 0,
    spend_per_day: funnelMetrics.raw.spend / days,
  };
  const daysToEvidence = estimateDaysToEvidence(minimumEvidence, dailyRates);
  const budgetEstimate = Math.round(dailyRates.spend_per_day * daysToEvidence * 100) / 100;
  return { budget_estimate: budgetEstimate, days_to_evidence_estimated: daysToEvidence, based_on: 'ritmo real de gasto/lpv/checkout do funil histórico (ver funnelMetrics.js)' };
}

function toExperimentCompatibleFields(candidate, funnelMetrics) {
  const minimumEvidence = minimumEvidenceFor('CRO');
  const budgetInfo = estimateBudgetForCroCandidate(funnelMetrics, minimumEvidence);
  return {
    category: 'CRO',
    target_metric: candidate.target_metric,
    expected_effect: candidate.expected_effect,
    minimum_evidence: minimumEvidence,
    success_condition: `${candidate.target_metric} do período de teste melhora na direção esperada (${candidate.hypothesis.expected_direction}) vs baseline do ${candidate.parent_landing_page_version}.`,
    failure_condition: `${candidate.target_metric} do período de teste não melhora, ou piora, vs baseline do ${candidate.parent_landing_page_version}.`,
    budget_estimate: budgetInfo.budget_estimate,
    days_to_evidence_estimated: budgetInfo.days_to_evidence_estimated,
    budget_estimate_based_on: budgetInfo.based_on,
  };
}

module.exports = { toExperimentCompatibleFields, estimateBudgetForCroCandidate };
