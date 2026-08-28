'use strict';

// TRACKING (PASSO 7, item 15) — distingue tracking problem que IMPEDE decisão de tracking
// problem que só REDUZ confiança, usando o catálogo já existente de flags críticas (ver
// analytics/src/metrics/dataQuality.js):
//
//   BLOCKING  : corrompem a própria fonte de verdade financeira (Hotmart) — a decisão NÃO pode
//               confiar no número, então tracking vira a prioridade #1 (FIX_TRACKING).
//     MISSING_DATA                   : só é 'critical' quando é a Hotmart que falhou (a
//                                       variante meta/github é 'info', nunca aparece aqui).
//     NEGATIVE_OR_IMPOSSIBLE_REVENUE : receita negativa/impossível — dado corrompido.
//     DUPLICATE_TRANSACTION          : receita Hotmart contada em duplicidade.
//
//   DEGRADING : Hotmart (fonte de verdade) continua íntegra — só reduz confiança, nunca bloqueia.
//     META_PURCHASE_WITHOUT_HOTMART_SALE : ruído do lado Meta (pixel/Apple Pay fantasma); a
//                                           receita real (Hotmart) não é afetada — ver PASSO 7
//                                           item 15 e o histórico já documentado desse bug.
const BLOCKING_CODES = ['MISSING_DATA', 'NEGATIVE_OR_IMPOSSIBLE_REVENUE', 'DUPLICATE_TRANSACTION'];
const DEGRADING_CODES = ['META_PURCHASE_WITHOUT_HOTMART_SALE'];

// Cada ocorrência de flag degradante reduz a confiança em 10 pontos, até um piso de 40 — nunca
// zera sozinha, porque ela não corrompe a fonte de verdade, só indica ruído já conhecido.
const DEGRADING_PENALTY_PER_OCCURRENCE = 10;
const DEGRADING_PENALTY_FLOOR = 40;

/**
 * @param {Array<{date, codes: string[]}>} criticalFlagsByDay  vem de profit/aggregate.js
 */
function assessTracking(criticalFlagsByDay = []) {
  const blocking_occurrences = [];
  const degrading_occurrences = [];
  const unclassified_occurrences = [];

  for (const { date, codes } of criticalFlagsByDay) {
    for (const code of codes) {
      if (BLOCKING_CODES.includes(code)) blocking_occurrences.push({ date, code });
      else if (DEGRADING_CODES.includes(code)) degrading_occurrences.push({ date, code });
      else unclassified_occurrences.push({ date, code }); // código crítico novo, ainda não catalogado — tratado como degradante por padrão (nunca ignorado, nunca bloqueante por suposição)
    }
  }

  const is_blocking = blocking_occurrences.length > 0;
  const degradingCount = degrading_occurrences.length + unclassified_occurrences.length;
  const confidence_score = is_blocking
    ? 0
    : Math.max(DEGRADING_PENALTY_FLOOR, 100 - degradingCount * DEGRADING_PENALTY_PER_OCCURRENCE);

  return {
    is_blocking,
    blocking_occurrences,
    degrading_occurrences,
    unclassified_occurrences,
    confidence_score,
    reason: is_blocking
      ? `${blocking_occurrences.length} ocorrência(s) de flag BLOQUEANTE (${[...new Set(blocking_occurrences.map((o) => o.code))].join(', ')}) — a fonte de verdade financeira (Hotmart) está comprometida no período.`
      : degradingCount > 0
        ? `${degradingCount} ocorrência(s) de flag degradante (${[...new Set([...degrading_occurrences, ...unclassified_occurrences].map((o) => o.code))].join(', ')}) — Hotmart continua íntegra, confiança reduzida.`
        : 'Nenhuma flag crítica de tracking no período.',
  };
}

module.exports = { assessTracking, BLOCKING_CODES, DEGRADING_CODES, DEGRADING_PENALTY_PER_OCCURRENCE, DEGRADING_PENALTY_FLOOR };
