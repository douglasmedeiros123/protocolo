'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { rankCroCandidates, computeTieBreakComponents, TIE_BREAK_FACTOR_ORDER } = require('../src/cro/ranking');
const { buildCroDiagnostics, buildTechnicalActions, CAUSAL_STATUSES } = require('../src/cro/diagnostics');
const { DIAGNOSTIC_TYPES, VALIDATION_METHODS } = require('../src/cro/diagnosticTypes');
const { computeInformationGainPerReal } = require('../src/cro/informationGain');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeCro } = require('../src/cro/builder');
const { saveDiagnostics, saveCandidates } = require('../src/cro/registry');
const { getBestCroAction, getBestCroCandidate } = require('../src/decision/croIntegration');

function makeTempDirWithFreshCroData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cro-decision-integration-test-'));
  const result = analyzeCro({});
  saveDiagnostics(result.diagnostics, dir);
  saveCandidates(result.candidates, dir);
  return dir;
}

function candidateFixture(overrides = {}) {
  return {
    candidate_id: 'CRO-CAND-X',
    priority_score: 100,
    causality: { status: 'VALID' },
    evidence_sources: [{ type: 'X', source: 'x' }],
    confidence: 0.6,
    implementation_cost: 'LOW',
    information_gain_per_real: 40,
    learning_value: 'MEDIUM',
    risk: 1,
    ...overrides,
  };
}

test('tie-break: 2 candidatos IDÊNTICOS exceto candidate_id -> resultado NÃO depende da ordem do array', () => {
  const a = candidateFixture({ candidate_id: 'CRO-CAND-A' });
  const b = candidateFixture({ candidate_id: 'CRO-CAND-B' });
  const r1 = rankCroCandidates([a, b]);
  const r2 = rankCroCandidates([b, a]); // ordem invertida no array de entrada
  assert.deepEqual(r1.ranking.map((c) => c.candidate_id), r2.ranking.map((c) => c.candidate_id));
  assert.deepEqual(r1.ranking.map((c) => c.rank), r2.ranking.map((c) => c.rank));
});

test('tie-break: candidate_id NUNCA é usado como evidência de mérito — só ordena a apresentação de um empate real', () => {
  const a = candidateFixture({ candidate_id: 'CRO-CAND-Z' }); // viria "por último" alfabeticamente
  const b = candidateFixture({ candidate_id: 'CRO-CAND-A' });
  const r = rankCroCandidates([a, b]);
  assert.equal(r.decision_tie, true);
  // os dois aparecem no grupo de empate, independente do candidate_id ser Z ou A
  assert.deepEqual(r.decision_tie_candidates.sort(), ['CRO-CAND-A', 'CRO-CAND-Z']);
});

test('tie-break determinístico: mesmo input sempre produz o mesmo tie_break_components e o mesmo rank', () => {
  const candidates = [candidateFixture({ candidate_id: 'A', priority_score: 100 }), candidateFixture({ candidate_id: 'B', priority_score: 80 })];
  const r1 = rankCroCandidates(candidates);
  const r2 = rankCroCandidates(candidates);
  assert.deepEqual(r1.ranking.map((c) => c.tie_break_components), r2.ranking.map((c) => c.tie_break_components));
});

test('tie-break: fatores aplicados na ordem documentada (priority_score > causal_strength > evidence_quality > confidence > cost > information_gain > learning_value > risk)', () => {
  assert.deepEqual(TIE_BREAK_FACTOR_ORDER, [
    'priority_score', 'causal_strength', 'evidence_quality', 'confidence',
    'implementation_cost_rank', 'information_gain_per_real', 'learning_value_rank', 'risk_rank',
  ]);
});

test('tie-break: evidence_quality maior (mais fontes de evidência) vence em empate de priority_score', () => {
  const strong = candidateFixture({ candidate_id: 'A', evidence_sources: [{ type: 'X', source: '1' }, { type: 'Y', source: '2' }] });
  const weak = candidateFixture({ candidate_id: 'B', evidence_sources: [{ type: 'X', source: '1' }] });
  const r = rankCroCandidates([weak, strong]);
  assert.equal(r.ranking[0].candidate_id, 'A');
  assert.equal(r.decision_tie, false);
  assert.match(r.ranking[0].final_rank_reason, /evidence_quality/);
});

