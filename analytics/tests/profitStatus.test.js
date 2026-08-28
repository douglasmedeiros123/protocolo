'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyProfitStatus, THRESHOLDS } = require('../src/profit/status');

test('CRITICAL_LOSS: roas < 0.5', () => {
  assert.equal(classifyProfitStatus(0.2, 2).status, 'CRITICAL_LOSS');
  assert.equal(classifyProfitStatus(0.49, 2).status, 'CRITICAL_LOSS');
});

test('LOSS: 0.5 <= roas < 0.9', () => {
  assert.equal(classifyProfitStatus(0.5, 2).status, 'LOSS');
  assert.equal(classifyProfitStatus(0.89, 2).status, 'LOSS');
});

test('NEAR_BREAK_EVEN: 0.9 <= roas < 1.0', () => {
  assert.equal(classifyProfitStatus(0.9, 2).status, 'NEAR_BREAK_EVEN');
  assert.equal(classifyProfitStatus(0.99, 2).status, 'NEAR_BREAK_EVEN');
});

test('BREAK_EVEN: 1.0 <= roas < 1.05', () => {
  assert.equal(classifyProfitStatus(1.0, 2).status, 'BREAK_EVEN');
  assert.equal(classifyProfitStatus(1.04, 2).status, 'BREAK_EVEN');
});

test('PROFITABLE: 1.05 <= roas < target', () => {
  assert.equal(classifyProfitStatus(1.05, 2).status, 'PROFITABLE');
  assert.equal(classifyProfitStatus(1.99, 2).status, 'PROFITABLE');
});

test('SCALE_CANDIDATE: roas >= target', () => {
  assert.equal(classifyProfitStatus(2.0, 2).status, 'SCALE_CANDIDATE');
  assert.equal(classifyProfitStatus(5.0, 2).status, 'SCALE_CANDIDATE');
});

test('target diferente de 2 desloca só o teto de PROFITABLE/SCALE_CANDIDATE', () => {
  assert.equal(classifyProfitStatus(1.4, 1.5).status, 'PROFITABLE');
  assert.equal(classifyProfitStatus(1.5, 1.5).status, 'SCALE_CANDIDATE');
});

test('sem dado (roas null) nunca cai numa faixa numérica — INSUFFICIENT_DATA explícito', () => {
  const s = classifyProfitStatus(null, 2);
  assert.equal(s.status, 'INSUFFICIENT_DATA');
  assert.ok(!Object.values(THRESHOLDS).includes(undefined)); // thresholds documentados existem
});

test('cada resultado vem com o motivo (reason) explicando o cálculo, não é caixa preta', () => {
  const s = classifyProfitStatus(1.2, 2);
  assert.ok(typeof s.reason === 'string' && s.reason.length > 0);
});
