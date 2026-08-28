'use strict';

// BREAK-EVEN ANALYSIS (PASSO 10, item 37) — attach/take rate mínimo pra valor incremental
// positivo. Exige custo/margem conhecidos (custo de produção/entrega do componente) — sem isso,
// NOT_CALCULABLE (nunca um número inventado). Este pipeline não rastreia custo de produção
// hoje, então na prática retorna NOT_CALCULABLE pra tudo — documentado, não escondido.
function computeMinimumAttachRateForPositiveIncrementalValue({ componentPrice, componentCostIfKnown, fixedImplementationCost = 0 }) {
  if (componentPrice == null || componentCostIfKnown == null) {
    return { minimum_attach_rate: 'NOT_CALCULABLE', reason: 'componentCostIfKnown (margem/custo do componente) não é rastreado por este pipeline — sem isso não dá pra calcular break-even real, só listar o componente que falta.' };
  }
  const marginPerUnit = componentPrice - componentCostIfKnown;
  if (marginPerUnit <= 0) return { minimum_attach_rate: null, reason: 'Margem por unidade <= 0 — nenhum attach rate produz valor incremental positivo.' };
  const minimumAttachRate = fixedImplementationCost > 0 ? fixedImplementationCost / marginPerUnit : 0;
  return { minimum_attach_rate: Math.round(minimumAttachRate * 10000) / 10000, margin_per_unit: marginPerUnit };
}

function computeMinimumTakeRateForPositiveIncrementalValue(args) {
  // mesma matemática do attach rate — motivo pra separar em duas funções nomeadas: o item 37
  // pede as duas explicitamente, com terminologia diferente (attach=bump/bundle, take=upsell/downsell).
  return computeMinimumAttachRateForPositiveIncrementalValue(args);
}

module.exports = { computeMinimumAttachRateForPositiveIncrementalValue, computeMinimumTakeRateForPositiveIncrementalValue };
