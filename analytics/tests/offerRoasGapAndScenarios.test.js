'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeRoas3Gap } = require('../src/offer/roasGap');
const { runOfferScenarios, simulateScenario, AOV_SCENARIOS, COMBINED_SCENARIOS } = require('../src/offer/scenarioEngine');
const { TARGET_FINANCIAL_ROAS } = require('../src/decision/northStar');

test('ROAS3 gap: target_roas reusa o North Star do Decision Engine (3.0), nunca duplicado/hardcoded diferente', () => {
  const r = computeRoas3Gap({ financialCpa: 100, netRevenuePerBuyer: 50 });
  assert.equal(r.target_roas, TARGET_FINANCIAL_ROAS);
  assert.equal(r.target_roas, 3.0);
});

test('ROAS3 gap: current_financial_roas = net_revenue_per_buyer / financial_cpa', () => {
  const r = computeRoas3Gap({ financialCpa: 100, netRevenuePerBuyer: 60 });
  assert.equal(r.current_financial_roas, 0.6);
});

test('required AOV: required_net_revenue_per_buyer_at_current_cpa = CPA * 3', () => {
  const r = computeRoas3Gap({ financialCpa: 100, netRevenuePerBuyer: 50 });
  assert.equal(r.required_net_revenue_per_buyer_at_current_cpa, 300);
  assert.equal(r.aov_gap_to_roas3, 250);
});

test('required CPA: required_cpa_at_current_net_revenue_per_buyer = net_revenue_per_buyer / 3', () => {
  const r = computeRoas3Gap({ financialCpa: 100, netRevenuePerBuyer: 60 });
  assert.equal(r.required_cpa_at_current_net_revenue_per_buyer, 20);
});

test('ROAS3 gap: dado ausente nunca vira 0 — fica null', () => {
  const r = computeRoas3Gap({ financialCpa: null, netRevenuePerBuyer: null });
  assert.equal(r.current_financial_roas, null);
  assert.equal(r.required_net_revenue_per_buyer_at_current_cpa, null);
  assert.equal(r.required_cpa_at_current_net_revenue_per_buyer, null);
});

test('scenarios: TODO cenário é rotulado SCENARIO_NOT_FORECAST, nunca chamado de previsão', () => {
  const r = runOfferScenarios({ currentCpa: 100, currentNetRevenuePerBuyer: 50 });
  assert.equal(r.current.status, 'SCENARIO_NOT_FORECAST');
  for (const s of r.aov_only_scenarios) assert.equal(s.status, 'SCENARIO_NOT_FORECAST');
  for (const s of r.combined_scenarios) assert.equal(s.status, 'SCENARIO_NOT_FORECAST');
});

test('scenarios: AOV isolado cobre 0/+10/+20/+30/+50%', () => {
  assert.deepEqual(AOV_SCENARIOS, [0, 0.10, 0.20, 0.30, 0.50]);
});

test('scenarios: combinados cobrem CPA-10%+AOV+10%, CPA-20%+AOV+20%, CPA-30%+AOV+30% (caminho combinado, item 26)', () => {
  assert.deepEqual(COMBINED_SCENARIOS, [
    { cpaChangePct: -0.10, aovChangePct: 0.10 },
    { cpaChangePct: -0.20, aovChangePct: 0.20 },
    { cpaChangePct: -0.30, aovChangePct: 0.30 },
  ]);
});

test('scenarios: caminho combinado (CPA cai + AOV sobe) gera ROAS maior que AOV sozinho na mesma magnitude (item 26)', () => {
  const aovOnly = simulateScenario({ currentCpa: 100, currentNetRevenuePerBuyer: 50, cpaChangePct: 0, aovChangePct: 0.2 });
  const combined = simulateScenario({ currentCpa: 100, currentNetRevenuePerBuyer: 50, cpaChangePct: -0.2, aovChangePct: 0.2 });
  assert.ok(combined.expected_financial_roas > aovOnly.expected_financial_roas);
});

test('scenarios: dado ausente nunca produz ROAS inventado — fica null', () => {
  const r = simulateScenario({ currentCpa: null, currentNetRevenuePerBuyer: null, cpaChangePct: 0.1, aovChangePct: 0.1 });
  assert.equal(r.expected_financial_roas, null);
});
