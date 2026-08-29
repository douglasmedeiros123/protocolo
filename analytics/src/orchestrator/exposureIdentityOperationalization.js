'use strict';

const { resolveProductId } = require('../../config/product');
const { todayBRT } = require('../utils/dates');
const { analyzeStrategy } = require('../strategy-search/builder');
const { auditCurrentArchitectureEvidence } = require('./currentArchitectureEvidenceAudit');
const { buildArchitectureLiveEntry, resetEntryCounter, isHistoricalBackfillRequiredForNextExperiment } = require('../execution/exposureIdentityRegistry');
const { evaluateInternalWriteAuthority } = require('../execution/internalWritePolicy');
const { classifyExecutionAuthorityDomain, enforceShadowModeForInternalWrite } = require('./shadowMode');
const { loadExposureRegistry, appendToExposureRegistry } = require('../execution/registry');

// PASSO 16, item 9 — chave de idempotência baseada em identidade semântica real (produto +
// arquitetura + tipo de observação), NUNCA no entry_id sequencial (que reseta a cada processo e
// não persiste). Duas execuções reais deste fluxo sobre o MESMO estado nunca criam entradas
// ACTIVE duplicadas/inconsistentes.
function buildIdempotencyKey({ productId, architectureId, observationType }) {
  return `${productId || 'UNKNOWN_PRODUCT'}::${architectureId}::${observationType}`;
}

function findExistingActiveEntry(registry, key) {
  return registry.find((e) => e.status === 'ACTIVE' && buildIdempotencyKey({ productId: e.product_id, architectureId: e.architecture_id, observationType: e.observation_type }) === key) || null;
}

// item 11 — MDEBT-007 nunca é marcado RESOLVED só porque código de registry existe. Só
// PARTIALLY_RESOLVED quando uma entrada real foi de fato persistida (suficiente pra medição
// PROSPECTIVA do próximo experimento, nunca pra análise retroativa com live_from=UNKNOWN).
function deriveMdebt007Status({ persisted, evidenceAudit }) {
  if (!persisted) {
    return {
      status: 'UNRESOLVED',
      why: 'nenhuma entrada real foi persistida (autorização faltando, ou candidato ainda em dry-run) — MDEBT-007 continua sem nenhum registro real de qual arquitetura esteve/está live.',
    };
  }
  const backfill = isHistoricalBackfillRequiredForNextExperiment({ hasCurrentArchitectureMarkerEntry: true });
  return {
    status: 'PARTIALLY_RESOLVED',
    why: `entrada real da arquitetura atual persistida (evidence_classification=${evidenceAudit.evidence_classification}, live_from=${evidenceAudit.live_from_known ? 'KNOWN' : 'UNKNOWN'}) — suficiente pra medir PROSPECTIVAMENTE o próximo experimento real (${backfill.reason}), mas NÃO suficiente pra análise histórica retroativa (live_from UNKNOWN) nem pra cobrir transições de arquitetura anteriores a hoje. RESOLVED completo exigiria live_from KNOWN + histórico de transições anteriores — nenhum dos dois demonstrável hoje.`,
    backfill_analysis: backfill,
  };
}

/**
 * operationalizeExposureIdentity() — items 6-11. Identifica a arquitetura atual real, audita a
 * evidência, prepara um REGISTER_OBSERVED_EXPOSURE real e SÓ persiste se: (a) não é duplicata
 * idempotente de uma entrada ACTIVE já existente, E (b) internalWritePolicy.js + o carve-out de
 * SHADOW_MODE pra escrita interna (shadowMode.js) autorizam explicitamente. NUNCA contorna a
 * Policy Engine — se a autorização faltar, retorna DRY_RUN_ONLY com a razão exata.
 */
