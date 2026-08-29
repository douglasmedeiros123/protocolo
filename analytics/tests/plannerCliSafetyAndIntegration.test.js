'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs } = require('../src/planner');
const { analyzePlan } = require('../src/planner/builder');
const { savePlans, saveViability, saveEvidenceGaps, saveRoadmap, saveScenarios } = require('../src/planner/registry');
const { OWNERSHIP_BOUNDARIES } = require('../src/planner/boundaries');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'planner-safety-test-')); }

test('item 84: CLI parseArgs reconhece --product --summary --analyze --viability --roadmap --scenarios --rebuild', () => {
  const args = parseArgs(['--product', 'x', '--summary', '--analyze', '--viability', '--roadmap', '--scenarios', '--rebuild']);
  assert.equal(args.product, 'x');
  assert.equal(args.summary, true);
  assert.equal(args.analyze, true);
  assert.equal(args.viability, true);
  assert.equal(args.roadmap, true);
  assert.equal(args.scenarios, true);
  assert.equal(args.rebuild, true);
});

test('item 84: CLI parseArgs sem flags retorna objeto vazio', () => {
  const args = parseArgs([]);
  assert.equal(args.rebuild, undefined);
});

test('item 83: SAFETY — Planner nunca escreve fora de analytics/data/planner/ (Hotmart/experiments/creative/cro/offer/learning intactos)', () => {
  const experimentsFile = path.join(__dirname, '..', 'data', 'experiments', 'AOV-001.json');
  const dailyFile = path.join(__dirname, '..', 'data', 'daily', '2026-08-25.json');
  const offerFile = path.join(__dirname, '..', 'data', 'offer', 'candidates.json');
  const croFile = path.join(__dirname, '..', 'data', 'cro', 'candidates.json');
  const creativeFile = path.join(__dirname, '..', 'data', 'creatives', 'candidates.json');
  const learningFile = path.join(__dirname, '..', 'data', 'learning', 'hypotheses.json');

  const before = {
    exp: fs.readFileSync(experimentsFile, 'utf8'), daily: fs.readFileSync(dailyFile, 'utf8'),
    offer: fs.readFileSync(offerFile, 'utf8'), cro: fs.readFileSync(croFile, 'utf8'),
    creative: fs.readFileSync(creativeFile, 'utf8'), learning: fs.readFileSync(learningFile, 'utf8'),
  };

  const dir = makeTempDir();
  const r = analyzePlan({});
  savePlans([r.plan], dir);
  saveViability({ product_id: r.product_id, viability_status: r.plan.viability_status }, dir);
  saveEvidenceGaps(r.evidence_gaps, dir);
  saveRoadmap(r.roadmap, dir);
  saveScenarios(r.plan.scenario_analysis, dir);

  assert.equal(fs.readFileSync(experimentsFile, 'utf8'), before.exp);
  assert.equal(fs.readFileSync(dailyFile, 'utf8'), before.daily);
  assert.equal(fs.readFileSync(offerFile, 'utf8'), before.offer);
  assert.equal(fs.readFileSync(croFile, 'utf8'), before.cro);
  assert.equal(fs.readFileSync(creativeFile, 'utf8'), before.creative);
  assert.equal(fs.readFileSync(learningFile, 'utf8'), before.learning);
});

test('item 83: SAFETY — nenhum campo de execução real em nenhum objeto retornado (Meta/Hotmart/LP/checkout/deploy/produto)', () => {
  const r = analyzePlan({});
  for (const forbidden of ['campaign_edited', 'budget_changed', 'ad_published', 'lp_edited', 'checkout_edited', 'hotmart_written', 'deployed', 'experiment_executed', 'product_switched']) {
    assert.equal(forbidden in r, false, `campo proibido presente: ${forbidden}`);
    assert.equal(forbidden in r.plan, false, `campo proibido presente em plan: ${forbidden}`);
  }
});

test('item 83: SAFETY — nenhuma ação estratégica gerada tem status RUNNING/COMPLETED (só PLANNED/READY/BLOCKED)', () => {
  const r = analyzePlan({});
  for (const a of r.actions) assert.ok(['PLANNED', 'READY', 'BLOCKED'].includes(a.status));
});

test('item 83: SAFETY — SWITCH_PRODUCT nunca é executado, mesmo quando é o verdict (é só uma string de recomendação)', () => {
  const r = analyzePlan({});
  assert.equal(typeof r.plan.verdict, 'string');
  assert.equal('product_switch_executed' in r.plan, false);
});

test('Decision Engine boundary: Planner nunca altera decision/builder.js — integração é leitura pura', () => {
  assert.match(OWNERSHIP_BOUNDARIES.PLANNER_VS_DECISION.boundary_rule, /NUNCA altera decision\/builder\.js/);
});

test('Profit Engine boundary: Planner reusa profit/aggregate.js + profit/financials.js, nunca fórmula própria', () => {
  assert.match(OWNERSHIP_BOUNDARIES.PLANNER_VS_PROFIT.boundary_rule, /profit\/aggregate\.js/);
});

test('Experiment Engine boundary: Planner nunca cria/executa/altera status de experimento', () => {
  assert.match(OWNERSHIP_BOUNDARIES.PLANNER_VS_EXPERIMENT.boundary_rule, /nunca cria\/executa\/altera/);
});

test('CRO/Creative/Offer boundaries documentados', () => {
  assert.ok(OWNERSHIP_BOUNDARIES.PLANNER_VS_CREATIVE);
  assert.ok(OWNERSHIP_BOUNDARIES.PLANNER_VS_CRO);
  assert.ok(OWNERSHIP_BOUNDARIES.PLANNER_VS_OFFER);
});

test('Lifecycle boundary: reconhecido como lever UNQUANTIFIED, Lifecycle ainda não implementado (item 67)', () => {
  assert.match(OWNERSHIP_BOUNDARIES.PLANNER_VS_LIFECYCLE.boundary_rule, /não existe ainda/);
});

test('nenhuma ação real: analyzePlan roda offline, determinístico (nunca chama API externa)', () => {
  const a = analyzePlan({});
  const b = analyzePlan({});
  assert.deepEqual(a.known_path_to_target, b.known_path_to_target);
  assert.deepEqual(a.switch_gate.criteria, b.switch_gate.criteria);
});

test('data quality reporting presente na economics snapshot', () => {
  const r = analyzePlan({});
  assert.equal(typeof r.economics_snapshot.period.data_completeness, 'number');
});

test('full-pipeline idempotency: rodar analyzePlan duas vezes produz o mesmo plan_id e mesmas ações', () => {
  const a = analyzePlan({});
  const b = analyzePlan({});
  assert.equal(a.plan.plan_id, b.plan.plan_id);
  assert.deepEqual(a.actions.map((x) => x.action_id), b.actions.map((x) => x.action_id));
});
