'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { rankStrategicActions, TIE_BREAK_FACTOR_ORDER } = require('../src/planner/ranking');
const { buildRoadmap, buildBestNextStrategicAction } = require('../src/planner/roadmap');
const { buildAction, resolveDependencies, finalizeActionStatuses, resetActionCounter } = require('../src/planner/strategicActions');
const { analyzePlan } = require('../src/planner/builder');

function actionFixture(overrides = {}) {
  return {
    action_id: 'A1', product_id: 'p', source_agent: 'CRO', source_candidate_id: 'C1',
    action_type: 'VALIDATE', objective: 'x', target_metric: null, confidence: 0.5,
    estimated_cost: 0, capital_required: 0, dependency_ids: [], status: 'READY',
    speed_to_evidence_days: null, risk: null,
    ...overrides,
  };
}

test('item 82: ranking é determinístico — mesma entrada produz o mesmo resultado', () => {
  const actions = [actionFixture({ action_id: 'A1' }), actionFixture({ action_id: 'A2', action_type: 'RUN_EXPERIMENT', confidence: 0.3 })];
  const r1 = rankStrategicActions(actions);
  const r2 = rankStrategicActions(actions);
  assert.deepEqual(r1.ranking.map((a) => a.action_id), r2.ranking.map((a) => a.action_id));
});

test('item 82: ordem do array de entrada é irrelevante pro resultado', () => {
  const a = actionFixture({ action_id: 'A', action_type: 'VALIDATE' });
  const b = actionFixture({ action_id: 'B', action_type: 'RUN_EXPERIMENT', confidence: 0.9 });
  const r1 = rankStrategicActions([a, b]);
  const r2 = rankStrategicActions([b, a]);
  assert.deepEqual(r1.ranking.map((x) => x.action_id), r2.ranking.map((x) => x.action_id));
});

test('item 82: action_id nunca é evidência de mérito — só desempata apresentação em empate real', () => {
  const a = actionFixture({ action_id: 'Z1' });
  const b = actionFixture({ action_id: 'A1' });
  const r = rankStrategicActions([a, b]);
  assert.equal(r.decision_tie, true);
  assert.deepEqual(r.decision_tie_action_ids.sort(), ['A1', 'Z1']);
});

test('item 82: DECISION_TIE declarado quando todos os 10 fatores são idênticos', () => {
  const a = actionFixture({ action_id: 'A' });
  const b = actionFixture({ action_id: 'B' });
  const r = rankStrategicActions([a, b]);
  assert.equal(r.decision_tie, true);
});

test('item 82: information_gain diferencia VALIDATE (custo ~0, decisivo) de RUN_EXPERIMENT no ranking', () => {
  const validate = actionFixture({ action_id: 'V1', action_type: 'VALIDATE' });
  const experiment = actionFixture({ action_id: 'E1', action_type: 'RUN_EXPERIMENT' });
  const r = rankStrategicActions([experiment, validate]);
  assert.equal(r.ranking[0].action_id, 'V1');
});

test('item 82: economic_impact é neutro hoje (nunca inventado) — não decide ranking sozinho', () => {
  const a = actionFixture({ action_id: 'A' });
  const c = rankStrategicActions([a]).ranking[0].tie_break_components;
  assert.equal(c.economic_impact_rank, 0);
});

test('item 82: cost menor rankeia melhor entre ações do mesmo tipo', () => {
  const cheap = actionFixture({ action_id: 'C1', action_type: 'RUN_EXPERIMENT', estimated_cost: 10 });
  const expensive = actionFixture({ action_id: 'C2', action_type: 'RUN_EXPERIMENT', estimated_cost: 500 });
  const r = rankStrategicActions([expensive, cheap]);
  assert.equal(r.ranking[0].action_id, 'C1');
});

