'use strict';

const fs = require('fs');
const path = require('path');
const { writeJson, readJson } = require('../utils/fs');
const { canonicalize } = require('../utils/canonical');

// Decision Engine NÃO é Learning Engine (PASSO 7, item 18): aqui só guardamos O QUE foi
// recomendado, QUANDO, com QUAIS dados, POR QUÊ, confidence e expected value — pra permitir
// futuramente comparar DECISÃO vs RESULTADO REAL. Nenhuma agregação de aprendizado acontece
// aqui (isso é o Learning Engine, um sistema à parte).
const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'decisions');

function filePath(decisionId, dir = DEFAULT_DIR) {
  return path.join(dir, `${decisionId}.json`);
}

function loadDecision(decisionId, dir = DEFAULT_DIR) {
  return readJson(filePath(decisionId, dir));
}

function listDecisionIds(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

function loadAllDecisions(dir = DEFAULT_DIR) {
  return listDecisionIds(dir).map((id) => loadDecision(id, dir));
}

/**
 * Salva a decisão — IDEMPOTENTE por decision_id (derivado da fingerprint dos inputs, ver
 * fingerprint.js): mesmo estado de entrada -> mesmo decision_id -> mesmo arquivo, nunca dois
 * arquivos diferentes pro mesmo estado. Preserva created_at se o arquivo já existir (mesma
 * convenção do Learning Engine), updated_at sempre reflete a última vez que foi recalculada.
 */
function saveDecision(decision, dir = DEFAULT_DIR) {
  const existing = loadDecision(decision.decision_id, dir);
  const final = canonicalize({ ...decision, created_at: existing ? existing.created_at : decision.created_at, updated_at: new Date().toISOString() });
  writeJson(filePath(decision.decision_id, dir), final);
  return final;
}

module.exports = { loadDecision, listDecisionIds, loadAllDecisions, saveDecision, DEFAULT_DIR };
