'use strict';

// PASSO 16 — items 7-13 do checklist de testes (item 21): contrato de identidade de exposição,
// classificação de evidência, idempotência, MDEBT-007. Usa um diretório TEMPORÁRIO isolado (nunca
// o real analytics/data/execution/) pra nunca poluir o registro real já persistido nesta sessão.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildArchitectureLiveEntry, resetEntryCounter, classifyDeploymentEvidence } = require('../src/execution/exposureIdentityRegistry');
const { auditCurrentArchitectureEvidence } = require('../src/orchestrator/currentArchitectureEvidenceAudit');
const { operationalizeExposureIdentity, buildIdempotencyKey, deriveMdebt007Status } = require('../src/orchestrator/exposureIdentityOperationalization');
const { loadExposureRegistry } = require('../src/execution/registry');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'passo16-exposure-')); }
function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

// 7. Registro de exposição aceita live_from=UNKNOWN.
test('7: buildArchitectureLiveEntry({liveFrom: null}) resulta em live_from="UNKNOWN"', () => {
  resetEntryCounter();
  const entry = buildArchitectureLiveEntry({ architectureId: 'ARCH-X', liveFrom: null, environment: 'production' });
  assert.equal(entry.live_from, 'UNKNOWN');
});

// 8. live_from=UNKNOWN nunca é inventado.
test('8: real — auditCurrentArchitectureEvidence() sobre a arquitetura atual real retorna live_from_known=false (nenhuma data exata é demonstrável)', () => {
  const { analyzeStrategy } = require('../src/strategy-search/builder');
  const strategyResult = analyzeStrategy({});
  const audit = auditCurrentArchitectureEvidence({ currentArchitecture: strategyResult.analysis.current_architecture });
  assert.equal(audit.live_from_known, false);
  assert.match(audit.live_from_reason, /UNKNOWN/);
});

// 9. DEPLOYMENT_PROXY != DEPLOYMENT_CONFIRMED.
test('9: classifyDeploymentEvidence distingue DEPLOYMENT_PROXY de DEPLOYMENT_CONFIRMED — nunca a mesma classe', () => {
  const proxy = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: false, hasVercelDeployRecordLinkedToCommit: true, hasGitCommitOnly: false });
  const confirmed = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: true, hasVercelDeployRecordLinkedToCommit: true, hasGitCommitOnly: false });
  assert.equal(proxy.class, 'DEPLOYMENT_PROXY');
  assert.equal(confirmed.class, 'DEPLOYMENT_CONFIRMED');
  assert.notEqual(proxy.class, confirmed.class);
});

test('9b: real — a arquitetura atual real é classificada como DEPLOYMENT_PROXY, nunca DEPLOYMENT_CONFIRMED (nenhuma confirmação de runtime foi buscada)', () => {
  const { analyzeStrategy } = require('../src/strategy-search/builder');
  const strategyResult = analyzeStrategy({});
  const audit = auditCurrentArchitectureEvidence({ currentArchitecture: strategyResult.analysis.current_architecture });
  assert.equal(audit.evidence_classification, 'DEPLOYMENT_PROXY');
});

// 10. REPO_CHANGE_ONLY não é prova de produção.
test('10: classifyDeploymentEvidence({hasGitCommitOnly:true}) = REPO_CHANGE_ONLY, nunca tratado como prova de live', () => {
  const r = classifyDeploymentEvidence({ hasConfirmedProductionDeployLog: false, hasVercelDeployRecordLinkedToCommit: false, hasGitCommitOnly: true });
  assert.equal(r.class, 'REPO_CHANGE_ONLY');
  assert.match(r.reason, /NUNCA inferir data de produção/);
});

// 11. A mesma entrada registrada duas vezes é idempotente.
test('11: real — operationalizeExposureIdentity() chamado duas vezes no MESMO estado nunca cria entrada ACTIVE duplicada (dir temporário isolado)', () => {
  const tempDir = makeTempDir();
  try {
    const first = operationalizeExposureIdentity({ executionDataDir: tempDir });
    assert.equal(first.action, 'REGISTERED');
    const second = operationalizeExposureIdentity({ executionDataDir: tempDir });
    assert.equal(second.action, 'ALREADY_REGISTERED');
    assert.equal(second.entry.entry_id, first.entry.entry_id);
    const registry = loadExposureRegistry(tempDir);
    assert.equal(registry.filter((e) => e.status === 'ACTIVE').length, 1);
  } finally {
    cleanup(tempDir);
  }
});

test('11b: buildIdempotencyKey é determinístico e semântico (produto+arquitetura+tipo), nunca baseado em entry_id sequencial', () => {
  const k1 = buildIdempotencyKey({ productId: 'P1', architectureId: 'A1', observationType: 'CURRENT_ARCHITECTURE_OBSERVATION' });
  const k2 = buildIdempotencyKey({ productId: 'P1', architectureId: 'A1', observationType: 'CURRENT_ARCHITECTURE_OBSERVATION' });
  assert.equal(k1, k2);
  const k3 = buildIdempotencyKey({ productId: 'P1', architectureId: 'A2', observationType: 'CURRENT_ARCHITECTURE_OBSERVATION' });
  assert.notEqual(k1, k3);
});

// 12. O registro não resolve MDEBT-007 só por existir código.
test('12: deriveMdebt007Status({persisted:false}) = UNRESOLVED — o módulo de registry existir no código nunca basta', () => {
  const status = deriveMdebt007Status({ persisted: false, evidenceAudit: { evidence_classification: 'UNKNOWN', live_from_known: false } });
  assert.equal(status.status, 'UNRESOLVED');
});

// 13. Identidade de exposição operacional resolve requisito PROSPECTIVO do próximo MVA.
test('13: deriveMdebt007Status({persisted:true}) = PARTIALLY_RESOLVED — suficiente pra medição prospectiva, nunca RESOLVED completo (retroativo continua faltando)', () => {
  const status = deriveMdebt007Status({ persisted: true, evidenceAudit: { evidence_classification: 'DEPLOYMENT_PROXY', live_from_known: false } });
  assert.equal(status.status, 'PARTIALLY_RESOLVED');
  assert.notEqual(status.status, 'RESOLVED');
  assert.ok(status.backfill_analysis);
});

// 20 (parcial, ligado à operacionalização) — nunca contorna Policy Engine: uma escrita cujo
// internalWritePolicy nega deve sempre virar DRY_RUN_ONLY, nunca ser persistida de qualquer forma.
test('extra: operationalizeExposureIdentity() com whitelist vazio forçado (writeType não reconhecido) resultaria em DRY_RUN_ONLY — validado indiretamente via evaluateInternalWriteAuthority', () => {
  const { evaluateInternalWriteAuthority } = require('../src/execution/internalWritePolicy');
  const r = evaluateInternalWriteAuthority({ writeType: 'SOME_UNKNOWN_WRITE_TYPE', isDeterministic: true, isAuditable: true, isBounded: true, isIdempotent: true, touchesExternalSystem: false });
  assert.equal(r.result, 'DENY');
});
