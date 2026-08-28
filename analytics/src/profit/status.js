'use strict';

// Limites matemáticos (não interpretação subjetiva), ancorados no breakeven real (ROAS=1) e no
// ROAS-alvo do negócio (2, ver DEFAULT_TARGET_ROAS em profit.js). Cada limite é documentado:
//
//  CRITICAL_LOSS   : roas <  0.5              -> perde mais da metade de cada real gasto
//  LOSS            : 0.5 <= roas <  0.9       -> perde dinheiro, mas não catastroficamente
//  NEAR_BREAK_EVEN : 0.9 <= roas <  1.0        -> a até 10% do equilíbrio
//  BREAK_EVEN      : 1.0 <= roas <  1.05       -> praticamente no zero a zero (±5% de folga)
//  PROFITABLE      : 1.05 <= roas <  target    -> lucro real, ainda abaixo da meta de escala
//  SCALE_CANDIDATE : roas >= target (padrão 2) -> bateu ou passou a meta — candidato a receber mais orçamento
//
// Sem dado (roas null, sem gasto ou sem venda no período) NUNCA vira uma dessas faixas —
// é reportado à parte como INSUFFICIENT_DATA, para não fingir um status financeiro que não
// pode ser calculado.
const THRESHOLDS = {
  CRITICAL_LOSS_MAX: 0.5,
  LOSS_MAX: 0.9,
  NEAR_BREAK_EVEN_MAX: 1.0,
  BREAK_EVEN_MAX: 1.05,
};

function classifyProfitStatus(roasFinanceiro, targetRoas) {
  if (roasFinanceiro == null) {
    return { status: 'INSUFFICIENT_DATA', reason: 'roas_financeiro indisponível (sem gasto ou sem venda confirmada no período).' };
  }
  if (roasFinanceiro < THRESHOLDS.CRITICAL_LOSS_MAX) return { status: 'CRITICAL_LOSS', reason: `roas_financeiro (${roasFinanceiro.toFixed(3)}) < ${THRESHOLDS.CRITICAL_LOSS_MAX}` };
  if (roasFinanceiro < THRESHOLDS.LOSS_MAX) return { status: 'LOSS', reason: `${THRESHOLDS.CRITICAL_LOSS_MAX} <= roas_financeiro (${roasFinanceiro.toFixed(3)}) < ${THRESHOLDS.LOSS_MAX}` };
  if (roasFinanceiro < THRESHOLDS.NEAR_BREAK_EVEN_MAX) return { status: 'NEAR_BREAK_EVEN', reason: `${THRESHOLDS.LOSS_MAX} <= roas_financeiro (${roasFinanceiro.toFixed(3)}) < ${THRESHOLDS.NEAR_BREAK_EVEN_MAX}` };
  if (roasFinanceiro < THRESHOLDS.BREAK_EVEN_MAX) return { status: 'BREAK_EVEN', reason: `${THRESHOLDS.NEAR_BREAK_EVEN_MAX} <= roas_financeiro (${roasFinanceiro.toFixed(3)}) < ${THRESHOLDS.BREAK_EVEN_MAX}` };
  if (roasFinanceiro < targetRoas) return { status: 'PROFITABLE', reason: `${THRESHOLDS.BREAK_EVEN_MAX} <= roas_financeiro (${roasFinanceiro.toFixed(3)}) < target (${targetRoas})` };
  return { status: 'SCALE_CANDIDATE', reason: `roas_financeiro (${roasFinanceiro.toFixed(3)}) >= target (${targetRoas})` };
}

module.exports = { classifyProfitStatus, THRESHOLDS };
