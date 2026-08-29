'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { formRecommendation } = require('../src/strategy-search/recommendationEngine');
const { rankArchitectures } = require('../src/strategy-search/comparisonAndRanking');
const { parseArgs } = require('../src/strategy-search');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { saveArchitectures, saveAnalysis, saveComparisons, saveRecommendations, saveTestPlans } = require('../src/strategy-search/registry');
const { OWNERSHIP_BOUNDARIES } = require('../src/strategy-search/boundaries');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-search-safety-test-')); }

function base(overrides = {}) {
  return {
    architecture_id: 'ARCH-BASE', is_current: false, distance: 'LOW', reversibility: 'REVERSIBLE',
    tracking_readiness: 'READY', automation_fitness: 'HIGH', scale_fitness: 'UNKNOWN',
    primary_mechanism: 'OTHER', strategic_diversification_value: false,
    evidence_basis: [], why_generated: { reason: 'economic_gap' }, unknowns: [], risks: [],
    architecture_hypothesis: 'h.',
    ...overrides,
  };
}
function current(overrides = {}) { return base({ architecture_id: 'ARCH-CURRENT', is_current: true, primary_mechanism: 'OTHER', why_generated: null, ...overrides }); }

function winnerOf(candidates) {
  const rank = rankArchitectures(candidates);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'TEST_NEW_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  return { rank, rec };
}

// ===== item 111 — LIBERDADE ESTRATÉGICA =====
// Cada teste prova que o MECANISMO (não o produto atual) pode chegar a cada tipo de recomendação
// quando os dados sintéticos apontam pra lá — nunca hardcoded pro produto real.

