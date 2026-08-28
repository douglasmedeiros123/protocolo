'use strict';

const { safeDiv } = require('../metrics/safeDiv');

// Cenários pré-definidos pedidos, como % relativo de mudança sobre o CPA e o AOV atuais.
const PRESET_SCENARIOS = {
  A: { label: 'CPA -10%, AOV igual', cpaChangePct: -0.10, aovChangePct: 0 },
  B: { label: 'CPA -20%, AOV +10%', cpaChangePct: -0.20, aovChangePct: 0.10 },
  C: { label: 'CPA -30%, AOV +20%', cpaChangePct: -0.30, aovChangePct: 0.20 },
  D: { label: 'CPA -40%, AOV +30%', cpaChangePct: -0.40, aovChangePct: 0.30 },
};

/**
 * Simula um cenário mantendo o GASTO do período real constante — só a eficiência (CPA/AOV)
 * muda. "Vendas necessárias" = quantas vendas esse gasto compraria no CPA projetado.
 * Determinístico: mesma entrada sempre produz a mesma saída, nada de IA no meio.
 */
function simulateScenario(currentFinancials, { cpaChangePct, aovChangePct, label }) {
  const { gasto_meta, cpa_financeiro, aov_liquido } = currentFinancials;
  if (cpa_financeiro == null || aov_liquido == null || cpa_financeiro <= 0) {
    return { label: label || null, cpaChangePct, aovChangePct, error: 'Sem CPA/AOV atual válido para simular (sem vendas no período).' };
  }

  const cpa_projetado = cpa_financeiro * (1 + cpaChangePct);
  const aov_projetado = aov_liquido * (1 + aovChangePct);
  const vendas_necessarias = cpa_projetado > 0 ? safeDiv(gasto_meta, cpa_projetado) : null;
  const receita_projetada = vendas_necessarias == null ? null : vendas_necessarias * aov_projetado;
  const lucro_prejuizo_projetado = receita_projetada == null ? null : receita_projetada - gasto_meta;
  const roas_projetado = safeDiv(aov_projetado, cpa_projetado);

  return {
    label: label || null,
    inputs: { cpaChangePct, aovChangePct },
    gasto_base: gasto_meta,
    cpa_projetado,
    aov_projetado,
    roas_projetado,
    vendas_necessarias,
    receita_projetada,
    lucro_prejuizo_projetado,
  };
}

function runPresetScenarios(currentFinancials) {
  const out = {};
  for (const [key, def] of Object.entries(PRESET_SCENARIOS)) {
    out[key] = simulateScenario(currentFinancials, def);
  }
  return out;
}

module.exports = { simulateScenario, runPresetScenarios, PRESET_SCENARIOS };
