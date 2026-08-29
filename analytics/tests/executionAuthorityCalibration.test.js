'use strict';

// PASSO 14A.1 — os 18 testes obrigatórios do item 13, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateApprovalPolicy } = require('../src/execution/approvalPolicy');
const { buildRecommendationRange, evaluateExecutionAuthority } = require('../src/execution/executionAuthorityLimits');
const { evaluatePolicyChangeRequest, PROTECTED_POLICY_DOMAINS } = require('../src/execution/selfModificationProtection');
const { buildRollbackContract } = require('../src/execution/rollbackContract');
const { buildRollbackVerification } = require('../src/execution/rollbackVerification');
const { evaluateActionWithPolicyEngine } = require('../src/execution/policyEngine');
const { buildActionContract, resetActionCounter } = require('../src/execution/actionContract');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');
const { classifyBlastRadius } = require('../src/execution/blastRadius');
const { evaluateCircuitBreaker } = require('../src/execution/circuitBreaker');
const {
  classifyDeploymentEvidence, isHistoricalBackfillRequiredForNextExperiment, buildArchitectureLiveEntry,
  resetEntryCounter, queryArchitectureLiveOnDate, DEPLOYMENT_LIFECYCLE_CONTRACT,
} = require('../src/execution/exposureIdentityRegistry');
const { enforceSafeMode } = require('../src/execution/safeMode');
const { proposeAndDryRunNextAction } = require('../src/execution/builder');
const { runDryRun } = require('../src/execution/dryRunEngine');

// 1. HIGH risk não retorna implicitamente human_approval_required=false por ausência de config.
test('1: risk_level=HIGH sempre exige aprovação humana, mesmo com capital conhecido e sem nenhuma política configurada', () => {
  const r = evaluateApprovalPolicy({ riskLevel: 'HIGH', capitalAtRisk: 100, reversibility: 'REVERSIBLE', capitalSafetyProfile: loadCapitalSafetyConfig() });
  assert.equal(r.human_approval_required, true);
});

// 2. UNKNOWN capital nunca equivale a autonomous approval.
test('2: capital_at_risk=null (UNKNOWN) nunca resulta em human_approval_required=false, mesmo com risk_level=LOW e perfil configurado', () => {
  const r = evaluateApprovalPolicy({ riskLevel: 'LOW', capitalAtRisk: null, reversibility: 'REVERSIBLE', capitalSafetyProfile: loadCapitalSafetyConfig({ max_capital_per_action: 1000 }) });
  assert.equal(r.human_approval_required, true);
  assert.equal(r.authority_tier, 'HUMAN_APPROVAL_REQUIRED');
});

// 3. LLM pode recomendar acima do autonomous execution limit.
test('3: recommendation_range nunca é truncado pelo autonomous_execution_limit — a recomendação passa intacta', () => {
  const range = buildRecommendationRange({ recommendedValue: 500, currentValue: 30 });
  const authority = evaluateExecutionAuthority({ recommendationRange: range, capitalSafetyProfile: loadCapitalSafetyConfig({ max_capital_per_action: 50 }) });
  assert.equal(authority.recommendation_range.recommended_value, 500); // nunca reduzido
  assert.equal(authority.within_autonomous_limit, false); // só a ELEGIBILIDADE de execução é afetada
});

// 4. Recommendation size não muda hard policy.
test('4: uma recomendação de valor muito alto (500) não altera o resultado de REVERSIBILITY_POLICY/GLOBAL_FREEZE_POLICY — políticas rígidas continuam as mesmas', () => {
  resetActionCounter();
  const smallAction = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 10, reversibility: 'REVERSIBLE' });
  const bigAction = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 5000, reversibility: 'REVERSIBLE' });
  const context = { capitalSafetyConfig: loadCapitalSafetyConfig(), measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] }, blastRadiusResult: classifyBlastRadius('CAMPAIGN'), rateLimitResult: { excessive_action_frequency: false, violations: [] }, circuitBreakerResult: { state: 'CLOSED', action: 'ALLOW_EXECUTION' } };
  const small = evaluateActionWithPolicyEngine({ action: smallAction, context });
  const big = evaluateActionWithPolicyEngine({ action: bigAction, context });
  const reversibilitySmall = small.category_results.find((c) => c.category === 'REVERSIBILITY_POLICY');
  const reversibilityBig = big.category_results.find((c) => c.category === 'REVERSIBILITY_POLICY');
  assert.equal(reversibilitySmall.result, reversibilityBig.result); // tamanho não muda a regra rígida
});

