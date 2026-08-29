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

module.exports = { SHADOW_MODE, AUTONOMOUS_EXECUTION_CAPITAL, isShadowModeActive, enforceShadowMode };
