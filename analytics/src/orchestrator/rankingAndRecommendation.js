'use strict';

const { NO_DEFENSIBLE_PREFERENCE } = require('./enums');
const { isCandidateExecutableNow } = require('./dependencyGraph');

// item 10-11 — ranking opinativo. Se alternativas forem comparáveis e houver evidência
// suficiente, o CEO DEVE recomendar — nunca terminar em "Douglas decide" sem uma opinião. Só
// NO_DEFENSIBLE_PREFERENCE quando REALMENTE incomparável (empate em todos os fatores de
// desempate documentados) — nesse caso, recomenda BEST_EVIDENCE_TO_COLLECT_NEXT.
const VOI_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_ASSESSABLE: 0 };
const CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_ASSESSABLE: 0 };
const RISK_RANK = { LOW: 3, MEDIUM: 2, HIGH: 1, CRITICAL: 0, UNKNOWN: 1 }; // menor risco rankeia melhor

// ordem de fatores de desempate, documentada — nunca escolhida caso a caso (mesmo padrão já
// usado em strategy-search/comparisonAndRanking.js e measurement/measurementDebt.js).
const TIE_BREAK_FACTOR_ORDER = ['dependency_unblocked', 'value_of_information', 'confidence', 'lower_capital_when_ev_unknown', 'risk'];

function compareCandidates(a, b, graph) {
  const aBlocked = !isCandidateExecutableNow(a, graph);
  const bBlocked = !isCandidateExecutableNow(b, graph);
  if (aBlocked !== bBlocked) return aBlocked ? 1 : -1; // item 9 — bloqueado sempre perde, mesmo com EV maior

  const voiDiff = (VOI_RANK[b.voi] ?? 0) - (VOI_RANK[a.voi] ?? 0);
  if (voiDiff !== 0) return voiDiff;

  const confDiff = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
  if (confDiff !== 0) return confDiff;

  // EV desconhecido em ambos -> prefere o de menor capital exigido (menos exposição pra mesma
  // informação) — nunca inventa EV pra desempatar.
  const aCapKnown = typeof a.capital_required === 'number';
  const bCapKnown = typeof b.capital_required === 'number';
  if (aCapKnown && bCapKnown && a.capital_required !== b.capital_required) return a.capital_required - b.capital_required;

  const riskDiff = (RISK_RANK[b.risk] ?? 1) - (RISK_RANK[a.risk] ?? 1);
  if (riskDiff !== 0) return riskDiff;

  return 0;
}

function isTrueTie(a, b, graph) { return compareCandidates(a, b, graph) === 0; }

/**
 * rankAndRecommend() — item 10-11. Nunca devolve só uma lista — sempre emite uma recomendação
 * opinativa (mesmo LOW confidence) OU, se realmente empatado, NO_DEFENSIBLE_PREFERENCE +
 * BEST_EVIDENCE_TO_COLLECT_NEXT.
 */
function rankAndRecommend(candidates, graph) {
  const ranked = [...candidates].sort((a, b) => compareCandidates(a, b, graph));
  const [top, runnerUp] = ranked;

  if (runnerUp && isTrueTie(top, runnerUp, graph)) {
    return {
      ranking: ranked, recommended_candidate_id: null, no_defensible_preference: true,
      best_evidence_to_collect_next: `${top.candidate_id} e ${runnerUp.candidate_id} empatam em todos os fatores de desempate documentados (${TIE_BREAK_FACTOR_ORDER.join(' -> ')}) — evidência que quebraria o empate: qualquer sinal real de VOI/confidence/risco diferenciado entre eles.`,
      reason: `${NO_DEFENSIBLE_PREFERENCE} — empate real, nunca forçado.`,
      tie_break_factor_order: TIE_BREAK_FACTOR_ORDER,
    };
  }

  const whyNotAlternatives = ranked.slice(1).map((c) => ({ candidate_id: c.candidate_id, why_not: isCandidateExecutableNow(c, graph) ? `perde pra ${top.candidate_id} nos fatores de desempate documentados (VOI/confidence/capital/risco).` : `bloqueado por dependência não resolvida ainda (ver dependency graph) — nunca escolhido antes de sua dependência real.` }));

  return {
    ranking: ranked, recommended_candidate_id: top.candidate_id, no_defensible_preference: false,
    rationale: `${top.candidate_id} (${top.action_class}, source=${top.source_agent}) vence por ${TIE_BREAK_FACTOR_ORDER.join(' -> ')} — ${top.hypothesis}`,
    confidence: top.confidence, // LOW confidence != no opinion — a recomendação existe de qualquer forma
    why_not_alternatives: whyNotAlternatives,
    tie_break_factor_order: TIE_BREAK_FACTOR_ORDER,
  };
}

module.exports = { rankAndRecommend, compareCandidates, isTrueTie, TIE_BREAK_FACTOR_ORDER, NO_DEFENSIBLE_PREFERENCE };