function operationalizeExposureIdentity({ productId, dataDir, referenceDate, executionDataDir } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();

  // item 6 — identifica a arquitetura atual usando SOMENTE o que já existe real no repo/dados
  // (reusa analyzeStrategy() — nunca duplica a reconstrução de arquitetura).
  const strategyResult = analyzeStrategy({ productId: resolvedProductId, dataDir, referenceDate: refDate });
  const currentArchitecture = strategyResult.analysis.current_architecture;
  const evidenceAudit = auditCurrentArchitectureEvidence({ currentArchitecture });

  const observationType = 'CURRENT_ARCHITECTURE_OBSERVATION';
  const idempotencyKey = buildIdempotencyKey({ productId: resolvedProductId, architectureId: currentArchitecture.architecture_id, observationType });

  resetEntryCounter();
  const candidateEntry = buildArchitectureLiveEntry({
    productId: resolvedProductId,
    architectureId: currentArchitecture.architecture_id,
    liveFrom: evidenceAudit.live_from_known ? evidenceAudit.live_from : null, // null -> 'UNKNOWN' dentro de buildArchitectureLiveEntry (item 7, nunca inventado)
    environment: 'production',
    observationType,
    deploymentEvidenceType: evidenceAudit.evidence_classification,
    deploymentReference: evidenceAudit.evidence_facts.host_routing_rule,
    evidenceSource: evidenceAudit.evidence_source,
    confidence: evidenceAudit.evidence_classification === 'DEPLOYMENT_CONFIRMED' ? 'HIGH' : evidenceAudit.evidence_classification === 'DEPLOYMENT_PROXY' ? 'MEDIUM' : 'LOW',
    recordedBy: 'CEO_ORCHESTRATOR_PASSO_16',
    provenance: { idempotency_key: idempotencyKey, evidence_audit: evidenceAudit },
  });

  // item 9 — checa duplicata idempotente ANTES de qualquer avaliação de autoridade.
  const existingRegistry = loadExposureRegistry(executionDataDir);
  const existingEntry = findExistingActiveEntry(existingRegistry, idempotencyKey);
  if (existingEntry) {
    return {
      action: 'ALREADY_REGISTERED',
      idempotency_key: idempotencyKey,
      entry: existingEntry,
      candidate_entry: candidateEntry,
      evidence_audit: evidenceAudit,
      mdebt_007: deriveMdebt007Status({ persisted: true, evidenceAudit }),
    };
  }

  // item 3-4 — classificação de domínio de autoridade + avaliação da whitelist fechada de
  // internalWritePolicy.js. NUNCA assume ALLOW por omissão.
  const authorityDomain = classifyExecutionAuthorityDomain({ actionSemanticType: 'REGISTER_OBSERVED_EXPOSURE', actualMutationScope: 'INTERNAL_STATE_WRITE' });
  const internalWriteAuthorityResult = evaluateInternalWriteAuthority({
    writeType: 'APPEND_VERIFIED_EXPOSURE_OBSERVATION',
    targetsProtectedDomain: false,
    isDeterministic: true, // mesma entrada = mesmo resultado, dado o mesmo estado real do repo
    isAuditable: true, // provenance completo (evidence_audit) embutido na entrada
    isBounded: true, // uma única entrada, escopo INTERNAL_REGISTRY/SINGLE_ASSET
    isIdempotent: true, // chave semântica checada acima, nunca duplica
    touchesExternalSystem: false, // nunca deploy, nunca campanha, nunca tracking externo
  });
  const shadowModeResult = enforceShadowModeForInternalWrite({ authorityDomain, internalWriteAuthorityResult });

  if (internalWriteAuthorityResult.result === 'ALLOW' && shadowModeResult.would_execute_internal_write) {
    const merged = appendToExposureRegistry([candidateEntry], executionDataDir);
    const persistedEntry = merged.find((e) => e.entry_id === candidateEntry.entry_id) || candidateEntry;
    return {
      action: 'REGISTERED',
      idempotency_key: idempotencyKey,
      entry: persistedEntry,
      authority_domain: authorityDomain,
      internal_write_authority: internalWriteAuthorityResult,
      shadow_mode_result: shadowModeResult,
      evidence_audit: evidenceAudit,
      mdebt_007: deriveMdebt007Status({ persisted: true, evidenceAudit }),
    };
  }

  // item 8 — autorização insuficiente: DRY_RUN_ONLY, nunca bypass, razão exata reportada.
  return {
    action: 'DRY_RUN_ONLY',
    idempotency_key: idempotencyKey,
    would_register: candidateEntry,
    authority_domain: authorityDomain,
    internal_write_authority: internalWriteAuthorityResult,
    shadow_mode_result: shadowModeResult,
    missing_authorization: internalWriteAuthorityResult.result !== 'ALLOW' ? internalWriteAuthorityResult.reason : shadowModeResult.reason,
    evidence_audit: evidenceAudit,
    mdebt_007: deriveMdebt007Status({ persisted: false, evidenceAudit }),
  };
}

module.exports = { operationalizeExposureIdentity, buildIdempotencyKey, findExistingActiveEntry, deriveMdebt007Status };
