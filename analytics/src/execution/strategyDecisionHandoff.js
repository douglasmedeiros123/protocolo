'use strict';

const { analyzeStrategy } = require('../strategy-search/builder');
const { buildActionContract } = require('./actionContract');

// item 14A.16 — adapter read-only sobre Strategy Search (e, transitivamente, Planner/Decision —
// já consumidos por analyzeStrategy() internamente, nunca reimplementados aqui). Transforma a
// recomendação REAL em uma Action Proposal (Action Contract em estado PROPOSED) — nunca registra
// nada em experiments/registry.js, nunca executa.
function deriveActionProposalFromStrategyWinner({ productId, dataDir, referenceDate } = {}) {
  const strategyResult = analyzeStrategy({ productId, dataDir, referenceDate });
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const isCurrent = winnerId === strategyResult.analysis.current_architecture.architecture_id;

  if (isCurrent) {
    return { proposed: false, reason: 'vencedor real é a própria arquitetura atual — nenhuma nova ação de teste a propor hoje (OPTIMIZE_CURRENT/TEST_VARIANT dentro do que já existe).', strategy_result_consumed: { winner_architecture_id: winnerId } };
  }

  const winner = strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);
  if (!winner || !winner.mva_test) {
    return { proposed: false, reason: 'vencedor sem mva_test associado — estado inconsistente do Strategy Search, nunca inventado aqui.', strategy_result_consumed: { winner_architecture_id: winnerId } };
  }

  const action = buildActionContract({
    actionType: 'START_EXPERIMENT',
    subjectType: 'EXPERIMENT',
    subjectId: winner.mva_test.test_id,
    sourceAgent: 'STRATEGY_SEARCH',
    recommendationId: strategyResult.analysis.analysis_id,
    experimentId: winner.mva_test.test_id,
    requestedChange: `iniciar MVA test ${winner.mva_test.test_id} (${winner.family}) — muda: ${winner.mva_test.changed_components.join(', ') || 'nenhum estágio novo'}.`,
    currentState: { architecture_id: strategyResult.analysis.current_architecture.architecture_id, family: strategyResult.analysis.current_architecture.family },
    targetState: { architecture_id: winner.architecture_id, family: winner.family },
    capitalRequired: null, // mva_test.estimated_measurement_capital é NOT_ESTIMABLE hoje — nunca inventado
    capitalAtRisk: null,
    expectedValue: null, // Strategy Search não computa EV numérico pra este candidato hoje
    confidence: strategyResult.analysis.recommendation.confidence,
    reversibility: winner.reversibility,
    measurementDependency: winner.architecture_id,
    policyDependencies: ['CAPITAL_LIMIT_POLICY', 'MEASUREMENT_READINESS_POLICY', 'FINANCIAL_TRUTH_POLICY', 'ANOMALY_POLICY', 'EXPERIMENT_POLICY', 'REVERSIBILITY_POLICY'],
    approvalRequirement: null, // decidido pela Policy Engine, não aqui
    executionMode: 'DRY_RUN',
  });

  return {
    proposed: true,
    action,
    strategy_result_consumed: { winner_architecture_id: winnerId, family: winner.family, recommendation_type: strategyResult.analysis.recommendation.recommendation_type, confidence: strategyResult.analysis.recommendation.confidence },
    note: 'Action Proposal derivado read-only de analyzeStrategy() — nunca executa, nunca registra em experiments/registry.js (item 14A.16).',
  };
}

module.exports = { deriveActionProposalFromStrategyWinner };
