'use strict';

// PASSO 18.5, item 11-14, 24 — nunca deixa o LLM segurar autoridade bruta. Fluxo obrigatório:
// LLM/CEO -> RECOMMENDATION -> ACTION CONTRACT -> POLICY ENGINE -> HUMAN APPROVAL WHEN REQUIRED
// -> EXECUTION ADAPTER -> EXTERNAL API -> VERIFY -> AUDIT LOG. credential capability != permission
// to execute (item 24) — ter o token nunca é suficiente, sempre precisa passar por este fluxo.
const MANDATORY_EXECUTION_FLOW = [
  'LLM_OR_CEO_RECOMMENDATION', 'ACTION_CONTRACT', 'POLICY_ENGINE', 'HUMAN_APPROVAL_WHEN_REQUIRED',
  'EXECUTION_ADAPTER', 'EXTERNAL_API', 'VERIFY', 'AUDIT_LOG',
];

// item 14 — capital protection. Autoridade incremental da MVA é sempre zero até aprovação
// humana específica — condições de mídia PRÉ-EXISTENTES podem continuar existindo (não são
// "gasto novo"), mas qualquer AUMENTO precisa de aprovação explícita.
const MVA_INCREMENTAL_BUDGET_AUTHORITY = 0;

function buildBudgetChangeProposal({ currentDailyBudget, proposedDailyBudget }) {
  const incrementalDailyCapital = proposedDailyBudget - currentDailyBudget;
  return {
    current_daily_budget: currentDailyBudget,
    proposed_daily_budget: proposedDailyBudget,
    incremental_daily_capital: incrementalDailyCapital,
    mva_incremental_budget_authority: MVA_INCREMENTAL_BUDGET_AUTHORITY,
    can_execute_autonomously: incrementalDailyCapital <= MVA_INCREMENTAL_BUDGET_AUTHORITY, // nunca true pra aumento real
    note: 'MVA_INCREMENTAL_BUDGET_AUTHORITY=R$0 nunca significa que a mídia pré-existente tem custo zero — só que nenhum AUMENTO incremental está autorizado sem aprovação humana explícita (item 14).',
  };
}

// item 12-13 — semântica de aprovação: específica por ação, bounded, e SEMPRE revalidada contra
// o estado atual antes de executar (nunca confia numa aprovação antiga sem reconferir).
const APPROVAL_CONFIRMATION_PATTERNS = [/\baprovado\b/i, /\bpode executar\b/i, /\bsiga\b/i];

function isApprovalConfirmation(message) {
  return APPROVAL_CONFIRMATION_PATTERNS.some((p) => p.test(message || ''));
}

/**
 * evaluateApprovalForAction() — item 12. Uma aprovação só é válida se: (a) referencia
 * explicitamente o action_id certo, (b) o estado atual da plataforma bate com o que foi proposto
 * (item 13 — stale approval protection), nunca genérico/transferível pra outra ação.
 */
function evaluateApprovalForAction({ actionId, approvalMessage, approvalReferencesActionId, currentPlatformState, stateAtProposalTime }) {
  if (!isApprovalConfirmation(approvalMessage)) {
    return { approved: false, reason: 'mensagem não contém confirmação de aprovação reconhecida.' };
  }
  if (approvalReferencesActionId !== actionId) {
    return { approved: false, reason: `aprovação não referencia este action_id específico (${actionId}) — nunca transferível entre ações (item 12).` };
  }
  const stateChanged = JSON.stringify(currentPlatformState) !== JSON.stringify(stateAtProposalTime);
  if (stateChanged) {
    return { approved: false, reason: 'APPROVAL_STALE_STATE_CHANGED', detail: 'o estado real da plataforma mudou desde a proposta original — nunca executa em cima de uma aprovação desatualizada (item 13). Gerar nova recomendação.' };
  }
  return { approved: true, action_id: actionId, reason: 'aprovação específica, bounded, e estado revalidado — condições satisfeitas.' };
}

// item 27 — verificação pós-execução (documentado aqui pra uso futuro; nenhuma execução real
// ocorre neste PASSO). Nunca assume sucesso só pelo HTTP 200.
function verifyExecutionOutcome({ expectedState, actualState }) {
  const matches = JSON.stringify(expectedState) === JSON.stringify(actualState);
  return { verified: matches, status: matches ? 'EXECUTION_VERIFIED' : 'EXECUTION_VERIFICATION_FAILED', expectedState, actualState };
}

module.exports = {
  MANDATORY_EXECUTION_FLOW, MVA_INCREMENTAL_BUDGET_AUTHORITY, buildBudgetChangeProposal,
  isApprovalConfirmation, evaluateApprovalForAction, verifyExecutionOutcome,
};
