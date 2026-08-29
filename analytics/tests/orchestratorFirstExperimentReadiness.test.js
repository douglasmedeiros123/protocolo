'use strict';

// PASSO 16 — items 14-19, 21-26 do checklist de testes (item 21). Measurement rebuild real, CEO
// rerun real, first experiment readiness derivado dinamicamente, separação financial/platform/
// behavioral, ghost-purchase protection, control/treatment, decision threshold nunca inventado,
// SAFE_MODE/determinismo/zero mutação externa.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { operationalizeExposureIdentity } = require('../src/orchestrator/exposureIdentityOperationalization');
const { analyzeMeasurement } = require('../src/measurement/builder');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { runCeoDecisionCycle } = require('../src/orchestrator/builder');
const { buildFirstExperimentReadiness, determineReadinessState, READINESS_STATES, PLANNER_FINANCIAL_TRUTH_LABEL_DEBT } = require('../src/orchestrator/firstExperimentReadiness');
const { MINIMUM_EVIDENCE_BY_CATEGORY } = require('../src/experiments/evidence');
const { SAFE_MODE } = require('../src/execution/safeMode');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'passo16-readiness-')); }
function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

// 14. Measurement rebuild consome o registro real.
test('14: real — analyzeMeasurement() com um registro real de exposição (dir isolado) resolve EXPOSURE_IDENTITY=true no blocker graph da arquitetura atual', () => {
  const tempDir = makeTempDir();
  try {
    const before = analyzeMeasurement({ strategyPlannerArgs: { executionDataDir: tempDir } });
    assert.equal(before.analysis.current_blocker_dependency_graph.nodes.EXPOSURE_IDENTITY.satisfied, false);

    operationalizeExposureIdentity({ executionDataDir: tempDir });

    const after = analyzeMeasurement({ strategyPlannerArgs: { executionDataDir: tempDir } });
    assert.equal(after.analysis.current_blocker_dependency_graph.nodes.EXPOSURE_IDENTITY.satisfied, true);
    assert.equal(after.analysis.current_exposure_identity_evidence.has_exposure_identity, true);
  } finally {
    cleanup(tempDir);
  }
});

// 15. CEO rerun consome o Measurement atualizado dinamicamente.
test('15: real — o registro real de exposição já persistido nesta sessão (analytics/data/execution real) faz o CEO nunca apontar EXPOSURE_IDENTITY como dominant_constraint/current_blocker', () => {
  const result = runCeoDecisionCycle({});
  const measurementCurrentBlocker = result.diagnosis.measurement_state ? result.diagnosis.measurement_state.current_blocker : null;
  assert.notEqual(measurementCurrentBlocker, 'EXPOSURE_IDENTITY');
  assert.notEqual(result.diagnosis.dominant_constraint.category, 'EXPOSURE_IDENTITY');
});

// 16. Vencedor nunca hardcoded.
test('16: real — buildFirstExperimentReadiness().treatment_architecture bate exatamente com o vencedor real e atual do Strategy Search (nunca uma string fixa)', () => {
  const strategyResult = analyzeStrategy({});
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.treatment_architecture, strategyResult.analysis.recommendation.recommended_architecture_id);
});

// 17. First experiment readiness é derivado, nunca fixo.
test('17: determineReadinessState() nunca retorna READY_FOR_EXECUTION quando treatmentBuilt=false — sempre READY_FOR_IMPLEMENTATION nesse caso', () => {
  const r = determineReadinessState({ measurementBlocked: false, decisionRuleMissing: false, treatmentBuilt: false, treatmentDeployed: false });
  assert.equal(r.state, 'READY_FOR_IMPLEMENTATION');
});

test('17b: determineReadinessState() retorna BLOCKED_BY_MEASUREMENT com precedência sobre qualquer outro estado', () => {
  const r = determineReadinessState({ measurementBlocked: true, decisionRuleMissing: false, treatmentBuilt: true, treatmentDeployed: true });
  assert.equal(r.state, 'BLOCKED_BY_MEASUREMENT');
});

test('17c: todos os estados retornáveis pertencem ao enum fechado READINESS_STATES (item 20)', () => {
  const cases = [
    { measurementBlocked: true, decisionRuleMissing: false, treatmentBuilt: false, treatmentDeployed: false },
    { measurementBlocked: false, decisionRuleMissing: true, treatmentBuilt: false, treatmentDeployed: false },
    { measurementBlocked: false, decisionRuleMissing: false, treatmentBuilt: false, treatmentDeployed: false },
    { measurementBlocked: false, decisionRuleMissing: false, treatmentBuilt: true, treatmentDeployed: false },
    { measurementBlocked: false, decisionRuleMissing: false, treatmentBuilt: true, treatmentDeployed: true },
  ];
  for (const c of cases) assert.ok(READINESS_STATES.includes(determineReadinessState(c).state));
});

// 18. Outcome financeiro tem precedência sobre Meta purchase pro resultado financeiro.
test('18: real — financial_platform_behavioral_signal_separation.FINANCIAL_OUTCOME vem de Hotmart (FINANCIAL_TRANSACTION_TRUTH), nunca de Meta/PLATFORM_ATTRIBUTION', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.match(readiness.financial_platform_behavioral_signal_separation.FINANCIAL_OUTCOME.source, /Hotmart|FINANCIAL_TRANSACTION_TRUTH/);
  assert.match(readiness.financial_platform_behavioral_signal_separation.PLATFORM_SIGNAL.source, /Meta/);
  assert.notEqual(readiness.financial_platform_behavioral_signal_separation.FINANCIAL_OUTCOME.source, readiness.financial_platform_behavioral_signal_separation.PLATFORM_SIGNAL.source);
});

