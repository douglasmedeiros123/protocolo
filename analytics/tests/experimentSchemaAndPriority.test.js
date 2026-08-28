'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateExperimentId, isValidStatus, isValidCategory, STATUSES, CATEGORIES } = require('../src/experiments/schema');
const { computePriorityScore, evidenceScore, riskForCategory } = require('../src/experiments/priority');
const { validateBudgetLimit } = require('../src/experiments/budget');
const { minimumEvidenceFor, estimateDaysToEvidence } = require('../src/experiments/evidence');

test('criação de experiment_id: primeiro da categoria vira 001', () => {
  assert.equal(generateExperimentId('CREATIVE', []), 'CREATIVE-001');
});

test('criação de experiment_id: incrementa a partir do maior número já usado NAQUELA categoria', () => {
  assert.equal(generateExperimentId('CREATIVE', ['CREATIVE-001', 'CREATIVE-002', 'CRO-001']), 'CREATIVE-003');
});

test('criação de experiment_id: categorias diferentes têm sequências independentes', () => {
  assert.equal(generateExperimentId('CRO', ['CREATIVE-001', 'CREATIVE-002']), 'CRO-001');
});

test('criação de experiment_id: mesma entrada sempre produz o mesmo id (determinístico)', () => {
  const ids = ['CREATIVE-001', 'CREATIVE-005'];
  assert.equal(generateExperimentId('CREATIVE', ids), generateExperimentId('CREATIVE', ids));
});

test('criação de experiment_id: categoria inválida lança erro, não inventa uma', () => {
  assert.throws(() => generateExperimentId('NAO_EXISTE', []), /Categoria inválida/);
});

test('validação de status: os 8 estados objetivos existem e só eles são válidos', () => {
  assert.deepEqual(STATUSES.sort(), ['CANCELLED', 'DRAFT', 'FAILURE', 'INCONCLUSIVE', 'PAUSED', 'READY', 'RUNNING', 'SUCCESS'].sort());
  for (const s of STATUSES) assert.equal(isValidStatus(s), true);
  assert.equal(isValidStatus('INVENTADO'), false);
});

test('validação de categoria: as 7 categorias pedidas existem', () => {
  assert.deepEqual(CATEGORIES.sort(), ['AOV', 'CHECKOUT', 'CREATIVE', 'CRO', 'MEDIA_BUYING', 'OFFER', 'TRACKING'].sort());
});

test('cálculo de score: mesma entrada sempre produz o mesmo score (determinístico)', () => {
  const input = { impactReais: 200, confidence: 0.8, costReais: 300, speedDias: 7, risk: 1 };
  const a = computePriorityScore(input);
  const b = computePriorityScore(input);
  assert.equal(a.score, b.score);
});

test('cálculo de score: impacto maior (mesmo custo/risco/velocidade) gera score maior', () => {
  const base = { confidence: 0.8, costReais: 300, speedDias: 7, risk: 1 };
  const low = computePriorityScore({ ...base, impactReais: 100 });
  const high = computePriorityScore({ ...base, impactReais: 500 });
  assert.ok(high.score > low.score);
});

test('cálculo de score: risco maior reduz o score (mesmo impacto)', () => {
  const base = { impactReais: 300, confidence: 0.8, costReais: 300, speedDias: 7 };
  const lowRisk = computePriorityScore({ ...base, risk: 1 });
  const highRisk = computePriorityScore({ ...base, risk: 5 });
  assert.ok(highRisk.score < lowRisk.score);
});

test('cálculo de score: impacto negativo (experimento que projeta piorar) gera score negativo', () => {
  const r = computePriorityScore({ impactReais: -100, confidence: 0.9, costReais: 300, speedDias: 7, risk: 1 });
  assert.ok(r.score < 0);
});

test('evidenceScore: confiança é soma de pesos fixos, nunca opinião solta', () => {
  const full = evidenceScore({ has_specific_measured_metric: true, has_funnel_gap_quantified: true, has_corroborating_independent_source: true, has_prior_precedent_this_project: true });
  assert.equal(full.confidence, 1.0);
  const none = evidenceScore({});
  assert.equal(none.confidence, 0);
  const partial = evidenceScore({ has_specific_measured_metric: true, has_funnel_gap_quantified: true });
  assert.ok(Math.abs(partial.confidence - 0.6) < 1e-9);
});

test('risco por categoria: MEDIA_BUYING e CHECKOUT são mais arriscados que CREATIVE e CRO', () => {
  assert.ok(riskForCategory('MEDIA_BUYING') > riskForCategory('CREATIVE'));
  assert.ok(riskForCategory('CHECKOUT') > riskForCategory('CRO'));
});

// Interface atual (PASSO 5.1): validateBudgetLimit(budgetLimit, capitalCycle, maxBudgetPercentOfCycle).
// Cobertura mais completa de capital_cycle está em experimentCapitalCycle.test.js — aqui fica
// só o essencial pra não duplicar.
test('limite de orçamento: dentro do cycle_available configurado passa', () => {
  const capitalCycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 500 };
  const v = validateBudgetLimit(300, capitalCycle);
  assert.equal(v.valid, true);
});

test('limite de orçamento: acima do cycle_available configurado falha', () => {
  const capitalCycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 200 };
  const v = validateBudgetLimit(300, capitalCycle);
  assert.equal(v.valid, false);
});

test('limite de orçamento: sem capital_cycle configurado, retorna null (não aprova nem reprova às cegas)', () => {
  const v = validateBudgetLimit(300, { status: 'CAPITAL_NOT_CONFIGURED' });
  assert.equal(v.valid, null);
  assert.equal(v.status, 'CAPITAL_NOT_CONFIGURED');
});

test('limite de orçamento: budget_limit inválido (0 ou negativo) sempre falha', () => {
  const capitalCycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_available: 900 };
  assert.equal(validateBudgetLimit(0, capitalCycle).valid, false);
  assert.equal(validateBudgetLimit(-50, capitalCycle).valid, false);
});

test('minimum_evidence: depende da categoria (AOV precisa de mais compras/dias que CREATIVE)', () => {
  const aov = minimumEvidenceFor('AOV');
  const creative = minimumEvidenceFor('CREATIVE');
  assert.equal(aov.compras, 15);
  assert.equal(aov.duration_days, 14);
  assert.equal(creative.lpv, 30);
  assert.notEqual(aov.duration_days, creative.duration_days);
});

test('minimum_evidence: categoria desconhecida lança erro, não inventa regra', () => {
  assert.throws(() => minimumEvidenceFor('NAO_EXISTE'));
});

test('estimateDaysToEvidence: usa o gargalo (maior tempo), não a média', () => {
  const minEv = { lpv: null, checkouts: null, compras: 15, spend: null, duration_days: 14 };
  const dias = estimateDaysToEvidence(minEv, { compras_per_day: 0.5 }); // 15/0.5 = 30 dias, maior que os 14 de duracao minima
  assert.equal(dias, 30);
});

test('estimateDaysToEvidence: sem taxa diária disponível, cai no duration_days mínimo', () => {
  const minEv = { lpv: 30, checkouts: null, compras: null, spend: null, duration_days: 7 };
  const dias = estimateDaysToEvidence(minEv, {});
  assert.equal(dias, 7);
});
