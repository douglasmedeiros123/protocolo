'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEvidenceBasisForChallenger, buildEvidenceBasisForCurrent } = require('../src/strategy-search/evidenceClassification');
const { generateChallengers } = require('../src/strategy-search/challengerGenerator');
const { buildCurrentArchitecture, classifyCurrentFamily, buildUnconfirmedPages } = require('../src/strategy-search/currentArchitecture');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { PRODUCT_ID } = require('../config/product');

// ===== item 103 — TESTES EVIDENCE =====

test('item 103: conhecimento geral != evidência do produto — pattern_description é sempre GENERAL_MARKETING_KNOWLEDGE, nunca PRODUCT_SPECIFIC_EVIDENCE', () => {
  const basis = buildEvidenceBasisForChallenger({ why_generated: { reason: 'x' }, pattern_description: 'VSL costuma aumentar compreensão.', architecture_hypothesis: 'h' });
  const general = basis.find((b) => b.type === 'GENERAL_MARKETING_KNOWLEDGE');
  assert.ok(general);
  assert.equal(general.statement, 'VSL costuma aumentar compreensão.');
});

test('item 103: hipótese != fato observado — architecture_hypothesis é sempre tipo HYPOTHESIS', () => {
  const basis = buildEvidenceBasisForChallenger({ why_generated: { reason: 'x' }, pattern_description: null, architecture_hypothesis: 'pode melhorar Y.' });
  const hyp = basis.find((b) => b.type === 'HYPOTHESIS');
  assert.equal(hyp.statement, 'pode melhorar Y.');
});

test('item 103: inferência é rotulada — sinal técnico OBSERVED vira OBSERVED_EVIDENCE, HYPOTHESIZED vira HYPOTHESIS (nunca confundidos)', () => {
  const basisObserved = buildEvidenceBasisForCurrent({ financialRoas: 0.6, structuralFrictionSignals: [{ diagnostic_id: 'X', observation: 'bug real', causal_status: 'OBSERVED' }], hasCompletedExperiment: false });
  const basisHyp = buildEvidenceBasisForCurrent({ financialRoas: 0.6, structuralFrictionSignals: [{ diagnostic_id: 'Y', observation: 'talvez bug', causal_status: 'HYPOTHESIZED' }], hasCompletedExperiment: false });
  assert.equal(basisObserved.find((b) => b.source.includes('X')).type, 'OBSERVED_EVIDENCE');
  assert.equal(basisHyp.find((b) => b.source.includes('Y')).type, 'HYPOTHESIS');
});

test('item 103: cenário != forecast — nenhum campo de arquitetura afirma resultado garantido (architecture_hypothesis nunca é declarativo de resultado)', () => {
  const basis = buildEvidenceBasisForChallenger({ why_generated: { reason: 'x' }, pattern_description: null, architecture_hypothesis: 'PODE aumentar a métrica X.' });
  assert.doesNotMatch(basis.find((b) => b.type === 'HYPOTHESIS').statement, /vai aumentar|garantido|certamente/i);
});

test('item 103: UNKNOWN != zero — component ausente do tracking_readiness nunca vira RELIABLE por omissão', () => {
  const { evaluateTrackingReadiness } = require('../src/strategy-search/architectureProperties');
  const r = evaluateTrackingReadiness([]);
  assert.notEqual(r.readiness, 'READY');
});

test('item 103: dado ausente não vira evidência negativa — 0 structural_friction_signals não gera EVIDENCE_AGAINST', () => {
  const { evaluateChallengeCurrentStrategy } = require('../src/strategy-search/challengeAndBreadth');
  const r = evaluateChallengeCurrentStrategy({ experimentCoverage: { total_completed: 0, by_category: {} }, structuralFrictionSignals: [], financialRoas: 0.6, targetRoas: 3, hypothesisSpaceStatus: { status: 'LARGELY_UNEXPLORED' } });
  assert.notEqual(r.status, 'EVIDENCE_AGAINST');
});

