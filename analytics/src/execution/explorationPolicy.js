'use strict';

// PASSO 14B, item 7 — EXPLORATION_BUDGET_POLICY. Objetivo: impedir que a máquina fique
// permanentemente conservadora — mas "sempre gastar X%" é exatamente o viés proibido pelo item.
// A alocação depende de cash availability, profitability atual, VOI, upside esperado, risco,
// reversibilidade, qualidade de evidência e exaustão do espaço de hipóteses — pode legitimamente
// recomendar ZERO em momentos críticos, e mais em momentos de VOI alto.
/**
 * evaluateExplorationBudget() — nunca retorna um percentual fixo por padrão. Cada fator reduz ou
 * permite exploração — a ausência de qualquer fator crítico já é suficiente pra recomendar ZERO.
 */
function evaluateExplorationBudget({
  cashAvailable, // boolean|null — UNKNOWN nunca vira "sim"
  currentProfitability, // 'PROFITABLE'|'BREAK_EVEN'|'LOSS'|'CRITICAL_LOSS'|null
  valueOfInformation, // 'HIGH'|'MEDIUM'|'LOW'|'NOT_ASSESSABLE'
  expectedUpside, // 'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'
  risk, // 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'
  reversibility, // reversibility enum
  evidenceQuality, // 'HIGH'|'MEDIUM'|'LOW'|'NOT_ASSESSABLE'
  hypothesisSpaceExhausted, // boolean|null
}) {
  const blockers = [];
  if (cashAvailable !== true) blockers.push('cash_available não confirmado como true — nunca explora sem confirmação real de caixa disponível.');
  if (currentProfitability === 'CRITICAL_LOSS') blockers.push('currentProfitability=CRITICAL_LOSS — momento crítico, exploração recomendada ZERO até estabilizar.');
  if (risk === 'CRITICAL') blockers.push('risk=CRITICAL — nenhuma exploração recomendada nesse nível de risco.');
  if (reversibility === 'IRREVERSIBLE') blockers.push('reversibility=IRREVERSIBLE — exploração exige reversibilidade real.');

  if (blockers.length > 0) {
    return { recommended_exploration_posture: 'ZERO', reason: blockers.join(' '), blockers };
  }

  if (valueOfInformation === 'HIGH' && evidenceQuality !== 'NOT_ASSESSABLE' && hypothesisSpaceExhausted !== true) {
    return { recommended_exploration_posture: 'ELEVATED', reason: 'value_of_information alto, evidência disponível pra avaliar, espaço de hipóteses ainda não exaurido — momento favorável pra exploração além do mínimo.', blockers: [] };
  }
  if (valueOfInformation === 'NOT_ASSESSABLE' || evidenceQuality === 'NOT_ASSESSABLE') {
    return { recommended_exploration_posture: 'MINIMAL', reason: 'VOI/qualidade de evidência não avaliáveis — postura mínima até isso ficar claro, nunca ZERO por padrão nem ELEVATED por otimismo.', blockers: [] };
  }
  return { recommended_exploration_posture: 'STANDARD', reason: 'nenhum bloqueador crítico, VOI/evidência moderados — postura padrão, nunca um percentual fixo, sujeita a EXPLORATION_CAPITAL bucket real.', blockers: [] };
}

module.exports = { evaluateExplorationBudget };
