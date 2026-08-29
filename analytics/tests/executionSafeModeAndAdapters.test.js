'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SAFE_MODE, isSafeModeActive, enforceSafeMode } = require('../src/execution/safeMode');
const { MediaExecutionAdapter, TrackingExecutionAdapter, resolveAdapter, ADAPTERS_BY_ACTION_TYPE } = require('../src/execution/executionAdapters');
const { runDryRun } = require('../src/execution/dryRunEngine');
const { buildActionContract, resetActionCounter } = require('../src/execution/actionContract');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');
const { proposeAndDryRunNextAction } = require('../src/execution/builder');

// 4. SAFE_MODE bloqueia mutação externa.
test('4: SAFE_MODE=true sempre — connector mutável nunca alcança EXTERNAL_MUTATION, mesmo Action APPROVED', () => {
  assert.equal(SAFE_MODE, true);
  assert.equal(isSafeModeActive(), true);
  const enforcement = enforceSafeMode({ actionStatus: 'APPROVED', connectorIsMutable: true });
  assert.equal(enforcement.enforced_mode, 'DRY_RUN_ONLY');
  assert.equal(enforcement.forced, true);
});

test('4b: connector não-mutável nunca é forçado (sem risco de mutação de qualquer forma)', () => {
  const enforcement = enforceSafeMode({ actionStatus: 'APPROVED', connectorIsMutable: false });
  assert.equal(enforcement.enforced_mode, 'DRY_RUN');
  assert.equal(enforcement.forced, false);
});

test('4c: todos os adapters de ação real (Media/Tracking) são marcados mutable=true — nunca escapam do enforcement', () => {
  assert.equal(MediaExecutionAdapter.mutable, true);
  assert.equal(TrackingExecutionAdapter.mutable, true);
  for (const type of Object.keys(ADAPTERS_BY_ACTION_TYPE)) {
    assert.equal(resolveAdapter(type).mutable, true);
  }
});

// 5. Dry-run nunca executa connector real.
test('5: adapter.execute() em SAFE_MODE sempre retorna blocked=true, nunca chama a API externa', () => {
  const result = MediaExecutionAdapter.execute({ action_id: 'A1', status: 'APPROVED' });
  assert.equal(result.executed, false);
  assert.equal(result.blocked, true);
});

test('5b: adapter.simulate() nunca faz chamada externa — sempre simulated_result', () => {
  const result = MediaExecutionAdapter.simulate({ action_id: 'A1' });
  assert.equal(result.simulated_result, 'SIMULATED_OK');
});

test('5c: runDryRun() completo (Action real de START_EXPERIMENT) tem would_execute_externally=false', () => {
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C1', sourceAgent: 'S', requestedChange: 'r', currentState: { budget: 100 }, targetState: { budget: 150 }, capitalRequired: 50 });
  const result = runDryRun({ action, measurementSignals: { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] }, capitalSafetyConfig: loadCapitalSafetyConfig() });
  assert.equal(result.would_execute_externally, false);
  assert.equal(result.safe_mode_enforcement.enforced_mode, 'DRY_RUN_ONLY');
});

// 23. No real external mutation (fluxo completo real).
test('23: real — proposeAndDryRunNextAction() sobre o estado real do sistema nunca executa nada externamente', () => {
  const result = proposeAndDryRunNextAction({});
  assert.equal(result.would_execute_externally, false);
  assert.equal(result.safe_mode, true);
  if (result.proposed) assert.equal(result.dry_run.would_execute_externally, false);
});
