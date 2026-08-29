'use strict';

// PASSO 16.1 — FIRST EXPERIMENT DECISION SEMANTICS. Os 23 testes obrigatórios do item 12,
// numerados na mesma ordem do pedido. NÃO constrói advertorial, NÃO faz deploy, NÃO gasta
// capital — só valida a semântica de decisão (regra de evidência, leading vs economic,
// behavioral vs economic win, stop/continue, readiness subdividido, evidência histórica).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditEvidenceRuleFoundation, buildExperimentDesignRuleStatus, buildMetricSeparation,
  classifyBehavioralVsEconomicOutcome, classifyEvidenceSufficiency,
  buildStructuredDecisionQuestion, buildMultiStageDecisionStructure,
  HARM_THRESHOLD_STATUS, STOP_CONTINUE_STATES, deriveStopContinueRecommendation,
  buildReadinessSubdimensions, FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING,
  buildHistoricalEvidenceSummary,
} = require('../src/orchestrator/experimentDecisionSemantics');
const { buildFirstExperimentReadiness, determineReadinessState } = require('../src/orchestrator/firstExperimentReadiness');
const { analyzeStrategy } = require('../src/strategy-search/builder');
const { analyzeMeasurement } = require('../src/measurement/builder');
const { analyzePlan } = require('../src/planner/builder');
const { SAFE_MODE } = require('../src/execution/safeMode');
const { SHADOW_MODE } = require('../src/orchestrator/shadowMode');

// 1. FUNNEL_ARCHITECTURE != CRO silenciosamente.
test('1: real — auditEvidenceRuleFoundation() marca experiment_nature=FUNNEL_ARCHITECTURE distinto de consumed_category=CRO, nunca fundidos silenciosamente', () => {
  const strategyResult = analyzeStrategy({});
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const winner = strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);
  if (!winner) return;
  const audit = auditEvidenceRuleFoundation({ mvaTest: winner.mva_test });
  assert.equal(audit.experiment_nature, 'FUNNEL_ARCHITECTURE');
  assert.equal(audit.consumed_category, 'CRO');
  assert.notEqual(audit.experiment_nature, audit.consumed_category);
});

// 2. CRO thresholds podem ser referência provisória sem virar regra de arquitetura validada.
test('2: buildExperimentDesignRuleStatus() com classification != ARCHITECTURAL_ECONOMIC_FOUNDATION nunca retorna VALIDATED_DECISION_RULE', () => {
  const status = buildExperimentDesignRuleStatus({ foundationAudit: { classification: 'HISTORICAL_DEFAULT_ONLY', minimum_evidence_consumed: { lpv: 100 } } });
  assert.equal(status.status, 'NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION');
  assert.notEqual(status.status, 'VALIDATED_DECISION_RULE');
});

// 3. Regra de referência != regra de decisão validada (distinção explícita, nunca apagada).
test('3: buildExperimentDesignRuleStatus() preserva reference_rule mas nunca declara reason sem a distinção REFERENCE != VALIDATED', () => {
  const status = buildExperimentDesignRuleStatus({ foundationAudit: { classification: 'HISTORICAL_DEFAULT_ONLY', minimum_evidence_consumed: { lpv: 100 } } });
  assert.ok(status.reference_rule);
  assert.match(status.reason, /REFERENCE.*!=.*VALIDATED_DECISION_RULE|REFERENCE_OPERACIONAL_PROVIS/i);
});

// 4. Melhora comportamental sozinha != vencedor econômico.
test('4: classifyBehavioralVsEconomicOutcome(IMPROVED,IMPROVED) nunca retorna literal "WINNER" — só uma classificação estrutural, decisão final exige sufficiency', () => {
  const r = classifyBehavioralVsEconomicOutcome({ behavioralDirection: 'IMPROVED', economicDirection: 'IMPROVED' });
  assert.equal(r.classification, 'BEHAVIORAL_AND_ECONOMIC_IMPROVEMENT');
  assert.notEqual(r.classification, 'WINNER');
});

