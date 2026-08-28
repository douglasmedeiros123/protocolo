'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeGap } = require('../src/profit/gap');
const { simulateScenario, runPresetScenarios, PRESET_SCENARIOS } = require('../src/profit/scenarios');

function cf(overrides = {}) {
  return { gasto_meta: 1000, cpa_financeiro: 100, aov_liquido: 100, roas_financeiro: 1.0, ...overrides };
}

test('gap CPA: quanto o CPA precisa cair pra bater ROAS 2, mantendo AOV', () => {
  const g = computeGap(cf(), 2);
  assert.equal(g.cpa_path.cpa_max_for_target, 100 / 2); // 50
  assert.equal(g.cpa_path.reduction_needed_value, 100 - 50); // 50
  assert.equal(g.cpa_path.reduction_needed_percent, 0.5); // 50%
});

test('gap AOV: quanto o AOV precisa subir pra bater ROAS 2, mantendo CPA', () => {
  const g = computeGap(cf(), 2);
  assert.equal(g.aov_path.aov_min_for_target, 100 * 2); // 200
  assert.equal(g.aov_path.increase_needed_value, 200 - 100); // 100
  assert.equal(g.aov_path.increase_needed_percent, 1.0); // 100%
});

test('gap CPA e gap AOV nunca se misturam — são objetos independentes', () => {
  const g = computeGap(cf(), 2);
  assert.ok(g.cpa_path);
  assert.ok(g.aov_path);
  assert.equal(Object.keys(g.cpa_path).some((k) => k.includes('aov')), false);
  assert.equal(Object.keys(g.aov_path).some((k) => k.includes('cpa')), false);
});

test('gap com CPA já melhor que o necessário: reduction_needed vem negativo (não trunca em 0)', () => {
  // ROAS atual já 3.0 (CPA baixo demais pra precisar de mais corte pra bater a meta 2)
  const g = computeGap(cf({ cpa_financeiro: 50, aov_liquido: 150, roas_financeiro: 3 }), 2);
  assert.equal(g.cpa_path.cpa_max_for_target, 75); // 150/2
  assert.equal(g.cpa_path.reduction_needed_value, 50 - 75); // -25 (negativo = já folgado)
  assert.ok(g.cpa_path.reduction_needed_value < 0);
});

test('gap com divisão por zero (sem CPA/AOV) retorna null em vez de quebrar', () => {
  const g = computeGap(cf({ cpa_financeiro: null, aov_liquido: null }), 2);
  assert.equal(g.cpa_path.cpa_max_for_target, null);
  assert.equal(g.aov_path.aov_min_for_target, null);
});

test('cenário A: CPA -10%, AOV igual', () => {
  const s = simulateScenario(cf(), PRESET_SCENARIOS.A);
  assert.equal(s.cpa_projetado, 90);
  assert.equal(s.aov_projetado, 100);
  assert.equal(s.roas_projetado, 100 / 90);
  assert.equal(s.vendas_necessarias, 1000 / 90);
  assert.ok(Math.abs(s.receita_projetada - (1000 / 90) * 100) < 1e-9);
  assert.ok(Math.abs(s.lucro_prejuizo_projetado - (s.receita_projetada - 1000)) < 1e-9);
});

test('cenário D: CPA -40%, AOV +30% — o mais agressivo dos 4 presets', () => {
  const s = simulateScenario(cf(), PRESET_SCENARIOS.D);
  assert.equal(s.cpa_projetado, 60);
  assert.equal(s.aov_projetado, 130);
  assert.equal(s.roas_projetado, 130 / 60);
});

test('4 cenários combinados de uma vez (runPresetScenarios)', () => {
  const all = runPresetScenarios(cf());
  assert.deepEqual(Object.keys(all).sort(), ['A', 'B', 'C', 'D']);
  for (const key of ['A', 'B', 'C', 'D']) {
    assert.ok(all[key].cpa_projetado > 0);
    assert.ok(typeof all[key].roas_projetado === 'number');
  }
});

test('cenário customizado (fora dos presets A-D)', () => {
  const s = simulateScenario(cf(), { cpaChangePct: -0.05, aovChangePct: 0.15, label: 'custom' });
  assert.equal(s.label, 'custom');
  assert.equal(s.cpa_projetado, 95);
  assert.ok(Math.abs(s.aov_projetado - 115) < 1e-9); // 100*1.15 tem erro de ponto flutuante (114.999...)
});

test('cenário sem CPA/AOV atual (sem vendas no período) retorna erro explícito, não quebra', () => {
  const s = simulateScenario(cf({ cpa_financeiro: null, aov_liquido: null }), PRESET_SCENARIOS.A);
  assert.ok(s.error);
  assert.equal(s.cpa_projetado, undefined);
});
