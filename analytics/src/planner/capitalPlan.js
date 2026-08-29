'use strict';

/**
 * buildCapitalPlan() — items 30-31. R$1.000 é uma REFERÊNCIA histórica de capital de validação,
 * nunca um teto permanente do negócio — só aparece se explicitamente configurado
 * (validationBudget). Sem configuração, tudo fica null/NOT_CONFIGURED — nunca inventado.
 */
function buildCapitalPlan({ validationBudget = null, spent = null, committed = null, maxLossBeforeRedecision = null, stopLoss = null } = {}) {
  if (validationBudget == null) {
    return {
      validation_budget: null, spent, committed, available: null,
      recommended_next_release: null,
      reason: 'validation_budget não configurado — nenhum plano de capital pode ser derivado sem essa referência explícita (item 30). NÃO assumir R$1.000 por padrão (item 31).',
      max_loss_before_redecision: maxLossBeforeRedecision,
      stop_loss: stopLoss,
      validation_capital_reference: null,
    };
  }
  const spentVal = spent ?? 0;
  const committedVal = committed ?? 0;
  const available = Math.round((validationBudget - spentVal - committedVal) * 100) / 100;
  return {
    validation_budget: validationBudget,
    spent: spentVal,
    committed: committedVal,
    available,
    recommended_next_release: available > 0 ? Math.round(Math.min(available, validationBudget * 0.25) * 100) / 100 : 0,
    reason: available > 0
      ? `${available} disponível de um budget de validação de ${validationBudget} — recomenda-se liberar em incrementos (25% do budget total por vez), nunca tudo de uma vez.`
      : 'budget de validação já comprometido/gasto integralmente — nenhuma liberação adicional recomendada sem reavaliação.',
    max_loss_before_redecision: maxLossBeforeRedecision,
    stop_loss: stopLoss,
    validation_capital_reference: validationBudget, // item 31 — rótulo explícito: é referência, não teto permanente
  };
}

module.exports = { buildCapitalPlan };
