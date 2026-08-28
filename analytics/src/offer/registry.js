'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// PERSISTÊNCIA (PASSO 10, item 56) — analytics/data/offer/{offers,analysis,diagnostics,
// candidates,scenarios}.json. Mesma convenção de idempotência do resto do projeto.
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'offer');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadOffers(dir = DEFAULT_DIR) { return readJson(filePath('offers', dir)) || []; }
function loadAnalysis(dir = DEFAULT_DIR) { return readJson(filePath('analysis', dir)) || null; }
function loadDiagnostics(dir = DEFAULT_DIR) { return readJson(filePath('diagnostics', dir)) || []; }
function loadCandidates(dir = DEFAULT_DIR) { return readJson(filePath('candidates', dir)) || []; }
function loadScenarios(dir = DEFAULT_DIR) { return readJson(filePath('scenarios', dir)) || null; }

function saveOffers(offers, dir = DEFAULT_DIR) {
  const existing = new Map(loadOffers(dir).map((o) => [o.offer_id, o]));
  const withTimestamps = offers.map((o) => {
    const prior = existing.get(o.offer_id);
    return { ...o, created_at: prior ? prior.created_at : o.created_at, updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.offer_id.localeCompare(b.offer_id));
  writeJson(filePath('offers', dir), canonicalize(sorted));
  return sorted;
}

function saveAnalysis(analysis, dir = DEFAULT_DIR) {
  writeJson(filePath('analysis', dir), canonicalize(analysis));
  return analysis;
}

function saveDiagnostics(diagnostics, dir = DEFAULT_DIR) {
  const sorted = [...diagnostics].sort((a, b) => a.diagnostic_id.localeCompare(b.diagnostic_id));
  writeJson(filePath('diagnostics', dir), canonicalize(sorted));
  return sorted;
}

function saveCandidates(candidates, dir = DEFAULT_DIR) {
  const sorted = [...candidates].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  writeJson(filePath('candidates', dir), canonicalize(sorted));
  return sorted;
}

function saveScenarios(scenarios, dir = DEFAULT_DIR) {
  writeJson(filePath('scenarios', dir), canonicalize(scenarios));
  return scenarios;
}

module.exports = {
  loadOffers, loadAnalysis, loadDiagnostics, loadCandidates, loadScenarios,
  saveOffers, saveAnalysis, saveDiagnostics, saveCandidates, saveScenarios, DEFAULT_DIR,
};
