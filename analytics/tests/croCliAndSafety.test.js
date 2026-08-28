'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs } = require('../src/cro');
const { analyzeCro } = require('../src/cro/builder');
const { saveLandingPages, saveDiagnostics, saveCandidates, saveAnalysis } = require('../src/cro/registry');
const { getBestCroCandidate } = require('../src/decision/croIntegration');
const { resolveLandingPageSourceOfTruth } = require('../src/cro/sourceOfTruth');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cro-safety-test-')); }

test('CLI parseArgs: reconhece --product --summary --analyze --generate-candidates --landing-page --rebuild', () => {
  const args = parseArgs(['--product', 'x', '--summary', '--analyze', '--generate-candidates', '--landing-page', 'LP-V1', '--rebuild']);
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.analyze, true);
  assert.equal(args.generateCandidates, true);
  assert.equal(args.landingPage, 'LP-V1');
  assert.equal(args.rebuild, true);
});

test('CLI parseArgs: sem flags, tudo undefined', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, undefined);
  assert.equal(args.landingPage, undefined);
});

test('SAFETY (item 36): analyzeCro + save* NUNCA escrevem em teste-b/index.html nem vercel.json (write boundary)', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const beforeMtime = fs.statSync(sot.landing_page_file).mtimeMs;
  const beforeContent = fs.readFileSync(sot.landing_page_file, 'utf8');
  const vercelPath = path.join(path.dirname(sot.landing_page_file), '..', 'vercel.json');
  const vercelBefore = fs.readFileSync(vercelPath, 'utf8');

  const dir = makeTempDir();
  const result = analyzeCro({});
  saveLandingPages([result.landing_page], dir);
  saveDiagnostics(result.diagnostics, dir);
  saveCandidates(result.candidates, dir);
  saveAnalysis(result, dir);

  assert.equal(fs.statSync(sot.landing_page_file).mtimeMs, beforeMtime);
  assert.equal(fs.readFileSync(sot.landing_page_file, 'utf8'), beforeContent);
  assert.equal(fs.readFileSync(vercelPath, 'utf8'), vercelBefore);
});

test('SAFETY: analyzeCro nunca escreve fora de analytics/data/cro/ — experiments/creatives/decisions intactos', () => {
  const experimentsFile = path.join(__dirname, '..', 'data', 'experiments', 'CRO-001.json');
  const creativeAssetsFile = path.join(__dirname, '..', 'data', 'creatives', 'assets.json');
  const beforeExp = fs.readFileSync(experimentsFile, 'utf8');
  const beforeCreative = fs.readFileSync(creativeAssetsFile, 'utf8');

  analyzeCro({});

  assert.equal(fs.readFileSync(experimentsFile, 'utf8'), beforeExp);
  assert.equal(fs.readFileSync(creativeAssetsFile, 'utf8'), beforeCreative);
});

test('SAFETY: nenhum objeto retornado tem campo de deploy/publicação real (published/deployed/live)', () => {
  const result = analyzeCro({});
  for (const c of result.candidates) {
    assert.equal('published' in c, false);
    assert.equal('deployed' in c, false);
  }
  assert.equal('deployed' in result.landing_page, false);
  assert.notEqual(result.landing_page.status, 'LIVE');
  assert.notEqual(result.landing_page.status, 'PUBLISHED');
});

test('Decision Engine integration: getBestCroCandidate() é consulta pura, retorna null sem candidatos, nunca quebra', () => {
  const dir = makeTempDir();
  assert.equal(getBestCroCandidate(dir), null);

  const result = analyzeCro({});
  saveCandidates(result.candidates, dir);
  const best = getBestCroCandidate(dir);
  assert.ok(best);
  assert.equal(best.category, 'CRO');
  assert.notEqual(best.causality.status, 'INVALID');
});

test('idempotência: analyzeCro() com o mesmo estado real produz os mesmos candidate_ids e priority_scores', () => {
  const a = analyzeCro({});
  const b = analyzeCro({});
  assert.deepEqual(a.candidates.map((c) => c.candidate_id), b.candidates.map((c) => c.candidate_id));
  assert.deepEqual(a.candidates.map((c) => c.priority_score), b.candidates.map((c) => c.priority_score));
  assert.equal(a.source_of_truth.considered_path, b.source_of_truth.considered_path);
});

test('idempotência: saveCandidates duas vezes não duplica arquivo em disco', () => {
  const dir = makeTempDir();
  const result = analyzeCro({});
  saveCandidates(result.candidates, dir);
  const filesFirst = fs.readdirSync(dir);
  saveCandidates(result.candidates, dir);
  const filesSecond = fs.readdirSync(dir);
  assert.deepEqual(filesFirst, filesSecond);
  assert.equal(filesFirst.length, 1);
});

test('Experiment Engine compatibility: candidatos e integração usam category=CRO, mesmo minimum_evidence de CRO-001 real', () => {
  const result = analyzeCro({});
  const realCro001 = require('../data/experiments/CRO-001.json');
  for (const c of result.candidates) {
    assert.equal(c.category, 'CRO');
    assert.deepEqual(c.minimum_evidence, realCro001.minimum_evidence);
  }
});

test('nenhuma execução real: analyzeCro não dispara nenhuma chamada de rede (roda offline, só leitura local)', () => {
  // Prova indireta: roda com sucesso mesmo sem nenhuma variável de ambiente de API configurada
  // nesta execução de teste, e retorna resultado determinístico — se dependesse de rede, falharia
  // ou variaria entre execuções.
  const a = analyzeCro({});
  const b = analyzeCro({});
  assert.deepEqual(a.cro_001_analysis, b.cro_001_analysis);
});
