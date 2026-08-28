'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildCapitalTranches, N_TRANCHES_BY_RISK } = require('../src/decision/tranches');
const { computeDecisionConfidence, WEIGHTS } = require('../src/decision/confidence');
const { computeDecisionFingerprint } = require('../src/decision/fingerprint');
const { buildDecision } = require('../src/decision/builder');
const { saveDecision, loadDecision, loadAllDecisions } = require('../src/decision/registry');
const { loadAllExperiments } = require('../src/experiments/registry');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CRO-001',
    status: 'DRAFT',
    category: 'CRO',
    target_metric: 'taxa_lpv_checkout',
    hypothesis: { statement: 'x' },
    baseline: { cpa_financeiro: 109.79 },
    budget_limit: 281.8,
    budget_check: { max_budget_percent_of_cycle: 0.3 },
    priority: { factors: { confidence: 0.8, risk: 1 }, speed_dias_estimado: 7 },
    minimum_evidence: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
    expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } },
    failure_condition: 'piorou',
    success_condition: 'melhorou 20%+',
    attacks_path: 'CPA',
    ...overrides,
  };
}

function makeProfitSnapshot() {
  const win = { current_financials: { roas_financeiro: 0.62 }, data_quality: { data_completeness: 0.97, financial_confidence: 'normal' }, period: { from: '2026-01-01', to: '2026-01-30' } };
  return { found: true, snapshot_date: '2026-01-30', is_stale: false, snapshot: { windows: { last_30d: win, last_14d: win, last_7d: win } } };
}

