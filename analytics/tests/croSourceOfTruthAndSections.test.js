'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLandingPageSourceOfTruth } = require('../src/cro/sourceOfTruth');
const { readAndParseLandingPage, parseLandingPageHtml, findDuplicateIds } = require('../src/cro/htmlParser');
const { buildSectionMap, classifySection } = require('../src/cro/sectionMap');
const { computeHistoricalFunnelMetrics } = require('../src/cro/funnelMetrics');
const { loadCurrentBehaviorSnapshot } = require('../src/cro/claritySnapshot');
const { dateRange } = require('../src/utils/dates');
const { TICKET } = require('../config/product');

test('source-of-truth: resolve via vercel.json real (regra de host explícita), documenta o motivo', () => {
  const sot = resolveLandingPageSourceOfTruth();
  assert.equal(sot.found, true);
  assert.equal(sot.considered_path, 'teste-b/index.html');
  assert.equal(sot.domain_matched, 'anti-vacuo.ojogodolucro.com.br');
  assert.match(sot.reason, /vercel\.json roteia/);
});

test('source-of-truth: cruza o preço real da LP com config/product.js TICKET pra confirmar (não assumir) o produto certo', () => {
  const sot = resolveLandingPageSourceOfTruth();
  assert.equal(sot.price_cross_check.checked, true);
  assert.equal(sot.price_cross_check.product_ticket_config, TICKET);
  assert.equal(sot.price_cross_check.matches_config_product, true);
});

test('source-of-truth: documenta o fallback (qualquer outro host cai no filesystem, não em teste-b)', () => {
  const sot = resolveLandingPageSourceOfTruth();
  assert.match(sot.fallback_note, /filesystem/);
});

test('htmlParser: extrai seções reais na ORDEM da página, nunca reordena', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  assert.ok(parsed.found);
  assert.ok(parsed.sections.length >= 10);
  const orders = parsed.sections.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('htmlParser: detecta id duplicado real (id="oferta" aparece 2x) — achado técnico verificável', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const dup = parsed.duplicate_ids.find((d) => d.id === 'oferta');
  assert.ok(dup);
  assert.equal(dup.occurrences, 2);
});

test('htmlParser: findDuplicateIds funciona isoladamente com HTML sintético', () => {
  const html = '<div id="a">1</div><div id="b">2</div><div id="a">3</div>';
  assert.deepEqual(findDuplicateIds(html), [{ id: 'a', occurrences: 2 }]);
});

test('htmlParser: arquivo inexistente retorna found:false, nunca lança erro', () => {
  const r = readAndParseLandingPage('C:/caminho/que/nao/existe.html');
  assert.equal(r.found, false);
});

test('section map: HERO é detectado pelo H1 real (nível estrutural, não palavra-chave frágil)', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const map = buildSectionMap(parsed.sections);
  assert.equal(map[0].semantic_name, 'HERO');
});

test('section map: NÃO força a estrutura conceitual do exemplo — usa nomes derivados do heading real da página', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const map = buildSectionMap(parsed.sections);
  const names = map.map((s) => s.semantic_name);
  assert.ok(names.includes('MECHANISM_STEPS'));
  assert.ok(names.includes('FAQ'));
  assert.equal(names.includes('PROBLEM'), false); // "PROBLEM" do exemplo conceitual não é forçado — a página real usa PAIN
});

test('section map: seção sem heading reconhecido nunca vira um nome inventado — UNRECOGNIZED_SECTION honesto', () => {
  const r = classifySection({ id: null, heading_text: 'Um Heading Totalmente Aleatório Sem Sentido Nenhum', cta_texts: [], price_mentions: [] }, []);
  assert.equal(r, 'UNRECOGNIZED_SECTION');
});

test('historical funnel metrics: rotulado HISTORICAL_FUNNEL_METRICS, calcula as 3 taxas pedidas', () => {
  const dates = dateRange('2026-07-30', '2026-08-28');
  const m = computeHistoricalFunnelMetrics(dates);
  assert.equal(m.type, 'HISTORICAL_FUNNEL_METRICS');
  assert.equal(typeof m.click_to_lpv_rate, 'number');
  assert.equal(typeof m.lpv_to_checkout_rate, 'number');
  assert.equal(typeof m.checkout_to_meta_purchase_rate, 'number');
});

test('historical funnel metrics: meta_purchases (Meta) e financial_buyers (Hotmart) são campos DISTINTOS, nunca confundidos', () => {
  const dates = dateRange('2026-07-30', '2026-08-28');
  const m = computeHistoricalFunnelMetrics(dates);
  assert.notEqual(m.raw.meta_purchases, undefined);
  assert.notEqual(m.financial_buyers, undefined);
  assert.match(m.financial_attribution_note, /nunca tratadas como sinônimos/);
});

test('Clarity: snapshot atual é rotulado CURRENT_BEHAVIOR_SNAPSHOT, nunca atribuído a uma janela histórica de negócio', () => {
  const snap = loadCurrentBehaviorSnapshot();
  assert.equal(snap.type, 'CURRENT_BEHAVIOR_SNAPSHOT');
  assert.ok(['AVAILABLE', 'UNAVAILABLE'].includes(snap.status));
});

test('Clarity: quando indisponível (estado real hoje), reporta o motivo real, nunca mascara nem inventa comportamento', () => {
  const snap = loadCurrentBehaviorSnapshot();
  if (snap.status === 'UNAVAILABLE') {
    assert.ok(snap.reason);
  }
});

test('Clarity: CURRENT_BEHAVIOR_SNAPSHOT e HISTORICAL_FUNNEL_METRICS nunca têm o mesmo `type` (nunca misturados)', () => {
  const snap = loadCurrentBehaviorSnapshot();
  const dates = dateRange('2026-07-30', '2026-08-28');
  const hist = computeHistoricalFunnelMetrics(dates);
  assert.notEqual(snap.type, hist.type);
});
