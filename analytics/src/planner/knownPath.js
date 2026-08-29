'use strict';

const { NOT_YET_COVERED_LEVERS, AGENT_COVERED_LEVERS } = require('./leverRegistry');

// item 10 — limiar documentado (não escondido) pra distinguir PARTIAL de NO_KNOWN_PATH: se o
// melhor cenário JÁ MODELADO fecha menos da metade do gap real, os alavancas quantificados hoje
// não bastam (NO_KNOWN_PATH) — mesmo que exista alguma melhora. Isso é uma escolha metodológica
// documentada, não um "achismo": abaixo de 50% do gap fechado, extrapolar até ROAS 3 exigiria
// assumir efeitos muito além do que qualquer cenário real já testou.
const PARTIAL_PATH_GAP_CLOSURE_THRESHOLD = 0.5;

/**
 * determineKnownPathToTarget() — item 10. "Sem caminho MODELADO" != "produto inviável". Nunca
 * retorna NO_KNOWN_PATH como sinônimo de invalidação — é estritamente sobre os cenários JÁ
 * calculados, não sobre o espaço de possibilidades real.
 */
function determineKnownPathToTarget({ currentRoas, targetRoas, bestCombinedScenarioRoas }) {
  if (currentRoas == null || targetRoas == null) {
    return { status: 'UNKNOWN', reason: 'ROAS financeiro atual ou target indisponível.' };
  }
  if (currentRoas >= targetRoas) {
    return { status: 'YES', reason: `ROAS atual (${currentRoas}) já atinge o target (${targetRoas}).` };
  }
  if (bestCombinedScenarioRoas == null) {
    return { status: 'UNKNOWN', reason: 'nenhum cenário combinado real calculável ainda.' };
  }
  if (bestCombinedScenarioRoas >= targetRoas) {
    return { status: 'YES', reason: `o melhor cenário combinado já modelado (ROAS ${bestCombinedScenarioRoas}) atinge o target.` };
  }
  const gap = targetRoas - currentRoas;
  const closed = bestCombinedScenarioRoas - currentRoas;
  const closurePct = gap > 0 ? closed / gap : null;
  if (closurePct != null && closurePct >= PARTIAL_PATH_GAP_CLOSURE_THRESHOLD) {
    return { status: 'PARTIAL', reason: `o melhor cenário combinado já modelado fecha ${(closurePct * 100).toFixed(1)}% do gap até o target — caminho parcial, precisa de mais alavancas ou mais amplitude nas já conhecidas.`, gap_closure_pct: Math.round(closurePct * 10000) / 10000 };
  }
  return {
    status: 'NO_KNOWN_PATH',
    reason: `com as alavancas atualmente quantificadas (cenário combinado CPA/AOV mais agressivo já modelado), o gap fecha apenas ${closurePct != null ? (closurePct * 100).toFixed(1) + '%' : '?'} até o target — os caminhos MODELADOS não chegam ao ROAS 3. Isso NÃO significa que não existe caminho real (item 10) — significa que os alavancas quantificados hoje não bastam sozinhos.`,
    gap_closure_pct: closurePct != null ? Math.round(closurePct * 10000) / 10000 : null,
  };
}

/**
 * buildPathToRoas3() — item 40/41. Nunca fabrica solução matemática impossível — só relata o
 * gap real, os alavancas conhecidos (com potencial NOT_ESTIMABLE — nunca inventado) e os
 * alavancas ainda não quantificados/instrumentados (item 42).
 */
function buildPathToRoas3({ economicsSnapshot, levers, knownPathToTarget }) {
  const currentRoas = economicsSnapshot.financials.roas_financeiro;
  const targetRoas = economicsSnapshot.roas3_gap.target_roas;
  const knownLevers = levers.filter((l) => AGENT_COVERED_LEVERS.includes(l.lever_id)).map((l) => ({
    lever_id: l.lever_id, state: l.current_state, evidence_level: l.evidence_level, estimated_potential: l.estimated_potential,
  }));
  // item 42 — nunca hardcode a lista fixa do exemplo do spec; deriva dos LEVER_TYPES realmente
  // não cobertos por agente hoje + nota de que mesmo os alavancas cobertos não têm potencial
  // numérico decomposto (o cenário CPA/AOV é agregado, não atribuído a um lever específico).
  const unquantifiedLevers = NOT_YET_COVERED_LEVERS.map((l) => ({ lever_id: l, status: 'UNQUANTIFIED', reason: 'nenhum agente dedicado instrumenta este lever ainda.' }));

  return {
    current_roas: currentRoas,
    target_roas: targetRoas,
    known_quantified_gap: currentRoas != null && targetRoas != null ? Math.round((targetRoas - currentRoas) * 10000) / 10000 : null,
    known_levers: knownLevers,
    unquantified_levers: unquantifiedLevers,
    required_improvement: economicsSnapshot.roas3_gap,
    candidate_paths: 'ver strategic_paths no plano completo — não duplicado aqui.',
    confidence: currentRoas != null && targetRoas != null ? 'MEDIUM' : 'UNKNOWN',
    known_path_to_target: knownPathToTarget.status,
    known_path_to_target_reason: knownPathToTarget.reason,
    note: 'O cenário CPA/AOV combinado (offer/scenarioEngine.js) é agregado — não decompõe QUAL lever produziria a melhora de CPA ou de AOV. estimated_potential de cada lever é sempre NOT_ESTIMABLE até existir taxa/resultado real pós-mudança (item 15).',
  };
}

module.exports = { determineKnownPathToTarget, buildPathToRoas3, PARTIAL_PATH_GAP_CLOSURE_THRESHOLD };
