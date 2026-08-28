'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeNorthStar, TARGET_FINANCIAL_ROAS, MILESTONES } = require('../src/decision/northStar');
const { classifyDecisionMode } = require('../src/decision/mode');

test('North Star: alvo é sempre 3.0, nunca configurável por execução', () => {
  assert.equal(TARGET_FINANCIAL_ROAS, 3.0);
  assert.deepEqual(MILESTONES, [1.0, 1.5, 2.0, 3.0]);
});

test('North Star: ROAS 0.59 -> próximo marco 1.0, North Star permanece 3.0', () => {
  const r = computeNorthStar(0.59);
  assert.equal(r.target_roas, 3.0);
  assert.equal(r.next_milestone, 1.0);
  assert.ok(r.roas_gap_absolute > 0);
});

test('North Star: ROAS 1.2 -> próximo marco 1.5', () => {
  assert.equal(computeNorthStar(1.2).next_milestone, 1.5);
});

test('North Star: ROAS 2.7 -> próximo marco 3.0 (o próprio North Star)', () => {
  assert.equal(computeNorthStar(2.7).next_milestone, 3.0);
});

test('North Star: ROAS >= 3.0 -> next_milestone null (já bateu o North Star), mas target continua 3.0', () => {
  const r = computeNorthStar(3.5);
  assert.equal(r.next_milestone, null);
  assert.equal(r.target_roas, 3.0);
});

test('North Star: roas null -> gap não é inventado, tudo null e explicado', () => {
  const r = computeNorthStar(null);
  assert.equal(r.roas_gap_absolute, null);
  assert.equal(r.roas_gap_percent, null);
  assert.equal(r.next_milestone, null);
  assert.equal(r.target_roas, 3.0); // North Star nunca some, mesmo sem dado
});

test('mode: roas(30d) < 1.0 -> RECOVERY', () => {
  const r = classifyDecisionMode({ roas30d: 0.62, roas7d: 0.6, roas14d: 0.65, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.equal(r.mode, 'RECOVERY');
});

test('mode: roas(30d) null (sem dado) -> RECOVERY (default mais seguro)', () => {
  const r = classifyDecisionMode({ roas30d: null, roas7d: null, roas14d: null, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.equal(r.mode, 'RECOVERY');
});

test('mode: roas(30d) >= 1.0 sem evidência de sustentabilidade -> VALIDATION', () => {
  const r = classifyDecisionMode({ roas30d: 1.1, roas7d: 0.8, roas14d: 0.9, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.equal(r.mode, 'VALIDATION');
});

test('mode: roas(30d) >= 1.0 com evidência crescente (hipótese SUPPORTED) -> GROWTH', () => {
  // roas7d=0.95 fica ACIMA do limiar de deterioração (70% de 1.3 = 0.91) mas ABAIXO de 1.0, pra
  // isolar o efeito de hasSupportedHypothesis sem cruzar com a checagem de DEFENSE.
  const r = classifyDecisionMode({ roas30d: 1.3, roas7d: 0.95, roas14d: 1.0, hasStrongHypothesis: false, hasSupportedHypothesis: true, trackingBlocking: false });
  assert.equal(r.mode, 'GROWTH');
});

test('mode: roas(30d) >= 1.0 com janelas 7d/30d consistentes (mesmo sem hipótese SUPPORTED) -> GROWTH', () => {
  const r = classifyDecisionMode({ roas30d: 1.2, roas7d: 1.1, roas14d: 0.9, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.equal(r.mode, 'GROWTH');
});

test('mode: operação sustentável (hipótese STRONG + todas janelas positivas + tracking confiável) -> SCALE', () => {
  const r = classifyDecisionMode({ roas30d: 1.5, roas7d: 1.4, roas14d: 1.45, hasStrongHypothesis: true, hasSupportedHypothesis: true, trackingBlocking: false });
  assert.equal(r.mode, 'SCALE');
});

test('mode: ROAS instantâneo alto sozinho NÃO basta pra SCALE — precisa de hipótese STRONG', () => {
  const r = classifyDecisionMode({ roas30d: 2.5, roas7d: 2.6, roas14d: 2.4, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.notEqual(r.mode, 'SCALE');
});

test('mode: tracking bloqueante impede SCALE mesmo com hipótese STRONG e janelas todas positivas', () => {
  const r = classifyDecisionMode({ roas30d: 1.5, roas7d: 1.4, roas14d: 1.45, hasStrongHypothesis: true, hasSupportedHypothesis: true, trackingBlocking: true });
  assert.notEqual(r.mode, 'SCALE');
});

test('mode: deterioração (30d saudável, 7d caiu abaixo de 70% do 30d) -> DEFENSE', () => {
  const r = classifyDecisionMode({ roas30d: 2.0, roas7d: 1.0, roas14d: 1.8, hasStrongHypothesis: true, hasSupportedHypothesis: true, trackingBlocking: false });
  assert.equal(r.mode, 'DEFENSE');
});

test('mode: queda pequena (7d ainda >= 70% do 30d) NÃO é deterioração relevante', () => {
  const r = classifyDecisionMode({ roas30d: 2.0, roas7d: 1.5, roas14d: 1.9, hasStrongHypothesis: true, hasSupportedHypothesis: true, trackingBlocking: false });
  assert.notEqual(r.mode, 'DEFENSE');
});

test('mode: DEFENSE é checado ANTES do limiar simples — operação que caiu abaixo de 1.0 vindo de saudável ainda é DEFENSE, não RECOVERY puro', () => {
  const r = classifyDecisionMode({ roas30d: 1.5, roas7d: 0.5, roas14d: 1.3, hasStrongHypothesis: false, hasSupportedHypothesis: false, trackingBlocking: false });
  assert.equal(r.mode, 'DEFENSE');
});
