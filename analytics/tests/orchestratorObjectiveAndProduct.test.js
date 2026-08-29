'use strict';

// PASSO 15 — testes 14-23 do item 33.

const test = require('node:test');
const assert = require('node:assert/strict');

const { challengeStatusQuo } = require('../src/orchestrator/statusQuoChallenge');
const { evaluateProductViabilityEscalation } = require('../src/orchestrator/productViabilityEscalation');
const { locateCurrentPositionInHierarchy } = require('../src/orchestrator/economicObjectiveHierarchy');
const { buildActionabilityContract } = require('../src/orchestrator/actionability');
const { buildCandidateContract, resetCandidateCounter } = require('../src/orchestrator/decisionCandidate');
const { runCeoDecisionCycle, deriveFinalOrientation } = require('../src/orchestrator/builder');
const { runChallengeCurrentProductScenario } = require('../src/orchestrator/syntheticScenarios');
const { buildGlobalStateContract } = require('../src/orchestrator/globalStateContract');
const { buildGlobalDiagnosis } = require('../src/orchestrator/globalDiagnosis');

let stateContract; let diagnosis;
test.before(() => { stateContract = buildGlobalStateContract({}); diagnosis = buildGlobalDiagnosis(stateContract); });

// 14. Current product has no status-quo privilege.
test('14: challengeStatusQuo real — conclusão KEEP_CURRENT_PRODUCT vem com privileged_by_sunk_cost=false explícito, sempre justificada por evidência', () => {
  const result = challengeStatusQuo(diagnosis);
  assert.equal(result.privileged_by_sunk_cost, false);
  assert.ok(result.reason.length > 0);
});

// 15. CEO can recommend SWITCH_PRODUCT.
test('15: real — cenário sintético com switch_gate.eligible=true produz escalation=SWITCH_PRODUCT', () => {
  const result = runChallengeCurrentProductScenario();
  assert.equal(result.escalation_result.escalation, 'SWITCH_PRODUCT');
  assert.equal(result.recommends_switch_despite_sunk_cost, true);
});

// 16. CEO can recommend HOLD_CAPITAL.
test('16: deriveFinalOrientation — candidato vencedor HOLD_CAPITAL sempre produz orientação HOLD_CAPITAL', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'HOLD_CAPITAL', hypothesis: 'h' });
  const orientation = deriveFinalOrientation({ winnerCandidate: winner, policyResult: { policy_allows: 'ALLOW' }, statusQuoResult: {}, viabilityResult: { escalation: 'CONTINUE_VALIDATION' } });
  assert.equal(orientation, 'HOLD_CAPITAL');
});

// 17. CEO can recommend DO_NOT_EXECUTE.
test('17: deriveFinalOrientation — START_EXPERIMENT com policy DENY produz DO_NOT_EXECUTE', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h' });
  const orientation = deriveFinalOrientation({ winnerCandidate: winner, policyResult: { policy_allows: 'DENY' }, statusQuoResult: {}, viabilityResult: { escalation: 'CONTINUE_VALIDATION' } });
  assert.equal(orientation, 'DO_NOT_EXECUTE');
});

// 18. CEO can recommend COLLECT_EVIDENCE.
test('18: deriveFinalOrientation — candidato COLLECT_EVIDENCE sempre produz orientação COLLECT_EVIDENCE; e NO_DEFENSIBLE_PREFERENCE (winner=null) também', () => {
  resetCandidateCounter();
  const winner = buildCandidateContract({ sourceAgent: 'X', actionClass: 'COLLECT_EVIDENCE', hypothesis: 'h' });
  assert.equal(deriveFinalOrientation({ winnerCandidate: winner, policyResult: {}, statusQuoResult: {}, viabilityResult: { escalation: 'CONTINUE_VALIDATION' } }), 'COLLECT_EVIDENCE');
  assert.equal(deriveFinalOrientation({ winnerCandidate: null, policyResult: {}, statusQuoResult: {}, viabilityResult: { escalation: 'CONTINUE_VALIDATION' } }), 'COLLECT_EVIDENCE');
});

