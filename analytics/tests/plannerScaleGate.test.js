'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateScaleGate, MIN_BUYERS_FOR_SCALE } = require('../src/planner/scaleGate');
const { analyzePlan } = require('../src/planner/builder');

function snap(overrides = {}) {
  return {
    financials: { roas_financeiro: 3.5, numero_compradores_reais: 25 },
    profit_status: 'SCALE_CANDIDATE',
    roas3_gap: { target_roas: 3.0 },
    period: { data_completeness: 0.95 },
    ...overrides,
  };
}

test('item 80: um dia bom (amostra pequena) NÃO libera scale', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap({ financials: { roas_financeiro: 4.0, numero_compradores_reais: 2 } }), financialTruthStatus: 'RELIABLE' });
  assert.notEqual(g.status, 'ELIGIBLE_FOR_SCALE');
});

test('item 80: amostra insuficiente nunca produz scale mesmo com ROAS alto', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap({ financials: { roas_financeiro: 10, numero_compradores_reais: 1 } }), financialTruthStatus: 'RELIABLE' });
  assert.notEqual(g.status, 'ELIGIBLE_FOR_SCALE');
});

test('item 80/PASSO 11.1 item 25: FINANCIAL_TRUTH=BLOCKED bloqueia scale mesmo com economia aparentemente boa', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap(), financialTruthStatus: 'BLOCKED' });
  assert.equal(g.status, 'BLOCKED');
});

test('PASSO 11.1, item 25: FINANCIAL_TRUTH=DEGRADED também bloqueia SCALE (diferente de VALIDATE/MEASURE/FIX, que não dependem disso)', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap(), financialTruthStatus: 'DEGRADED' });
  assert.equal(g.status, 'BLOCKED');
});

test('item 80: evidência sustentável real permite elegibilidade (amostra e ROAS >= target, FINANCIAL_TRUTH RELIABLE)', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap({ financials: { roas_financeiro: 3.5, numero_compradores_reais: MIN_BUYERS_FOR_SCALE } }), financialTruthStatus: 'RELIABLE' });
  assert.equal(g.status, 'ELIGIBLE_FOR_SCALE');
});

test('item 80: marginal_return está preparado (campo presente) mas nunca um número inventado', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap(), financialTruthStatus: 'RELIABLE' });
  assert.equal(g.marginal_return, 'NOT_ESTIMABLE');
});

test('item 80: nenhum teto fixo permanente de mídia — só thresholds de elegibilidade, não um valor máximo de gasto', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap(), financialTruthStatus: 'RELIABLE' });
  assert.equal('max_spend_ceiling' in g, false);
});

test('data quality baixa bloqueia decisão de escala', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap({ period: { data_completeness: 0.4 } }), financialTruthStatus: 'RELIABLE' });
  assert.equal(g.status, 'BLOCKED');
});

test('PROFITABLE (abaixo do target) com amostra mínima é ELIGIBLE_FOR_TEST_SCALE, não SCALE definitivo', () => {
  const g = evaluateScaleGate({ economicsSnapshot: snap({ financials: { roas_financeiro: 1.2, numero_compradores_reais: 10 }, profit_status: 'PROFITABLE' }), financialTruthStatus: 'RELIABLE' });
  assert.equal(g.status, 'ELIGIBLE_FOR_TEST_SCALE');
});

test('integração real: scale_gate reflete o estado real', () => {
  const r = analyzePlan({});
  assert.ok(['NOT_ELIGIBLE', 'BLOCKED', 'UNKNOWN', 'ELIGIBLE_FOR_TEST_SCALE', 'ELIGIBLE_FOR_SCALE'].includes(r.scale_gate.status));
});
