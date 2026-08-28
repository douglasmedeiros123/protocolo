'use strict';

const { loadCandidates, loadDiagnostics } = require('../cro/registry');
const { buildTechnicalActions } = require('../cro/diagnostics');

/**
 * DECISION ENGINE INTEGRATION (PASSO 9, item 26 + PASSO 9.1, item 10) — função de CONSULTA
 * pura e aditiva, mesmo padrão de decision/creativeIntegration.js. NÃO altera
 * decision/builder.js nem a hierarquia de decisão principal (evita regressão — o Decision
 * Engine continua recomendando CRO-001 como está até que alguém decida consultar isto
 * explicitamente).
 */
function getBestCroCandidate(dir) {
  const candidates = loadCandidates(dir);
  const eligible = candidates.filter((c) => c.causality && c.causality.status !== 'INVALID');
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.priority_score - a.priority_score)[0];
}

/**
 * getBestCroAction() — distingue RUN_EXPERIMENT (candidates) de FIX_TECHNICAL_ISSUE/
 * VALIDATE_TECHNICAL_ISSUE (ações técnicas de custo ~R$0, ver diagnostics.js). Cada item vem
 * rotulado com `action_type` explícito, pra um futuro Decision Engine poder comparar as duas
 * naturezas de ação sem confundi-las. Puramente estrutural — nunca decide sozinho, nunca
 * executa nada.
 */
function getBestCroAction(dir) {
  const bestCandidate = getBestCroCandidate(dir);
  const diagnostics = loadDiagnostics(dir);
  const technicalActions = buildTechnicalActions(diagnostics);

  const actions = [
    ...(bestCandidate ? [{ action_type: 'RUN_EXPERIMENT', ...bestCandidate }] : []),
    ...technicalActions,
  ];

  return {
    actions,
    recommended: technicalActions.length > 0 ? technicalActions[0] : (bestCandidate ? { action_type: 'RUN_EXPERIMENT', ...bestCandidate } : null),
    note: 'Estrutural/aditivo — NÃO substitui nem altera a recomendação principal do Decision Engine (decision/builder.js). Ações técnicas de custo ~R$0 aparecem primeiro só nesta função de consulta, não na hierarquia de decisão real.',
  };
}

module.exports = { getBestCroCandidate, getBestCroAction };
