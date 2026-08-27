'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldBlock, readClarityStatus, buildSummary } = require('../src/validate');

test('snapshot ausente bloqueia', () => {
  const d = shouldBlock(null);
  assert.equal(d.block, true);
});

test('faltando Meta bloqueia mesmo com Hotmart presente', () => {
  const d = shouldBlock({ sources: { meta: false, hotmart: true, github: true } });
  assert.equal(d.block, true);
  assert.match(d.reason, /meta/);
});

test('faltando Hotmart bloqueia mesmo com Meta presente', () => {
  const d = shouldBlock({ sources: { meta: true, hotmart: false, github: true } });
  assert.equal(d.block, true);
  assert.match(d.reason, /hotmart/);
});

test('flag crítica de data quality NÃO bloqueia (regra explícita: venda fantasma deve ser preservada, não descartada)', () => {
  const snapshot = {
    sources: { meta: true, hotmart: true, github: true },
    tracking_flags: [
      { code: 'META_PURCHASE_WITHOUT_HOTMART_SALE', severity: 'critical', message: 'x' },
    ],
    has_critical_flags: true,
    critical_flag_codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'],
  };
  const d = shouldBlock(snapshot);
  assert.equal(d.block, false);
});

test('Meta e Hotmart presentes, sem github: não bloqueia (github não é obrigatório)', () => {
  const d = shouldBlock({ sources: { meta: true, hotmart: true, github: false } });
  assert.equal(d.block, false);
});

test('readClarityStatus: sem ponteiro nenhum ainda', () => {
  const status = readClarityStatus({ clarity: { status: 'separate_behavior_snapshot', latest_snapshot: null } }, '/tmp/inexistente');
  assert.equal(status.label, 'sem snapshot ainda');
});

test('buildSummary: inclui a data processada e o resumo de flags', () => {
  const snapshot = {
    sources: { meta: true, hotmart: true, github: true },
    clarity: { status: 'separate_behavior_snapshot', latest_snapshot: null },
    tracking_flags: [{ code: 'SUSPICIOUS_REPEATED_PURCHASE_VALUE', severity: 'warn', message: 'x' }],
  };
  const text = buildSummary('2026-08-25', snapshot, '/tmp/inexistente');
  assert.match(text, /DATA PROCESSADA: 2026-08-25/);
  assert.match(text, /META: OK/);
  assert.match(text, /HOTMART: OK/);
  assert.match(text, /FLAGS CRÍTICOS: 0/);
});

test('buildSummary: destaca flag crítica com marcador ::error::', () => {
  const snapshot = {
    sources: { meta: true, hotmart: true, github: true },
    clarity: { status: 'separate_behavior_snapshot', latest_snapshot: null },
    tracking_flags: [{ code: 'META_PURCHASE_WITHOUT_HOTMART_SALE', severity: 'critical', message: 'venda fantasma' }],
  };
  const text = buildSummary('2026-08-25', snapshot, '/tmp/inexistente');
  assert.match(text, /FLAGS CRÍTICOS: 1/);
  assert.match(text, /::error::\[META_PURCHASE_WITHOUT_HOTMART_SALE\]/);
});
