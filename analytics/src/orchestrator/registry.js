'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// PASSO 15 — analytics/data/orchestrator/. Protótipo file-based, mesma convenção do resto do
// projeto — item 21 já documenta que isso NUNCA é alegado como imutabilidade transacional real.
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'orchestrator');

function filePath(name, dir = DEFAULT_DIR) { return path.join(dir, `${name}.json`); }

function loadLedger(dir = DEFAULT_DIR) { return readJson(filePath('shadow-decision-ledger', dir)) || []; }
function loadCounterfactualLog(dir = DEFAULT_DIR) { return readJson(filePath('counterfactual-log', dir)) || []; }

function appendToLedgerFile(entries, dir = DEFAULT_DIR) {
  const existing = loadLedger(dir);
  const merged = [...existing, ...entries];
  writeJson(filePath('shadow-decision-ledger', dir), canonicalize(merged));
  return merged;
}

function appendToCounterfactualLogFile(entries, dir = DEFAULT_DIR) {
  const existing = loadCounterfactualLog(dir);
  const merged = [...existing, ...entries];
  writeJson(filePath('counterfactual-log', dir), canonicalize(merged));
  return merged;
}

module.exports = { DEFAULT_DIR, loadLedger, loadCounterfactualLog, appendToLedgerFile, appendToCounterfactualLogFile };
