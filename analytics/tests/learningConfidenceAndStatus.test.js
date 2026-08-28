'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeConfidence, repetitionScore, consistencyScore, dataQualityScore } = require('../src/learning/confidence');
const { classifyHypothesisStatus } = require('../src/learning/status');

test('confidence: repetição de sucesso aumenta o score (1 -> 2 -> 3 observações)', () => {
  assert.equal(repetitionScore(1), 100 / 3);
  assert.equal(repetitionScore(2), 200 / 3);
  assert.equal(repetitionScore(3), 100);
  assert.equal(repetitionScore(10), 100); // satura, não passa de 100
});

test('confidence: consistência cai quando resultados divergem, INCONCLUSIVE não conta pra direção', () => {
  const allSuccess = consistencyScore(['SUCCESS', 'SUCCESS']);
  const mixed = consistencyScore(['SUCCESS', 'FAILURE']);
  const withInconclusive = consistencyScore(['SUCCESS', 'SUCCESS', 'INCONCLUSIVE']);
  assert.equal(allSuccess.score, 100);
  assert.equal(mixed.score, 50);
  assert.equal(withInconclusive.score, 100); // INCONCLUSIVE ignorado, só os 2 SUCCESS contam
});

test('confidence: flags críticos de tracking REDUZEM mas nunca ELIMINAM o data_quality_score', () => {
  const clean = dataQualityScore(0, true);
  const oneFlag = dataQualityScore(1, true);
  const manyFlags = dataQualityScore(10, true);
  assert.equal(clean.score, 100);
  assert.equal(oneFlag.score, 70);
  assert.ok(manyFlags.score >= 0); // piso 0, nunca negativo
  assert.equal(manyFlags.score, 0);
});

test('confidence: quando tracking não foi checado, default é 100 mas checked=false (não afirma "está limpo")', () => {
  const result = dataQualityScore(0, false);
  assert.equal(result.score, 100);
  assert.equal(result.checked, false);
});

test('confidence: computeConfidence combina os 4 componentes com os pesos documentados (somam 1.0)', () => {
  const result = computeConfidence({
    minimumEvidence: { lpv: 30, checkouts: 5 },
    actualResult: { lpv: 40, checkouts: 6 },
    timesObserved: 3,
    results: ['SUCCESS', 'SUCCESS', 'SUCCESS'],
    criticalFlagsCount: 0,
    trackingChecked: true,
  });
  const weightSum = Object.values(result.weights).reduce((s, w) => s + w, 0);
  assert.equal(Math.round(weightSum * 100) / 100, 1);
  assert.equal(result.confidence, 100); // evidência completa, 3 repetições, 100% consistente, sem flags
});

test('confidence: divisão por zero — minimum_evidence com valor 0 não gera NaN/Infinity', () => {
  const result = computeConfidence({
    minimumEvidence: { lpv: 0 },
    actualResult: { lpv: 5 },
    timesObserved: 1,
    results: ['SUCCESS'],
    criticalFlagsCount: 0,
    trackingChecked: false,
  });
  assert.equal(Number.isFinite(result.confidence), true);
  assert.equal(Number.isNaN(result.confidence), false);
});

test('confidence: minimum_evidence/actual_result ausentes não quebram — score 0, checked false', () => {
  const result = computeConfidence({ minimumEvidence: null, actualResult: null, timesObserved: 0, results: [], criticalFlagsCount: 0, trackingChecked: false });
  assert.equal(Number.isFinite(result.confidence), true);
  assert.equal(result.components.evidence_completeness.checked, false);
});

test('status: CONTRADICTED quando há sucesso E falha na mesma hipótese, independente da confidence', () => {
  const r = classifyHypothesisStatus({ successes: 1, failures: 1, confidence: 95 });
  assert.equal(r.status, 'CONTRADICTED');
});

test('status: INVALIDATED quando falhou 2+ vezes e nunca teve sucesso', () => {
  const r = classifyHypothesisStatus({ successes: 0, failures: 2, confidence: 20 });
  assert.equal(r.status, 'INVALIDATED');
});

test('status: 1 falha isolada NÃO invalida ainda (falta repetição) — fica PROVISIONAL', () => {
  const r = classifyHypothesisStatus({ successes: 0, failures: 1, confidence: 20 });
  assert.equal(r.status, 'PROVISIONAL');
});

test('status: PROVISIONAL -> SUPPORTED -> STRONG conforme successes e confidence sobem (thresholds objetivos)', () => {
  const provisional = classifyHypothesisStatus({ successes: 1, failures: 0, confidence: 83 });
  const supported = classifyHypothesisStatus({ successes: 2, failures: 0, confidence: 60 });
  const strong = classifyHypothesisStatus({ successes: 3, failures: 0, confidence: 80 });
  assert.equal(provisional.status, 'PROVISIONAL'); // 1 sucesso isolado nunca é verdade absoluta
  assert.equal(supported.status, 'SUPPORTED');
  assert.equal(strong.status, 'STRONG');
});

test('status: SUPPORTED exige confidence >= 50 mesmo com 2 sucessos — abaixo disso fica PROVISIONAL', () => {
  const r = classifyHypothesisStatus({ successes: 2, failures: 0, confidence: 49 });
  assert.equal(r.status, 'PROVISIONAL');
});

test('status: STRONG exige confidence >= 75 mesmo com 3 sucessos — abaixo disso fica SUPPORTED', () => {
  const r = classifyHypothesisStatus({ successes: 3, failures: 0, confidence: 74 });
  assert.equal(r.status, 'SUPPORTED');
});
