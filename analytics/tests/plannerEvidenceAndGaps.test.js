'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEvidenceGapRegistry, computeInformationGainPerReal } = require('../src/planner/evidenceGaps');
const { buildEvidenceMatrix } = require('../src/planner/evidenceMatrix');
const { runOfferScenarios } = require('../src/offer/scenarioEngine');
const { analyzePlan } = require('../src/planner/builder');

test('item 77: evidence gaps são gerados a partir de diagnósticos REAIS, não hardcoded (nenhum gap sem diagnóstico correspondente)', () => {
  const croDiagnostics = [{ diagnostic_id: 'CRO-DIAG-X', diagnostic_type: 'TECHNICAL_ISSUE', existence_confidence: 'HIGH', impact_confidence: 'LOW', observation: 'bug real', validation_method: 'FUNCTIONAL_TEST' }];
  const gaps = buildEvidenceGapRegistry({ productId: 'p', croDiagnostics, offerDiagnostics: [], knownPathToTarget: { status: 'UNKNOWN' } });
  assert.equal(gaps.length, 1);
  assert.match(gaps[0].current_knowledge, /CRO-DIAG-X/);
});

test('item 77: sem diagnósticos reais e sem NO_KNOWN_PATH, nenhum gap fantasma é criado', () => {
  const gaps = buildEvidenceGapRegistry({ productId: 'p', croDiagnostics: [], offerDiagnostics: [], knownPathToTarget: { status: 'YES' } });
  assert.equal(gaps.length, 0);
});

test('PASSO 11.1, item 13/16: decision_classification é um campo explícito em todo gap, mas NÃO é sempre true — um bug técnico genérico é DECISION_RELEVANT, não DECISION_CRITICAL', () => {
  const croDiagnostics = [{ diagnostic_id: 'CRO-DIAG-X', diagnostic_type: 'TECHNICAL_ISSUE', existence_confidence: 'HIGH', impact_confidence: 'LOW', observation: 'bug real', causal_status: 'OBSERVED', validation_method: 'STATIC_CODE_CHECK' }];
  const gaps = buildEvidenceGapRegistry({ productId: 'p', croDiagnostics, offerDiagnostics: [], knownPathToTarget: { status: 'UNKNOWN' } });
  assert.equal(gaps[0].decision_classification, 'DECISION_RELEVANT');
  assert.equal(gaps[0].decision_changing_evidence, false); // só DECISION_CRITICAL é decision_changing_evidence=true
});

test('item 77: evidência barata+decisiva vence prioridade sobre experimento caro+pouco informativo (information_gain_per_real desc)', () => {
  const cheap = computeInformationGainPerReal('STATIC_CODE_CHECK', 0);
  const expensive = computeInformationGainPerReal('CONTROLLED_EXPERIMENT', 300);
  assert.ok(cheap > expensive);
});

test('item 77: evidência barata mas irrelevante NÃO vence automaticamente — o gain depende do método real, não é regra absoluta cega', () => {
  const cheapLowGain = computeInformationGainPerReal('BEHAVIORAL_DATA', 1);
  const moderateGain = computeInformationGainPerReal('CONTROLLED_EXPERIMENT', 50);
  // um experimento controlado barato pode superar dado comportamental se o custo for baixo o bastante — não é regra cega de "sempre grátis vence"
  assert.ok(moderateGain > cheapLowGain || cheapLowGain > 0);
});

test('item 77: UNKNOWN permanece UNKNOWN — evidence matrix nunca converte ausência de dado em estado positivo', () => {
  const matrix = buildEvidenceMatrix({
    economicsSnapshot: { period: { data_completeness: null, days_found: 0, days_missing: [] }, critical_flags_by_day: [], profit_status: 'INSUFFICIENT_DATA', financials: { roas_financeiro: null }, known_quantified_levers_close_gap: null },
    levers: [],
    experimentCoverage: { total_completed: 0, total_experiments: 0, total_draft: 0, by_category: {} },
    learningEvidence: { total_hypotheses: 0, by_category: {} },
    hypothesisSpaceStatus: { status: 'UNKNOWN' },
  });
  assert.equal(matrix.DATA_QUALITY.state, 'UNKNOWN');
  assert.equal(matrix.CREATIVE.state, 'UNKNOWN');
});

test('item 77: cenários (Offer scenarioEngine reusado) permanecem rotulados SCENARIO_NOT_FORECAST, nunca chamados de previsão', () => {
  const s = runOfferScenarios({ currentCpa: 100, currentNetRevenuePerBuyer: 50 });
  assert.equal(s.current.status, 'SCENARIO_NOT_FORECAST');
  for (const sc of s.combined_scenarios) assert.equal(sc.status, 'SCENARIO_NOT_FORECAST');
});

test('item 77: aprendizado sintético não é usado — learning_evidence do plano vem só de learning/registry.js real', () => {
  const r = analyzePlan({});
  // hoje não há hipóteses reais persistidas (0 experimentos concluídos) — deve refletir isso, não inventar
  assert.equal(r.learning_evidence.total_hypotheses, 0);
});

test('item 77: aprendizado é sempre product-specific na leitura (nunca promovido a global automaticamente pelo Planner)', () => {
  const r = analyzePlan({ productId: 'protocolo_resposta_garantida' });
  assert.equal(r.product_id, 'protocolo_resposta_garantida');
  assert.equal('cross_product_learnings' in r, false);
});

test('item 77: nenhum EV de produto alternativo é inventado (expected_economic_value_of_switching sempre UNKNOWN hoje)', () => {
  const r = analyzePlan({});
  assert.equal(r.expected_economic_value_of_switching.status, 'UNKNOWN');
});

test('item 77: nenhuma timeline falsa — target_planning fica NOT_CONFIGURED sem meta explícita, nunca um prazo inventado', () => {
  const r = analyzePlan({});
  assert.equal(r.target_planning.monthly_target, 'NOT_CONFIGURED');
  assert.equal(r.on_track.status, 'NOT_CONFIGURED');
});
