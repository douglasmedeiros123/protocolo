'use strict';

// PASSO 13.1, item 7-8 — subcamada leve de detecção de anomalia, dentro do Measurement Agent
// (nunca um Agent separado ainda). Consome as divergências/reconciliação já existentes — nunca
// recalcula reconciliation.js do zero.
const ANOMALY_TYPES = [
  'META_PURCHASE_WITHOUT_HOTMART_SALE', 'UNMATCHED_PLATFORM_ONLY', 'UNMATCHED_FINANCIAL_ONLY',
  'VALUE_MISMATCH', 'DUPLICATE_SUSPECTED', 'TEST_TRANSACTION', 'REFUND_ANOMALY', 'TIMING_ANOMALY',
  'UNKNOWN_RECONCILIATION',
];
const ANOMALY_SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL', 'CAPITAL_BLOCKING'];

// ARCHITECTURAL DEBT (registrado a pedido explícito, PASSO 13.1 fechamento) — os thresholds
// abaixo (HIGH_RATE_THRESHOLD=30%, os 4 níveis de severidade, o mapeamento fixo tipo->escopo)
// são POLICY HEURISTICS escolhidas por mim nesta implementação, NUNCA leis econômicas
// universais. Uma futura Policy Engine (PASSO 14+) deveria decidir severidade/bloqueio
// considerando, no mínimo: financial materiality (quanto capital realmente está em jogo, não só
// contagem/taxa de dias), frequency (como já existe aqui), persistence (anomalia pontual vs.
// sustentada ao longo de múltiplos períodos, não avaliado aqui), affected_decision (a decisão
// ESPECÍFICA sendo avaliada, não só o escopo genérico), affected_scope (como já existe aqui),
// confidence (o quão certa a própria classificação da anomalia é), e quantitative thresholds
// configuráveis por política (não fixos no código como estão hoje). Este módulo é uma base
// determinística e testável, não a política econômica final do negócio.
const ANOMALY_SEVERITY_IS_POLICY_HEURISTIC_NOTE = 'thresholds/mapeamentos deste módulo são heurísticas de política, não leis econômicas universais — ver comentário acima; revisão pela futura Policy Engine (PASSO 14+) esperada.';

// item 8 — cada tipo de anomalia afeta um escopo específico, nunca "tudo" — ANOMALY_SCOPE !=
// GLOBAL_BLOCK. DUPLICATE_SUSPECTED é o único que toca FINANCIAL_TRUTH diretamente (mesma
// classificação BLOCKING_CODES de trackingAssessment.js) — todo o resto fica em
// PLATFORM_ATTRIBUTION/CROSS_PLATFORM_RECONCILIATION, nunca contaminando a fonte financeira.
const ANOMALY_AFFECTED_SCOPES = {
  META_PURCHASE_WITHOUT_HOTMART_SALE: ['PLATFORM_ATTRIBUTION', 'CROSS_PLATFORM_RECONCILIATION'],
  UNMATCHED_PLATFORM_ONLY: ['PLATFORM_ATTRIBUTION', 'CROSS_PLATFORM_RECONCILIATION'],
  UNMATCHED_FINANCIAL_ONLY: ['CROSS_PLATFORM_RECONCILIATION'],
  VALUE_MISMATCH: ['PLATFORM_ATTRIBUTION'],
  DUPLICATE_SUSPECTED: ['FINANCIAL_TRUTH'],
  TEST_TRANSACTION: ['DATA_QUALITY'],
  REFUND_ANOMALY: ['PROFIT_TRUTH'],
  TIMING_ANOMALY: ['DATA_QUALITY'],
  UNKNOWN_RECONCILIATION: ['CROSS_PLATFORM_RECONCILIATION'],
};

const DIVERGENCE_TO_ANOMALY_TYPE = {
  UNMATCHED_PLATFORM_ONLY: 'META_PURCHASE_WITHOUT_HOTMART_SALE',
  UNMATCHED_FINANCIAL_ONLY: 'UNMATCHED_FINANCIAL_ONLY',
  VALUE_MISMATCH: 'VALUE_MISMATCH',
  DUPLICATE_SUSPECTED: 'DUPLICATE_SUSPECTED',
  TEST_TRANSACTION: 'TEST_TRANSACTION',
  UNKNOWN: 'UNKNOWN_RECONCILIATION',
};

const HIGH_RATE_THRESHOLD = 0.3; // ocorre em >=30% dos dias avaliados -> padrão sistêmico, nunca fixo por contagem absoluta

