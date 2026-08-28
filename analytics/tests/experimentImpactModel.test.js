'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateImpact } = require('../src/experiments/impactModel');

function cf(overrides = {}) {
  return { gasto_meta: 1207.72, cpa_financeiro: 109.79, aov_liquido: 65.11, roas_financeiro: 0.593, ...overrides };
}

test('impacto usa DELTA vs "não fazer nada" no mesmo budget, não o lucro absoluto do budget de teste', () => {
  const impact = estimateImpact(cf(), { cpaChangePct: -0.15, aovChangePct: 0 }, 280);
  // baseline (sem mudança) no budget de 280 e o projetado (com -15% CPA) devem ser DIFERENTES,
  // e delta_vs_nao_fazer_nada é a diferença entre os dois — nunca igual ao projetado sozinho
  // (a menos que o baseline seja 0, o que não é o caso aqui).
  assert.notEqual(impact.lucro_impact.delta_vs_nao_fazer_nada, impact.lucro_impact.projetado_no_budget);
  const expectedDelta = impact.lucro_impact.projetado_no_budget - impact.lucro_impact.baseline_sem_mudanca_no_budget;
  assert.ok(Math.abs(impact.lucro_impact.delta_vs_nao_fazer_nada - expectedDelta) < 1e-9);
});

test('reduzir CPA (mantendo AOV) sempre gera delta positivo (o teste é uma melhora real vs. não fazer nada)', () => {
  const impact = estimateImpact(cf(), { cpaChangePct: -0.15, aovChangePct: 0 }, 280);
  assert.ok(impact.lucro_impact.delta_vs_nao_fazer_nada > 0);
});

test('sem CPA/AOV atual (sem vendas no período), lucro_impact fica null — não inventa delta', () => {
  const impact = estimateImpact(cf({ cpa_financeiro: null, aov_liquido: null }), { cpaChangePct: -0.15, aovChangePct: 0 }, 280);
  assert.equal(impact.lucro_impact, null);
});

test('toda saída é marcada explicitamente como projeção, não garantia', () => {
  const impact = estimateImpact(cf(), { cpaChangePct: -0.1, aovChangePct: 0.1 }, 500);
  assert.equal(impact.is_projection_not_guarantee, true);
});
