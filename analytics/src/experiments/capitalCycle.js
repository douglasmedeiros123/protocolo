'use strict';

const { dateRange, isValidDateStr } = require('../utils/dates');
const { aggregatePeriod } = require('../profit/aggregate');

/**
 * capital_cycle é DELIBERADAMENTE separado do histórico do Profit Engine — ver PASSO 5.1.
 * O histórico (analytics/data/profit/*.json, campo capital_status) mostra o que JÁ aconteceu.
 * O capital_cycle mostra o que está DISPONÍVEL pra um ciclo de teste, que pode ser um período
 * futuro que ainda nem começou. Nunca assume um valor de orçamento — se cycle_budget não for
 * informado explicitamente, o status vira CAPITAL_NOT_CONFIGURED (nunca 0, nunca Infinity).
 *
 * cycle_spent é calculado com dado REAL (via aggregatePeriod, os mesmos snapshots diários do
 * Data Agent) só pros dias do ciclo que já têm snapshot — dias futuros/sem snapshot não
 * contam como gasto 0, ficam de fora da soma e aparecem em `days_missing_in_cycle`.
 */
function computeCapitalCycle({ cycleBudget, cycleStart, cycleEnd, committedFromExperiments = 0, dataDir }) {
  if (cycleBudget == null || !cycleStart || !cycleEnd) {
    return {
      status: 'CAPITAL_NOT_CONFIGURED',
      cycle_start: cycleStart || null,
      cycle_end: cycleEnd || null,
      cycle_budget: cycleBudget ?? null,
      cycle_spent: null,
      cycle_committed: null,
      cycle_available: null,
      note: 'Nenhum capital de ciclo configurado (faltam --cycle-budget/--cycle-start/--cycle-end). Não é assumido nem 0 nem ilimitado.',
    };
  }
  if (!isValidDateStr(cycleStart) || !isValidDateStr(cycleEnd)) {
    throw new Error(`cycle_start/cycle_end inválidos: ${cycleStart} .. ${cycleEnd} (use YYYY-MM-DD)`);
  }

  const dates = dateRange(cycleStart, cycleEnd);
  const agg = dataDir ? aggregatePeriod(dates, dataDir) : aggregatePeriod(dates);
  const cycle_spent = agg.sum.spend;
  const cycle_committed = committedFromExperiments;
  const cycle_available = cycleBudget - cycle_spent - cycle_committed;

  return {
    status: 'CONFIGURED',
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
    cycle_budget: cycleBudget,
    cycle_spent,
    cycle_committed,
    cycle_available,
    days_in_cycle: dates.length,
    days_with_real_spend_data: agg.days_found.length,
    days_missing_in_cycle: agg.days_missing,
  };
}

/** Soma budget_limit de todo experimento em READY/RUNNING — DRAFT nunca compromete capital. */
function computeCommittedBudget(experiments) {
  return experiments
    .filter((e) => ['READY', 'RUNNING'].includes(e.status))
    .reduce((sum, e) => sum + (e.budget_limit || 0), 0);
}

module.exports = { computeCapitalCycle, computeCommittedBudget };