/**
 * classifyAnomalySeverity() — item 7-8. Nunca fixo ("1 ghost purchase = sempre CAPITAL_BLOCKING"
 * nem "ghost purchase = sempre informational"). Depende de (a) taxa real de ocorrência no
 * período e (b) se o escopo afetado sobrepõe a dependência real da decisão sendo avaliada.
 */
function classifyAnomalySeverity({ type, occurrenceCount, totalDays, decisionDependsOnScopes }) {
  const affectedScopes = ANOMALY_AFFECTED_SCOPES[type] || ['UNKNOWN'];
  const rate = totalDays > 0 ? occurrenceCount / totalDays : 0;
  const overlapsDecision = decisionDependsOnScopes ? affectedScopes.some((s) => decisionDependsOnScopes.includes(s)) : true;

  if (type === 'TEST_TRANSACTION') return { severity: 'NORMAL', affected_scopes: affectedScopes, overlaps_decision: overlapsDecision, reason: 'transação de teste conhecida, esperada e já excluída da receita — nunca uma anomalia real.' };

  if (type === 'DUPLICATE_SUSPECTED') {
    // toca FINANCIAL_TRUTH diretamente — mesma severidade de trackingAssessment.BLOCKING_CODES
    return { severity: overlapsDecision ? 'CAPITAL_BLOCKING' : 'CRITICAL', affected_scopes: affectedScopes, overlaps_decision: overlapsDecision, reason: 'transaction_id duplicado ameaça a integridade da própria fonte financeira — sempre grave, independente da decisão específica.' };
  }

  if (!overlapsDecision) {
    return { severity: rate > 0 ? 'WARNING' : 'NORMAL', affected_scopes: affectedScopes, overlaps_decision: false, reason: `escopo afetado (${affectedScopes.join(', ')}) não sobrepõe a dependência da decisão avaliada — ANOMALY_SCOPE != GLOBAL_BLOCK (item 8), nunca escalado além de WARNING.` };
  }

  if (rate >= HIGH_RATE_THRESHOLD) return { severity: 'CRITICAL', affected_scopes: affectedScopes, overlaps_decision: true, reason: `ocorre em ${(rate * 100).toFixed(0)}% dos dias avaliados (>=${HIGH_RATE_THRESHOLD * 100}%) — padrão sistêmico, não um evento isolado, e sobrepõe a dependência da decisão.` };
  if (rate > 0) return { severity: 'WARNING', affected_scopes: affectedScopes, overlaps_decision: true, reason: `ocorre em ${(rate * 100).toFixed(0)}% dos dias avaliados — presente mas não sistêmico; sobrepõe a dependência da decisão, reduz confiança sem bloquear sozinho.` };
  return { severity: 'NORMAL', affected_scopes: affectedScopes, overlaps_decision: true, reason: 'nenhuma ocorrência real no período avaliado.' };
}

/**
 * buildAnomalyFindings() — agrega achados reais a partir de reconciliation.js (nunca recalcula
 * divergência do zero) + contextualiza severidade por decisionDependsOnScopes (item 8: quando
 * omitido, assume que a decisão depende de tudo — modo auditoria geral).
 */
function buildAnomalyFindings({ reconciliation, decisionDependsOnScopes } = {}) {
  const totalDays = reconciliation.days_evaluated || 0;
  const countsByAnomalyType = {};
  for (const day of reconciliation.per_day || []) {
    for (const div of day.divergences) {
      const anomalyType = DIVERGENCE_TO_ANOMALY_TYPE[div.type];
      if (!anomalyType) continue; // MATCHED/REFUNDED/CANCELLED não são anomalias de reconciliação (tratados em outro lugar)
      countsByAnomalyType[anomalyType] = (countsByAnomalyType[anomalyType] || 0) + 1;
    }
  }

  const findings = Object.entries(countsByAnomalyType).map(([type, count]) => {
    const classification = classifyAnomalySeverity({ type, occurrenceCount: count, totalDays, decisionDependsOnScopes });
    return { type, occurrence_count: count, total_days_evaluated: totalDays, ...classification };
  });

  return { findings: findings.sort((a, b) => ANOMALY_SEVERITIES.indexOf(b.severity) - ANOMALY_SEVERITIES.indexOf(a.severity)), total_days_evaluated: totalDays };
}

module.exports = { ANOMALY_TYPES, ANOMALY_SEVERITIES, ANOMALY_AFFECTED_SCOPES, classifyAnomalySeverity, buildAnomalyFindings, ANOMALY_SEVERITY_IS_POLICY_HEURISTIC_NOTE };
