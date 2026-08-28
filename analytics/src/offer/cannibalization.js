'use strict';

// BUNDLE CANNIBALIZATION (PASSO 10, item 14) — modelo puramente estrutural: recebe taxas
// HIPOTÉTICAS como input (nunca inventadas internamente) e calcula o efeito líquido. NUNCA
// assume que um bundle melhora AOV automaticamente — se individualAttachRates ou
// bundleAttachRate não forem informados, retorna NOT_ESTIMABLE.
function modelBundleCannibalization({ individualBumpPrices, individualAttachRatesWithoutBundle, bundlePrice, bundleAttachRateIfOffered, individualAttachRatesWithBundle }) {
  const hasIndividualBaseline = Array.isArray(individualBumpPrices) && Array.isArray(individualAttachRatesWithoutBundle)
    && individualBumpPrices.length === individualAttachRatesWithoutBundle.length && individualBumpPrices.length > 0;

  if (!hasIndividualBaseline || bundlePrice == null || bundleAttachRateIfOffered == null) {
    return {
      cannibalization_rate: 'NOT_ESTIMABLE',
      net_incremental_effect: 'NOT_ESTIMABLE',
      reason: 'Faltam taxas de attach individuais e/ou do bundle — nunca inventadas. Informe individualBumpPrices/individualAttachRatesWithoutBundle/bundlePrice/bundleAttachRateIfOffered.',
    };
  }

  const revenueWithoutBundlePerBuyer = individualBumpPrices.reduce((sum, price, i) => sum + price * individualAttachRatesWithoutBundle[i], 0);

  // Se as taxas individuais COM bundle disponível não forem informadas, assume-se
  // conservadoramente que a oferta individual para de existir separadamente (0) — documentado,
  // não é uma suposição escondida.
  const withBundleRates = individualAttachRatesWithBundle || individualBumpPrices.map(() => 0);
  const revenueFromIndividualsWithBundlePerBuyer = individualBumpPrices.reduce((sum, price, i) => sum + price * withBundleRates[i], 0);
  const revenueFromBundlePerBuyer = bundlePrice * bundleAttachRateIfOffered;

  const totalRevenueWithBundlePerBuyer = revenueFromIndividualsWithBundlePerBuyer + revenueFromBundlePerBuyer;
  const netIncrementalEffect = Math.round((totalRevenueWithBundlePerBuyer - revenueWithoutBundlePerBuyer) * 100) / 100;

  // cannibalization_rate: quanto da receita que viria dos bumps individuais "migra" pro bundle
  // em vez de ser adicional — 0 = nenhuma canibalização (bundle é 100% incremental), 1 = 100%
  // canibalizado (bundle só substitui o que já seria vendido separado).
  const cannibalizationRate = revenueWithoutBundlePerBuyer > 0
    ? Math.max(0, Math.min(1, 1 - (netIncrementalEffect / revenueFromBundlePerBuyer || 0)))
    : null;

  return {
    revenue_without_bundle_per_buyer: Math.round(revenueWithoutBundlePerBuyer * 100) / 100,
    revenue_with_bundle_per_buyer: Math.round(totalRevenueWithBundlePerBuyer * 100) / 100,
    net_incremental_effect: netIncrementalEffect,
    cannibalization_rate: cannibalizationRate != null ? Math.round(cannibalizationRate * 10000) / 10000 : null,
    interpretation: netIncrementalEffect > 0
      ? 'Cenário informado projeta efeito líquido POSITIVO (aditivo, não garantido — SCENARIO_NOT_FORECAST).'
      : netIncrementalEffect < 0
        ? 'Cenário informado projeta efeito líquido NEGATIVO — o bundle pode estar canibalizando mais do que adicionando.'
        : 'Cenário informado projeta efeito líquido neutro.',
    status: 'SCENARIO_NOT_FORECAST',
  };
}

module.exports = { modelBundleCannibalization };
