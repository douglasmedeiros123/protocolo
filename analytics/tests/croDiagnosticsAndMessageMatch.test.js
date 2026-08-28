'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCroDiagnostics, CAUSAL_STATUSES } = require('../src/cro/diagnostics');
const { diagnoseMessageMatch, buildCreativeLpPairs } = require('../src/cro/messageMatch');
const { analyzeCro } = require('../src/cro/builder');

function fixtureInputs(overrides = {}) {
  return {
    parsed: { duplicate_ids: [{ id: 'oferta', occurrences: 2 }], faq_questions: ['Q1?', 'Q2?'] },
    sectionMap: [{ order: 1 }, { order: 2 }],
    funnelMetrics: { period: { days_found: 30 }, raw: { clicks: 700, lpv: 480, checkout: 44 }, confidence: 100 },
    performanceLayers: { INTENT: { value: 0.09 } },
    claritySnapshot: { status: 'UNAVAILABLE' },
    ...overrides,
  };
}

test('diagnostics: causal_status tem os 4 estados documentados (OBSERVED/HYPOTHESIZED/SUPPORTED/VALIDATED)', () => {
  assert.deepEqual(CAUSAL_STATUSES.sort(), ['HYPOTHESIZED', 'OBSERVED', 'SUPPORTED', 'VALIDATED'].sort());
});

test('diagnostics: id duplicado é OBSERVED (fato bruto), nunca VALIDATED sem experimento', () => {
  const diags = buildCroDiagnostics(fixtureInputs());
  const dup = diags.find((d) => d.diagnostic_id.includes('DUPLICATE-ID'));
  assert.ok(dup);
  assert.equal(dup.causal_status, 'OBSERVED');
  assert.notEqual(dup.causal_status, 'VALIDATED');
});

test('diagnostics: nenhum diagnóstico gerado por este módulo é VALIDATED (exige experimento real, que este módulo nunca roda)', () => {
  const diags = buildCroDiagnostics(fixtureInputs());
  assert.equal(diags.some((d) => d.causal_status === 'VALIDATED'), false);
});

test('diagnostics: cada diagnóstico tem todos os campos pedidos', () => {
  const diags = buildCroDiagnostics(fixtureInputs());
  for (const d of diags) {
    for (const f of ['diagnostic_id', 'observation', 'affected_layer', 'severity', 'confidence', 'evidence', 'possible_causes', 'causal_status', 'recommended_investigation']) {
      assert.ok(f in d, `campo ausente: ${f} em ${d.diagnostic_id}`);
    }
  }
});

test('diagnostics: sem ids duplicados, nenhum diagnóstico de duplicidade é gerado (não inventa problema)', () => {
  const diags = buildCroDiagnostics(fixtureInputs({ parsed: { duplicate_ids: [], faq_questions: [] } }));
  assert.equal(diags.some((d) => d.diagnostic_id.includes('DUPLICATE-ID')), false);
});

test('diagnostics: cita explicitamente a hipótese histórica do CRO-001 quando o Clarity atual está indisponível, sem confundir com dado atual', () => {
  const diags = buildCroDiagnostics(fixtureInputs());
  const longPage = diags.find((d) => d.diagnostic_id === 'CRO-DIAG-LONG-PAGE-MOBILE-TRAFFIC');
  assert.match(longPage.evidence.cro_001_historical_citation, /NÃO reconfirmado/);
});

test('message-match: gera POSSIBLE_MESSAGE_MATCH_ISSUE quando aquisição forte + INTENT fraco, NUNCA MESSAGE_MATCH_IS_THE_CAUSE', () => {
  const findings = diagnoseMessageMatch(); // dados reais persistidos do Creative Agent (PASSO 8)
  for (const f of findings) {
    assert.equal(f.diagnostic_status, 'POSSIBLE_MESSAGE_MATCH_ISSUE');
    assert.notEqual(f.diagnostic_status, 'MESSAGE_MATCH_IS_THE_CAUSE');
    assert.match(f.never_conclude, /MESSAGE_MATCH_IS_THE_CAUSE/);
    assert.ok(f.possible_causes.length >= 3, 'deve listar múltiplas causas possíveis, não só uma');
  }
});

test('message-match: lista causas alternativas explícitas (tráfego, promessa, curiosidade, LP, prova) — nunca uma causa única', () => {
  const findings = diagnoseMessageMatch();
  if (findings.length > 0) {
    const causesText = findings[0].possible_causes.join(' ');
    assert.match(causesText, /Tráfego/);
    assert.match(causesText, /Promessa|promessa/);
  }
});

test('creative/LP pair: estrutura preparada, mas sem atribuir causalidade/performance por par (dado não existe ainda)', () => {
  const pairs = buildCreativeLpPairs([{ creative_id: 'CREATIVE-05', sample_sufficient: true }], 'LP-V1');
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].pair_id, 'CREATIVE-05+LP-V1');
  assert.equal(pairs[0].has_disaggregated_performance_data, false);
});

test('creative/LP pair: só inclui criativos com amostra suficiente', () => {
  const pairs = buildCreativeLpPairs([{ creative_id: 'X', sample_sufficient: false }], 'LP-V1');
  assert.deepEqual(pairs, []);
});

test('integração real: builder.js gera message_match_findings e creative_lp_pairs a partir de dados reais do Creative Agent', () => {
  const result = analyzeCro({});
  assert.ok(Array.isArray(result.message_match_findings));
  assert.ok(Array.isArray(result.creative_lp_pairs));
  assert.ok(result.creative_lp_pairs.length >= 2); // CREATIVE-01 e CREATIVE-05, os 2 com amostra suficiente
});
