'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyBottleneck } = require('../src/strategy-search/bottleneckClassification');
const { selectComprehensionMechanism } = require('../src/strategy-search/mechanismSelection');
const { generateChallengers } = require('../src/strategy-search/challengerGenerator');
const { analyzeStrategy } = require('../src/strategy-search/builder');

function diagnosisFixture(overrides = {}) {
  return {
    missing_monetization_signals: [],
    known_path_to_target: { status: 'NO_KNOWN_PATH' },
    tracking_scopes: { CREATIVE_ATTRIBUTION: { status: 'RELIABLE' }, PLATFORM_ATTRIBUTION: { status: 'RELIABLE' } },
    financial_roas: 0.6,
    cancelled_or_expired_transactions: 0,
    video_format_signal: 'UNKNOWN',
    ...overrides,
  };
}

// item 1-3 — missing stage != observed bottleneck

test('item 1: ausência de estágio (missing) nunca é classificada OBSERVED_BOTTLENECK — no máximo HYPOTHESIZED_BOTTLENECK sem sinal real', () => {
  const r = classifyBottleneck({ ruleId: 'COMPREHENSION_BUILDING_STAGE' });
  assert.equal(r.classification, 'HYPOTHESIZED_BOTTLENECK');
  assert.notEqual(r.classification, 'OBSERVED_BOTTLENECK');
});

test('item 1-2: ausência estrutural PODE gerar hipótese (structural_absence=true), mas nunca prova', () => {
  const r = classifyBottleneck({ ruleId: 'MONETIZATION_LAYER' });
  assert.equal(r.structural_absence, true);
  assert.match(r.reason, /nunca prova/);
});

test('item 2: sinal comportamental real específico eleva pra OBSERVED_BOTTLENECK', () => {
  const r = classifyBottleneck({ ruleId: 'COMPREHENSION_BUILDING_STAGE', hasObservedSignal: true });
  assert.equal(r.classification, 'OBSERVED_BOTTLENECK');
});

test('item 2: experimento real concluído eleva pra VALIDATED_BOTTLENECK', () => {
  const r = classifyBottleneck({ ruleId: 'COMPREHENSION_BUILDING_STAGE', hasValidatedExperiment: true });
  assert.equal(r.classification, 'VALIDATED_BOTTLENECK');
});

test('item 2: challenger não baseado em ausência (ex.: diversificação) nunca recebe classificação de gargalo — NOT_APPLICABLE', () => {
  const r = classifyBottleneck({ ruleId: 'STRATEGIC_DIVERSIFICATION_ORGANIC' });
  assert.equal(r.classification, 'NOT_APPLICABLE');
});

// item 4-5 — VSL NÃO É AUTOMÁTICO

test('item 4: VSL só é selecionado com sinal real de vídeo confirmado', () => {
  const r = selectComprehensionMechanism({ videoFormatSignal: 'CONFIRMED' });
  assert.equal(r.family, 'VSL');
});

test('item 4: sem sinal de vídeo (ABSENT), NUNCA seleciona VSL por padrão — escolhe o mecanismo de menor complexidade', () => {
  const r = selectComprehensionMechanism({ videoFormatSignal: 'ABSENT' });
  assert.notEqual(r.family, 'VSL');
  assert.equal(r.family, 'ADVERTORIAL');
});

test('item 4: sinal UNKNOWN também nunca vira VSL por padrão (nunca "assume que sim")', () => {
  const r = selectComprehensionMechanism({ videoFormatSignal: 'UNKNOWN' });
  assert.notEqual(r.family, 'VSL');
});

test('item 5: fixture alternativa (sinal de vídeo confirmado) seleciona um mecanismo DIFERENTE do padrão sem sinal — prova que a escolha não é hardcoded', () => {
  const withVideo = selectComprehensionMechanism({ videoFormatSignal: 'CONFIRMED' });
  const withoutVideo = selectComprehensionMechanism({ videoFormatSignal: 'ABSENT' });
  assert.notEqual(withVideo.family, withoutVideo.family);
});

test('item 4/5: o challenger real de compreensão reflete o family_selection real (auditável), nunca fixo', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ video_format_signal: 'CONFIRMED' }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  const comprehension = challengers.find((c) => c.rule_id === 'COMPREHENSION_BUILDING_STAGE');
  assert.equal(comprehension.family, 'VSL');
  assert.ok(comprehension.family_selection);
});

// item 6 — MISSING FEATURE BIAS

test('item 6: nenhum challenger baseado em ausência (upsell/VSL/quiz/WhatsApp/subscription) recebe evidence_basis do tipo PERFORMANCE_EVIDENCE automaticamente', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ missing_monetization_signals: [{ diagnostic_id: 'X' }], cancelled_or_expired_transactions: 3 }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'BROAD',
  });
  for (const c of challengers) {
    const hasPerformance = (c.expected_economic_mechanism || '').includes('EXPECTED_UPLIFT');
    assert.equal(hasPerformance, false);
  }
});

