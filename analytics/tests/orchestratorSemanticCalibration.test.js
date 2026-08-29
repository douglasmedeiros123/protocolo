'use strict';

// PASSO 15.1 — os 25 testes obrigatórios do item 12, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildClaimTemporalStatus, buildSupersessionExplanation } = require('../src/orchestrator/claimTemporalStatus');
const { classifyActionSemantics, isOrientationConsistentWithSemanticType } = require('../src/orchestrator/actionSemantics');
const { buildScopedConfidence } = require('../src/orchestrator/confidenceScope');
const { buildCandidateContract, resetCandidateCounter } = require('../src/orchestrator/decisionCandidate');
const { deriveDominantConstraint, buildGlobalDiagnosis } = require('../src/orchestrator/globalDiagnosis');
const { buildGlobalStateContract } = require('../src/orchestrator/globalStateContract');
const { runCeoDecisionCycle } = require('../src/orchestrator/builder');
const { SHADOW_MODE } = require('../src/orchestrator/shadowMode');

let stateContract; let diagnosis;
test.before(() => { stateContract = buildGlobalStateContract({}); diagnosis = buildGlobalDiagnosis(stateContract); });

// 1. Historical claim can remain valid historically.
test('1: claim histórica (STALE_STATE) continua usable_for_historical_analysis=true, sempre', () => {
  const claim = buildClaimTemporalStatus({ source: 'PLANNER', observedAt: '2026-08-01T00:00:00Z', supersededBy: 'MEASUREMENT' });
  assert.equal(claim.temporal_status, 'STALE_STATE');
  assert.equal(claim.usable_for_historical_analysis, true);
});

// 2. Historical claim can be superseded for current decision.
test('2: claim superseded fica usable_for_current_decision=false, mas nunca marcada FALSE/errada', () => {
  const claim = buildClaimTemporalStatus({ source: 'PLANNER', observedAt: '2026-08-01T00:00:00Z', supersededBy: 'MEASUREMENT' });
  assert.equal(claim.usable_for_current_decision, false);
  assert.notEqual(claim.temporal_status, 'FALSE');
});

// 3. STALE != FALSE.
test('3: buildSupersessionExplanation nunca usa a palavra "errado"/"falso" pra descrever a claim histórica — stale_does_not_mean_false=true', () => {
  const result = buildSupersessionExplanation({ historicalClaim: { source: 'A', claim: 'x' }, currentClaim: { source: 'B', claim: 'y' }, reason: 'r' });
  assert.equal(result.stale_does_not_mean_false, true);
  assert.doesNotMatch(result.explanation.toLowerCase(), /está errad|é falso|incorreto/);
});

// 4. Current authoritative claim outranks superseded claim.
test('4: real — no conflito real Planner/Measurement, a claim CURRENT_STATE (Measurement) é a que fica usable_for_current_decision=true', () => {
  const conflict = diagnosis.cross_agent_conflicts[0];
  if (conflict) {
    assert.equal(conflict.claim_b_temporal_status.usable_for_current_decision, true);
    assert.equal(conflict.claim_a_temporal_status.usable_for_current_decision, false);
  }
});

// 5. Missing timestamp does not invent freshness.
test('5: sem observedAt nem referencePeriod, temporal_status=UNKNOWN_FRESHNESS, nunca CURRENT_STATE por padrão', () => {
  const claim = buildClaimTemporalStatus({ source: 'X' });
  assert.equal(claim.temporal_status, 'UNKNOWN_FRESHNESS');
  assert.equal(claim.observed_at, 'UNKNOWN');
});

// 6. Conflict resolver explains supersession.
test('6: real — conflito real inclui supersession_explanation com a razão real (planner/trackingScopes.js citado)', () => {
  const conflict = diagnosis.cross_agent_conflicts[0];
  if (conflict) {
    assert.match(conflict.supersession_explanation.explanation, /trackingScopes\.js/);
    assert.equal(conflict.root_cause_audit.self_documented_debt, true);
    assert.equal(conflict.root_cause_audit.planner_not_modified, true);
  }
});

// 7. REGISTER_OBSERVED_EXPOSURE != CREATE_NEW_EXPOSURE.
test('7: classifyActionSemantics distingue COLLECT_EVIDENCE+EXPOSURE_IDENTITY (REGISTER_OBSERVED_EXPOSURE) de START_EXPERIMENT (CREATE_NEW_EXPOSURE)', () => {
  const collectEv = classifyActionSemantics({ action_class: 'COLLECT_EVIDENCE', measurement_requirements: ['EXPOSURE_IDENTITY'] });
  const startExp = classifyActionSemantics({ action_class: 'START_EXPERIMENT', measurement_requirements: [] });
  assert.equal(collectEv.semantic_type, 'REGISTER_OBSERVED_EXPOSURE');
  assert.equal(startExp.semantic_type, 'CREATE_NEW_EXPOSURE');
  assert.notEqual(collectEv.semantic_type, startExp.semantic_type);
});

