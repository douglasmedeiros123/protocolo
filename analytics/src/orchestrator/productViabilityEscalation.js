'use strict';

const { PRODUCT_VIABILITY_ESCALATION_STATES } = require('./enums');

// item 16 — impede experimentação infinita em produto ruim, MAS nunca conclui inviabilidade
// prematura. Consome Product Viability (planner) real, nunca inventa thresholds universais.
// Considera: hypothesis_space_explored, experiment_quality, economic_distance, evidence_
// accumulation, time/capital_consumed, learning_saturation, credible_remaining_paths.
function evaluateProductViabilityEscalation({ plannerPlan, switchGate, hypothesisSpaceStatus }) {
  const completedExperiments = switchGate.criteria.completed_experiments;
  const keyLevers = switchGate.criteria.key_levers_explored;

  // item 16 explícito: hoje existem 0 experimentos reais concluídos — nunca concluir inviável só pelo ROAS atual.
  if (completedExperiments.status === 'FAIL' && hypothesisSpaceStatus.status === 'LARGELY_UNEXPLORED') {
    return {
      escalation: 'CONTINUE_VALIDATION',
      reason: `${completedExperiments.reason} hypothesis_space_status=LARGELY_UNEXPLORED — espaço de hipóteses mal explorado E zero experimentos concluídos. Concluir inviabilidade agora seria prematuro (item 16), independente de profitability_state=${plannerPlan.current_state.profit_status.status} estar ruim — ROAS ruim hoje não prova produto inviável sem tentativa real.`,
      hypothesis_space_explored: 'LOW', experiment_quality: 'NOT_ASSESSABLE', economic_distance: plannerPlan.north_star.roas_gap_percent,
      evidence_accumulation: 'LOW', credible_remaining_paths: keyLevers.status === 'FAIL' ? 'YES — CREATIVE/CRO/OFFER ainda não testados' : 'UNKNOWN',
    };
  }

  if (switchGate.eligible) {
    return {
      escalation: 'SWITCH_PRODUCT',
      reason: `switch_gate.eligible=true — ${switchGate.reason} Todos os critérios estruturais mínimos (${switchGate.minimum_invalidation_evidence.description}) foram atendidos com evidência real.`,
      hypothesis_space_explored: 'HIGH', experiment_quality: 'CONFIRMED_VIA_GATE',
    };
  }

  return {
    escalation: 'CONTINUE_VALIDATION',
    reason: `switch_gate.eligible=false (${switchGate.fail_count} critério(s) reprovado(s), ${switchGate.unknown_count} desconhecido(s)) — nem inviabilidade nem confirmação suficientes ainda; continuar validando é a única conclusão defensável.`,
    hypothesis_space_explored: hypothesisSpaceStatus.status, credible_remaining_paths: 'sim, conforme switch_gate.criteria não atendidos.',
  };
}

module.exports = { evaluateProductViabilityEscalation, PRODUCT_VIABILITY_ESCALATION_STATES };
