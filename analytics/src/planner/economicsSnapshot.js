'use strict';

const { aggregatePeriod } = require('../profit/aggregate');
const { computeCurrentFinancials } = require('../profit/financials');
const { classifyProfitStatus } = require('../profit/status');
const { computeRoas3Gap } = require('../offer/roasGap');
const { runOfferScenarios } = require('../offer/scenarioEngine');
const { computeMilestoneProgress, classifyFinancialMilestone } = require('./milestones');

/**
 * buildEconomicsSnapshot() — PASSO 11, items 9/39/41. Recalcula a economia atual a partir dos
 * MESMOS engines determinísticos que Profit/Offer já usam (profit/aggregate.js +
 * profit/financials.js) — nunca uma fórmula própria nova, nunca lida de analysis.json persistido
 * de outro agente (que pode estar desatualizado). ROAS3 gap e cenários reusam offer/roasGap.js e
 * offer/scenarioEngine.js diretamente (mesma fonte usada no PASSO 10), nunca duplicados.
 */
function buildEconomicsSnapshot(dates, dataDir) {
  const agg = aggregatePeriod(dates, dataDir);
  const financials = computeCurrentFinancials(agg.sum);

  const roas3Gap = computeRoas3Gap({ financialCpa: financials.cpa_financeiro, netRevenuePerBuyer: financials.aov_liquido });
  const scenarios = runOfferScenarios({ currentCpa: financials.cpa_financeiro, currentNetRevenuePerBuyer: financials.aov_liquido });
  const profitStatus = classifyProfitStatus(financials.roas_financeiro, roas3Gap.target_roas);
  const milestoneProgress = computeMilestoneProgress(financials.roas_financeiro);
  const financialMilestone = classifyFinancialMilestone(financials.roas_financeiro, financials.lucro_prejuizo);

  // item 41 — best combined scenario real (nunca hardcoded), pra sustentar a conclusão
  // "known quantified levers do not currently close the gap" quando for o caso real.
  const combinedScenarios = scenarios.combined_scenarios || [];
  const bestCombinedScenario = combinedScenarios.length
    ? combinedScenarios.reduce((best, s) => (s.expected_financial_roas != null && (best == null || s.expected_financial_roas > best.expected_financial_roas) ? s : best), null)
    : null;
  const knownLeversCloseGap = bestCombinedScenario && bestCombinedScenario.expected_financial_roas != null
    ? bestCombinedScenario.expected_financial_roas >= roas3Gap.target_roas
    : null; // null = não avaliável (sem cenário real disponível)

  return {
    period: { dates_requested: dates.length, days_found: agg.days_found.length, days_missing: agg.days_missing, data_completeness: agg.data_completeness },
    critical_flags_by_day: agg.critical_flags_by_day,
    critical_tracking_issue: agg.critical_flags_by_day.length > 0,
    financials,
    profit_status: profitStatus,
    roas3_gap: roas3Gap,
    scenarios,
    best_combined_scenario: bestCombinedScenario,
    known_quantified_levers_close_gap: knownLeversCloseGap,
    milestone_progress: milestoneProgress,
    financial_milestone: financialMilestone,
    source: 'profit/aggregate.js + profit/financials.js (Hotmart/Meta real, analytics/data/daily/) — mesmos engines usados por Profit/Decision/Offer, nunca recalculado com fórmula própria.',
  };
}

module.exports = { buildEconomicsSnapshot };
