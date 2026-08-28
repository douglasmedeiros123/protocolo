'use strict';

const { validateBudgetLimit } = require('../experiments/budget');
const { checkPriorLearning } = require('../learning/checkPriorLearning');
const { computeExpectedValue } = require('./expectedValue');

/**
 * attacks_path do decision object (CPA/AOV/CONVERSION/LTV/TRACKING/MIXED) — CRO ataca conversão
 * mesmo quando o experimento foi rotulado internamente como "CPA" (reduzir abandono de
 * checkout também reduz CPA, mas o mecanismo real é de conversão). Nunca inventa LTV aqui
 * (PASSO 7, item 7) — só aparece se algo externo já setar isso explicitamente no futuro.
 */
function resolveAttacksPath(experiment) {
  if (experiment.category === 'CRO') return 'CONVERSION';
  if (['CPA', 'AOV'].includes(experiment.attacks_path)) return experiment.attacks_path;
  return 'MIXED';
}

/**
 * Constrói o candidato RUN_EXPERIMENT pra 1 experimento DRAFT/READY (PASSO 7, itens 5 e 8-10).
 * USE EXPERIMENT ENGINE: revalida budget_limit contra o capital_cycle ATUAL do Decision Engine
 * (nunca reaproveita cegamente o budget_check já persistido no experimento — este pode ter sido
 * calculado contra um ciclo diferente). USE LEARNING ENGINE: consulta checkPriorLearning()
 * antes de recomendar, ajustando a confidence do Expected Value (nunca bloqueia sozinho — ver
 * expectedValue.js).
 */
function buildExperimentCandidate(experiment, { capitalCycle, hypotheses, maxBudgetPercentOfCycleOverride, reasonToRetestByExperimentId = {} }) {
  const maxBudgetPercentOfCycle = maxBudgetPercentOfCycleOverride ?? experiment.budget_check?.max_budget_percent_of_cycle ?? null;
  const budgetCheck = validateBudgetLimit(experiment.budget_limit, capitalCycle, maxBudgetPercentOfCycle);

  const priorLearning = checkPriorLearning(
    { product_id: experiment.product_id, category: experiment.category, target_metric: experiment.target_metric },
    hypotheses
  );

  const reasonToRetest = reasonToRetestByExperimentId[experiment.experiment_id] || null;

  const expectedProfitDelta = experiment.expected_effect?.lucro_impact?.delta_vs_nao_fazer_nada ?? 0;
  const expectedRoasDelta = experiment.expected_effect?.roas_impact?.delta ?? null;
  const timeToEvidence = experiment.priority?.speed_dias_estimado ?? experiment.minimum_evidence?.duration_days ?? 7;

  const expected_value = computeExpectedValue({
    expectedProfitDelta,
    expectedRoasDelta,
    confidence: experiment.priority?.factors?.confidence ?? 0.5,
    priorLearningVerdict: priorLearning.verdict,
    reasonToRetest,
    capitalRequired: experiment.budget_limit,
    risk: experiment.priority?.factors?.risk ?? 3,
    timeToEvidence,
  });

  // Elegibilidade pra virar recommended_action=RUN_EXPERIMENT (PASSO 7, item 13: se o teste
  // exige capital incompatível com o ciclo, não recomende RUN_EXPERIMENT — retorne alternativa).
  // NUNCA remove o candidato da lista de alternativas — só marca is_eligible:false e o motivo.
  const ineligible_reasons = [];
  if (budgetCheck.status === 'CAPITAL_NOT_CONFIGURED') ineligible_reasons.push('capital_cycle não configurado — não é possível validar o budget_limit contra um teto real.');
  else if (budgetCheck.valid === false) ineligible_reasons.push(`budget_check reprovado: ${budgetCheck.status}`);

  return {
    action_type: 'RUN_EXPERIMENT',
    experiment_id: experiment.experiment_id,
    category: experiment.category,
    target_metric: experiment.target_metric,
    attacks_path: resolveAttacksPath(experiment),
    reason: experiment.hypothesis?.statement || experiment.hypothesis?.change || `Rodar ${experiment.experiment_id} (${experiment.category}) visando ${experiment.target_metric}.`,
    evidence: { baseline: experiment.baseline, expected_effect: experiment.expected_effect },
    budget_check: budgetCheck,
    prior_learning_status: priorLearning.verdict,
    prior_learning: priorLearning,
    expected_value,
    capital_required: experiment.budget_limit,
    risk: experiment.priority?.factors?.risk ?? 3,
    time_to_evidence: timeToEvidence,
    is_eligible: ineligible_reasons.length === 0,
    ineligible_reasons,
  };
}

module.exports = { buildExperimentCandidate, resolveAttacksPath };
