'use strict';

const { safeDiv } = require('../metrics/safeDiv');

// AOV DECOMPOSITION (PASSO 10, item 11) — decompõe o AOV bruto/líquido nas contribuições reais
// de cada componente, por comprador. Componente sem transação real vira NOT_IMPLEMENTED (nunca
// 0 — ver item 10: UNKNOWN != ZERO). A soma dos componentes ATIVOS sempre bate com o
// gross_aov/net_aov agregado (mesma fonte, profit/aggregate.js) — nunca uma soma forçada.
function decomposeAov(economics) {
  const buyers = economics.buyers;
  const mainProductContribution = safeDiv(economics.main_product_revenue, buyers);
  const orderBumpContributionGross = safeDiv(economics.order_bump_revenue_gross, buyers);
  const orderBumpContributionNet = safeDiv(economics.order_bump_revenue_net, buyers);

  return {
    gross_aov: economics.gross_aov,
    net_aov: economics.net_aov,
    net_revenue_per_buyer: economics.net_aov, // mesmo conceito, nome explícito pedido no item 11
    components: {
      main_product_contribution: mainProductContribution,
      order_bump_contribution_gross: orderBumpContributionGross,
      order_bump_contribution_net: orderBumpContributionNet,
      // PASSO 10.1, item 9 — isto é receita AGREGADA (todo bump revenue / todos os compradores),
      // NÃO atribuição buyer-level (nem todo bump pôde ser ligado a um comprador específico —
      // ver offer/buyerAttribution.js). Nunca confundir com attach attribution.
      order_bump_contribution_attribution_level: 'AGGREGATE_REVENUE_CONTRIBUTION',
      // Nenhum destes existe hoje (ver sourceOfTruth.js) — NUNCA 0, sempre explícito.
      bundle_contribution: 'NOT_IMPLEMENTED',
      upsell_contribution: 'NOT_IMPLEMENTED',
      downsell_contribution: 'NOT_IMPLEMENTED',
    },
    reconciliation: {
      sum_of_known_contributions_gross: mainProductContribution != null && orderBumpContributionGross != null
        ? Math.round((mainProductContribution + orderBumpContributionGross) * 100) / 100
        : null,
      matches_gross_aov: mainProductContribution != null && orderBumpContributionGross != null && economics.gross_aov != null
        ? Math.abs((mainProductContribution + orderBumpContributionGross) - economics.gross_aov) < 0.01
        : null,
      note: 'Soma dos componentes CONHECIDOS reconciliada contra o gross_aov agregado (mesma fonte) — nunca uma soma forçada quando um componente é NOT_IMPLEMENTED/UNKNOWN.',
    },
  };
}

module.exports = { decomposeAov };
