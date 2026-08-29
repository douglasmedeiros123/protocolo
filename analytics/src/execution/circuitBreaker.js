'use strict';

// item 14A.6 — motor lógico/simulação puro. NENHUMA chamada real a API — só avalia sinais de
// trigger já fornecidos (simulados/reais-mas-só-leitura) e devolve um estado + ação. GLOBAL_FREEZE
// é sempre excepcional: só quando a própria fonte financeira canônica está comprometida — o
// mesmo princípio já usado em executionSafetySignal.js do Measurement Agent.
const { CIRCUIT_BREAKER_STATES, CIRCUIT_BREAKER_ACTIONS, CIRCUIT_BREAKER_TRIGGERS } = require('./enums');

// triggers severos o suficiente pra abrir o circuito SOZINHOS (sem precisar combinar com outro).
const SEVERE_ALONE_TRIGGERS = ['DUPLICATE_ACTION_STORM', 'REPEATED_EXECUTION_FAILURE', 'POLICY_VIOLATION', 'CRITICAL_DEPENDENT_ANOMALY'];
// triggers "leves" — sozinhos só geram WARNING; 2+ simultâneos escalam pra OPEN/FREEZE_SCOPE.
const MILD_TRIGGERS = ['EXCESSIVE_ACTION_FREQUENCY', 'BUDGET_ACCELERATION', 'UNEXPECTED_SPEND', 'LOSS_THRESHOLD'];

function detectTriggers(signals = {}) {
  const map = {
    FINANCIAL_TRUTH_BLOCKED: signals.financialTruthBlocked,
    DUPLICATE_ACTION_STORM: signals.duplicateActionStormDetected,
    CRITICAL_DEPENDENT_ANOMALY: signals.criticalDependentAnomaly,
    REPEATED_EXECUTION_FAILURE: signals.repeatedExecutionFailure,
    POLICY_VIOLATION: signals.policyViolationDetected,
    EXCESSIVE_ACTION_FREQUENCY: signals.excessiveActionFrequency,
    BUDGET_ACCELERATION: signals.budgetAcceleration,
    UNEXPECTED_SPEND: signals.unexpectedSpend,
    LOSS_THRESHOLD: signals.lossThreshold,
  };
  return Object.entries(map).filter(([, v]) => v === true).map(([k]) => k);
}

/**
 * evaluateCircuitBreaker() — item 14A.6. `currentState` persiste MANUAL_LOCK entre chamadas
 * (nunca auto-liberado por trigger nenhum — só um humano libera). Fora disso, o estado é sempre
 * recomputado deterministicamente a partir dos sinais atuais, nunca acumulado silenciosamente.
 */
function evaluateCircuitBreaker({ signals = {}, currentState = 'CLOSED', scope = 'GLOBAL' } = {}) {
  if (currentState === 'MANUAL_LOCK') {
    return { state: 'MANUAL_LOCK', action: 'BLOCK_EXECUTION', affected_scope: scope, triggers_detected: [], reason: 'trava manual ativa — só liberável por ação humana explícita, nunca por trigger automático.' };
  }

  const detected = detectTriggers(signals);

  if (detected.includes('FINANCIAL_TRUTH_BLOCKED')) {
    return { state: 'OPEN', action: 'GLOBAL_FREEZE', affected_scope: 'GLOBAL', triggers_detected: detected, reason: 'fonte financeira canônica comprometida — única condição que aciona GLOBAL_FREEZE (item 14A.6: excepcional, nunca default).' };
  }

  const severe = detected.filter((t) => SEVERE_ALONE_TRIGGERS.includes(t));
  const mild = detected.filter((t) => MILD_TRIGGERS.includes(t));

  if (severe.length > 0) {
    return { state: 'OPEN', action: 'FREEZE_SCOPE', affected_scope: scope, triggers_detected: detected, reason: `trigger(s) severo(s) detectado(s): ${severe.join(', ')} — abre o circuito pra este escopo específico, nunca globalmente sem a condição excepcional.` };
  }
  if (mild.length >= 2) {
    return { state: 'OPEN', action: 'FREEZE_SCOPE', affected_scope: scope, triggers_detected: detected, reason: `${mild.length} triggers leves simultâneos (${mild.join(', ')}) — combinação escala pra OPEN/FREEZE_SCOPE.` };
  }
  if (mild.length === 1) {
    return { state: 'WARNING', action: 'BLOCK_EXECUTION', affected_scope: scope, triggers_detected: detected, reason: `1 trigger leve detectado (${mild[0]}) — WARNING, execução bloqueada até confirmação, circuito ainda não totalmente aberto.` };
  }
  return { state: 'CLOSED', action: 'ALLOW_EXECUTION', affected_scope: scope, triggers_detected: [], reason: 'nenhum trigger detectado.' };
}

module.exports = { evaluateCircuitBreaker, detectTriggers, CIRCUIT_BREAKER_STATES, CIRCUIT_BREAKER_ACTIONS, CIRCUIT_BREAKER_TRIGGERS, SEVERE_ALONE_TRIGGERS, MILD_TRIGGERS };
