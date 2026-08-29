'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// item 14A.21 — analytics/data/execution/{...}.json. Protótipo de persistência local (item
// 14A.18: NÃO introduzir Postgres agora) — mesma convenção de idempotência do resto do projeto.
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'execution');

function filePath(name, dir = DEFAULT_DIR) { return path.join(dir, `${name}.json`); }

function loadActions(dir = DEFAULT_DIR) { return readJson(filePath('actions', dir)) || []; }
function loadApprovals(dir = DEFAULT_DIR) { return readJson(filePath('approvals', dir)) || []; }
function loadExposureRegistry(dir = DEFAULT_DIR) { return readJson(filePath('exposure-registry', dir)) || []; }
function loadExecutionLog(dir = DEFAULT_DIR) { return readJson(filePath('execution-log', dir)) || []; }
function loadCircuitBreakerState(dir = DEFAULT_DIR) { return readJson(filePath('circuit-breaker-state', dir)) || { state: 'CLOSED', updated_at: null }; }

function saveActions(actions, dir = DEFAULT_DIR) {
  const existing = new Map(loadActions(dir).map((a) => [a.action_id, a]));
  const merged = actions.map((a) => ({ ...a, created_at: existing.has(a.action_id) ? existing.get(a.action_id).created_at : a.created_at }));
  const sorted = [...merged].sort((a, b) => a.action_id.localeCompare(b.action_id));
  writeJson(filePath('actions', dir), canonicalize(sorted));
  return sorted;
}

function saveApprovals(approvals, dir = DEFAULT_DIR) {
  const sorted = [...approvals].sort((a, b) => a.approval_id.localeCompare(b.approval_id));
  writeJson(filePath('approvals', dir), canonicalize(sorted));
  return sorted;
}

// item 14A.17 — architecture_live_registry é APPEND-ONLY por design (nunca reescreve uma entrada
// já registrada — só adiciona novas, mesma disciplina immutable do execution log).
function appendToExposureRegistry(newEntries, dir = DEFAULT_DIR) {
  const existing = loadExposureRegistry(dir);
  const existingIds = new Set(existing.map((e) => e.entry_id));
  const toAdd = newEntries.filter((e) => !existingIds.has(e.entry_id));
  const merged = [...existing, ...toAdd].sort((a, b) => a.entry_id.localeCompare(b.entry_id));
  writeJson(filePath('exposure-registry', dir), canonicalize(merged));
  return merged;
}

function appendToExecutionLog(newEntries, dir = DEFAULT_DIR) {
  const existing = loadExecutionLog(dir);
  const merged = [...existing, ...newEntries];
  writeJson(filePath('execution-log', dir), canonicalize(merged));
  return merged;
}

function saveCircuitBreakerState(state, dir = DEFAULT_DIR) {
  const record = { ...state, updated_at: new Date().toISOString() };
  writeJson(filePath('circuit-breaker-state', dir), canonicalize(record));
  return record;
}

module.exports = {
  DEFAULT_DIR,
  loadActions, loadApprovals, loadExposureRegistry, loadExecutionLog, loadCircuitBreakerState,
  saveActions, saveApprovals, appendToExposureRegistry, appendToExecutionLog, saveCircuitBreakerState,
};
