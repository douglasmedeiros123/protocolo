'use strict';

/**
 * buildRoadmap() — items 57/72/81. NOW = ações READY, ordenadas pelo ranking real (nunca
 * reordenadas manualmente). NEXT = ações BLOCKED cuja(s) dependência(s) estão todas em NOW
 * (resolvem assim que o NOW acontecer). LATER = o resto (depende de evidência ainda não
 * planejada, ou de dependências fora do NOW).
 */
function buildRoadmap(rankedActions) {
  const nowIds = new Set(rankedActions.filter((a) => a.status === 'READY').map((a) => a.action_id));

  const now = rankedActions.filter((a) => a.status === 'READY');
  const next = rankedActions.filter((a) => a.status === 'BLOCKED' && a.dependency_ids.length > 0 && a.dependency_ids.every((id) => nowIds.has(id)));
  const nextIds = new Set(next.map((a) => a.action_id));
  const later = rankedActions.filter((a) => !nowIds.has(a.action_id) && !nextIds.has(a.action_id));

  return {
    now: now.map((a) => a.action_id),
    next: next.map((a) => a.action_id),
    later: later.map((a) => a.action_id),
    note: 'NOW/NEXT/LATER deterministicamente derivado do ranking real + grafo de dependência — nunca hardcoded (item 72). Muda automaticamente quando a evidência real mudar.',
  };
}

/**
 * buildBestNextStrategicAction() — item 73. A ação #1 do ranking READY, com o "porquê agora" e
 * "porquê não as outras" explicados a partir do próprio desempate (ranking.js).
 */
function buildBestNextStrategicAction(rankedActions) {
  const ready = rankedActions.filter((a) => a.status === 'READY');
  if (ready.length === 0) {
    return { action: null, why_now: null, why_not_other_actions: null, reason: 'nenhuma ação READY no momento — todas dependem de algo ainda não resolvido, ou nenhuma ação foi gerada.' };
  }
  const best = ready[0];
  const others = ready.slice(1, 4).map((a) => ({ action_id: a.action_id, why_not: best.final_rank_reason }));
  // PASSO 11.1, item 18 — explica qual DECISÃO ESTRATÉGICA esta ação desbloqueia, não só "é a
  // primeira do ranking". unlocked = outras ações do lote que dependem diretamente desta.
  const unlocked = rankedActions.filter((a) => a.dependency_ids.includes(best.action_id)).map((a) => a.action_id);
  return {
    action: best.action_id,
    why_now: best.final_rank_reason,
    why_not_other_actions: others,
    cost_model: best.cost_model,
    capital_required: best.capital_required,
    decision_relevance: best.action_type === 'VALIDATE' || best.action_type === 'FIX'
      ? 'resolve uma incerteza técnica de custo ~R$0 antes de comprometer capital em experimento — decision-changing porque pode confirmar/descartar um confundidor real antes de gastar mídia.'
      : 'o resultado do experimento muda hypothesis_space_status e pode reabrir a avaliação de verdict/OPTIMIZE.',
    information_value: best.action_type === 'VALIDATE' || best.action_type === 'FIX' ? 'ALTO — custo zero, resolve incerteza decisiva.' : 'MEDIO — depende do resultado real do experimento.',
    dependency_unlock: unlocked.length > 0 ? unlocked : null,
    economic_relevance: best.expected_economic_impact,
    decision_it_can_change: best.action_type === 'VALIDATE' || best.action_type === 'FIX' ? 'se o verdict pode evoluir de CONTINUE_VALIDATION pra OPTIMIZE nesta alavanca.' : 'o resultado do experimento muda hypothesis_space_status e pode reabrir a avaliação de verdict.',
    success_condition: best.success_condition,
    failure_condition: best.failure_condition,
    what_happens_after_success: 'a evidência entra no Learning Engine, hypothesis_space_status avança, e o Planner deve ser reexecutado pra recalcular verdict/roadmap.',
    what_happens_after_failure: 'a hipótese correspondente fica INVALIDATED/CONTRADICTED no Learning Engine — reduz confidence de candidatos futuros que dependam dela (prior learning).',
  };
}

module.exports = { buildRoadmap, buildBestNextStrategicAction };
