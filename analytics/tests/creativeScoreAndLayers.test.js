'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { diagnosePerformanceLayers, diagnoseMetaConversion, median, LAYERS, ACTIONABLE_LAYERS } = require('../src/creative/performanceLayers');
const { computeCreativeScore, minMaxNormalize, sampleScore, resolveScoreBasis, NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP } = require('../src/creative/score');
const { aggregateCreativeMetrics } = require('../src/creative/metricsAggregator');

function perf(overrides = {}) {
  return { spend: 100, impressions: 1000, clicks: 30, lpv: 20, checkout: 5, meta_purchases: 2, financial_revenue: null,
    ctr: 0.03, cost_per_lpv: 5, lpv_to_checkout_rate: 0.25, checkout_to_meta_purchase_rate: 0.4, meta_cpa: 50, roas_marketing: 1.2, ...overrides };
}

test('performance layers: CTR alto + checkout baixo não é automaticamente "criativo ruim" — camadas ficam separadas', () => {
  const good = perf({ ctr: 0.05, lpv_to_checkout_rate: 0.05 }); // ATTENTION forte, INTENT fraco
  const peers = [good, perf({ ctr: 0.02, lpv_to_checkout_rate: 0.3 })];
  const r = diagnosePerformanceLayers(good, peers);
  assert.equal(r.ATTENTION.classification, 'STRONGER');
  assert.equal(r.INTENT.classification, 'WEAKER');
  assert.notEqual(r.ATTENTION.classification, r.INTENT.classification);
});

test('performance layers: 6 camadas cobertas (5 acionáveis + FINANCIAL_ECONOMICS estrutural)', () => {
  const r = diagnosePerformanceLayers(perf(), [perf()]);
  assert.deepEqual(Object.keys(r).sort(), LAYERS.sort());
  assert.deepEqual(ACTIONABLE_LAYERS.sort(), ['ATTENTION', 'INTENT', 'META_CONVERSION', 'PLATFORM_ECONOMICS', 'TRAFFIC_EFFICIENCY'].sort());
});

test('performance layers: um criativo com CTR maior vence ATTENTION mesmo perdendo em Meta CPA (camadas independentes)', () => {
  const a = perf({ ctr: 0.05, meta_cpa: 80, checkout_to_meta_purchase_rate: 0.2 }); // CTR maior, mas CPA e taxa de conversão piores
  const b = perf({ ctr: 0.02, meta_cpa: 40, checkout_to_meta_purchase_rate: 0.6 }); // CTR menor, mas CPA e taxa melhores
  const peers = [a, b];
  const ra = diagnosePerformanceLayers(a, peers);
  const rb = diagnosePerformanceLayers(b, peers);
  assert.equal(ra.ATTENTION.classification, 'STRONGER'); // vence em CTR
  assert.equal(ra.META_CONVERSION.classification, 'WEAKER'); // perde em Meta CPA
  assert.equal(rb.ATTENTION.classification, 'WEAKER');
});

test('META_CONVERSION: métricas internas conflitantes (checkout_to_meta_purchase_rate x meta_cpa) retornam MIXED', () => {
  const conflicting = perf({ checkout_to_meta_purchase_rate: 0.8, meta_cpa: 90 }); // taxa ótima, CPA ruim
  const peer = perf({ checkout_to_meta_purchase_rate: 0.2, meta_cpa: 30 });
  const r = diagnoseMetaConversion(conflicting, [conflicting, peer]);
  assert.equal(r.classification, 'MIXED');
  assert.equal(r.metrics.checkout_to_meta_purchase_rate.classification, 'STRONGER');
  assert.equal(r.metrics.meta_cpa.classification, 'WEAKER');
});

test('META_CONVERSION: quando as 2 métricas concordam, a camada NÃO vira MIXED', () => {
  const good = perf({ checkout_to_meta_purchase_rate: 0.6, meta_cpa: 30 });
  const bad = perf({ checkout_to_meta_purchase_rate: 0.2, meta_cpa: 90 });
  const r = diagnoseMetaConversion(good, [good, bad]);
  assert.notEqual(r.classification, 'MIXED');
  assert.equal(r.classification, 'STRONGER');
});

test('PLATFORM_ECONOMICS usa roas_marketing como PROXY de mídia — documentado, nunca chamado de financeiro', () => {
  const r = diagnosePerformanceLayers(perf(), [perf()]);
  assert.match(r.PLATFORM_ECONOMICS.note, /PROXY de mídia/);
  assert.match(r.PLATFORM_ECONOMICS.note, /NUNCA é financial_roas/);
});

test('FINANCIAL_ECONOMICS: permanece NOT_ATTRIBUTABLE sempre, nunca calculado, nunca confundido com Meta Purchase', () => {
  const r = diagnosePerformanceLayers(perf(), [perf()]);
  assert.equal(r.FINANCIAL_ECONOMICS.classification, 'NOT_ATTRIBUTABLE');
  assert.equal(r.FINANCIAL_ECONOMICS.value, null);
  assert.match(r.FINANCIAL_ECONOMICS.note, /NUNCA deve ser tratado como buyer financeiro/);
});

