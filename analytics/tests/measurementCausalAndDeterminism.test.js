'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyCausalMethod, CAUSAL_METHODS } = require('../src/measurement/causalDiscipline');
const { analyzeMeasurement } = require('../src/measurement/builder');
const { runFullPlatformAudit } = require('../src/measurement/platformAudit');

test('sem randomização/controle/comparação temporal, método é UNKNOWN — nunca presumido', () => {
  const r = classifyCausalMethod({ hasRandomization: false, hasControlGroup: false, comparesBeforeAfter: false, isMultiVariable: false });
  assert.equal(r.method, 'UNKNOWN');
  assert.equal(r.causal_confidence, 'NOT_ASSESSABLE');
});

test('BEFORE_AFTER nunca tem confiança causal alta — CAUSAL_PROOF != BEFORE_AFTER (item 25)', () => {
  const r = classifyCausalMethod({ hasRandomization: false, hasControlGroup: false, comparesBeforeAfter: true, isMultiVariable: false });
  assert.equal(r.method, 'BEFORE_AFTER');
  assert.equal(r.causal_confidence, 'LOW');
});

test('experimento controlado multi-variável tem confiança causal reduzida vs single-variable (item 25)', () => {
  const single = classifyCausalMethod({ hasRandomization: true, hasControlGroup: true, comparesBeforeAfter: false, isMultiVariable: false });
  const multi = classifyCausalMethod({ hasRandomization: true, hasControlGroup: true, comparesBeforeAfter: false, isMultiVariable: true });
  assert.equal(single.causal_confidence, 'MEDIUM');
  assert.equal(multi.causal_confidence, 'LOW');
});

test('nenhum método causal chega a HIGH sem randomização real confirmada (nunca inflado)', () => {
  for (const method of CAUSAL_METHODS) {
    const r = classifyCausalMethod({ hasRandomization: method === 'CONTROLLED_EXPERIMENT', hasControlGroup: method === 'CONTROLLED_EXPERIMENT', comparesBeforeAfter: method === 'BEFORE_AFTER', isMultiVariable: false });
    assert.notEqual(r.causal_confidence, 'HIGH');
  }
});

// ===== determinismo do pipeline completo =====

test('determinismo: duas execuções reais seguidas do analyzeMeasurement produzem o mesmo conteúdo de análise (exceto created_at/generated_at)', () => {
  const a = analyzeMeasurement({});
  const b = analyzeMeasurement({});
  const strip = (r) => {
    const { created_at, ...rest } = r.analysis;
    return rest;
  };
  assert.deepEqual(strip(a), strip(b));
});

test('platformAudit é determinístico entre chamadas (leitura pura de arquivo, sem Date.now/random no resultado)', () => {
  const a = runFullPlatformAudit();
  const b = runFullPlatformAudit();
  assert.deepEqual(a, b);
});

test('measurement_debt/recommendation não mudam de ordem entre execuções (sem Math.random/Date.now afetando ranking)', () => {
  const a = analyzeMeasurement({});
  const b = analyzeMeasurement({});
  assert.deepEqual(a.analysis.measurement_debt.map((d) => d.debt_id), b.analysis.measurement_debt.map((d) => d.debt_id));
  assert.equal(a.analysis.recommendation.recommended_debt_id, b.analysis.recommendation.recommended_debt_id);
});
