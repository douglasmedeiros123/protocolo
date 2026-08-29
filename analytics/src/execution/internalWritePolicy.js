'use strict';

const { PROTECTED_POLICY_DOMAINS } = require('./selfModificationProtection');

// PASSO 16, item 3-4 — INTERNAL_OPERATIONAL_WRITE_AUTHORITY vs EXTERNAL_EXECUTION_AUTHORITY.
// NUNCA libera internal writes genericamente — só um whitelist fechado de tipos de baixo risco,
// cada um determinístico/auditável/bounded/idempotente, nunca tocando domínio protegido.
const INTERNAL_WRITE_WHITELIST = ['APPEND_DECISION_LEDGER', 'APPEND_VERIFIED_EXPOSURE_OBSERVATION', 'PERSIST_DETERMINISTIC_ANALYSIS_ARTIFACT'];

// mesmos domínios protegidos de selfModificationProtection.js — internal write nunca os toca,
// mesmo que o whitelist acima permita a operação em geral.
const INTERNAL_WRITE_NEVER_TARGETS = PROTECTED_POLICY_DOMAINS;

/**
 * evaluateInternalWriteAuthority() — item 3-4. ALLOW só quando: writeType está no whitelist
 * fechado, E não tem como domínio-alvo nenhum domínio protegido, E os critérios estruturais
 * (determinístico/auditável/bounded/idempotente) são afirmados explicitamente pelo chamador
 * (nunca assumidos por omissão).
 */
function evaluateInternalWriteAuthority({ writeType, targetsProtectedDomain = false, isDeterministic = false, isAuditable = false, isBounded = false, isIdempotent = false, touchesExternalSystem = false }) {
  if (touchesExternalSystem) {
    return { result: 'DENY', reason: 'toca sistema externo — isso é EXTERNAL_EXECUTION_AUTHORITY, nunca INTERNAL_OPERATIONAL_WRITE_AUTHORITY, independente do writeType.' };
  }
  if (!INTERNAL_WRITE_WHITELIST.includes(writeType)) {
    return { result: 'DENY', reason: `writeType=${writeType} não está no whitelist fechado (${INTERNAL_WRITE_WHITELIST.join(', ')}) — nunca liberado por padrão.` };
  }
  if (targetsProtectedDomain) {
    return { result: 'DENY', reason: `writeType=${writeType} tem como alvo um domínio protegido — nunca autorizado, mesmo estando no whitelist geral (mesma lista de selfModificationProtection.js).` };
  }
  if (!isDeterministic || !isAuditable || !isBounded || !isIdempotent) {
    return { result: 'DENY', reason: `critérios estruturais não confirmados explicitamente: deterministic=${isDeterministic}, auditable=${isAuditable}, bounded=${isBounded}, idempotent=${isIdempotent} — todos precisam ser true, nunca assumidos por omissão.` };
  }
  return { result: 'ALLOW', reason: `writeType=${writeType} atende todos os critérios (whitelist, não-protegido, determinístico, auditável, bounded, idempotente, nunca externo) — INTERNAL_OPERATIONAL_WRITE_AUTHORITY concedida.` };
}

module.exports = { INTERNAL_WRITE_WHITELIST, INTERNAL_WRITE_NEVER_TARGETS, evaluateInternalWriteAuthority };
