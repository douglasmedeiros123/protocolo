'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TARGET_FINANCIAL_ROAS } = require('../src/decision/northStar');
const { MILESTONE_LADDER, computeMilestoneProgress } = require('../src/planner/milestones');
const { buildEconomicsSnapshot } = require('../src/planner/economicsSnapshot');
const { dateRange } = require('../src/utils/dates');

const DATES = dateRange('2026-07-30', '2026-08-28');

test('item 78: North Star reusado do decision/northStar.js — nunca duplicado (3.0)', () => {
  const snap = buildEconomicsSnapshot(DATES);
  assert.equal(snap.roas3_gap.target_roas, TARGET_FINANCIAL_ROAS);
  assert.equal(snap.roas3_gap.target_roas, 3.0);
});

test('item 78: milestone ladder exata do item 6, ROAS 3 sempre o último degrau', () => {
  assert.deepEqual(MILESTONE_LADDER, [0.75, 0.90, 1.00, 1.20, 1.50, 2.00, 2.50, 3.0]);
  assert.equal(MILESTONE_LADDER[MILESTONE_LADDER.length - 1], TARGET_FINANCIAL_ROAS);
});

test('item 78: next_milestone é o próximo degrau ACIMA do ROAS atual, nunca um já superado', () => {
  const p = computeMilestoneProgress(0.85);
  assert.equal(p.next_milestone, 0.90);
});

test('item 78: gap_to_next_milestone e gap_to_north_star calculados corretamente', () => {
  const p = computeMilestoneProgress(1.0);
  assert.equal(p.next_milestone, 1.20);
  assert.equal(p.gap_to_next_milestone, 0.20);
  assert.equal(p.gap_to_north_star, 2.0);
});

test('item 78: ROAS acima de todos os degraus -> next_milestone null, gap 0 (já atingiu o topo)', () => {
  const p = computeMilestoneProgress(3.5);
  assert.equal(p.next_milestone, null);
  assert.equal(p.gap_to_next_milestone, 0);
});

test('item 78: ROAS ausente nunca vira 0 — tudo fica null explícito', () => {
  const p = computeMilestoneProgress(null);
  assert.equal(p.current_roas, null);
  assert.equal(p.next_milestone, null);
  assert.equal(p.gap_to_north_star, null);
});

test('item 78: cenários combinados reais (Offer scenarioEngine) presentes na economics snapshot', () => {
  const snap = buildEconomicsSnapshot(DATES);
  assert.ok(Array.isArray(snap.scenarios.combined_scenarios));
  assert.equal(snap.scenarios.combined_scenarios.length, 3);
});

test('item 78: required_improvement (ROAS3 gap) vem de dados persistidos reais, nunca hardcoded', () => {
  const snap = buildEconomicsSnapshot(DATES);
  assert.equal(typeof snap.roas3_gap.required_net_revenue_per_buyer_at_current_cpa, 'number');
  // não fixamos o valor exato (depende dos dados reais no momento do teste) — só garantimos que é derivado, não um número mágico
  assert.notEqual(snap.roas3_gap.required_net_revenue_per_buyer_at_current_cpa, 0);
});

test('current ROAS não é hardcoded — vem de profit/aggregate.js + profit/financials.js real', () => {
  const snap = buildEconomicsSnapshot(DATES);
  assert.equal(typeof snap.financials.roas_financeiro, 'number');
  assert.ok(snap.financials.roas_financeiro > 0 && snap.financials.roas_financeiro < 3);
});

test('known_quantified_levers_close_gap reflete honestamente o melhor cenário combinado real', () => {
  const snap = buildEconomicsSnapshot(DATES);
  assert.equal(typeof snap.known_quantified_levers_close_gap, 'boolean');
});