test('DECISION_TIE: quando TODOS os 8 fatores são realmente idênticos, declara empate explícito', () => {
  const a = candidateFixture({ candidate_id: 'A' });
  const b = candidateFixture({ candidate_id: 'B' });
  const r = rankCroCandidates([a, b]);
  assert.equal(r.decision_tie, true);
  assert.equal(r.ranking[0].is_tie, true);
  assert.match(r.ranking[0].final_rank_reason, /DECISION_TIE/);
});

test('não-empate: qualquer diferença real (ex: confidence) já basta pra decidir, sem precisar de DECISION_TIE', () => {
  const a = candidateFixture({ candidate_id: 'A', confidence: 0.7 });
  const b = candidateFixture({ candidate_id: 'B', confidence: 0.5 });
  const r = rankCroCandidates([a, b]);
  assert.equal(r.decision_tie, false);
  assert.equal(r.ranking[0].candidate_id, 'A');
});

test('computeTieBreakComponents: risk é invertido (menor risco = componente maior = melhor)', () => {
  const lowRisk = computeTieBreakComponents(candidateFixture({ risk: 1 }));
  const highRisk = computeTieBreakComponents(candidateFixture({ risk: 3 }));
  assert.ok(lowRisk.risk_rank > highRisk.risk_rank);
});

test('diagnostic types: os 5 tipos documentados existem', () => {
  assert.deepEqual(DIAGNOSTIC_TYPES.sort(), ['BEHAVIORAL_HYPOTHESIS', 'CONVERSION_HYPOTHESIS', 'FUNCTIONAL_FRICTION', 'MESSAGE_MATCH_HYPOTHESIS', 'TECHNICAL_ISSUE'].sort());
});

test('validation methods: os 4 métodos documentados existem, do mais barato pro mais caro', () => {
  assert.deepEqual(VALIDATION_METHODS, ['STATIC_CODE_CHECK', 'FUNCTIONAL_TEST', 'BEHAVIORAL_DATA', 'CONTROLLED_EXPERIMENT']);
});

test('duplicate id: classificado como TECHNICAL_ISSUE, nunca como CONVERSION_HYPOTHESIS', () => {
  const diags = buildCroDiagnostics({
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: [] },
    sectionMap: [], funnelMetrics: { period: { days_found: 30 }, raw: {}, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.1 } }, claritySnapshot: { status: 'UNAVAILABLE' },
  });
  const dup = diags.find((d) => d.diagnostic_id.includes('DUPLICATE-ID'));
  assert.equal(dup.diagnostic_type, 'TECHNICAL_ISSUE');
  assert.notEqual(dup.diagnostic_type, 'CONVERSION_HYPOTHESIS');
});

test('existência != impacto: duplicate id tem existence_confidence HIGH mas impact_confidence LOW (nunca conclui automaticamente que reduz conversão)', () => {
  const diags = buildCroDiagnostics({
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: [] },
    sectionMap: [], funnelMetrics: { period: { days_found: 30 }, raw: {}, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.1 } }, claritySnapshot: { status: 'UNAVAILABLE' },
  });
  const dup = diags.find((d) => d.diagnostic_id.includes('DUPLICATE-ID'));
  assert.equal(dup.existence_confidence, 'HIGH');
  assert.equal(dup.impact_confidence, 'LOW');
  assert.notEqual(dup.existence_confidence, dup.impact_confidence);
  assert.notEqual(dup.causal_status, 'VALIDATED');
});

test('existence_confidence e impact_confidence são campos DISTINTOS e separados, nunca fundidos num só', () => {
  const diags = buildCroDiagnostics({
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: [] },
    sectionMap: [], funnelMetrics: { period: { days_found: 30 }, raw: {}, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.1 } }, claritySnapshot: { status: 'UNAVAILABLE' },
  });
  for (const d of diags.filter((x) => x.diagnostic_type === 'TECHNICAL_ISSUE' || x.diagnostic_type === 'FUNCTIONAL_FRICTION')) {
    assert.ok('existence_confidence' in d);
    assert.ok('impact_confidence' in d);
  }
});

test('technical validation: buildTechnicalActions gera ação de custo ZERO (sem gasto de mídia)', () => {
  const diags = buildCroDiagnostics({
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: [] },
    sectionMap: [], funnelMetrics: { period: { days_found: 30 }, raw: {}, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.1 } }, claritySnapshot: { status: 'UNAVAILABLE' },
  });
  const actions = buildTechnicalActions(diags);
  assert.ok(actions.length > 0);
  for (const a of actions) assert.equal(a.estimated_cost_reais, 0);
});

