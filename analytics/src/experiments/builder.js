'use strict';

const { generateExperimentId, isValidCategory, emptyExperimentTemplate } = require('./schema');
const { buildHypothesis } = require('./hypothesis');
const { estimateImpact } = require('./impactModel');
const { classifyPath } = require('./pathAnalysis');
const { computePriorityScore, evidenceScore, riskForCategory } = require('./priority');
const { minimumEvidenceFor, estimateDaysToEvidence } = require('./evidence');
const { validateBudgetLimit } = require('./budget');

/**
 * Monta um experimento DRAFT completo a partir de dado real do Profit Engine + parâmetros do
 * experimento. Não executa nada, não persiste sozinho (ver registry.js) — só monta o objeto.
 *
 * @param {object} input
 *   category, change, expectedImprovement, reason (hipótese),
 *   targetMetric, secondaryMetrics, expectedEffect ({cpaChangePct, aovChangePct}),
 *   budgetLimit, dailyRates ({lpv_per_day, checkouts_per_day, compras_per_day, spend_per_day}),
 *   evidenceFlags (booleans reais pro evidenceScore), existingIds (pro id não colidir)
 * @param {object} profitSnapshot  janela do Profit Engine já carregada (current_financials, profit_status, gaps)
 * @param {object} capitalCycle    saída de capitalCycle.computeCapitalCycle() — NUNCA o capital_status
 *                                 histórico do Profit Engine (ver PASSO 5.1: são conceitos separados)
 * @param {number} [maxBudgetPercentOfCycle]  opcional, sem padrão embutido — ver budget.js
 */
function buildDraftExperiment(input, profitSnapshot, capitalCycle, maxBudgetPercentOfCycle) {
  if (!isValidCategory(input.category)) throw new Error(`Categoria inválida: ${input.category}`);

  const experiment = emptyExperimentTemplate();
  experiment.experiment_id = generateExperimentId(input.category, input.existingIds || []);
  experiment.created_at = new Date().toISOString();
  experiment.status = 'DRAFT';
  experiment.category = input.category;

  experiment.hypothesis = buildHypothesis({
    change: input.change, expectedImprovement: input.expectedImprovement, reason: input.reason,
  });

  experiment.baseline = {
    cpa_financeiro: profitSnapshot.current_financials.cpa_financeiro,
    aov_liquido: profitSnapshot.current_financials.aov_liquido,
    roas_financeiro: profitSnapshot.current_financials.roas_financeiro,
    profit_status: profitSnapshot.profit_status.status,
  };

  experiment.target_metric = input.targetMetric;
  experiment.secondary_metrics = input.secondaryMetrics || [];
  experiment.attacks_path = classifyPath(input.targetMetric);

  experiment.expected_effect = estimateImpact(profitSnapshot.current_financials, input.expectedEffect, input.budgetLimit);

  experiment.budget_limit = input.budgetLimit;
  experiment.budget_check = validateBudgetLimit(input.budgetLimit, capitalCycle || null, maxBudgetPercentOfCycle);

  experiment.start_condition = input.startCondition;
  experiment.stop_condition = input.stopCondition;
  experiment.success_condition = input.successCondition;
  experiment.failure_condition = input.failureCondition;

  const minEv = minimumEvidenceFor(input.category);
  experiment.minimum_evidence = minEv;
  const speedDias = estimateDaysToEvidence(minEv, input.dailyRates || {});

  const { confidence, applied_evidence } = evidenceScore(input.evidenceFlags || {});
  const risk = riskForCategory(input.category);
  // Usa o DELTA vs "não fazer nada" no mesmo budget — é o valor real do experimento, não o
  // lucro absoluto do teste pequeno (ver comentário em impactModel.js).
  const impactReais = experiment.expected_effect.lucro_impact ? experiment.expected_effect.lucro_impact.delta_vs_nao_fazer_nada : 0;

  experiment.priority = {
    ...computePriorityScore({ impactReais, confidence, costReais: input.budgetLimit, speedDias, risk }),
    confidence_evidence_used: applied_evidence,
    speed_dias_estimado: speedDias,
    risk_category: input.category,
  };

  return experiment;
}

/**
 * Fecha um experimento (RUNNING -> SUCCESS/FAILURE/INCONCLUSIVE) registrando a memória pedida.
 * Fora de escopo executar isso sobre experimento real nesta etapa — existe pra ser testável e
 * pronto pro Learning Engine futuro consumir.
 */
function closeExperiment(experiment, { status, actualResult, conclusion, learningSummary, whatNotToRepeat, nextTestSuggestion, nextAction }) {
  if (!['SUCCESS', 'FAILURE', 'INCONCLUSIVE', 'CANCELLED'].includes(status)) {
    throw new Error(`Status de fechamento inválido: ${status}`);
  }
  return {
    ...experiment,
    status,
    actual_result: actualResult,
    conclusion,
    learning: { summary: learningSummary, what_not_to_repeat: whatNotToRepeat, next_test_suggestion: nextTestSuggestion },
    next_action: nextAction,
  };
}

module.exports = { buildDraftExperiment, closeExperiment };
