'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// PERSISTÊNCIA (item 4/85) — analytics/data/planner/{plans,viability,evidence-gaps,roadmap,
// scenarios}.json. Mesma convenção de idempotência do resto do projeto (created_at preservado,
// updated_at sempre atualizado, canonicalize antes de escrever).
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'planner');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadPlans(dir = DEFAULT_DIR) { return readJson(filePath('plans', dir)) || []; }
function loadViability(dir = DEFAULT_DIR) { return readJson(filePath('viability', dir)) || null; }
function loadEvidenceGaps(dir = DEFAULT_DIR) { return readJson(filePath('evidence-gaps', dir)) || []; }
function loadRoadmap(dir = DEFAULT_DIR) { return readJson(filePath('roadmap', dir)) || null; }
function loadScenarios(dir = DEFAULT_DIR) { return readJson(filePath('scenarios', dir)) || null; }

function savePlans(plans, dir = DEFAULT_DIR) {
  const existing = new Map(loadPlans(dir).map((p) => [p.plan_id, p]));
  const withTimestamps = plans.map((p) => {
    const prior = existing.get(p.plan_id);
    return { ...p, created_at: prior ? prior.created_at : p.created_at, updated_at: new Date().toISOString() };
  });
  const sorted = [...withTimestamps].sort((a, b) => a.plan_id.localeCompare(b.plan_id));
  writeJson(filePath('plans', dir), canonicalize(sorted));
  return sorted;
}

function saveViability(viability, dir = DEFAULT_DIR) {
  writeJson(filePath('viability', dir), canonicalize(viability));
  return viability;
}

function saveEvidenceGaps(gaps, dir = DEFAULT_DIR) {
  const sorted = [...gaps].sort((a, b) => a.evidence_gap_id.localeCompare(b.evidence_gap_id));
  writeJson(filePath('evidence-gaps', dir), canonicalize(sorted));
  return sorted;
}

function saveRoadmap(roadmap, dir = DEFAULT_DIR) {
  writeJson(filePath('roadmap', dir), canonicalize(roadmap));
  return roadmap;
}

function saveScenarios(scenarios, dir = DEFAULT_DIR) {
  writeJson(filePath('scenarios', dir), canonicalize(scenarios));
  return scenarios;
}

module.exports = {
  loadPlans, loadViability, loadEvidenceGaps, loadRoadmap, loadScenarios,
  savePlans, saveViability, saveEvidenceGaps, saveRoadmap, saveScenarios, DEFAULT_DIR,
};
