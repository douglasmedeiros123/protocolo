'use strict';

// item 32 — 3 níveis de atribuição de receita. LIFETIME_REVENUE é sempre NOT_AVAILABLE quando
// LTV não existe (nunca projetado — mesma disciplina já usada no roasTypes do Strategy Search).
function buildRevenueAttribution({ grossRevenue, spend }) {
  return {
    ACQUISITION_REVENUE: { status: 'AVAILABLE', value: grossRevenue, source: 'Hotmart gross_revenue do período — receita da primeira transação, sem descontar reembolso/cancelamento futuro.' },
    TRANSACTION_REVENUE: { status: 'AVAILABLE', value: grossRevenue, source: 'idêntico hoje a ACQUISITION_REVENUE — produto único, sem bundle multi-transação distinto ainda.' },
    LIFETIME_REVENUE: { status: 'NOT_AVAILABLE', value: null, source: 'NENHUM sistema de LTV/recompra implementado — nunca projetado (mesma disciplina do Strategy Search roasTypes).' },
  };
}

// item 33 — interface de atribuição de lucro. UNKNOWN/NOT_AVAILABLE quando custo não existe,
// nunca assumido.
function buildProfitAttribution({ spend, grossRevenue, netRevenue, refundsGross, hotmartFeeTotal }) {
  const contributionProfit = (netRevenue != null && spend != null) ? netRevenue - spend : null;
  return {
    ad_spend: spend,
    gross_revenue: grossRevenue,
    net_revenue: netRevenue,
    refunds: refundsGross,
    hotmart_fee: hotmartFeeTotal,
    variable_costs_other: 'NOT_AVAILABLE', // nenhum custo variável além de mídia/taxa Hotmart é rastreado hoje
    fixed_costs: 'NOT_AVAILABLE',
    contribution_profit: contributionProfit, // margem de contribuição real (mídia + taxa Hotmart), nunca lucro líquido do negócio
    profit: 'NOT_AVAILABLE', // lucro líquido completo exige custos fixos/operacionais não rastreados hoje — nunca assumido
    note: 'PROFIT_TRUTH é PARTIAL (ver source-of-truth matrix) — contribution_profit é real e confiável no nível mídia+taxa; profit completo do negócio permanece NOT_AVAILABLE até custos adicionais serem rastreados.',
  };
}

module.exports = { buildRevenueAttribution, buildProfitAttribution };
