'use strict';

/**
 * computeExpectedEconomicValueOfContinuing() — PASSO 11.1, item 9. ESTRITO: só POSITIVE/NEGATIVE
 * com base defensável (probabilidade × impacto − custo). "Existem alavancas AVAILABLE" NÃO basta
 * — isso é sinal de VALUE OF INFORMATION, não de expected economic value (item 8, a confusão que
 * este PASSO corrige). A única base defensável hoje neste projeto é um resultado REAL observado
 * (hipótese SUPPORTED/STRONG = efeito positivo já medido) — nunca uma probabilidade inventada.
 */
function computeExpectedEconomicValueOfContinuing({ learningEvidence, knownPathToTarget }) {
  if (!learningEvidence || learningEvidence.total_hypotheses === 0) {
    return { status: 'UNKNOWN', basis: 'nenhuma hipótese real (SUPPORTED/STRONG) com efeito positivo observado ainda — sem base defensável de probabilidade×impacto (item 9). Ter candidatos AVAILABLE não basta.', confidence: null, monetary_estimate: null };
  }

  const categories = Object.values(learningEvidence.by_category);
  const totalSupporting = categories.reduce((s, c) => s + c.supporting_learnings, 0);
  const totalInvalidated = categories.reduce((s, c) => s + c.invalidated_hypotheses + c.contradictory_learnings, 0);

  if (totalSupporting > 0) {
    return {
      status: 'POSITIVE',
      basis: `${totalSupporting} hipótese(s) real(is) SUPPORTED/STRONG — efeito positivo já observado e mensurável em pelo menos uma alavanca.`,
      confidence: 'MEDIUM', monetary_estimate: 'NOT_ESTIMABLE',
    };
  }
  if (totalInvalidated >= 2 && knownPathToTarget && knownPathToTarget.status === 'NO_KNOWN_PATH') {
    return {
      status: 'NEGATIVE',
      basis: `${totalInvalidated} hipótese(s) real(is) invalidada(s)/contraditada(s) e nenhum caminho econômico modelado fecha o gap.`,
      confidence: 'MEDIUM', monetary_estimate: 'NOT_ESTIMABLE',
    };
  }
  return { status: 'UNKNOWN', basis: 'evidência real existente não é suficiente pra afirmar POSITIVE nem NEGATIVE com base defensável.', confidence: null, monetary_estimate: null };
}

// item 10 — VOI é qualitativo: quanto vale continuar aprendendo, independente do EV econômico.
const VOI_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

/**
 * computeValueOfInformationOfContinuing() — item 10/11. Baseado em: evidência decision-changing
 * disponível, custo de adquiri-la, quantidade de incógnitas importantes restantes, potencial de
 * mudar o verdict. Pode ser HIGH mesmo com economic EV UNKNOWN (item 11 — essa combinação é
 * válida e esperada em produto ainda em validação).
 */
function computeValueOfInformationOfContinuing({ evidenceGaps = [], hypothesisSpaceStatus }) {
  const decisionCritical = evidenceGaps.filter((g) => g.decision_classification === 'DECISION_CRITICAL');
  const cheapDecisionCritical = decisionCritical.filter((g) => g.estimated_cost === 0 || (g.estimated_cost != null && g.estimated_cost <= 50));

  if (cheapDecisionCritical.length > 0) {
    return {
      status: 'HIGH',
      basis: `${cheapDecisionCritical.length} pergunta(s) DECISION_CRITICAL (pode mudar verdict/viability/capital_posture/gates) com custo baixo/zero de investigação ainda em aberto.`,
      confidence: 'MEDIUM',
    };
  }
  if (decisionCritical.length > 0) {
    return { status: 'MEDIUM', basis: `${decisionCritical.length} pergunta(s) DECISION_CRITICAL em aberto, mas nenhuma de custo baixo/zero.`, confidence: 'LOW' };
  }
  if (hypothesisSpaceStatus && hypothesisSpaceStatus.status === 'LARGELY_UNEXPLORED') {
    return { status: 'MEDIUM', basis: 'espaço de hipóteses ainda muito inexplorado (0 experimentos concluídos) — provável que existam perguntas decisivas ainda não identificadas.', confidence: 'LOW' };
  }
  if (hypothesisSpaceStatus && ['NEAR_EXHAUSTED', 'EXHAUSTED'].includes(hypothesisSpaceStatus.status)) {
    return { status: 'LOW', basis: 'espaço de hipóteses já bem explorado — pouca informação nova decisiva esperada.', confidence: 'LOW' };
  }
  return { status: 'MEDIUM', basis: 'nenhuma pergunta DECISION_CRITICAL identificada agora, mas exploração ainda intermediária.', confidence: 'LOW' };
}

/**
 * computeExpectedEconomicValueOfSwitching() — item 23. Sempre UNKNOWN hoje: não existe Product
 * Selection Agent nem alternativa real modelada. Nunca inventar valor de produto alternativo.
 */
function computeExpectedEconomicValueOfSwitching() {
  return { status: 'UNKNOWN', basis: 'nenhum Product Selection Agent / alternativa real modelada ainda — nunca inventado (item 23).', confidence: null, monetary_estimate: null };
}

// item 23 — VOI de trocar também não é modelável sem uma alternativa real (não sabemos o que
// aprenderíamos com um produto que nem existe ainda no sistema).
function computeValueOfInformationOfSwitching() {
  return { status: 'UNKNOWN', basis: 'sem alternativa real modelada, o valor de informação de trocar também não é avaliável.' };
}

/**
 * computeOpportunityCostOfContinuing() — item 24. NOT_ESTIMABLE sem alternativa real modelada.
 */
function computeOpportunityCostOfContinuing(expectedEconomicValueOfSwitching) {
  if (expectedEconomicValueOfSwitching.status === 'UNKNOWN') {
    return { value: 'NOT_ESTIMABLE', reason: 'sem alternativa real modelada (expected_economic_value_of_switching=UNKNOWN), opportunity cost não é calculável.' };
  }
  return { value: 'NOT_ESTIMABLE', reason: 'cálculo de opportunity cost real ainda não implementado — reservado para quando existir Product Selection Agent.' };
}

module.exports = {
  computeExpectedEconomicValueOfContinuing, computeValueOfInformationOfContinuing,
  computeExpectedEconomicValueOfSwitching, computeValueOfInformationOfSwitching,
  computeOpportunityCostOfContinuing, VOI_RANK,
};
