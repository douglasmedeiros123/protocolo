'use strict';

// item 93 — categoria mais próxima já existente em experiments/schema.js (CATEGORIES não tem uma
// entrada dedicada pra teste de arquitetura de funil — não alteramos experiments/schema.js aqui,
// só documentamos a aproximação mais defensável por mecanismo primário).
const NEAREST_EXISTING_CATEGORY_BY_MECHANISM = {
  INCREASE_AOV: 'OFFER', INCREASE_LTV: 'OFFER',
  REDUCE_FRICTION: 'CRO', INCREASE_COMPREHENSION: 'CRO', INCREASE_TRUST: 'CRO', IMPROVE_MESSAGE_MATCH: 'CRO', IMPROVE_QUALIFICATION: 'CRO',
  REDUCE_CPA: 'MEDIA_BUYING', OTHER: 'CRO',
};

/**
 * buildExperimentDraftProposal() — item 93. Estruturalmente compatível com
 * experiments/schema.js's emptyExperimentTemplate() — mas NUNCA chama saveExperiment(). É só uma
 * proposta pra revisão humana.
 */
function buildExperimentDraftProposal({ architecture, mvaTest }) {
  const nearestCategory = NEAREST_EXISTING_CATEGORY_BY_MECHANISM[architecture.primary_mechanism] || 'CRO';
  return {
    experiment_id: null, // nunca gerado de verdade — proposta, não registro real (item 93)
    status: 'DRAFT_PROPOSAL_NOT_REGISTERED',
    category: nearestCategory,
    category_note: `aproximação mais próxima de experiments/schema.js CATEGORIES — nenhuma categoria dedicada a teste de arquitetura de funil existe ainda (dívida documentada, não implementada agora).`,
    hypothesis: architecture.architecture_hypothesis,
    baseline: 'arquitetura atual real (ARCH-CURRENT).',
    target_metric: mvaTest.primary_metric,
    secondary_metrics: mvaTest.secondary_metrics,
    expected_effect: architecture.primary_mechanism,
    budget_limit: null, // nunca inventado (item 43/2)
    minimum_evidence: mvaTest.minimum_evidence,
    success_condition: mvaTest.success_condition,
    failure_condition: mvaTest.failure_condition,
    architecture_id: architecture.architecture_id,
    mva_test_id: mvaTest.test_id,
    note: 'EXPERIMENT_DRAFT_PROPOSAL — nunca registrado automaticamente via experiments/registry.js saveExperiment() (item 93). Requer decisão humana antes de virar experimento real.',
  };
}

module.exports = { buildExperimentDraftProposal, NEAREST_EXISTING_CATEGORY_BY_MECHANISM };
