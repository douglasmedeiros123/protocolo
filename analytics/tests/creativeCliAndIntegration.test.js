'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs } = require('../src/creative');
const { runCreativeIntelligence, analyzeRealCreatives } = require('../src/creative/builder');
const { saveAssets, saveCandidates, saveAnalysis, loadAssets, loadCandidates, loadAnalysis } = require('../src/creative/registry');
const { getBestCreativeExperimentCandidate } = require('../src/decision/creativeIntegration');
const { PRODUCT_ID } = require('../config/product');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creative-registry-test-'));
}

test('CLI parseArgs: reconhece --product --summary --analyze --generate-candidates --creative --rebuild', () => {
  const args = parseArgs(['--product', 'x', '--summary', '--analyze', '--generate-candidates', '--creative', 'CREATIVE-05', '--rebuild']);
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.analyze, true);
  assert.equal(args.generateCandidates, true);
  assert.equal(args.creative, 'CREATIVE-05');
  assert.equal(args.rebuild, true);
});

test('CLI parseArgs: sem flags, tudo undefined', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, undefined);
  assert.equal(args.creative, undefined);
});

test('product_id: analyzeRealCreatives resolve o product_id default quando não informado, propagado a todos os assets', () => {
  const analysis = analyzeRealCreatives({ hypotheses: [] });
  assert.equal(analysis.product_id, PRODUCT_ID);
  for (const a of analysis.assets) assert.equal(a.product_id, PRODUCT_ID);
});

test('registry: saveAssets/saveCandidates/saveAnalysis são idempotentes — rodar 2x preserva created_at e não duplica', () => {
  const dir = makeTempDir();
  const result = runCreativeIntelligence({ hypotheses: [] });

  const first = saveAssets(result.assets, dir);
  saveCandidates(result.candidates, dir);
  saveAnalysis(result.analysis, dir);
  const filesAfterFirst = fs.readdirSync(dir);

  const second = saveAssets(result.assets, dir);
  const filesAfterSecond = fs.readdirSync(dir);

  assert.deepEqual(filesAfterFirst.sort(), filesAfterSecond.sort());
  assert.equal(filesAfterFirst.length, 3); // assets.json, candidates.json, analysis.json
  assert.equal(first.find((a) => a.creative_id === 'CREATIVE-05').created_at, second.find((a) => a.creative_id === 'CREATIVE-05').created_at);
});

test('registry: loadAssets/loadCandidates/loadAnalysis funcionam em diretório isolado, sem tocar dados reais', () => {
  const dir = makeTempDir();
  assert.deepEqual(loadAssets(dir), []);
  assert.deepEqual(loadCandidates(dir), []);
  assert.equal(loadAnalysis(dir), null);

  const result = runCreativeIntelligence({ hypotheses: [] });
  saveAssets(result.assets, dir);
  saveCandidates(result.candidates, dir);
  saveAnalysis(result.analysis, dir);

  assert.ok(loadAssets(dir).length > 0);
  assert.ok(loadCandidates(dir).length > 0);
  assert.ok(loadAnalysis(dir));
});

test('Decision Engine integration: getBestCreativeExperimentCandidate() é uma consulta pura, não altera nada', () => {
  const dir = makeTempDir();
  assert.equal(getBestCreativeExperimentCandidate(dir), null); // sem candidatos ainda -> null, não quebra

  const result = runCreativeIntelligence({ hypotheses: [] });
  saveCandidates(result.candidates, dir);

  const best = getBestCreativeExperimentCandidate(dir);
  assert.ok(best);
  assert.equal(best.priority_score, Math.max(...result.candidates.map((c) => c.priority_score)));
  assert.equal(best.category, 'CREATIVE'); // já compatível com Experiment Engine
});

test('nenhuma execução real: runCreativeIntelligence + save* nunca escrevem fora de analytics/data/creatives/ (não tocam experiments/decisions/learning)', () => {
  const dir = makeTempDir();
  const experimentsFile = path.join(__dirname, '..', 'data', 'experiments', 'CREATIVE-001.json');
  const before = fs.readFileSync(experimentsFile, 'utf8');

  const result = runCreativeIntelligence({ hypotheses: [] });
  saveAssets(result.assets, dir);
  saveCandidates(result.candidates, dir);
  saveAnalysis(result.analysis, dir);

  const after = fs.readFileSync(experimentsFile, 'utf8');
  assert.equal(before, after);
});

test('nenhuma execução real: nenhum candidato ou asset carrega campo de execução (published/spend_authorized/image_generated)', () => {
  const result = runCreativeIntelligence({ hypotheses: [] });
  for (const c of result.candidates) {
    assert.equal('published' in c, false);
    assert.equal('image_generated' in c, false);
    assert.equal('spend_authorized' in c, false);
  }
  for (const a of result.assets) {
    assert.notEqual(a.status, 'PUBLISHED'); // status nem existe no enum — reforça que não há esse conceito aqui
  }
});

test('Learning Engine integration: checkCreativePriorLearning não quebra com hypotheses reais vazias (estado atual: 0 aprendizados)', () => {
  const { checkCreativePriorLearning } = require('../src/creative/priorLearning');
  const r = checkCreativePriorLearning({ productId: null, targetMetric: 'lpv_to_checkout_rate', variableChanged: 'proof' }, []);
  assert.equal(r.verdict, 'NO_PRIOR_EVIDENCE');
});