test('item 82: risk menor rankeia melhor entre ações do mesmo tipo/custo', () => {
  const lowRisk = actionFixture({ action_id: 'R1', action_type: 'RUN_EXPERIMENT', risk: 1 });
  const highRisk = actionFixture({ action_id: 'R2', action_type: 'RUN_EXPERIMENT', risk: 3 });
  const r = rankStrategicActions([highRisk, lowRisk]);
  assert.equal(r.ranking[0].action_id, 'R1');
});

test('item 82: dependency_ids maior (mais dependências) rankeia pior', () => {
  const noDeps = actionFixture({ action_id: 'D1', dependency_ids: [] });
  const withDeps = actionFixture({ action_id: 'D2', dependency_ids: ['X'] });
  const r = rankStrategicActions([withDeps, noDeps]);
  assert.equal(r.ranking[0].action_id, 'D1');
});

test('ordem de fatores documentada (item 59/82)', () => {
  assert.deepEqual(TIE_BREAK_FACTOR_ORDER, [
    'decision_changing_evidence_rank', 'information_gain_rank', 'economic_impact_rank', 'confidence_rank',
    'cost_rank', 'capital_required_rank', 'dependency_rank', 'speed_to_evidence_rank', 'risk_rank', 'learning_value_rank',
  ]);
});

test('item 81: ação BLOCKED nunca aparece em NOW', () => {
  resetActionCounter();
  const a = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'X', actionType: 'VALIDATE', objective: 'validar' });
  const b = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'Y', actionType: 'RUN_EXPERIMENT', objective: 'rodar' });
  b.dependency_ids = [a.action_id];
  finalizeActionStatuses([a, b], []);
  const ranked = rankStrategicActions([a, b]);
  const roadmap = buildRoadmap(ranked.ranking);
  assert.equal(roadmap.now.includes(b.action_id), false);
  assert.equal(roadmap.next.includes(b.action_id), true);
});

test('item 81: NOW/NEXT/LATER é determinístico — mesma entrada produz o mesmo roadmap', () => {
  resetActionCounter();
  const a = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'X', actionType: 'VALIDATE', objective: 'validar' });
  finalizeActionStatuses([a], []);
  const ranked = rankStrategicActions([a]);
  const r1 = buildRoadmap(ranked.ranking);
  const r2 = buildRoadmap(ranked.ranking);
  assert.deepEqual(r1, r2);
});

test('item 81: validação técnica pode aparecer em NOW antes de um experimento pago (dependência real)', () => {
  resetActionCounter();
  const validate = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'X', actionType: 'VALIDATE', objective: 'validar bug técnico' });
  const experiment = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'Y', actionType: 'RUN_EXPERIMENT', objective: 'rodar experimento CRO' });
  resolveDependencies([validate, experiment]);
  finalizeActionStatuses([validate, experiment], []);
  const ranked = rankStrategicActions([validate, experiment]);
  const roadmap = buildRoadmap(ranked.ranking);
  assert.ok(roadmap.now.includes(validate.action_id));
});

test('item 73: best_next_strategic_action explica why_now e why_not_other_actions', () => {
  const a = actionFixture({ action_id: 'A1' });
  const b = actionFixture({ action_id: 'A2', action_type: 'RUN_EXPERIMENT' });
  const ranked = rankStrategicActions([a, b]);
  const best = buildBestNextStrategicAction(ranked.ranking);
  assert.ok(best.action);
  assert.ok(best.why_now);
  assert.ok(Array.isArray(best.why_not_other_actions));
});

test('integração real: analyzePlan() produz roadmap NOW/NEXT/LATER coerente e best_next_strategic_action', () => {
  const r = analyzePlan({});
  assert.ok(Array.isArray(r.roadmap.now));
  assert.ok(Array.isArray(r.roadmap.next));
  assert.ok(Array.isArray(r.roadmap.later));
  const allIds = [...r.roadmap.now, ...r.roadmap.next, ...r.roadmap.later];
  assert.equal(allIds.length, r.actions.length);
});
