'use strict';

const { buildCandidateContract, resetCandidateCounter } = require('./decisionCandidate');
const { buildDependencyGraph } = require('./dependencyGraph');
const { rankAndRecommend } = require('./rankingAndRecommendation');
const { challengeDecision } = require('./decisionChallenger');
const { buildCapitalAllocationAwareness } = require('./capitalAllocationAwareness');
const { buildGlobalStateContract } = require('./globalStateContract');
const { buildGlobalDiagnosis } = require('./globalDiagnosis');

const SYNTHETIC_MARKER = 'SYNTHETIC_FIXTURE_NEVER_A_REAL_POLICY_OR_STATE';

// item 28 — R$5.000 sintético. Estado real como base, capital sintético como pergunta
// hipotética. NUNCA "gaste R$5.000" — considera reserve/measurement/experiments/media/offer/
// creative/CRO/new_product/hold como alternativas reais de alocação, sem inventar EV.
function runR5000ShadowScenario({ productId, dataDir, referenceDate } = {}) {
  const stateContract = buildGlobalStateContract({ productId, dataDir, referenceDate });
  const diagnosis = buildGlobalDiagnosis(stateContract);
  resetCandidateCounter();

  const mustHave = stateContract.data.measurement.analysis.recommendation.must_have_before_test[0];
  const candidates = [
    buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'HOLD_CAPITAL', hypothesis: 'manter os R$5.000 sintéticos em reserva.', capitalRequired: 0, ev: 0, voi: 'NOT_ASSESSABLE', reversibility: 'REVERSIBLE', blastRadius: 'SINGLE_ASSET', confidence: 'HIGH', risk: 'LOW' }),
    buildCandidateContract({ sourceAgent: 'MEASUREMENT', actionClass: 'COLLECT_EVIDENCE', hypothesis: mustHave ? mustHave.description : 'resolver o blocker de mensuração real.', capitalRequired: 0, voi: 'HIGH', reversibility: 'REVERSIBLE', blastRadius: 'SINGLE_ASSET', confidence: 'HIGH', risk: 'LOW' }),
    buildCandidateContract({ sourceAgent: 'STRATEGY_SEARCH', actionClass: 'START_EXPERIMENT', hypothesis: `MVA test do vencedor real do Strategy Search (${stateContract.data.strategy_search.analysis.recommendation.recommended_architecture_id}), agora COM capital sintético disponível pra financiar o teste.`, capitalRequired: 'UNKNOWN', voi: 'HIGH', reversibility: 'REVERSIBLE', blastRadius: 'FUNNEL', confidence: stateContract.data.strategy_search.analysis.recommendation.confidence, risk: 'HIGH', dependencies: [] }),
    buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'START_EXPERIMENT', hypothesis: 'financiar validação de novo produto (Product Selection Agent não implementado — candidato conceitual).', capitalRequired: 'UNKNOWN', voi: 'UNKNOWN', reversibility: 'UNKNOWN', blastRadius: 'GLOBAL', confidence: 'NOT_ASSESSABLE', risk: 'UNKNOWN' }),
  ];
  const graph = buildDependencyGraph(candidates);
  const ranking = rankAndRecommend(candidates, graph);
  const capitalAllocation = buildCapitalAllocationAwareness(candidates);

  return {
    marker: SYNTHETIC_MARKER,
    synthetic_capital_available: 5000,
    dominant_constraint: diagnosis.dominant_constraint.category,
    ranking, capital_allocation_awareness: capitalAllocation,
    recommended_allocation_posture: ranking.recommended_candidate_id,
    what_receives_capital_first: ranking.recommended_candidate_id,
    what_receives_zero: ranking.ranking.filter((c) => c.candidate_id !== ranking.recommended_candidate_id).map((c) => c.candidate_id),
    what_remains_reserve: candidates.find((c) => c.action_class === 'HOLD_CAPITAL').candidate_id,
    why: ranking.rationale || ranking.reason,
    note: 'R$5.000 é uma fixture SINTÉTICA — nunca vira política real. Nenhum EV foi inventado; candidatos sem EV real ficam UNKNOWN.',
  };
}

// item 29 — operador pede "escale mídia agora", mas evidência/política não suporta.
function runOperatorDisagreementScenario({ productId, dataDir, referenceDate } = {}) {
  const { handoffToPolicyEngine } = require('./policyHandoff');
  const { enforceShadowMode } = require('./shadowMode');
  const { pullMeasurementSignals } = require('../execution/measurementHandoff');

  resetCandidateCounter();
  const operatorRequestedCandidate = buildCandidateContract({
    sourceAgent: 'OPERATOR_REQUEST', actionClass: 'START_EXPERIMENT', hypothesis: 'SINTÉTICO: operador pede "escale mídia agora" — sem evidência real de marginal_roas/sample_sufficient por trás.',
    capitalRequired: 5000, voi: 'LOW', reversibility: 'PARTIALLY_REVERSIBLE', blastRadius: 'ACCOUNT', confidence: 'LOW', risk: 'CRITICAL', ev: 'UNKNOWN',
  });
  const measurementSignals = pullMeasurementSignals({ productId, dataDir, referenceDate });
  const policyResult = handoffToPolicyEngine({ winnerCandidate: operatorRequestedCandidate, measurementSignals });
  const shadowResult = enforceShadowMode(policyResult);

  const ceoOrientation = policyResult.policy_allows === 'ALLOW' ? 'EXECUTE' : (policyResult.policy_allows === 'DENY' ? 'DO_NOT_EXECUTE' : 'COLLECT_EVIDENCE');

  return {
    marker: SYNTHETIC_MARKER,
    operator_request: 'escalar mídia agora (sintético)',
    ceo_orientation: ceoOrientation,
    policy_result: policyResult.policy_allows,
    approval_requires: policyResult.approval_requires,
    would_execute: shadowResult.would_execute,
    note: 'CEO NÃO é command executor cego — a orientação vem da Policy Engine real avaliando o candidato sintético, nunca da alegação do operador sozinha.',
  };
}

