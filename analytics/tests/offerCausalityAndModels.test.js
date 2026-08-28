'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateOfferCausalTarget, normalizeMetricName, resolveCausalDistance } = require('../src/offer/causalityMap');
const { modelBundleCannibalization } = require('../src/offer/cannibalization');
const { simulateBumpStrategy, PLANNED_BUMP_PRICE_DEFAULT } = require('../src/offer/bumpStrategyModel');
const { simulateUpsellDownsellTree } = require('../src/offer/upsellDownsellModel');
const { computeMinimumAttachRateForPositiveIncrementalValue } = require('../src/offer/breakEven');
const { generateOfferCandidates } = require('../src/offer/candidateGenerator');

function economicsFixture() {
  return { buyers: 11, order_bump_attach_rate: 0.27, gross_aov: 73.5, net_aov: 65.1, refund_rate: 0.02, period: { data_completeness: 0.97 } };
}

test('causality: BUMP_PRICE -> bump_attach_rate é VALID', () => {
  assert.equal(validateOfferCausalTarget('BUMP_PRICE', 'bump_attach_rate').status, 'VALID');
});

test('causality: BUNDLE_DISCOUNT -> ctr é sempre INVALID (fora do controle da economia da oferta)', () => {
  assert.equal(validateOfferCausalTarget('BUNDLE_DISCOUNT', 'ctr').status, 'INVALID');
});

test('causality: GUARANTEE -> refund_rate é WEAK (documentado como dependente de contexto, item 18)', () => {
  assert.equal(validateOfferCausalTarget('GUARANTEE', 'refund_rate').status, 'WEAK');
});

test('causality: variável não catalogada é INVALID por padrão', () => {
  assert.equal(validateOfferCausalTarget('VARIAVEL_INVENTADA', 'net_aov').status, 'INVALID');
});

test('causality: normalizeMetricName traduz nomes legados (order_bump_attach_rate, aov_liquido)', () => {
  assert.equal(normalizeMetricName('order_bump_attach_rate'), 'bump_attach_rate');
  assert.equal(normalizeMetricName('aov_liquido'), 'net_aov');
});

test('DIRECT vs INDIRECT: métrica do próprio componente é DIRECT, métrica agregada (financial_roas) é sempre INDIRECT (item 19)', () => {
  assert.equal(resolveCausalDistance('bump_attach_rate'), 'DIRECT');
  assert.equal(resolveCausalDistance('financial_roas'), 'INDIRECT');
});

test('causality: candidato INVALID nunca entra no ranking (filtrado em buildCandidate)', () => {
  const candidates = generateOfferCandidates({ productId: 'p', offerId: 'OFFER-V1', economics: economicsFixture(), diagnostics: [], hypotheses: [] });
  assert.equal(candidates.some((c) => c.causality.status === 'INVALID'), false);
});

test('bundle cannibalization: sem taxas informadas -> NOT_ESTIMABLE, nunca inventa número', () => {
  const r = modelBundleCannibalization({});
  assert.equal(r.cannibalization_rate, 'NOT_ESTIMABLE');
  assert.equal(r.net_incremental_effect, 'NOT_ESTIMABLE');
});

test('bundle cannibalization: com taxas informadas, calcula efeito líquido e cannibalization_rate — rotulado SCENARIO_NOT_FORECAST', () => {
  const r = modelBundleCannibalization({
    individualBumpPrices: [29, 29, 29], individualAttachRatesWithoutBundle: [0.15, 0.10, 0.08],
    bundlePrice: 43.5, bundleAttachRateIfOffered: 0.20, individualAttachRatesWithBundle: [0.02, 0.02, 0.02],
  });
  assert.equal(r.status, 'SCENARIO_NOT_FORECAST');
  assert.equal(typeof r.net_incremental_effect, 'number');
});

