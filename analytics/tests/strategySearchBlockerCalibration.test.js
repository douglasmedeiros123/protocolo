'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyEvidenceGapBlocking, EVIDENCE_GAP_BLOCKING_CLASSIFICATIONS } = require('../src/strategy-search/evidenceGapBlocking');
const { evaluateArchitectureTestEligibility, BLOCKER_ORDER } = require('../src/strategy-search/testEligibility');
const { buildCustomerAndMarketEvidenceGaps } = require('../src/strategy-search/searchMemory');
const { analyzeStrategy } = require('../src/strategy-search/builder');

// item 1-2 — MARKET_EVIDENCE_GAP útil != prerequisito bloqueante

test('item 1: MARKET_EVIDENCE_GAP (sofisticação de mercado) é classificado NON_BLOCKING_STRATEGIC_EVIDENCE_GAP, nunca BLOCKING', () => {
  const r = classifyEvidenceGapBlocking({ type: 'MARKET_EVIDENCE_GAP' });
  assert.equal(r.classification, 'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP');
  assert.equal(r.blocking, false);
});

test('item 1: CUSTOMER_EVIDENCE_GAP (perguntas de qualificação) também é NON_BLOCKING — melhora qualidade, não impede o teste', () => {
  const r = classifyEvidenceGapBlocking({ type: 'CUSTOMER_EVIDENCE_GAP' });
  assert.equal(r.classification, 'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP');
  assert.equal(r.blocking, false);
});

test('item 2: gap BLOCKING exige blocking_rationale explícito — nunca bloqueia por suposição', () => {
  const r = classifyEvidenceGapBlocking({ type: 'MARKET_EVIDENCE_GAP' });
  assert.equal(r.blocking, false);
  assert.equal(r.blocking_rationale, null);
});

test('item 2: gap não catalogado nunca vira BLOCKING por padrão — UNKNOWN_THAT_REDUCES_CONFIDENCE', () => {
  const r = classifyEvidenceGapBlocking({ type: 'ALGUM_GAP_NOVO_NAO_CATALOGADO' });
  assert.equal(r.classification, 'UNKNOWN_THAT_REDUCES_CONFIDENCE');
  assert.equal(r.blocking, false);
});

test('enum: as 4 classificações do item 2 existem exatamente como especificado', () => {
  assert.deepEqual(EVIDENCE_GAP_BLOCKING_CLASSIFICATIONS.sort(), ['BLOCKING_PREREQUISITE_EVIDENCE', 'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP', 'EVIDENCE_OBJECTIVE', 'UNKNOWN_THAT_REDUCES_CONFIDENCE'].sort());
});

// item 4 — testes obrigatórios explícitos

test('useful market evidence != blocking prerequisite (integração real: ADVERTORIAL real não bloqueia por MARKET_EVIDENCE_GAP)', () => {
  const gaps = buildCustomerAndMarketEvidenceGaps({ family: 'ADVERTORIAL' });
  const marketGap = gaps.find((g) => g.type === 'MARKET_EVIDENCE_GAP');
  assert.ok(marketGap);
  assert.equal(marketGap.blocking, false);
});

test('blocking prerequisite requires explicit blocking rationale (fixture sintética com rationale real bloqueia)', () => {
  const e = evaluateArchitectureTestEligibility({
    trackingReadiness: 'READY', isCurrent: false,
    evidenceGaps: [{ type: 'TECHNICAL_CONSTRAINT_GAP', gap_type: 'TECHNICAL_CONSTRAINT_GAP', blocking: true, blocking_rationale: 'sem saber se a plataforma suporta o componente, o teste é UNIMPLEMENTABLE.' }],
  });
  assert.equal(e.eligibility, 'NEEDS_EVIDENCE');
  assert.equal(e.current_blocker, 'EVIDENCE');
  assert.match(e.reason, /UNIMPLEMENTABLE/);
});

test('unknown awareness/sophistication reduz confiança sem necessariamente bloquear (aparece em unknowns, não em blockers)', () => {
  const r = analyzeStrategy({});
  const advertorial = r.analysis.challengers.find((c) => c.family === 'ADVERTORIAL' || c.family === 'CONTENT_TO_OFFER');
  if (advertorial) {
    assert.ok(advertorial.unknowns.some((u) => /sofisticação/i.test(u)));
    assert.notEqual(advertorial.current_blocker, 'EVIDENCE');
  }
});

test('evidence required to define an interpretable test PODE bloquear (gatilho real de BLOCKING_PREREQUISITE_EVIDENCE gera NEEDS_EVIDENCE)', () => {
  const e = evaluateArchitectureTestEligibility({
    trackingReadiness: 'READY', isCurrent: false,
    evidenceGaps: [{ type: 'X', gap_type: 'X', blocking: true, blocking_rationale: 'sem isso o teste não é interpretável.' }],
  });
  assert.equal(e.eligibility, 'NEEDS_EVIDENCE');
});

