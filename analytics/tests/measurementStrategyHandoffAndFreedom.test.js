'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStrategyHandoffMeasurement } = require('../src/measurement/strategyHandoff');
const { runFullPlatformAudit } = require('../src/measurement/platformAudit');
const { analyzeMeasurement } = require('../src/measurement/builder');
const { analyzeStrategy } = require('../src/strategy-search/builder');

const platform = runFullPlatformAudit();

function fakeStrategyResult(winnerFamily, winnerStageTypes) {
  return {
    analysis: {
      current_architecture: { architecture_id: 'ARCH-CURRENT', family: 'DIRECT_TO_OFFER', stages: [{ type: 'AD', status: 'ACTIVE' }, { type: 'SALES_PAGE', status: 'ACTIVE' }, { type: 'CHECKOUT', status: 'ACTIVE' }] },
      recommendation: { recommended_architecture_id: 'ARCH-CAND-01' },
      challengers: [{ architecture_id: 'ARCH-CAND-01', family: winnerFamily, stage_types: winnerStageTypes, current_blocker: 'TRACKING', remaining_blockers: ['IMPLEMENTATION'], mva_test: { test_id: 'MVA-x-001', changed_components: winnerStageTypes, preserved_components: [], primary_metric: 'lpv_to_checkout_rate', secondary_metrics: ['financial_roas'], minimum_evidence: null, kill_condition: 'k' } }],
    },
  };
}

// item: nunca hardcoda ADVERTORIAL nem qualquer família — testado com 7 famílias sintéticas
// diferentes (liberdade estratégica real, item 51 do PASSO 13).
const SYNTHETIC_FAMILIES = [
  { family: 'DIRECT_TO_OFFER', stages: ['AD', 'SALES_PAGE', 'CHECKOUT'] },
  { family: 'VSL', stages: ['AD', 'VSL', 'CHECKOUT'] },
  { family: 'ADVERTORIAL', stages: ['AD', 'ADVERTORIAL', 'SALES_PAGE', 'CHECKOUT'] },
  { family: 'WHATSAPP_ASSISTED', stages: ['AD', 'SALES_PAGE', 'WHATSAPP', 'CHECKOUT'] },
  { family: 'FRONTEND_BACKEND', stages: ['AD', 'SALES_PAGE', 'CHECKOUT', 'UPSELL'] },
  { family: 'SUBSCRIPTION', stages: ['AD', 'SALES_PAGE', 'CHECKOUT', 'COMMUNITY'] },
  { family: 'CUSTOM', stages: ['AD', 'QUIZ', 'CHECKOUT'] },
];

for (const { family, stages } of SYNTHETIC_FAMILIES) {
  test(`geração de contrato funciona pra família sintética ${family} sem depender de uma família específica`, () => {
    const handoff = buildStrategyHandoffMeasurement({ strategyResult: fakeStrategyResult(family, stages), platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
    assert.equal(handoff.found, true);
    assert.equal(handoff.winner_family, family);
    assert.equal(handoff.consumed_dynamically, true);
    assert.deepEqual(handoff.tracking_contract.required_stages, stages);
    assert.ok(handoff.capital_gate.state);
  });
}

test('winner mudando de arquitetura muda o handoff automaticamente — nunca fixo em ADVERTORIAL', () => {
  const h1 = buildStrategyHandoffMeasurement({ strategyResult: fakeStrategyResult('ADVERTORIAL', ['AD', 'ADVERTORIAL', 'CHECKOUT']), platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
  const h2 = buildStrategyHandoffMeasurement({ strategyResult: fakeStrategyResult('WHATSAPP_ASSISTED', ['AD', 'WHATSAPP', 'CHECKOUT']), platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
  assert.notEqual(h1.winner_family, h2.winner_family);
  assert.notDeepEqual(h1.tracking_contract.required_stages, h2.tracking_contract.required_stages);
});

test('quando o vencedor É a arquitetura atual, subject_type do contrato é CURRENT_ARCHITECTURE, nunca CANDIDATE', () => {
  const strategyResult = fakeStrategyResult('DIRECT_TO_OFFER', []);
  strategyResult.analysis.recommendation.recommended_architecture_id = 'ARCH-CURRENT';
  const handoff = buildStrategyHandoffMeasurement({ strategyResult, platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
  assert.equal(handoff.winner_is_current, true);
  assert.equal(handoff.tracking_contract.subject_type, 'CURRENT_ARCHITECTURE');
});

test('winner_id inconsistente (não existe nem em current nem em challengers) nunca é inventado — found=false explícito', () => {
  const strategyResult = fakeStrategyResult('X', ['AD']);
  strategyResult.analysis.recommendation.recommended_architecture_id = 'ARCH-INEXISTENTE';
  const handoff = buildStrategyHandoffMeasurement({ strategyResult, platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
  assert.equal(handoff.found, false);
});

test('mva_tracking_design deriva changed_components/preserved_components REAIS do mva_test do challenger, nunca inventa quais estágios mudam', () => {
  const handoff = buildStrategyHandoffMeasurement({ strategyResult: fakeStrategyResult('QUIZ', ['AD', 'QUIZ', 'CHECKOUT']), platform, financialTruthBlocking: false, reconciliationMatchRate: 0.9, productId: 'p' });
  assert.deepEqual(handoff.mva_tracking_design.new_stages_requiring_instrumentation, ['AD', 'QUIZ', 'CHECKOUT']);
  assert.ok(handoff.mva_tracking_design.experiment_measurement_contract);
});

// ===== integração real com o Strategy Search de verdade =====

test('real: builder consome o vencedor REAL do Strategy Search dinamicamente (analyzeStrategy real, não mockado)', () => {
  const strategyResult = analyzeStrategy({});
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const result = analyzeMeasurement({});
  assert.equal(result.analysis.strategy_handoff.winner_architecture_id, winnerId);
  assert.equal(result.strategy_result_consumed.winner_architecture_id, winnerId);
});

test('real: se o Strategy Search real reportar current_blocker=TRACKING pro vencedor, o handoff de Measurement expõe esse mesmo estado sem contradizer', () => {
  const strategyResult = analyzeStrategy({});
  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const winner = strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);
  const result = analyzeMeasurement({});
  if (winner) assert.equal(result.analysis.strategy_handoff.strategy_search_current_blocker, winner.current_blocker);
});
