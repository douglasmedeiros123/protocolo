'use strict';

/**
 * financial_confidence do período: 'normal' se nenhum dia teve flag crítica de data quality E
 * a cobertura de dados está completa; 'degraded' caso contrário — nunca ignora, nunca corrige
 * sozinho, só rebaixa a confiança e diz exatamente por quê.
 */
function computeFinancialConfidence(aggregateResult) {
  const reasons = [];

  if (aggregateResult.critical_flags_by_day.length > 0) {
    for (const { date, codes } of aggregateResult.critical_flags_by_day) {
      reasons.push(`${date}: ${codes.join(', ')}`);
    }
  }

  if (aggregateResult.data_completeness != null && aggregateResult.data_completeness < 1) {
    reasons.push(
      `cobertura de dados incompleta: ${aggregateResult.days_found.length}/${aggregateResult.dates_requested.length} dias com snapshot (faltando: ${aggregateResult.days_missing.join(', ') || 'nenhum'})`
    );
  }

  return {
    financial_confidence: reasons.length > 0 ? 'degraded' : 'normal',
    reasons,
    days_with_critical_flags: aggregateResult.critical_flags_by_day.map((d) => d.date),
    data_completeness: aggregateResult.data_completeness,
    days_found: aggregateResult.days_found.length,
    days_requested: aggregateResult.dates_requested.length,
    days_missing: aggregateResult.days_missing,
  };
}

module.exports = { computeFinancialConfidence };
