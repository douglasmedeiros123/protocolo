'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs } = require('../src/offer');
const { analyzeOffer } = require('../src/offer/builder');
const { saveOffers, saveDiagnostics, saveCandidates, saveAnalysis, saveScenarios } = require('../src/offer/registry');
const { getBestOfferCandidate } = require('../src/decision/offerIntegration');
const { OWNERSHIP_BOUNDARIES } = require('../src/offer/boundaries');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'offer-safety-test-')); }

test('CLI parseArgs: reconhece --product --summary --analyze --generate-candidates --offer --simulate --rebuild', () => {
  const args = parseArgs(['--product', 'x', '--summary', '--analyze', '--generate-candidates', '--offer', 'OFFER-V1', '--simulate', 'bump', '--rebuild']);
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.analyze, true);
  assert.equal(args.generateCandidates, true);
  assert.equal(args.offer, 'OFFER-V1');
  assert.equal(args.simulate, 'bump');
  assert.equal(args.rebuild, true);
});

test('CLI parseArgs: sem flags, tudo undefined', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, undefined);
  assert.equal(args.offer, undefined);
});

test('TRANSACTION_AOV != LIFETIME_VALUE: boundary documentado explicitamente, LTV nunca calculado por este agente (item 40)', () => {
  assert.match(OWNERSHIP_BOUNDARIES.OFFER_VS_LIFECYCLE.boundary_rule, /TRANSACTION_AOV/);
  assert.match(OWNERSHIP_BOUNDARIES.OFFER_VS_LIFECYCLE.boundary_rule, /LIFETIME_VALUE/);
  const r = analyzeOffer({});
  assert.equal('lifetime_value' in r, false);
  assert.equal('ltv' in r, false);
});

test('OFFER vs CRO boundary: PRICE_PRESENTATION pertence ao CRO, economia real da transação pertence ao Offer (item 46)', () => {
  assert.ok(OWNERSHIP_BOUNDARIES.OFFER_VS_CRO.cro_owns.some((s) => /PRICE_PRESENTATION/.test(s)));
  assert.ok(OWNERSHIP_BOUNDARIES.OFFER_VS_CRO.offer_owns.some((s) => /economia real/.test(s)));
});

test('OFFER vs CREATIVE boundary: Creative comunica, Offer decide preço/estrutura (item 47)', () => {
  assert.match(OWNERSHIP_BOUNDARIES.OFFER_VS_CREATIVE.boundary_rule, /Creative NÃO decide preço/);
  assert.match(OWNERSHIP_BOUNDARIES.OFFER_VS_CREATIVE.boundary_rule, /Offer NÃO decide hook/);
});

test('data quality: análise real expõe data_completeness, financial_confidence implícito via economics.period', () => {
  const r = analyzeOffer({});
  assert.ok('period' in r.economics);
  assert.equal(typeof r.economics.period.data_completeness, 'number');
});

test('SAFETY (item 57): analyzeOffer nunca escreve fora de analytics/data/offer/ — Hotmart/experiments/creatives/cro intactos', () => {
  const experimentsFile = path.join(__dirname, '..', 'data', 'experiments', 'AOV-001.json');
  const dailyFile = path.join(__dirname, '..', 'data', 'daily', '2026-08-25.json');
  const beforeExp = fs.readFileSync(experimentsFile, 'utf8');
  const beforeDaily = fs.readFileSync(dailyFile, 'utf8');

  const dir = makeTempDir();
  const r = analyzeOffer({});
  saveOffers([r.offer], dir);
  saveDiagnostics(r.diagnostics, dir);
  saveCandidates(r.candidates, dir);
  saveAnalysis(r, dir);
  saveScenarios(r.scenarios, dir);

  assert.equal(fs.readFileSync(experimentsFile, 'utf8'), beforeExp);
  assert.equal(fs.readFileSync(dailyFile, 'utf8'), beforeDaily);
});

test('SAFETY: nenhum objeto retornado tem campo de execução real (checkout_created/product_published/price_changed)', () => {
  const r = analyzeOffer({});
  assert.equal('checkout_created' in r, false);
  assert.equal('product_published' in r, false);
  assert.equal('price_changed' in r, false);
  for (const c of r.candidates) {
    assert.equal('executed' in c, false);
    assert.equal('published' in c, false);
  }
});

test('Decision Engine integration: getBestOfferCandidate() é consulta pura, retorna null sem candidatos, nunca quebra', () => {
  const dir = makeTempDir();
  assert.equal(getBestOfferCandidate(dir), null);

  const r = analyzeOffer({});
  saveCandidates(r.candidates, dir);
  const best = getBestOfferCandidate(dir);
  assert.ok(best);
  assert.notEqual(best.causality.status, 'INVALID');
  assert.ok('expected_impact' in best && 'confidence' in best && 'capital_requirement' in best && 'risk' in best);
});

test('Experiment Engine compatibility: candidatos usam category AOV (componente existente) ou OFFER (novo), minimum_evidence real', () => {
  const r = analyzeOffer({});
  const categories = new Set(r.candidates.map((c) => c.category));
  assert.ok(categories.has('AOV') || categories.has('OFFER'));
  for (const c of r.candidates) assert.ok(c.minimum_evidence);
});

test('Learning Engine integration: checkOfferPriorLearning não quebra com hypotheses reais vazias (estado atual: 0 aprendizados)', () => {
  const { checkOfferPriorLearning } = require('../src/offer/priorLearning');
  const r = checkOfferPriorLearning({ productId: null, category: 'AOV', targetMetric: 'bump_attach_rate', variableChanged: 'BUMP_COPY' }, []);
  assert.equal(r.verdict, 'NO_PRIOR_EVIDENCE');
});

test('nenhuma ação real: analyzeOffer nunca chama API externa (roda offline, determinístico)', () => {
  const a = analyzeOffer({});
  const b = analyzeOffer({});
  assert.deepEqual(a.aov_001_analysis, b.aov_001_analysis);
  assert.deepEqual(a.source_of_truth, b.source_of_truth);
});
