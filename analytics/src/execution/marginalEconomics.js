'use strict';

// PASSO 14B, item 10 — a política deve priorizar MARGINAL_RETURN, não blended ROAS. Pergunta:
// "o que acontece com o próximo R$1?" NUNCA derivamos marginal economics de blended metric sem
// evidência real de que a relação é constante (ela quase nunca é — retornos marginais tendem a
// cair com escala). Sem dado real de teste incremental, fica UNKNOWN — nunca aproximado pelo
// blended.
/**
 * assessMarginalEconomics() — recebe dados reais de dois pontos de spend diferentes (se
 * existirem) pra estimar a relação marginal; sem isso, tudo fica UNKNOWN, nunca inferido do
 * blended ROAS sozinho.
 */
function assessMarginalEconomics({ blendedRoas, blendedCpa, hasIncrementalSpendTestData, incrementalSpendDelta, incrementalRevenueDelta }) {
  const blendedNote = 'blended_roas/blended_cpa são métricas REAIS mas nunca usadas como proxy de marginal — item 10.';

  if (!hasIncrementalSpendTestData || incrementalSpendDelta == null || incrementalRevenueDelta == null) {
    return {
      marginal_cpa: 'UNKNOWN', marginal_roas: 'UNKNOWN', incremental_revenue: 'UNKNOWN',
      incremental_contribution_profit: 'UNKNOWN', incremental_loss: 'UNKNOWN', incremental_uncertainty: 'HIGH',
      blended_roas: blendedRoas ?? null, blended_cpa: blendedCpa ?? null,
      reason: `nenhum dado real de teste incremental de spend disponível — marginal economics permanece UNKNOWN, nunca derivado do blended sozinho. ${blendedNote}`,
    };
  }

  const marginalRoas = incrementalSpendDelta > 0 ? incrementalRevenueDelta / incrementalSpendDelta : null;
  const marginalCpa = incrementalRevenueDelta !== 0 ? incrementalSpendDelta / incrementalRevenueDelta : null; // aproximação simples — cpa marginal por unidade de resultado

  return {
    marginal_cpa: marginalCpa,
    marginal_roas: marginalRoas,
    incremental_revenue: incrementalRevenueDelta,
    incremental_contribution_profit: incrementalRevenueDelta - incrementalSpendDelta,
    incremental_loss: incrementalRevenueDelta < incrementalSpendDelta,
    incremental_uncertainty: 'MEDIUM', // dado real de 2 pontos ainda não é uma curva completa — nunca HIGH confidence
    blended_roas: blendedRoas ?? null, blended_cpa: blendedCpa ?? null,
    reason: `computado a partir de dado real de incremento de spend (delta=${incrementalSpendDelta}) — nunca do blended. ${blendedNote}`,
  };
}

module.exports = { assessMarginalEconomics };
