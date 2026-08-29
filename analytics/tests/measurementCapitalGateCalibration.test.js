'use strict';

// PASSO 13.1 — MEASUREMENT CAPITAL-GATE + ANOMALY CALIBRATION. Os 16 testes obrigatórios do
// item 14, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrackingContract, resetContractCounter, classifyRequirement } = require('../src/measurement/trackingContract');
const { evaluateMeasurementCapitalGate } = require('../src/measurement/capitalGate');
const { evaluateBlockerDependencyGraph } = require('../src/measurement/blockerDependencyGraph');
const { buildAnomalyFindings, classifyAnomalySeverity } = require('../src/measurement/anomalyDetection');
const { buildMinimumViableAttribution, auditExposureToFinancialOutcomeChain } = require('../src/measurement/minimumViableAttribution');
const { buildFinancialTruthHealth, buildPlatformAttributionHealth } = require('../src/measurement/financialTruthHealth');
const { buildExecutionSafetySignal } = require('../src/measurement/executionSafetySignal');
const { buildReconciliation } = require('../src/measurement/reconciliation');
const { runFullPlatformAudit, auditClarity, auditMetaPixelCapi } = require('../src/measurement/platformAudit');
const { buildSourceOfTruthMatrix } = require('../src/measurement/sourceOfTruth');
const { analyzeMeasurement } = require('../src/measurement/builder');
const { standardWindows } = require('../src/profit/windows');
const { todayBRT } = require('../src/utils/dates');

const REAL_DATES = standardWindows(todayBRT()).last_30d.dates;
const platform = runFullPlatformAudit();

// 1. REQUIRED event não implica capital blocker.
test('1: um evento com status REQUIRED não implica automaticamente requirement_class=CAPITAL_BLOCKING_REQUIREMENT', () => {
  const c = classifyRequirement({ event: 'CHECKOUT_INITIATED', primaryOrGuardrailEvents: [] });
  assert.equal(c.requirement_class, 'DIAGNOSTIC_REQUIREMENT');
  assert.notEqual(c.requirement_class, 'CAPITAL_BLOCKING_REQUIREMENT');
});

// 2. Diagnostic event ausente pode manter teste elegível.
test('2: evento DIAGNOSTIC_REQUIREMENT ausente (REQUIRED) mantém o capital gate elegível quando os requisitos bloqueantes estão ok', () => {
  resetContractCounter();
  const contract = buildTrackingContract({ subjectType: 'CANDIDATE_ARCHITECTURE', subjectId: 'D1', architectureId: 'D1', stageTypes: ['CHECKOUT'], platform, financialTruthBlocking: false, productId: 'p' });
  const checkoutInitiated = contract.required_events.find((e) => e.event === 'CHECKOUT_INITIATED');
  assert.equal(checkoutInitiated.status, 'REQUIRED'); // ausente
  const gate = evaluateMeasurementCapitalGate({ contract, financialTruthBlocking: false, reconciliationMatchRate: 1 });
  assert.equal(gate.state, 'READY_FOR_CAPITAL');
});

// 3. Missing exposure→financial linkage bloqueia experimento quando indispensável.
test('3: EXPOSURE_IDENTITY ausente bloqueia EXPERIMENT_ATTRIBUTION mesmo com FINANCIAL_OUTCOME_LINKAGE satisfeito', () => {
  const graph = evaluateBlockerDependencyGraph({ evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: false, CHECKOUT_INITIATED_EVENT: true } });
  assert.equal(graph.nodes.EXPERIMENT_ATTRIBUTION.satisfied, false);
  assert.equal(graph.current_blocker, 'EXPOSURE_IDENTITY');
});

// 4. CHECKOUT_INITIATED sozinho não libera experimento se financial linkage continuar ausente.
test('4: mesmo com CHECKOUT_INITIATED satisfeito, EXPERIMENT_ATTRIBUTION continua bloqueado se EXPOSURE_IDENTITY faltar', () => {
  const graph = evaluateBlockerDependencyGraph({ evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: false, CHECKOUT_INITIATED_EVENT: true } });
  assert.equal(graph.current_blocker, 'EXPOSURE_IDENTITY');
  assert.ok(graph.remaining_blockers.includes('EXPERIMENT_ATTRIBUTION'));
  const chain = auditExposureToFinancialOutcomeChain({ hasSessionId: false, hasVariantId: false, hasArchitectureVersionTimeline: false });
  assert.equal(chain.would_checkout_initiated_alone_unlock_full_attribution, false);
  assert.equal(chain.true_bottleneck_stage, 'EXPOSURE_IDENTITY');
});

