'use strict';

// PASSO 14A.1, item 6-7 — correção de segurança: HALT != ROLLBACK. Parar uma ação (STOP_
// EXPERIMENT/PAUSE_CAMPAIGN) não restaura automaticamente o estado anterior — só interrompe a
// ação em andamento. Só declaramos ROLLBACK quando existe um mecanismo REAL e conhecido de
// restaurar previous_state, e mesmo assim fica ROLLBACK_UNVERIFIED até uma validação real de
// runtime acontecer (que nunca acontece nesta arquitetura, porque nada é executado de verdade —
// SAFE_MODE/DRY_RUN sempre).
const ROLLBACK_STATUSES = ['HALT_ONLY', 'ROLLBACK_SUPPORTED', 'ROLLBACK_UNVERIFIED', 'IRREVERSIBLE', 'NOT_SUPPORTED', 'UNKNOWN'];

// item 6 — método de HALT (parar a ação em andamento) — nunca implica restauração do estado
// anterior por si só.
const HALT_METHOD_BY_ACTION_TYPE = {
  START_EXPERIMENT: 'STOP_EXPERIMENT', // parar o experimento != reverter a arquitetura pro estado pré-experimento
  ACTIVATE_CAMPAIGN: 'PAUSE_CAMPAIGN',
  PUBLISH_CREATIVE: 'UNPUBLISH_CREATIVE',
  DEPLOY_LP_CHANGE: 'HALT_ROLLOUT', // interrompe um rollout em andamento, se aplicável — não confirma restauração
};

// item 6-7 — método de RESTORE real (restaura previous_state) — só existe quando o mecanismo é
// genuinamente conhecido. START_EXPERIMENT/DEPLOY_LP_CHANGE/PUBLISH_CREATIVE deliberadamente NÃO
// aparecem aqui: parar/despublicar não prova que o estado anterior foi restaurado.
const RESTORE_METHOD_BY_ACTION_TYPE = {
  ADJUST_BUDGET: 'REVERT_TO_PREVIOUS_BUDGET_VALUE',
  ADJUST_BID: 'REVERT_TO_PREVIOUS_BID_VALUE',
  PAUSE_CAMPAIGN: 'REACTIVATE_CAMPAIGN',
  ACTIVATE_CAMPAIGN: 'PAUSE_CAMPAIGN',
  UPDATE_TRACKING_CONFIG: 'RESTORE_PREVIOUS_TRACKING_CONFIG_SNAPSHOT',
  UPDATE_PRODUCT_PRICE: 'REVERT_TO_PREVIOUS_PRICE',
  UPDATE_OFFER: 'REVERT_TO_PREVIOUS_OFFER_CONFIG',
};

/**
 * buildRollbackContract() — item 6. Nunca infere ROLLBACK_SUPPORTED a partir de um método de
 * HALT. previous_state nunca é inventado (UNKNOWN != RESTORABLE, item 7).
 */
function buildRollbackContract({ actionType, currentState, reversibility }) {
  const haltMethod = HALT_METHOD_BY_ACTION_TYPE[actionType] || null;
  const restoreMethod = RESTORE_METHOD_BY_ACTION_TYPE[actionType] || null;
  const previousStateKnown = currentState != null;

  const haltSupported = haltMethod != null;
  const restoreMechanismKnown = restoreMethod != null;

  let status;
  if (reversibility === 'IRREVERSIBLE') status = 'IRREVERSIBLE';
  else if (restoreMechanismKnown && previousStateKnown) status = 'ROLLBACK_UNVERIFIED'; // nunca SUPPORTED sem validação real (ver rollbackVerification.js)
  else if (restoreMechanismKnown && !previousStateKnown) status = 'UNKNOWN'; // método existe, mas o estado anterior não é conhecido — nunca inventado
  else if (haltSupported) status = 'HALT_ONLY';
  else status = 'NOT_SUPPORTED';

  return {
    halt_supported: haltSupported,
    halt_method: haltMethod,
    rollback_supported: false, // NUNCA true nesta arquitetura — exigiria restore_validation real, que exige execução real (item 7)
    rollback_method: restoreMethod,
    restore_target: previousStateKnown ? currentState : 'UNKNOWN', // nunca inventado
    previous_state: previousStateKnown ? currentState : 'UNKNOWN',
    rollback_validation: restoreMechanismKnown ? 'NEEDS_RUNTIME_VALIDATION' : 'NOT_APPLICABLE',
    rollback_status: status,
  };
}

module.exports = { buildRollbackContract, HALT_METHOD_BY_ACTION_TYPE, RESTORE_METHOD_BY_ACTION_TYPE, ROLLBACK_STATUSES };
