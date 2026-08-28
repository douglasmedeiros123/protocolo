'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveOfferSourceOfTruth } = require('../src/offer/sourceOfTruth');
const { OFFER_COMPONENT_TYPES, COMPONENT_STATUSES, OFFER_FUNNEL_STAGES } = require('../src/offer/componentTypes');
const { analyzeOffer } = require('../src/offer/builder');
const { saveOffers, loadOffers } = require('../src/offer/registry');
const { resolveAssetOrigin, ASSET_ORIGINS } = require('../src/learning/assetOrigin');
const { PRODUCT_ID, TICKET } = require('../config/product');
const { dateRange } = require('../src/utils/dates');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'offer-registry-test-')); }
const DATES = dateRange('2026-07-30', '2026-08-28');

test('source of truth: main product confirmado via config/product.js + transações reais, nunca API', () => {
  const sot = resolveOfferSourceOfTruth(DATES, PRODUCT_ID);
  assert.equal(sot.main_product.status, 'ACTIVE');
  assert.equal(sot.main_product.confirmed_price, TICKET);
  assert.equal(sot.external_api_called, false);
});

test('source of truth: bumps confirmados só com transação Hotmart real (Pack Objeções, Pack Cobrança)', () => {
  const sot = resolveOfferSourceOfTruth(DATES, PRODUCT_ID);
  const names = sot.confirmed_active_bumps.map((b) => b.product_name);
  assert.ok(names.includes('Pack Objeções'));
  assert.ok(names.includes('Pack Cobrança'));
  for (const b of sot.confirmed_active_bumps) assert.equal(b.status, 'ACTIVE');
});

test('source of truth: estratégia futura (3 bumps R$29 + bundle) NUNCA vira componente ativo — só nota PLANNED', () => {
  const sot = resolveOfferSourceOfTruth(DATES, PRODUCT_ID);
  assert.match(sot.planned_architecture_note, /PLANNED/);
  assert.equal(sot.confirmed_active_bumps.some((b) => b.average_price === 29), false);
});

test('component types: 8 tipos e 4 status documentados', () => {
  assert.deepEqual(OFFER_COMPONENT_TYPES.sort(), ['MAIN_PRODUCT', 'ORDER_BUMP', 'BUMP_BUNDLE', 'UPSELL', 'DOWNSELL', 'BONUS', 'SUBSCRIPTION', 'OTHER'].sort());
  assert.deepEqual(COMPONENT_STATUSES.sort(), ['ACTIVE', 'PLANNED', 'UNKNOWN', 'NOT_IMPLEMENTED'].sort());
  assert.deepEqual(OFFER_FUNNEL_STAGES, ['MAIN_PRODUCT', 'ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL_1', 'DOWNSELL_2', 'LIFECYCLE']);
});

test('UNKNOWN != ZERO: componentes NOT_IMPLEMENTED/PLANNED nunca têm price/attach_rate = 0, sempre null', () => {
  const r = analyzeOffer({});
  const planned = r.offer.components.filter((c) => c.status === 'PLANNED' || c.status === 'NOT_IMPLEMENTED');
  assert.ok(planned.length > 0);
  for (const c of planned) {
    assert.equal(c.price, null);
    assert.notEqual(c.price, 0);
    assert.equal(c.attach_rate, null);
    assert.notEqual(c.attach_rate, 0);
    assert.equal(c.take_rate, null);
  }
});

test('component schema: cada componente ativo tem os campos pedidos pelo item 9', () => {
  const r = analyzeOffer({});
  for (const c of r.offer.components) {
    for (const f of ['component_id', 'type', 'status', 'price', 'net_price_if_known', 'position', 'parent_component', 'eligibility', 'attach_rate', 'take_rate', 'gross_revenue', 'net_revenue', 'refund_rate', 'margin_if_known', 'confidence', 'source']) {
      assert.ok(f in c, `campo ausente: ${f} em ${c.component_id}`);
    }
  }
});

test('product_id: análise resolve o product_id default, propagado à oferta registrada', () => {
  const r = analyzeOffer({});
  assert.equal(r.product_id, PRODUCT_ID);
  assert.equal(r.offer.product_id, PRODUCT_ID);
});

test('versioning: OFFER-V1 é a baseline (version=1, parent_version=null) — nenhuma OFFER-V2 real criada', () => {
  const r = analyzeOffer({});
  assert.equal(r.offer.offer_id, 'OFFER-V1');
  assert.equal(r.offer.version, 1);
  assert.equal(r.offer.parent_version, null);
  assert.equal(r.offer.status, 'BASELINE');
});

test('asset_origin: reusa o enum do Learning Engine, NUNCA inferido retroativamente pra MACHINE', () => {
  const r = analyzeOffer({});
  assert.ok(ASSET_ORIGINS.includes(r.offer.asset_origin));
  assert.equal(r.offer.asset_origin, 'UNKNOWN');
});

test('registry: saveOffers é idempotente — preserva created_at, não duplica arquivo', () => {
  const dir = makeTempDir();
  const r = analyzeOffer({});
  const first = saveOffers([r.offer], dir);
  const filesAfterFirst = fs.readdirSync(dir);
  const second = saveOffers([r.offer], dir);
  const filesAfterSecond = fs.readdirSync(dir);
  assert.deepEqual(filesAfterFirst, filesAfterSecond);
  assert.equal(first[0].created_at, second[0].created_at);
});

test('registry: loadOffers funciona em diretório isolado, sem tocar dados reais', () => {
  const dir = makeTempDir();
  assert.deepEqual(loadOffers(dir), []);
});