test('bundle cannibalization: NUNCA assume que bundle melhora AOV automaticamente — pode dar efeito negativo', () => {
  const r = modelBundleCannibalization({
    individualBumpPrices: [29, 29, 29], individualAttachRatesWithoutBundle: [0.30, 0.30, 0.30], // attach individual já alto
    bundlePrice: 43.5, bundleAttachRateIfOffered: 0.20, individualAttachRatesWithBundle: [0, 0, 0], // bundle substitui totalmente
  });
  assert.ok(r.net_incremental_effect < 0);
  assert.match(r.interpretation, /NEGATIVO/);
});

test('bump strategy model: R$29 é só PARÂMETRO DE SIMULAÇÃO — status deixa claro que nada está ACTIVE', () => {
  const r = simulateBumpStrategy({});
  assert.equal(PLANNED_BUMP_PRICE_DEFAULT, 29);
  assert.deepEqual(r.bump_prices, [29, 29, 29]);
  assert.match(r.status, /PLANNED_ARCHITECTURE/);
  assert.match(r.status, /nenhum destes bumps está ACTIVE/);
});

test('bump strategy model: sem attach rates informados -> NOT_ESTIMABLE, nunca inventa taxa', () => {
  const r = simulateBumpStrategy({});
  assert.equal(r.revenue_per_buyer_estimate, 'NOT_ESTIMABLE');
});

test('bump strategy model: com attach rates informados, simula e reporta cannibalization model', () => {
  const r = simulateBumpStrategy({ individualAttachRates: [0.1, 0.1, 0.1], bundleDiscountPercent: 0.5, bundleAttachRateIfOffered: 0.15 });
  assert.equal(typeof r.individual_only_revenue_per_buyer_estimate, 'number');
  assert.ok(r.bundle_cannibalization_model);
  assert.equal(r.status, 'SCENARIO_NOT_FORECAST');
});

test('upsell/downsell model: sem preço/take rate -> null, NUNCA um benchmark inventado', () => {
  const r = simulateUpsellDownsellTree({});
  assert.equal(r.tree.upsell_offer.revenue_per_buyer, null);
  assert.equal(r.total_post_purchase_revenue_per_buyer, 'NOT_ESTIMABLE');
});

test('upsell/downsell model: árvore não conta em dobro — downsell1 só alcança quem rejeitou o upsell', () => {
  const r = simulateUpsellDownsellTree({ upsellPrice: 97, upsellTakeRate: 0.10, downsell1Price: 47, downsell1TakeRate: 0.20 });
  assert.equal(r.tree.downsell_1.reached_share, 0.90); // 1 - upsellTakeRate
  assert.match(r.no_double_counting, /NO MÁXIMO 1 caminho/);
});

test('upsell/downsell model: downsell2 só alcança quem rejeitou upsell E downsell1 (sem dupla contagem em cascata)', () => {
  const r = simulateUpsellDownsellTree({ upsellPrice: 97, upsellTakeRate: 0.10, downsell1Price: 47, downsell1TakeRate: 0.20, downsell2Price: 27, downsell2TakeRate: 0.30 });
  const expectedReach = 0.9 * 0.8; // rejeitou upsell (0.9) E rejeitou downsell1 (0.8 de quem chegou lá)
  assert.equal(r.tree.downsell_2.reached_share, expectedReach);
});

test('break-even: sem custo/margem conhecidos -> NOT_CALCULABLE, nunca um número inventado', () => {
  const r = computeMinimumAttachRateForPositiveIncrementalValue({ componentPrice: 29, componentCostIfKnown: null });
  assert.equal(r.minimum_attach_rate, 'NOT_CALCULABLE');
});

test('break-even: com preço e custo conhecidos, calcula minimum_attach_rate real', () => {
  const r = computeMinimumAttachRateForPositiveIncrementalValue({ componentPrice: 29, componentCostIfKnown: 10, fixedImplementationCost: 19 });
  assert.equal(r.minimum_attach_rate, 1); // 19 / (29-10) = 1.0
});
