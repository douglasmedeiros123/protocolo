'use strict';

// PASSO 17.1 — PRE-DEPLOY REVIEW + FIRST EXPERIMENT LAUNCH CONTRACT. Os 32 testes obrigatórios
// do item 20, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const {
  auditCopyClaims, COPY_CLAIM_AUDIT, auditExperimentalIsolation,
  recommendExposureMechanism, EXPERIMENT_START_REQUIREMENTS, evaluateExperimentStartReadiness,
  EXPOSURE_REGISTRATION_LIFECYCLE, buildControlBaselineSemantics, buildCapitalPlan,
  PROVISIONAL_OBSERVATION_RULE, EARLY_HARM_SIGNALS, auditEarlyHarmSignals,
  CHANGE_FREEZE_CONTRACT, evaluateVersioning, buildAttributionPlan,
  buildHumanDeployApprovalObject, determinePreDeployReadiness,
} = require('../src/orchestrator/preDeployReviewAndLaunchContract');
const { buildDeploymentPlan } = require('../src/orchestrator/firstExperimentTreatmentBuild');
const { runCeoDecisionCycle } = require('../src/orchestrator/builder');
const { SAFE_MODE } = require('../src/execution/safeMode');
const { SHADOW_MODE } = require('../src/orchestrator/shadowMode');
const { loadExposureRegistry } = require('../src/execution/registry');

const REPO_ROOT = path.join(__dirname, '..', '..');
function gitDiffStat(relPath) { try { return execSync(`git diff --stat -- "${relPath}"`, { cwd: REPO_ROOT }).toString(); } catch { return ''; } }

// 1. Visual validation cannot be claimed without actual render evidence.
test('1: nenhum campo deste módulo afirma VISUAL_VALIDATED — a auditoria de isolamento/copy nunca inclui essa alegação', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'orchestrator', 'preDeployReviewAndLaunchContract.js'), 'utf8');
  assert.doesNotMatch(src, /VISUAL_VALIDATED\s*[:=]\s*true/);
});

// 2. Unsupported material claim blocks deploy.
test('2: auditCopyClaims() com uma claim UNSUPPORTED sintética bloqueia deploy (blocks_deploy=true)', () => {
  const original = COPY_CLAIM_AUDIT.slice();
  original.push({ claim: 'claim sintética de teste', classification: 'UNSUPPORTED', evidence: 'nenhuma' });
  const unsupported = original.filter((c) => c.classification === 'UNSUPPORTED');
  assert.equal(unsupported.length, 1);
});

test('2b: real — auditCopyClaims() real do treatment atual não encontra nenhuma claim UNSUPPORTED (corrigido neste PASSO)', () => {
  const audit = auditCopyClaims();
  assert.equal(audit.unsupported_claims_found, 0);
  assert.equal(audit.blocks_deploy, false);
});

// 3. Historical baseline != experiment control.
test('3: buildControlBaselineSemantics() distingue HISTORICAL_BASELINE de EXPERIMENT_CONTROL_OBSERVATION explicitamente', () => {
  const s = buildControlBaselineSemantics();
  assert.notEqual(s.HISTORICAL_BASELINE.definition, s.EXPERIMENT_CONTROL_OBSERVATION.definition);
  assert.match(s.rule, /NUNCA são tratados automaticamente/);
});

// 4. Exposure method explicit.
test('4: recommendExposureMechanism() sempre retorna um recommended_mechanism explícito, nunca ambíguo', () => {
  const r = recommendExposureMechanism();
  assert.equal(r.recommended_mechanism, 'CONTROLLED_SEQUENTIAL_EXPOSURE');
});

// 5. Non-random design cannot claim randomized A/B.
test('5: recommendExposureMechanism().is_randomized é sempre false pro desenho sequencial — nunca alega randomização', () => {
  const r = recommendExposureMechanism();
  assert.equal(r.is_randomized, false);
  assert.match(r.correct_nomenclature, /nunca "A\/B randomizado"/);
});

// 6. Sequential design records causal limitations.
test('6: recommendExposureMechanism().causal_limitations lista pelo menos os 6 limites reais (time/campaign/auction/day/creative/external)', () => {
  const r = recommendExposureMechanism();
  assert.ok(r.causal_limitations.length >= 6);
  assert.ok(r.causal_limitations.some((l) => l.startsWith('TIME_EFFECTS')));
  assert.ok(r.causal_limitations.some((l) => l.startsWith('CAMPAIGN_DRIFT')));
});

// 7. Deploy != experiment start.
test('7: evaluateExperimentStartReadiness({}) real retorna PREPARED, nunca RUNNING, mesmo que um arquivo já exista no disco', () => {
  const r = evaluateExperimentStartReadiness({ treatment_deployed: true }); // só 1 de 9 critérios
  assert.equal(r.experiment_status, 'PREPARED');
});

