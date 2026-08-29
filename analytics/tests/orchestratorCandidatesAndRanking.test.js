'use strict';

// PASSO 15 — testes 7-13 do item 33.

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyRelation } = require('../src/orchestrator/conflictResolver');
const { buildCandidateContract, resetCandidateCounter } = require('../src/orchestrator/decisionCandidate');
const { buildDependencyGraph } = require('../src/orchestrator/dependencyGraph');
const { rankAndRecommend } = require('../src/orchestrator/rankingAndRecommendation');
const { challengeDecision } = require('../src/orchestrator/decisionChallenger');
const { runLowConfidenceOpinionScenario, runTrueTieScenario } = require('../src/orchestrator/syntheticScenarios');
const { buildGlobalStateContract } = require('../src/orchestrator/globalStateContract');
const { buildGlobalDiagnosis } = require('../src/orchestrator/globalDiagnosis');

// 7. Conflict resolver does not majority-vote.
test('7: classifyRelation nunca conta "votos" — decide por dependência/recurso real, sempre determinístico pro mesmo par', () => {
  resetCandidateCounter();
  const a = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'a', dependencies: [] });
  const b = buildCandidateContract({ sourceAgent: 'Y', actionClass: 'START_EXPERIMENT', hypothesis: 'b', dependencies: [a.candidate_id] });
  const r1 = classifyRelation(a, b);
  const r2 = classifyRelation(a, b);
  assert.deepEqual(r1, r2);
  assert.equal(r1.relation, 'ENABLES');
});

// 8. Comparable alternatives require recommendation.
test('8: candidatos comparáveis (não empatados) sempre produzem recommended_candidate_id != null', () => {
  resetCandidateCounter();
  const a = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'a', voi: 'HIGH', confidence: 'HIGH', risk: 'LOW' });
  const b = buildCandidateContract({ sourceAgent: 'Y', actionClass: 'START_EXPERIMENT', hypothesis: 'b', voi: 'LOW', confidence: 'LOW', risk: 'HIGH' });
  const graph = buildDependencyGraph([a, b]);
  const ranking = rankAndRecommend([a, b], graph);
  assert.notEqual(ranking.recommended_candidate_id, null);
  assert.equal(ranking.no_defensible_preference, false);
});

// 9. LOW confidence can still recommend.
test('9: real — cenário de baixa confiança ainda emite recommended_candidate_id, nunca NO_DEFENSIBLE_PREFERENCE', () => {
  const result = runLowConfidenceOpinionScenario();
  assert.notEqual(result.ranking.recommended_candidate_id, null);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.is_no_defensible_preference, false);
});

// 10. True tie allows NO_DEFENSIBLE_PREFERENCE.
test('10: real — cenário de empate real permite NO_DEFENSIBLE_PREFERENCE', () => {
  const result = runTrueTieScenario();
  assert.equal(result.is_no_defensible_preference, true);
  assert.equal(result.ranking.recommended_candidate_id, null);
});

// 11. True tie recommends evidence collection.
test('11: real — empate real sempre vem acompanhado de best_evidence_to_collect_next não-vazio', () => {
  const result = runTrueTieScenario();
  assert.ok(result.best_evidence_to_collect_next && result.best_evidence_to_collect_next.length > 0);
});

// 12. Challenger can flag fragile assumption.
test('12: challengeDecision real sinaliza premissa frágil quando confidence do vencedor não é HIGH', () => {
  const stateContract = buildGlobalStateContract({});
  const diagnosis = buildGlobalDiagnosis(stateContract);
  resetCandidateCounter();
  const lowConfWinner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h', confidence: 'LOW' });
  const graph = buildDependencyGraph([lowConfWinner]);
  const result = challengeDecision({ winner: lowConfWinner, ranking: [lowConfWinner], diagnosis, graph });
  const fragileFlag = result.flags.find((f) => f.question.includes('suposição mais frágil'));
  assert.match(fragileFlag.flag, /confidence=LOW/);
});

// 13. Challenger cannot bypass CEO final process.
test('13: challengeDecision NUNCA decide — challenger_decides é sempre false, resultado nunca substitui o ranking', () => {
  const stateContract = buildGlobalStateContract({});
  const diagnosis = buildGlobalDiagnosis(stateContract);
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h', confidence: 'HIGH' });
  const graph = buildDependencyGraph([winner]);
  const result = challengeDecision({ winner, ranking: [winner], diagnosis, graph });
  assert.equal(result.challenger_decides, false);
  assert.equal(typeof result.recommended_candidate_id, 'undefined'); // challenger nunca produz um campo de decisão próprio
});