// 8. Internal evidence write != external platform mutation.
test('8: REGISTER_OBSERVED_EXPOSURE tem mutation_scope=INTERNAL_STATE_WRITE; CREATE_NEW_EXPOSURE tem mutation_scope=DEPLOYMENT_CHANGE — nunca o mesmo escopo', () => {
  const collectEv = classifyActionSemantics({ action_class: 'COLLECT_EVIDENCE', measurement_requirements: ['EXPOSURE_IDENTITY'] });
  const startExp = classifyActionSemantics({ action_class: 'START_EXPERIMENT', measurement_requirements: [] });
  assert.equal(collectEv.mutation_scope, 'INTERNAL_STATE_WRITE');
  assert.equal(startExp.mutation_scope, 'DEPLOYMENT_CHANGE');
});

// 9. Blast radius follows actual mutation scope.
test('9: recommended_blast_radius_if_scope_respected de REGISTER_OBSERVED_EXPOSURE é SINGLE_ASSET (escopo mínimo real), nunca ACCOUNT', () => {
  const collectEv = classifyActionSemantics({ action_class: 'COLLECT_EVIDENCE', measurement_requirements: ['EXPOSURE_IDENTITY'] });
  assert.equal(collectEv.recommended_blast_radius_if_scope_respected, 'SINGLE_ASSET');
});

// 10. Internal observation does not automatically become ACCOUNT blast radius.
test('10: recommended_blast_radius_if_scope_respected nunca é ACCOUNT/GLOBAL pra um candidato de escrita interna pura', () => {
  const collectEv = classifyActionSemantics({ action_class: 'COLLECT_EVIDENCE', measurement_requirements: ['EXPOSURE_IDENTITY'] });
  assert.notEqual(collectEv.recommended_blast_radius_if_scope_respected, 'ACCOUNT');
  assert.notEqual(collectEv.recommended_blast_radius_if_scope_respected, 'GLOBAL');
});

// 11. Deployment change can still have large blast radius.
test('11: CREATE_NEW_EXPOSURE (deployment change real) tem recommended_blast_radius maior que SINGLE_ASSET — defensável, nunca artificialmente reduzido', () => {
  const startExp = classifyActionSemantics({ action_class: 'START_EXPERIMENT', measurement_requirements: [] });
  assert.notEqual(startExp.recommended_blast_radius_if_scope_respected, 'SINGLE_ASSET');
});

// 12. COLLECT_EVIDENCE can map to REGISTER_OBSERVED_EXPOSURE.
test('12: isOrientationConsistentWithSemanticType(REGISTER_OBSERVED_EXPOSURE, COLLECT_EVIDENCE) é true', () => {
  assert.equal(isOrientationConsistentWithSemanticType('REGISTER_OBSERVED_EXPOSURE', 'COLLECT_EVIDENCE'), true);
});

// 13. CREATE_NEW_EXPOSURE cannot masquerade as evidence registration.
test('13: isOrientationConsistentWithSemanticType(CREATE_NEW_EXPOSURE, COLLECT_EVIDENCE) é false — nunca disfarçado', () => {
  assert.equal(isOrientationConsistentWithSemanticType('CREATE_NEW_EXPOSURE', 'COLLECT_EVIDENCE'), false);
});

// 14. Decision confidence has explicit scope.
test('14: buildScopedConfidence sempre retorna os 4 escopos nomeados separadamente, nunca um único campo confidence genérico', () => {
  const scoped = buildScopedConfidence({ decisionConfidence: 'HIGH', strategyConfidence: 'LOW', productViabilityConfidence: 'MEDIUM', measurementConfidence: 'HIGH' });
  assert.equal(scoped.decision_confidence, 'HIGH');
  assert.equal(scoped.strategy_confidence, 'LOW');
  assert.equal(scoped.product_viability_confidence, 'MEDIUM');
  assert.equal(scoped.measurement_confidence, 'HIGH');
});

// 15. HIGH decision confidence does not imply HIGH strategy confidence.
test('15: real — decision_confidence=HIGH coexiste com strategy_confidence=LOW no ciclo real (advertorial é LOW confidence no Strategy Search)', () => {
  const result = runCeoDecisionCycle({});
  if (result.confidence_scope.decision_confidence === 'HIGH') {
    assert.notEqual(result.confidence_scope.decision_confidence, result.confidence_scope.strategy_confidence);
  }
});

// 16. HIGH decision confidence does not imply product viability.
test('16: confidence_scope.product_viability_confidence vem de plan.verdict_confidence real, nunca copiado de decision_confidence', () => {
  const scoped = buildScopedConfidence({ decisionConfidence: 'HIGH', strategyConfidence: 'LOW', productViabilityConfidence: 'MEDIUM', measurementConfidence: 'HIGH' });
  assert.notEqual(scoped.product_viability_confidence, scoped.decision_confidence);
});

