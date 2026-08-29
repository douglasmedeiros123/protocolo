'use strict';

// PASSO 16 — items 1-6 do checklist de testes (item 21): blast radius de escrita interna,
// distinção REGISTER_OBSERVED_EXPOSURE vs CREATE_NEW_EXPOSURE, internal write policy, SHADOW_MODE
// semântica explícita.

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyBlastRadius } = require('../src/execution/blastRadius');
const { evaluateInternalWriteAuthority, INTERNAL_WRITE_WHITELIST } = require('../src/execution/internalWritePolicy');
const { ADAPTERS_BY_ACTION_TYPE } = require('../src/execution/executionAdapters');
const { handoffToPolicyEngine } = require('../src/orchestrator/policyHandoff');
const { classifyExecutionAuthorityDomain, enforceShadowModeForInternalWrite, enforceShadowMode, SHADOW_MODE } = require('../src/orchestrator/shadowMode');

// 1. INTERNAL_REGISTRY não herda blast radius ACCOUNT.
test('1: classifyBlastRadius(INTERNAL_REGISTRY/INTERNAL_DECISION_LEDGER) = SINGLE_ASSET, nunca ACCOUNT', () => {
  assert.equal(classifyBlastRadius('INTERNAL_REGISTRY').blast_radius, 'SINGLE_ASSET');
  assert.equal(classifyBlastRadius('INTERNAL_DECISION_LEDGER').blast_radius, 'SINGLE_ASSET');
});

test('1b: real — um candidato REGISTER_OBSERVED_EXPOSURE real, via handoffToPolicyEngine(), recebe affected_scope=SINGLE_ASSET (nunca ACCOUNT)', () => {
  const winnerCandidate = {
    candidate_id: 'TEST-REGISTER', action_class: 'COLLECT_EVIDENCE', hypothesis: 'h', capital_required: 0, confidence: 'MEDIUM', reversibility: 'REVERSIBLE',
    action_semantics: { semantic_type: 'REGISTER_OBSERVED_EXPOSURE', mutation_scope: 'INTERNAL_STATE_WRITE', recommended_blast_radius_if_scope_respected: 'SINGLE_ASSET' },
  };
  const measurementSignals = { financial_truth_health: { status: 'RELIABLE' }, capital_gate: { state: 'READY_FOR_CAPITAL' }, anomalies: [] };
  const result = handoffToPolicyEngine({ winnerCandidate, measurementSignals });
  assert.equal(result.dry_run.affected_scope, 'SINGLE_ASSET');
  assert.equal(result.action_contract.action_type, 'REGISTER_OBSERVED_EXPOSURE');
  assert.equal(result.action_contract.subject_type, 'INTERNAL_REGISTRY');
});

// 2. Mutação de campanha externa continua podendo ser ACCOUNT.
test('2: classifyBlastRadius(TRACKING_CONFIG) continua ACCOUNT — o carve-out interno é estreito, nunca genérico', () => {
  assert.equal(classifyBlastRadius('TRACKING_CONFIG').blast_radius, 'ACCOUNT');
});

// 3. REGISTER_OBSERVED_EXPOSURE nunca pode fazer deploy.
test('3: InternalRegistryAdapter é mutable=false — nunca alcança um connector real de deploy/mutação externa', () => {
  const adapter = ADAPTERS_BY_ACTION_TYPE.REGISTER_OBSERVED_EXPOSURE;
  assert.equal(adapter.mutable, false);
  assert.equal(adapter.name, 'InternalRegistryAdapter');
});

test('3b: evaluateInternalWriteAuthority nega qualquer writeType que toque sistema externo, independente do whitelist', () => {
  const r = evaluateInternalWriteAuthority({ writeType: 'APPEND_VERIFIED_EXPOSURE_OBSERVATION', touchesExternalSystem: true, isDeterministic: true, isAuditable: true, isBounded: true, isIdempotent: true });
  assert.equal(r.result, 'DENY');
});

// 4. CREATE_NEW_EXPOSURE nunca se disfarça de escrita interna.
test('4: CREATE_NEW_EXPOSURE nunca é mapeado pra INTERNAL_REGISTRY/subject interno em policyHandoff.js — só REGISTER_OBSERVED_EXPOSURE recebe o carve-out', () => {
  const { resolveActionAndSubjectType } = require('../src/orchestrator/policyHandoff');
  const createNewExposureCandidate = { candidate_id: 'C1', action_class: 'START_EXPERIMENT', action_semantics: { semantic_type: 'CREATE_NEW_EXPOSURE', mutation_scope: 'DEPLOYMENT_CHANGE' } };
  const resolved = resolveActionAndSubjectType(createNewExposureCandidate);
  assert.notEqual(resolved.subjectType, 'INTERNAL_REGISTRY');
  assert.notEqual(resolved.actionType, 'REGISTER_OBSERVED_EXPOSURE');
});

