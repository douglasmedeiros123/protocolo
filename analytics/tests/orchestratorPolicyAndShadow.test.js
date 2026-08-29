'use strict';

// PASSO 15 — testes 24-32, 36-41 do item 33.

const test = require('node:test');
const assert = require('node:assert/strict');

const { handoffToPolicyEngine } = require('../src/orchestrator/policyHandoff');
const { enforceShadowMode, SHADOW_MODE } = require('../src/orchestrator/shadowMode');
const { evaluateCeoPolicyChangeRequest, CEO_PROTECTED_DOMAINS } = require('../src/orchestrator/selfModificationProtection');
const { buildCounterfactualLog } = require('../src/orchestrator/counterfactualLog');
const { evaluateDecisionQuality } = require('../src/orchestrator/decisionQualityFramework');
const { buildLearningHandoffPackage } = require('../src/orchestrator/learningHandoff');
const { buildCandidateContract, resetCandidateCounter } = require('../src/orchestrator/decisionCandidate');
const { rankAndRecommend } = require('../src/orchestrator/rankingAndRecommendation');
const { buildDependencyGraph } = require('../src/orchestrator/dependencyGraph');
const { runCeoDecisionCycle } = require('../src/orchestrator/builder');
const { runR5000ShadowScenario, runOperatorDisagreementScenario } = require('../src/orchestrator/syntheticScenarios');
const { pullMeasurementSignals } = require('../src/execution/measurementHandoff');

// 24. Every executable recommendation enters Policy Engine.
test('24: handoffToPolicyEngine real sempre produz policy_allows não-nulo pra qualquer candidato vencedor real', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h', reversibility: 'REVERSIBLE' });
  const measurementSignals = pullMeasurementSignals({});
  const result = handoffToPolicyEngine({ winnerCandidate: winner, measurementSignals });
  assert.notEqual(result.policy_allows, null);
  assert.ok(result.dry_run.policy_result.category_results.length >= 11); // as 11 categorias reais rodaram
});

// 25. Approval Policy cannot be bypassed.
test('25: dry_run.approval_authority sempre presente no handoff — nunca pulado', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h', reversibility: 'REVERSIBLE' });
  const measurementSignals = pullMeasurementSignals({});
  const result = handoffToPolicyEngine({ winnerCandidate: winner, measurementSignals });
  assert.ok(result.dry_run.approval_authority);
  assert.equal(typeof result.dry_run.human_approval_required, 'boolean');
});

// 26. Circuit Breaker cannot be bypassed.
test('26: dry_run.circuit_breaker_state sempre presente e válido no handoff', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h', reversibility: 'REVERSIBLE' });
  const measurementSignals = pullMeasurementSignals({});
  const result = handoffToPolicyEngine({ winnerCandidate: winner, measurementSignals });
  assert.ok(['CLOSED', 'WARNING', 'OPEN', 'MANUAL_LOCK'].includes(result.dry_run.circuit_breaker_state));
});

// 27. SHADOW_MODE prevents external mutation even if all gates allow.
test('27: enforceShadowMode força would_execute=false mesmo no cenário mais favorável possível (ALLOW+não exige aprovação+CLOSED)', () => {
  const favorableResult = { policy_allows: 'ALLOW', approval_requires: false, circuit_breaker_state: 'CLOSED', ceo_recommends: {}, would_execute: true /* tentativa de bypass */ };
  const enforced = enforceShadowMode(favorableResult);
  assert.equal(enforced.would_execute, false);
  assert.equal(enforced.would_execute_if_authorized, true); // reconhece que SERIA permitido, mas não executa
  assert.equal(SHADOW_MODE, true);
});

// 28. CEO cannot modify protected policy domains.
test('28: evaluateCeoPolicyChangeRequest — CEO_ORCHESTRATOR nunca autorizado em nenhum domínio protegido, incluindo os específicos do CEO (NORTH_STAR_TARGET/SHADOW_MODE_FLAG/etc.)', () => {
  for (const domain of CEO_PROTECTED_DOMAINS) {
    const r = evaluateCeoPolicyChangeRequest({ domain, requestedByOrigin: 'CEO_ORCHESTRATOR' });
    assert.equal(r.allowed, false);
  }
  assert.ok(CEO_PROTECTED_DOMAINS.includes('SHADOW_MODE_FLAG'));
  assert.ok(CEO_PROTECTED_DOMAINS.includes('NORTH_STAR_TARGET'));
});

// 29. Decision ledger records rejected alternatives.
test('29: real — ciclo completo real produz counterfactual_log com todas as alternativas não-vencedoras', () => {
  const result = runCeoDecisionCycle({});
  const nonWinners = result.candidates.filter((c) => c.candidate_id !== result.ranking_result.recommended_candidate_id);
  assert.equal(result.counterfactual_log.length, nonWinners.length);
  for (const entry of result.counterfactual_log) assert.ok(entry.why_rejected);
});

// 30. Outcome != decision quality.
test('30: evaluateDecisionQuality — sem outcome real (null), status é sempre INSUFFICIENT_EVIDENCE_TO_JUDGE, nunca inferido do processo de decisão sozinho', () => {
  const r = evaluateDecisionQuality({ observedOutcome: null, evidenceAvailableAtDecisionTime: 'SUFFICIENT', policyCompliant: true, wasAvoidableError: false });
  assert.equal(r.status, 'INSUFFICIENT_EVIDENCE_TO_JUDGE');
});