const CYCLE = { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' };

test('tranches: número de tranches escala com o risco (mais risco = mais tranches, tabela documentada)', () => {
  assert.equal(N_TRANCHES_BY_RISK[1], 2);
  assert.ok(N_TRANCHES_BY_RISK[5] > N_TRANCHES_BY_RISK[1]);
});

test('tranches: primeira tranche NÃO exige evidência prévia (liberação inicial)', () => {
  const r = buildCapitalTranches(makeExperiment({ budget_limit: 300 }), CYCLE);
  assert.match(r.tranches[0].release_condition, /liberação inicial/);
  assert.match(r.tranches[0].release_condition, /nenhuma evidência prévia/);
});

test('tranches: próxima tranche é condicionada a evidência parcial (não é automática)', () => {
  const r = buildCapitalTranches(makeExperiment({ budget_limit: 300 }), CYCLE);
  assert.match(r.tranches[1].release_condition, /não atingiu failure_condition/);
  assert.match(r.tranches[1].release_condition, /sinal parcial válido/);
});

test('tranches: soma das tranches bate com o budget_limit quando cabe no ciclo', () => {
  const r = buildCapitalTranches(makeExperiment({ budget_limit: 281.8 }), CYCLE);
  assert.equal(r.total_allocated, 281.8);
  assert.equal(r.capped, false);
});

test('tranches: NÃO hardcoda um valor universal (ex: R$80) — valor muda com budget_limit do experimento', () => {
  const a = buildCapitalTranches(makeExperiment({ budget_limit: 300, priority: { factors: { risk: 1 } } }), CYCLE);
  const b = buildCapitalTranches(makeExperiment({ budget_limit: 900, priority: { factors: { risk: 1 } } }), CYCLE);
  assert.notEqual(a.tranches[0].amount, b.tranches[0].amount);
  assert.notEqual(a.tranches[0].amount, 80);
});

test('tranches: budget_limit maior que cycle_available é cortado pro disponível, nunca libera mais do que existe', () => {
  const smallCycle = { status: 'CONFIGURED', cycle_budget: 100, cycle_spent: 0, cycle_available: 100 };
  const r = buildCapitalTranches(makeExperiment({ budget_limit: 300 }), smallCycle);
  assert.equal(r.capped, true);
  assert.equal(r.total_allocated, 100);
});

test('tranches: cycle_available zero -> nenhuma tranche liberável', () => {
  const zeroCycle = { status: 'CONFIGURED', cycle_budget: 100, cycle_spent: 100, cycle_available: 0 };
  const r = buildCapitalTranches(makeExperiment({ budget_limit: 300 }), zeroCycle);
  assert.deepEqual(r.tranches, []);
});

test('decisionConfidence: pesos somam 1.0', () => {
  const sum = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  assert.equal(Math.round(sum * 100) / 100, 1);
});

test('decisionConfidence: melhor cenário possível se aproxima de 100', () => {
  const r = computeDecisionConfidence({ dataCompleteness: 1, trackingConfidenceScore: 100, experimentConfidence: 1, priorLearningVerdict: 'SUPPORTING_EVIDENCE', financialConfidence: 'normal' });
  assert.ok(r.decision_confidence >= 95);
});

test('decisionConfidence: pior cenário fica baixo', () => {
  const r = computeDecisionConfidence({ dataCompleteness: 0, trackingConfidenceScore: 0, experimentConfidence: 0, priorLearningVerdict: 'PREVIOUSLY_INVALIDATED', financialConfidence: 'degraded' });
  assert.ok(r.decision_confidence < 30);
});

test('fingerprint: mesmos inputs -> mesmo hash (determinístico)', () => {
  const inputs = { a: 1, b: [1, 2, 3], mode: 'RECOVERY' };
  assert.equal(computeDecisionFingerprint(inputs), computeDecisionFingerprint(inputs));
});

test('fingerprint: inputs diferentes -> hash diferente', () => {
  assert.notEqual(computeDecisionFingerprint({ mode: 'RECOVERY' }), computeDecisionFingerprint({ mode: 'GROWTH' }));
});

test('fingerprint: ordem das chaves não importa (canonicalize antes do hash)', () => {
  assert.equal(computeDecisionFingerprint({ a: 1, b: 2 }), computeDecisionFingerprint({ b: 2, a: 1 }));
});

test('idempotência: buildDecision() com o MESMO estado de entrada produz o MESMO decision_id sempre', () => {
  const input = { productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE };
  const d1 = buildDecision(input);
  const d2 = buildDecision(input);
  assert.equal(d1.decision_id, d2.decision_id);
  assert.equal(d1.fingerprint, d2.fingerprint);
});

test('idempotência: estado de entrada DIFERENTE produz decision_id diferente', () => {
  const base = { productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE };
  const changed = { ...base, experiments: [makeExperiment({ budget_limit: 999 })] };
  assert.notEqual(buildDecision(base).decision_id, buildDecision(changed).decision_id);
});

test('idempotência: saveDecision() duas vezes NÃO cria arquivos duplicados, preserva created_at', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-registry-test-'));
  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE });

  const first = saveDecision(decision, dir);
  const filesAfterFirst = fs.readdirSync(dir);
  const second = saveDecision({ ...decision, created_at: new Date(Date.now() + 100000).toISOString() }, dir);
  const filesAfterSecond = fs.readdirSync(dir);

  assert.equal(filesAfterFirst.length, 1);
  assert.deepEqual(filesAfterFirst, filesAfterSecond); // nenhum arquivo novo criado
  assert.equal(second.created_at, first.created_at); // created_at original preservado
  assert.equal(loadDecision(decision.decision_id, dir).decision_id, decision.decision_id);
});

test('product_id: decisão nasce com product_id resolvido (default do config quando não informado)', () => {
  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE });
  assert.ok(decision.product_id);
  assert.equal(typeof decision.product_id, 'string');
  assert.match(decision.decision_id, new RegExp(`^DEC-${decision.product_id}-`));
});

test('nenhuma ação real: buildDecision + saveDecision NUNCA tocam analytics/data/experiments/ (só leem, nunca escrevem)', () => {
  const before = loadAllExperiments().map((e) => JSON.stringify(e));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-safety-test-'));
  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE });
  saveDecision(decision, dir);
  const after = loadAllExperiments().map((e) => JSON.stringify(e));
  assert.deepEqual(before, after);
});

test('nenhuma ação real: decision object nunca tem campos de execução (sem "executed", sempre decision_status=RECOMMENDED)', () => {
  const decision = buildDecision({ productId: null, profitSnapshotResult: makeProfitSnapshot(), experiments: [makeExperiment()], hypotheses: [], capitalCycle: CYCLE });
  assert.equal(decision.decision_status, 'RECOMMENDED');
  assert.equal('executed' in decision, false);
  assert.equal('executed_at' in decision, false);
});
