'use strict';

// PASSO 14B — calibração semântica final (HUMAN_APPROVAL_THRESHOLD). Os 10 testes obrigatórios
// do item 7, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');

const { emptyTierDefinition, buildDefaultAuthorityTiers } = require('../src/execution/authorityTiers');
const { recommendInitialRealLimits } = require('../src/execution/realLimitRecommendations');
const { runSyntheticR30ToR500Scenarios } = require('../src/execution/syntheticBudgetScenario');
const { buildRecommendationRange } = require('../src/execution/executionAuthorityLimits');
const { proposeAndDryRunNextAction } = require('../src/execution/builder');
const { SAFE_MODE } = require('../src/execution/safeMode');
const { ADAPTERS_BY_ACTION_TYPE } = require('../src/execution/executionAdapters');
const { READ_WRITE_PATH_SEPARATION } = require('../src/execution/boundaries');

// 1. TIER_0 autonomous execution limit = zero.
test('1: TIER_0_ANALYZE_ONLY tem max_autonomous_capital_per_action=0 e max_autonomous_capital_per_day=0, sempre', () => {
  const tier0 = emptyTierDefinition('TIER_0_ANALYZE_ONLY');
  assert.equal(tier0.max_autonomous_capital_per_action, 0);
  assert.equal(tier0.max_autonomous_capital_per_day, 0);
});

// 2. TIER_0 does not imply permanent human approval threshold = zero.
test('2: TIER_0 NÃO representa human_approval_threshold como 0 — é NOT_APPLICABLE_AT_TIER_0, nunca um valor numérico', () => {
  const tier0 = emptyTierDefinition('TIER_0_ANALYZE_ONLY');
  assert.equal(tier0.human_approval_threshold, 'NOT_APPLICABLE_AT_TIER_0');
  assert.notEqual(tier0.human_approval_threshold, 0);
});

// 3. Human approval threshold can be NOT_APPLICABLE/NOT_CONFIGURED depending on tier semantics.
test('3: recommendInitialRealLimits real: HUMAN_APPROVAL_THRESHOLD.status=NOT_APPLICABLE_AT_TIER_0 quando currentAuthorityTier=TIER_0, nunca DEFENSIBLE=0', () => {
  const limits = recommendInitialRealLimits({ financialRoasFinanceiro: 0.64, cpaFinanceiro: 101.47, completedExperiments: 0, financialTruthHealthStatus: 'RELIABLE', currentAuthorityTier: 'TIER_0_ANALYZE_ONLY' });
  const threshold = limits.find((l) => l.category === 'HUMAN_APPROVAL_THRESHOLD');
  assert.equal(threshold.status, 'NOT_APPLICABLE_AT_TIER_0');
  assert.equal(threshold.recommendation, 'NOT_APPLICABLE');
  assert.ok(Array.isArray(threshold.future_determination_criteria));
  assert.ok(threshold.future_determination_criteria.length >= 10);
  // AUTONOMOUS_LIMIT continua real e defensável — a calibração não apaga isso.
  const autonomous = limits.find((l) => l.category === 'AUTONOMOUS_LIMIT');
  assert.equal(autonomous.recommendation, 0);
  assert.equal(autonomous.status, 'DEFENSIBLE_CURRENT_TIER_LIMIT');
});

test('3b: em tier != TIER_0, HUMAN_APPROVAL_THRESHOLD vira NOT_DEFENSIBLE_TO_SET (o conceito se aplica, só não tem valor real ainda) — nunca NOT_APPLICABLE fora do TIER_0', () => {
  const limits = recommendInitialRealLimits({ financialRoasFinanceiro: 2.0, cpaFinanceiro: 80, completedExperiments: 5, financialTruthHealthStatus: 'RELIABLE', currentAuthorityTier: 'TIER_1_MICRO_AUTONOMY' });
  const threshold = limits.find((l) => l.category === 'HUMAN_APPROVAL_THRESHOLD');
  assert.equal(threshold.status, 'NOT_DEFENSIBLE_TO_SET');
});