test('30b: outcome positivo com decisão mal fundamentada nunca vira GOOD_DECISION — fica BAD_DECISION_GOOD_OUTCOME', () => {
  const r = evaluateDecisionQuality({ observedOutcome: 'POSITIVE', evidenceAvailableAtDecisionTime: 'INSUFFICIENT', policyCompliant: true, wasAvoidableError: true });
  assert.equal(r.status, 'BAD_DECISION_GOOD_OUTCOME');
});

// 31. Counterfactual outcome is never invented.
test('31: buildCounterfactualLog nunca inclui um campo de outcome contrafactual numérico/inventado — counterfactual_status é sempre NEVER_EXECUTED', () => {
  resetCandidateCounter();
  const a = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'a' });
  const b = buildCandidateContract({ sourceAgent: 'Y', actionClass: 'HOLD_CAPITAL', hypothesis: 'b' });
  const graph = buildDependencyGraph([a, b]);
  const ranking = rankAndRecommend([a, b], graph);
  const log = buildCounterfactualLog(ranking.ranking, ranking.recommended_candidate_id);
  for (const entry of log) {
    assert.match(entry.counterfactual_status, /NEVER_EXECUTED/);
    assert.equal(entry.hasOwnProperty('estimated_outcome'), false);
  }
});

// 32. Product-specific learning remains scoped.
test('32: buildLearningHandoffPackage — scope é sempre PRODUCT_SPECIFIC por padrão, nunca GLOBAL automaticamente', () => {
  const pkg = buildLearningHandoffPackage({ productId: 'p1', ledgerEntry: { cycle_id: 'c1', dominant_constraint: 'MEASUREMENT', recommended_action: 'x', confidence: 'HIGH' }, decisionQuality: { status: 'INSUFFICIENT_EVIDENCE_TO_JUDGE' }, outcomeEvidence: { result: 'POSITIVE' } });
  assert.equal(pkg.scope, 'PRODUCT_SPECIFIC');
  assert.notEqual(pkg.scope, 'GLOBAL');
});

test('32b: sem outcome real, ready_to_forward=false — nunca encaminha aprendizado inventado', () => {
  const pkg = buildLearningHandoffPackage({ productId: 'p1', ledgerEntry: {}, decisionQuality: {}, outcomeEvidence: null });
  assert.equal(pkg.ready_to_forward, false);
});

// 36. Operator request cannot override CEO evidence/policy.
test('36: real — cenário de desacordo com operador: CEO nunca executa só porque o operador pediu, orientação vem da Policy Engine real', () => {
  const result = runOperatorDisagreementScenario({});
  assert.equal(result.would_execute, false);
  assert.ok(['DO_NOT_EXECUTE', 'HOLD', 'COLLECT_EVIDENCE'].includes(result.ceo_orientation));
});

// 37. Synthetic R$5k does not imply all capital should be spent.
test('37: real — cenário R$5.000 sintético nunca recomenda gastar tudo — what_remains_reserve sempre presente', () => {
  const result = runR5000ShadowScenario({});
  assert.ok(result.what_remains_reserve);
  assert.notEqual(result.what_receives_zero.length, 0); // pelo menos um candidato fica de fora
});

// 38. Reserve can be best allocation.
test('38: capitalAllocationInterface (PASSO 14B, reusado read-only) — RESERVE pode vencer quando os outros candidatos são piores', () => {
  const { buildCandidate, rankCandidatesAndFindBestUse } = require('../src/execution/capitalAllocationInterface');
  const reserve = buildCandidate({ domain: 'RESERVE', expectedValue: 0, valueOfInformation: 'NOT_ASSESSABLE', risk: 'LOW' });
  const bad = buildCandidate({ domain: 'MEDIA', expectedValue: -500, valueOfInformation: 'LOW', risk: 'CRITICAL' });
  const ranked = rankCandidatesAndFindBestUse([bad, reserve]);
  assert.equal(ranked.best_use_of_next_capital.candidate, 'RESERVE');
});

// 39. Determinism.
test('39: real — runCeoDecisionCycle() é determinístico entre execuções (campos de decisão, exceto timestamps)', () => {
  const a = runCeoDecisionCycle({});
  const b = runCeoDecisionCycle({});
  assert.equal(a.diagnosis.dominant_constraint.category, b.diagnosis.dominant_constraint.category);
  assert.equal(a.final_orientation, b.final_orientation);
  assert.equal(a.ranking_result.recommended_candidate_id, b.ranking_result.recommended_candidate_id);
  assert.equal(a.policy_handoff.policy_allows, b.policy_handoff.policy_allows);
});

// 40. Zero external mutations.
test('40: real — runCeoDecisionCycle() nunca teria would_execute_externally=true, independente do resultado', () => {
  const result = runCeoDecisionCycle({});
  assert.equal(result.would_execute_externally, false);
  assert.equal(result.shadow_execution.would_execute, false);
  assert.equal(result.shadow_mode, true);
  assert.equal(result.autonomous_execution_capital, 0);
});

// 41. Write boundary.
test('41: registry.js do orchestrator só aponta pra analytics/data/orchestrator/', () => {
  const { DEFAULT_DIR } = require('../src/orchestrator/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/orchestrator'));
});