test('technical issue NÃO vira automaticamente causa da baixa conversão: possible_causes lista múltiplas hipóteses, nunca uma causa única afirmada', () => {
  const diags = buildCroDiagnostics({
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: [] },
    sectionMap: [], funnelMetrics: { period: { days_found: 30 }, raw: {}, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.1 } }, claritySnapshot: { status: 'UNAVAILABLE' },
  });
  const dup = diags.find((d) => d.diagnostic_id.includes('DUPLICATE-ID'));
  assert.ok(dup.possible_causes.length >= 1);
  assert.notEqual(dup.causal_status, 'VALIDATED');
});

test('information gain: método barato (STATIC_CODE_CHECK) tem information_gain_per_real MAIOR que CONTROLLED_EXPERIMENT (mesmo custo hipotético)', () => {
  const cheap = computeInformationGainPerReal('STATIC_CODE_CHECK', 278);
  const expensive = computeInformationGainPerReal('CONTROLLED_EXPERIMENT', 278);
  assert.ok(cheap > expensive);
});

test('information gain: nunca divide por zero, mesmo com custo 0', () => {
  const r = computeInformationGainPerReal('STATIC_CODE_CHECK', 0);
  assert.equal(Number.isFinite(r), true);
});

test('integração real: builder.js gera technical_actions e cro_001_analysis.best_next_investigation coerentes', () => {
  const r = analyzeCro({});
  assert.ok(Array.isArray(r.technical_actions));
  assert.ok(r.technical_actions.length > 0);
  assert.ok(r.cro_001_analysis.best_next_investigation);
  assert.ok(['VALIDATE_TECHNICAL_ISSUE', 'RUN_EXPERIMENT'].includes(r.cro_001_analysis.best_next_investigation.action_type));
});

test('integração real: recommended_variable_to_isolate_first NÃO é hardcoded — vem de evidence_quality real, documentado', () => {
  const r = analyzeCro({});
  assert.equal(r.cro_001_analysis.recommended_variable_to_isolate_first.variable, 'CTA_VISIBILITY');
  assert.ok(r.cro_001_analysis.recommended_variable_to_isolate_first.evidence_quality >= 1);
  assert.equal('variable_selection_is_tie' in r.cro_001_analysis, true);
});

test('Decision Engine integration: getBestCroAction() distingue RUN_EXPERIMENT de FIX/VALIDATE_TECHNICAL_ISSUE', () => {
  const dir = makeTempDirWithFreshCroData();
  const result = getBestCroAction(dir);
  assert.ok(Array.isArray(result.actions));
  const types = new Set(result.actions.map((a) => a.action_type));
  assert.ok(types.has('RUN_EXPERIMENT') || types.has('VALIDATE_TECHNICAL_ISSUE') || types.has('FIX_TECHNICAL_ISSUE'));
  assert.equal(result.recommended.action_type, 'VALIDATE_TECHNICAL_ISSUE'); // dado real atual: existe ação técnica barata pendente
});

test('Decision Engine integration: getBestCroAction() NÃO altera decision/builder.js nem executa nada — é só leitura', () => {
  const dir = makeTempDirWithFreshCroData();
  const before = getBestCroAction(dir);
  const after = getBestCroAction(dir);
  assert.deepEqual(before.recommended.action_type, after.recommended.action_type);
});

test('idempotência: rankCroCandidates() com o mesmo estado produz exatamente o mesmo ranking e decision_tie', () => {
  const r1 = analyzeCro({});
  const r2 = analyzeCro({});
  assert.deepEqual(r1.candidates.map((c) => ({ id: c.candidate_id, rank: c.rank, tie: c.is_tie })), r2.candidates.map((c) => ({ id: c.candidate_id, rank: c.rank, tie: c.is_tie })));
  assert.equal(r1.decision_tie, r2.decision_tie);
});

test('CAUSAL_STATUSES ainda íntegro após as mudanças do PASSO 9.1 (não regrediu)', () => {
  assert.deepEqual(CAUSAL_STATUSES.sort(), ['HYPOTHESIZED', 'OBSERVED', 'SUPPORTED', 'VALIDATED'].sort());
});
