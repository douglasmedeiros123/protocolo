'use strict';

// Classificação determinística: qual caminho (do gap do Profit Engine) esse target_metric ataca.
// Regra: qualquer métrica que aumenta PEDIDOS pro mesmo gasto (topo/meio de funil) ataca CPA
// (porque CPA = gasto / pedidos); qualquer métrica que aumenta o VALOR de cada pedido ataca AOV.
const CPA_PATH_METRICS = ['ctr', 'cpm', 'cpc', 'taxa_click_lpv', 'taxa_lpv_checkout', 'taxa_checkout_compra', 'cpa_financeiro', 'cpa_meta'];
const AOV_PATH_METRICS = ['aov_liquido', 'aov_bruto', 'order_bump_attach_rate', 'order_bump_revenue_liquido', 'order_bump_revenue_bruto'];

function classifyPath(targetMetric) {
  if (CPA_PATH_METRICS.includes(targetMetric)) return 'CPA';
  if (AOV_PATH_METRICS.includes(targetMetric)) return 'AOV';
  return 'INDETERMINADO';
}

/**
 * Compara o gap real (do Profit Engine) nos dois caminhos e diz qual tem mais folga a ganhar —
 * usado pra contextualizar a prioridade, não pra decidir sozinho.
 */
function compareGapMagnitude(gap) {
  const cpaPct = gap.cpa_path.reduction_needed_percent;
  const aovPct = gap.aov_path.increase_needed_percent;
  if (cpaPct == null || aovPct == null) return { larger_gap: null, reason: 'gap indisponível (sem CPA/AOV atual no período)' };
  return {
    larger_gap: Math.abs(cpaPct) <= Math.abs(aovPct) ? 'CPA' : 'AOV',
    cpa_reduction_needed_percent: cpaPct,
    aov_increase_needed_percent: aovPct,
    reason: Math.abs(cpaPct) <= Math.abs(aovPct)
      ? 'o caminho CPA exige uma mudança percentual menor que o caminho AOV pra bater a meta'
      : 'o caminho AOV exige uma mudança percentual menor que o caminho CPA pra bater a meta',
  };
}

module.exports = { classifyPath, compareGapMagnitude, CPA_PATH_METRICS, AOV_PATH_METRICS };
