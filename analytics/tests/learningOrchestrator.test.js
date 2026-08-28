'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { saveExperiment } = require('../src/experiments/registry');
const { rebuild, summary, showExperiment, showHypothesis, parseArgs } = require('../src/learning');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CREATIVE-100',
    status: 'DRAFT',
    category: 'CREATIVE',
    target_metric: 'cpa_financeiro',
    hypothesis: { statement: 'concentrar orçamento nos criativos com sinal reduz CPA' },
    baseline: { cpa_financeiro: 100 },
    actual_result: null,
    minimum_evidence: { lpv: 30, checkouts: 5, compras: null, spend: null, duration_days: 7 },
    conclusion: null,
    learning: null,
    attacks_path: 'CPA',
    ...overrides,
  };
}

function makeTempDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-engine-test-'));
  return { experimentsDir: path.join(base, 'experiments'), learningDir: path.join(base, 'learning') };
}

test('orchestrator: experimentos DRAFT não geram learning nenhum — rebuild fica em zero', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({ experiment_id: 'CREATIVE-001', status: 'DRAFT' }), dirs.experimentsDir);
  saveExperiment(makeExperiment({ experiment_id: 'CRO-001', status: 'DRAFT', category: 'CRO' }), dirs.experimentsDir);
  const result = rebuild({}, dirs);
  assert.equal(result.closed_experiments, 0);
  assert.equal(result.learnings.length, 0);
  assert.equal(result.patterns.length, 0);
  assert.deepEqual(result.open_or_draft_ids.sort(), ['CREATIVE-001', 'CRO-001']);
});

test('orchestrator: rebuild é idempotente — rodar duas vezes NÃO duplica learnings', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-001', status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, tracking_flags: [] },
    learning: { summary: 'funcionou', what_not_to_repeat: null, next_test_suggestion: null },
  }), dirs.experimentsDir);
  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-002', status: 'FAILURE',
    actual_result: { cpa_financeiro: 130 },
    learning: { summary: 'não funcionou', what_not_to_repeat: 'não repetir', next_test_suggestion: null },
  }), dirs.experimentsDir);

  const first = rebuild({}, dirs);
  const second = rebuild({}, dirs);
  const third = rebuild({}, dirs);

  assert.equal(first.learnings.length, 2);
  assert.equal(second.learnings.length, 2);
  assert.equal(third.learnings.length, 2);
  assert.deepEqual(
    second.learnings.map((l) => l.learning_id).sort(),
    first.learnings.map((l) => l.learning_id).sort()
  );
});

test('orchestrator: rebuild preserva created_at original entre execuções (não reescreve a data de criação a cada rebuild)', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-001', status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, tracking_flags: [] },
    learning: { summary: 'funcionou', what_not_to_repeat: null, next_test_suggestion: null },
  }), dirs.experimentsDir);

  const first = rebuild({}, dirs);
  const createdAt = first.learnings[0].created_at;
  const second = rebuild({}, dirs);
  assert.equal(second.learnings[0].created_at, createdAt);
});

test('orchestrator: adicionar um NOVO experimento fechado não duplica os learnings já existentes, só soma o novo', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-001', status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, tracking_flags: [] },
    learning: { summary: 'funcionou', what_not_to_repeat: null, next_test_suggestion: null },
  }), dirs.experimentsDir);
  rebuild({}, dirs);

  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-002', status: 'SUCCESS',
    actual_result: { cpa_financeiro: 75, tracking_flags: [] },
    learning: { summary: 'funcionou de novo', what_not_to_repeat: null, next_test_suggestion: null },
  }), dirs.experimentsDir);
  const second = rebuild({}, dirs);
  assert.equal(second.learnings.length, 2);
});

test('orchestrator: --experiment mostra o learning de um experimento fechado e o motivo de ausência de um DRAFT', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({
    experiment_id: 'CREATIVE-001', status: 'SUCCESS',
    actual_result: { cpa_financeiro: 80, tracking_flags: [] },
    learning: { summary: 'funcionou', what_not_to_repeat: null, next_test_suggestion: null },
  }), dirs.experimentsDir);
  saveExperiment(makeExperiment({ experiment_id: 'CRO-001', status: 'DRAFT', category: 'CRO' }), dirs.experimentsDir);
  rebuild({}, dirs);

  const withLearning = showExperiment('CREATIVE-001', dirs);
  assert.equal(withLearning.has_learning, true);

  const draft = showExperiment('CRO-001', dirs);
  assert.equal(draft.has_learning, false);
  assert.match(draft.reason, /DRAFT/);

  const missing = showExperiment('NAO-EXISTE-999', dirs);
  assert.equal(missing.has_learning, false);
  assert.match(missing.reason, /não encontrado/);
});

test('orchestrator: --summary reflete exatamente o estado real (nenhum aprendizado histórico inventado)', () => {
  const dirs = makeTempDirs();
  saveExperiment(makeExperiment({ experiment_id: 'CREATIVE-001', status: 'DRAFT' }), dirs.experimentsDir);
  rebuild({}, dirs);
  const s = summary(dirs);
  assert.equal(s.completed_experiments, 0);
  assert.equal(s.learnings, 0);
  assert.equal(s.patterns_detected, 0);
  assert.deepEqual(s.strong, []);
  assert.deepEqual(s.invalidated, []);
  assert.deepEqual(s.contradicted, []);
});

test('orchestrator: --hypothesis retorna found:false pra chave nunca testada', () => {
  const dirs = makeTempDirs();
  const r = showHypothesis('categoria_inexistente|metrica_x|unspecified|unspecified|unspecified|unspecified', dirs);
  assert.equal(r.found, false);
});

test('CLI parseArgs: reconhece --rebuild --experiment --summary --hypothesis', () => {
  const args = parseArgs(['--rebuild', '--experiment', 'CREATIVE-001', '--summary', '--hypothesis', 'foo|bar|unspecified|unspecified|unspecified|unspecified']);
  assert.equal(args.rebuild, true);
  assert.equal(args.experiment, 'CREATIVE-001');
  assert.equal(args.summary, true);
  assert.equal(args.hypothesis, 'foo|bar|unspecified|unspecified|unspecified|unspecified');
});

test('CLI parseArgs: sem flags nenhuma, todos ficam falsy', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, false);
  assert.equal(args.experiment, undefined);
  assert.equal(args.summary, false);
  assert.equal(args.hypothesis, undefined);
});
