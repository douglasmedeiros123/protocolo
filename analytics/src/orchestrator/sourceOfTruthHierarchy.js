'use strict';

const { SOURCE_OF_TRUTH_LEVELS } = require('./enums');

// item 3 — hierarquia de fonte de verdade + resolução de conflito. NUNCA votação por maioria —
// avaliação sempre por source_authority/evidence_quality/scope/freshness/confidence/
// causal_strength/dependency.
const LEVEL_RANK = Object.fromEntries(SOURCE_OF_TRUTH_LEVELS.map((l, i) => [l, i]));

function classifySourceLevel(claim) {
  // claim.origin_domain vem de quem gerou a alegação — mapeamento documentado, nunca caso a caso.
  const map = {
    HOTMART: 'FINANCIAL_TRANSACTION_TRUTH', FINANCIAL_TRUTH: 'FINANCIAL_TRANSACTION_TRUTH',
    MEASUREMENT_FINANCIAL_TRUTH: 'FINANCIAL_TRANSACTION_TRUTH', // Measurement audita Hotmart diretamente pra essa claim específica (PASSO 13.1) — não é inferência, é leitura direta de BLOCKING_CODES sobre a própria fonte.
    META_PLATFORM: 'PLATFORM_TRUTH', GTM_PLATFORM: 'PLATFORM_TRUTH', MEASUREMENT_PLATFORM_ATTRIBUTION: 'PLATFORM_TRUTH',
    CLARITY: 'BEHAVIORAL_TRUTH', WEB_BEHAVIOR: 'BEHAVIORAL_TRUTH', MEASUREMENT_WEB_BEHAVIOR: 'BEHAVIORAL_TRUTH',
    STRATEGY_SEARCH: 'STRATEGIC_INFERENCE', PLANNER: 'STRATEGIC_INFERENCE', PLANNER_TRACKING_ASSESSMENT: 'STRATEGIC_INFERENCE', DECISION: 'STRATEGIC_INFERENCE',
    CREATIVE: 'STRATEGIC_INFERENCE', CRO: 'STRATEGIC_INFERENCE', OFFER: 'STRATEGIC_INFERENCE',
  };
  return map[claim.origin_domain] || 'HYPOTHESIS'; // desconhecido nunca vira algo mais forte que HYPOTHESIS
}

/**
 * resolveConflict() — item 3. Compara 2+ alegações conflitantes SEM votação — usa a hierarquia
 * como primeiro critério, e dentro do mesmo nível usa evidence_quality/scope/freshness/
 * confidence/causal_strength/dependency, nesta ordem, documentada.
 */
const TIE_BREAK_ORDER = ['source_authority', 'evidence_quality', 'scope', 'freshness', 'confidence', 'causal_strength', 'dependency'];
const QUALITATIVE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_ASSESSABLE: 0, UNKNOWN: 0 };

function resolveConflict(claims) {
  if (!claims || claims.length === 0) return { winner: null, reason: 'nenhuma alegação fornecida.' };
  const scored = claims.map((c) => ({ ...c, source_level: classifySourceLevel(c), source_authority_rank: LEVEL_RANK[classifySourceLevel(c)] }));

  scored.sort((a, b) => {
    if (a.source_authority_rank !== b.source_authority_rank) return a.source_authority_rank - b.source_authority_rank; // menor índice = mais forte
    for (const factor of TIE_BREAK_ORDER.slice(1)) {
      const av = QUALITATIVE_RANK[a[factor]] ?? 0;
      const bv = QUALITATIVE_RANK[b[factor]] ?? 0;
      if (av !== bv) return bv - av;
    }
    return 0;
  });

  const winner = scored[0];
  const isTrueTie = scored.length > 1 && TIE_BREAK_ORDER.every((f) => (f === 'source_authority' ? scored[0].source_authority_rank === scored[1].source_authority_rank : (QUALITATIVE_RANK[scored[0][f]] ?? 0) === (QUALITATIVE_RANK[scored[1][f]] ?? 0)));

  return {
    winner: isTrueTie ? null : winner,
    is_true_tie: isTrueTie,
    ranked: scored,
    tie_break_factor_order: TIE_BREAK_ORDER,
    reason: isTrueTie
      ? 'empate real em todos os fatores de desempate documentados — nunca resolvido por votação.'
      : `${winner.origin_domain} (nível ${winner.source_level}) prevalece — hierarquia de fonte de verdade, nunca votação por maioria.`,
  };
}

module.exports = { SOURCE_OF_TRUTH_LEVELS, LEVEL_RANK, classifySourceLevel, resolveConflict, TIE_BREAK_ORDER };
