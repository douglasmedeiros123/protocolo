'use strict';

const { ACTION_STATES } = require('./enums');

// item 14A.1 — Action Contract canônico. Nenhum campo de capital é inventado — UNKNOWN/null
// quando não computável (mesma disciplina UNKNOWN != ZERO de todo o projeto).
let actionCounter = 0;
function resetActionCounter() { actionCounter = 0; }

/**
 * buildActionContract() — item 14A.1. Cria um Action Contract no estado inicial PROPOSED.
 * Nunca executa nada — é uma estrutura de dados pura.
 */
function buildActionContract({
  actionType, subjectType, subjectId, sourceAgent, recommendationId = null, experimentId = null,
  requestedChange, currentState, targetState, capitalRequired = null, capitalAtRisk = null,
  expectedValue = null, confidence = null, reversibility = null, measurementDependency = null,
  policyDependencies = [], approvalRequirement = null, executionMode = 'DRY_RUN', expiresInMs = null,
}) {
  actionCounter += 1;
  const createdAt = new Date().toISOString();
  return {
    action_id: `ACTION-${String(actionCounter).padStart(5, '0')}`,
    action_type: actionType,
    subject_type: subjectType,
    subject_id: subjectId,
    source_agent: sourceAgent,
    recommendation_id: recommendationId,
    experiment_id: experimentId,
    requested_change: requestedChange,
    current_state: currentState,
    target_state: targetState,
    capital_required: capitalRequired, // null = não computável, NUNCA 0 por omissão
    capital_at_risk: capitalAtRisk,
    expected_value: expectedValue,
    confidence,
    reversibility,
    measurement_dependency: measurementDependency,
    policy_dependencies: policyDependencies,
    approval_requirement: approvalRequirement,
    execution_mode: executionMode, // sempre DRY_RUN/SIMULATION nesta arquitetura (item 14A regra absoluta)
    status: 'PROPOSED',
    created_at: createdAt,
    expires_at: expiresInMs != null ? new Date(Date.parse(createdAt) + expiresInMs).toISOString() : null,
    status_history: [{ status: 'PROPOSED', at: createdAt, reason: 'action contract criado.' }],
  };
}

// item 14A.1 — transições válidas de estado, documentadas (nunca uma transição arbitrária).
const VALID_TRANSITIONS = {
  PROPOSED: ['POLICY_REVIEW', 'CANCELLED', 'EXPIRED'],
  POLICY_REVIEW: ['APPROVED', 'DENIED', 'AWAITING_HUMAN_APPROVAL', 'DEFERRED_TO_POLICY_REVIEW', 'CANCELLED'],
  AWAITING_HUMAN_APPROVAL: ['APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED'],
  APPROVED: ['DRY_RUN_READY', 'CANCELLED', 'EXPIRED'],
  DRY_RUN_READY: ['EXECUTING', 'CANCELLED', 'EXPIRED'],
  EXECUTING: ['EXECUTED', 'FAILED'],
  EXECUTED: ['ROLLED_BACK'],
  FAILED: ['ROLLED_BACK', 'CANCELLED'],
  DENIED: [],
  ROLLED_BACK: [],
  CANCELLED: [],
  EXPIRED: [],
};

function transitionAction(action, nextStatus, reason) {
  const allowed = VALID_TRANSITIONS[action.status] || [];
  if (!allowed.includes(nextStatus) && !ACTION_STATES.includes(nextStatus)) {
    throw new Error(`estado desconhecido: ${nextStatus}`);
  }
  if (!allowed.includes(nextStatus)) {
    return { ...action, transition_rejected: true, transition_rejected_reason: `transição ${action.status} -> ${nextStatus} não é válida (item 14A.1 — transições documentadas, nunca arbitrárias).` };
  }
  const at = new Date().toISOString();
  return {
    ...action,
    status: nextStatus,
    status_history: [...action.status_history, { status: nextStatus, at, reason: reason || null }],
  };
}

function isExpired(action, nowIso = new Date().toISOString()) {
  return action.expires_at != null && Date.parse(nowIso) >= Date.parse(action.expires_at);
}

module.exports = { buildActionContract, resetActionCounter, transitionAction, isExpired, VALID_TRANSITIONS, ACTION_STATES };
