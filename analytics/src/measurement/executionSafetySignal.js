'use strict';

// PASSO 13.1, item 12 — sinal read-only pra uma futura Policy Engine (PASSO 14), sem implementar
// nenhuma execução aqui. O Measurement Agent FORNECE o sinal; nunca executa freeze/bloqueio
// diretamente (item 13: LLM recommendation != execution authority).
const CAPITAL_ACTIONS = ['NO_RESTRICTION', 'CAUTION', 'BLOCK_DEPENDENT_ACTION', 'GLOBAL_FREEZE'];
const SIGNAL_SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL'];

/**
 * buildExecutionSafetySignal() — item 12. GLOBAL_FREEZE só quando a própria fonte financeira
 * canônica está comprometida (condição excepcional e explícita) — nunca por causa do capital
 * gate de um único subject/experimento, que no máximo bloqueia AÇÕES DEPENDENTES dele
 * (BLOCK_DEPENDENT_ACTION), nunca tudo.
 */
function buildExecutionSafetySignal({ subjectId, financialTruthHealth, capitalGate }) {
  if (financialTruthHealth && financialTruthHealth.status === 'BLOCKED') {
    return {
      severity: 'CRITICAL',
      affected_scope: 'ALL_CAPITAL_DECISIONS',
      affected_decision_types: ['ANY decisão que dependa de receita/lucro real'],
      capital_action: 'GLOBAL_FREEZE', // condição excepcional e explícita — só aqui
      reason: `a própria fonte financeira canônica (Hotmart) está comprometida: ${financialTruthHealth.reason}`,
      requires_human_review: true,
      resolution_condition: 'nenhuma ocorrência de código bloqueante (MISSING_DATA-hotmart/NEGATIVE_OR_IMPOSSIBLE_REVENUE/DUPLICATE_TRANSACTION) por um novo período completo de coleta.',
      note: 'sinal read-only — este Agent não executa o freeze, só o sinaliza pra revisão humana ou futura Policy Engine (item 13).',
    };
  }

  if (!capitalGate || capitalGate.state === 'READY_FOR_CAPITAL') {
    return {
      severity: 'NORMAL', affected_scope: subjectId || 'UNKNOWN', affected_decision_types: [], capital_action: 'NO_RESTRICTION',
      reason: 'nenhum blocker de mensuração ativo pra este subject.', requires_human_review: false, resolution_condition: null,
      note: 'sinal read-only.',
    };
  }

  if (capitalGate.state === 'BLOCKED_BY_MEASUREMENT') {
    return {
      severity: 'CRITICAL', affected_scope: subjectId || 'UNKNOWN', affected_decision_types: [`decisões de capital sobre ${subjectId || 'este subject'}`],
      capital_action: 'BLOCK_DEPENDENT_ACTION', // nunca GLOBAL_FREEZE por um único subject
      reason: capitalGate.reason, requires_human_review: true, resolution_condition: capitalGate.next_unlock || 'resolver o blocker atual reportado pelo capital gate.',
      note: 'sinal read-only — bloqueia só as ações que dependem deste subject específico, nunca capital globalmente (item 8: ANOMALY_SCOPE != GLOBAL_BLOCK).',
    };
  }

  // NEEDS_TRACKING_IMPLEMENTATION / NEEDS_TRACKING_VALIDATION / NEEDS_RECONCILIATION / UNKNOWN
  return {
    severity: 'WARNING', affected_scope: subjectId || 'UNKNOWN', affected_decision_types: [`decisões de capital sobre ${subjectId || 'este subject'}`],
    capital_action: 'CAUTION', reason: capitalGate.reason, requires_human_review: false,
    resolution_condition: capitalGate.next_unlock || 'ver capital_gate.current_blocker.',
    note: 'sinal read-only — reduz confiança, não bloqueia; decisão humana permanece livre pra prosseguir com a ressalva registrada.',
  };
}

module.exports = { buildExecutionSafetySignal, CAPITAL_ACTIONS, SIGNAL_SEVERITIES };
