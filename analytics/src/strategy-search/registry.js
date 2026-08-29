'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// PERSISTÊNCIA (item 13-14/114) — analytics/data/strategy-search/{architectures,analysis,
// comparisons,recommendations,test-plans}.json. Mesma convenção de idempotência do resto do
// projeto (created_at preservado, updated_at atualizado, canonicalize antes de escrever).
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'strategy-search');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadArchitectures(dir = DEFAULT_DIR) { return readJson(filePath('architectures', dir)) || []; }
function loadAnalysis(dir = DEFAULT_DIR) { return readJson(filePath('analysis', dir)) || null; }
function loadComparisons(dir = DEFAULT_DIR) { return readJson(filePath('comparisons', dir)) || null; }
function loadRecommendations(dir = DEFAULT_DIR) { return readJson(filePath('recommendations', dir)) || []; }
function loadTestPlans(dir = DEFAULT_DIR) { return readJson(filePath('test-plans', dir)) || []; }

function saveArchitectures(architectures, dir = DEFAULT_DIR) {
  const existing = new Map(loadArchitectures(dir).map((a) => [a.architecture_id, a]));
  const withTimestamps = architectures.map((a) => {
    const prior = existing.get(a.architecture_id);
    return { ...a, created_at: prior ? prior.created_at : (a.created_at || new Date().toISOString()), updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.architecture_id.localeCompare(b.architecture_id));
  writeJson(filePath('architectures', dir), canonicalize(sorted));
  return sorted;
}

function saveAnalysis(analysis, dir = DEFAULT_DIR) {
  writeJson(filePath('analysis', dir), canonicalize(analysis));
  return analysis;
}

function saveComparisons(comparisons, dir = DEFAULT_DIR) {
  writeJson(filePath('comparisons', dir), canonicalize(comparisons));
  return comparisons;
}

function saveRecommendations(recommendations, dir = DEFAULT_DIR) {
  const existing = new Map(loadRecommendations(dir).map((r) => [r.recommendation_id, r]));
  const withTimestamps = recommendations.map((r) => {
    const prior = existing.get(r.recommendation_id);
    return { ...r, created_at: prior ? prior.created_at : (r.created_at || new Date().toISOString()), updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.recommendation_id.localeCompare(b.recommendation_id));
  writeJson(filePath('recommendations', dir), canonicalize(sorted));
  return sorted;
}

function saveTestPlans(testPlans, dir = DEFAULT_DIR) {
  const sorted = [...testPlans].sort((a, b) => a.test_id.localeCompare(b.test_id));
  writeJson(filePath('test-plans', dir), canonicalize(sorted));
  return sorted;
}

module.exports = {
  loadArchitectures, loadAnalysis, loadComparisons, loadRecommendations, loadTestPlans,
  saveArchitectures, saveAnalysis, saveComparisons, saveRecommendations, saveTestPlans, DEFAULT_DIR,
};
