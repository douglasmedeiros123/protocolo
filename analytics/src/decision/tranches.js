'use strict';

// STAGED CAPITAL RELEASE (PASSO 7, item 12) — nunca libera budget_limit inteiro de uma vez.
// Número de tranches é função do RISCO do experimento (mais risco = mais cautela = mais
// tranches menores). Tabela fixa, documentada — não é chute por experimento:
const N_TRANCHES_BY_RISK = { 1: 2, 2: 3, 3: 4, 4: 4, 5: 5 };

/**
 * Divide budget_limit em N tranches iguais (a última absorve o arredondamento), respeitando
 * cycle_available quando o capital_cycle estiver CONFIGURED — se budget_limit > cycle_available,
 * o total é cortado pro disponível (nunca libera mais do que existe no ciclo). Cada tranche
 * carrega release_condition/stop_condition amarrados ao minimum_evidence e ao kill_condition
 * (failure_condition/success_condition) do próprio experimento — nunca um valor universal como
 * "R$80" fixo (PASSO 7, item 12).
 */
function buildCapitalTranches(experiment, capitalCycle) {
  const risk = experiment.priority?.factors?.risk ?? 3;
  const n = N_TRANCHES_BY_RISK[risk] ?? 4;
  const budgetLimit = experiment.budget_limit;

  const cycleAvailable = capitalCycle && capitalCycle.status === 'CONFIGURED' ? capitalCycle.cycle_available : null;
  const cappedBudget = cycleAvailable != null ? Math.min(budgetLimit, Math.max(cycleAvailable, 0)) : budgetLimit;

  if (cappedBudget <= 0) {
    return {
      tranches: [],
      capped: cycleAvailable != null && cycleAvailable <= 0,
      total_allocated: 0,
      budget_limit_original: budgetLimit,
      note: 'Capital disponível no ciclo é zero ou negativo — nenhuma tranche pode ser liberada.',
    };
  }

  const baseAmount = Math.floor((cappedBudget / n) * 100) / 100;
  const tranches = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const amount = isLast ? Math.round((cappedBudget - allocated) * 100) / 100 : baseAmount;
    allocated += amount;
    tranches.push({
      tranche_index: i + 1,
      amount,
      release_condition: i === 0
        ? `liberação inicial — nenhuma evidência prévia exigida (primeira tranche do experimento ${experiment.experiment_id}).`
        : `tranche ${i} não atingiu failure_condition ("${experiment.failure_condition}") e mostrou sinal parcial válido em direção a "${experiment.success_condition}".`,
      stop_condition: `kill_condition: failure_condition atingida ("${experiment.failure_condition}") OU tranche esgotada sem sinal de melhora no target_metric (${experiment.target_metric}).`,
    });
  }

  return {
    tranches,
    capped: cappedBudget < budgetLimit,
    total_allocated: Math.round(allocated * 100) / 100,
    budget_limit_original: budgetLimit,
    note: cappedBudget < budgetLimit
      ? `budget_limit original (R$${budgetLimit}) excedia o capital disponível no ciclo (R$${cycleAvailable}) — tranches ajustadas pro disponível.`
      : null,
  };
}

module.exports = { buildCapitalTranches, N_TRANCHES_BY_RISK };
