'use strict';

// item 23 — registra alternativas rejeitadas com why_rejected/what_evidence_would_change_
// ranking/counterfactual_status. NUNCA inventa o outcome contrafactual (o que teria acontecido
// se a alternativa rejeitada tivesse sido escolhida) — só documenta a rejeição em si.
function buildCounterfactualLog(ranking, winnerCandidateId) {
  return ranking
    .filter((c) => c.candidate_id !== winnerCandidateId)
    .map((c) => ({
      candidate_id: c.candidate_id,
      why_rejected: `perdeu no ranking (VOI/confidence/capital/risco documentados) ou estava bloqueado por dependência real não resolvida.`,
      what_evidence_would_change_ranking: `VOI/confidence maiores que o vencedor, ou resolução da dependência que hoje o bloqueia (ver dependencyGraph.js deste ciclo).`,
      counterfactual_status: 'NEVER_EXECUTED — nenhum outcome contrafactual é inventado ou estimado (item 23).',
    }));
}

module.exports = { buildCounterfactualLog };
