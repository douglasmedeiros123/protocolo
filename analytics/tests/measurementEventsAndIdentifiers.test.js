'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEventTaxonomyForStages, eventSourceSemantics } = require('../src/measurement/eventTaxonomy');
const { buildIdentifierSpine } = require('../src/measurement/identifierSpine');
const { IDENTIFIER_SPINE_NAMES, EVENT_LIFECYCLE_STATUSES } = require('../src/measurement/enums');
const { runFullPlatformAudit } = require('../src/measurement/platformAudit');

const platform = runFullPlatformAudit();

test('evento PURCHASE nunca confunde META.PURCHASE com HOTMART.TRANSACTION_APPROVED como fonte financeira', () => {
  const semantics = eventSourceSemantics('PURCHASE', platform);
  const hotmart = semantics.find((s) => s.namespace === 'HOTMART.TRANSACTION_APPROVED');
  const meta = semantics.find((s) => s.namespace === 'META.PURCHASE');
  assert.equal(hotmart.is_financial_truth, true);
  assert.equal(meta.is_financial_truth, false);
  assert.equal(hotmart.status, 'VALIDATED');
});

test('taxonomia pra estágios reais (AD/SALES_PAGE/CHECKOUT/ORDER_BUMP) nunca afirma VALIDATED pra eventos que não têm fonte financeira', () => {
  const taxonomy = buildEventTaxonomyForStages(['AD', 'SALES_PAGE', 'CHECKOUT', 'ORDER_BUMP'], platform);
  for (const e of taxonomy) assert.ok(EVENT_LIFECYCLE_STATUSES.includes(e.status));
  const purchase = taxonomy.find((e) => e.event === 'PURCHASE');
  assert.equal(purchase.status, 'VALIDATED');
  const pageView = taxonomy.find((e) => e.event === 'PAGE_VIEW');
  assert.notEqual(pageView.status, 'VALIDATED'); // GA4/dataLayer não confirmado — nunca VALIDATED por suposição
});

test('estágio sem nenhum evento mapeado retorna lista vazia, nunca lança erro', () => {
  const taxonomy = buildEventTaxonomyForStages(['OTHER'], platform);
  assert.deepEqual(taxonomy, []);
});

test('identifier spine cobre exatamente os 18 identificadores canônicos', () => {
  const spine = buildIdentifierSpine(platform);
  assert.equal(Object.keys(spine.identifiers).length, IDENTIFIER_SPINE_NAMES.length);
  for (const n of IDENTIFIER_SPINE_NAMES) assert.ok(spine.identifiers[n], `identificador ausente: ${n}`);
});

test('UTM nunca é afirmado disponível — dado real confirma ausência de propagação pro checkout', () => {
  const spine = buildIdentifierSpine(platform);
  assert.equal(spine.utm_continuity_available, false);
  assert.equal(spine.identifiers.utm_source.availability, 'NOT_AVAILABLE');
});

test('transaction_id é CONFIRMED (Hotmart real) mas joinability com Meta é nula — nunca inventa join determinístico', () => {
  const spine = buildIdentifierSpine(platform);
  assert.equal(spine.identifiers.transaction_id.availability, 'CONFIRMED');
  assert.match(spine.identifiers.transaction_id.joinability, /nula/);
});

test('ad_id/adset_id/campaign_id são CONFIRMED do lado Meta, mas nunca afirmados joináveis com Hotmart', () => {
  const spine = buildIdentifierSpine(platform);
  for (const id of ['ad_id', 'adset_id', 'campaign_id']) {
    assert.equal(spine.identifiers[id].availability, 'CONFIRMED');
    assert.match(spine.identifiers[id].joinability, /nula/);
  }
});

test('session_id é NOT_AVAILABLE hoje — nenhum sistema de sessão web próprio identificado', () => {
  const spine = buildIdentifierSpine(platform);
  assert.equal(spine.identifiers.session_id.availability, 'NOT_AVAILABLE');
});