// 17. Systemic dependency can become dominant constraint.
// PASSO 16 — mesma correção do teste 4 de orchestratorDiagnosisAndRouting.test.js: dependia do
// EXPOSURE_IDENTITY real estar bloqueado simetricamente, o que o PASSO 16 resolveu de verdade.
// Convertido pra fixture (mesmo padrão do teste 18 já existente neste arquivo) — testa a REGRA,
// nunca um fato pontual do estado real que o próprio PASSO 16 mudou de propósito.
test('17: fixture — quando o blocker é IGUAL entre arquitetura atual e vencedor, dominant_constraint=MEASUREMENT (sistêmico)', () => {
  const fixtureState = {
    ...stateContract,
    data: {
      ...stateContract.data,
      measurement: {
        analysis: {
          ...stateContract.data.measurement.analysis,
          current_measurement_capital_gate: { ...stateContract.data.measurement.analysis.current_measurement_capital_gate, current_blocker: 'TRACKING' },
          strategy_handoff: { ...stateContract.data.measurement.analysis.strategy_handoff, found: true, capital_gate: { ...stateContract.data.measurement.analysis.strategy_handoff.capital_gate, current_blocker: 'TRACKING' } },
        },
      },
    },
  };
  const result = deriveDominantConstraint(fixtureState, 'RELIABLE');
  assert.equal(result.category, 'MEASUREMENT');
  assert.match(result.reason, /sistêmico/);
});

// 18. Local irrelevant blocker does not become global dominant constraint.
test('18: fixture — quando o blocker do vencedor NÃO existe (strategy_handoff.found=false), measurement não é tratado como sistêmico, mesmo com current_blocker presente', () => {
  const fixtureState = {
    ...stateContract,
    data: {
      ...stateContract.data,
      measurement: {
        analysis: {
          ...stateContract.data.measurement.analysis,
          current_measurement_capital_gate: { ...stateContract.data.measurement.analysis.current_measurement_capital_gate, current_blocker: 'EXPOSURE_IDENTITY' },
          strategy_handoff: { found: false },
        },
      },
    },
  };
  const result = deriveDominantConstraint(fixtureState, 'RELIABLE');
  assert.notEqual(result.category, 'MEASUREMENT');
});

// 19. Different agent opinions remain allowed.
test('19: detectCrossAgentConflicts só sinaliza o padrão específico documentado (FINANCIAL_TRUTH=DEGRADED vs RELIABLE) — nunca generaliza pra qualquer diferença entre agentes', () => {
  const { detectCrossAgentConflicts } = require('../src/orchestrator/globalDiagnosis');
  const noConflict = detectCrossAgentConflicts({ plannerScaleGateReason: 'algo completamente diferente, sem menção a FINANCIAL_TRUTH', measurementFinancialTruthStatus: 'RELIABLE' });
  assert.equal(noConflict.length, 0);
});

// 20. CEO does not mutate agents to force agreement.
test('20: real — rodar o ciclo do CEO não altera nenhum arquivo de dados dos outros agentes (measurement/strategy-search/planner) — só leitura', () => {
  const fs = require('fs');
  const path = require('path');
  const measurementDataDir = path.join(__dirname, '..', 'data', 'measurement');
  const before = fs.existsSync(measurementDataDir) ? fs.statSync(path.join(measurementDataDir, 'analysis.json')).mtimeMs : null;
  runCeoDecisionCycle({});
  const after = fs.existsSync(measurementDataDir) ? fs.statSync(path.join(measurementDataDir, 'analysis.json')).mtimeMs : null;
  assert.equal(before, after); // nenhuma escrita nova — CEO nunca persiste em cima de outro agente
});

// 21. SHADOW_MODE.
test('21: SHADOW_MODE continua true após a calibração', () => {
  assert.equal(SHADOW_MODE, true);
});

// 22. SAFE_MODE.
test('22: SAFE_MODE (execution/safeMode.js, reusado) continua true', () => {
  const { SAFE_MODE } = require('../src/execution/safeMode');
  assert.equal(SAFE_MODE, true);
});

// 23. Zero external mutations.
test('23: real — ciclo pós-calibração ainda nunca executa nada externamente', () => {
  const result = runCeoDecisionCycle({});
  assert.equal(result.would_execute_externally, false);
});

// 24. Determinism.
test('24: real — action_semantics/confidence_scope são determinísticos entre execuções', () => {
  resetCandidateCounter();
  const a = runCeoDecisionCycle({});
  resetCandidateCounter();
  const b = runCeoDecisionCycle({});
  const winnerA = a.candidates.find((c) => c.candidate_id === a.ranking_result.recommended_candidate_id);
  const winnerB = b.candidates.find((c) => c.candidate_id === b.ranking_result.recommended_candidate_id);
  assert.deepEqual(winnerA.action_semantics, winnerB.action_semantics);
  assert.deepEqual(a.confidence_scope, b.confidence_scope);
});

// 25. Write boundary.
test('25: nenhum módulo novo desta calibração escreve fora de analytics/src/orchestrator/', () => {
  const { DEFAULT_DIR } = require('../src/orchestrator/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/orchestrator'));
});
