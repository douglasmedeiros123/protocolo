'use strict';

// PASSO 13.1, item 6 — grafo de dependência de blockers, não lista linear. Resolver um nó não
// libera capital automaticamente se outra dependência indispensável do MESMO nó continuar
// ausente — e um nó satisfeito nunca esconde os nós que dependem dele e ainda faltam.
//
// EXPERIMENT_ATTRIBUTION requires EXPOSURE_IDENTITY, requires FINANCIAL_OUTCOME_LINKAGE
// FUNNEL_DIAGNOSTICS may require CHECKOUT_INITIATED_EVENT (dependência leve, nunca bloqueante)
const DEPENDENCY_GRAPH = {
  FINANCIAL_OUTCOME_LINKAGE: { requires: [], blocking: true, description: 'transação financeira real linkável ao período/decisão avaliada (hoje: Hotmart por order_date_utc).' },
  EXPOSURE_IDENTITY: { requires: [], blocking: true, description: 'saber qual exposição/variante esteve ativa em qual momento — hoje só no nível de arquitetura/data, nunca de sessão individual.' },
  EXPERIMENT_ATTRIBUTION: { requires: ['EXPOSURE_IDENTITY', 'FINANCIAL_OUTCOME_LINKAGE'], blocking: true, description: 'ligar exposição -> outcome financeiro de forma interpretável pra uma decisão de capital.' },
  FUNNEL_DIAGNOSTICS: { requires: [], may_require: ['CHECKOUT_INITIATED_EVENT'], blocking: false, description: 'explica ONDE/COMO no funil o efeito aconteceu — nunca indispensável pra saber SE o efeito ocorreu.' },
};

/**
 * evaluateBlockerDependencyGraph() — item 6. `evidence` diz, pra cada nó-folha, se está
 * satisfeito hoje (nunca hardcoded — vem do audit real). Retorna o grafo inteiro avaliado,
 * determinístico, com current_blocker/remaining_blockers/next_unlock/unlock_dependency/
 * capability_unlocked pra cada nó capital-relevante — nunca escondendo um blocker posterior
 * (mesma disciplina de blocker chain já usada no Strategy Search, PASSO 12.3).
 */
function evaluateBlockerDependencyGraph({ evidence }) {
  const nodeStatus = {};
  const evaluate = (nodeId) => {
    if (nodeStatus[nodeId] !== undefined) return nodeStatus[nodeId];
    const node = DEPENDENCY_GRAPH[nodeId];
    if (!node) throw new Error(`nó de dependência desconhecido: ${nodeId}`);
    const ownEvidence = node.requires.length === 0 ? evidence[nodeId] === true : null;
    const requiresSatisfied = node.requires.every((dep) => evaluate(dep));
    const satisfied = node.requires.length === 0 ? ownEvidence : requiresSatisfied;
    nodeStatus[nodeId] = satisfied === true;
    return nodeStatus[nodeId];
  };

  for (const nodeId of Object.keys(DEPENDENCY_GRAPH)) evaluate(nodeId);

  // ordem de avaliação do blocker atual: nós capital-blocking, na ordem em que aparecem no grafo
  // (folhas antes de quem depende delas — nunca aponta EXPERIMENT_ATTRIBUTION como blocker se uma
  // dependência dele ainda não foi resolvida; a dependência raiz é sempre o blocker real).
  const blockingNodeIds = Object.keys(DEPENDENCY_GRAPH).filter((id) => DEPENDENCY_GRAPH[id].blocking);
  const unsatisfiedBlocking = blockingNodeIds.filter((id) => !nodeStatus[id]);

  // entre os não satisfeitos, o current_blocker é o que não depende de nenhum outro não
  // satisfeito (a causa-raiz, não o sintoma agregado — nunca aponta EXPERIMENT_ATTRIBUTION
  // quando o problema de verdade é EXPOSURE_IDENTITY).
  const rootBlockers = unsatisfiedBlocking.filter((id) => {
    const node = DEPENDENCY_GRAPH[id];
    return node.requires.every((dep) => nodeStatus[dep]) || node.requires.length === 0;
  });
  const currentBlocker = rootBlockers[0] || null;
  const remainingBlockers = unsatisfiedBlocking.filter((id) => id !== currentBlocker);

  const nonBlockingGaps = Object.keys(DEPENDENCY_GRAPH)
    .filter((id) => !DEPENDENCY_GRAPH[id].blocking)
    .flatMap((id) => (DEPENDENCY_GRAPH[id].may_require || []).filter((dep) => evidence[dep] !== true).map((dep) => ({ soft_dependency: dep, for_node: id, blocking: false })));

  return {
    nodes: Object.fromEntries(Object.keys(DEPENDENCY_GRAPH).map((id) => [id, { satisfied: nodeStatus[id], ...DEPENDENCY_GRAPH[id] }])),
    current_blocker: currentBlocker,
    remaining_blockers: remainingBlockers,
    next_unlock: remainingBlockers[0] || null,
    unlock_dependency: currentBlocker ? DEPENDENCY_GRAPH[currentBlocker].requires : [],
    capability_unlocked: currentBlocker ? `resolver ${currentBlocker} habilita: ${Object.keys(DEPENDENCY_GRAPH).filter((id) => DEPENDENCY_GRAPH[id].requires.includes(currentBlocker)).join(', ') || 'nenhuma dependência direta downstream ainda mapeada'}` : 'nenhum blocker capital-relevante restante.',
    non_blocking_gaps: nonBlockingGaps,
    all_capital_blocking_satisfied: unsatisfiedBlocking.length === 0,
  };
}

module.exports = { DEPENDENCY_GRAPH, evaluateBlockerDependencyGraph };
