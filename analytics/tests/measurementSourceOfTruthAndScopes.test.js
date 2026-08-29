'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSourceOfTruthMatrix } = require('../src/measurement/sourceOfTruth');
const { SOURCE_OF_TRUTH_DOMAINS, MEASUREMENT_SCOPE_STATUSES, CORE_INVARIANTS } = require('../src/measurement/enums');
const { standardWindows } = require('../src/profit/windows');
const { todayBRT } = require('../src/utils/dates');

const REAL_DATES = standardWindows(todayBRT()).last_30d.dates;

test('matriz cobre exatamente os 17 domínios canônicos, nenhum a mais nem a menos', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.equal(Object.keys(r.domains).length, 17);
  for (const d of SOURCE_OF_TRUTH_DOMAINS) assert.ok(r.domains[d], `domínio ausente: ${d}`);
});

test('todo domínio usa só os status canônicos de escopo de mensuração', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  for (const [name, d] of Object.entries(r.domains)) {
    assert.ok(MEASUREMENT_SCOPE_STATUSES.includes(d.status), `${name} tem status inválido: ${d.status}`);
  }
});

test('RELIABLE nunca aparece sem evidence/known_limitations explícitos (nunca "dado existe" sozinho)', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  for (const [name, d] of Object.entries(r.domains)) {
    if (d.status === 'RELIABLE') {
      assert.ok(d.evidence && d.evidence.length > 0, `${name} RELIABLE sem evidence`);
      assert.ok(Array.isArray(d.known_limitations), `${name} RELIABLE sem known_limitations`);
    }
  }
});

test('FINANCIAL_TRANSACTION_TRUTH nunca tem fallback_source (é a própria fonte de verdade)', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.match(r.domains.FINANCIAL_TRANSACTION_TRUTH.fallback_source, /NENHUM/);
});

test('PLATFORM_ATTRIBUTION nunca vira BLOCKED só por divergência com Hotmart (DEGRADED != BLOCKED)', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.notEqual(r.domains.PLATFORM_ATTRIBUTION.status, 'BLOCKED');
  assert.equal(r.domains.PLATFORM_ATTRIBUTION.blocking_impact, false);
});

test('real: dias reais de compra fantasma (2026-08-19, 2026-08-25) reduzem a confiança de PLATFORM_ATTRIBUTION sem bloquear FINANCIAL_TRANSACTION_TRUTH', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.ok(r.reconciliation.ghost_purchase_days.some((g) => g.date === '2026-08-19'));
  assert.ok(r.reconciliation.ghost_purchase_days.some((g) => g.date === '2026-08-25'));
  assert.notEqual(r.domains.FINANCIAL_TRANSACTION_TRUTH.status, 'BLOCKED');
});

test('LTV_TRUTH e LIFECYCLE_ATTRIBUTION são NOT_AVAILABLE hoje — nunca projetados sem sistema real', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.equal(r.domains.LTV_TRUTH.status, 'NOT_AVAILABLE');
  assert.equal(r.domains.LIFECYCLE_ATTRIBUTION.status, 'NOT_AVAILABLE');
  assert.equal(r.domains.LTV_TRUTH.confidence, 'NOT_ASSESSABLE');
});

test('os 13 invariantes centrais do PASSO 13 estão todos documentados uma única vez', () => {
  assert.equal(CORE_INVARIANTS.length, 13);
  assert.ok(CORE_INVARIANTS.includes('REVENUE != PROFIT'));
  assert.ok(CORE_INVARIANTS.includes('UNKNOWN != ZERO'));
});

test('determinismo: duas execuções com o mesmo período produzem a mesma matriz (exceto timestamps)', () => {
  const a = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  const b = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.deepEqual(a.domains, b.domains);
});

test('coverage/data_completeness real vem de aggregatePeriod — nunca hardcoded', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.equal(r.domains.ACQUISITION_SPEND.coverage, r.agg.data_completeness);
});
