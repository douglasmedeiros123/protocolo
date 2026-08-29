'use strict';

// PASSO 13.1, items 9-10 — correção semântica central. O PASSO 13 original derivava o status de
// FINANCIAL_TRANSACTION_TRUTH do mesmo confidence_score de trackingAssessment.assessTracking(),
// que reduz nota por ocorrência de META_PURCHASE_WITHOUT_HOTMART_SALE (um código DEGRADING) — mas
// esse código descreve um problema de PLATFORM_ATTRIBUTION/CROSS_PLATFORM_RECONCILIATION (a Meta
// alegou uma compra que a Hotmart não confirma), NUNCA um problema da própria Hotmart. A pergunta
// certa (item 9) é: "os ghost purchases da Meta degradam a verdade financeira Hotmart, ou só a
// capacidade de reconciliar Meta com Hotmart?" — resposta derivada da evidência: só a segunda.
//
// Por isso, FINANCIAL_TRUTH_HEALTH usa SÓ os BLOCKING_CODES (que corrompem a própria Hotmart:
// MISSING_DATA-hotmart, NEGATIVE_OR_IMPOSSIBLE_REVENUE, DUPLICATE_TRANSACTION) — nunca os
// DEGRADING_CODES (META_PURCHASE_WITHOUT_HOTMART_SALE), que pertencem exclusivamente a
// PLATFORM_ATTRIBUTION_HEALTH. As duas saúdes são mantidas deliberadamente separadas (item 10) —
// uma divergência externa nunca contamina automaticamente a saúde da fonte financeira canônica.
const { BLOCKING_CODES } = require('../decision/trackingAssessment');

/**
 * buildFinancialTruthHealth() — só olha pra BLOCKING_CODES. RELIABLE com confidence HIGH
 * enquanto nenhuma ocorrência bloqueante existir no período — nunca reduzido por ruído do lado
 * Meta (isso vive em PLATFORM_ATTRIBUTION_HEALTH).
 */
function buildFinancialTruthHealth(criticalFlagsByDay = []) {
  const blockingOccurrences = [];
  for (const { date, codes } of criticalFlagsByDay) {
    for (const code of codes) {
      if (BLOCKING_CODES.includes(code)) blockingOccurrences.push({ date, code });
    }
  }
  const isBlocked = blockingOccurrences.length > 0;
  return {
    status: isBlocked ? 'BLOCKED' : 'RELIABLE',
    confidence: isBlocked ? 'NOT_ASSESSABLE' : 'HIGH',
    blocking_occurrences: blockingOccurrences,
    reason: isBlocked
      ? `${blockingOccurrences.length} ocorrência(s) de código que corrompe a própria Hotmart (${[...new Set(blockingOccurrences.map((o) => o.code))].join(', ')}) — a fonte financeira em si está comprometida.`
      : 'nenhuma ocorrência de código que corrompa a própria Hotmart no período — a fonte financeira canônica permanece íntegra, independente de qualquer ruído do lado Meta (item 9/10 — divergência externa nunca contamina a saúde da fonte financeira).',
  };
}

/**
 * buildPlatformAttributionHealth() — só olha pra DEGRADING_CODES + código não catalogado (mesma
 * disciplina "nunca ignorado, nunca bloqueante por suposição" de trackingAssessment.js), mas
 * SEPARADO da saúde financeira. É aqui, e só aqui, que ghost purchases (META_PURCHASE_WITHOUT_
 * HOTMART_SALE) reduzem confiança.
 */
const { DEGRADING_CODES, DEGRADING_PENALTY_PER_OCCURRENCE, DEGRADING_PENALTY_FLOOR } = require('../decision/trackingAssessment');

function buildPlatformAttributionHealth(criticalFlagsByDay = []) {
  const degradingOccurrences = [];
  const unclassifiedOccurrences = [];
  for (const { date, codes } of criticalFlagsByDay) {
    for (const code of codes) {
      if (BLOCKING_CODES.includes(code)) continue; // já coberto por financialTruthHealth — nunca contado duas vezes aqui
      if (DEGRADING_CODES.includes(code)) degradingOccurrences.push({ date, code });
      else unclassifiedOccurrences.push({ date, code });
    }
  }
  const degradingCount = degradingOccurrences.length + unclassifiedOccurrences.length;
  const confidenceScore = Math.max(DEGRADING_PENALTY_FLOOR, 100 - degradingCount * DEGRADING_PENALTY_PER_OCCURRENCE);
  return {
    status: degradingCount > 0 ? 'DEGRADED' : 'RELIABLE',
    confidence_score: degradingCount > 0 ? confidenceScore : 100,
    degrading_occurrences: degradingOccurrences,
    unclassified_occurrences: unclassifiedOccurrences,
    reason: degradingCount > 0
      ? `${degradingCount} ocorrência(s) de ruído do lado Meta (${[...new Set([...degradingOccurrences, ...unclassifiedOccurrences].map((o) => o.code))].join(', ')}) — a alegação de compra da plataforma diverge da Hotmart, mas a Hotmart em si continua íntegra (nunca afeta FINANCIAL_TRUTH_HEALTH).`
      : 'nenhuma divergência de atribuição de plataforma detectada no período.',
  };
}

module.exports = { buildFinancialTruthHealth, buildPlatformAttributionHealth };
