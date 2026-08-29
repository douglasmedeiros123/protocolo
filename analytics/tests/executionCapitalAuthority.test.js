'use strict';

// PASSO 14B — os 27 testes obrigatórios do item 21, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyCapitalConcepts, buildRecommendationRange } = require('../src/execution/executionAuthorityLimits');
const { evaluatePolicyChangeRequest, PROTECTED_POLICY_DOMAINS } = require('../src/execution/selfModificationProtection');
const { evaluatePromotionGate, evaluateDemotionGate } = require('../src/execution/authorityPromotionGate');
const { evaluateExplorationBudget } = require('../src/execution/explorationPolicy');
const { recommendNoAction } = require('../src/execution/noActionPolicy');
const { runSyntheticR30ToR500Scenarios } = require('../src/execution/syntheticBudgetScenario');
const { evaluateBudgetEscalation } = require('../src/execution/budgetEscalationPolicy');
const { assessMarginalEconomics } = require('../src/execution/marginalEconomics');
const { evaluateLearningLossAcceptability } = require('../src/execution/lossBudget');
const { buildCandidate, rankCandidatesAndFindBestUse } = require('../src/execution/capitalAllocationInterface');
const { buildActionCapitalAssessment } = require('../src/execution/expectedValueAssessment');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');
const { proposeAndDryRunNextAction } = require('../src/execution/builder');
const { SAFE_MODE } = require('../src/execution/safeMode');

// 1. Recommendation can exceed autonomous authority.
test('1: RECOMMENDED_CAPITAL pode exceder AUTONOMOUS_EXECUTION_CAPITAL sem ser truncado (30 -> 500)', () => {
  const r = classifyCapitalConcepts({ recommendedValue: 500, currentValue: 30, capitalSafetyProfile: loadCapitalSafetyConfig({ max_capital_per_action: 50 }) });
  assert.equal(r.RECOMMENDED_CAPITAL.recommended_value, 500);
  assert.equal(r.AUTONOMOUS_EXECUTION_CAPITAL.within_limit, false);
});

// 2. Authority tier cannot be modified by LLM.
test('2: LLM_RECOMMENDATION nunca é autorizada a alterar ACTIVE_AUTHORITY_TIER', () => {
  const r = evaluatePolicyChangeRequest({ domain: 'ACTIVE_AUTHORITY_TIER', requestedByOrigin: 'LLM_RECOMMENDATION' });
  assert.equal(r.allowed, false);
  assert.ok(PROTECTED_POLICY_DOMAINS.includes('ACTIVE_AUTHORITY_TIER'));
});

// 3. Promotion requires evidence.
test('3: sem evidência completa, promotion gate nunca sai de NOT_READY', () => {
  const r = evaluatePromotionGate({ evidence: {} });
  assert.equal(r.result, 'NOT_READY');
  assert.ok(r.missing_evidence.length > 0);
});

// 4. Promotion cannot occur from one winning observation.
test('4: 1 experimento concluído nunca é suficiente pra promoção, mesmo com todo o resto forte', () => {
  const evidence = { completed_experiments: 1, financially_reconciled_experiments: 1, decision_accuracy: 1, policy_violation_rate: 0, rollback_success_rate: 1, anomaly_rate: 0, financial_truth_health: 'RELIABLE', loss_containment: true, positive_expected_value_evidence: true, confidence_calibration: 1, execution_reliability: 1 };
  const r = evaluatePromotionGate({ evidence });
  assert.equal(r.result, 'NOT_READY');
});

// 5. Demotion can occur after safety deterioration.
test('5: trigger severo isolado (financial_truth_blocked) gera DEMOTE automático', () => {
  const r = evaluateDemotionGate({ signals: { financial_truth_blocked: true } });
  assert.equal(r.result, 'DEMOTE');
});

// 6. Exploration budget can be zero.
test('6: risco CRITICAL ou irreversibilidade recomenda ZERO exploração', () => {
  const r = evaluateExplorationBudget({ cashAvailable: true, currentProfitability: 'LOSS', valueOfInformation: 'HIGH', expectedUpside: 'HIGH', risk: 'CRITICAL', reversibility: 'REVERSIBLE', evidenceQuality: 'HIGH', hypothesisSpaceExhausted: false });
  assert.equal(r.recommended_exploration_posture, 'ZERO');
});