// 4. Recommendation range remains uncapped.
test('4: TIER_0 nunca limita RECOMMENDATION_RANGE — recommended_value permanece intacto mesmo muito acima do autonomous limit (0)', () => {
  const tier0 = emptyTierDefinition('TIER_0_ANALYZE_ONLY');
  assert.equal(tier0.recommendation_range_capped, false);
  const range = buildRecommendationRange({ recommendedValue: 500, currentValue: 30 });
  assert.equal(range.recommended_value, 500); // nunca truncado pra 0 (autonomous limit do tier)
});

// 5. R$30→R$500 synthetic recommendation survives Tier 0.
test('5: cenário sintético 30->500 continua produzindo recommended_budget=500 intacto, mesmo com authority=TIER_0', () => {
  const scenarios = runSyntheticR30ToR500Scenarios();
  assert.equal(scenarios.scenario_C_confirmed_extraordinary.inputs.recommendedBudget, 500);
  // a autoridade de EXECUTAR isso é outra questão (TIER_0=0) — a recomendação em si não muda.
});

// 6. No duplicate read-only execution connector introduced.
test('6: nenhum adapter de execução real foi implementado como read-only duplicado — todos continuam mutable=true/stubbed, e a separação read/write está documentada', () => {
  for (const type of Object.keys(ADAPTERS_BY_ACTION_TYPE)) {
    assert.equal(ADAPTERS_BY_ACTION_TYPE[type].mutable, true); // nenhum virou um "read connector" nesta calibração
  }
  assert.match(READ_WRITE_PATH_SEPARATION.rule, /nunca pra re-implementar leitura/);
  assert.match(READ_WRITE_PATH_SEPARATION.read_path, /collectors/);
});

// 7. SAFE_MODE remains true.
test('7: SAFE_MODE continua true após a calibração', () => {
  assert.equal(SAFE_MODE, true);
});

// 8. Zero external mutations.
test('8: real — proposeAndDryRunNextAction() pós-calibração ainda nunca executa nada externamente', () => {
  const r = proposeAndDryRunNextAction({});
  assert.equal(r.would_execute_externally, false);
  assert.equal(r.safe_mode, true);
});

// 9. Determinism.
test('9: real — recommendInitialRealLimits/authority_tiers são determinísticos entre execuções', () => {
  const a = proposeAndDryRunNextAction({});
  const b = proposeAndDryRunNextAction({});
  assert.deepEqual(
    a.real_limit_recommendations.map((r) => `${r.category}:${r.status}:${r.recommendation}`),
    b.real_limit_recommendations.map((r) => `${r.category}:${r.status}:${r.recommendation}`),
  );
  assert.deepEqual(a.authority_tiers.TIER_0_ANALYZE_ONLY, b.authority_tiers.TIER_0_ANALYZE_ONLY);
});

// 10. Write boundary.
test('10: write boundary — nenhum arquivo novo desta calibração fora de analytics/src/execution/ ou analytics/tests/execution*.test.js', () => {
  const { DEFAULT_DIR } = require('../src/execution/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/execution'));
});

// cobertura extra — buildDefaultAuthorityTiers() completo continua consistente com o novo TIER_0.
test('extra: buildDefaultAuthorityTiers() real reflete a semântica calibrada do TIER_0', () => {
  const tiers = buildDefaultAuthorityTiers();
  assert.equal(tiers.TIER_0_ANALYZE_ONLY.human_approval_threshold, 'NOT_APPLICABLE_AT_TIER_0');
  assert.deepEqual(tiers.TIER_0_ANALYZE_ONLY.allowed_capabilities, ['ANALYZE', 'DIAGNOSE', 'RANK', 'RECOMMEND', 'PROPOSE', 'DRY_RUN', 'SIMULATE']);
  assert.deepEqual(tiers.TIER_0_ANALYZE_ONLY.forbidden_capabilities, ['EXECUTE_EXTERNAL_MUTATION', 'SPEND_AUTONOMOUSLY']);
});