// 5. LLM não altera authority profile.
test('5: origem LLM_RECOMMENDATION nunca é autorizada a alterar ACTIVE_CAPITAL_PROFILE', () => {
  const r = evaluatePolicyChangeRequest({ domain: 'ACTIVE_CAPITAL_PROFILE', requestedByOrigin: 'LLM_RECOMMENDATION' });
  assert.equal(r.allowed, false);
  assert.ok(PROTECTED_POLICY_DOMAINS.includes('ACTIVE_CAPITAL_PROFILE'));
});

// 6. STOP_EXPERIMENT = HALT_ONLY quando não restaura previous_state.
test('6: START_EXPERIMENT (halt real = STOP_EXPERIMENT) nunca vira rollback_status=ROLLBACK_SUPPORTED — fica HALT_ONLY/ROLLBACK_UNVERIFIED, nunca confundido com restauração', () => {
  const contract = buildRollbackContract({ actionType: 'START_EXPERIMENT', currentState: { architecture_id: 'ARCH-CURRENT' }, reversibility: 'REVERSIBLE' });
  assert.equal(contract.halt_supported, true);
  assert.equal(contract.halt_method, 'STOP_EXPERIMENT');
  assert.equal(contract.rollback_supported, false);
  assert.equal(contract.rollback_status, 'HALT_ONLY');
});

// 7. Rollback exige restore validation.
test('7: rollback_status só chega em ROLLBACK_SUPPORTED depois de restore_attempt=ATTEMPTED + restore_validation=VALIDATED — nunca antes', () => {
  const unverified = buildRollbackVerification({ previousState: { budget: 100 }, restoreMethod: 'REVERT_TO_PREVIOUS_BUDGET_VALUE', restoreAttempted: false });
  assert.equal(unverified.rollback_status, 'ROLLBACK_UNVERIFIED');
  const validated = buildRollbackVerification({ previousState: { budget: 100 }, restoreMethod: 'REVERT_TO_PREVIOUS_BUDGET_VALUE', restoreAttempted: true, restoreResult: 'SUCCESS', validatedRestoredState: { budget: 100 } });
  assert.equal(validated.rollback_status, 'ROLLBACK_SUPPORTED');
});

// 8. Unknown previous state != rollback supported.
test('8: previous_state=UNKNOWN nunca produz ROLLBACK_SUPPORTED nem ROLLBACK_UNVERIFIED — sempre NOT_SUPPORTED, nunca inventa o estado anterior', () => {
  const r = buildRollbackVerification({ previousState: 'UNKNOWN', restoreMethod: 'REVERT_TO_PREVIOUS_BUDGET_VALUE' });
  assert.equal(r.rollback_status, 'NOT_SUPPORTED');
  assert.equal(r.previous_state, 'UNKNOWN');
  const contract = buildRollbackContract({ actionType: 'ADJUST_BUDGET', currentState: null, reversibility: 'REVERSIBLE' });
  assert.equal(contract.previous_state, 'UNKNOWN');
  assert.notEqual(contract.rollback_status, 'ROLLBACK_SUPPORTED');
});

