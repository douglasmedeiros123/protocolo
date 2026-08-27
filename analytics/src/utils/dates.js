'use strict';

// Datas de negócio são tratadas em BRT (America/Sao_Paulo, UTC-3, sem horário de verão
// atualmente). Isso importa porque Meta reporta insights no fuso da conta (BRT), e Hotmart
// reporta order_date em UTC — sem essa normalização, cruzar os dois produz dias errados
// (já aconteceu nesta sessão, manualmente, antes de existir este módulo).

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** Converte um timestamp (ISO string, epoch ms, ou epoch ms como string) para 'YYYY-MM-DD' em BRT. */
function toBRTDateStr(input) {
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (Number.isNaN(ms)) throw new Error(`toBRTDateStr: timestamp inválido: ${input}`);
  const brt = new Date(ms - BRT_OFFSET_MS);
  return brt.toISOString().slice(0, 10);
}

/** Início e fim (epoch ms, UTC) do dia BRT informado — para consultar APIs que usam epoch ms (Hotmart). */
function brtDayBounds(dateStr) {
  if (!isValidDateStr(dateStr)) throw new Error(`brtDayBounds: data inválida: ${dateStr}`);
  const startUTC = Date.parse(`${dateStr}T00:00:00Z`) + BRT_OFFSET_MS;
  const endUTC = startUTC + 24 * 60 * 60 * 1000 - 1;
  return { startMs: startUTC, endMs: endUTC };
}

function todayBRT() {
  return toBRTDateStr(Date.now());
}

/** Lista de strings 'YYYY-MM-DD' de `from` até `to`, inclusive, em ordem crescente. */
function dateRange(from, to) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new Error('dateRange: datas inválidas');
  const out = [];
  let cursor = Date.parse(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  if (cursor > end) throw new Error(`dateRange: from (${from}) é depois de to (${to})`);
  while (cursor <= end) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

module.exports = { isValidDateStr, toBRTDateStr, brtDayBounds, todayBRT, dateRange, daysBetween, BRT_OFFSET_MS };
