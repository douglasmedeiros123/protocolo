'use strict';

const { classifyDeploymentEvidence } = require('../execution/exposureIdentityRegistry');

// PASSO 18 — evidência de deploy técnico real. NUNCA cria uma entrada de exposição LIVE/ACTIVE no
// registry (execution/registry.js) — isso continua reservado pro momento real de início de
// exposição comercial (LIVE_RUNNING), fora do escopo desta autorização. Este módulo só registra
// FATOS observados sobre o deploy técnico em si.

const DEPLOYMENT_STATES = ['NOT_DEPLOYED', 'DEPLOYED_NOT_VALIDATED', 'READY_FOR_EXPOSURE', 'LIVE_RUNNING'];

/**
 * buildDeploymentEvidenceRecord() — item 11. Registra fatos reais do deploy técnico (nunca
 * fabricados) — nunca promove sozinho o status pra LIVE_RUNNING (isso exigiria autorização
 * separada pra iniciar exposição comercial real).
 */
function buildDeploymentEvidenceRecord({
  commitHash, route, observedAt, productionRouteReachable, httpStatus,
  architectureId, variantId, experimentId, controlArchitectureId,
}) {
  const evidenceClass = classifyDeploymentEvidence({
    hasConfirmedProductionDeployLog: productionRouteReachable === true && httpStatus === 200,
    hasVercelDeployRecordLinkedToCommit: false, // nenhum acesso real à API/CLI da Vercel neste PASSO — só confirmação via HTTP real
    hasGitCommitOnly: !(productionRouteReachable === true && httpStatus === 200),
  });
  return {
    commit_hash: commitHash,
    route,
    observed_at: observedAt,
    production_route_reachable: productionRouteReachable === true,
    http_status: httpStatus,
    architecture_id: architectureId,
    variant_id: variantId,
    experiment_id: experimentId,
    control_architecture_id: controlArchitectureId,
    deployment_status: productionRouteReachable === true ? 'DEPLOYED_NOT_VALIDATED' : 'NOT_DEPLOYED',
    exposure_status: 'NOT_LIVE', // nunca LIVE_RUNNING neste PASSO — item 4/12
    evidence_classification: evidenceClass.class,
    evidence_classification_reason: evidenceClass.reason,
  };
}

// item 15 — detecção de exposição comercial acidental. Nunca assume — sempre checa fatos reais.
function auditAccidentalExposure({ controlRouteReachable, controlServesControlProduct, homepageRedirectsToTreatment, hostRuleChanged }) {
  const unchanged = controlRouteReachable === true && controlServesControlProduct === true && homepageRedirectsToTreatment !== true && hostRuleChanged !== true;
  return {
    CURRENT_COMMERCIAL_EXPOSURE_UNCHANGED: unchanged,
    checks: { controlRouteReachable, controlServesControlProduct, homepageRedirectsToTreatment, hostRuleChanged },
    reason: unchanged
      ? 'controle continua acessível, servindo o produto real, sem redirect/host rule desviando tráfego comercial pro treatment.'
      : 'PELO MENOS um sinal real indica exposição comercial não planejada — HALT/ROLLBACK deve ser avaliado imediatamente (item 15/16).',
  };
}

// item 18 — reavaliação dos 9 critérios de início do PASSO 17.1, com estados mais granulares
// (SATISFIED/UNSATISFIED/NOT_APPLICABLE/UNKNOWN) — nunca promove pra RUNNING aqui.
function buildStartCriteriaStatus(realState = {}) {
  const criteria = {
    treatment_deployed: realState.treatment_deployed,
    route_reachable: realState.route_reachable,
    tracking_smoke_test_passed: realState.tracking_smoke_test_passed,
    exposure_identity_registered: realState.exposure_identity_registered,
    control_identity_preserved: realState.control_identity_preserved,
    financial_truth_healthy: realState.financial_truth_healthy,
    policy_and_approval_satisfied: realState.policy_and_approval_satisfied,
    circuit_breaker_closed: realState.circuit_breaker_closed,
    human_approval_given: realState.human_approval_given,
  };
  const statuses = {};
  for (const [key, value] of Object.entries(criteria)) {
    if (value === true) statuses[key] = 'SATISFIED';
    else if (value === false) statuses[key] = 'UNSATISFIED';
    else if (value === 'NOT_APPLICABLE') statuses[key] = 'NOT_APPLICABLE';
    else statuses[key] = 'UNKNOWN';
  }
  const allSatisfiedExceptAuthorization = Object.entries(statuses)
    .filter(([k]) => !['human_approval_given'].includes(k))
    .every(([, v]) => v === 'SATISFIED');
  return {
    criteria: statuses,
    experiment_status: 'PREPARED', // nunca RUNNING nesta autorização — item 4/20
    all_satisfied_except_human_authorization: allSatisfiedExceptAuthorization && statuses.human_approval_given !== 'SATISFIED',
    note: 'human_approval_given aqui refere-se especificamente à autorização de INÍCIO DE EXPOSIÇÃO/tráfego real — distinta da autorização de deploy técnico já concedida nesta PASSO 18 (item 18, PASSO 17.1).',
  };
}

module.exports = { DEPLOYMENT_STATES, buildDeploymentEvidenceRecord, auditAccidentalExposure, buildStartCriteriaStatus };
