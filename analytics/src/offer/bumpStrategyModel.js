'use strict';

const { modelBundleCannibalization } = require('./cannibalization');

// BUMP STRATEGY MODEL (PASSO 10, item 38) — simulador ESTRUTURAL da estratégia futura descrita
// (3 bumps de R$29 cada + bundle). Os R$29 são o ÚNICO número que o próprio PASSO 10 confirma
// como parte do plano — usado aqui só como PARÂMETRO PADRÃO do simulador (nunca como fato de
// receita existente; nenhum desses bumps está ACTIVE — ver sourceOfTruth.js). Attach rates e
// desconto do bundle são sempre INPUT explícito — nunca inventados internamente.
const PLANNED_BUMP_PRICE_DEFAULT = 29; // só um parâmetro de simulação, documentado como PLANNED

/**
 * simulateBumpStrategy() — se attachRates não forem informados, retorna a estrutura com
 * revenue_per_buyer_estimate: NOT_ESTIMABLE (nunca um número inventado).
 */
function simulateBumpStrategy({ bumpPrices = [PLANNED_BUMP_PRICE_DEFAULT, PLANNED_BUMP_PRICE_DEFAULT, PLANNED_BUMP_PRICE_DEFAULT], individualAttachRates, bundleDiscountPercent, bundleAttachRateIfOffered, individualAttachRatesWithBundle } = {}) {
  const bundlePriceFull = bumpPrices.reduce((s, p) => s + p, 0);
  const bundlePrice = bundleDiscountPercent != null ? Math.round(bundlePriceFull * (1 - bundleDiscountPercent) * 100) / 100 : null;

  const structural = {
    status: 'PLANNED_ARCHITECTURE — nenhum destes bumps está ACTIVE hoje.',
    bump_prices: bumpPrices,
    bundle_price_full: Math.round(bundlePriceFull * 100) / 100,
    bundle_price_with_discount: bundlePrice,
    bundle_discount_percent: bundleDiscountPercent ?? null,
  };

  if (!individualAttachRates || individualAttachRates.length !== bumpPrices.length) {
    return {
      ...structural,
      revenue_per_buyer_estimate: 'NOT_ESTIMABLE',
      reason: 'individualAttachRates não informado — nunca inventado. Passe uma taxa hipotética explícita por bump pra simular.',
    };
  }

  const individualOnlyRevenuePerBuyer = bumpPrices.reduce((sum, price, i) => sum + price * individualAttachRates[i], 0);

  let cannibalization = null;
  if (bundlePrice != null && bundleAttachRateIfOffered != null) {
    cannibalization = modelBundleCannibalization({
      individualBumpPrices: bumpPrices,
      individualAttachRatesWithoutBundle: individualAttachRates,
      bundlePrice,
      bundleAttachRateIfOffered,
      individualAttachRatesWithBundle,
    });
  }

  return {
    ...structural,
    individual_only_revenue_per_buyer_estimate: Math.round(individualOnlyRevenuePerBuyer * 100) / 100,
    bundle_cannibalization_model: cannibalization || { cannibalization_rate: 'NOT_ESTIMABLE', reason: 'bundleAttachRateIfOffered não informado.' },
    status: 'SCENARIO_NOT_FORECAST',
  };
}

module.exports = { simulateBumpStrategy, PLANNED_BUMP_PRICE_DEFAULT };
