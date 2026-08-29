'use strict';

const { LOSS_CATEGORIES } = require('./enums');

// PASSO 14B, item 11 — MAX_ACCEPTABLE_LEARNING_LOSS. NÃO significa tolerar prejuízo indefinido —
// permite experimentos com EV financeiro negativo esperado quando VOI justifica, capital é
// limitado, a hipótese é importante, o risco é contido e o resultado é informativo. As 4
// categorias de custo nunca são fundidas numa só "perda".
function classifyLoss({ amount, category }) {
  if (!LOSS_CATEGORIES.includes(category)) throw new Error(`categoria de perda desconhecida: ${category}`);
  return { amount, category, note: category === 'BUSINESS_LOSS' ? 'perda operacional real do negócio — a única que ameaça continuidade.' : `custo de ${category.toLowerCase().replace(/_/g, ' ')} — não é a mesma coisa que BUSINESS_LOSS, nunca somado a ela sem essa distinção explícita.` };
}

/**
 * evaluateLearningLossAcceptability() — item 11. Um experimento com EV negativo esperado PODE
 * ser aceito quando: VOI justificável, capital limitado (bounded), hipótese importante, risco
 * contido, resultado será informativo. Nunca aceito se qualquer um desses faltar.
 */
function evaluateLearningLossAcceptability({
  expectedValue, // número (pode ser negativo) ou 'UNKNOWN'
  valueOfInformation, // 'HIGH'|'MEDIUM'|'LOW'|'NOT_ASSESSABLE'
  capitalBounded, // boolean — existe um teto conhecido de perda máxima possível?
  hypothesisImportance, // 'HIGH'|'MEDIUM'|'LOW'
  riskContained, // boolean — reversível/blast_radius pequeno?
  resultWillBeInformative, // boolean
  maxAcceptableLearningLoss, // número ou 'NOT_CONFIGURED'
  boundedLossEstimate, // número ou 'UNKNOWN' — nunca inventado
}) {
  if (!capitalBounded || boundedLossEstimate === 'UNKNOWN' || boundedLossEstimate == null) {
    return { acceptable: false, reason: 'capital não está bounded (perda máxima possível desconhecida) — nunca aceito, mesmo com VOI alto (item 11: nunca tolera prejuízo indefinido).' };
  }
  if (!riskContained) {
    return { acceptable: false, reason: 'risco não contido (irreversível ou blast_radius grande) — EV negativo só é aceitável com risco contido.' };
  }
  if (!resultWillBeInformative) {
    return { acceptable: false, reason: 'resultado não seria informativo — sem isso, não há learning value pra justificar a perda esperada.' };
  }
  if (valueOfInformation !== 'HIGH' && valueOfInformation !== 'MEDIUM') {
    return { acceptable: false, reason: `value_of_information=${valueOfInformation} — insuficiente pra justificar EV negativo esperado.` };
  }
  if (maxAcceptableLearningLoss !== 'NOT_CONFIGURED' && boundedLossEstimate > maxAcceptableLearningLoss) {
    return { acceptable: false, reason: `perda máxima estimada (${boundedLossEstimate}) excede MAX_ACCEPTABLE_LEARNING_LOSS configurado (${maxAcceptableLearningLoss}).` };
  }
  if (maxAcceptableLearningLoss === 'NOT_CONFIGURED') {
    return { acceptable: false, reason: 'MAX_ACCEPTABLE_LEARNING_LOSS ainda NOT_CONFIGURED — sem um teto real definido, nenhuma perda esperada é pré-aprovada automaticamente (segue pra REQUIRE_HUMAN_APPROVAL na Policy Engine).' };
  }
  return { acceptable: true, reason: `VOI=${valueOfInformation}, capital bounded (${boundedLossEstimate} <= ${maxAcceptableLearningLoss}), risco contido, resultado informativo, hipótese ${hypothesisImportance} — EV negativo esperado é uma perda de aprendizado aceitável, não um erro.` };
}

module.exports = { LOSS_CATEGORIES, classifyLoss, evaluateLearningLossAcceptability };
