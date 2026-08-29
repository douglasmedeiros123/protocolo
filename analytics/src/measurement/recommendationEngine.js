'use strict';

// PASSO 13.1, item 15 — a pergunta certa não é "liste todas as melhorias possíveis", é "o que é
// o MÍNIMO de trabalho de mensuração necessário antes de rodar o próximo experimento real com
// responsabilidade?". Rankeado e separado em 3 faixas, nunca uma lista plana só.
function classifyDebtIntoTiers({ debtRegistry, blockerGraphForWinner }) {
  // item 6/15 — MUST_HAVE é literalmente a cadeia de blockers reais do próximo experimento
  // (winner do Strategy Search), identificado pelo blocker_node explícito de cada item de
  // dívida — nunca por correspondência aproximada de string (item.domain/affected_scopes podem
  // descrever o MESMO gap com nomes diferentes do nó do grafo).
  const currentBlockerNode = blockerGraphForWinner ? blockerGraphForWinner.current_blocker : null;

  const mustHave = [];
  const shouldHave = [];
  const niceToHave = [];

  for (const item of debtRegistry) {
    const isRootBlockerForWinner = currentBlockerNode && item.blocker_node === currentBlockerNode;
    if (isRootBlockerForWinner) {
      mustHave.push(item);
    } else if (item.decision_impact === 'HIGH') {
      shouldHave.push(item);
    } else {
      niceToHave.push(item);
    }
  }

  return { mustHave, shouldHave, niceToHave };
}

/**
 * formMeasurementRecommendation() — item 56 (PASSO 13), recalibrado no PASSO 13.1 (item 15) pra
 * responder diretamente "o que é o mínimo necessário antes do próximo teste real", separado em
 * MUST_HAVE_BEFORE_TEST/SHOULD_HAVE_SOON/NICE_TO_HAVE_LATER — nunca devolve a decisão pro humano.
 */
function formMeasurementRecommendation({ debtRegistry, capitalGateForWinner, winnerArchitectureId, blockerGraphForWinner }) {
  if (!debtRegistry || debtRegistry.length === 0) {
    return { recommended_debt_id: null, reason: 'nenhum item de dívida de mensuração identificado — nada a recomendar.' };
  }
  const top = debtRegistry[0];
  const others = debtRegistry.slice(1);
  const tiers = classifyDebtIntoTiers({ debtRegistry, blockerGraphForWinner });

  return {
    recommended_debt_id: top.debt_id,
    recommended_domain: top.domain,
    why_this_first: `${top.description} Impacto de decisão ${top.decision_impact} e risco de capital ${top.capital_risk} — o maior da lista ranqueada, afetando ${top.affected_scopes.join(', ')}.${capitalGateForWinner && capitalGateForWinner.current_blocker ? ` O blocker atual real do vencedor do Strategy Search (${winnerArchitectureId}) é ${capitalGateForWinner.current_blocker}.` : ''}`,
    why_not_the_others: others.slice(0, 3).map((o) => `${o.debt_id} (${o.domain}): impacto ${o.decision_impact}/risco ${o.capital_risk} — real, mas menor prioridade que ${top.debt_id} nos mesmos fatores documentados (decision_impact -> capital_risk -> nº de escopos afetados).`),
    decision_impact: top.decision_impact,
    capital_risk: top.capital_risk,
    unlocked_capability: `resolver ${top.debt_id} habilita: ${top.affected_scopes.join(', ')}.`,
    confidence: 'MEDIUM',
    what_would_change_my_mind: 'se um novo item de dívida real surgir com decision_impact=HIGH E capital_risk=HIGH E mais domínios afetados simultaneamente que este, OU se o vencedor real do Strategy Search mudar pra uma arquitetura cujo blocker principal seja outro tipo de gap.',
    // item 15 — a resposta direta à pergunta "o que é o mínimo antes do próximo teste real".
    must_have_before_test: tiers.mustHave.map((i) => ({ debt_id: i.debt_id, domain: i.domain, description: i.description })),
    should_have_soon: tiers.shouldHave.map((i) => ({ debt_id: i.debt_id, domain: i.domain, description: i.description })),
    nice_to_have_later: tiers.niceToHave.map((i) => ({ debt_id: i.debt_id, domain: i.domain, description: i.description })),
  };
}

module.exports = { formMeasurementRecommendation, classifyDebtIntoTiers };