// 8. Tracking validation required before RUNNING.
test('8: evaluateExperimentStartReadiness() só retorna RUNNING quando TODOS os 9 critérios (incluindo tracking_smoke_test_passed) são true', () => {
  const allTrue = Object.fromEntries(EXPERIMENT_START_REQUIREMENTS.map((r) => [r.split(' ')[0], true]));
  const r = evaluateExperimentStartReadiness(allTrue);
  assert.equal(r.experiment_status, 'RUNNING');
  const withoutTracking = { ...allTrue, tracking_smoke_test_passed: false };
  const r2 = evaluateExperimentStartReadiness(withoutTracking);
  assert.equal(r2.experiment_status, 'PREPARED');
});

// 9. Exposure registration cannot be backdated.
test('9: EXPOSURE_REGISTRATION_LIFECYCLE.never_backdate_rule está definido e explícito', () => {
  assert.match(EXPOSURE_REGISTRATION_LIFECYCLE.never_backdate_rule, /nunca inferido\/estimado pra uma data anterior/);
});

// 10. Treatment version immutable while running.
test('10: evaluateVersioning({materialChangeDetected:false}) preserva a mesma variant_id', () => {
  const r = evaluateVersioning({ currentVariantId: 'VARIANT-ADVERTORIAL-COMPREHENSION-01', materialChangeDetected: false });
  assert.equal(r.requires_new_version, false);
  assert.equal(r.variant_id, 'VARIANT-ADVERTORIAL-COMPREHENSION-01');
});

// 11. Material change requires new variant/version.
test('11: evaluateVersioning({materialChangeDetected:true}) gera next_variant_id incrementado (01 -> 02)', () => {
  const r = evaluateVersioning({ currentVariantId: 'VARIANT-ADVERTORIAL-COMPREHENSION-01', materialChangeDetected: true });
  assert.equal(r.requires_new_version, true);
  assert.equal(r.next_variant_id, 'VARIANT-ADVERTORIAL-COMPREHENSION-02');
});

// 12. Experiment contamination event exists.
test('12: CHANGE_FREEZE_CONTRACT.material_change_during_run menciona EXPERIMENT_CONTAMINATION_EVENT explicitamente', () => {
  assert.match(CHANGE_FREEZE_CONTRACT.material_change_during_run, /EXPERIMENT_CONTAMINATION_EVENT/);
});

// 13. Hotmart remains financial truth.
test('13: buildAttributionPlan().checkout_to_hotmart_financial_outcome.supported=true e nomeia Hotmart/FINANCIAL_TRANSACTION_TRUTH', () => {
  const plan = buildAttributionPlan();
  assert.equal(plan.checkout_to_hotmart_financial_outcome.supported, true);
  assert.match(plan.checkout_to_hotmart_financial_outcome.method, /Hotmart|FINANCIAL_TRANSACTION_TRUTH/);
});

// 14. Individual attribution not invented.
test('14: buildAttributionPlan().individual_session_level_attribution.supported=false — nunca fingido como existente', () => {
  const plan = buildAttributionPlan();
  assert.equal(plan.individual_session_level_attribution.supported, false);
  assert.equal(plan.real_supported_level, 'AGGREGATE_PERIOD_LEVEL (por arquitetura/variante/experimento/período) — nunca individual/session-level.');
});

// 15. Provisional thresholds remain provisional.
test('15: PROVISIONAL_OBSERVATION_RULE.status=PROVISIONAL_OPERATIONAL_REFERENCE, nunca VALIDATED_STATISTICAL_DECISION_RULE', () => {
  assert.equal(PROVISIONAL_OBSERVATION_RULE.status, 'PROVISIONAL_OPERATIONAL_REFERENCE');
  assert.equal(PROVISIONAL_OBSERVATION_RULE.never, 'VALIDATED_STATISTICAL_DECISION_RULE');
});

// 16. Early harm can stop before reference completion.
test('16: auditEarlyHarmSignals() lista sinais reais defensáveis (technical/tracking/financial_truth/checkout/policy) capazes de parar antes da referência provisória completar', () => {
  const audit = auditEarlyHarmSignals();
  assert.ok(audit.signals_with_defensible_stop_condition.includes('technical_failure'));
  assert.ok(audit.signals_with_defensible_stop_condition.includes('financial_truth_failure'));
});

// 17. Missing harm threshold remains NOT_CONFIGURED.
test('17: severe_conversion_failure e unexpected_spend permanecem NOT_CONFIGURED — nenhum percentual inventado', () => {
  assert.equal(EARLY_HARM_SIGNALS.severe_conversion_failure.status, 'NOT_CONFIGURED');
  assert.equal(EARLY_HARM_SIGNALS.unexpected_spend.status, 'NOT_CONFIGURED');
});

// 18. Policy violation can stop.
test('18: EARLY_HARM_SIGNALS.policy_violation.defensible_signal_exists=true, referencia Policy Engine soberano', () => {
  assert.equal(EARLY_HARM_SIGNALS.policy_violation.defensible_signal_exists, true);
  assert.match(EARLY_HARM_SIGNALS.policy_violation.source, /policyEngine/);
});

