'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidDateStr } = require('../src/utils/dates');

test('isValidDateStr aceita datas reais', () => {
  assert.equal(isValidDateStr('2026-08-25'), true);
  assert.equal(isValidDateStr('2024-02-29'), true); // 2024 é bissexto
  assert.equal(isValidDateStr('2026-01-01'), true);
  assert.equal(isValidDateStr('2026-12-31'), true);
});

test('isValidDateStr rejeita formato errado', () => {
  assert.equal(isValidDateStr('25-08-2026'), false);
  assert.equal(isValidDateStr('2026/08/25'), false);
  assert.equal(isValidDateStr('2026-8-25'), false);
  assert.equal(isValidDateStr(''), false);
  assert.equal(isValidDateStr('não é uma data'), false);
});

test('isValidDateStr rejeita mês/dia fora da faixa numérica', () => {
  assert.equal(isValidDateStr('2026-13-01'), false);
  assert.equal(isValidDateStr('2026-00-01'), false);
  assert.equal(isValidDateStr('2026-01-32'), false);
  assert.equal(isValidDateStr('2026-01-00'), false);
});

test('isValidDateStr rejeita datas de calendário impossíveis mesmo com formato/faixa ok (o rollover silencioso do Date.parse puro)', () => {
  assert.equal(isValidDateStr('2026-02-30'), false); // fevereiro não tem dia 30
  assert.equal(isValidDateStr('2026-02-29'), false); // 2026 não é bissexto
  assert.equal(isValidDateStr('2026-04-31'), false); // abril tem 30 dias
});
