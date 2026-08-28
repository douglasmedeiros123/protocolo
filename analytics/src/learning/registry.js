'use strict';

const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'learning');

function filePath(name, dir = DEFAULT_DIR) {
  return path.join(dir, `${name}.json`);
}

function loadLearnings(dir = DEFAULT_DIR) {
  return readJson(filePath('learnings', dir)) || [];
}
function loadPatterns(dir = DEFAULT_DIR) {
  return readJson(filePath('patterns', dir)) || [];
}
function loadHypotheses(dir = DEFAULT_DIR) {
  return readJson(filePath('hypotheses', dir)) || [];
}

// Ordena por chave estável (learning_id / pattern_id / hypothesis_key) antes de salvar — junto
// com canonicalize() nas chaves de cada objeto, garante que dois rebuilds do MESMO estado de
// experimentos produzam bytes idênticos (idempotência real, não só "mesmo conteúdo lógico").
function saveLearnings(learnings, dir = DEFAULT_DIR) {
  const sorted = [...learnings].sort((a, b) => a.learning_id.localeCompare(b.learning_id));
  writeJson(filePath('learnings', dir), canonicalize(sorted));
}
function savePatterns(patterns, dir = DEFAULT_DIR) {
  const sorted = [...patterns].sort((a, b) => a.pattern_id.localeCompare(b.pattern_id));
  writeJson(filePath('patterns', dir), canonicalize(sorted));
}
function saveHypotheses(hypotheses, dir = DEFAULT_DIR) {
  const sorted = [...hypotheses].sort((a, b) => a.product_hypothesis_key.localeCompare(b.product_hypothesis_key));
  writeJson(filePath('hypotheses', dir), canonicalize(sorted));
}

module.exports = { loadLearnings, loadPatterns, loadHypotheses, saveLearnings, savePatterns, saveHypotheses, DEFAULT_DIR };
