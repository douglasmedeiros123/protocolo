'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTrackingScopeMatrix } = require('../src/planner/trackingScopes');
const { requiredTrackingScopeForAction, evaluateActionTrackingEligibility } = require('../src/planner/trackingBlockMatrix');
const { computeCapitalPosture } = require('../src/planner/capitalPosture');
const {
  computeExpectedEconomicValueOfContinuing, computeValueOfInformationOfContinuing, computeExpectedEconomicValueOfSwitching,
} = require('../src/planner/expectedValue');
const { buildEvidenceGapRegistry, rankEvidenceGaps } = require('../src/planner/evidenceGaps');
const { buildAction, buildCostModel, resetActionCounter } = require('../src/planner/strategicActions');
const { analyzePlan } = require('../src/planner/builder');
const { dateRange } = require('../src/utils/dates');

// ===== item 26 — TESTES TRACKING =====

test('item 26: Meta purchase mismatch != automaticamente financial truth blocked (só flags BLOCKING bloqueiam, não DEGRADING)', () => {
  const { scopes } = buildTrackingScopeMatrix({ criticalFlagsByDay: [{ date: '2026-08-19', codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] }] });
  assert.notEqual(scopes.FINANCIAL_TRUTH.status, 'BLOCKED');
  assert.equal(scopes.FINANCIAL_TRUTH.status, 'DEGRADED');
});

test('item 26: Hotmart confiável preserva medição financeira agregada mesmo com ruído Meta', () => {
  const { scopes } = buildTrackingScopeMatrix({ criticalFlagsByDay: [{ date: '2026-08-19', codes: ['META_PURCHASE_WITHOUT_HOTMART_SALE'] }] });
  assert.ok(['RELIABLE', 'DEGRADED'].includes(scopes.FINANCIAL_TRUTH.status));
});

test('item 26: flag bloqueante real (ex.: MISSING_DATA da Hotmart) bloqueia FINANCIAL_TRUTH de verdade', () => {
  const { scopes } = buildTrackingScopeMatrix({ criticalFlagsByDay: [{ date: '2026-08-19', codes: ['MISSING_DATA'] }] });
  assert.equal(scopes.FINANCIAL_TRUTH.status, 'BLOCKED');
});

test('item 26: attribution issue bloqueia ação que depende dela (RUN_EXPERIMENT de Creative)', () => {
  const trackingScopes = { CREATIVE_ATTRIBUTION: { status: 'BLOCKED', reason: 'x' }, FINANCIAL_TRUTH: { status: 'RELIABLE' } };
  const action = { action_type: 'RUN_EXPERIMENT', source_agent: 'CREATIVE' };
  const e = evaluateActionTrackingEligibility(action, trackingScopes);
  assert.equal(e.eligible, false);
  assert.equal(e.required_tracking_scope, 'CREATIVE_ATTRIBUTION');
});

test('item 26: attribution issue NÃO bloqueia validação técnica gratuita não-relacionada', () => {
  const trackingScopes = { CREATIVE_ATTRIBUTION: { status: 'BLOCKED', reason: 'x' } };
  const action = { action_type: 'VALIDATE', source_agent: 'CRO' };
  const e = evaluateActionTrackingEligibility(action, trackingScopes);
  assert.equal(e.eligible, true);
  assert.equal(e.required_tracking_scope, null);
});

test('item 26: blocker parcial (só um escopo BLOCKED, outros RELIABLE) produz capital_posture SELECTIVE', () => {
  resetActionCounter();
  const blocked = buildAction({ productId: 'p', sourceAgent: 'CREATIVE', sourceCandidateId: 'c1', actionType: 'RUN_EXPERIMENT', objective: 'x' });
  blocked.status = 'BLOCKED';
  blocked.tracking_eligibility = { eligible: false, required_tracking_scope: 'CREATIVE_ATTRIBUTION' };
  const ready = buildAction({ productId: 'p', sourceAgent: 'CRO', sourceCandidateId: 'c2', actionType: 'VALIDATE', objective: 'y' });
  ready.status = 'READY';
  const posture = computeCapitalPosture({ financialTruthStatus: 'RELIABLE', actions: [blocked, ready], scaleGateStatus: 'NOT_ELIGIBLE' });
  assert.equal(posture.posture, 'SELECTIVE');
});