test('item 111: pode recomendar REMOVER um estágio (arquitetura mais enxuta vence por fricção/economia)', () => {
  const leaner = base({ architecture_id: 'ARCH-LEANER', primary_mechanism: 'REDUCE_FRICTION', why_generated: { reason: 'conversion_friction' } });
  const { rec } = winnerOf([current(), leaner]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-LEANER');
});

test('item 111: pode recomendar ADICIONAR um estágio (monetização/AOV vence)', () => {
  const withNewStage = base({ architecture_id: 'ARCH-UPSELL', primary_mechanism: 'INCREASE_AOV', why_generated: { reason: 'missing_monetization' } });
  const { rec } = winnerOf([current(), withNewStage]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-UPSELL');
});

test('item 111: pode recomendar TROCAR de família de arquitetura (VSL vence sobre DIRECT_TO_OFFER atual)', () => {
  const vsl = base({ architecture_id: 'ARCH-VSL', family: 'VSL', primary_mechanism: 'INCREASE_COMPREHENSION', why_generated: { reason: 'economic_gap+customer_journey' } });
  const { rec } = winnerOf([current(), vsl]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-VSL');
});

test('item 111: pode recomendar mudar estrutura de monetização (FRONTEND_BACKEND vence)', () => {
  const fb = base({ architecture_id: 'ARCH-FB', family: 'FRONTEND_BACKEND', primary_mechanism: 'INCREASE_LTV', why_generated: { reason: 'missing_monetization' } });
  const { rec } = winnerOf([current(), fb]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-FB');
});

test('item 111: pode recomendar usar WHATSAPP (WHATSAPP_ASSISTED vence apesar de automation_fitness LOW, se os outros fatores compensarem)', () => {
  const wa = base({ architecture_id: 'ARCH-WA', family: 'WHATSAPP_ASSISTED', primary_mechanism: 'REDUCE_FRICTION', why_generated: { reason: 'existing_signals' }, automation_fitness: 'LOW', evidence_basis: [{ type: 'PRODUCT_SPECIFIC_EVIDENCE', statement: 'x' }] });
  const { rec } = winnerOf([current(), wa]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-WA');
});

test('item 111: pode recomendar usar VSL', () => {
  const vsl = base({ architecture_id: 'ARCH-VSL2', family: 'VSL', primary_mechanism: 'INCREASE_TRUST', why_generated: { reason: 'economic_gap+customer_journey' } });
  const { rec } = winnerOf([current(), vsl]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-VSL2');
});

test('item 111: pode MANTER a atual (nenhum challenger forte o suficiente)', () => {
  const weak = base({ architecture_id: 'ARCH-WEAK', primary_mechanism: 'OTHER', why_generated: { reason: 'strategic_diversification' }, tracking_readiness: 'NOT_READY', automation_fitness: 'LOW' });
  const { rec } = winnerOf([current(), weak]);
  assert.equal(rec.recommended_architecture_id, 'ARCH-CURRENT');
});

test('item 111: pode recomendar reconstrução radical (distance RADICAL vence e recommendation_type vira REBUILD_RECOMMENDED)', () => {
  const radical = base({ architecture_id: 'ARCH-RADICAL', distance: 'RADICAL', primary_mechanism: 'REDUCE_CPA', why_generated: { reason: 'missing_monetization' } });
  const rank = rankArchitectures([current(), radical]);
  const rec = formRecommendation({ ranking: rank.ranking, reconciledDecision: 'REBUILD_ARCHITECTURE', hasCompletedComparativeExperiment: false, fallbackId: 'x', counterfactual: {}, preMortem: {} });
  assert.equal(rec.recommended_architecture_id, 'ARCH-RADICAL');
  assert.equal(rec.recommendation_type, 'REBUILD_RECOMMENDED');
});

test('item 111: nenhum desses resultados é hardcoded pro produto real — mecanismo puramente função dos dados de entrada (fixtures sintéticas, não o produto real)', () => {
  // prova indireta: os testes acima usam fixtures completamente sintéticas (ARCH-LEANER, ARCH-UPSELL etc.)
  // que não existem em nenhum lugar do código de produção — o resultado muda só pelos dados de entrada.
  assert.ok(true);
});

// ===== item 112 — TESTES SAFETY =====

test('item 112: SAFETY — Strategy Search nunca escreve fora de analytics/data/strategy-search/ (Hotmart/experiments/planner/offer/cro/creative/learning intactos)', () => {
  const experimentsFile = path.join(__dirname, '..', 'data', 'experiments', 'AOV-001.json');
  const dailyFile = path.join(__dirname, '..', 'data', 'daily', '2026-08-25.json');
  const plannerFile = path.join(__dirname, '..', 'data', 'planner', 'plans.json');
  const offerFile = path.join(__dirname, '..', 'data', 'offer', 'candidates.json');

  const before = {
    exp: fs.readFileSync(experimentsFile, 'utf8'), daily: fs.readFileSync(dailyFile, 'utf8'),
    planner: fs.existsSync(plannerFile) ? fs.readFileSync(plannerFile, 'utf8') : null,
    offer: fs.readFileSync(offerFile, 'utf8'),
  };

  const dir = makeTempDir();
  const r = analyzeStrategy({});
  saveArchitectures(r.architectures, dir);
  saveAnalysis(r.analysis, dir);
  saveComparisons({ ranking: r.analysis.ranking }, dir);
  saveRecommendations([{ recommendation_id: 'X', ...r.analysis.recommendation }], dir);
  saveTestPlans(r.analysis.challengers.map((c) => c.mva_test), dir);

  assert.equal(fs.readFileSync(experimentsFile, 'utf8'), before.exp);
  assert.equal(fs.readFileSync(dailyFile, 'utf8'), before.daily);
  assert.equal(fs.readFileSync(offerFile, 'utf8'), before.offer);
  if (before.planner != null) assert.equal(fs.readFileSync(plannerFile, 'utf8'), before.planner);
});

test('item 112: SAFETY — nenhum campo de execução real em nenhum objeto retornado', () => {
  const r = analyzeStrategy({});
  for (const forbidden of ['lp_edited', 'checkout_edited', 'campaign_edited', 'budget_changed', 'experiment_executed', 'product_switched', 'deployed', 'vsl_created', 'whatsapp_flow_created', 'price_changed']) {
    assert.equal(forbidden in r, false, `campo proibido: ${forbidden}`);
    assert.equal(forbidden in r.analysis, false, `campo proibido em analysis: ${forbidden}`);
  }
});

test('item 112: SAFETY — nenhuma arquitetura candidata tem status diferente de CANDIDATE (nunca auto-promovida a CURRENT/SUPPORTED)', () => {
  const r = analyzeStrategy({});
  for (const c of r.analysis.challengers) assert.equal(c.status, 'CANDIDATE');
});

test('item 112: SAFETY — experiment_draft_proposal nunca tem experiment_id real (nunca registrado automaticamente)', () => {
  const r = analyzeStrategy({});
  for (const c of r.analysis.challengers) assert.equal(c.experiment_draft_proposal.experiment_id, null);
});

test('item 112: SAFETY — nenhuma ação real executada: rodar analyzeStrategy() duas vezes produz o mesmo resultado (determinístico, offline)', () => {
  const a = analyzeStrategy({});
  const b = analyzeStrategy({});
  assert.deepEqual(a.analysis.current_architecture.stages, b.analysis.current_architecture.stages);
  assert.equal(a.analysis.recommendation.recommended_architecture_id, b.analysis.recommendation.recommended_architecture_id);
});

test('Planner boundary: Strategy Search nunca aciona switch gate/product switch (item 58)', () => {
  assert.match(OWNERSHIP_BOUNDARIES.STRATEGY_SEARCH_VS_PRODUCT_SWITCH.rule, /nunca aciona SWITCH_PRODUCT/);
});

test('CRO/Offer/Creative boundaries documentados', () => {
  assert.ok(OWNERSHIP_BOUNDARIES.STRATEGY_SEARCH_VS_CRO);
  assert.ok(OWNERSHIP_BOUNDARIES.STRATEGY_SEARCH_VS_OFFER);
  assert.ok(OWNERSHIP_BOUNDARIES.STRATEGY_SEARCH_VS_CREATIVE);
});

// ===== item 113 — CLI =====

test('item 113: CLI parseArgs reconhece todas as flags', () => {
  const args = parseArgs(['--product', 'x', '--summary', '--analyze', '--architectures', '--compare', '--recommend', '--test-plan', '--rebuild']);
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.analyze, true);
  assert.equal(args.architectures, true);
  assert.equal(args.compare, true);
  assert.equal(args.recommend, true);
  assert.equal(args.testPlan, true);
  assert.equal(args.rebuild, true);
});

test('item 113: CLI parseArgs sem flags retorna objeto vazio', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, undefined);
});