// 5. Melhora comportamental + deterioração financeira nunca pode ser WINNER.
test('5: real — cenário sintético do enunciado (LPV->checkout 9%->14%, ROAS 0.8->0.5) = BEHAVIORAL_IMPROVEMENT_WITH_ECONOMIC_DETERIORATION, nunca WINNER', () => {
  const r = classifyBehavioralVsEconomicOutcome({ behavioralDirection: 'IMPROVED', economicDirection: 'DETERIORATED' });
  assert.equal(r.classification, 'BEHAVIORAL_IMPROVEMENT_WITH_ECONOMIC_DETERIORATION');
  const sufficiency = classifyEvidenceSufficiency({ minimumEvidenceMet: true, behavioralEconomicClassification: r.classification });
  assert.equal(sufficiency.economic_result, 'ECONOMIC_LOSS');
  assert.notEqual(sufficiency.economic_result, 'ECONOMIC_WIN');
});

// 6. Uma venda financeira isolada não prova vencedor automaticamente.
test('6: classifyEvidenceSufficiency({minimumEvidenceMet:false}) = PROMISING_SIGNAL com economic_result=null, mesmo com direção favorável — nunca ECONOMIC_WIN por amostra insuficiente', () => {
  const r = classifyEvidenceSufficiency({ minimumEvidenceMet: false, behavioralEconomicClassification: 'BEHAVIORAL_AND_ECONOMIC_IMPROVEMENT' });
  assert.equal(r.evidence_volume, 'PROMISING_SIGNAL');
  assert.equal(r.economic_result, null);
});

// 7. Leading indicator separado do economic outcome.
test('7: real — buildMetricSeparation() nunca mistura LEADING_INDICATOR com ECONOMIC_OUTCOME (métricas distintas, sem sobreposição)', () => {
  const strategyResult = analyzeStrategy({});
  const measurementResult = analyzeMeasurement({});
  const planResult = analyzePlan({});
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const winner = strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);
  if (!winner) return;
  const sep = buildMetricSeparation({ mvaTest: winner.mva_test, planFinancials: planResult.economics_snapshot.financials, measurementAnalysis: measurementResult.analysis });
  assert.ok(!sep.ECONOMIC_OUTCOME.metrics.includes(sep.LEADING_INDICATOR.metric));
  assert.ok(!sep.GUARDRAIL_METRICS.metrics.includes(sep.LEADING_INDICATOR.metric));
});

// 8. Financial truth continua autoridade pro resultado econômico.
test('8: real — metric_separation.ECONOMIC_OUTCOME.role afirma FINANCIAL_TRANSACTION_TRUTH (Hotmart) como única fonte, nunca sinal de plataforma', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.match(readiness.metric_separation.ECONOMIC_OUTCOME.role, /FINANCIAL_TRANSACTION_TRUTH|Hotmart/);
  assert.doesNotMatch(readiness.metric_separation.ECONOMIC_OUTCOME.role, /Meta/);
});

// 9. Ghost purchase do Meta nunca pode criar um economic win.
test('9: real — GUARDRAIL_METRICS inclui ghost_purchase_reconciliation_anomalies, nunca dentro de ECONOMIC_OUTCOME (nunca pode inflar o resultado econômico)', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.ok(readiness.metric_separation.GUARDRAIL_METRICS.metrics.includes('ghost_purchase_reconciliation_anomalies'));
  assert.ok(!readiness.metric_separation.ECONOMIC_OUTCOME.metrics.includes('ghost_purchase_reconciliation_anomalies'));
});

// 10. Deterioração de guardrail pode impedir declaração de vencedor.
test('10: deriveStopContinueRecommendation({realGuardrailBreach}) sempre retorna STOP_FOR_HARM, com precedência sobre qualquer resultado econômico favorável', () => {
  const r = deriveStopContinueRecommendation({ evidenceVolume: 'SUFFICIENT_EVIDENCE', economicResult: 'ECONOMIC_WIN', behavioralDirection: 'IMPROVED', economicDirection: 'IMPROVED', realGuardrailBreach: 'financial_truth_health=BLOCKED' });
  assert.equal(r.recommendation, 'STOP_FOR_HARM');
});

