'use strict';

// UPSELL/DOWNSELL MODEL (PASSO 10, item 39 + item 15 árvore) — MAIN PURCHASE -> UPSELL OFFER ->
// (aceita: UPSELL PURCHASE) | (rejeita: DOWNSELL 1 -> aceita/rejeita -> DOWNSELL 2). Nunca conta
// em dobro: quem aceita o upsell nunca é contado nos caminhos de downsell 1/2 (mutuamente
// exclusivos por construção da árvore). Preço/take rate ausentes -> null/NOT_ESTIMABLE, nunca
// um benchmark inventado.
function simulateUpsellDownsellTree({ upsellPrice, upsellTakeRate, downsell1Price, downsell1TakeRate, downsell2Price, downsell2TakeRate }) {
  const hasUpsell = upsellPrice != null && upsellTakeRate != null;
  const upsellRevenuePerBuyer = hasUpsell ? Math.round(upsellPrice * upsellTakeRate * 100) / 100 : null;

  const rejectedUpsellRate = hasUpsell ? 1 - upsellTakeRate : null;

  const hasDownsell1 = downsell1Price != null && downsell1TakeRate != null && rejectedUpsellRate != null;
  // downsell1TakeRate é a taxa DENTRO de quem já rejeitou o upsell (não do total de buyers) —
  // evita contar em dobro: só chega no downsell 1 quem rejeitou o upsell.
  const downsell1RevenuePerBuyer = hasDownsell1 ? Math.round(downsell1Price * downsell1TakeRate * rejectedUpsellRate * 100) / 100 : null;
  const rejectedDownsell1Rate = hasDownsell1 ? rejectedUpsellRate * (1 - downsell1TakeRate) : null;

  const hasDownsell2 = downsell2Price != null && downsell2TakeRate != null && rejectedDownsell1Rate != null;
  const downsell2RevenuePerBuyer = hasDownsell2 ? Math.round(downsell2Price * downsell2TakeRate * rejectedDownsell1Rate * 100) / 100 : null;

  const knownRevenues = [upsellRevenuePerBuyer, downsell1RevenuePerBuyer, downsell2RevenuePerBuyer].filter((v) => v != null);
  const totalPostPurchaseRevenuePerBuyer = knownRevenues.length > 0 ? Math.round(knownRevenues.reduce((s, v) => s + v, 0) * 100) / 100 : 'NOT_ESTIMABLE';

  return {
    tree: {
      main_purchase: { note: 'Toda transação real chega aqui — 100% da base de compradores.' },
      upsell_offer: hasUpsell
        ? { price: upsellPrice, take_rate: upsellTakeRate, revenue_per_buyer: upsellRevenuePerBuyer, accepted_share: upsellTakeRate, rejected_share: rejectedUpsellRate }
        : { price: upsellPrice ?? null, take_rate: upsellTakeRate ?? null, revenue_per_buyer: null, note: 'Preço/take rate não informados — NUNCA inventados/benchmarked.' },
      downsell_1: hasDownsell1
        ? { price: downsell1Price, take_rate_within_rejecters: downsell1TakeRate, revenue_per_buyer: downsell1RevenuePerBuyer, reached_share: rejectedUpsellRate }
        : { price: downsell1Price ?? null, take_rate_within_rejecters: downsell1TakeRate ?? null, revenue_per_buyer: null, note: 'Só alcançável por quem rejeitou o upsell — dado insuficiente pra estimar.' },
      downsell_2: hasDownsell2
        ? { price: downsell2Price, take_rate_within_rejecters: downsell2TakeRate, revenue_per_buyer: downsell2RevenuePerBuyer, reached_share: rejectedDownsell1Rate }
        : { price: downsell2Price ?? null, take_rate_within_rejecters: downsell2TakeRate ?? null, revenue_per_buyer: null, note: 'Só alcançável por quem rejeitou upsell E downsell 1.' },
    },
    total_post_purchase_revenue_per_buyer: totalPostPurchaseRevenuePerBuyer,
    no_double_counting: 'Cada comprador passa por NO MÁXIMO 1 caminho pago pós-compra (upsell OU downsell1 OU downsell2 OU nenhum) — taxas de downsell são condicionadas à rejeição do estágio anterior.',
    status: 'SCENARIO_NOT_FORECAST',
  };
}

module.exports = { simulateUpsellDownsellTree };
