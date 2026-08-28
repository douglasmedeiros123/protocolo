'use strict';

const capitalConfig = require('../../config/capital');

/**
 * Calcula e INFORMA capital_status — nunca bloqueia campanha, nunca altera orçamento (essa
 * etapa é só preparação de lógica). `spentThisMonth` vem de dado real já agregado (a janela
 * current_month). Os limites (monthly_budget etc.) só aparecem preenchidos se você já os
 * configurou em analytics/config/capital.js — nunca são inventados aqui.
 */
function computeCapitalStatus(spentThisMonth, overrides = {}) {
  const cfg = { ...capitalConfig, ...overrides };
  const { monthly_budget, max_monthly_loss, max_test_budget_percent, max_daily_spend } = cfg;

  const budget_remaining = monthly_budget == null ? null : monthly_budget - spentThisMonth;

  return {
    configured: monthly_budget != null,
    // true só quando o valor veio de override explícito de execução (ex: --monthly-budget),
    // não do arquivo de config commitado — pra deixar claro que não é config permanente.
    monthly_budget_source: overrides.monthly_budget != null ? 'cli_override_simulation_only' : (capitalConfig.monthly_budget != null ? 'config_file' : null),
    spent_this_month: spentThisMonth,
    monthly_budget,
    budget_remaining,
    limits: { max_monthly_loss, max_test_budget_percent, max_daily_spend },
    note: monthly_budget == null
      ? 'monthly_budget não configurado em analytics/config/capital.js — só spent_this_month é real, o restante fica null até você definir um valor.'
      : (overrides.monthly_budget != null ? 'monthly_budget usado apenas nesta execução (--monthly-budget), não foi salvo em analytics/config/capital.js.' : null),
  };
}

module.exports = { computeCapitalStatus };
