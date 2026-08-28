'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'creatives');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadAssets(dir = DEFAULT_DIR) { return readJson(filePath('assets', dir)) || []; }
function loadCandidates(dir = DEFAULT_DIR) { return readJson(filePath('candidates', dir)) || []; }
function loadAnalysis(dir = DEFAULT_DIR) { return readJson(filePath('analysis', dir)) || null; }

// Mesma convenção de idempotência do Learning/Decision Engine: ordena por chave estável e
// canonicaliza antes de escrever, pra dois rebuilds do MESMO estado produzirem bytes idênticos.
function saveAssets(assets, dir = DEFAULT_DIR) {
  const existing = new Map(loadAssets(dir).map((a) => [a.creative_id, a]));
  const withTimestamps = assets.map((a) => {
    const prior = existing.get(a.creative_id);
    return { ...a, created_at: prior ? prior.created_at : a.created_at, updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.creative_id.localeCompare(b.creative_id));
  writeJson(filePath('assets', dir), canonicalize(sorted));
  return sorted;
}

function saveCandidates(candidates, dir = DEFAULT_DIR) {
  const sorted = [...candidates].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  writeJson(filePath('candidates', dir), canonicalize(sorted));
  return sorted;
}

function saveAnalysis(analysis, dir = DEFAULT_DIR) {
  writeJson(filePath('analysis', dir), canonicalize(analysis));
  return analysis;
}

module.exports = { loadAssets, loadCandidates, loadAnalysis, saveAssets, saveCandidates, saveAnalysis, DEFAULT_DIR };
