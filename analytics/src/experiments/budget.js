'use strict';

/**
 * Valida budget_limit contra o capital_cycle (NUNCA contra o histórico do Profit Engine —
 * ver PASSO 5.1). Não bloqueia nem gasta nada aqui — só emite um veredito determinístico.
 *
 * `maxBudgetPercentOfCycle` é OPCIONAL e sem valor padrão embutido — não escolhemos um
 * percentual universal ainda (ex: "15% do ciclo"). Se não for informado, o check
 * BUDGET_TOO_LARGE_FOR_CYCLE simplesmente não é avaliado (fica `not_evaluated`), em vez de
 * usar um número inventado.
 */
function validateBudgetLimit(budgetLimit, capitalCycle, maxBudgetPercentOfCycle) {
  if (budgetLimit == null || budgetLimit <= 0) {
    return { status: 'INVALID_BUDGET', valid: false, reason: 'budget_limit precisa ser um valor positivo.' };
  }

  if (!capitalCycle || capitalCycle.status === 'CAPITAL_NOT_CONFIGURED') {
    return {
      status: 'CAPITAL_NOT_CONFIGURED',
      valid: null,
      budget_percent_of_cycle: null,
      reason: 'Nenhum capital_cycle configurado — não é possível aprovar nem reprovar contra um teto real.',
    };
  }

  const budget_percent_of_cycle = capitalCycle.cycle_budget > 0 ? budgetLimit / capitalCycle.cycle_budget : null;

  const withinAvailable = capitalCycle.cycle_available != null ? budgetLimit <= capitalCycle.cycle_available : null;

  let tooLarge = null;
  if (maxBudgetPercentOfCycle != null && budget_percent_of_cycle != null) {
    tooLarge = budget_percent_of_cycle > maxBudgetPercentOfCycle;
  }

  const flags = [];
  if (withinAvailable === false) flags.push('EXCEEDS_CYCLE_AVAILABLE');
  if (tooLarge === true) flags.push('BUDGET_TOO_LARGE_FOR_CYCLE');

  return {
    status: flags.length ? flags[0] : 'OK',
    valid: withinAvailable === false || tooLarge === true ? false : (withinAvailable == null ? null : true),
    budget_percent_of_cycle,
    within_cycle_available: withinAvailable,
    max_budget_percent_of_cycle: maxBudgetPercentOfCycle ?? null,
    budget_too_large_for_cycle: maxBudgetPercentOfCycle == null ? 'not_evaluated (nenhum percentual máximo configurado)' : tooLarge,
    flags,
  };
}

module.exports = { validateBudgetLimit };