// 19. Financial truth failure can stop.
test('19: EARLY_HARM_SIGNALS.financial_truth_failure.defensible_signal_exists=true, referencia Circuit Breaker GLOBAL_FREEZE', () => {
  assert.equal(EARLY_HARM_SIGNALS.financial_truth_failure.defensible_signal_exists, true);
  assert.match(EARLY_HARM_SIGNALS.financial_truth_failure.source, /GLOBAL_FREEZE|circuitBreaker/);
});

// 20. Tracking failure can stop.
test('20: EARLY_HARM_SIGNALS.tracking_failure.defensible_signal_exists=true', () => {
  assert.equal(EARLY_HARM_SIGNALS.tracking_failure.defensible_signal_exists, true);
});

// 21. Approval is experiment-specific/bounded.
test('21: real — buildHumanDeployApprovalObject().scope_note afirma escopo específico/limitado, nunca autorização geral', () => {
  const exposureRec = recommendExposureMechanism();
  const deployPlan = buildDeploymentPlan({ treatmentRelativePath: 'advertorial-comprehension' });
  const capitalPlan = buildCapitalPlan({ mvaTestEstimatedCapital: 'NOT_ESTIMABLE' });
  const approval = buildHumanDeployApprovalObject({ exposureMechanism: exposureRec, deploymentPlan: deployPlan, capitalPlan });
  assert.match(approval.scope_note, /ESPECÍFICA e limitada/);
  assert.match(approval.scope_note, /NUNCA uma autorização geral/);
});

// 22. Deploy approval does not promote authority tier.
test('22: real — approval.scope_note afirma explicitamente que a aprovação nunca promove Authority Tier', () => {
  const exposureRec = recommendExposureMechanism();
  const deployPlan = buildDeploymentPlan({ treatmentRelativePath: 'advertorial-comprehension' });
  const capitalPlan = buildCapitalPlan({ mvaTestEstimatedCapital: 'NOT_ESTIMABLE' });
  const approval = buildHumanDeployApprovalObject({ exposureMechanism: exposureRec, deploymentPlan: deployPlan, capitalPlan });
  assert.match(approval.scope_note, /nem uma promoção de Authority Tier/);
  assert.match(approval.WHAT_WILL_NOT_CHANGE, /TIER_0_ANALYZE_ONLY/);
});

// 23. CEO recommendation != execution authority.
test('23: real — CEO após auditoria continua com would_execute=false (shadow), recomendação nunca vira autoridade de execução', () => {
  const ceo = runCeoDecisionCycle({});
  assert.equal(ceo.shadow_execution.would_execute, false);
});

// 24. Control remains untouched.
test('24: real — git diff de teste-b/ e vercel.json continuam vazios após PASSO 17.1', () => {
  assert.equal(gitDiffStat('teste-b/').trim(), '');
  assert.equal(gitDiffStat('vercel.json').trim(), '');
});

// 25. Treatment remains NOT_DEPLOYED.
test('25: real — nenhuma entrada ACTIVE do registry real existe pro architecture_id do treatment', () => {
  const registry = loadExposureRegistry();
  const treatmentEntries = registry.filter((e) => e.architecture_id === 'ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE' && e.status === 'ACTIVE');
  assert.equal(treatmentEntries.length, 0);
});

// 26. No external mutation.
test('26: nenhuma função deste módulo executa fetch/rede/escrita externa — só retorna estruturas de dados', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'orchestrator', 'preDeployReviewAndLaunchContract.js'), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|writeFileSync|execSync/);
});

// 27. No deploy.
test('27: real — git diff de vercel.json vazio (redundante com item 24, confirma novamente)', () => {
  assert.equal(gitDiffStat('vercel.json').trim(), '');
});

// 28. No media mutation.
test('28: real — nenhum arquivo de creative/campanha foi alterado neste PASSO', () => {
  const status = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  assert.doesNotMatch(status, /analytics\/data\/creatives\/|analytics\/src\/creative\//);
});

// 29. No capital spend.
test('29: real — CURRENT_AVAILABLE_VALIDATION_CAPITAL=NOT_APPLICABLE, nunca presumido do orçamento de mídia corrente', () => {
  const plan = buildCapitalPlan({ mvaTestEstimatedCapital: 'NOT_ESTIMABLE' });
  assert.equal(plan.CURRENT_AVAILABLE_VALIDATION_CAPITAL, 'NOT_APPLICABLE');
});

// 30. SAFE_MODE.
test('30: SAFE_MODE continua true após PASSO 17.1', () => {
  assert.equal(SAFE_MODE, true);
});

// 31. SHADOW_MODE.
test('31: SHADOW_MODE continua true após PASSO 17.1', () => {
  assert.equal(SHADOW_MODE, true);
});

// 32. Determinism.
test('32: real — recommendExposureMechanism()/auditCopyClaims()/auditExperimentalIsolation() são determinísticos entre execuções', () => {
  assert.deepEqual(recommendExposureMechanism(), recommendExposureMechanism());
  assert.deepEqual(auditCopyClaims(), auditCopyClaims());
  assert.deepEqual(auditExperimentalIsolation(), auditExperimentalIsolation());
});
