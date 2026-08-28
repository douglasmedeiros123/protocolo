'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/fs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'profit');

/**
 * Lê o snapshot MAIS RECENTE/RELEVANTE do Profit Engine (PASSO 7, item 7) — nunca chama a API,
 * só lê o que já foi persistido em analytics/data/profit/. Se `referenceDate` for informado,
 * pega o arquivo daquela data se existir, senão o mais recente com data <= referenceDate (nunca
 * um arquivo FUTURO em relação à referência) — documentado no campo `is_stale`/`snapshot_date`
 * pra nunca esconder que o dado pode não ser de hoje.
 */
function findLatestSnapshotFile(referenceDate, dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
  if (files.length === 0) return null;
  if (!referenceDate) return files[files.length - 1];
  const eligible = files.filter((d) => d <= referenceDate);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

function loadLatestProfitSnapshot(referenceDate, dir = DEFAULT_DIR) {
  const snapshotDate = findLatestSnapshotFile(referenceDate, dir);
  if (!snapshotDate) {
    return { found: false, snapshot_date: null, is_stale: null, snapshot: null, reason: 'Nenhum snapshot do Profit Engine encontrado em analytics/data/profit/.' };
  }
  const snapshot = readJson(path.join(dir, `${snapshotDate}.json`));
  return {
    found: true,
    snapshot_date: snapshotDate,
    is_stale: referenceDate != null && snapshotDate !== referenceDate,
    snapshot,
    reason: referenceDate != null && snapshotDate !== referenceDate
      ? `Nenhum snapshot para ${referenceDate} — usando o mais recente disponível anterior/igual (${snapshotDate}).`
      : null,
  };
}

module.exports = { loadLatestProfitSnapshot, findLatestSnapshotFile, DEFAULT_DIR };
