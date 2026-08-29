'use strict';

const { PROBLEM_CLASSIFICATIONS } = require('./enums');

// item 5 — BOTTLENECK vs OPPORTUNITY vs DEPENDENCY vs SYMPTOM. Métrica ruim != bottleneck
// automático. Oportunidade grande != prioridade automática se existe dependency anterior.
/**
 * classifyProblem() — decide a classificação real de um problema/sinal identificado no
 * diagnóstico, dado o que ele bloqueia e o que o precede.
 */
function classifyProblem({ blocksOtherActions, isCausedByUpstreamIssue, hasLargePotentialUpside, isPrerequisiteForHighestPriorityAction }) {
  if (isPrerequisiteForHighestPriorityAction) {
    return { classification: 'DEPENDENCY', reason: 'é pré-requisito estrutural pra ação de maior prioridade — precede qualquer coisa que dependa dele, mesmo que a ação dependente pareça mais atraente isoladamente (item 5: exemplo advertorial vs exposure identity).' };
  }
  if (isCausedByUpstreamIssue) {
    return { classification: 'SYMPTOM', reason: 'é consequência de outro problema já identificado — resolver a causa raiz resolve isso também; tratar diretamente aqui seria redundante ou prematuro.' };
  }
  if (blocksOtherActions) {
    return { classification: 'BOTTLENECK', reason: 'bloqueia progresso em múltiplas frentes reais hoje — restrição ativa, não só um sintoma.' };
  }
  if (hasLargePotentialUpside) {
    return { classification: 'OPPORTUNITY', reason: 'upside real identificado, mas não bloqueia nada agora — prioridade depende de EV/VOI comparado a outras opções, nunca automática por tamanho.' };
  }
  return { classification: 'SYMPTOM', reason: 'nenhum critério de bottleneck/dependency/opportunity claro identificado — tratado como sintoma até evidência melhor.' };
}

module.exports = { classifyProblem, PROBLEM_CLASSIFICATIONS };