test('PLATFORM_ECONOMICS e FINANCIAL_ECONOMICS são camadas SEPARADAS e independentes', () => {
  const r = diagnosePerformanceLayers(perf(), [perf()]);
  assert.notEqual(r.PLATFORM_ECONOMICS.classification, r.FINANCIAL_ECONOMICS.classification);
  assert.ok('PLATFORM_ECONOMICS' in r && 'FINANCIAL_ECONOMICS' in r);
});

test('performance layers: sem peer group -> INSUFFICIENT_DATA, nunca finge classificação', () => {
  const r = diagnosePerformanceLayers(perf(), []);
  assert.equal(r.ATTENTION.classification, 'INSUFFICIENT_DATA');
});

test('median: cálculo correto para conjuntos pares e ímpares', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('creative score: score_basis é PLATFORM_ONLY quando não há atribuição financeira (caso real hoje)', () => {
  const r = computeCreativeScore(perf(), [perf(), perf({ ctr: 0.01 })], true);
  assert.equal(r.score_basis, 'PLATFORM_ONLY');
});

test('creative score: amostra insuficiente -> score_basis=INSUFFICIENT, creative_score null, nunca calcula com dado de menos', () => {
  const r = computeCreativeScore(perf(), [], false);
  assert.equal(r.score_basis, 'INSUFFICIENT');
  assert.equal(r.creative_score, null);
  assert.equal(r.score_confidence, 0);
});

test('creative score: componente inexistente (null) é excluído e os pesos são redistribuídos, nunca quebra', () => {
  const noRoas = perf({ roas_marketing: null });
  const r = computeCreativeScore(noRoas, [noRoas, perf()], true);
  assert.equal(Number.isFinite(r.creative_score), true);
  assert.equal(r.components.economics, null);
});

test('creative score: score_confidence SEMPRE capada quando score_basis=PLATFORM_ONLY (sem atribuição financeira)', () => {
  const r = computeCreativeScore(perf(), [perf(), perf({ ctr: 0.01 })], true);
  assert.ok(r.score_confidence <= NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP);
  assert.match(r.confidence_reason, /score_basis=PLATFORM_ONLY/);
});

test('creative score: sample size baixo reduz o score_confidence mesmo com métricas de mídia boas', () => {
  const lowSample = perf({ lpv: 3, checkout: 1 });
  const highSample = perf({ lpv: 90, checkout: 15 });
  const rLow = computeCreativeScore(lowSample, [lowSample, highSample], true);
  const rHigh = computeCreativeScore(highSample, [lowSample, highSample], true);
  assert.ok(rLow.score_confidence < rHigh.score_confidence);
});

test('resolveScoreBasis: FINANCIAL_AND_PLATFORM só quando há atribuição financeira E dado de mídia', () => {
  assert.equal(resolveScoreBasis({ sampleSufficient: true, hasFinancialAttribution: true, hasPlatformData: true }), 'FINANCIAL_AND_PLATFORM');
  assert.equal(resolveScoreBasis({ sampleSufficient: true, hasFinancialAttribution: false, hasPlatformData: true }), 'PLATFORM_ONLY');
  assert.equal(resolveScoreBasis({ sampleSufficient: false, hasFinancialAttribution: true, hasPlatformData: true }), 'INSUFFICIENT');
});

test('sampleScore: satura em 100 quando volume >= 3x o minimum_evidence', () => {
  assert.equal(sampleScore({ lpv: 90, checkout: 15 }), 100);
  assert.ok(sampleScore({ lpv: 0, checkout: 0 }) < 100);
});

test('minMaxNormalize: inverte corretamente quando "menor é melhor" (ex: cost_per_lpv)', () => {
  const values = [1, 2, 3];
  assert.equal(minMaxNormalize(1, values, false), 100);
  assert.equal(minMaxNormalize(3, values, false), 0);
});

test('minMaxNormalize: grupo com valor único (min==max) vira 100 — nada pra comparar', () => {
  assert.equal(minMaxNormalize(5, [5, 5], true), 100);
});

test('atribuição financeira: NUNCA inventada por criativo — financial_buyers/revenue/roas sempre null, com explicação explícita', () => {
  const results = aggregateCreativeMetrics(['2026-08-25']);
  for (const r of results) {
    assert.equal(r.performance.financial_buyers, null);
    assert.equal(r.performance.financial_revenue, null);
    assert.equal(r.performance.financial_roas, null);
    assert.match(r.performance.financial_attribution, /NOT_AVAILABLE/);
  }
});

test('Meta Purchase != financial buyer: meta_purchases é um campo distinto, nunca confundido com financial_buyers', () => {
  const results = aggregateCreativeMetrics(['2026-08-25']);
  const withMetaPurchase = results.find((r) => r.performance.meta_purchases > 0);
  assert.ok(withMetaPurchase, 'esperava pelo menos 1 criativo com meta_purchases > 0 em 2026-08-25 nos dados reais');
  assert.notEqual(withMetaPurchase.performance.meta_purchases, undefined);
  assert.equal(withMetaPurchase.performance.financial_buyers, null);
});
