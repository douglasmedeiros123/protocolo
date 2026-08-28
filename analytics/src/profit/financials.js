'use strict';

const { safeDiv } = require('../metrics/safeDiv');

/**
 * current_financials + as métricas de negócio pedidas, calculadas sobre a SOMA do período
 * (nunca média de razão diária — ver aggregate.js). Hotmart é a fonte de receita real; Meta só
 * aparece nas métricas explicitamente rotuladas "marketing"/"meta" para comparação.
 */
function computeCurrentFinancials(sum) {
  const gasto_meta = sum.spend;
  const receita_bruta_hotmart = sum.gross_revenue;
  const receita_liquida_hotmart = sum.net_revenue;
  const lucro_prejuizo = receita_liquida_hotmart - gasto_meta;

  return {
    gasto_meta,
    receita_bruta_hotmart,
    receita_liquida_hotmart,
    lucro_prejuizo,
    roas_marketing: safeDiv(sum.receita_meta, gasto_meta),
    roas_financeiro: safeDiv(receita_liquida_hotmart, gasto_meta),
    cpa_meta: safeDiv(gasto_meta, sum.compra_meta),
    cpa_financeiro: safeDiv(gasto_meta, sum.orders_count),
    aov_bruto: safeDiv(receita_bruta_hotmart, sum.orders_count),
    aov_liquido: safeDiv(receita_liquida_hotmart, sum.orders_count),
    numero_compradores_reais: sum.orders_count,
    order_bump_revenue_bruto: sum.order_bump_gross,
    order_bump_revenue_liquido: sum.order_bump_net,
    order_bump_attach_rate: safeDiv(sum.order_bumps_count, sum.orders_count),
    refunds_count: sum.refunds_count,
    refunds_value: sum.refunds_gross,
    refund_rate: safeDiv(sum.refunds_gross, receita_bruta_hotmart),
  };
}

const ROAS_TARGETS_TABLE = [1, 1.2, 1.5, 2, 2.5, 3];
const CPA_REFERENCE_TABLE = [30, 40, 50, 60, 70];

/**
 * Economia unitária: CPA de equilíbrio, CPA máximo para cada ROAS da tabela, e AOV necessário
 * pra sustentar cada CPA de referência (+ o CPA atual) NO ROAS-alvo informado.
 */
function computeUnitEconomics(currentFinancials, targetRoas) {
  const aov = currentFinancials.aov_liquido;
  const cpaAtual = currentFinancials.cpa_financeiro;

  const cpa_max_por_roas = {};
  for (const roas of ROAS_TARGETS_TABLE) cpa_max_por_roas[roas] = safeDiv(aov, roas);

  const aov_necessario_por_cpa = {};
  const cpaRefs = { atual: cpaAtual, ...Object.fromEntries(CPA_REFERENCE_TABLE.map((c) => [c, c])) };
  for (const [label, cpa] of Object.entries(cpaRefs)) {
    aov_necessario_por_cpa[label] = cpa == null ? null : cpa * targetRoas;
  }

  return {
    target_roas_usado_nas_tabelas: targetRoas,
    cpa_equilibrio: aov, // ROAS=1: CPA de equilíbrio é literalmente o AOV líquido
    cpa_maximo_por_roas: cpa_max_por_roas,
    aov_necessario_por_cpa,
    // As duas perguntas explícitas, isoladas pra ficar fácil de citar direto:
    aov_necessario_mantendo_cpa_atual: cpaAtual == null ? null : cpaAtual * targetRoas,
    cpa_necessario_mantendo_aov_atual: safeDiv(aov, targetRoas),
  };
}

module.exports = { computeCurrentFinancials, computeUnitEconomics, ROAS_TARGETS_TABLE, CPA_REFERENCE_TABLE };
