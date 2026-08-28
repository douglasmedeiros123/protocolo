'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyVariableIsolation, nextGenerationId } = require('../src/creative/genealogy');
const { deriveCreativeIdentity } = require('../src/creative/builder');
const { buildCreativeDNA } = require('../src/creative/dna');

test('genealogia: "Criativo NN - X" vira CREATIVE-NN, geração 1, sem pai', () => {
  const r = deriveCreativeIdentity('Criativo 05 - Ruminação Visualizou Cliente');
  assert.equal(r.creative_id, 'CREATIVE-05');
  assert.equal(r.generation, 1);
  assert.equal(r.parent_creative_id, null);
});

test('genealogia: "... - Variante B" é reconhecida como geração 2, pai = a base sem sufixo (fato real do nome, não inventado)', () => {
  const r = deriveCreativeIdentity('Criativo 01 - Print da Dor - Variante B');
  assert.equal(r.creative_id, 'CREATIVE-01-VARIANTE-B');
  assert.equal(r.parent_creative_id, 'CREATIVE-01');
  assert.equal(r.generation, 2);
});

test('genealogia: ad_name fora do padrão "Criativo NN" vira slug estável, nunca quebra', () => {
  const r = deriveCreativeIdentity('Anúncio - Antes e Depois - Chat');
  assert.equal(r.creative_id, 'AD-ANUNCIO-ANTES-E-DEPOIS-CHAT');
  assert.equal(r.generation, 1);
});

test('genealogia: mesma entrada sempre produz a mesma identidade (determinístico)', () => {
  const a = deriveCreativeIdentity('Criativo 05 - Ruminação Visualizou Cliente');
  const b = deriveCreativeIdentity('Criativo 05 - Ruminação Visualizou Cliente');
  assert.deepEqual(a, b);
});

test('nextGenerationId: primeira variação de um creative vira -V2 (o original é geração 1, sem sufixo)', () => {
  assert.equal(nextGenerationId('CREATIVE-05', []), 'CREATIVE-05-V2');
});

test('nextGenerationId: incrementa a partir do maior já existente daquela família', () => {
  assert.equal(nextGenerationId('CREATIVE-05', ['CREATIVE-05-V2', 'CREATIVE-05-V3']), 'CREATIVE-05-V4');
});

test('isolamento de variáveis: SINGLE_VARIABLE quando só 1 campo principal do DNA muda', () => {
  const parent = buildCreativeDNA({ pain: 'x', format: 'SCREENSHOT', cta: 'compre agora' });
  const child = buildCreativeDNA({ pain: 'x', format: 'SCREENSHOT', cta: 'fale com a gente' });
  const r = classifyVariableIsolation(parent, child);
  assert.equal(r.isolation_status, 'SINGLE_VARIABLE');
  assert.deepEqual(r.variables_changed, ['cta']);
});

test('isolamento de variáveis: MULTI_VARIABLE_TEST quando 2+ campos mudam, reduz qualidade do aprendizado causal', () => {
  const parent = buildCreativeDNA({ pain: 'x', hook: 'a', cta: 'compre' });
  const child = buildCreativeDNA({ pain: 'y', hook: 'b', cta: 'compre' });
  const r = classifyVariableIsolation(parent, child);
  assert.equal(r.isolation_status, 'MULTI_VARIABLE_TEST');
  assert.equal(r.variables_changed.length, 2);
});

test('isolamento de variáveis: sem dado nenhum em nenhum dos dois lados -> UNKNOWN, nunca assume SINGLE_VARIABLE', () => {
  const r = classifyVariableIsolation(buildCreativeDNA(), buildCreativeDNA());
  assert.equal(r.isolation_status, 'UNKNOWN');
});

test('isolamento de variáveis: nenhuma mudança detectada nos campos com dado disponível', () => {
  const parent = buildCreativeDNA({ pain: 'x' });
  const child = buildCreativeDNA({ pain: 'x' });
  const r = classifyVariableIsolation(parent, child);
  assert.equal(r.isolation_status, 'NO_CHANGE_DETECTED');
});