// item 30 — muitos experimentos concluídos, economics persistentemente ruins, hypothesis space
// exhausted, alternativas críveis superiores. CEO deve poder recomendar SWITCH_PRODUCT mesmo com
// sunk cost.
function runChallengeCurrentProductScenario() {
  const { evaluateProductViabilityEscalation } = require('./productViabilityEscalation');
  const syntheticSwitchGate = {
    eligible: true, fail_count: 0, unknown_count: 0,
    reason: 'SINTÉTICO: todos os critérios estruturais atendidos com evidência real simulada.',
    criteria: { completed_experiments: { status: 'PASS', reason: '5 experimentos concluídos (sintético).' }, key_levers_explored: { status: 'PASS', reason: 'CREATIVE/CRO/OFFER todos com experimento concluído (sintético).' } },
    minimum_invalidation_evidence: { description: '3 experimentos + 1 por lever-chave + gap econômico implausível (sintético, atendido).' },
  };
  const syntheticHypothesisSpace = { status: 'EXHAUSTED', reason: 'SINTÉTICO: espaço de hipóteses exaurido.' };
  const syntheticPlan = { current_state: { profit_status: { status: 'CRITICAL_LOSS' } }, north_star: { roas_gap_percent: 0.9 } };

  const result = evaluateProductViabilityEscalation({ plannerPlan: syntheticPlan, switchGate: syntheticSwitchGate, hypothesisSpaceStatus: syntheticHypothesisSpace });
  return { marker: SYNTHETIC_MARKER, escalation_result: result, recommends_switch_despite_sunk_cost: result.escalation === 'SWITCH_PRODUCT' };
}

// item 31 — alternativas rankeáveis, evidência limitada -> recomendação com confidence=LOW,
// nunca NO_DEFENSIBLE_PREFERENCE.
function runLowConfidenceOpinionScenario() {
  resetCandidateCounter();
  const a = buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'START_EXPERIMENT', hypothesis: 'SINTÉTICO A: candidato com VOI HIGH mas confidence LOW.', voi: 'HIGH', confidence: 'LOW', risk: 'MEDIUM', reversibility: 'REVERSIBLE', capitalRequired: 100 });
  const b = buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'START_EXPERIMENT', hypothesis: 'SINTÉTICO B: candidato com VOI MEDIUM.', voi: 'MEDIUM', confidence: 'LOW', risk: 'MEDIUM', reversibility: 'REVERSIBLE', capitalRequired: 100 });
  const graph = buildDependencyGraph([a, b]);
  const ranking = rankAndRecommend([a, b], graph);
  return { marker: SYNTHETIC_MARKER, ranking, emits_recommendation: ranking.recommended_candidate_id != null, confidence: ranking.confidence, is_no_defensible_preference: ranking.no_defensible_preference };
}

// item 32 — cenário realmente incomparável -> NO_DEFENSIBLE_PREFERENCE + BEST_EVIDENCE_TO_COLLECT_NEXT.
function runTrueTieScenario() {
  resetCandidateCounter();
  const a = buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'START_EXPERIMENT', hypothesis: 'SINTÉTICO A: idêntico a B em todos os fatores de desempate.', voi: 'MEDIUM', confidence: 'MEDIUM', risk: 'MEDIUM', reversibility: 'REVERSIBLE', capitalRequired: 100 });
  const b = buildCandidateContract({ sourceAgent: 'CEO_SYNTHETIC', actionClass: 'START_EXPERIMENT', hypothesis: 'SINTÉTICO B: idêntico a A em todos os fatores de desempate.', voi: 'MEDIUM', confidence: 'MEDIUM', risk: 'MEDIUM', reversibility: 'REVERSIBLE', capitalRequired: 100 });
  const graph = buildDependencyGraph([a, b]);
  const ranking = rankAndRecommend([a, b], graph);
  return { marker: SYNTHETIC_MARKER, ranking, is_no_defensible_preference: ranking.no_defensible_preference, best_evidence_to_collect_next: ranking.best_evidence_to_collect_next };
}

module.exports = {
  SYNTHETIC_MARKER, runR5000ShadowScenario, runOperatorDisagreementScenario,
  runChallengeCurrentProductScenario, runLowConfidenceOpinionScenario, runTrueTieScenario,
};
