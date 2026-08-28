'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// PERSISTÊNCIA (PASSO 9, item 35) — analytics/data/cro/{landing-pages,analysis,diagnostics,
// candidates}.json. Mesma convenção de idempotência do resto do projeto: ordena por chave
// estável + canonicaliza antes de escrever, preserva created_at entre rebuilds.
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'cro');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadLandingPages(dir = DEFAULT_DIR) { return readJson(filePath('landing-pages', dir)) || []; }
function loadAnalysis(dir = DEFAULT_DIR) { return readJson(filePath('analysis', dir)) || null; }
function loadDiagnostics(dir = DEFAULT_DIR) { return readJson(filePath('diagnostics', dir)) || []; }
function loadCandidates(dir = DEFAULT_DIR) { return readJson(filePath('candidates', dir)) || []; }

function saveLandingPages(landingPages, dir = DEFAULT_DIR) {
  const existing = new Map(loadLandingPages(dir).map((lp) => [lp.landing_page_id, lp]));
  const withTimestamps = landingPages.map((lp) => {
    const prior = existing.get(lp.landing_page_id);
    return { ...lp, created_at: prior ? prior.created_at : lp.created_at, updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.landing_page_id.localeCompare(b.landing_page_id));
  writeJson(filePath('landing-pages', dir), canonicalize(sorted));
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

module.exports = {
  loadLandingPages, loadAnalysis, loadDiagnostics, loadCandidates,
  saveLandingPages, saveAnalysis, saveDiagnostics, saveCandidates, DEFAULT_DIR,
};
