'use strict';

const { APPROVAL_STATUSES } = require('./enums');

// item 14A.12 — só domínio e testes, nenhuma interface externa criada aqui.
let approvalCounter = 0;
function resetApprovalCounter() { approvalCounter = 0; }

function requestHumanApproval({ actionId, reason, riskLevel, expiresInMs = 24 * 60 * 60 * 1000 }) {
  approvalCounter += 1;
  const requestedAt = new Date().toISOString();
  return {
    approval_id: `APPROVAL-${String(approvalCounter).padStart(5, '0')}`,
    action_id: actionId,
    reason,
    risk_level: riskLevel,
    requested_at: requestedAt,
    approved_by: null,
    approved_at: null,
    expires_at: new Date(Date.parse(requestedAt) + expiresInMs).toISOString(),
    status: 'PENDING',
  };
}

function resolveApproval(approval, { approvedBy, decision, nowIso = new Date().toISOString() }) {
  if (Date.parse(nowIso) >= Date.parse(approval.expires_at)) {
    return { ...approval, status: 'EXPIRED' };
  }
  if (!['APPROVED', 'DENIED'].includes(decision)) throw new Error(`decisão inválida: ${decision}`);
  return { ...approval, status: decision, approved_by: approvedBy, approved_at: nowIso };
}

function isApprovalExpired(approval, nowIso = new Date().toISOString()) {
  return Date.parse(nowIso) >= Date.parse(approval.expires_at) && approval.status === 'PENDING';
}

/**
 * checkApprovalStillValid() — item 14A.20 (teste 18/19): mesmo uma Action com aprovação humana
 * concedida ainda precisa respeitar o Circuit Breaker no momento da execução — aprovação passada
 * nunca sobrescreve um circuito aberto agora.
 */
function checkApprovalStillValid({ approval, nowIso = new Date().toISOString() }) {
  if (approval.status !== 'APPROVED') return { valid: false, reason: `status da aprovação é ${approval.status}, não APPROVED.` };
  if (isApprovalExpired(approval, nowIso)) return { valid: false, reason: 'aprovação expirou desde a concessão.' };
  return { valid: true, reason: 'aprovação humana válida e não expirada.' };
}

module.exports = { requestHumanApproval, resolveApproval, isApprovalExpired, checkApprovalStillValid, resetApprovalCounter, APPROVAL_STATUSES };
