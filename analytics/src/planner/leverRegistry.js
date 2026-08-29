'use strict';

const { LEVER_TYPES } = require('./enums');
const { COMPLETED_STATUSES } = require('./experimentCoverage');

const AGENT_COVERED_LEVERS = ['CREATIVE', 'CRO', 'OFFER', 'MEDIA_BUYING'];
const NOT_YET_COVERED_LEVERS = LEVER_TYPES.filter((l) => !AGENT_COVERED_LEVERS.includes(l));

/**
 * classifyLeverState() — item 16. Uma alavanca só vira EXHAUSTED com evidência real adequada
 * (>=2 experimentos concluídos na categoria E nenhum candidato causalmente válido restante) —
 * NUNCA por "já mexemos nisso uma vez".
 */
function classifyLeverState({ candidates, completedExperimentsCount, invalidatedCount }) {
  const hasCandidates = Array.isArray(candidates) && candidates.length > 0;
  const validCandidates = hasCandidates ? candidates.filter((c) => !c.causality || c.causality.status !== 'INVALID') : [];

  if (completedExperimentsCount >= 2 && validCandidates.length === 0 && invalidatedCount >= 2) {
    return { state: 'EXHAUSTED', reason: `${completedExperimentsCount} experimentos concluídos nesta categoria, ${invalidatedCount} hipótese(s) invalidada(s), nenhum candidato causal válido restante.` };
  }
  if (completedExperimentsCount >= 1) {
    return { state: 'SUPPORTED', reason: `${completedExperimentsCount} experimento(s) concluído(s) — há evidência real de resultado nesta categoria.` };
  }
  if (hasCandidates) {
    return { state: 'AVAILABLE', reason: `${candidates.length} candidato(s) real(is) gerado(s), nenhum ainda testado via experimento concluído.` };
  }
  return { state: 'UNEXPLORED', reason: 'nenhum candidato real gerado ainda para esta categoria.' };
}

function buildAgentLever(leverId, { candidates = [], experiments = [] } = {}) {
  const completed = experiments.filter((e) => COMPLETED_STATUSES.includes(e.status));
  const invalidatedCount = experiments.filter((e) => e.status === 'FAILURE').length;
  const { state, reason } = classifyLeverState({ candidates, completedExperimentsCount: completed.length, invalidatedCount });

  const bestCandidate = candidates.length
    ? [...candidates].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))[0]
    : null;

  return {
    lever_id: leverId,
    current_state: state,
    evidence_level: completed.length > 0 ? 'REAL_EXPERIMENT' : (candidates.length > 0 ? 'CANDIDATE_ANALYSIS' : 'NONE'),
    estimated_potential: 'NOT_ESTIMABLE', // item 15 — nunca inventar potencial numérico sem base real de conversão pós-mudança
    confidence: bestCandidate ? bestCandidate.confidence ?? null : null,
    cost_to_test: bestCandidate ? (bestCandidate.implementation_cost ?? null) : null,
    speed_to_evidence: bestCandidate ? (bestCandidate.speed_to_evidence_days ?? null) : null,
    dependency: null,
    status: state,
    candidates_available: candidates.length,
    completed_experiments: completed.length,
    best_candidate_id: bestCandidate ? (bestCandidate.candidate_id ?? null) : null,
    reason,
  };
}

/**
 * buildLevers() — items 15-16. Constrói o registro real a partir dos candidatos/experimentos
 * persistidos de cada agente. Levers ainda sem agente dedicado (PRICING/CHECKOUT/LIFECYCLE/
 * ORGANIC/PRODUCT/OTHER) ficam UNKNOWN — nunca UNEXPLORED por suposição (não sabemos se foram
 * exploradas informalmente fora da máquina).
 */
function buildLevers({ creativeCandidates = [], croCandidates = [], offerCandidates = [], experiments = [] }) {
  const levers = [];
  levers.push(buildAgentLever('CREATIVE', { candidates: creativeCandidates, experiments: experiments.filter((e) => e.category === 'CREATIVE') }));
  levers.push(buildAgentLever('CRO', { candidates: croCandidates, experiments: experiments.filter((e) => e.category === 'CRO') }));
  levers.push(buildAgentLever('OFFER', { candidates: offerCandidates, experiments: experiments.filter((e) => e.category === 'OFFER' || e.category === 'AOV') }));
  levers.push(buildAgentLever('MEDIA_BUYING', { candidates: [], experiments: experiments.filter((e) => e.category === 'MEDIA_BUYING') }));

  for (const leverId of NOT_YET_COVERED_LEVERS) {
    levers.push({
      lever_id: leverId, current_state: 'UNKNOWN', evidence_level: 'NONE', estimated_potential: 'NOT_ESTIMABLE',
      confidence: null, cost_to_test: null, speed_to_evidence: null, dependency: null, status: 'UNKNOWN',
      candidates_available: 0, completed_experiments: 0, best_candidate_id: null,
      reason: 'nenhum agente dedicado cobre este lever ainda — não é o mesmo que "não explorado", é "não instrumentado".',
    });
  }
  return levers;
}

/**
 * computeLeverExhaustionScore() — item 17. Nunca "N de M testadas = X%" simples. Só retorna um
 * número quando há base real (levers com agente + evidência suficiente pra ponderar importância).
 * Hoje (nenhum lever coberto está EXHAUSTED) sempre NOT_ESTIMABLE — honesto, não uma falsa métrica.
 */
function computeLeverExhaustionScore(levers) {
  const coveredLevers = levers.filter((l) => AGENT_COVERED_LEVERS.includes(l.lever_id));
  const exhausted = coveredLevers.filter((l) => l.current_state === 'EXHAUSTED');
  if (coveredLevers.length === 0) return { score: 'NOT_ESTIMABLE', reason: 'nenhum lever coberto por agente ainda.' };
  if (exhausted.length === 0) {
    return { score: 'NOT_ESTIMABLE', reason: 'nenhum lever atingiu EXHAUSTED com evidência adequada ainda — score de exaustão não é metodologicamente defensável antes disso (item 17: nunca "testamos 3 de 5, logo 60%").' };
  }
  // só quando houver >=1 EXHAUSTED com peso conhecido — ainda assim pondera por importância
  // relativa (candidates_available + completed_experiments como proxy de peso investigado),
  // nunca uma fração simples de contagem.
  const totalWeight = coveredLevers.reduce((s, l) => s + l.candidates_available + l.completed_experiments, 0);
  const exhaustedWeight = exhausted.reduce((s, l) => s + l.candidates_available + l.completed_experiments, 0);
  return { score: totalWeight > 0 ? Math.round((exhaustedWeight / totalWeight) * 10000) / 10000 : 'NOT_ESTIMABLE', reason: 'ponderado por evidência investida (candidatos + experimentos concluídos), não por contagem simples de levers.' };
}

module.exports = { buildLevers, buildAgentLever, classifyLeverState, computeLeverExhaustionScore, AGENT_COVERED_LEVERS, NOT_YET_COVERED_LEVERS };
