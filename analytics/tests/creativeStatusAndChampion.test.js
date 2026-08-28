'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyCreativeStatus, CREATIVE_STATUSES, LOSER_MIN_CONFIDENCE, LOSER_SCORE_GAP, CHALLENGER_MAX_GAP } = require('../src/creative/status');
const { analyzeRealCreatives } = require('../src/creative/builder');

test('status: 11 estados documentados existem (inclui WEAKER_SIGNAL e CHALLENGER)', () => {
  assert.deepEqual(CREATIVE_STATUSES.sort(), ['ARCHIVED', 'BEST_SIGNAL', 'CHALLENGER', 'CHAMPION', 'DRAFT', 'FATIGUED', 'INCONCLUSIVE', 'LOSER', 'READY_TO_TEST', 'TESTING', 'WEAKER_SIGNAL'].sort());
});

test('status: amostra insuficiente -> INCONCLUSIVE, mesmo que pareça bom', () => {
  const r = classifyCreativeStatus({ sampleSufficient: false, isArchived: false, isFatigued: false, isBestAmongCompared: true, hasChampionEvidence: false, scoreGapFromBest: 0, scoreConfidence: 90 });
  assert.equal(r.status, 'INCONCLUSIVE');
});

test('status: melhor do peer group SEM evidência do Learning Engine -> BEST_SIGNAL, NUNCA CHAMPION', () => {
  const r = classifyCreativeStatus({ sampleSufficient: true, isArchived: false, isFatigued: false, isBestAmongCompared: true, hasChampionEvidence: false, scoreGapFromBest: 0, scoreConfidence: 90 });
  assert.equal(r.status, 'BEST_SIGNAL');
  assert.notEqual(r.status, 'CHAMPION');
});

test('status: CHAMPION exige AMBOS — melhor do peer group E evidência STRONG do Learning Engine', () => {
  const semEvidencia = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: true, hasChampionEvidence: false, scoreGapFromBest: 0, scoreConfidence: 90 });
  const comEvidencia = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: true, hasChampionEvidence: true, scoreGapFromBest: 0, scoreConfidence: 90 });
  assert.notEqual(semEvidencia.status, 'CHAMPION');
  assert.equal(comEvidencia.status, 'CHAMPION');
});

test('BEST_SIGNAL != CHAMPION mesmo com o melhor sinal atual (CPA Meta menor sozinho nunca promove a CHAMPION)', () => {
  const r = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: true, hasChampionEvidence: false, scoreGapFromBest: 0, scoreConfidence: 100 });
  assert.equal(r.status, 'BEST_SIGNAL');
});

test('LOSER: confidence baixa/moderada NÃO produz LOSER automaticamente, mesmo com gap grande', () => {
  const r = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: false, hasChampionEvidence: false, scoreGapFromBest: 40, scoreConfidence: 60 });
  assert.notEqual(r.status, 'LOSER');
  assert.equal(r.status, 'WEAKER_SIGNAL');
});

test('LOSER: exige gap >= limiar E confidence >= limiar (ambas as condições, não apenas ranking)', () => {
  const gapAltoConfBaixa = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: false, scoreGapFromBest: LOSER_SCORE_GAP + 5, scoreConfidence: LOSER_MIN_CONFIDENCE - 10 });
  const gapAltoConfAlta = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: false, scoreGapFromBest: LOSER_SCORE_GAP + 5, scoreConfidence: LOSER_MIN_CONFIDENCE + 10 });
  assert.notEqual(gapAltoConfBaixa.status, 'LOSER');
  assert.equal(gapAltoConfAlta.status, 'LOSER');
});

test('LOSER: experimento REAL concluído como FAILURE é evidência independente, dispensa o threshold de confidence de mídia', () => {
  const r = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: false, scoreGapFromBest: 5, scoreConfidence: 10, experimentConcludedFailure: true });
  assert.equal(r.status, 'LOSER');
});

test('CHALLENGER: gap pequeno (ainda no páreo) fica CHALLENGER, não WEAKER_SIGNAL nem LOSER', () => {
  const r = classifyCreativeStatus({ sampleSufficient: true, isBestAmongCompared: false, scoreGapFromBest: CHALLENGER_MAX_GAP - 5, scoreConfidence: 90 });
  assert.equal(r.status, 'CHALLENGER');
});

test('status NÃO depende apenas do ranking relativo: mesmo gap, resultado muda conforme confidence (2ª variável independente)', () => {
  const base = { sampleSufficient: true, isBestAmongCompared: false, scoreGapFromBest: LOSER_SCORE_GAP + 10 };
  const baixaConf = classifyCreativeStatus({ ...base, scoreConfidence: 30 });
  const altaConf = classifyCreativeStatus({ ...base, scoreConfidence: 90 });
  assert.notEqual(baixaConf.status, altaConf.status);
  assert.equal(baixaConf.status, 'WEAKER_SIGNAL');
  assert.equal(altaConf.status, 'LOSER');
});

test('status: ARCHIVED e FATIGUED são checados ANTES de qualquer outra regra (nunca reclassificados)', () => {
  const archived = classifyCreativeStatus({ isArchived: true, sampleSufficient: true, isBestAmongCompared: true, hasChampionEvidence: true, scoreGapFromBest: 0, scoreConfidence: 100 });
  const fatigued = classifyCreativeStatus({ isArchived: false, isFatigued: true, sampleSufficient: true, isBestAmongCompared: true, hasChampionEvidence: true, scoreGapFromBest: 0, scoreConfidence: 100 });
  assert.equal(archived.status, 'ARCHIVED');
  assert.equal(fatigued.status, 'FATIGUED');
});

test('integração real: CREATIVE-05 é BEST_SIGNAL, CREATIVE-01 fica WEAKER_SIGNAL (NÃO LOSER — falta atribuição financeira) — e NENHUM dos dois é CHAMPION', () => {
  const analysis = analyzeRealCreatives({ hypotheses: [] });
  const c05 = analysis.assets.find((a) => a.creative_id === 'CREATIVE-05');
  const c01 = analysis.assets.find((a) => a.creative_id === 'CREATIVE-01');
  assert.ok(c05);
  assert.ok(c01);
  assert.equal(c05.status, 'BEST_SIGNAL');
  assert.equal(c01.status, 'WEAKER_SIGNAL');
  assert.notEqual(c01.status, 'LOSER');
  assert.notEqual(c05.status, 'CHAMPION');
  assert.notEqual(c01.status, 'CHAMPION');
  assert.equal(analysis.champion, null);
  assert.equal(analysis.best_current_signal, 'CREATIVE-05');
});
