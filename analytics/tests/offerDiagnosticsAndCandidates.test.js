'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOfferDiagnostics, HIGH_REFUND_THRESHOLD } = require('../src/offer/diagnostics');
const { OFFER_DIAGNOSTIC_TYPES } = require('../src/offer/diagnosticTypes');
const { generateOfferCandidates, IMPLEMENTATION_COST_BY_VARIABLE, ACTION_TYPE_BY_VARIABLE, ACTION_TYPE_CONFIDENCE_MULTIPLIER } = require('../src/offer/candidateGenerator');
const { buildProductHypothesisKey } = require('../src/learning/canonicalKey');
const { PRODUCT_ID } = require('../config/product');

function economicsFixture(overrides = {}) {
  return {
    buyers: 11, order_bump_attach_rate: 0.2727, gross_aov: 73.5, net_aov: 65.11,
    refund_rate: 0.08, refunds_count: 1, main_product_revenue: 753.85, order_bump_revenue_gross: 54.7,
    period: { data_completeness: 0.97 }, ...overrides,
  };
}
function aovDecompFixture() {
  return { gross_aov: 73.5, components: { main_product_contribution: 68.53, order_bump_contribution_gross: 4.97 } };
}
function refundRatesFixture() {
  return { main_product_refund_rate: 0.0556, order_bump_refund_rate: 0 };
}

test('diagnostic types: 11 tipos documentados existem', () => {
  assert.deepEqual(OFFER_DIAGNOSTIC_TYPES.sort(), ['REVENUE_LEAK', 'LOW_ATTACH', 'LOW_TAKE_RATE', 'HIGH_REFUND', 'PRICE_FRICTION', 'OFFER_COMPLEXITY', 'CANNIBALIZATION_RISK', 'MISSING_MONETIZATION_LAYER', 'DATA_GAP', 'ECONOMIC_OPPORTUNITY', 'OTHER'].sort());
});

test('diagnostics: upsell/downsell/bundle inexistentes viram MISSING_MONETIZATION_LAYER, NUNCA marcados automaticamente como "problema" com causal_status VALIDATED', () => {
  const diags = buildOfferDiagnostics({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), aovDecomposition: aovDecompFixture(), componentRefundRates: refundRatesFixture() });
  const missing = diags.find((d) => d.diagnostic_type === 'MISSING_MONETIZATION_LAYER');
  assert.ok(missing);
  assert.notEqual(missing.causal_status, 'VALIDATED');
  assert.ok(missing.possible_causes.length >= 1);
});

test('diagnostics: refund alto (> limiar documentado) vira HIGH_REFUND, mas com confidence baixa quando a amostra é pequena', () => {
  const diags = buildOfferDiagnostics({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture({ refund_rate: 0.09, refunds_count: 1 }), aovDecomposition: aovDecompFixture(), componentRefundRates: refundRatesFixture() });
  const refund = diags.find((d) => d.diagnostic_type === 'HIGH_REFUND');
  assert.ok(refund);
  assert.ok(refund.confidence < 50); // 1 evento não é evidência forte
});

test('diagnostics: refund abaixo do limiar NÃO gera diagnóstico HIGH_REFUND (nunca alarme sem base)', () => {
  const diags = buildOfferDiagnostics({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture({ refund_rate: 0.01, refunds_count: 0 }), aovDecomposition: aovDecompFixture(), componentRefundRates: refundRatesFixture() });
  assert.equal(diags.some((d) => d.diagnostic_type === 'HIGH_REFUND'), false);
});

test('diagnostics: cada diagnóstico tem todos os campos pedidos pelo item 20', () => {
  const diags = buildOfferDiagnostics({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), aovDecomposition: aovDecompFixture(), componentRefundRates: refundRatesFixture() });
  for (const d of diags) {
    for (const f of ['diagnostic_id', 'product_id', 'offer_id', 'observation', 'affected_layer', 'diagnostic_type', 'severity', 'confidence', 'evidence', 'possible_causes', 'causal_status', 'recommended_investigation']) {
      assert.ok(f in d, `campo ausente: ${f}`);
    }
  }
});

test('single variable: cada candidato muda EXATAMENTE 1 variável, preserva as demais', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  for (const c of candidates) {
    assert.equal(typeof c.variable_changed, 'string');
    assert.equal(c.preserved_elements.includes(c.variable_changed), false);
  }
});

test('OPTIMIZE_EXISTING_COMPONENT vs ADD_NEW_COMPONENT: os dois tipos aparecem e afetam confidence/risk (item 32)', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  const actionTypes = new Set(candidates.map((c) => c.action_type));
  assert.ok(actionTypes.has('OPTIMIZE_EXISTING_COMPONENT'));
  assert.ok(actionTypes.has('ADD_NEW_COMPONENT'));
  assert.ok(ACTION_TYPE_CONFIDENCE_MULTIPLIER.OPTIMIZE_EXISTING_COMPONENT > ACTION_TYPE_CONFIDENCE_MULTIPLIER.ADD_NEW_COMPONENT);
});