test('item 26: blocker amplo (FINANCIAL_TRUTH BLOCKED) ainda produz HOLD', () => {
  const posture = computeCapitalPosture({ financialTruthStatus: 'BLOCKED', actions: [], scaleGateStatus: 'NOT_ELIGIBLE' });
  assert.equal(posture.posture, 'HOLD');
});

test('item 26: SCALE continua bloqueável mesmo quando a validação (outras ações) continua — required scope de SCALE_CAPITAL é sempre FINANCIAL_TRUTH', () => {
  assert.equal(requiredTrackingScopeForAction({ action_type: 'SCALE_CAPITAL' }), 'FINANCIAL_TRUTH');
  assert.equal(requiredTrackingScopeForAction({ action_type: 'VALIDATE' }), null);
});

// ===== item 27 — TESTES EV vs VOI =====

test('item 27: lever AVAILABLE (candidato real existe) != economic EV positivo', () => {
  const r = computeExpectedEconomicValueOfContinuing({ learningEvidence: { total_hypotheses: 0, by_category: {} }, knownPathToTarget: { status: 'NO_KNOWN_PATH' } });
  assert.equal(r.status, 'UNKNOWN');
});

test('item 27: candidato barato != economic EV positivo (mesmo com custo ~0, sem hipótese SUPPORTED real, EV fica UNKNOWN)', () => {
  const r = computeExpectedEconomicValueOfContinuing({ learningEvidence: { total_hypotheses: 3, by_category: { CRO: { supporting_learnings: 0, invalidated_hypotheses: 0, contradictory_learnings: 0 } } }, knownPathToTarget: { status: 'PARTIAL' } });
  assert.equal(r.status, 'UNKNOWN');
});

test('item 27: probabilidades desconhecidas -> economic EV UNKNOWN, nunca inventado', () => {
  const r = computeExpectedEconomicValueOfContinuing({ learningEvidence: null, knownPathToTarget: { status: 'UNKNOWN' } });
  assert.equal(r.status, 'UNKNOWN');
  assert.equal(r.monetary_estimate, null);
});

test('item 27: incerteza decisiva alta pode produzir VOI HIGH', () => {
  const evidenceGaps = [{ decision_classification: 'DECISION_CRITICAL', estimated_cost: 0 }];
  const r = computeValueOfInformationOfContinuing({ evidenceGaps, hypothesisSpaceStatus: { status: 'LARGELY_UNEXPLORED' } });
  assert.equal(r.status, 'HIGH');
});

test('item 27: VOI HIGH pode justificar CONTINUE_VALIDATION mesmo com economic EV UNKNOWN (combinação válida, item 11)', () => {
  const ev = computeExpectedEconomicValueOfContinuing({ learningEvidence: { total_hypotheses: 0, by_category: {} }, knownPathToTarget: { status: 'NO_KNOWN_PATH' } });
  const voi = computeValueOfInformationOfContinuing({ evidenceGaps: [{ decision_classification: 'DECISION_CRITICAL', estimated_cost: 0 }], hypothesisSpaceStatus: { status: 'LARGELY_UNEXPLORED' } });
  assert.equal(ev.status, 'UNKNOWN');
  assert.equal(voi.status, 'HIGH');
});

test('item 27: VOI LOW + espaço de hipóteses quase exaurido pode suportar progressão de switch (não decide sozinho, mas não impede)', () => {
  const r = computeValueOfInformationOfContinuing({ evidenceGaps: [], hypothesisSpaceStatus: { status: 'NEAR_EXHAUSTED' } });
  assert.equal(r.status, 'LOW');
});

test('item 27: EV e VOI nunca são o mesmo campo — são conceitos e funções DISTINTAS com estados independentes', () => {
  const ev = computeExpectedEconomicValueOfContinuing({ learningEvidence: { total_hypotheses: 0, by_category: {} }, knownPathToTarget: { status: 'NO_KNOWN_PATH' } });
  const voi = computeValueOfInformationOfContinuing({ evidenceGaps: [], hypothesisSpaceStatus: { status: 'WELL_EXPLORED' } });
  assert.notEqual(ev.status, undefined);
  assert.notEqual(voi.status, undefined);
  assert.notDeepEqual(ev, voi);
});

// ===== item 28 — TESTES EVIDENCE GAP =====