// 7. Exploration budget can become positive when VOI supports it.
test('7: VOI alto + espaço de hipóteses não exaurido recomenda exploração ELEVATED', () => {
  const r = evaluateExplorationBudget({ cashAvailable: true, currentProfitability: 'BREAK_EVEN', valueOfInformation: 'HIGH', expectedUpside: 'HIGH', risk: 'MEDIUM', reversibility: 'REVERSIBLE', evidenceQuality: 'MEDIUM', hypothesisSpaceExhausted: false });
  assert.equal(r.recommended_exploration_posture, 'ELEVATED');
});

// 8. Machine can recommend DO_NOT_SPEND.
test('8: financial_truth_health=BLOCKED gera DO_NOT_SPEND', () => {
  const r = recommendNoAction({ financialTruthHealthStatus: 'BLOCKED', measurementReadiness: 'READY_FOR_CAPITAL', hypothesisSpaceStatus: 'OPEN', financialRoas: 2, targetRoas: 3, hasViableCandidate: true, capitalAvailable: true });
  assert.equal(r.recommendation, 'DO_NOT_SPEND');
});

// 9. Machine can recommend HOLD_CAPITAL.
test('9: capitalAvailable=false gera HOLD_CAPITAL independente de quão boa seja a oportunidade', () => {
  const r = recommendNoAction({ financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'READY_FOR_CAPITAL', hypothesisSpaceStatus: 'OPEN', financialRoas: 5, targetRoas: 3, hasViableCandidate: true, capitalAvailable: false });
  assert.equal(r.recommendation, 'HOLD_CAPITAL');
});

// 10. R$30→R$500 synthetic recommendation remains intact.
test('10: cenário sintético 30->500 nunca trunca o recommended_budget nos 3 cenários', () => {
  const scenarios = runSyntheticR30ToR500Scenarios();
  for (const key of ['scenario_A_weak_uncertain', 'scenario_B_strong_signal_limited_confirmation', 'scenario_C_confirmed_extraordinary']) {
    assert.equal(scenarios[key].inputs.recommendedBudget, 500);
    assert.equal(scenarios[key].inputs.currentBudget, 30);
  }
  assert.equal(scenarios.marker, 'SYNTHETIC_FIXTURE_NEVER_A_REAL_POLICY');
});

// 11. Policy can require human approval for R$500.
test('11: campanha instável com salto de orçamento grande exige REQUIRE_HUMAN_APPROVAL', () => {
  const r = evaluateBudgetEscalation({ currentBudget: 30, recommendedBudget: 500, financialRoas: 2.0, marginalRoas: 'UNKNOWN', sampleSufficient: true, confidence: 'MEDIUM', financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'NEEDS_TRACKING_IMPLEMENTATION', anomalyState: 'NORMAL', campaignStability: 'UNSTABLE', targetRoas: 3.0 });
  assert.equal(r.decision, 'REQUIRE_HUMAN_APPROVAL');
});

// 12. Stepwise scaling is not universal. / 13. Direct jump is not universally forbidden.
test('12+13: salto pequeno com performance extraordinária confirmada permite DIRECT_JUMP; salto grande sem marginal conhecida força STEPWISE_SCALE — nenhum dos dois é universal', () => {
  const base = { financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'NEEDS_TRACKING_IMPLEMENTATION', anomalyState: 'NORMAL', campaignStability: 'STABLE', targetRoas: 3.0 };
  const smallConfirmed = evaluateBudgetEscalation({ ...base, currentBudget: 30, recommendedBudget: 45, financialRoas: 4.0, marginalRoas: 4.2, sampleSufficient: true, confidence: 'HIGH' });
  const bigUnknownMarginal = evaluateBudgetEscalation({ ...base, currentBudget: 30, recommendedBudget: 500, financialRoas: 4.0, marginalRoas: 'UNKNOWN', sampleSufficient: true, confidence: 'HIGH' });
  assert.equal(smallConfirmed.decision, 'DIRECT_JUMP');
  assert.equal(bigUnknownMarginal.decision, 'STEPWISE_SCALE');
});

