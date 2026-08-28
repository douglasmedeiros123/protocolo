'use strict';

// OFFER PERFORMANCE LAYERS (PASSO 10, item 17) — 10 camadas, cada uma com influence_strength
// documentado (nunca usado cegamente). Camadas de componentes NOT_IMPLEMENTED (BUNDLE_ADOPTION/
// POST_PURCHASE_UPSELL/DOWNSELL_RECOVERY hoje) reportam metric:null explicitamente, nunca 0.
function diagnoseOfferPerformanceLayers({ economics, roas3Gap }) {
  return {
    ENTRY_PRICE: {
      metric: 'confirmed_price', value: null, influence_strength: 'MEDIUM',
      note: 'Preço de entrada (R$67) é fixo/conhecido — este agente não decide alterar preço real, só modela cenários (item: NÃO altera preço real).',
    },
    MAIN_CONVERSION: {
      metric: 'buyers', value: economics.buyers, influence_strength: 'HIGH',
      note: 'Compradores reais no período — insumo de todo o resto da economia da oferta.',
    },
    BUMP_ATTACH: {
      metric: 'order_bump_attach_rate', value: economics.order_bump_attach_rate, influence_strength: 'HIGH',
      note: 'Proxy no nível de TRANSAÇÃO (linhas de bump / pedidos), não buyer-level — ver offer/buyerAttribution.js pro buyer_level_attach_rate real (PASSO 10.1).',
    },
    BUNDLE_ADOPTION: {
      metric: null, value: null, influence_strength: 'MEDIUM',
      note: 'NOT_IMPLEMENTED — nenhum bundle real existe hoje (ver sourceOfTruth.js). Nunca reportado como 0.',
    },
    POST_PURCHASE_UPSELL: {
      metric: null, value: null, influence_strength: 'HIGH',
      note: 'NOT_IMPLEMENTED — nenhum upsell real existe hoje. Potencial camada de monetização ainda não explorada.',
    },
    DOWNSELL_RECOVERY: {
      metric: null, value: null, influence_strength: 'MEDIUM',
      note: 'NOT_IMPLEMENTED — nenhum downsell real existe hoje.',
    },
    REFUND: {
      metric: 'refund_rate', value: economics.refund_rate, influence_strength: 'HIGH',
      note: 'Refund erode tanto receita bruta quanto confiança na oferta — sempre olhado junto com qualquer ganho de AOV.',
    },
    NET_REVENUE: {
      metric: 'net_aov', value: economics.net_aov, influence_strength: 'HIGH',
      note: 'Receita líquida por comprador — a métrica que realmente entra no ROAS financeiro.',
    },
    MARGIN: {
      metric: null, value: null, influence_strength: 'INDIRECT',
      note: 'Margem de custo (produção/entrega do produto/bumps) não é rastreada por este pipeline hoje — sempre null, nunca 0.',
    },
    FINANCIAL_ECONOMICS: {
      metric: 'financial_roas', value: roas3Gap.current_financial_roas, influence_strength: 'INDIRECT',
      note: 'A oferta influencia o ROAS financeiro, mas não o determina sozinha (CPA/mídia também pesam) — nunca atribuída como causa única.',
    },
  };
}

module.exports = { diagnoseOfferPerformanceLayers };