// 11. PROMISING_SIGNAL != SUFFICIENT_EVIDENCE.
test('11: classifyEvidenceSufficiency() nunca retorna os dois volumes simultaneamente — são mutuamente exclusivos', () => {
  const promising = classifyEvidenceSufficiency({ minimumEvidenceMet: false, behavioralEconomicClassification: 'INCONCLUSIVE_DIRECTION' });
  const sufficient = classifyEvidenceSufficiency({ minimumEvidenceMet: true, behavioralEconomicClassification: 'INCONCLUSIVE_DIRECTION' });
  assert.equal(promising.evidence_volume, 'PROMISING_SIGNAL');
  assert.equal(sufficient.evidence_volume, 'SUFFICIENT_EVIDENCE');
  assert.notEqual(promising.evidence_volume, sufficient.evidence_volume);
});

// 12. Experimento pode retornar INCONCLUSIVE.
test('12: classifyEvidenceSufficiency() com direção mista/indefinida retorna economic_result=INCONCLUSIVE, nunca forçado pra WIN/LOSS', () => {
  const r = classifyEvidenceSufficiency({ minimumEvidenceMet: true, behavioralEconomicClassification: 'INCONCLUSIVE_DIRECTION' });
  assert.equal(r.economic_result, 'INCONCLUSIVE');
});

// 13. Experimento pode recomendar CONTINUE_COLLECTING.
test('13: deriveStopContinueRecommendation() com evidenceVolume=PROMISING_SIGNAL e sem sinal favorável retorna CONTINUE_COLLECTING', () => {
  const r = deriveStopContinueRecommendation({ evidenceVolume: 'PROMISING_SIGNAL', economicResult: null, behavioralDirection: 'FLAT', economicDirection: 'UNKNOWN', realGuardrailBreach: null });
  assert.equal(r.recommendation, 'CONTINUE_COLLECTING');
});

test('13b: deriveStopContinueRecommendation() com PROMISING_SIGNAL + ambas direções favoráveis retorna PROMISING_CONTINUE (distinto de CONTINUE_COLLECTING neutro)', () => {
  const r = deriveStopContinueRecommendation({ evidenceVolume: 'PROMISING_SIGNAL', economicResult: null, behavioralDirection: 'IMPROVED', economicDirection: 'IMPROVED', realGuardrailBreach: null });
  assert.equal(r.recommendation, 'PROMISING_CONTINUE');
});

// 14. Evidência operacional histórica existe mesmo com controlled experiments = 0.
test('14: real — historical_evidence real: HISTORICAL_OPERATIONAL_EVIDENCE=EXISTS coexistindo com MVA_CONTROLLED_EXPERIMENTS_COMPLETED=0, nunca "no learning exists"', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.historical_evidence.HISTORICAL_OPERATIONAL_EVIDENCE.status, 'EXISTS');
  assert.equal(readiness.historical_evidence.MVA_CONTROLLED_EXPERIMENTS_COMPLETED, 0);
});

// 15. Evidência histórica != evidência causal de experimento.
test('15: real — historical_evidence.prior_vs_causal_distinction afirma explicitamente que histórico nunca é promovido a evidência causal', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.match(readiness.historical_evidence.prior_vs_causal_distinction, /NUNCA promovido automaticamente a evidência causal/);
});

// 16. Evidência histórica pode informar prior/ranking.
test('16: historical_evidence.prior_vs_causal_distinction menciona uso real como prior pra Strategy Search (ranking), não descartado', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.match(readiness.historical_evidence.prior_vs_causal_distinction, /Strategy Search/);
});

// 17. READY_FOR_IMPLEMENTATION != READY_FOR_EXECUTION.
test('17: real — readiness_subdimensions nunca implica EXECUTION_READINESS=READY quando readiness agregado=READY_FOR_IMPLEMENTATION', () => {
  const readiness = buildFirstExperimentReadiness({});
  if (readiness.readiness === 'READY_FOR_IMPLEMENTATION') {
    assert.notEqual(readiness.readiness_subdimensions.EXECUTION_READINESS, 'READY');
  }
});