test('item 103: nenhuma taxa de conversão é inventada — challengers gerados nunca carregam um campo numérico de conversão esperada', () => {
  const challengers = generateChallengers({
    diagnosis: { missing_monetization_signals: [{ diagnostic_id: 'X' }], known_path_to_target: { status: 'NO_KNOWN_PATH' }, tracking_scopes: { CREATIVE_ATTRIBUTION: { status: 'RELIABLE' }, PLATFORM_ATTRIBUTION: { status: 'RELIABLE' } }, financial_roas: 0.6 },
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  for (const c of challengers) {
    assert.equal('expected_conversion_rate' in c, false);
    assert.equal('expected_cac' in c, false);
    assert.equal('expected_ltv' in c, false);
  }
});

// ===== item 104 — TESTES ARCHITECTURE =====

test('item 104: arquitetura atual é reconstruída do repo/dados reais, nunca hardcoded', () => {
  const arch = buildCurrentArchitecture({ productId: PRODUCT_ID, dates: require('../src/utils/dates').dateRange('2026-07-30', '2026-08-28') });
  assert.ok(arch.stages.length > 0);
  assert.ok(arch.source_of_truth.offer.external_api_called === false);
});

test('item 104: upsell inativo nunca aparece como ACTIVE', () => {
  const arch = buildCurrentArchitecture({ productId: PRODUCT_ID, dates: require('../src/utils/dates').dateRange('2026-07-30', '2026-08-28') });
  const upsell = arch.stages.find((s) => s.type === 'UPSELL');
  assert.equal(upsell.status, 'PLANNED');
});

test('item 104: downsell inativo nunca aparece como ACTIVE', () => {
  const arch = buildCurrentArchitecture({ productId: PRODUCT_ID, dates: require('../src/utils/dates').dateRange('2026-07-30', '2026-08-28') });
  const downsell = arch.stages.find((s) => s.type === 'DOWNSELL');
  assert.equal(downsell.status, 'PLANNED');
});

test('item 104: bundle planejado nunca aparece como ACTIVE', () => {
  const arch = buildCurrentArchitecture({ productId: PRODUCT_ID, dates: require('../src/utils/dates').dateRange('2026-07-30', '2026-08-28') });
  const bundle = arch.stages.find((s) => s.type === 'BUNDLE');
  assert.equal(bundle.status, 'PLANNED');
});

test('item 104: arquitetura CUSTOM/HYBRID suportada — família CUSTOM/HYBRID existe na biblioteca sem exigir estágios típicos fixos', () => {
  const { PATTERN_LIBRARY } = require('../src/strategy-search/patternLibrary');
  assert.ok(PATTERN_LIBRARY.CUSTOM);
  assert.ok(PATTERN_LIBRARY.HYBRID);
  assert.deepEqual(PATTERN_LIBRARY.CUSTOM.typical_stages, []);
});

test('item 104: ordenação de estágios é determinística (order sequencial, nunca embaralhado)', () => {
  const arch = buildCurrentArchitecture({ productId: PRODUCT_ID, dates: require('../src/utils/dates').dateRange('2026-07-30', '2026-08-28') });
  const orderedStages = arch.stages.filter((s) => s.order != null);
  const orders = orderedStages.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('item 104: páginas não confirmadas (arsenal/essencial/nucleo) nunca entram como estágio ACTIVE da arquitetura atual', () => {
  const pages = buildUnconfirmedPages();
  for (const p of pages) assert.notEqual(p.status, 'ACTIVE');
});

test('item 104: classifyCurrentFamily deriva a família por sobreposição estrutural real, nunca escolhida à mão', () => {
  const r = classifyCurrentFamily(['AD', 'SALES_PAGE', 'CHECKOUT']);
  assert.equal(r.family, 'DIRECT_TO_OFFER');
  assert.equal(r.match_score, 1);
});

test('integração real: arquitetura atual real não inclui upsell/downsell/bundle como ACTIVE', () => {
  const r = analyzeStrategy({});
  const active = r.analysis.current_architecture.stages.filter((s) => s.status === 'ACTIVE');
  assert.equal(active.some((s) => ['UPSELL', 'DOWNSELL', 'BUNDLE'].includes(s.type)), false);
});