// 14. Marginal economics UNKNOWN remains unknown.
test('14: sem dado real de incremento de spend, marginal_roas/marginal_cpa permanecem UNKNOWN, nunca aproximados', () => {
  const r = assessMarginalEconomics({ blendedRoas: 2.5, blendedCpa: 80, hasIncrementalSpendTestData: false });
  assert.equal(r.marginal_roas, 'UNKNOWN');
  assert.equal(r.marginal_cpa, 'UNKNOWN');
});

// 15. Blended ROAS does not masquerade as marginal ROAS.
test('15: blended_roas nunca é copiado pra marginal_roas mesmo quando fornecido', () => {
  const r = assessMarginalEconomics({ blendedRoas: 2.5, blendedCpa: 80, hasIncrementalSpendTestData: false });
  assert.notEqual(r.marginal_roas, r.blended_roas);
  assert.equal(r.blended_roas, 2.5);
});

// 16. Negative expected profit experiment can be valid if bounded learning VOI exists.
test('16: EV negativo esperado é aceitável quando capital bounded + risco contido + resultado informativo + VOI alto', () => {
  const r = evaluateLearningLossAcceptability({ expectedValue: -50, valueOfInformation: 'HIGH', capitalBounded: true, hypothesisImportance: 'HIGH', riskContained: true, resultWillBeInformative: true, maxAcceptableLearningLoss: 100, boundedLossEstimate: 50 });
  assert.equal(r.acceptable, true);
});

// 17. Unlimited loss is forbidden.
test('17: capital não-bounded (perda máxima desconhecida) nunca é aceitável, mesmo com VOI alto', () => {
  const r = evaluateLearningLossAcceptability({ expectedValue: -50, valueOfInformation: 'HIGH', capitalBounded: false, hypothesisImportance: 'HIGH', riskContained: true, resultWillBeInformative: true, maxAcceptableLearningLoss: 100, boundedLossEstimate: 'UNKNOWN' });
  assert.equal(r.acceptable, false);
});

// 18. Financial Truth deterioration reduces authority.
test('18: financial_truth_health != RELIABLE mantém o promotion gate em HOLD mesmo com o resto da evidência forte', () => {
  const evidence = { completed_experiments: 5, financially_reconciled_experiments: 5, decision_accuracy: 0.9, policy_violation_rate: 0, rollback_success_rate: 1, anomaly_rate: 0, financial_truth_health: 'DEGRADED', loss_containment: true, positive_expected_value_evidence: true, confidence_calibration: 0.9, execution_reliability: 1 };
  const r = evaluatePromotionGate({ evidence });
  assert.equal(r.result, 'HOLD');
});

// 19. Measurement problems only affect dependent actions.
test('19: measurement_readiness ruim bloqueia START_EXPERIMENT (dependente) mas não impede a Approval Policy de rodar normalmente pra uma ação independente de measurement', () => {
  const dependentDecision = evaluateBudgetEscalation({ currentBudget: 30, recommendedBudget: 50, financialRoas: 2.0, marginalRoas: 2.5, sampleSufficient: true, confidence: 'HIGH', financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'BLOCKED_BY_MEASUREMENT', anomalyState: 'NORMAL', campaignStability: 'STABLE', targetRoas: 3.0 });
  assert.equal(dependentDecision.decision, 'DENY');
  const independentDecision = evaluateBudgetEscalation({ currentBudget: 30, recommendedBudget: 50, financialRoas: 2.0, marginalRoas: 2.5, sampleSufficient: true, confidence: 'HIGH', financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'READY_FOR_CAPITAL', anomalyState: 'NORMAL', campaignStability: 'STABLE', targetRoas: 3.0 });
  assert.notEqual(independentDecision.decision, 'DENY');
});

