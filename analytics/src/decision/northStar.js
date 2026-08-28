'use strict';

// NORTH STAR — meta permanente do negócio (PASSO 7, item 1). NÃO é um parâmetro configurável
// por execução (diferente do --target-roas do Profit Engine, que serve outras análises). Só
// ROAS FINANCEIRO (Hotmart, fonte de verdade) conta pro North Star — nunca ROAS de marketing.
const TARGET_FINANCIAL_ROAS = 3.0;

// Marcos intermediários — NUNCA a meta final, só checkpoints de comunicação de progresso.
// Ordenados; o último é sempre o próprio North Star.
const MILESTONES = [1.0, 1.5, 2.0, 3.0];

/**
 * Calcula a distância até o North Star e o próximo marco. Se current_roas for null (sem dado
 * financeiro suficiente no período), tudo fica null e explícito — nunca finge um gap calculável.
 */
function computeNorthStar(currentRoas) {
  if (currentRoas == null) {
    return {
      target_roas: TARGET_FINANCIAL_ROAS,
      current_roas: null,
      roas_gap_absolute: null,
      roas_gap_percent: null,
      next_milestone: null,
      milestones: MILESTONES,
      reason: 'roas_financeiro indisponível no período de referência — gap não pode ser calculado.',
    };
  }

  const roas_gap_absolute = TARGET_FINANCIAL_ROAS - currentRoas;
  const roas_gap_percent = roas_gap_absolute / TARGET_FINANCIAL_ROAS;
  const next_milestone = MILESTONES.find((m) => m > currentRoas) ?? null; // null = já bateu/passou o North Star

  return {
    target_roas: TARGET_FINANCIAL_ROAS,
    current_roas: currentRoas,
    roas_gap_absolute,
    roas_gap_percent,
    next_milestone,
    milestones: MILESTONES,
    reason: next_milestone == null
      ? `roas_financeiro (${currentRoas.toFixed(3)}) já atingiu ou superou o North Star (${TARGET_FINANCIAL_ROAS}).`
      : `roas_financeiro atual: ${currentRoas.toFixed(3)}. Próximo marco: ${next_milestone}. North Star permanece ${TARGET_FINANCIAL_ROAS}.`,
  };
}

module.exports = { TARGET_FINANCIAL_ROAS, MILESTONES, computeNorthStar };
