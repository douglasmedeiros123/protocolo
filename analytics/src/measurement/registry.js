'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// item 39 — persistência: analytics/data/measurement/{...}.json. Mesma convenção de
// idempotência do resto do projeto.
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'measurement');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadAnalysis(dir = DEFAULT_DIR) { return readJson(filePath('analysis', dir)) || null; }
function loadSourceOfTruth(dir = DEFAULT_DIR) { return readJson(filePath('source-of-truth', dir)) || null; }
function loadMeasurementScopes(dir = DEFAULT_DIR) { return readJson(filePath('measurement-scopes', dir)) || null; }
function loadEventTaxonomy(dir = DEFAULT_DIR) { return readJson(filePath('event-taxonomy', dir)) || null; }
function loadIdentifierSpine(dir = DEFAULT_DIR) { return readJson(filePath('identifier-spine', dir)) || null; }
function loadReconciliation(dir = DEFAULT_DIR) { return readJson(filePath('reconciliation', dir)) || null; }
function loadMeasurementDebt(dir = DEFAULT_DIR) { return readJson(filePath('measurement-debt', dir)) || []; }
function loadTrackingContracts(dir = DEFAULT_DIR) { return readJson(filePath('tracking-contracts', dir)) || []; }
function loadCapitalGates(dir = DEFAULT_DIR) { return readJson(filePath('capital-gates', dir)) || []; }

function saveAnalysis(analysis, dir = DEFAULT_DIR) { writeJson(filePath('analysis', dir), canonicalize(analysis)); return analysis; }
function saveSourceOfTruth(data, dir = DEFAULT_DIR) { writeJson(filePath('source-of-truth', dir), canonicalize(data)); return data; }
function saveMeasurementScopes(data, dir = DEFAULT_DIR) { writeJson(filePath('measurement-scopes', dir), canonicalize(data)); return data; }
function saveEventTaxonomy(data, dir = DEFAULT_DIR) { writeJson(filePath('event-taxonomy', dir), canonicalize(data)); return data; }
function saveIdentifierSpine(data, dir = DEFAULT_DIR) { writeJson(filePath('identifier-spine', dir), canonicalize(data)); return data; }
function saveReconciliation(data, dir = DEFAULT_DIR) { writeJson(filePath('reconciliation', dir), canonicalize(data)); return data; }

function saveMeasurementDebt(items, dir = DEFAULT_DIR) {
  const sorted = [...items].sort((a, b) => a.debt_id.localeCompare(b.debt_id));
  writeJson(filePath('measurement-debt', dir), canonicalize(sorted));
  return sorted;
}

function saveTrackingContracts(contracts, dir = DEFAULT_DIR) {
  const existing = new Map(loadTrackingContracts(dir).map((c) => [c.contract_id, c]));
  const withTimestamps = contracts.map((c) => {
    const prior = existing.get(c.contract_id);
    return { ...c, created_at: prior ? prior.created_at : new Date().toISOString(), updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.contract_id.localeCompare(b.contract_id));
  writeJson(filePath('tracking-contracts', dir), canonicalize(sorted));
  return sorted;
}

function saveCapitalGates(gates, dir = DEFAULT_DIR) {
  const sorted = [...gates].sort((a, b) => a.subject_id.localeCompare(b.subject_id));
  writeJson(filePath('capital-gates', dir), canonicalize(sorted));
  return sorted;
}

module.exports = {
  DEFAULT_DIR,
  loadAnalysis, loadSourceOfTruth, loadMeasurementScopes, loadEventTaxonomy, loadIdentifierSpine,
  loadReconciliation, loadMeasurementDebt, loadTrackingContracts, loadCapitalGates,
  saveAnalysis, saveSourceOfTruth, saveMeasurementScopes, saveEventTaxonomy, saveIdentifierSpine,
  saveReconciliation, saveMeasurementDebt, saveTrackingContracts, saveCapitalGates,
};
