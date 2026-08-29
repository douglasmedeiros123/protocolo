'use strict';

/**
 * computeCapitalPosture() — PASSO 11.1, item 6. Separado do verdict: permite
 * CONTINUE_VALIDATION + SELECTIVE (algumas ações prosseguem, outras ficam bloqueadas por
 * tracking específico) em vez de um HOLD binário pra tudo.
 */
function computeCapitalPosture({ financialTruthStatus, actions, scaleGateStatus }) {
  if (financialTruthStatus === 'BLOCKED') {
    return { posture: 'HOLD', reason: 'FINANCIAL_TRUTH=BLOCKED — a própria fonte de verdade financeira está comprometida, nenhuma decisão de capital pode se apoiar em número nenhum.' };
  }
  if (scaleGateStatus === 'ELIGIBLE_FOR_SCALE') {
    return { posture: 'SCALE', reason: 'scale gate elegível e FINANCIAL_TRUTH íntegra — capital pode fluir pra escala.' };
  }

  const readyActions = actions.filter((a) => a.status === 'READY');
  const trackingBlockedActions = actions.filter((a) => a.status === 'BLOCKED' && a.tracking_eligibility && a.tracking_eligibility.eligible === false);

  if (readyActions.length === 0) {
    return { posture: 'HOLD', reason: 'nenhuma ação READY disponível no momento — capital aguarda a próxima evidência.' };
  }
  if (trackingBlockedActions.length > 0) {
    return {
      posture: 'SELECTIVE',
      reason: `${trackingBlockedActions.length} ação(ões) bloqueada(s) por escopo de tracking específico (${[...new Set(trackingBlockedActions.map((a) => a.tracking_eligibility.required_tracking_scope))].join(', ')}), mas ${readyActions.length} ação(ões) livre(s) dessa dependência seguem READY.`,
    };
  }
  return { posture: 'OPEN', reason: `${readyActions.length} ação(ões) READY, nenhum blocker de tracking amplo — capital pode fluir pras ações priorizadas normalmente (ainda sujeito ao switch/scale gate pra decisões maiores).` };
}

module.exports = { computeCapitalPosture };