// 19. ROAS3 is north star, not every-test requirement.
test('19: buildTargetGapAwareness — north_star_is_milestone_not_per_test_requirement é sempre true', () => {
  const { buildTargetGapAwareness } = require('../src/orchestrator/targetGapAwareness');
  const result = buildTargetGapAwareness(stateContract);
  assert.equal(result.north_star_is_milestone_not_per_test_requirement, true);
});

test('19b: scaleLadder (execution/PASSO 14B) STAGE_0/1 real não exige roas_requirement=3.0 — reforça o mesmo princípio', () => {
  const { SCALE_LADDER_DEFINITIONS } = require('../src/execution/scaleLadder');
  assert.match(SCALE_LADDER_DEFINITIONS.STAGE_0_VALIDATION.roas_requirement, /NENHUM/);
});

// 20. Absolute profit objective outranks cosmetic ROAS.
test('20: ECONOMIC_OBJECTIVE_HIERARCHY tem MAXIMIZE_SUSTAINABLE_ABSOLUTE_PROFIT como último nível (objetivo final), nunca um ROAS cosmético isolado', () => {
  const { ECONOMIC_OBJECTIVE_HIERARCHY } = require('../src/orchestrator/enums');
  assert.equal(ECONOMIC_OBJECTIVE_HIERARCHY[ECONOMIC_OBJECTIVE_HIERARCHY.length - 1], 'MAXIMIZE_SUSTAINABLE_ABSOLUTE_PROFIT');
});

// 21. Product is not killed prematurely with unexplored hypothesis space.
test('21: real — evaluateProductViabilityEscalation com hypothesis_space=LARGELY_UNEXPLORED + 0 experimentos NUNCA retorna KILL_PRODUCT', () => {
  const result = evaluateProductViabilityEscalation({ plannerPlan: stateContract.data.planner.plan, switchGate: stateContract.data.planner.switch_gate, hypothesisSpaceStatus: stateContract.data.planner.hypothesis_space_status });
  assert.notEqual(result.escalation, 'KILL_PRODUCT');
  assert.equal(result.escalation, 'CONTINUE_VALIDATION');
});

// 22. UNKNOWN EV remains UNKNOWN.
test('22: buildCandidateContract sem ev explícito fica UNKNOWN, nunca 0/null silencioso', () => {
  resetCandidateCounter();
  const c = buildCandidateContract({ sourceAgent: 'X', actionClass: 'START_EXPERIMENT', hypothesis: 'h' });
  assert.equal(c.ev, 'UNKNOWN');
});

// 23. Recommendation is actionable.
test('23: buildActionabilityContract real nunca produz "melhorar conversão" genérico — what/why/owner/dependencies/signals derivados do candidato real', () => {
  const contract = buildActionabilityContract(
    { hypothesis: 'registrar exposure identity prospectivamente e preparar o MVA test do advertorial', action_class: 'COLLECT_EVIDENCE', source_agent: 'MEASUREMENT', dependencies: [], measurement_requirements: ['EXPOSURE_IDENTITY'], evidence: ['x'], capital_required: 0 },
    { authorityTier: 'TIER_0_ANALYZE_ONLY' },
  );
  assert.doesNotMatch(contract.what, /^melhorar conversão$/i);
  assert.ok(contract.what.length > 20);
  assert.equal(contract.owner_system, 'MEASUREMENT');
  assert.deepEqual(contract.measurement_plan, ['EXPOSURE_IDENTITY']);
  assert.equal(contract.authority_requirement, 'TIER_0_ANALYZE_ONLY');
});

// 36. Operator request cannot override CEO evidence/policy — testado em orchestratorPolicyAndShadow.test.js (item 29 do pedido original).
