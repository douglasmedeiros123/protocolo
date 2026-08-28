'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { DNA_FIELDS, emptyCreativeDNA, buildCreativeDNA } = require('../src/creative/dna');
const { classifyCreativeMessage, CLASSIFICATION_TAGS } = require('../src/creative/messageClassification');
const { CREATIVE_FORMATS, isValidCreativeFormat, inferFormatHintFromName } = require('../src/creative/formats');
const { resolveAssetOrigin, isValidAssetOrigin, ASSET_ORIGINS } = require('../src/learning/assetOrigin');

test('creative DNA: 17 campos documentados, todos null por padrão (nunca inventa dado)', () => {
  const dna = emptyCreativeDNA();
  assert.equal(DNA_FIELDS.length, 17);
  for (const f of DNA_FIELDS) assert.equal(dna[f], null);
});

test('creative DNA: buildCreativeDNA só preenche o que foi EXPLICITAMENTE informado', () => {
  const dna = buildCreativeDNA({ pain: 'perder clientes por demora na resposta', dominant_message: 'Criativo 01 - Print da Dor' });
  assert.equal(dna.pain, 'perder clientes por demora na resposta');
  assert.equal(dna.dominant_message, 'Criativo 01 - Print da Dor');
  assert.equal(dna.hook, null); // não informado -> continua null, nunca inventado
  assert.equal(dna.proof, null);
});

test('message classification: DNA vazio -> tags vazias, primary null (honesto, não chuta)', () => {
  const r = classifyCreativeMessage(emptyCreativeDNA());
  assert.deepEqual(r.tags, []);
  assert.equal(r.primary, null);
});

test('message classification: DNA com pain preenchido -> pain_led vira a tag primary', () => {
  const dna = buildCreativeDNA({ pain: 'x' });
  const r = classifyCreativeMessage(dna);
  assert.equal(r.primary, 'pain_led');
  assert.ok(CLASSIFICATION_TAGS.includes(r.primary));
});

test('message classification: criativo pode ter múltiplas tags, mas sempre 1 primary determinística', () => {
  const dna = buildCreativeDNA({ pain: 'x', proof: 'y' });
  const r = classifyCreativeMessage(dna);
  assert.equal(r.tags.length, 2);
  assert.equal(r.primary, 'pain_led'); // ordem de prioridade documentada, determinística
});

test('formats: enum tem os 9 valores pedidos', () => {
  assert.deepEqual(CREATIVE_FORMATS.sort(), ['CAROUSEL', 'CHAT', 'NOTIFICATION', 'OTHER', 'SCREENSHOT', 'STATIC', 'TEXT', 'UGC', 'VIDEO'].sort());
  assert.equal(isValidCreativeFormat('SCREENSHOT'), true);
  assert.equal(isValidCreativeFormat('INVENTADO'), false);
});

test('formats: hint a partir do ad_name é claramente marcado como NÃO verificado', () => {
  const r = inferFormatHintFromName('Criativo 01 - Print da Dor');
  assert.equal(r.format_hint, 'SCREENSHOT');
  assert.equal(r.source, 'inferred_from_ad_name');
  assert.notEqual(r.confidence, 'verified');
});

test('formats: ad_name sem palavra-chave reconhecida -> hint null, não inventa formato', () => {
  const r = inferFormatHintFromName('Criativo 05 - Ruminação Visualizou Cliente');
  assert.equal(r.format_hint, null);
});

test('asset_origin: reusa o enum do Learning Engine (5 valores), MACHINE nunca é o default sem evidência explícita', () => {
  assert.deepEqual(ASSET_ORIGINS.sort(), ['EXTERNAL', 'HUMAN', 'MACHINE', 'MIXED', 'UNKNOWN'].sort());
  assert.equal(resolveAssetOrigin({}), 'UNKNOWN');
  assert.equal(resolveAssetOrigin({ asset_origin: 'MACHINE' }), 'MACHINE');
  assert.equal(isValidAssetOrigin('MACHINE'), true);
});

test('asset_origin: valor inválido nunca é aceito, cai pra UNKNOWN', () => {
  assert.equal(isValidAssetOrigin('ALIEN'), false);
  assert.equal(resolveAssetOrigin({ asset_origin: 'ALIEN' }), 'UNKNOWN');
});
