'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveTargetDate } = require('../src/resolveDate');
const { todayBRT } = require('../src/utils/dates');

test('input de data válido: aceita e retorna exatamente a mesma data', () => {
  assert.equal(resolveTargetDate('2026-08-25'), '2026-08-25');
});

test('input vazio: retorna ontem em BRT (não hoje, não lança erro)', () => {
  const yesterday = new Date(Date.parse(todayBRT() + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  assert.equal(resolveTargetDate(''), yesterday);
  assert.equal(resolveTargetDate(undefined), yesterday);
});

test('input de data inválido: formato errado lança erro, não usa o valor mesmo assim', () => {
  assert.throws(() => resolveTargetDate('25-08-2026'), /inválida/);
  assert.throws(() => resolveTargetDate('2026/08/25'), /inválida/);
  assert.throws(() => resolveTargetDate('não é uma data'), /inválida/);
});

test('input de data inválido: formato certo mas calendário impossível lança erro', () => {
  assert.throws(() => resolveTargetDate('2026-13-45'), /inválida/);
  assert.throws(() => resolveTargetDate('2026-02-30'), /inválida/);
});

test('input com espaços em branco é tratado como vazio (usa ontem)', () => {
  const yesterday = new Date(Date.parse(todayBRT() + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  assert.equal(resolveTargetDate('   '), yesterday);
});
