'use strict';

// REVENUE TREE (PASSO 10, item 16) — com dado REAL (não hipotético): Buyer -> Main + Bump(s) +
// Post Purchase (upsell/downsell, hoje NOT_IMPLEMENTED). Permite calcular expected gross/net
// revenue per buyer SEM dupla contagem — cada real de receita pertence a exatamente 1 galho.
function buildRealRevenueTree(economics, aovDecomposition) {
  return {
    buyer: {
      main: {
        gross_revenue_per_buyer: aovDecomposition.components.main_product_contribution,
        note: 'Produto principal — todo comprador passa por aqui exatamente 1x.',
      },
      bumps: {
        gross_revenue_per_buyer: aovDecomposition.components.order_bump_contribution_gross,
        net_revenue_per_buyer: aovDecomposition.components.order_bump_contribution_net,
        attach_rate: economics.order_bump_attach_rate,
        note: 'Order bump(s) ATIVO(S) na tela de checkout — anexado à compra principal, nunca dupla contagem com pós-compra.',
      },
      post_purchase: {
        upsell: { gross_revenue_per_buyer: 'NOT_IMPLEMENTED' },
        downsell_path: { gross_revenue_per_buyer: 'NOT_IMPLEMENTED' },
        note: 'Nenhum fluxo pós-compra real existe hoje — ver sourceOfTruth.js.',
      },
    },
    expected_gross_revenue_per_buyer: aovDecomposition.gross_aov,
    expected_net_revenue_per_buyer: aovDecomposition.net_aov,
    reconciliation_note: aovDecomposition.reconciliation.note,
  };
}

module.exports = { buildRealRevenueTree };
