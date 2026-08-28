'use strict';

const { simulateScenario } = require('../profit/scenarios');

/**
 * Estima o impacto em CPA/AOV/ROAS/lucro de um experimento — reaproveita EXATAMENTE o simulador
 * determinístico do Profit Engine (mesma fórmula usada nos cenários A-D), não reinventa
 * matemática nova. `expectedEffect` é { cpaChangePct, aovChangePct } — a mesma forma dos
 * cenários. Isso é PROJEÇÃO, não garantia: rotulado como tal em todo lugar que aparece.
 */
function estimateImpact(currentFinancials, expectedEffect, budgetLimit) {
  const financialsAtBudget = { ...currentFinancials, gasto_meta: budgetLimit };
  const projection = simulateScenario(financialsAtBudget, expectedEffect);
  // "Não fazer nada" no MESMO orçamento — usado como base de comparação. Sem isso, o impacto do
  // experimento fica poluído pelo tamanho do próprio budget_limit de teste (um teste pequeno
  // pareceria "ruim" mesmo melhorando CPA/AOV de verdade, só porque R$280 sozinho não cobre o
  // prejuízo herdado do período inteiro).
  const baselineNoChange = simulateScenario(financialsAtBudget, { cpaChangePct: 0, aovChangePct: 0 });

  const lucroImpact = (projection.lucro_prejuizo_projetado != null && baselineNoChange.lucro_prejuizo_projetado != null)
    ? {
      baseline_sem_mudanca_no_budget: baselineNoChange.lucro_prejuizo_projetado,
      projetado_no_budget: projection.lucro_prejuizo_projetado,
      // este é o número que representa o VALOR do experimento em si (o que muda por causa dele,
      // isolado do fato de o orçamento de teste ser pequeno) — é o que alimenta o priority score.
      delta_vs_nao_fazer_nada: projection.lucro_prejuizo_projetado - baselineNoChange.lucro_prejuizo_projetado,
    }
    : null;

  return {
    is_projection_not_guarantee: true,
    based_on: 'profit/scenarios.js — mesmo simulador determinístico usado nos cenários A-D do Profit Engine',
    budget_used: budgetLimit,
    cpa_impact: projection.cpa_projetado != null && currentFinancials.cpa_financeiro != null
      ? { atual: currentFinancials.cpa_financeiro, projetado: projection.cpa_projetado, delta: projection.cpa_projetado - currentFinancials.cpa_financeiro }
      : null,
    aov_impact: projection.aov_projetado != null && currentFinancials.aov_liquido != null
      ? { atual: currentFinancials.aov_liquido, projetado: projection.aov_projetado, delta: projection.aov_projetado - currentFinancials.aov_liquido }
      : null,
    roas_impact: projection.roas_projetado != null && currentFinancials.roas_financeiro != null
      ? { atual: currentFinancials.roas_financeiro, projetado: projection.roas_projetado, delta: projection.roas_projetado - currentFinancials.roas_financeiro }
      : null,
    lucro_impact: lucroImpact,
    raw_projection: projection,
  };
}

module.exports = { estimateImpact };
