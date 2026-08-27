#!/usr/bin/env node
'use strict';

const { isValidDateStr, todayBRT } = require('./utils/dates');

/**
 * Resolve a data-alvo do job: usa `manualInput` se for uma string YYYY-MM-DD válida (formato E
 * calendário real — 2026-13-45 é rejeitado mesmo "parecendo" o formato certo); caso contrário
 * (input vazio/undefined), usa ontem em BRT. Lança erro para qualquer input não-vazio inválido —
 * nunca usa um input inválido "mesmo assim".
 */
function resolveTargetDate(manualInput) {
  const trimmed = (manualInput || '').trim();
  if (trimmed === '') {
    const y = new Date(Date.parse(todayBRT() + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    return y;
  }
  if (!isValidDateStr(trimmed)) {
    throw new Error(
      `Data informada inválida: "${trimmed}". Use o formato YYYY-MM-DD com uma data de calendário real.`
    );
  }
  return trimmed;
}

if (require.main === module) {
  try {
    const resolved = resolveTargetDate(process.argv[2]);
    process.stdout.write(resolved + '\n');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { resolveTargetDate };