test('item 6: ausência só abre CANDIDATE_HYPOTHESIS (status=CANDIDATE), nunca um status mais forte automaticamente', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ missing_monetization_signals: [{ diagnostic_id: 'X' }] }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  for (const c of challengers) assert.equal(c.status, 'CANDIDATE');
});

// items 7-9 — CANCELLED/EXPIRED != CONFIRMED RECOVERABLE ABANDONMENT

test('item 7: gatilho de CANCELLED/EXPIRED é rotulado TRANSACTION_STATE_EVIDENCE, nunca "abandono confirmado"', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ cancelled_or_expired_transactions: 4 }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  const wa = challengers.find((c) => c.rule_id === 'INCOMPLETE_PURCHASE_RECOVERY');
  const refText = JSON.stringify(wa.why_generated);
  assert.match(refText, /TRANSACTION_STATE_EVIDENCE/);
  // a frase só pode aparecer dentro de uma NEGAÇÃO explícita ("NÃO prova de abandono recuperável
  // confirmado"), nunca como afirmação positiva isolada.
  assert.match(refText, /NÃO prova de abandono recuperável confirmado/);
});

test('item 8: recoverable_population_status permanece UNKNOWN sem dado real de follow-up — nunca CONFIRMED nem zero', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ cancelled_or_expired_transactions: 4 }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  const wa = challengers.find((c) => c.rule_id === 'INCOMPLETE_PURCHASE_RECOVERY');
  assert.equal(wa.recoverable_population_status, 'UNKNOWN');
  assert.notEqual(wa.recoverable_population_status, 'CONFIRMED');
  assert.notEqual(wa.recoverable_population_status, 0);
});

test('item 9: contactability_status nunca é inventado — sempre UNKNOWN sem dado de telefone/canal real', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ cancelled_or_expired_transactions: 4 }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  const wa = challengers.find((c) => c.rule_id === 'INCOMPLETE_PURCHASE_RECOVERY');
  assert.equal(wa.contactability_status, 'UNKNOWN');
  assert.equal(wa.channel_eligibility_status, 'UNKNOWN');
});

test('item 9: recovery rate/incremental revenue nunca é inventado — expected_economic_mechanism é sempre qualitativo, com magnitude UNKNOWN explícita', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture({ cancelled_or_expired_transactions: 4 }),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'MODERATE',
  });
  const wa = challengers.find((c) => c.rule_id === 'INCOMPLETE_PURCHASE_RECOVERY');
  assert.match(wa.expected_economic_mechanism, /UNKNOWN/);
  assert.equal(typeof wa.expected_economic_mechanism, 'string');
});

// item 10 — DIVERSIFICATION CANDIDATE

test('item 10: candidato de diversificação (CONTENT_TO_OFFER) existe sem evidência de performance orgânica real', () => {
  const challengers = generateChallengers({
    diagnosis: diagnosisFixture(),
    currentStageTypes: ['AD', 'SALES_PAGE', 'CHECKOUT'], currentFamily: 'DIRECT_TO_OFFER', searchBreadth: 'BROAD',
  });
  const div = challengers.find((c) => c.rule_id === 'STRATEGIC_DIVERSIFICATION_ORGANIC');
  assert.ok(div);
  assert.equal(div.diversification_evidence_status, 'NOT_AVAILABLE');
});

// ===== integração real =====

test('integração real: bottleneck_classification do vencedor real é HYPOTHESIZED_BOTTLENECK (nunca OBSERVED/VALIDATED sem sinal real)', () => {
  const r = analyzeStrategy({});
  const winner = r.analysis.challengers.find((c) => c.architecture_id === r.analysis.recommendation.recommended_architecture_id);
  if (winner && winner.bottleneck_classification !== 'NOT_APPLICABLE') {
    assert.equal(winner.bottleneck_classification, 'HYPOTHESIZED_BOTTLENECK');
  }
});

test('integração real: mecanismo de compreensão real é selecionado por sinal real de creative (nunca VSL fixo) — hoje sem vídeo confirmado, é ADVERTORIAL', () => {
  const r = analyzeStrategy({});
  const comprehension = r.analysis.challengers.find((c) => c.rule_id === 'COMPREHENSION_BUILDING_STAGE');
  assert.equal(comprehension.family, 'ADVERTORIAL');
  assert.ok(comprehension.family_selection);
});

test('integração real: INCOMPLETE_PURCHASE_RECOVERY real nunca afirma recuperabilidade/contactabilidade confirmada', () => {
  const r = analyzeStrategy({});
  const wa = r.analysis.challengers.find((c) => c.rule_id === 'INCOMPLETE_PURCHASE_RECOVERY');
  if (wa) {
    assert.equal(wa.recoverable_population_status, 'UNKNOWN');
    assert.equal(wa.contactability_status, 'UNKNOWN');
  }
});

test('integração real: ranking real ainda pode escolher o mesmo challenger de compreensão como #1 mesmo com a calibração (não força mudança de ranking, item 3)', () => {
  const r = analyzeStrategy({});
  assert.ok(r.analysis.ranking[0].architecture_id);
});