test('EVIDENCE_OBJECTIVE nunca bloqueia a si mesmo (ausência de resultado de performance não entra em evidenceGaps)', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'READY', isCurrent: false, evidenceGaps: [] });
  assert.notEqual(e.eligibility, 'NEEDS_EVIDENCE');
});

test('após resolver um blocker, o próximo blocker aparece deterministicamente (TRACKING resolvido -> IMPLEMENTATION vira current_blocker)', () => {
  const beforeFix = evaluateArchitectureTestEligibility({ trackingReadiness: 'PARTIAL', isCurrent: false, evidenceGaps: [] });
  assert.equal(beforeFix.current_blocker, 'TRACKING');
  assert.deepEqual(beforeFix.remaining_blockers, ['IMPLEMENTATION']);

  const afterFix = evaluateArchitectureTestEligibility({ trackingReadiness: 'READY', isCurrent: false, evidenceGaps: [] });
  assert.equal(afterFix.current_blocker, 'IMPLEMENTATION');
  assert.deepEqual(afterFix.remaining_blockers, []);
});

// item 5 — BLOCKER ORDER: múltiplos blockers simultâneos, nada escondido

test('item 5: arquitetura pode ter EVIDENCE + TRACKING + IMPLEMENTATION simultaneamente, todos visíveis', () => {
  const e = evaluateArchitectureTestEligibility({
    trackingReadiness: 'NOT_READY', isCurrent: false,
    evidenceGaps: [{ type: 'X', gap_type: 'X', blocking: true, blocking_rationale: 'r' }],
  });
  assert.equal(e.current_blocker, 'EVIDENCE');
  assert.deepEqual(e.remaining_blockers, ['TRACKING', 'IMPLEMENTATION']);
  assert.equal(e.next_unlock, 'TRACKING');
  assert.equal(e.blockers_detail.length, 3);
});

test('item 5: ordem documentada EVIDENCE -> TRACKING -> IMPLEMENTATION, nunca escolhida caso a caso', () => {
  assert.deepEqual(BLOCKER_ORDER, ['EVIDENCE', 'TRACKING', 'IMPLEMENTATION']);
});

test('item 5: nenhum blocker posterior é escondido — blockers_detail sempre lista todos os presentes, não só o atual', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'PARTIAL', isCurrent: false, evidenceGaps: [] });
  assert.equal(e.blockers_detail.length, 2); // TRACKING + IMPLEMENTATION
  assert.ok(e.blockers_detail.some((b) => b.type === 'IMPLEMENTATION'));
});

test('verificação semântica: quando current_blocker=TRACKING, existe uma rationale rastreável e não-vazia explicando o motivo (nunca confundida com blocking_rationale de EVIDENCE, que só existe pra gaps)', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'PARTIAL', isCurrent: false, evidenceGaps: [] });
  assert.equal(e.current_blocker, 'TRACKING');
  assert.equal(typeof e.reason, 'string');
  assert.ok(e.reason.length > 0);
  assert.notEqual(e.reason, 'NONE');
  // o blocker TRACKING não tem campo `gaps`/`blocking_rationale` — a rationale dele vive só em `reason`.
  const trackingBlocker = e.blockers_detail.find((b) => b.type === 'TRACKING');
  assert.equal('blocking_rationale' in trackingBlocker, false);
  assert.equal(typeof trackingBlocker.reason, 'string');
});

test('arquitetura atual (is_current) nunca tem blocker nenhum', () => {
  const e = evaluateArchitectureTestEligibility({ trackingReadiness: 'READY', isCurrent: true, evidenceGaps: [] });
  assert.equal(e.eligibility, 'READY');
  assert.equal(e.current_blocker, null);
  assert.deepEqual(e.remaining_blockers, []);
  assert.equal(e.next_unlock, null);
});

// ===== integração real =====

test('integração real: winner real hoje tem test_eligibility=NEEDS_TRACKING, current_blocker=TRACKING, next_unlock=IMPLEMENTATION', () => {
  const r = analyzeStrategy({});
  const winner = r.analysis.challengers.find((c) => c.architecture_id === r.analysis.recommendation.recommended_architecture_id);
  assert.equal(winner.test_eligibility, 'NEEDS_TRACKING');
  assert.equal(winner.current_blocker, 'TRACKING');
  assert.equal(winner.next_unlock, 'IMPLEMENTATION');
});

test('integração real: nenhum challenger real hoje é bloqueado por MARKET/CUSTOMER_EVIDENCE_GAP (não catalogados como blocking)', () => {
  const r = analyzeStrategy({});
  for (const c of r.analysis.challengers) {
    if (c.current_blocker === 'EVIDENCE') {
      const blockingGap = c.test_eligibility_detail.blockers_detail.find((b) => b.type === 'EVIDENCE');
      assert.ok(blockingGap.gaps.every((g) => g.type !== 'MARKET_EVIDENCE_GAP' && g.type !== 'CUSTOMER_EVIDENCE_GAP'));
    }
  }
});