test('17b: buildReadinessSubdimensions() com TIER_0 sempre retorna EXECUTION_READINESS=BLOCKED_BY_CAPITAL_AUTHORITY, independente de IMPLEMENTATION_READINESS', () => {
  const r = buildReadinessSubdimensions({ implementationReadiness: { treatment_exists_as_real_page: true }, measurementBlocked: false, decisionRuleStatus: 'VALIDATED', treatmentDeployed: true, capitalAuthorityTier: 'TIER_0_ANALYZE_ONLY' });
  assert.equal(r.EXECUTION_READINESS, 'BLOCKED_BY_CAPITAL_AUTHORITY');
});

// 18. Categoria de experimento de arquitetura ausente permanece dívida explícita.
test('18: FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING está registrado como AUDITED_NOT_FIXED, nunca corrigido silenciosamente (experiments/schema.js fora do write boundary)', () => {
  assert.equal(FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING.status, 'AUDITED_NOT_FIXED');
  assert.equal(FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING.resolution_urgency, 'NOT_BLOCKING');
  assert.match(FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING.write_boundary_note, /fora do write boundary/);
});

// 19. SAFE_MODE.
test('19: SAFE_MODE continua true após PASSO 16.1', () => {
  assert.equal(SAFE_MODE, true);
});

// 20. SHADOW_MODE.
test('20: SHADOW_MODE continua true após PASSO 16.1', () => {
  assert.equal(SHADOW_MODE, true);
});

// 21. Zero mutação externa.
test('21: real — buildFirstExperimentReadiness() nunca constrói o tratamento nem reporta nenhuma mutação externa (treatment_exists_as_real_page sempre false, readiness nunca READY_FOR_EXECUTION)', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.implementation_requirements.treatment_exists_as_real_page, false);
  assert.notEqual(readiness.readiness, 'READY_FOR_EXECUTION');
});

// 22. Determinismo.
test('22: real — os módulos de semântica de decisão são determinísticos entre execuções, dado o mesmo estado real', () => {
  const r1 = buildFirstExperimentReadiness({});
  const r2 = buildFirstExperimentReadiness({});
  assert.deepEqual(r1.experiment_design_rule_audit, r2.experiment_design_rule_audit);
  assert.deepEqual(r1.experiment_design_rule_status, r2.experiment_design_rule_status);
  assert.deepEqual(r1.readiness_subdimensions, r2.readiness_subdimensions);
  assert.deepEqual(r1.historical_evidence, r2.historical_evidence);
});

// 23. Write boundary.
test('23: write boundary — experimentDecisionSemantics.js não importa nada de experiments/ (Experiment Engine nunca modificado/acessado neste PASSO)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'orchestrator', 'experimentDecisionSemantics.js'), 'utf8');
  assert.doesNotMatch(src, /require\(.*\/experiments\//);
});

// cobertura extra — multi-stage structure e pergunta estruturada, item 6-7.
test('extra: buildStructuredDecisionQuestion() sempre acopla condição econômica explícita, nunca só comportamental', () => {
  const q = buildStructuredDecisionQuestion({ winner: { architecture_id: 'X' }, mvaTest: { changed_components: ['ADVERTORIAL'], primary_metric: 'lpv_to_checkout_rate' } });
  assert.match(q.question, /financial_roas|CPA|economia financeira/);
});

test('extra2: buildMultiStageDecisionStructure() nunca autoriza conclusão econômica fora de STAGE_C', () => {
  const stages = buildMultiStageDecisionStructure({ metricSeparation: { LEADING_INDICATOR: { metric: 'lpv_to_checkout_rate' } } });
  assert.match(stages.STAGE_A_BEHAVIORAL_SIGNAL.authority, /NUNCA decide sozinho/);
  assert.match(stages.STAGE_C_ECONOMIC_DECISION.authority, /única etapa que autoriza uma conclusão econômica/);
});

test('extra3: HARM_THRESHOLD_STATUS=NOT_CONFIGURED — nenhum limite universal de dano foi inventado', () => {
  assert.equal(HARM_THRESHOLD_STATUS, 'NOT_CONFIGURED');
});
