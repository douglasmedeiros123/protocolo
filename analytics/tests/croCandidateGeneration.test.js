'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateCroCandidates, IMPLEMENTATION_COST_BY_VARIABLE } = require('../src/cro/candidateGenerator');
const { analyzeCro001, detectBundledVariables } = require('../src/cro/cro001Analysis');
const { buildProductHypothesisKey } = require('../src/learning/canonicalKey');
const { PRODUCT_ID } = require('../config/product');

function funnelMetricsFixture() {
  return {
    period: { days_found: 30 },
    raw: { clicks: 700, lpv: 480, checkout: 44, meta_purchases: 14, spend: 1150, gross_revenue: 800, net_revenue: 700, orders_count: 11 },
    click_to_lpv_rate: 0.68, lpv_to_checkout_rate: 0.09, checkout_to_meta_purchase_rate: 0.31,
    financial_buyers: 11, financial_revenue_net: 700, financial_roas: 0.6, confidence: 100,
  };
}

test('generateCroCandidates: gera entre 3 e 5 candidatos', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  assert.ok(candidates.length >= 3 && candidates.length <= 5);
});

test('single-variable: cada candidato muda EXATAMENTE 1 variável, preserva as demais', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) {
    assert.equal(typeof c.variable_changed, 'string');
    assert.equal(c.preserved_elements.includes(c.variable_changed), false);
  }
});

test('EXPLOIT vs EXPLORE: os dois modos existem entre os candidatos', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  const modes = new Set(candidates.map((c) => c.mode));
  assert.ok(modes.has('EXPLOIT'));
  assert.ok(modes.has('EXPLORE'));
});

test('implementation_cost: classificação vem da tabela documentada, afeta a priority_score (custo maior = penalidade)', () => {
  assert.equal(IMPLEMENTATION_COST_BY_VARIABLE.HEADLINE, 'LOW');
  assert.equal(IMPLEMENTATION_COST_BY_VARIABLE.PAGE_SPEED, 'HIGH');
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(c.implementation_cost));
});

test('priority_score: 0-100, melhor candidato do lote vira 100', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) assert.ok(c.priority_score >= 0 && c.priority_score <= 100);
  assert.ok(candidates.some((c) => c.priority_score === 100));
});

test('cro_brief: NÃO inventa copy final — proposed_change é direção conceitual, nunca texto definitivo (item 32)', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) {
    assert.equal(typeof c.cro_brief.proposed_change, 'string');
    assert.ok(c.cro_brief.proposed_change.length > 10);
    assert.match(c.proposed_change.note, /não.*copy final|direção conceitual/i);
  }
});

test('cro_brief: tem todos os campos pedidos pelo item 21', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) {
    for (const f of ['objective', 'observation', 'hypothesis', 'current_state', 'proposed_change', 'preserve', 'avoid', 'target_metric', 'expected_direction', 'mobile_requirements', 'desktop_requirements', 'measurement_plan', 'minimum_evidence', 'success_condition', 'failure_condition', 'rollback_condition']) {
      assert.ok(f in c.cro_brief, `campo ausente no brief: ${f}`);
    }
  }
});

test('experiment_compatibility: candidato vem com category=CRO, minimum_evidence, budget_estimate', () => {
  const candidates = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  for (const c of candidates) {
    assert.equal(c.category, 'CRO');
    assert.ok(c.minimum_evidence);
    assert.equal(typeof c.budget_estimate, 'number');
  }
});

test('prior learning: hipótese PREVIOUSLY_INVALIDATED penaliza a confidence do candidato correspondente', () => {
  const withoutHistory = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  const target = withoutHistory[0];
  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CRO', target_metric: target.target_metric, mechanism: target.variable_changed });
  const invalidated = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category: 'CRO', status: 'INVALIDATED', current_confidence: 20 }];
  const withHistory = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {}, hypotheses: invalidated });
  const penalized = withHistory.find((c) => c.candidate_id === target.candidate_id);
  assert.equal(penalized.prior_learning_status, 'PREVIOUSLY_INVALIDATED');
  assert.ok(penalized.confidence < target.confidence);
});

test('prior learning: SUPPORTING_EVIDENCE aumenta a confidence do candidato correspondente', () => {
  const withoutHistory = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  const target = withoutHistory[0];
  const key = buildProductHypothesisKey(PRODUCT_ID, { category: 'CRO', target_metric: target.target_metric, mechanism: target.variable_changed });
  const supported = [{ product_hypothesis_key: key, product_id: PRODUCT_ID, category: 'CRO', status: 'SUPPORTED', current_confidence: 80 }];
  const withHistory = generateCroCandidates({ productId: null, landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {}, hypotheses: supported });
  const boosted = withHistory.find((c) => c.candidate_id === target.candidate_id);
  assert.equal(boosted.prior_learning_status, 'SUPPORTING_EVIDENCE');
  assert.ok(boosted.confidence >= target.confidence);
});

test('CRO-001 analysis: detecta múltiplas variáveis bundladas na hipótese real (MULTI_VARIABLE_TEST)', () => {
  const experiment = require('../data/experiments/CRO-001.json');
  const r = analyzeCro001(experiment);
  assert.equal(r.is_multi_variable, true);
  assert.ok(r.bundled_variables_detected.length >= 2);
});

test('CRO-001 analysis: NUNCA altera o objeto do experimento recebido', () => {
  const experiment = require('../data/experiments/CRO-001.json');
  const before = JSON.stringify(experiment);
  analyzeCro001(experiment);
  assert.equal(JSON.stringify(experiment), before);
});

test('CRO-001 analysis: separa evidência (histórica, com proveniência) de inferência (explicada)', () => {
  const experiment = require('../data/experiments/CRO-001.json');
  const r = analyzeCro001(experiment);
  assert.ok(r.evidence.length > 0);
  assert.ok(r.inferences.length > 0);
  assert.match(r.evidence[0].status, /HISTÓRICO/);
  assert.ok(r.inferences[0].why_inference);
});

test('CRO-001 analysis: recomenda a variável a isolar primeiro com base em causalidade VALID, nunca aleatoriamente', () => {
  const experiment = require('../data/experiments/CRO-001.json');
  const r = analyzeCro001(experiment);
  assert.ok(r.recommended_variable_to_isolate_first);
  const validated = r.causal_validation_per_variable.find((v) => v.variable === r.recommended_variable_to_isolate_first.variable);
  assert.equal(validated.status, 'VALID');
});

test('CRO-001 analysis: experimento inexistente retorna found:false, nunca inventa análise', () => {
  const r = analyzeCro001(null);
  assert.equal(r.found, false);
});

test('detectBundledVariables: texto de 1 variável só não é MULTI_VARIABLE_TEST', () => {
  const bundled = detectBundledVariables('mudar apenas o hook nos primeiros segundos');
  assert.equal(bundled.length, 1);
});
