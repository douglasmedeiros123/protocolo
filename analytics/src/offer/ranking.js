'use strict';

// TIE-BREAK DETERMINÍSTICO (PASSO 10, item 52 — mesmo padrão do CRO Agent, PASSO 9.1). Empate
// no priority_score NUNCA é resolvido por ordem do array ou candidate_id. Ordem de desempate,
// documentada e fixa:
//   1. priority_score  2. causal_strength  3. evidence_quality  4. confidence
//   5. implementation_cost_rank  6. information_gain_per_real  7. learning_value_rank  8. risk_rank
// Se todos os 8 empatarem de verdade: DECISION_TIE explícito.
const CAUSALITY_STRENGTH = { VALID: 2, WEAK: 1 };
const COST_RANK = { LOW: 3, MEDIUM: 2, HIGH: 1 };
const LEARNING_VALUE_RANK = { HIGH: 2, MEDIUM: 1, LOW: 0 };

const TIE_BREAK_FACTOR_ORDER = [
  'priority_score', 'causal_strength', 'evidence_quality', 'confidence',
  'implementation_cost_rank', 'information_gain_per_real', 'learning_value_rank', 'risk_rank',
];

function computeTieBreakComponents(candidate) {
  return {
    priority_score: candidate.priority_score ?? 0,
    causal_strength: CAUSALITY_STRENGTH[candidate.causality?.status] ?? 0,
    evidence_quality: (candidate.evidence_sources || []).length,
    confidence: candidate.confidence ?? 0,
    implementation_cost_rank: COST_RANK[candidate.implementation_cost] ?? 0,
    information_gain_per_real: candidate.information_gain_per_real ?? 0,
    learning_value_rank: LEARNING_VALUE_RANK[candidate.learning_value] ?? 0,
    risk_rank: -(candidate.risk ?? 0),
  };
}

function compareByTieBreak(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = b.tie_break_components[factor] - a.tie_break_components[factor];
    if (diff !== 0) return diff;
  }
  return 0;
}

function explainFactorWin(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = a.tie_break_components[factor] - b.tie_break_components[factor];
    if (diff !== 0) return { factor, a_value: a.tie_break_components[factor], b_value: b.tie_break_components[factor] };
  }
  return null;
}

function rankOfferCandidates(candidates) {
  const withComponents = candidates.map((c) => ({ ...c, tie_break_components: computeTieBreakComponents(c) }));

  const sorted = [...withComponents].sort((a, b) => {
    const tieBreakDiff = compareByTieBreak(a, b);
    if (tieBreakDiff !== 0) return tieBreakDiff;
    return a.candidate_id.localeCompare(b.candidate_id); // só ordena apresentação, nunca mérito
  });

  const ranking = sorted.map((c, i) => {
    const rank = i + 1;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const tiedWithPrev = prev ? compareByTieBreak(c, prev) === 0 : false;
    const tiedWithNext = next ? compareByTieBreak(c, next) === 0 : false;
    const isTie = tiedWithPrev || tiedWithNext;

    let final_rank_reason;
    if (rank === 1 && !tiedWithNext) {
      const win = next ? explainFactorWin(c, next) : null;
      final_rank_reason = win ? `Vence ${next.candidate_id} no fator "${win.factor}" (${win.a_value} vs ${win.b_value}).` : 'Único candidato — nenhuma comparação de desempate necessária.';
    } else if (isTie) {
      final_rank_reason = `DECISION_TIE — todos os ${TIE_BREAK_FACTOR_ORDER.length} fatores de desempate são idênticos entre os candidatos empatados. Ordem de apresentação por candidate_id, NÃO é evidência de mérito.`;
    } else {
      const better = sorted[rank - 2];
      const win = better ? explainFactorWin(better, c) : null;
      final_rank_reason = win ? `Perde de ${better.candidate_id} no fator "${win.factor}" (${win.b_value} vs ${win.a_value}).` : `Rank ${rank} determinado pelos fatores de desempate documentados.`;
    }

    return { ...c, rank, is_tie: isTie, final_rank_reason };
  });

  const topTieGroup = ranking.filter((c) => c.rank === 1 || (c.is_tie && compareByTieBreak(c, ranking[0]) === 0));
  const decisionTie = topTieGroup.length > 1;

  return {
    ranking,
    decision_tie: decisionTie,
    decision_tie_candidates: decisionTie ? topTieGroup.map((c) => c.candidate_id) : [],
    tie_break_factor_order: TIE_BREAK_FACTOR_ORDER,
  };
}

module.exports = { rankOfferCandidates, computeTieBreakComponents, compareByTieBreak, TIE_BREAK_FACTOR_ORDER, CAUSALITY_STRENGTH, COST_RANK, LEARNING_VALUE_RANK };
