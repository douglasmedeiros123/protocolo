'use strict';

// TIE-BREAK DETERMINÍSTICO (PASSO 9.1, itens 1-2) — empate no priority_score NUNCA é resolvido
// implicitamente por ordem do array, ordem de criação ou candidate_id. A ordem de desempate,
// documentada e fixa (mesma pra todo rebuild, nunca escolhida por candidato):
//
//   1. priority_score            (já existente — impacto/confiança/custo/velocidade/risco)
//   2. causal_strength           (VALID > WEAK — reflete o próprio gate de causalidade)
//   3. evidence_quality          (quantidade de fontes de evidência REAIS e independentes citadas)
//   4. confidence                (confidence ajustada do candidato)
//   5. implementation_cost_rank  (LOW > MEDIUM > HIGH — custo menor vence em empate)
//   6. information_gain_per_real (quanto se aprende por real ANTES de gastar em experimento)
//   7. learning_value_rank       (HIGH > MEDIUM > LOW)
//   8. risk_rank                 (risco menor vence)
//
// Se TODOS os 8 fatores empatarem de verdade, a decisão é DECISION_TIE — candidate_id só ordena
// a APRESENTAÇÃO (pra sempre mostrar na mesma ordem), nunca é usado como evidência de mérito.
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
    risk_rank: -(candidate.risk ?? 0), // menor risco = melhor; inverte o sinal pra "maior é sempre melhor" em todos os fatores
  };
}

/** Compara 2 candidatos JÁ com tie_break_components computados. >0 = a vem depois de b (b melhor). */
function compareByTieBreak(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = b.tie_break_components[factor] - a.tie_break_components[factor];
    if (diff !== 0) return diff;
  }
  return 0; // TODOS os fatores empataram — empate real
}

function explainFactorWin(a, b) {
  for (const factor of TIE_BREAK_FACTOR_ORDER) {
    const diff = a.tie_break_components[factor] - b.tie_break_components[factor];
    if (diff !== 0) return { factor, a_value: a.tie_break_components[factor], b_value: b.tie_break_components[factor] };
  }
  return null;
}

/**
 * rankCroCandidates() (PASSO 9.1, item 8) — recalcula o ranking com tie-break explícito.
 * candidate_id só decide a ORDEM DE APRESENTAÇÃO dentro de um grupo com tie_break_components
 * idênticos (nunca é tratado como "evidência" de que um candidato é melhor).
 */
function rankCroCandidates(candidates) {
  const withComponents = candidates.map((c) => ({ ...c, tie_break_components: computeTieBreakComponents(c) }));

  // Ordena por tie-break; dentro de grupos 100% empatados, ordena por candidate_id só pra ter
  // uma apresentação estável e determinística (nunca como critério de mérito).
  const sorted = [...withComponents].sort((a, b) => {
    const tieBreakDiff = compareByTieBreak(a, b);
    if (tieBreakDiff !== 0) return tieBreakDiff;
    return a.candidate_id.localeCompare(b.candidate_id);
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
      const runnerUp = next;
      final_rank_reason = runnerUp
        ? (() => {
          const win = explainFactorWin(c, runnerUp);
          return win
            ? `Vence ${runnerUp.candidate_id} no fator "${win.factor}" (${win.a_value} vs ${win.b_value}).`
            : `Único candidato — nenhuma comparação de desempate necessária.`;
        })()
        : 'Único candidato — nenhuma comparação de desempate necessária.';
    } else if (isTie) {
      final_rank_reason = `DECISION_TIE com ${[prev, c, next].filter((x) => x && x.candidate_id !== c.candidate_id).map((x) => x.candidate_id).join(', ') || 'outro candidato'} — todos os ${TIE_BREAK_FACTOR_ORDER.length} fatores de desempate são idênticos. Ordem de apresentação por candidate_id, NÃO é evidência de que um é melhor.`;
    } else {
      const better = sorted[rank - 2]; // o de rank anterior
      const win = better ? explainFactorWin(better, c) : null;
      final_rank_reason = win
        ? `Perde de ${better.candidate_id} no fator "${win.factor}" (${win.b_value} vs ${win.a_value}).`
        : `Rank ${rank} determinado pelos fatores de desempate documentados.`;
    }

    return { ...c, rank, is_tie: isTie, final_rank_reason };
  });

  const topScore = ranking[0]?.priority_score;
  const topTieGroup = ranking.filter((c) => c.rank === 1 || (c.is_tie && compareByTieBreak(c, ranking[0]) === 0));
  const decisionTie = topTieGroup.length > 1;

  return {
    ranking,
    decision_tie: decisionTie,
    decision_tie_candidates: decisionTie ? topTieGroup.map((c) => c.candidate_id) : [],
    tie_break_factor_order: TIE_BREAK_FACTOR_ORDER,
  };
}

module.exports = { rankCroCandidates, computeTieBreakComponents, compareByTieBreak, TIE_BREAK_FACTOR_ORDER, CAUSALITY_STRENGTH, COST_RANK, LEARNING_VALUE_RANK };
