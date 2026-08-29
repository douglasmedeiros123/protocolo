'use strict';

// PASSO 14A.1, item 7 — um rollback verdadeiro (ROLLBACK_SUPPORTED, nunca declarado hoje) exige
// esta estrutura completa: previous_state/restore_method/restore_target/restore_attempt/
// restore_validation/validated_restored_state/rollback_status. UNKNOWN != RESTORABLE — nunca
// inventa previous_state nem assume que a restauração funcionou sem validação real.
function buildRollbackVerification({ previousState, restoreMethod, restoreAttempted = false, restoreResult = null, validatedRestoredState = null }) {
  const previousStateKnown = previousState != null && previousState !== 'UNKNOWN';
  if (!previousStateKnown) {
    return {
      previous_state: 'UNKNOWN', restore_method: restoreMethod || null, restore_target: 'UNKNOWN',
      restore_attempt: 'NOT_ATTEMPTED', restore_validation: 'NOT_APPLICABLE', validated_restored_state: null,
      rollback_status: 'NOT_SUPPORTED', reason: 'previous_state é UNKNOWN — UNKNOWN != RESTORABLE (item 7), nunca inventado pra permitir rollback.',
    };
  }
  if (!restoreMethod) {
    return {
      previous_state: previousState, restore_method: null, restore_target: previousState,
      restore_attempt: 'NOT_ATTEMPTED', restore_validation: 'NOT_APPLICABLE', validated_restored_state: null,
      rollback_status: 'HALT_ONLY', reason: 'nenhum método de restauração real conhecido pra este action_type — no máximo HALT_ONLY.',
    };
  }
  if (!restoreAttempted) {
    return {
      previous_state: previousState, restore_method: restoreMethod, restore_target: previousState,
      restore_attempt: 'NOT_ATTEMPTED', restore_validation: 'NOT_APPLICABLE', validated_restored_state: null,
      rollback_status: 'ROLLBACK_UNVERIFIED', reason: 'método conhecido, mas nenhuma tentativa real de restauração foi feita (e nunca será, nesta arquitetura SAFE_MODE/DRY_RUN) — nunca SUPPORTED sem validação real.',
    };
  }
  // inalcançável nesta arquitetura (nenhuma execução real acontece), mas a lógica fica correta
  // e testável pra quando um Execution Adapter real existir no futuro.
  const validated = restoreResult === 'SUCCESS' && validatedRestoredState != null && JSON.stringify(validatedRestoredState) === JSON.stringify(previousState);
  return {
    previous_state: previousState, restore_method: restoreMethod, restore_target: previousState,
    restore_attempt: 'ATTEMPTED', restore_validation: validated ? 'VALIDATED' : 'FAILED_VALIDATION',
    validated_restored_state: validatedRestoredState, rollback_status: validated ? 'ROLLBACK_SUPPORTED' : 'ROLLBACK_UNVERIFIED',
    reason: validated ? 'estado restaurado e validado como idêntico ao previous_state real.' : 'restauração tentada, mas validação não confirmou o estado esperado — nunca declarado SUPPORTED sem essa confirmação.',
  };
}

module.exports = { buildRollbackVerification };
