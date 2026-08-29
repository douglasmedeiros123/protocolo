'use strict';

// item 20 — SHADOW_MODE=true é hard safety nesta V1. Mesmo se Policy=ALLOW, Approval=NOT_
// REQUIRED, Circuit Breaker=CLOSED, o resultado externo é SEMPRE WOULD_EXECUTE_EXTERNALLY=false.
// Reforça (nunca substitui) o SAFE_MODE já existente em execution/safeMode.js — duas barreiras
// independentes, cada uma suficiente sozinha.
const SHADOW_MODE = true;
const AUTONOMOUS_EXECUTION_CAPITAL = 0;

function isShadowModeActive() { return SHADOW_MODE; }

/**
 * enforceShadowMode() — item 20. Recebe o resultado do policy handoff e SEMPRE força
 * would_execute_externally=false, incondicionalmente — mesmo no cenário mais favorável possível
 * (ALLOW + NOT_REQUIRED + CLOSED). Em SHADOW_MODE, EXECUTE means WOULD_EXECUTE_IF_AUTHORIZED,
 * nunca execução real (item 1).
 */
function enforceShadowMode(policyHandoffResult) {
  const allGatesFavorable = policyHandoffResult.policy_allows === 'ALLOW' && policyHandoffResult.approval_requires === false && policyHandoffResult.circuit_breaker_state === 'CLOSED';
  return {
    ...policyHandoffResult,
    would_execute: false, // SEMPRE — nunca sobrescrito, nem quando allGatesFavorable=true
    would_execute_if_authorized: allGatesFavorable,
    shadow_mode_active: SHADOW_MODE,
    autonomous_execution_capital: AUTONOMOUS_EXECUTION_CAPITAL,
    reason: allGatesFavorable
      ? 'todos os gates permitiriam execução (ALLOW/não exige aprovação/circuito fechado), mas SHADOW_MODE=true bloqueia incondicionalmente — WOULD_EXECUTE_IF_AUTHORIZED=true é o máximo que este ciclo pode afirmar.'
      : 'pelo menos um gate já não permitiria execução mesmo fora de SHADOW_MODE — WOULD_EXECUTE_IF_AUTHORIZED=false.',
  };
}

// PASSO 16, item 4 — SHADOW_MODE SEMÂNTICA. Decisão arquitetural explícita (nunca assumida):
// SHADOW_MODE continua impedindo INCONDICIONALMENTE qualquer EXTERNAL_EXECUTION_AUTHORITY
// (enforceShadowMode() acima permanece 100% inalterado). Uma categoria estreita de escrita
// interna (INTERNAL_OPERATIONAL_WRITE_AUTHORITY) pode proceder DENTRO do shadow mode SE, e
// somente se, já passou pelos critérios fechados de execution/internalWritePolicy.js
// (whitelist, não-protegido, determinístico, auditável, bounded, idempotente, nunca externo).
// Nunca a inversa: um candidato classificado como EXTERNAL_EXECUTION_AUTHORITY nunca passa por
// aqui — cai sempre em enforceShadowMode() padrão.
function classifyExecutionAuthorityDomain({ actionSemanticType, actualMutationScope }) {
  if (actualMutationScope === 'INTERNAL_STATE_WRITE' && actionSemanticType === 'REGISTER_OBSERVED_EXPOSURE') {
    return 'INTERNAL_OPERATIONAL_WRITE_AUTHORITY';
  }
  return 'EXTERNAL_EXECUTION_AUTHORITY';
}

/**
 * enforceShadowModeForInternalWrite() — item 4. NUNCA chamada no lugar de enforceShadowMode();
 * usada apenas como um gate ADICIONAL, estreito, específico pra candidatos já classificados como
 * INTERNAL_OPERATIONAL_WRITE_AUTHORITY que já foram avaliados por internalWritePolicy.js. Se a
 * policy interna negou, ou o domínio não é interno, o resultado é sempre would_execute_internal_
 * write=false — nunca um bypass silencioso.
 */
function enforceShadowModeForInternalWrite({ authorityDomain, internalWriteAuthorityResult }) {
  if (authorityDomain !== 'INTERNAL_OPERATIONAL_WRITE_AUTHORITY') {
    return { would_execute_internal_write: false, shadow_mode_active: SHADOW_MODE, reason: 'domínio não é INTERNAL_OPERATIONAL_WRITE_AUTHORITY — cai sob a barreira padrão de enforceShadowMode(), nunca liberado por esta função.' };
  }
  if (!internalWriteAuthorityResult || internalWriteAuthorityResult.result !== 'ALLOW') {
    return { would_execute_internal_write: false, shadow_mode_active: SHADOW_MODE, reason: `internalWritePolicy negou (${internalWriteAuthorityResult ? internalWriteAuthorityResult.reason : 'nenhum resultado fornecido'}) — SHADOW_MODE nunca libera uma escrita que a própria policy interna já bloqueou.` };
  }
  return {
    would_execute_internal_write: true,
    shadow_mode_active: SHADOW_MODE,
    reason: 'SHADOW_MODE=true continua bloqueando incondicionalmente qualquer EXTERNAL_EXECUTION_AUTHORITY (enforceShadowMode() inalterado). Este candidato foi classificado como INTERNAL_OPERATIONAL_WRITE_AUTHORITY E já atende todos os critérios fechados de internalWritePolicy.js — categoria explicitamente definida como fora do escopo de bloqueio do SHADOW_MODE (PASSO 16, item 4).',
  };
}

module.exports = {
  SHADOW_MODE, AUTONOMOUS_EXECUTION_CAPITAL, isShadowModeActive, enforceShadowMode,
  classifyExecutionAuthorityDomain, enforceShadowModeForInternalWrite,
};