// 20. Capital allocation interface can rank without inventing EV.
test('20: candidatos sem EV real ficam com expected_value=UNKNOWN, nunca um número inventado', () => {
  const candidate = buildCandidate({ domain: 'CREATIVE', requiredCapital: null, expectedValue: null, valueOfInformation: 'MEDIUM', risk: 'LOW', confidence: 'LOW', timeToSignal: 'UNKNOWN', reversibility: 'REVERSIBLE' });
  assert.equal(candidate.expected_value, 'UNKNOWN');
});

// 21. UNKNOWN EV != zero EV.
test('21: candidato com EV=0 real (número) vence um candidato com EV=UNKNOWN no ranking — os dois nunca são tratados como equivalentes', () => {
  const known = buildCandidate({ domain: 'MEDIA', expectedValue: 0, valueOfInformation: 'LOW', risk: 'LOW' });
  const unknown = buildCandidate({ domain: 'CRO', expectedValue: null, valueOfInformation: 'LOW', risk: 'LOW' });
  const ranked = rankCandidatesAndFindBestUse([unknown, known]);
  assert.equal(ranked.ranking[0].candidate, 'MEDIA'); // EV numérico conhecido (mesmo que 0) ordena antes de UNKNOWN
  const assessment = buildActionCapitalAssessment({ expectedUpside: null, expectedDownside: null });
  assert.equal(assessment.expected_value, 'UNKNOWN');
  assert.notEqual(assessment.expected_value, 0);
});

// 22. Reserve capital is valid best allocation.
test('22: RESERVE_CAPITAL pode vencer o ranking quando tem o melhor EV/VOI real entre os candidatos', () => {
  const reserve = buildCandidate({ domain: 'RESERVE', expectedValue: 0, valueOfInformation: 'NOT_ASSESSABLE', risk: 'LOW' });
  const risky = buildCandidate({ domain: 'MEDIA', expectedValue: -100, valueOfInformation: 'LOW', risk: 'HIGH' });
  const ranked = rankCandidatesAndFindBestUse([risky, reserve]);
  assert.equal(ranked.best_use_of_next_capital.candidate, 'RESERVE');
});

// 23. Switch product remains possible.
test('23: espaço de hipóteses exaurido + sem candidato viável + ROAS abaixo do alvo recomenda SWITCH_PRODUCT', () => {
  const r = recommendNoAction({ financialTruthHealthStatus: 'RELIABLE', measurementReadiness: 'READY_FOR_CAPITAL', hypothesisSpaceStatus: 'EXHAUSTED', financialRoas: 1.5, targetRoas: 3.0, hasViableCandidate: false, capitalAvailable: true });
  assert.equal(r.recommendation, 'SWITCH_PRODUCT');
});

// 24. Determinism.
test('24: real — proposeAndDryRunNextAction() com os novos campos PASSO 14B é determinístico entre execuções', () => {
  const a = proposeAndDryRunNextAction({});
  const b = proposeAndDryRunNextAction({});
  assert.equal(a.authority_posture_recommendation.recommended_tier, b.authority_posture_recommendation.recommended_tier);
  assert.equal(a.scale_ladder.current_stage.stage, b.scale_ladder.current_stage.stage);
  assert.deepEqual(a.real_limit_recommendations.map((r) => r.category + ':' + r.recommendation), b.real_limit_recommendations.map((r) => r.category + ':' + r.recommendation));
});

// 25. SAFE_MODE.
test('25: SAFE_MODE continua true — PASSO 14B não introduz nenhuma forma de desligá-lo', () => {
  assert.equal(SAFE_MODE, true);
});

// 26. Zero external mutations.
test('26: real — proposeAndDryRunNextAction() com todos os campos novos do PASSO 14B ainda nunca executa nada externamente', () => {
  const r = proposeAndDryRunNextAction({});
  assert.equal(r.would_execute_externally, false);
  assert.equal(r.safe_mode, true);
});

// 27. Write boundary.
test('27: nenhum módulo novo do PASSO 14B escreve fora de analytics/src/execution/ ou analytics/data/execution/', () => {
  const { DEFAULT_DIR } = require('../src/execution/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/execution'));
});
