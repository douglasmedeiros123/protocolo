'use strict';

const { DATA_QUALITY_DIMENSIONS } = require('./enums');

function qualitativeFromRatio(ratio) {
  if (ratio == null) return 'UNKNOWN';
  if (ratio >= 0.95) return 'HIGH';
  if (ratio >= 0.7) return 'MEDIUM';
  return 'LOW';
}

/**
 * buildDataQualityDimensions() — item 34. 7 dimensões qualitativas, sem falsa precisão numérica
 * — reusa direto o que aggregatePeriod/reconciliation já calcularam, nunca recalcula do zero.
 */
function buildDataQualityDimensions({ dataCompleteness, matchRate, trackingConfidenceScore, ghostPurchaseDaysCount, daysEvaluated }) {
  return {
    COMPLETENESS: { level: qualitativeFromRatio(dataCompleteness), evidence: `data_completeness real do período: ${dataCompleteness}.` },
    CONSISTENCY: { level: qualitativeFromRatio(matchRate), evidence: `match_rate real da reconciliação Meta<->Hotmart: ${matchRate}.` },
    FRESHNESS: { level: 'MEDIUM', evidence: 'coleta diária D-1/D0 — nunca em tempo real (mesma cadência de todo o sistema desde o PASSO 1).' },
    UNIQUENESS: { level: 'HIGH', evidence: 'DUPLICATE_TRANSACTION é uma flag crítica ativa (metrics/dataQuality.js) — duplicidade real é detectada, não presumida ausente.' },
    VALIDITY: { level: trackingConfidenceScore == null ? 'UNKNOWN' : (trackingConfidenceScore >= 90 ? 'HIGH' : trackingConfidenceScore >= 60 ? 'MEDIUM' : 'LOW'), evidence: `confidence_score real do trackingAssessment: ${trackingConfidenceScore}.` },
    JOINABILITY: { level: 'LOW', evidence: 'sem identificador determinístico Meta<->Hotmart (item 11 do audit real) — join é sempre agregado/probabilístico.' },
    TRACEABILITY: { level: ghostPurchaseDaysCount > 0 ? 'MEDIUM' : 'HIGH', evidence: `${ghostPurchaseDaysCount} dia(s) com divergência platform-only rastreada e preservada explicitamente em ${daysEvaluated} dia(s) avaliados.` },
  };
}

/**
 * buildLineageForMetric() — item 35 (lineage aditivo — nunca cria um sistema novo, só documenta
 * a cadeia real já existente pra uma métrica crítica).
 */
function buildLineageForMetric(metricName) {
  const LINEAGE = {
    roas_financeiro: { source: 'Hotmart + Meta raw', collector: 'collectors/hotmart.js + collectors/meta.js', normalizer: 'normalizers/hotmart.js + normalizers/meta.js', transformation: 'profit/aggregate.js -> profit/financials.js', source_of_truth: 'Hotmart (receita), Meta (gasto)', period: 'diário, agregável', version: 'V1', limitation: 'não inclui custos fixos/operacionais fora de mídia+taxa Hotmart.' },
    financial_roas: { source: 'idêntico a roas_financeiro', collector: 'collectors/hotmart.js + collectors/meta.js', normalizer: 'normalizers/hotmart.js + normalizers/meta.js', transformation: 'profit/aggregate.js -> profit/financials.js', source_of_truth: 'Hotmart (receita), Meta (gasto)', period: 'diário, agregável', version: 'V1', limitation: 'mesmo de roas_financeiro.' },
    compra_meta: { source: 'Meta Insights API (raw)', collector: 'collectors/meta.js', normalizer: 'normalizers/meta.js', transformation: 'soma direta por dia', source_of_truth: 'nenhuma — é a alegação da própria Meta, nunca a verdade financeira (item 2)', period: 'diário', version: 'V1', limitation: 'já observado divergindo da Hotmart em dias reais (ghost purchase).' },
    gross_revenue: { source: 'Hotmart Sales History API (raw)', collector: 'collectors/hotmart.js', normalizer: 'normalizers/hotmart.js', transformation: 'soma de gross por transação com counted_as_revenue=true', source_of_truth: 'Hotmart — única fonte financeira', period: 'diário', version: 'V1', limitation: 'nenhuma limitação estrutural conhecida além de dias faltantes.' },
  };
  return LINEAGE[metricName] || { source: 'NOT_DOCUMENTED', collector: null, normalizer: null, transformation: null, source_of_truth: 'UNKNOWN', period: null, version: null, limitation: `lineage ainda não documentado pra ${metricName} — lista aditiva, cresce sob demanda (item 35), nunca inventado.` };
}

module.exports = { DATA_QUALITY_DIMENSIONS, buildDataQualityDimensions, buildLineageForMetric };
