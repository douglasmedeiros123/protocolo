'use strict';

// PASSO 14B, item 20 — inputs econômicos que um Circuit Breaker real (fora do escopo — sem API
// implementada aqui) consumiria. Estrutura pura, sem chamada externa. Reusa dados já reais do
// Measurement Agent quando disponíveis; UNKNOWN quando não.
function buildCircuitBreakerEconomicInputs({ agg, previousDayAgg }) {
  const unexpectedSpend = 'NOT_CONFIGURED'; // exigiria um orçamento esperado real configurado — nenhum existe hoje
  const spendVelocity = (agg?.sum?.spend != null && previousDayAgg?.sum?.spend != null && previousDayAgg.sum.spend > 0)
    ? agg.sum.spend / previousDayAgg.sum.spend
    : 'UNKNOWN';
  const lossVelocity = (agg?.sum && previousDayAgg?.sum)
    ? ((agg.sum.net_revenue - agg.sum.spend) - (previousDayAgg.sum.net_revenue - previousDayAgg.sum.spend))
    : 'UNKNOWN';
  const unconfirmedSpend = 'NOT_APPLICABLE'; // não existe conceito de "spend não confirmado" hoje — Meta reporta spend real, não pendente
  const financialConversionGap = (agg?.sum?.compra_meta != null && agg?.sum && ((agg.sum.orders_count || 0) + (agg.sum.order_bumps_count || 0)) != null)
    ? agg.sum.compra_meta - ((agg.sum.orders_count || 0) + (agg.sum.order_bumps_count || 0))
    : 'UNKNOWN';
  const policyViolationCount = 0; // nenhum Action real foi executado ainda — nenhuma violação real ocorreu (nunca inventado como positivo)
  const executionErrorRate = 'NOT_APPLICABLE'; // sem execução real, não há taxa de erro de execução a medir

  return {
    unexpected_spend: unexpectedSpend,
    spend_velocity: spendVelocity,
    loss_velocity: lossVelocity,
    unconfirmed_spend: unconfirmedSpend,
    financial_conversion_gap: financialConversionGap,
    policy_violation_count: policyViolationCount,
    execution_error_rate: executionErrorRate,
    note: 'estrutura pura — sem chamada de API real (item 20). Reusa dados já coletados pelo Measurement Agent; UNKNOWN/NOT_CONFIGURED quando o dado real não existe ainda.',
  };
}

module.exports = { buildCircuitBreakerEconomicInputs };
