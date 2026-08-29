'use strict';

// item 9 — grafo explícito de dependências entre candidatos. O CEO deve evitar recomendar B
// antes de A quando B depende de A — a ação de maior lucro esperado não vence automaticamente se
// outra é pré-requisito real (mesmo princípio já usado em measurement/blockerDependencyGraph.js).
function buildDependencyGraph(candidates) {
  const byId = Object.fromEntries(candidates.map((c) => [c.candidate_id, c]));
  const blockedCandidates = candidates.filter((c) => c.dependencies.length > 0 && c.dependencies.some((d) => byId[d])); // só conta dependência real entre candidatos deste ciclo
  const unblockingActions = candidates.filter((c) => candidates.some((other) => other.dependencies.includes(c.candidate_id)));

  return {
    nodes: candidates.map((c) => ({ candidate_id: c.candidate_id, action_class: c.action_class, is_blocked: c.dependencies.some((d) => byId[d]), is_unblocking_action: unblockingActions.some((u) => u.candidate_id === c.candidate_id) })),
    blocked_candidates: blockedCandidates.map((c) => c.candidate_id),
    unblocking_actions: unblockingActions.map((c) => c.candidate_id),
    reason: unblockingActions.length > 0
      ? `${unblockingActions.map((u) => u.candidate_id).join(', ')} desbloqueia(m) ${blockedCandidates.map((c) => c.candidate_id).join(', ')} — resolver a dependência primeiro é estruturalmente necessário, mesmo que o candidato dependente tenha EV/upside maior isoladamente.`
      : 'nenhuma dependência real entre os candidatos deste ciclo.',
  };
}

/**
 * isCandidateExecutableNow() — item 9. Um candidato só é executável agora se NENHUMA de suas
 * dependências reais (entre os candidatos deste ciclo) permanece não resolvida.
 */
function isCandidateExecutableNow(candidate, graph) {
  return !graph.blocked_candidates.includes(candidate.candidate_id);
}

module.exports = { buildDependencyGraph, isCandidateExecutableNow };
