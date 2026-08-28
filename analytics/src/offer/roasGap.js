'use strict';

const { TARGET_FINANCIAL_ROAS } = require('../decision/northStar');
const { safeDiv } = require('../metrics/safeDiv');

// ROAS 3 GAP (PASSO 10, item 25) — financial_roas ≈ net_revenue_per_buyer / financial_cpa
// (mesma identidade do North Star, ver decision/northStar.js — reusa TARGET_FINANCIAL_ROAS=3.0,
// nunca um número duplicado/hardcoded aqui). Dado o CPA atual, calcula o net_revenue_per_buyer
// que bateria ROAS 3; dado o net_revenue_per_buyer atual, calcula o CPA que bateria ROAS 3.
function computeRoas3Gap({ financialCpa, netRevenuePerBuyer }) {
  const currentFinancialRoas = safeDiv(netRevenuePerBuyer, financialCpa);

  const requiredNetRevenuePerBuyerAtCurrentCpa = financialCpa != null ? Math.round(financialCpa * TARGET_FINANCIAL_ROAS * 100) / 100 : null;
  const aovGapToRoas3 = requiredNetRevenuePerBuyerAtCurrentCpa != null && netRevenuePerBuyer != null
    ? Math.round((requiredNetRevenuePerBuyerAtCurrentCpa - netRevenuePerBuyer) * 100) / 100
    : null;
  const aovGapToRoas3Percent = aovGapToRoas3 != null && netRevenuePerBuyer > 0
    ? Math.round((aovGapToRoas3 / netRevenuePerBuyer) * 10000) / 10000
    : null;

  const requiredCpaAtCurrentNetRevenuePerBuyer = netRevenuePerBuyer != null ? Math.round((netRevenuePerBuyer / TARGET_FINANCIAL_ROAS) * 100) / 100 : null;
  const cpaGapToRoas3 = requiredCpaAtCurrentNetRevenuePerBuyer != null && financialCpa != null
    ? Math.round((financialCpa - requiredCpaAtCurrentNetRevenuePerBuyer) * 100) / 100
    : null;

  return {
    target_roas: TARGET_FINANCIAL_ROAS,
    current_financial_roas: currentFinancialRoas,
    current_financial_cpa: financialCpa,
    current_net_revenue_per_buyer: netRevenuePerBuyer,
    required_net_revenue_per_buyer_at_current_cpa: requiredNetRevenuePerBuyerAtCurrentCpa,
    aov_gap_to_roas3: aovGapToRoas3,
    aov_gap_to_roas3_percent: aovGapToRoas3Percent,
    required_cpa_at_current_net_revenue_per_buyer: requiredCpaAtCurrentNetRevenuePerBuyer,
    cpa_gap_to_roas3: cpaGapToRoas3,
    formula: 'financial_roas = net_revenue_per_buyer / financial_cpa (mesma identidade usada no North Star do Decision Engine).',
  };
}

module.exports = { computeRoas3Gap };