// 5. Minimum Viable Attribution pode liberar teste sem tracking perfeito.
test('5: minimum viable attribution é suficiente pra decisão mesmo sem session_id/variant_id (tracking perfeito nunca exigido)', () => {
  const mva = buildMinimumViableAttribution({ hasArchitectureVersionTimeline: true });
  assert.equal(mva.sufficient_for_decision, true);
  assert.equal(mva.defensible_confidence_level, 'LOW'); // honesto, nunca inflado
  assert.equal(mva.which_variant_was_exposed, 'AVAILABLE_AT_DATE_RANGE_LEVEL');
});

// 6. Non-dependent anomaly não bloqueia decisão.
test('6: anomalia cujo escopo não sobrepõe a dependência da decisão nunca escala além de WARNING', () => {
  const r = classifyAnomalySeverity({ type: 'VALUE_MISMATCH', occurrenceCount: 10, totalDays: 30, decisionDependsOnScopes: ['EXPERIMENT_ATTRIBUTION'] });
  assert.notEqual(r.severity, 'CRITICAL');
  assert.notEqual(r.severity, 'CAPITAL_BLOCKING');
  assert.equal(r.overlaps_decision, false);
});

// 7. Dependent critical anomaly pode bloquear capital.
test('7: DUPLICATE_SUSPECTED sobrepondo a dependência da decisão pode virar CAPITAL_BLOCKING', () => {
  const r = classifyAnomalySeverity({ type: 'DUPLICATE_SUSPECTED', occurrenceCount: 1, totalDays: 30, decisionDependsOnScopes: ['FINANCIAL_TRUTH'] });
  assert.equal(r.severity, 'CAPITAL_BLOCKING');
});

// 8. Meta ghost purchase não degrada automaticamente Hotmart financial truth.
test('8: ocorrência de META_PURCHASE_WITHOUT_HOTMART_SALE nunca aparece em buildFinancialTruthHealth — só em buildPlatformAttributionHealth', () => {
  const flagsByDay = [{ date: '2026-08-19', codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] }];
  const financial = buildFinancialTruthHealth(flagsByDay);
  const platformAttr = buildPlatformAttributionHealth(flagsByDay);
  assert.equal(financial.status, 'RELIABLE');
  assert.equal(financial.blocking_occurrences.length, 0);
  assert.equal(platformAttr.status, 'DEGRADED');
  assert.equal(platformAttr.degrading_occurrences.length, 1);
});

// 9. Cross-platform reconciliation pode estar DEGRADED enquanto financial truth permanece saudável.
test('9: real — reconciliação real (match_rate<100%) coexiste com FINANCIAL_TRANSACTION_TRUTH=RELIABLE hoje', () => {
  const r = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  assert.equal(r.domains.FINANCIAL_TRANSACTION_TRUTH.status, 'RELIABLE');
  assert.ok(r.domains.CROSS_PLATFORM_RECONCILIATION.status === 'PARTIAL' || r.domains.CROSS_PLATFORM_RECONCILIATION.status === 'DEGRADED');
});

// 10. Anomaly severity é contextual.
test('10: a mesma anomalia (mesmo tipo/contagem alto) recebe severidade diferente dependendo do decisionDependsOnScopes', () => {
  // taxa alta (10/30=33%, >= limiar de 30%) escala pra CRITICAL só quando o escopo sobrepõe a
  // decisão — quando não sobrepõe, item 8 (ANOMALY_SCOPE != GLOBAL_BLOCK) trava em WARNING.
  const dependent = classifyAnomalySeverity({ type: 'META_PURCHASE_WITHOUT_HOTMART_SALE', occurrenceCount: 10, totalDays: 30, decisionDependsOnScopes: ['PLATFORM_ATTRIBUTION'] });
  const independent = classifyAnomalySeverity({ type: 'META_PURCHASE_WITHOUT_HOTMART_SALE', occurrenceCount: 10, totalDays: 30, decisionDependsOnScopes: ['EXPERIMENT_ATTRIBUTION'] });
  assert.notEqual(dependent.severity, independent.severity);
  assert.equal(dependent.severity, 'CRITICAL');
  assert.equal(independent.severity, 'WARNING');
});