test('4b: CREATE_NEW_EXPOSURE não está no whitelist de internalWritePolicy.js — nunca ganha INTERNAL_OPERATIONAL_WRITE_AUTHORITY', () => {
  assert.ok(!INTERNAL_WRITE_WHITELIST.includes('CREATE_NEW_EXPOSURE'));
});

// 5. Escrita interna nunca altera policy protegida.
test('5: evaluateInternalWriteAuthority nega quando targetsProtectedDomain=true, mesmo com todos os outros critérios satisfeitos', () => {
  const r = evaluateInternalWriteAuthority({ writeType: 'APPEND_VERIFIED_EXPOSURE_OBSERVATION', targetsProtectedDomain: true, isDeterministic: true, isAuditable: true, isBounded: true, isIdempotent: true, touchesExternalSystem: false });
  assert.equal(r.result, 'DENY');
});

// 6. Semântica de SHADOW_MODE explícita.
test('6: classifyExecutionAuthorityDomain só retorna INTERNAL_OPERATIONAL_WRITE_AUTHORITY pra REGISTER_OBSERVED_EXPOSURE+INTERNAL_STATE_WRITE — qualquer outra combinação é EXTERNAL_EXECUTION_AUTHORITY', () => {
  assert.equal(classifyExecutionAuthorityDomain({ actionSemanticType: 'REGISTER_OBSERVED_EXPOSURE', actualMutationScope: 'INTERNAL_STATE_WRITE' }), 'INTERNAL_OPERATIONAL_WRITE_AUTHORITY');
  assert.equal(classifyExecutionAuthorityDomain({ actionSemanticType: 'CREATE_NEW_EXPOSURE', actualMutationScope: 'DEPLOYMENT_CHANGE' }), 'EXTERNAL_EXECUTION_AUTHORITY');
  assert.equal(classifyExecutionAuthorityDomain({ actionSemanticType: 'GENERIC_EXECUTABLE_ACTION', actualMutationScope: 'INTERNAL_STATE_WRITE' }), 'EXTERNAL_EXECUTION_AUTHORITY');
});

test('6b: enforceShadowModeForInternalWrite nunca libera domínio EXTERNAL_EXECUTION_AUTHORITY, mesmo com internal_write_authority ALLOW forjado', () => {
  const r = enforceShadowModeForInternalWrite({ authorityDomain: 'EXTERNAL_EXECUTION_AUTHORITY', internalWriteAuthorityResult: { result: 'ALLOW' } });
  assert.equal(r.would_execute_internal_write, false);
});

test('6c: enforceShadowModeForInternalWrite nunca libera se internalWriteAuthorityResult.result != ALLOW', () => {
  const r = enforceShadowModeForInternalWrite({ authorityDomain: 'INTERNAL_OPERATIONAL_WRITE_AUTHORITY', internalWriteAuthorityResult: { result: 'DENY', reason: 'x' } });
  assert.equal(r.would_execute_internal_write, false);
});

test('6d: enforceShadowModeForInternalWrite libera SOMENTE quando domínio=INTERNAL_OPERATIONAL_WRITE_AUTHORITY E internal_write_authority=ALLOW', () => {
  const r = enforceShadowModeForInternalWrite({ authorityDomain: 'INTERNAL_OPERATIONAL_WRITE_AUTHORITY', internalWriteAuthorityResult: { result: 'ALLOW', reason: 'ok' } });
  assert.equal(r.would_execute_internal_write, true);
  assert.equal(r.shadow_mode_active, true);
});

test('6e: enforceShadowMode() (barreira externa original, PASSO 15) permanece 100% inalterada — SEMPRE would_execute=false, independente de tudo', () => {
  assert.equal(SHADOW_MODE, true);
  const favorable = enforceShadowMode({ policy_allows: 'ALLOW', approval_requires: false, circuit_breaker_state: 'CLOSED' });
  assert.equal(favorable.would_execute, false);
  assert.equal(favorable.would_execute_if_authorized, true);
});