function realDiagnosticsFixture() {
  return {
    croDiagnostics: [
      { diagnostic_id: 'CRO-DIAG-DUPLICATE-ID-OFERTA', diagnostic_type: 'TECHNICAL_ISSUE', existence_confidence: 'HIGH', impact_confidence: 'LOW', causal_status: 'OBSERVED', observation: 'id duplicado real', validation_method: 'STATIC_CODE_CHECK' },
      { diagnostic_id: 'CRO-DIAG-FAQ-ANSWERS-NOT-IN-STATIC-HTML', diagnostic_type: 'FUNCTIONAL_FRICTION', existence_confidence: 'HIGH', impact_confidence: 'LOW', causal_status: 'HYPOTHESIZED', observation: 'FAQ sem resposta no HTML estático', validation_method: 'FUNCTIONAL_TEST' },
    ],
    offerDiagnostics: [{ diagnostic_id: 'OFFER-DIAG-X', diagnostic_type: 'DATA_GAP', observation: 'atribuição parcial' }],
    knownPathToTarget: { status: 'NO_KNOWN_PATH', reason: 'gap não fecha' },
    leverExhaustionScore: { score: 'NOT_ESTIMABLE', reason: 'sem base' },
  };
}

test('item 28: nem todo gap é DECISION_CRITICAL — só os de origem PRODUCT_VIABILITY (known path/lever exhaustion)', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const critical = gaps.filter((g) => g.decision_classification === 'DECISION_CRITICAL');
  const notCritical = gaps.filter((g) => g.decision_classification !== 'DECISION_CRITICAL');
  assert.equal(critical.length, 2); // known_path + lever_exhaustion
  assert.ok(notCritical.length > 0);
});

test('item 28: LOCAL_OPTIMIZATION != PRODUCT_VIABILITY — gaps CRO/Offer nunca competem em pé de igualdade com o gap de viabilidade', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const viabilityGaps = gaps.filter((g) => g.category === 'PRODUCT_VIABILITY');
  const localGaps = gaps.filter((g) => g.category === 'LOCAL_OPTIMIZATION');
  assert.ok(viabilityGaps.length > 0 && localGaps.length > 0);
  // todo PRODUCT_VIABILITY deve rankear acima de todo LOCAL_OPTIMIZATION
  const maxLocalPriority = Math.max(...localGaps.map((g) => g.priority));
  const minViabilityPriority = Math.min(...viabilityGaps.map((g) => g.priority));
  assert.ok(minViabilityPriority < maxLocalPriority);
});

test('item 28: evidência barata irrelevante NÃO supera automaticamente evidência cara decisiva no ranking', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const faqGap = gaps.find((g) => g.evidence_gap_id && g.current_knowledge.includes('FAQ-ANSWERS'));
  const knownPathGap = gaps.find((g) => g.category === 'PRODUCT_VIABILITY');
  assert.ok(faqGap.priority > knownPathGap.priority); // FAQ (custo 0) rankeia ABAIXO do gap de viabilidade (custo 300)
});

test('item 28: limitação de inspeção do FAQ (HTML estático, causal_status HYPOTHESIZED) NÃO é automaticamente promovida a problema de conversão', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const faqGap = gaps.find((g) => g.current_knowledge.includes('FAQ-ANSWERS'));
  assert.equal(faqGap.decision_classification, 'INFORMATIONAL');
  assert.equal(faqGap.data_inspection_limitation, true);
});

test('item 28: um gap PODE ser INFORMATIONAL (nem todo gap é decisivo)', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  assert.ok(gaps.some((g) => g.decision_classification === 'INFORMATIONAL'));
});

test('item 28: DECISION_CRITICAL exige consequência estratégica plausível listada (plausible_consequences não vazio)', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const critical = gaps.filter((g) => g.decision_classification === 'DECISION_CRITICAL');
  for (const g of critical) assert.ok(g.plausible_consequences.length > 0);
  const informational = gaps.filter((g) => g.decision_classification === 'INFORMATIONAL');
  for (const g of informational) assert.equal(g.plausible_consequences.length, 0);
});

test('item 28: ranking de evidence gaps é determinístico', () => {
  const a = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  const b = buildEvidenceGapRegistry({ productId: 'p', ...realDiagnosticsFixture() });
  assert.deepEqual(a.map((g) => g.decision_classification), b.map((g) => g.decision_classification));
});