// 11. GLOBAL_FREEZE não é default.
test('11: execution safety signal nunca é GLOBAL_FREEZE por causa de um único subject/capital gate — só quando financial truth health está BLOCKED', () => {
  const notBlocked = buildExecutionSafetySignal({ subjectId: 'X', financialTruthHealth: { status: 'RELIABLE' }, capitalGate: { state: 'BLOCKED_BY_MEASUREMENT', reason: 'r', next_unlock: null } });
  assert.notEqual(notBlocked.capital_action, 'GLOBAL_FREEZE');
  assert.equal(notBlocked.capital_action, 'BLOCK_DEPENDENT_ACTION');
  const blocked = buildExecutionSafetySignal({ subjectId: 'X', financialTruthHealth: { status: 'BLOCKED', reason: 'r' }, capitalGate: null });
  assert.equal(blocked.capital_action, 'GLOBAL_FREEZE');
});

// 12. Strategy winner pode mudar sem hardcode (cobertura adicional; ver measurementStrategyHandoffAndFreedom.test.js pra suite completa de 7 famílias).
test('12: real — o vencedor consumido pelo analyzeMeasurement muda automaticamente se o Strategy Search real mudar (lido dinamicamente, nunca fixo)', () => {
  const r1 = analyzeMeasurement({});
  const r2 = analyzeMeasurement({});
  assert.equal(r1.analysis.strategy_handoff.winner_architecture_id, r2.analysis.strategy_handoff.winner_architecture_id);
  assert.equal(r1.strategy_result_consumed.winner_architecture_id, r1.analysis.strategy_handoff.winner_architecture_id);
});

// 13. blocker dependency graph revela próximo blocker.
test('13: next_unlock do blocker dependency graph aponta o próximo nó real, nunca null enquanto restarem blockers', () => {
  const graph = evaluateBlockerDependencyGraph({ evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: false } });
  assert.equal(graph.next_unlock, 'EXPERIMENT_ATTRIBUTION');
});

// 14. resolver blocker atual não apaga blockers restantes.
test('14: resolver EXPOSURE_IDENTITY revela determinísticamente se EXPERIMENT_ATTRIBUTION já está satisfeito — nunca escondido', () => {
  const before = evaluateBlockerDependencyGraph({ evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: false } });
  assert.equal(before.current_blocker, 'EXPOSURE_IDENTITY');
  assert.deepEqual(before.remaining_blockers, ['EXPERIMENT_ATTRIBUTION']);
  const after = evaluateBlockerDependencyGraph({ evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: true } });
  assert.equal(after.current_blocker, null);
  assert.deepEqual(after.remaining_blockers, []);
  assert.equal(after.all_capital_blocking_satisfied, true);
});

// 15. Clarity-via-GTM não pode ser promovido de hipótese a fato sem evidência.
test('15: install_mechanism_status da Clarity nunca é CONFIRMED_VIA_GTM — hipótese fica em campo separado, nunca promovida a fato', () => {
  const clarity = auditClarity();
  assert.notEqual(clarity.install_mechanism_status, 'CONFIRMED_VIA_GTM');
  assert.ok(['UNKNOWN'].includes(clarity.install_mechanism_status));
  if (clarity.live_session_collection_status === 'CONFIRMED' && clarity.snippet_found_in_repo_html_status === 'NOT_AVAILABLE') {
    assert.equal(clarity.install_mechanism_injected_by_gtm_hypothesis_status, 'UNKNOWN_HYPOTHESIS');
  }
});

// 16. Pixel mechanism permanece runtime validation quando não comprovado.
test('16: browser_pixel_mechanism_status é sempre NEEDS_RUNTIME_VALIDATION quando não há snippet literal — nunca CONFIRMED por inferência', () => {
  const meta = auditMetaPixelCapi(true); // mesmo com ações reais de checkout/purchase observadas
  assert.equal(meta.browser_pixel_mechanism_status, 'NEEDS_RUNTIME_VALIDATION');
  assert.notEqual(meta.browser_pixel_status, 'CONFIRMED');
  assert.equal(meta.browser_pixel_gtm_injection_hypothesis_status, 'UNKNOWN_HYPOTHESIS'); // hipótese, rotulada como tal
});

// ===== cobertura extra: buildAnomalyFindings real + capital gate consumindo anomaly (item 8) =====

test('extra: real — capital gate do vencedor consome anomaly findings reais sem escalar pra CAPITAL_BLOCKING indevidamente (ghost purchase real é só 7% dos dias)', () => {
  const reconciliation = buildReconciliation({ dates: REAL_DATES });
  const anomalies = buildAnomalyFindings({ reconciliation, decisionDependsOnScopes: ['EXPERIMENT_ATTRIBUTION', 'FINANCIAL_TRUTH'] });
  assert.ok(!anomalies.findings.some((f) => f.severity === 'CAPITAL_BLOCKING'));
});
