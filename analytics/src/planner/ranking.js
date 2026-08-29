'use strict';

// item 59 — ordem EXATA de fatores pedida no spec, mesma disciplina de desempate determinístico
// do CRO/Offer (item 82: array order irrelevante, candidate_id nunca é evidência de mérito).
const TIE_BREAK_FACTOR_ORDER = [
  'decision_changing_evidence_rank', 'information_gain_rank', 'economic_impact_rank', 'confidence_rank',
  'cost_rank', 'capital_required_rank', 'dependency_rank', 'speed_to_evidence_rank', 'risk_rank', 'learning_value_rank',
];

// Tabelas documentadas por action_type — nunca escolhidas caso a caso pra favorecer uma ação.
const ACTION_TYPE_INFO_GAIN_RANK = { VALIDATE: 3, FIX: 3, MEASURE: 2, RUN_EXPERIMENT: 1, GENERATE_ASSET: 1, IMPLEMENT: 1, WAIT_FOR_DATA: 0, SCALE_CAPITAL: 0, REDUCE_CAPITAL: 0, HOLD_CAPITAL: 0, SWITCH_PRODUCT: 0, OTHER: 0 };
const ACTION_TYPE_LEARNING_VALUE_RANK = { VALIDATE: 2, FIX: 2, MEASURE: 2, RUN_EXPERIMENT: 2, GENERATE_ASSET: 1, IMPLEMENT: 1, WAIT_FOR_DATA: 0, SCALE_CAPITAL: 0, REDUCE_CAPITAL: 0, HOLD_CAPITAL: 0, SWITCH_PRODUCT: 0, OTHER: 0 };
const ACTION_TYPE_DEFAULT_RISK = { VALIDATE: 1, FIX: 1, MEASURE: 1, RUN_EXPERIMENT: 2, GENERATE_ASSET: 2, IMPLEMENT: 2, WAIT_FOR_DATA: 1, SCALE_CAPITAL: 3, REDUCE_CAPITAL: 1, HOLD_CAPITAL: 1, SWITCH_PRODUCT: 3, OTHER: 2 };

/**
 * computeTieBreakComponents() — deriva os 10 fatores do item 59 a partir dos campos reais da
 * ação (nunca de um valor de mérito escolhido à mão). "decision_changing_evidence" é derivado:
 * ações VALIDATE/FIX de custo ~0 resolvem incerteza decisiva antes de comprometer capital —
 * mesmo espírito do item 14.
 */
function computeTieBreakComponents(action) {
  const infoGainRank = ACTION_TYPE_INFO_GAIN_RANK[action.action_type] ?? 0;
  return {
    decision_changing_evidence_rank: infoGainRank >= 3 ? 1 : 0,
    information_gain_rank: infoGainRank,
    economic_impact_rank: 0, // sempre neutro — expected_economic_impact nunca é um número inventado (item 27/36)
    confidence_rank: action.confidence ?? 0,
    cost_rank: action.estimated_cost != null ? -action.estimated_cost : 0,
    capital_required_rank: action.capital_required != null ? -action.capital_required : 0,
    dependency_rank: -(action.dependency_ids ? action.dependency_ids.length : 0),
    speed_to_evidence_rank: action.speed_to_evidence_days != null ? -action.speed_to_evidence_days : 0,
    risk_rank: -(action.risk ?? ACTION_TYPE_DEFAULT_RISK[action.action_type] ?? 2),
    learning_value_rank: ACTION_TYPE_LEARNING_VALUE_RANK[action.action_type] ?? 0,
  };
}

function compareByTieBreak(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = (b.tie_break_components[factor] ?? 0) - (a.tie_break_components[factor] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0; // empate real em TODOS os fatores
}

function explainFactorWin(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = (b.tie_break_components[factor] ?? 0) - (a.tie_break_components[factor] ?? 0);
    if (diff !== 0) return factor;
  }
  return 'DECISION_TIE';
}

/**
 * rankStrategicActions() — item 82. READY primeiro que BLOCKED (não é um fator de mérito, é um
 * pré-requisito de execução — ações BLOCKED nunca aparecem à frente de uma READY no ranking).
 */
function rankStrategicActions(actions) {
  const withComponents = actions.map((a) => ({ ...a, tie_break_components: computeTieBreakComponents(a) }));
  const statusRank = { READY: 1, PLANNED: 0, BLOCKED: -1 };
  const sorted = [...withComponents].sort((a, b) => {
    const statusDiff = (statusRank[b.status] ?? -1) - (statusRank[a.status] ?? -1);
    if (statusDiff !== 0) return statusDiff;
    return compareByTieBreak(a, b);
  });

  const ranking = sorted.map((a, i) => ({ ...a, rank: i + 1 }));
  let decisionTie = false;
  const decisionTieIds = [];
  for (let i = 0; i < ranking.length - 1; i++) {
    if (ranking[i].status === ranking[i + 1].status && compareByTieBreak(ranking[i], ranking[i + 1]) === 0) {
      decisionTie = true;
      decisionTieIds.push(ranking[i].action_id, ranking[i + 1].action_id);
    }
  }
  for (const a of ranking) {
    a.final_rank_reason = ranking.indexOf(a) === 0 || ranking[ranking.indexOf(a) - 1].status !== a.status
      ? `topo do grupo de status ${a.status}.`
      : `venceu ${ranking[ranking.indexOf(a) - 1].action_id} no fator: ${explainFactorWin(a, ranking[ranking.indexOf(a) - 1])}` + (decisionTieIds.includes(a.action_id) ? ' — DECISION_TIE com o vizinho (todos os 10 fatores iguais).' : '.');
  }

  return { ranking, decision_tie: decisionTie, decision_tie_action_ids: [...new Set(decisionTieIds)], tie_break_factor_order: TIE_BREAK_FACTOR_ORDER };
}

module.exports = { rankStrategicActions, computeTieBreakComponents, compareByTieBreak, explainFactorWin, TIE_BREAK_FACTOR_ORDER, ACTION_TYPE_INFO_GAIN_RANK, ACTION_TYPE_LEARNING_VALUE_RANK, ACTION_TYPE_DEFAULT_RISK };
