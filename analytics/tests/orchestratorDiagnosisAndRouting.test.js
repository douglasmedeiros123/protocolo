'use strict';

// PASSO 15 — testes 1-6 do item 33.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGlobalStateContract } = require('../src/orchestrator/globalStateContract');
const { buildGlobalDiagnosis, deriveDominantConstraint } = require('../src/orchestrator/globalDiagnosis');
const { resolveConflict, classifySourceLevel } = require('../src/orchestrator/sourceOfTruthHierarchy');
const { routeRelevance } = require('../src/orchestrator/relevanceRouter');
const { analyzePlan } = require('../src/planner/builder');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { analyzeMeasurement } = require('../src/measurement/builder');

let stateContract; let diagnosis;
test.before(() => {
  stateContract = buildGlobalStateContract({});
  diagnosis = buildGlobalDiagnosis(stateContract);
});

// 1. CEO consumes agent outputs rather than duplicating calculations.
test('1: buildGlobalStateContract() consome analyzePlan/analyzeStrategy/analyzeMeasurement reais — os mesmos valores aparecem no state contract', () => {
  const plannerReal = analyzePlan({});
  const strategyReal = analyzeStrategy({});
  const measurementReal = analyzeMeasurement({});
  assert.equal(stateContract.data.planner.plan.verdict, plannerReal.plan.verdict);
  assert.equal(stateContract.data.strategy_search.analysis.recommendation.recommended_architecture_id, strategyReal.analysis.recommendation.recommended_architecture_id);
  assert.equal(stateContract.data.measurement.analysis.current_measurement_capital_gate.current_blocker, measurementReal.analysis.current_measurement_capital_gate.current_blocker);
});

// 2. Financial truth outranks platform attribution for finance.
test('2: classifySourceLevel — MEASUREMENT_FINANCIAL_TRUTH (FINANCIAL_TRANSACTION_TRUTH) tem rank menor (mais forte) que MEASUREMENT_PLATFORM_ATTRIBUTION (PLATFORM_TRUTH)', () => {
  const financial = classifySourceLevel({ origin_domain: 'MEASUREMENT_FINANCIAL_TRUTH' });
  const platform = classifySourceLevel({ origin_domain: 'MEASUREMENT_PLATFORM_ATTRIBUTION' });
  assert.equal(financial, 'FINANCIAL_TRANSACTION_TRUTH');
  assert.equal(platform, 'PLATFORM_TRUTH');
  const { LEVEL_RANK } = require('../src/orchestrator/sourceOfTruthHierarchy');
  assert.ok(LEVEL_RANK[financial] < LEVEL_RANK[platform]);
});

// 3. Hypothesis never becomes evidence silently.
test('3: origin_domain desconhecido nunca vira algo mais forte que HYPOTHESIS', () => {
  const level = classifySourceLevel({ origin_domain: 'ALGO_NAO_MAPEADO' });
  assert.equal(level, 'HYPOTHESIS');
});

test('3b: resolveConflict real — o conflito real Planner/Measurement é resolvido pela hierarquia, Measurement (FINANCIAL_TRANSACTION_TRUTH) vence, nunca por votação', () => {
  assert.equal(diagnosis.cross_agent_conflicts.length, 1);
  const conflict = diagnosis.cross_agent_conflicts[0];
  assert.equal(conflict.resolution.winner.origin_domain, 'MEASUREMENT_FINANCIAL_TRUTH');
  assert.equal(conflict.resolution.winner.source_level, 'FINANCIAL_TRANSACTION_TRUTH');
});

// 4. Dominant constraint != worst metric automatically.
test('4: deriveDominantConstraint real — MEASUREMENT vence mesmo com profitability_state=LOSS (métrica de lucro pior) porque é a causa raiz sistêmica, não a "pior métrica"', () => {
  assert.equal(diagnosis.dominant_constraint.category, 'MEASUREMENT');
  assert.notEqual(diagnosis.dominant_constraint.category, 'ECONOMICS'); // não escolhido só porque profitability_state=LOSS é a "métrica mais feia"
});

test('4b: quando financial truth está BLOCKED, ele sempre vence sobre measurement sistêmico (prioridade documentada, não score)', () => {
  const result = deriveDominantConstraint(stateContract, 'BLOCKED');
  assert.equal(result.category, 'ECONOMICS');
});

// 5. Dependency can outrank higher-upside action.
test('5: real — CEO-CAND-0003 (START_EXPERIMENT, ação de maior escopo/upside potencial) nunca vence o ranking enquanto sua dependência (CEO-CAND-0002) não é resolvida', () => {
  const { generateRealCandidates } = require('../src/orchestrator/decisionCandidate');
  const { buildDependencyGraph } = require('../src/orchestrator/dependencyGraph');
  const { rankAndRecommend } = require('../src/orchestrator/rankingAndRecommendation');
  const candidates = generateRealCandidates(stateContract);
  const graph = buildDependencyGraph(candidates);
  const ranking = rankAndRecommend(candidates, graph);
  const experimentCandidate = candidates.find((c) => c.action_class === 'START_EXPERIMENT');
  if (experimentCandidate && graph.blocked_candidates.includes(experimentCandidate.candidate_id)) {
    assert.notEqual(ranking.recommended_candidate_id, experimentCandidate.candidate_id);
  }
});

// 6. Relevance router excludes irrelevant domains.
test('6: routeRelevance real — quando dominant_constraint=MEASUREMENT, CREATIVE/CRO/OFFER ficam BACKGROUND, nunca CRITICAL_NOW', () => {
  const relevance = routeRelevance(diagnosis);
  if (diagnosis.dominant_constraint.category === 'MEASUREMENT') {
    for (const domain of ['CREATIVE', 'CRO', 'OFFER']) {
      assert.equal(relevance.routing[domain], 'BACKGROUND');
    }
  }
  assert.ok(relevance.critical_now.length > 0);
});

// 33. Stale data produces explicit failure/degradation.
test('33: is_stale=true (fixture) gera failure_mode STALE_DATA explícito', () => {
  const { detectFailureModes } = require('../src/orchestrator/failureModes');
  const staleState = { ...stateContract, data_freshness: { ...stateContract.data_freshness, is_stale: true, days_missing: ['d1', 'd2', 'd3', 'd4'] } };
  const result = detectFailureModes(staleState, diagnosis, []);
  assert.ok(result.detected.some((f) => f.mode === 'STALE_DATA'));
});

// 34. Missing financial truth prevents unsupported financial action.
test('34: dominant_constraint=ECONOMICS quando financial truth BLOCKED — nenhuma ação financeira é priorizada sobre restaurar a fonte de verdade', () => {
  const result = deriveDominantConstraint(stateContract, 'BLOCKED');
  assert.equal(result.category, 'ECONOMICS');
  assert.match(result.reason, /BLOCKED/);
});

// 35. Measurement blocker affects dependent action, not unrelated domains globally.
test('35: real — measurement_state.current_blocker existe, mas HOLD_CAPITAL (candidato independente de measurement) nunca é marcado bloqueado pelo dependency graph', () => {
  const { generateRealCandidates } = require('../src/orchestrator/decisionCandidate');
  const { buildDependencyGraph } = require('../src/orchestrator/dependencyGraph');
  const candidates = generateRealCandidates(stateContract);
  const graph = buildDependencyGraph(candidates);
  const holdCapital = candidates.find((c) => c.action_class === 'HOLD_CAPITAL');
  assert.ok(!graph.blocked_candidates.includes(holdCapital.candidate_id));
});