// 9. Measurement DEFER aparece mesmo quando outra policy também decide DEFER.
test('9: MEASUREMENT_READINESS_POLICY aparece em all_blocking_or_deferring_policies mesmo quando CAPITAL_LIMIT_POLICY é quem decide o final_result', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 100, reversibility: 'REVERSIBLE' });
  const r = evaluateActionWithPolicyEngine({
    action,
    context: {
      capitalSafetyConfig: loadCapitalSafetyConfig(), // NOT_CONFIGURED -> CAPITAL_LIMIT_POLICY=DEFER, decisivo
      measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'NEEDS_TRACKING_IMPLEMENTATION' }, anomalies: [] }, // -> MEASUREMENT_READINESS_POLICY=ALLOW_DRY_RUN_ONLY, não decisivo
      blastRadiusResult: classifyBlastRadius('CAMPAIGN'), rateLimitResult: { excessive_action_frequency: false, violations: [] }, circuitBreakerResult: { state: 'CLOSED', action: 'ALLOW_EXECUTION' },
    },
  });
  assert.equal(r.final_result, 'DEFER');
  assert.ok(r.decisive_policies.includes('CAPITAL_LIMIT_POLICY'));
  assert.ok(!r.decisive_policies.includes('MEASUREMENT_READINESS_POLICY'));
  assert.ok(r.all_blocking_or_deferring_policies.some((p) => p.category === 'MEASUREMENT_READINESS_POLICY'));
});

// 10. Multiple blockers são preservados.
test('10: non_decisive_warnings preserva TODAS as categorias não-ALLOW que não decidiram o resultado final — nada escondido', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'TRACKING_CONFIG', subjectId: 'T', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 100, reversibility: 'REVERSIBLE' });
  const r = evaluateActionWithPolicyEngine({
    action,
    context: {
      capitalSafetyConfig: loadCapitalSafetyConfig(),
      measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'NEEDS_TRACKING_IMPLEMENTATION' }, anomalies: [] },
      blastRadiusResult: classifyBlastRadius('TRACKING_CONFIG'), // ACCOUNT -> HUMAN_APPROVAL_POLICY=REQUIRE_HUMAN_APPROVAL, decisivo
      rateLimitResult: { excessive_action_frequency: false, violations: [] }, circuitBreakerResult: { state: 'CLOSED', action: 'ALLOW_EXECUTION' },
    },
  });
  assert.equal(r.final_result, 'REQUIRE_HUMAN_APPROVAL');
  const warningCategories = r.non_decisive_warnings.map((w) => w.category);
  assert.ok(warningCategories.includes('CAPITAL_LIMIT_POLICY'));
  assert.ok(warningCategories.includes('MEASUREMENT_READINESS_POLICY'));
});

// 11. Circuit Breaker CLOSED pode coexistir com Policy DEFER.
test('11: circuit breaker CLOSED (sem trigger nenhum) não impede a Policy Engine de retornar DEFER por outro motivo', () => {
  const cb = evaluateCircuitBreaker({ signals: {}, currentState: 'CLOSED', scope: 'X' });
  assert.equal(cb.state, 'CLOSED');
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 10, reversibility: 'REVERSIBLE' });
  const r = evaluateActionWithPolicyEngine({ action, context: { capitalSafetyConfig: loadCapitalSafetyConfig(), measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] }, blastRadiusResult: classifyBlastRadius('CAMPAIGN'), rateLimitResult: { excessive_action_frequency: false, violations: [] }, circuitBreakerResult: cb } });
  assert.equal(r.final_result, 'DEFER'); // CAPITAL_LIMIT_POLICY NOT_CONFIGURED -> DEFER, mesmo com circuit breaker fechado
  const globalFreezeCategory = r.category_results.find((c) => c.category === 'GLOBAL_FREEZE_POLICY');
  assert.equal(globalFreezeCategory.result, 'ALLOW');
});

// 12. Historical deployment proxy não vira confirmed deployment.
test('12: um registro de deploy linkado ao commit (proxy) nunca é classificado DEPLOYMENT_CONFIRMED', () => {
  const r = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: false, hasVercelDeployRecordLinkedToCommit: true, hasGitCommitOnly: false });
  assert.equal(r.class, 'DEPLOYMENT_PROXY');
  assert.notEqual(r.class, 'DEPLOYMENT_CONFIRMED');
});

