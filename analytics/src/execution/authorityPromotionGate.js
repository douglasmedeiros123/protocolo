'use strict';

const { PROMOTION_GATE_RESULTS } = require('./enums');

// PASSO 14B, item 4-5 — AUTHORITY_PROMOTION_GATE / AUTHORITY_DEMOTION_GATE. Autonomia financeira
// cresce por EVIDÊNCIA histórica real, nunca por decisão da própria LLM (mesmo princípio de
// selfModificationProtection.js — trocar de tier é um domínio protegido). Promoção é sempre mais
// conservadora que demoção: demoção pode ser automática (Policy Engine/Circuit Breaker),
// promoção NUNCA é automática — sempre exige revisão/decisão externa mesmo quando os critérios
// são atendidos (ELIGIBLE_FOR_REVIEW, nunca PROMOTE direto pela máquina).
const PROMOTION_EVIDENCE_KEYS = [
  'completed_experiments', 'financially_reconciled_experiments', 'decision_accuracy', 'policy_violation_rate',
  'rollback_success_rate', 'anomaly_rate', 'financial_truth_health', 'loss_containment',
  'positive_expected_value_evidence', 'confidence_calibration', 'execution_reliability',
];

/**
 * evaluatePromotionGate() — item 4. Nunca promove a partir de UMA observação vencedora (item
 * "promotion cannot occur from one winning observation") — exige volume mínimo de evidência
 * antes até de virar ELIGIBLE_FOR_REVIEW. Mesmo elegível, o resultado é ELIGIBLE_FOR_REVIEW,
 * NUNCA PROMOTE direto — promoção real exige uma decisão externa que não é feita aqui.
 */
function evaluatePromotionGate({ evidence = {} }) {
  const missing = PROMOTION_EVIDENCE_KEYS.filter((k) => evidence[k] === undefined || evidence[k] === null || evidence[k] === 'UNKNOWN');
  if (missing.length > 0) {
    return { result: 'NOT_READY', reason: `evidência incompleta pra avaliar promoção: ${missing.join(', ')} não fornecida — nunca promove sem o quadro completo.`, missing_evidence: missing };
  }
  if (evidence.completed_experiments < 3) {
    return { result: 'NOT_READY', reason: `apenas ${evidence.completed_experiments} experimento(s) concluído(s) — mínimo estrutural de 3 antes de considerar qualquer promoção (nunca promove por uma única observação vencedora, item 4).`, missing_evidence: [] };
  }
  if (evidence.financial_truth_health !== 'RELIABLE') {
    return { result: 'HOLD', reason: `financial_truth_health=${evidence.financial_truth_health} — promoção nunca considerada enquanto a fonte financeira não está RELIABLE.`, missing_evidence: [] };
  }
  const strongEvidence = evidence.financially_reconciled_experiments >= 3
    && evidence.decision_accuracy >= 0.7
    && evidence.policy_violation_rate === 0
    && evidence.rollback_success_rate >= 0.9
    && evidence.loss_containment === true
    && evidence.execution_reliability >= 0.9;

  if (strongEvidence) {
    return { result: 'ELIGIBLE_FOR_REVIEW', reason: 'critérios estruturais de evidência atendidos — elegível pra REVISÃO EXTERNA (nunca promovido automaticamente pela própria máquina).', missing_evidence: [] };
  }
  return { result: 'HOLD', reason: 'evidência parcial, mas não atende todos os critérios estruturais de promoção ainda — mantém tier atual.', missing_evidence: [] };
}

// item 5 — demoção pode ser automática (Policy Engine/Circuit Breaker já implementam boa parte
// disso via GLOBAL_FREEZE/FREEZE_SCOPE) — aqui formalizamos os triggers específicos de autoridade.
const DEMOTION_TRIGGERS = [
  'repeated_losses', 'policy_violations', 'unexpected_spend', 'reconciliation_deterioration',
  'financial_truth_blocked', 'execution_errors', 'anomaly_escalation', 'bad_confidence_calibration',
  'rollback_failure', 'action_storm', 'material_negative_deviation',
];

function evaluateDemotionGate({ signals = {} }) {
  const active = DEMOTION_TRIGGERS.filter((t) => signals[t] === true);
  if (active.length === 0) return { result: 'HOLD', reason: 'nenhum trigger de demoção ativo.', active_triggers: [] };
  // financial_truth_blocked e action_storm são graves o suficiente sozinhos (mesmo padrão do
  // circuit breaker: alguns triggers bastam isolados, outros precisam se combinar).
  const severeAlone = ['financial_truth_blocked', 'action_storm', 'execution_errors'];
  const severe = active.filter((t) => severeAlone.includes(t));
  if (severe.length > 0 || active.length >= 2) {
    return { result: 'DEMOTE', reason: `trigger(s) de demoção ativo(s): ${active.join(', ')} — demoção automática, pode ser aplicada pela Policy Engine/Circuit Breaker sem revisão externa prévia (nunca o mesmo padrão conservador da promoção).`, active_triggers: active };
  }
  return { result: 'HOLD', reason: `1 trigger isolado não-severo (${active[0]}) — monitorado, ainda não demove sozinho.`, active_triggers: active };
}

module.exports = { evaluatePromotionGate, evaluateDemotionGate, PROMOTION_EVIDENCE_KEYS, DEMOTION_TRIGGERS, PROMOTION_GATE_RESULTS };