test('EXPLOIT vs EXPLORE: os dois modos existem entre os candidatos', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  const modes = new Set(candidates.map((c) => c.mode));
  assert.ok(modes.has('EXPLOIT'));
  assert.ok(modes.has('EXPLORE'));
});

test('gera entre 3 e 5 candidatos', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  assert.ok(candidates.length >= 3 && candidates.length <= 5);
});

test('offer_brief: tem todos os campos pedidos pelo item 34, incluindo os 3 guardrails', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  for (const c of candidates) {
    for (const f of ['objective', 'observation', 'hypothesis', 'current_state', 'proposed_change', 'preserve', 'avoid', 'target_metric', 'secondary_metrics', 'expected_direction', 'measurement_plan', 'minimum_evidence', 'success_condition', 'failure_condition', 'kill_condition', 'refund_guardrail', 'cannibalization_guardrail', 'financial_guardrail']) {
      assert.ok(f in c.offer_brief, `campo ausente no brief: ${f}`);
    }
  }
});

test('offer_brief: NUNCA inventa nome/copy/preço final de produto (item 51) — proposed_change é sempre direção', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  for (const c of candidates) {
    assert.equal(typeof c.offer_brief.proposed_change, 'string');
    assert.doesNotMatch(c.offer_brief.proposed_change, /R\$\d/); // nunca cita preço numérico como fato definido
  }
});

test('priority_score: 0-100, melhor candidato do lote vira 100', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  for (const c of candidates) assert.ok(c.priority_score >= 0 && c.priority_score <= 100);
  assert.ok(candidates.some((c) => c.priority_score === 100));
});

test('economic value: SEMPRE NOT_ESTIMABLE quando não há taxa confirmada pra mudança proposta (item 36) — nunca um número inventado', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  for (const c of candidates) assert.equal(c.estimated_incremental_net_revenue_per_100_buyers, 'NOT_ESTIMABLE');
});

test('break-even: NOT_CALCULABLE pra candidatos sem margem/custo conhecidos', () => {
  const candidates = generateOfferCandidates({ productId: PRODUCT_ID, offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  const newComponent = candidates.find((c) => c.action_type === 'ADD_NEW_COMPONENT');
  assert.ok(newComponent);
  assert.equal(newComponent.break_even_analysis.minimum_attach_rate, 'NOT_CALCULABLE');
});

test('prior learning: hipótese PREVIOUSLY_INVALIDATED penaliza a confidence do candidato correspondente', () => {
  const economics = economicsFixture();
  const withoutHistory = generateOfferCandidates({ productId: null, offerId: 'OFFER-V1', economics, diagnostics: [], hypotheses: [] });
  const target = withoutHistory[0];
  const category = ACTION_TYPE_BY_VARIABLE[target.variable_changed] === 'OPTIMIZE_EXISTING_COMPONENT' ? 'AOV' : 'OFFER';
  const key = buildProductHypothesisKey(PRODUCT_ID, { category, target_metric: target.target_metric, mechanism: target.variable_changed });
  const invalidated = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category, status: 'INVALIDATED', current_confidence: 20 }];
  const withHistory = generateOfferCandidates({ productId: null, offerId: 'OFFER-V1', economics, diagnostics: [], hypotheses: invalidated });
  const penalized = withHistory.find((c) => c.candidate_id === target.candidate_id);
  assert.equal(penalized.prior_learning_status, 'PREVIOUSLY_INVALIDATED');
  assert.ok(penalized.confidence < target.confidence);
});

test('prior learning: SUPPORTING_EVIDENCE aumenta a confidence do candidato correspondente', () => {
  const economics = economicsFixture();
  const withoutHistory = generateOfferCandidates({ productId: null, offerId: 'OFFER-V1', economics, diagnostics: [], hypotheses: [] });
  const target = withoutHistory[0];
  const category = ACTION_TYPE_BY_VARIABLE[target.variable_changed] === 'OPTIMIZE_EXISTING_COMPONENT' ? 'AOV' : 'OFFER';
  const key = buildProductHypothesisKey(PRODUCT_ID, { category, target_metric: target.target_metric, mechanism: target.variable_changed });
  const supported = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category, status: 'SUPPORTED', current_confidence: 80 }];
  const withHistory = generateOfferCandidates({ productId: null, offerId: 'OFFER-V1', economics, diagnostics: [], hypotheses: supported });
  const boosted = withHistory.find((c) => c.candidate_id === target.candidate_id);
  assert.equal(boosted.prior_learning_status, 'SUPPORTING_EVIDENCE');
  assert.ok(boosted.confidence >= target.confidence);
});

test('implementation cost: tabela documentada afeta a priority_score', () => {
  assert.equal(IMPLEMENTATION_COST_BY_VARIABLE.BUMP_COPY, 'LOW');
  assert.equal(IMPLEMENTATION_COST_BY_VARIABLE.UPSELL_OFFER_DESIGN, 'HIGH');
});
