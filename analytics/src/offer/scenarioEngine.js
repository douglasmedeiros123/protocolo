'use strict';

const { safeDiv } = require('../metrics/safeDiv');

// SCENARIO ENGINE (PASSO 10, item 27) — cenários determinísticos, SEMPRE rotulados
// SCENARIO_NOT_FORECAST (nunca chamados de previsão/projeção garantida). Combina variação de
// AOV isolada com variação combinada CPA+AOV, igual ao pedido no item 26 (caminho combinado).
const AOV_SCENARIOS = [0, 0.10, 0.20, 0.30, 0.50]; // 0 = CURRENT
const COMBINED_SCENARIOS = [
  { cpaChangePct: -0.10, aovChangePct: 0.10 },
  { cpaChangePct: -0.20, aovChangePct: 0.20 },
  { cpaChangePct: -0.30, aovChangePct: 0.30 },
];

function simulateScenario({ currentCpa, currentNetRevenuePerBuyer, cpaChangePct, aovChangePct }) {
  const projectedCpa = currentCpa != null ? currentCpa * (1 + cpaChangePct) : null;
  const projectedNetRevenuePerBuyer = currentNetRevenuePerBuyer != null ? currentNetRevenuePerBuyer * (1 + aovChangePct) : null;
  const projectedRoas = safeDiv(projectedNetRevenuePerBuyer, projectedCpa);
  return {
    label: `CPA ${cpaChangePct >= 0 ? '+' : ''}${(cpaChangePct * 100).toFixed(0)}%, AOV ${aovChangePct >= 0 ? '+' : ''}${(aovChangePct * 100).toFixed(0)}%`,
    cpa_change_pct: cpaChangePct,
    aov_change_pct: aovChangePct,
    projected_cpa: projectedCpa != null ? Math.round(projectedCpa * 100) / 100 : null,
    projected_net_revenue_per_buyer: projectedNetRevenuePerBuyer != null ? Math.round(projectedNetRevenuePerBuyer * 100) / 100 : null,
    expected_financial_roas: projectedRoas != null ? Math.round(projectedRoas * 1000) / 1000 : null,
    status: 'SCENARIO_NOT_FORECAST',
  };
}

/**
 * runOfferScenarios() (PASSO 10, item 27) — CURRENT + variações de AOV isoladas + combinações
 * CPA+AOV (item 26, caminho combinado). Todo cenário rotulado SCENARIO_NOT_FORECAST.
 */
function runOfferScenarios({ currentCpa, currentNetRevenuePerBuyer }) {
  const aovOnly = AOV_SCENARIOS.map((aovChangePct) => simulateScenario({ currentCpa, currentNetRevenuePerBuyer, cpaChangePct: 0, aovChangePct }));
  const combined = COMBINED_SCENARIOS.map((s) => simulateScenario({ currentCpa, currentNetRevenuePerBuyer, ...s }));
  return {
    current: aovOnly[0],
    aov_only_scenarios: aovOnly,
    combined_scenarios: combined,
    note: 'Todo cenário é uma simulação determinística (fórmula ROAS = net_revenue_per_buyer / CPA aplicada aos deltas informados) — NUNCA uma previsão do que vai acontecer de fato.',
  };
}

module.exports = { runOfferScenarios, simulateScenario, AOV_SCENARIOS, COMBINED_SCENARIOS };
