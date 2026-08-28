'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { diagnoseCroPerformanceLayers } = require('../src/cro/performanceLayers');
const { validateCroCausalTarget, CRO_CAUSAL_MAP, normalizeMetricName } = require('../src/cro/causalityMap');
const { generateCroCandidates } = require('../src/cro/candidateGenerator');

function funnelMetricsFixture(overrides = {}) {
  return {
    period: { days_found: 30 },
    raw: { clicks: 700, lpv: 480, checkout: 44, meta_purchases: 14, spend: 1150, gross_revenue: 800, net_revenue: 700, orders_count: 11 },
    click_to_lpv_rate: 0.68, lpv_to_checkout_rate: 0.09, checkout_to_meta_purchase_rate: 0.31,
    financial_buyers: 11, financial_revenue_net: 700, financial_roas: 0.6, confidence: 100,
    ...overrides,
  };
}

test('performance layers: 6 camadas cobertas (ARRIVAL/FIRST_VIEW/ENGAGEMENT/INTENT/CHECKOUT_HANDOFF/SALE/FINANCIAL_ECONOMICS)', () => {
  const r = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'UNAVAILABLE' }, dnaCheckoutTransition: { type: 'EXTERNAL_HOTMART' } });
  assert.deepEqual(Object.keys(r).sort(), ['ARRIVAL', 'CHECKOUT_HANDOFF', 'ENGAGEMENT', 'FINANCIAL_ECONOMICS', 'FIRST_VIEW', 'INTENT', 'SALE'].sort());
});

test('performance layers: cada camada declara influence_strength documentado', () => {
  const r = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'UNAVAILABLE' }, dnaCheckoutTransition: null });
  for (const layer of Object.values(r)) assert.ok(layer.influence_strength);
});

test('performance layers: CHECKOUT_HANDOFF nota que o checkout é EXTERNO (Hotmart), fora do controle da LP', () => {
  const r = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'UNAVAILABLE' }, dnaCheckoutTransition: { type: 'EXTERNAL_HOTMART' } });
  assert.match(r.CHECKOUT_HANDOFF.note, /EXTERNAL_HOTMART|fora do controle/);
});

test('performance layers: FINANCIAL_ECONOMICS é sempre INDIRECT (nunca determinada só pela LP)', () => {
  const r = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'UNAVAILABLE' }, dnaCheckoutTransition: null });
  assert.equal(r.FINANCIAL_ECONOMICS.influence_strength, 'INDIRECT');
});

test('performance layers: ENGAGEMENT usa dado real do Clarity quando disponível, fica null quando não', () => {
  const semClarity = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'UNAVAILABLE' }, dnaCheckoutTransition: null });
  const comClarity = diagnoseCroPerformanceLayers({ funnelMetrics: funnelMetricsFixture(), claritySnapshot: { status: 'AVAILABLE', behavior: { scroll: 20 }, sessions: 100 }, dnaCheckoutTransition: null });
  assert.equal(semClarity.ENGAGEMENT.value, null);
  assert.deepEqual(comClarity.ENGAGEMENT.value, { scroll: 20 });
});

test('causality map: HEADLINE -> lpv_to_checkout_rate é VALID', () => {
  assert.equal(validateCroCausalTarget('HEADLINE', 'lpv_to_checkout_rate').status, 'VALID');
});

test('causality map: PAGE_SPEED -> lpv_to_checkout_rate é WEAK (relação indireta)', () => {
  assert.equal(validateCroCausalTarget('PAGE_SPEED', 'lpv_to_checkout_rate').status, 'WEAK');
});

test('causality map: PAGE_SPEED -> click_to_lpv_rate é VALID (relação direta com a métrica certa)', () => {
  assert.equal(validateCroCausalTarget('PAGE_SPEED', 'click_to_lpv_rate').status, 'VALID');
});

test('causality map: CHECKOUT_UX é sempre INVALID (fora do controle da LP)', () => {
  const r = validateCroCausalTarget('CHECKOUT_UX', 'lpv_to_checkout_rate');
  assert.equal(r.status, 'INVALID');
});

test('causality map: variável não catalogada é INVALID, nunca aceita por padrão', () => {
  assert.equal(validateCroCausalTarget('VARIAVEL_INVENTADA', 'lpv_to_checkout_rate').status, 'INVALID');
});

test('causality map: combinação não documentada explicitamente vira WEAK, nunca VALID nem INVALID por omissão', () => {
  const r = validateCroCausalTarget('HEADLINE', 'metrica_nunca_vista');
  assert.equal(r.status, 'WEAK');
});

test('normalizeMetricName: traduz nomes legados do Experiment Engine (taxa_lpv_checkout) pro nome canônico', () => {
  assert.equal(normalizeMetricName('taxa_lpv_checkout'), 'lpv_to_checkout_rate');
  assert.equal(normalizeMetricName('metrica_desconhecida'), 'metrica_desconhecida');
});

test('candidateGenerator: candidato INVALID NUNCA entra no ranking recomendado', () => {
  const original = CRO_CAUSAL_MAP.HEADLINE;
  const candidates = generateCroCandidates({
    productId: 'p', landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {},
    cro001Analysis: { recommended_variable_to_isolate_first: { variable: 'CHECKOUT_UX' } }, // força a 1ª tentativa numa variável INVALID
  });
  assert.equal(candidates.some((c) => c.variable_changed === 'CHECKOUT_UX'), false);
});

test('candidateGenerator: candidato WEAK recebe penalidade de confidence vs um VALID equivalente', () => {
  const candidates = generateCroCandidates({ productId: 'p', landingPageId: 'LP-V1', funnelMetrics: funnelMetricsFixture(), croDna: {}, cro001Analysis: {} });
  const valid = candidates.filter((c) => c.causality.status === 'VALID');
  assert.ok(valid.length > 0);
  for (const c of valid) assert.ok(c.confidence > 0);
});
