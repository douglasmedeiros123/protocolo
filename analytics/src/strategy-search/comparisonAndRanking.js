'use strict';

// item 60 — ordem EXATA dos 14 fatores pedidos no spec. Mesma disciplina de desempate
// determinístico do resto do projeto (offer/cro/planner ranking.js) — nunca aleatório, nunca
// ajustado caso a caso pra "parecer certo".
const TIE_BREAK_FACTOR_ORDER = [
  'decision_relevance_rank', 'product_specific_evidence_rank', 'economic_relevance_rank', 'causal_plausibility_rank',
  'information_gain_rank', 'strategic_diversification_rank', 'implementation_cost_rank', 'measurement_capital_rank',
  'tracking_readiness_rank', 'reversibility_rank', 'risk_rank', 'automation_fitness_rank', 'scale_potential_rank', 'prior_learning_rank',
];

// item 61 — custo NUNCA domina: implementation_cost_rank e measurement_capital_rank ocupam as
// posições 7-8 de 14, nunca as primeiras. item 62 — sofisticação nunca domina: não existe fator
// "sophistication" nenhum na lista — a família/padrão em si nunca entra como critério de mérito.
// PASSO 12.1, item 9 — "MISSING" é gatilho de hipótese, não prova de upside: nunca no mesmo
// patamar do gap econômico central (economic_gap). Reduzido pra nível 2, empatado com sinais
// estruturais reais (existing_signals/conversion_friction) — nunca supervalorizado só por
// existir uma lacuna.
const REASON_DECISION_RELEVANCE_RANK = { economic_gap: 3, 'economic_gap+customer_journey': 3, missing_monetization: 2, existing_signals: 2, conversion_friction: 2, strategic_diversification: 1 };
const MECHANISM_ECONOMIC_RELEVANCE_RANK = { INCREASE_AOV: 3, REDUCE_CPA: 3, INCREASE_LTV: 2, REDUCE_FRICTION: 2, INCREASE_COMPREHENSION: 2, INCREASE_TRUST: 2, IMPROVE_MESSAGE_MATCH: 2, IMPROVE_QUALIFICATION: 1, OTHER: 0 };
const DISTANCE_CAUSAL_PLAUSIBILITY_RANK = { LOW: 3, MEDIUM: 2, HIGH: 1, RADICAL: 0 };
const TRACKING_READINESS_RANK = { READY: 3, PARTIAL: 2, NOT_READY: 1, UNKNOWN: 0 };
const REVERSIBILITY_RANK = { REVERSIBLE: 3, PARTIALLY_REVERSIBLE: 2, HARD_TO_REVERSE: 1 };
const AUTOMATION_FITNESS_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const FITNESS_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

/**
 * computeComparisonDimensions() — item 31. Deriva os 14 fatores de propriedades REAIS já
 * calculadas do candidato (distance/reversibility/tracking/automation/scale/evidence_basis) —
 * nunca um score escolhido a dedo por candidato.
 */
function computeComparisonDimensions(candidate) {
  const evidenceBasis = candidate.evidence_basis || [];
  const productSpecificCount = evidenceBasis.filter((e) => e.type === 'PRODUCT_SPECIFIC_EVIDENCE' || e.type === 'OBSERVED_EVIDENCE').length;

  return {
    decision_relevance_rank: candidate.is_current ? 2 : (REASON_DECISION_RELEVANCE_RANK[candidate.why_generated && candidate.why_generated.reason] ?? 1),
    product_specific_evidence_rank: Math.min(productSpecificCount, 3),
    economic_relevance_rank: MECHANISM_ECONOMIC_RELEVANCE_RANK[candidate.primary_mechanism] ?? 0,
    causal_plausibility_rank: candidate.is_current ? 1 : (DISTANCE_CAUSAL_PLAUSIBILITY_RANK[candidate.distance] ?? 0), // item 8 — atual não ganha bônus: 0 experimentos concluídos = entendimento causal baixo também pra ela
    information_gain_rank: candidate.is_current ? 1 : (TRACKING_READINESS_RANK[candidate.tracking_readiness] ?? 0),
    strategic_diversification_rank: candidate.strategic_diversification_value ? 1 : 0,
    implementation_cost_rank: candidate.is_current ? 3 : 0, // item 63 — vantagem REAL, mas só nesta dimensão
    measurement_capital_rank: candidate.is_current ? 3 : 0, // idem — nunca inventamos que o challenger é barato (item 21)
    tracking_readiness_rank: TRACKING_READINESS_RANK[candidate.tracking_readiness] ?? 0,
    reversibility_rank: candidate.is_current ? 3 : (REVERSIBILITY_RANK[candidate.reversibility] ?? 0),
    risk_rank: candidate.is_current ? 3 : (REVERSIBILITY_RANK[candidate.reversibility] ?? 0), // sem risco quantificado real, reusa reversibilidade como proxy documentado (menos reversível = mais arriscado)
    automation_fitness_rank: AUTOMATION_FITNESS_RANK[candidate.automation_fitness] ?? 0,
    scale_potential_rank: FITNESS_RANK[candidate.scale_fitness] ?? 0, // item 51 — nunca HIGH sem evidência; hoje sempre UNKNOWN=0 pra todo mundo
    prior_learning_rank: 0, // item 82 — memória de arquitetura ainda vazia hoje (0 experimentos concluídos)
  };
}

function compareByTieBreak(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = (b.comparison_dimensions[factor] ?? 0) - (a.comparison_dimensions[factor] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function explainFactorWin(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = (b.comparison_dimensions[factor] ?? 0) - (a.comparison_dimensions[factor] ?? 0);
    if (diff !== 0) return factor;
  }
  return 'DECISION_TIE';
}

/**
 * rankArchitectures() — item 32: ranking interno pode usar score, mas a saída NUNCA vira falsa
 * precisão numérica (ex.: "83.472%") — confidence permanece qualitativa (confidenceEngine.js).
 */
function rankArchitectures(candidates) {
  const withDimensions = candidates.map((c) => ({ ...c, comparison_dimensions: computeComparisonDimensions(c) }));
  const sorted = [...withDimensions].sort(compareByTieBreak);
  const ranking = sorted.map((c, i) => ({ ...c, rank: i + 1 }));

  let decisionTie = false;
  const decisionTieIds = [];
  for (let i = 0; i < ranking.length - 1; i++) {
    if (compareByTieBreak(ranking[i], ranking[i + 1]) === 0) {
      decisionTie = true;
      decisionTieIds.push(ranking[i].architecture_id, ranking[i + 1].architecture_id);
    }
  }
  for (let i = 0; i < ranking.length; i++) {
    ranking[i].final_rank_reason = i === 0 ? 'topo do ranking.' : `venceu ${ranking[i - 1].architecture_id} no fator: ${explainFactorWin(ranking[i], ranking[i - 1])}` + (decisionTieIds.includes(ranking[i].architecture_id) && decisionTieIds.includes(ranking[i - 1].architecture_id) ? ' — DECISION_TIE com o vizinho (todos os 14 fatores iguais).' : '.');
  }

  return { ranking, decision_tie: decisionTie, decision_tie_architecture_ids: [...new Set(decisionTieIds)], tie_break_factor_order: TIE_BREAK_FACTOR_ORDER };
}

module.exports = { rankArchitectures, computeComparisonDimensions, compareByTieBreak, explainFactorWin, TIE_BREAK_FACTOR_ORDER };
