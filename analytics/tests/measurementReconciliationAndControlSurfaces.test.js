'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyDayDivergence, buildReconciliation } = require('../src/measurement/reconciliation');
const { buildControlSurfaces, classifyControlSurface, classifyGtmContainerControl } = require('../src/measurement/controlSurfaces');
const { DIVERGENCE_TYPES, CONTROL_SURFACE_STATUSES } = require('../src/measurement/enums');
const { standardWindows } = require('../src/profit/windows');
const { todayBRT } = require('../src/utils/dates');

const REAL_DATES = standardWindows(todayBRT()).last_30d.dates;

test('classifyDayDivergence só usa tipos da taxonomia canônica', () => {
  const r = buildReconciliation({ dates: REAL_DATES });
  for (const day of r.per_day) {
    for (const div of day.divergences) assert.ok(DIVERGENCE_TYPES.includes(div.type), `tipo inválido: ${div.type}`);
  }
});

test('real: 2026-08-19 e 2026-08-25 (compra fantasma confirmada) classificam como UNMATCHED_PLATFORM_ONLY, nunca promovidas a receita', () => {
  const r = buildReconciliation({ dates: REAL_DATES });
  const day19 = r.per_day.find((d) => d.date === '2026-08-19');
  const day25 = r.per_day.find((d) => d.date === '2026-08-25');
  assert.ok(day19.divergences.some((d) => d.type === 'UNMATCHED_PLATFORM_ONLY' && d.never_promoted_to_revenue === true));
  assert.ok(day25.divergences.some((d) => d.type === 'UNMATCHED_PLATFORM_ONLY' && d.never_promoted_to_revenue === true));
  assert.equal(r.ghost_purchase_days.length, 2);
});

test('divergência nunca invalida FINANCIAL_TRANSACTION_TRUTH — blocking_financial_truth sempre false', () => {
  const r = buildReconciliation({ dates: REAL_DATES });
  for (const day of r.per_day) {
    for (const div of day.divergences) assert.equal(div.blocking_financial_truth, false);
  }
});

test('dia sem coleta completa nunca vira MATCHED por padrão — UNKNOWN explícito', () => {
  const r = classifyDayDivergence(null);
  assert.equal(r[0].type, 'UNKNOWN');
});

test('dia sem nenhuma atividade de compra em nenhuma fonte é MATCHED (nada a reconciliar), nunca UNKNOWN por omissão', () => {
  const day = { meta: { totals: { compra_meta: 0, receita_meta: 0 } }, hotmart: { totals: { orders_count: 0, order_bumps_count: 0, refunds_count: 0, cancellations_or_expired_count: 0, test_transactions_count: 0 } }, tracking_flags: [] };
  const r = classifyDayDivergence(day);
  assert.equal(r[0].type, 'MATCHED');
});

test('um dia pode carregar múltiplas divergências simultâneas (ex.: reembolso + cancelamento no mesmo dia)', () => {
  const day = { meta: { totals: { compra_meta: 1, receita_meta: 67 } }, hotmart: { totals: { orders_count: 1, order_bumps_count: 0, refunds_count: 1, cancellations_or_expired_count: 1, test_transactions_count: 0 } }, tracking_flags: [] };
  const r = classifyDayDivergence(day);
  const types = r.map((d) => d.type);
  assert.ok(types.includes('MATCHED'));
  assert.ok(types.includes('REFUNDED'));
  assert.ok(types.includes('CANCELLED'));
});

// ===== control surfaces =====

test('CHECKOUT é sempre EXTERNAL — nunca presume controle sobre o checkout Hotmart', () => {
  assert.equal(classifyControlSurface('CHECKOUT'), 'EXTERNAL');
});

test('páginas próprias (SALES_PAGE/ADVERTORIAL/VSL) são CONTROLLED — Clarity tecnicamente instalável', () => {
  const surfaces = buildControlSurfaces(['SALES_PAGE', 'ADVERTORIAL', 'VSL', 'CHECKOUT']);
  const salesPage = surfaces.find((s) => s.stage_type === 'SALES_PAGE');
  const checkout = surfaces.find((s) => s.stage_type === 'CHECKOUT');
  assert.equal(salesPage.control, 'CONTROLLED');
  assert.equal(salesPage.clarity_installable, true);
  assert.equal(checkout.control, 'EXTERNAL');
  assert.equal(checkout.clarity_installable, false);
});

test('todo controle de superfície usa só os status canônicos', () => {
  for (const t of ['AD', 'CONTENT', 'CHECKOUT', 'WHATSAPP', 'OTHER']) {
    assert.ok(CONTROL_SURFACE_STATUSES.includes(classifyControlSurface(t)));
  }
});

test('container GTM é PARTIALLY_CONTROLLED — nunca CONTROLLED (conteúdo interno não versionado no repo)', () => {
  const r = classifyGtmContainerControl();
  assert.equal(r.control, 'PARTIALLY_CONTROLLED');
});
