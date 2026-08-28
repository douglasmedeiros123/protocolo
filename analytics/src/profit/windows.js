'use strict';

const { dateRange, isValidDateStr } = require('../utils/dates');

function subtractDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}

function firstOfMonth(dateStr) {
  return dateStr.slice(0, 7) + '-01';
}

/**
 * Resolve as janelas padrão (dia, 7d, 14d, 30d, mês atual) terminando em `referenceDate`
 * (inclusive). Cada janela é { label, from, to, dates[] } — só a LISTA de datas, a leitura de
 * dado real acontece em aggregate.js.
 */
function standardWindows(referenceDate) {
  if (!isValidDateStr(referenceDate)) throw new Error(`referenceDate inválida: ${referenceDate}`);
  const windows = {
    day: { label: 'Dia', from: referenceDate, to: referenceDate },
    last_7d: { label: 'Últimos 7 dias', from: subtractDays(referenceDate, 6), to: referenceDate },
    last_14d: { label: 'Últimos 14 dias', from: subtractDays(referenceDate, 13), to: referenceDate },
    last_30d: { label: 'Últimos 30 dias', from: subtractDays(referenceDate, 29), to: referenceDate },
    current_month: { label: 'Mês atual', from: firstOfMonth(referenceDate), to: referenceDate },
  };
  for (const w of Object.values(windows)) w.dates = dateRange(w.from, w.to);
  return windows;
}

function customWindow(from, to) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new Error(`período customizado inválido: ${from} .. ${to}`);
  const w = { label: 'Período customizado', from, to };
  w.dates = dateRange(from, to);
  return w;
}

module.exports = { standardWindows, customWindow, subtractDays, firstOfMonth };