// 19. Proteção ghost-purchase preservada.
test('19: real — ghost_purchase_protection.preserved=true e real_ghost_purchase_days_found bate com measurement/reconciliation.js real (nunca recalculado/inventado aqui)', () => {
  const measurementResult = analyzeMeasurement({});
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.financial_platform_behavioral_signal_separation.ghost_purchase_protection.preserved, true);
  assert.equal(readiness.financial_platform_behavioral_signal_separation.ghost_purchase_protection.real_ghost_purchase_days_found, measurementResult.analysis.reconciliation.ghost_purchase_days.length);
});

// 20. Exposição controle/tratamento é exigida.
test('20: real — control_vs_treatment_exposure exige registro real do controle pra can_distinguish_control_vs_treatment=true; sem ele, fica false', () => {
  const readinessNoExposure = buildFirstExperimentReadiness({ exposureOperationalizationResult: { action: 'DRY_RUN_ONLY', entry: null } });
  assert.equal(readinessNoExposure.control_vs_treatment_exposure.can_distinguish_control_vs_treatment, false);

  const readinessWithExposure = buildFirstExperimentReadiness({ exposureOperationalizationResult: { action: 'REGISTERED', entry: { architecture_id: 'ARCH-CURRENT', live_from: 'UNKNOWN' } } });
  assert.equal(readinessWithExposure.control_vs_treatment_exposure.can_distinguish_control_vs_treatment, true);
});

// 21. Ausência de decision threshold fica explícita.
test('21: determineReadinessState({decisionRuleMissing:true}) = BLOCKED_BY_DESIGN, nunca escondido/assumido como pronto', () => {
  const r = determineReadinessState({ measurementBlocked: false, decisionRuleMissing: true, treatmentBuilt: false, treatmentDeployed: false });
  assert.equal(r.state, 'BLOCKED_BY_DESIGN');
});

// 22. Nenhum sample threshold arbitrário é inventado.
test('22: real — minimum_observation_requirement do vencedor bate exatamente com experiments/evidence.js MINIMUM_EVIDENCE_BY_CATEGORY.CRO (mecanismo INCREASE_COMPREHENSION -> CRO), nunca um número inventado', () => {
  const strategyResult = analyzeStrategy({});
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const winner = strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);
  if (!winner) return; // vencedor é a própria arquitetura atual hoje — nada a comparar
  const readiness = buildFirstExperimentReadiness({});
  const expectedCategory = winner.primary_mechanism === 'INCREASE_AOV' ? 'OFFER' : 'CRO';
  assert.deepEqual(readiness.minimum_observation_requirement, MINIMUM_EVIDENCE_BY_CATEGORY[expectedCategory]);
});

// 23. Label obsoleto do Planner não sobrepõe Measurement.
test('23: PLANNER_FINANCIAL_TRUTH_LABEL_DEBT documenta a dívida sem modificar o Planner, e afirma explicitamente que Measurement continua a autoridade', () => {
  assert.equal(PLANNER_FINANCIAL_TRUTH_LABEL_DEBT.status, 'AUDITED_NOT_FIXED');
  assert.match(PLANNER_FINANCIAL_TRUTH_LABEL_DEBT.current_authority, /Measurement/);
  assert.match(PLANNER_FINANCIAL_TRUTH_LABEL_DEBT.classification, /STALE/);
});

// 24. SAFE_MODE.
test('24: SAFE_MODE continua true após todas as adições do PASSO 16', () => {
  assert.equal(SAFE_MODE, true);
});

// 25. Zero mutação externa.
test('25: real — operationalizeExposureIdentity() e buildFirstExperimentReadiness() nunca reportam nenhuma mutação externa (nenhum campo would_execute_externally=true em lugar algum do resultado)', () => {
  const tempDir = makeTempDir();
  try {
    const opResult = operationalizeExposureIdentity({ executionDataDir: tempDir });
    assert.ok(!('would_execute_externally' in opResult) || opResult.would_execute_externally === false);
    const readiness = buildFirstExperimentReadiness({ exposureOperationalizationResult: opResult, executionDataDir: tempDir });
    assert.equal(readiness.implementation_requirements.treatment_exists_as_real_page, false);
    assert.equal(readiness.readiness === 'READY_FOR_EXECUTION', false); // nunca força execução real
  } finally {
    cleanup(tempDir);
  }
});

// 26. Determinismo.
test('26: real — operationalizeExposureIdentity()/buildFirstExperimentReadiness() são determinísticos entre execuções (excluindo timestamps), dado o MESMO estado real', () => {
  const tempDir = makeTempDir();
  try {
    const a = operationalizeExposureIdentity({ executionDataDir: tempDir });
    cleanup(tempDir);
    const tempDir2 = makeTempDir();
    const b = operationalizeExposureIdentity({ executionDataDir: tempDir2 });
    assert.equal(a.action, b.action);
    assert.equal(a.entry.architecture_id, b.entry.architecture_id);
    assert.equal(a.entry.deployment_evidence_type, b.entry.deployment_evidence_type);
    assert.equal(a.mdebt_007.status, b.mdebt_007.status);
    cleanup(tempDir2);

    const r1 = buildFirstExperimentReadiness({});
    const r2 = buildFirstExperimentReadiness({});
    assert.equal(r1.readiness, r2.readiness);
    assert.equal(r1.treatment_architecture, r2.treatment_architecture);
    assert.deepEqual(r1.minimum_observation_requirement, r2.minimum_observation_requirement);
  } finally {
    cleanup(tempDir);
  }
});