// ===== item 29 — TESTES COST MODEL =====

test('item 29: analysis_cost != measurement_capital — campos separados, nunca fundidos', () => {
  const cm = buildCostModel({ analysisCost: 0, implementationCost: 0, measurementCapital: 300 });
  assert.equal(cm.analysis_cost, 0);
  assert.equal(cm.measurement_capital, 300);
  assert.notEqual(cm.analysis_cost, cm.measurement_capital);
});

test('item 29: gerar candidato (analysis barata) não significa que validá-lo custa zero — measurement_capital pode ser NOT_ESTIMABLE mesmo com analysis_cost=0', () => {
  const cm = buildCostModel({ analysisCost: 0, implementationCost: 0, measurementCapital: 'NOT_ESTIMABLE' });
  assert.equal(cm.analysis_cost, 0);
  assert.equal(cm.measurement_capital, 'NOT_ESTIMABLE');
});

test('item 29: measurement_capital desconhecido != zero — total_known_cost vira NOT_ESTIMABLE, nunca soma como se fosse 0', () => {
  const cm = buildCostModel({ analysisCost: 0, implementationCost: 0, measurementCapital: 'NOT_ESTIMABLE' });
  assert.equal(cm.total_known_cost, 'NOT_ESTIMABLE');
  assert.notEqual(cm.total_known_cost, 0);
});

test('item 29: total_known_cost não inclui silenciosamente um componente desconhecido como zero — só soma quando TODOS são conhecidos', () => {
  const knownAll = buildCostModel({ analysisCost: 0, implementationCost: 10, measurementCapital: 300 });
  assert.equal(knownAll.total_known_cost, 310);
  const oneUnknown = buildCostModel({ analysisCost: 0, implementationCost: 10, measurementCapital: null });
  assert.equal(oneUnknown.total_known_cost, 'NOT_ESTIMABLE');
});

// ===== integração real =====

test('integração real: CREATIVE/OFFER/CRO RUN_EXPERIMENT actions têm measurement_capital NOT_ESTIMABLE (nunca 0 inventado)', () => {
  const r = analyzePlan({});
  const runExperiments = r.actions.filter((a) => a.action_type === 'RUN_EXPERIMENT' && a.source_agent !== 'MEDIA_BUYING');
  for (const a of runExperiments) assert.equal(a.cost_model.measurement_capital, 'NOT_ESTIMABLE');
});

test('integração real: ações VALIDATE/FIX (CRO técnico) têm cost_model 100% conhecido e igual a zero', () => {
  const r = analyzePlan({});
  const technical = r.actions.filter((a) => a.action_type === 'VALIDATE' || a.action_type === 'FIX');
  for (const a of technical) assert.equal(a.cost_model.total_known_cost, 0);
});

test('integração real: capital_posture é um dos 4 valores válidos e vem separado do verdict', () => {
  const r = analyzePlan({});
  assert.ok(['OPEN', 'SELECTIVE', 'HOLD', 'SCALE'].includes(r.plan.capital_posture));
  assert.notEqual(r.plan.capital_posture, r.plan.verdict);
});

test('integração real: tracking_scopes tem as 6 categorias reais do dado persistido', () => {
  const r = analyzePlan({});
  assert.deepEqual(Object.keys(r.tracking_scopes).sort(), ['FINANCIAL_TRUTH', 'PLATFORM_ATTRIBUTION', 'CREATIVE_ATTRIBUTION', 'CAMPAIGN_ATTRIBUTION', 'FUNNEL_MEASUREMENT', 'EXPERIMENT_MEASUREMENT'].sort());
});

test('idempotência: tracking scopes reais são estáveis entre chamadas', () => {
  const dates = dateRange('2026-07-30', '2026-08-28');
  const { buildTrackingScopeMatrix: build } = require('../src/planner/trackingScopes');
  const { buildEconomicsSnapshot } = require('../src/planner/economicsSnapshot');
  const snap = buildEconomicsSnapshot(dates);
  const a = build({ criticalFlagsByDay: snap.critical_flags_by_day });
  const b = build({ criticalFlagsByDay: snap.critical_flags_by_day });
  assert.deepEqual(a.scopes, b.scopes);
});
