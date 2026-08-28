'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { assessTracking } = require('../src/decision/trackingAssessment');
const { buildDecision } = require('../src/decision/builder');
const { writeJson } = require('../src/utils/fs');

function makeExperiment(overrides = {}) {
  return {
    experiment_id: 'CRO-001',
    status: 'DRAFT',
    category: 'CRO',
    target_metric: 'taxa_lpv_checkout',
    hypothesis: { statement: 'reduzir fricção da LP aumenta a taxa LPV->checkout' },
    baseline: { cpa_financeiro: 109.79, roas_financeiro: 0.593 },
    budget_limit: 281.8,
    budget_check: { max_budget_percent_of_cycle: 0.3 },
    priority: { factors: { confidence: 0.8, risk: 1 }, speed_dias_estimado: 7 },
    minimum_evidence: { lpv: 100, checkouts: 10, compras: null, spend: null, duration_days: 7 },
    expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } },
    failure_condition: 'taxa_lpv_checkout do período de teste <= baseline',
    success_condition: 'taxa_lpv_checkout do período de teste >= baseline * 1.20',
    attacks_path: 'CPA',
    ...overrides,
  };
}

function makeProfitSnapshot({ roas30d = 0.62, roas7d = 0.6, roas14d = 0.65, dataCompleteness = 0.97, financialConfidence = 'normal', from = '2026-01-01', to = '2026-01-30' } = {}) {
  const win = (roas) => ({ current_financials: { roas_financeiro: roas }, data_quality: { data_completeness: dataCompleteness, financial_confidence: financialConfidence }, period: { from, to } });
  return { found: true, snapshot_date: to, is_stale: false, snapshot: { windows: { last_30d: win(roas30d), last_14d: win(roas14d), last_7d: win(roas7d) } } };
}

function makeTempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'decision-test-'));
}

function writeDailyFixture(dataDir, date, { hasCriticalFlags = false, criticalFlagCodes = [] } = {}) {
  writeJson(path.join(dataDir, 'daily', `${date}.json`), { date, has_critical_flags: hasCriticalFlags, critical_flag_codes: criticalFlagCodes, meta: null, hotmart: null });
}

test('trackingAssessment: flag BLOQUEANTE (MISSING_DATA) -> is_blocking true, confidence zerada', () => {
  const r = assessTracking([{ date: '2026-01-05', codes: ['MISSING_DATA'] }]);
  assert.equal(r.is_blocking, true);
  assert.equal(r.confidence_score, 0);
});

test('trackingAssessment: flag DEGRADANTE (META_PURCHASE_WITHOUT_HOTMART_SALE) reduz confidence mas não bloqueia', () => {
  const r = assessTracking([{ date: '2026-01-05', codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] }]);
  assert.equal(r.is_blocking, false);
  assert.ok(r.confidence_score < 100 && r.confidence_score > 0);
});

test('trackingAssessment: sem flags -> confidence 100, não bloqueante', () => {
  const r = assessTracking([]);
  assert.equal(r.is_blocking, false);
  assert.equal(r.confidence_score, 100);
});

test('trackingAssessment: penalidade degradante tem piso 40 (nunca zera sozinha)', () => {
  const r = assessTracking(Array.from({ length: 20 }, (_, i) => ({ date: `2026-01-${i + 1}`, codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] })));
  assert.equal(r.is_blocking, false);
  assert.equal(r.confidence_score, 40);
});

test('builder: tracking BLOQUEANTE prioriza FIX_TRACKING mesmo com um ótimo candidato de experimento disponível', () => {
  const dataDir = makeTempDataDir();
  writeDailyFixture(dataDir, '2026-01-15', { hasCriticalFlags: true, criticalFlagCodes: ['MISSING_DATA'] });
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment()],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
    dataDir,
  });
  assert.equal(decision.action_type, 'FIX_TRACKING');
  assert.equal(decision.attacks_path, 'TRACKING');
  assert.equal(decision.experiment_id, null);
});

test('builder: capital não configurado -> PROTECT_CAPITAL + DO_NOT_SPEND', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment()],
    hypotheses: [],
    capitalCycle: { status: 'CAPITAL_NOT_CONFIGURED', cycle_budget: null, cycle_start: null, cycle_end: null },
  });
  assert.equal(decision.action_type, 'PROTECT_CAPITAL');
  assert.equal(decision.best_use_of_next_100.action, 'DO_NOT_SPEND');
});

test('builder: capital configurado mas esgotado (cycle_available <= 0) -> PROTECT_CAPITAL', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment()],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 100, cycle_spent: 100, cycle_available: 0, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.equal(decision.action_type, 'PROTECT_CAPITAL');
});

test('builder: capital insuficiente pra QUALQUER candidato existente (mas > 0) -> PROTECT_CAPITAL com motivo distinto de "não configurado"', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment({ budget_limit: 281.8, budget_check: { max_budget_percent_of_cycle: null } })],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 10, cycle_spent: 0, cycle_available: 10, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.equal(decision.action_type, 'PROTECT_CAPITAL');
  assert.match(decision.reason, /capital disponível/);
  assert.doesNotMatch(decision.reason, /não configurado/);
});

test('builder: candidatos elegíveis mas nenhum com expected value positivo -> MAINTAIN, best_use_of_next_100 = DO_NOT_SPEND', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment({ expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: -10 }, roas_impact: { delta: -0.01 } } })],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.equal(decision.action_type, 'MAINTAIN');
  assert.equal(decision.best_use_of_next_100.action, 'DO_NOT_SPEND');
});

test('builder: nenhum experimento DRAFT/READY disponível -> COLLECT_MORE_DATA', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.equal(decision.action_type, 'COLLECT_MORE_DATA');
});

test('builder: escolhe entre CRO e CREATIVE pelo maior expected_value_score, alternativa explica a diferença', () => {
  const cro = makeExperiment({ experiment_id: 'CRO-001', category: 'CRO', expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 41.78 }, roas_impact: { delta: 0.1 } } });
  const creative = makeExperiment({ experiment_id: 'CREATIVE-001', category: 'CREATIVE', expected_effect: { lucro_impact: { delta_vs_nao_fazer_nada: 29.49 }, roas_impact: { delta: 0.1 } } });
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [cro, creative],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.equal(decision.action_type, 'RUN_EXPERIMENT');
  assert.equal(decision.experiment_id, 'CRO-001');
  const alt = decision.alternative_actions.find((a) => a.experiment_id === 'CREATIVE-001');
  assert.ok(alt);
  assert.match(alt.reason_lost_to_winner, /expected_value_score menor/);
});

test('builder: kill_condition reflete a failure_condition do experimento vencedor', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [makeExperiment()],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.match(decision.kill_condition, /taxa_lpv_checkout do período de teste <= baseline/);
});

test('builder: kill_condition tem fallback genérico quando a ação não é RUN_EXPERIMENT', () => {
  const decision = buildDecision({
    productId: null,
    profitSnapshotResult: makeProfitSnapshot(),
    experiments: [],
    hypotheses: [],
    capitalCycle: { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_available: 1000, cycle_start: '2026-01-01', cycle_end: '2026-01-07' },
  });
  assert.match(decision.kill_condition, /revisar a decisão/);
});