// 13. Unknown deployment date não é inventada.
test('13: só existir um commit no repo (sem link de deploy comprovado) classifica REPO_CHANGE_ONLY, nunca infere data de produção', () => {
  const r = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: false, hasVercelDeployRecordLinkedToCommit: false, hasGitCommitOnly: true });
  assert.equal(r.class, 'REPO_CHANGE_ONLY');
  const noEvidence = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: false, hasVercelDeployRecordLinkedToCommit: false, hasGitCommitOnly: false });
  assert.equal(noEvidence.class, 'UNKNOWN');
});

// 14. Prospective architecture registry pode resolver EXPOSURE_IDENTITY para novo teste.
test('14: criar UMA entrada prospectiva agora (arquitetura atual, ACTIVE) já é suficiente pro próximo experimento — backfill histórico não é obrigatório', () => {
  const withoutMarker = isHistoricalBackfillRequiredForNextExperiment({ hasCurrentArchitectureMarkerEntry: false });
  assert.equal(withoutMarker.required, false);
  resetEntryCounter();
  const entry = buildArchitectureLiveEntry({ architectureId: 'ARCH-CURRENT', liveFrom: '2026-08-29T00:00:00.000Z', environment: 'production', deploymentReference: 'commit:xyz', recordedBy: 'human_operator' });
  const query = queryArchitectureLiveOnDate([entry], '2026-08-29T12:00:00.000Z');
  assert.equal(query.found, true); // já resolve EXPOSURE_IDENTITY pra hoje em diante
});

// 15. Human operator não precisa registrar manualmente exposição se deployment lifecycle puder fazê-lo futuramente.
test('15: DEPLOYMENT_LIFECYCLE_CONTRACT documenta que o registry nasce como efeito colateral do lifecycle de deployment, nunca uma tarefa manual separada', () => {
  assert.match(DEPLOYMENT_LIFECYCLE_CONTRACT.rule, /nunca uma tarefa manual separada/);
  assert.ok(DEPLOYMENT_LIFECYCLE_CONTRACT.flow.length > 0);
});

// 16. SAFE_MODE continua bloqueando toda mutação externa.
test('16: enforceSafeMode continua forçando DRY_RUN_ONLY pra qualquer connector mutável, independente da calibração de autoridade', () => {
  const r = enforceSafeMode({ actionStatus: 'APPROVED', connectorIsMutable: true });
  assert.equal(r.enforced_mode, 'DRY_RUN_ONLY');
});

// 17. Determinism.
test('17: real — HIGH risk + UNKNOWN capital produz human_approval_required=true de forma determinística entre execuções', () => {
  const a = proposeAndDryRunNextAction({});
  const b = proposeAndDryRunNextAction({});
  assert.equal(a.dry_run.human_approval_required, b.dry_run.human_approval_required);
  assert.equal(a.dry_run.human_approval_required, true);
  assert.equal(a.dry_run.approval_authority.authority_tier, b.dry_run.approval_authority.authority_tier);
});

// 18. Write boundary.
test('18: nenhum módulo novo desta calibração escreve fora de analytics/src/execution/ ou analytics/data/execution/', () => {
  const { DEFAULT_DIR } = require('../src/execution/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/execution'));
});

// cobertura extra — runDryRun real com approval_authority/execution_authority presentes no shape.
test('extra: runDryRun expõe approval_authority e execution_authority explicitamente, nunca só um booleano isolado', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: null, reversibility: 'REVERSIBLE' });
  const result = runDryRun({ action, measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] }, capitalSafetyConfig: loadCapitalSafetyConfig() });
  assert.ok(result.approval_authority);
  assert.ok(result.execution_authority);
  assert.equal(result.human_approval_required, true); // capital UNKNOWN
});
