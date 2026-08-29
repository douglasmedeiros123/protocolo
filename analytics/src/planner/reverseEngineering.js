'use strict';

const { safeDiv } = require('../metrics/safeDiv');

/**
 * items 36 — engenharia reversa: pra faturar R$X, quantos buyers/qual CPA máximo. Se um input
 * necessário for desconhecido, retorna null explícito — nunca inventa AOV/CPA/target.
 */
function computeRequiredBuyers({ revenueTarget, aov }) {
  return { required_buyers: safeDiv(revenueTarget, aov), formula: 'revenue_target / aov', inputs: { revenueTarget, aov } };
}

function computeRequiredMediaSpend({ requiredBuyers, cpa }) {
  const spend = requiredBuyers != null && cpa != null ? Math.round(requiredBuyers * cpa * 100) / 100 : null;
  return { required_media_spend: spend, formula: 'required_buyers * cpa', inputs: { requiredBuyers, cpa } };
}

function computeMaxSpendForRoasTarget({ expectedRevenue, roasTarget }) {
  return { max_spend: safeDiv(expectedRevenue, roasTarget), formula: 'expected_revenue / roas_target', inputs: { expectedRevenue, roasTarget } };
}

/**
 * item 37 — metas temporais. NUNCA inventadas: se não configuradas explicitamente, cada campo é
 * o literal NOT_CONFIGURED (não null, pra distinguir de "configurado mas indisponível").
 */
function buildTargetPlanning({ annualTarget = null, monthlyTarget = null, weeklyTarget = null } = {}) {
  return {
    annual_target: annualTarget ?? 'NOT_CONFIGURED',
    monthly_target: monthlyTarget ?? 'NOT_CONFIGURED',
    weekly_target: weeklyTarget ?? 'NOT_CONFIGURED',
  };
}

/**
 * item 38 — "estamos no caminho?" só é avaliável com meta temporal configurada E receita real do
 * período pra comparar. Caso contrário NOT_CONFIGURED/INSUFFICIENT_DATA — nunca um chute.
 */
function evaluateOnTrack({ targetPlanning, periodRevenue, periodLabel }) {
  const target = targetPlanning.monthly_target; // usa o horizonte mensal como referência padrão de "on track"
  if (target === 'NOT_CONFIGURED' || target == null) {
    return { status: 'NOT_CONFIGURED', reason: 'nenhuma meta temporal (monthly_target) configurada — "on track" não é avaliável (item 38).' };
  }
  if (periodRevenue == null) {
    return { status: 'INSUFFICIENT_DATA', reason: `receita real do período (${periodLabel || 'período atual'}) indisponível.` };
  }
  const ratio = target > 0 ? periodRevenue / target : null;
  if (ratio == null) return { status: 'INSUFFICIENT_DATA', reason: 'meta configurada é inválida (<= 0).' };
  if (ratio >= 0.9) return { status: 'ON_TRACK', reason: `receita do período (${periodRevenue}) é ${(ratio * 100).toFixed(1)}% da meta (${target}).` };
  if (ratio >= 0.5) return { status: 'AT_RISK', reason: `receita do período (${periodRevenue}) é apenas ${(ratio * 100).toFixed(1)}% da meta (${target}).` };
  return { status: 'OFF_TRACK', reason: `receita do período (${periodRevenue}) é só ${(ratio * 100).toFixed(1)}% da meta (${target}).` };
}

module.exports = { computeRequiredBuyers, computeRequiredMediaSpend, computeMaxSpendForRoasTarget, buildTargetPlanning, evaluateOnTrack };
