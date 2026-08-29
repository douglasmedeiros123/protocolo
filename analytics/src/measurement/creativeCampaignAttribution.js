'use strict';

/**
 * buildCreativeCampaignAttributionGaps() — item 36-37. Consome Creative Intelligence só por
 * leitura (nunca duplica o agent) e relata explicitamente o que falta pra ligar criativo/campanha
 * -> clique/sessão -> transação -> resultado financeiro — nunca fabrica essa linkagem.
 */
function buildCreativeCampaignAttributionGaps({ creativeAssetsCount, groundTruthDomains }) {
  return {
    creative_attribution: {
      status: groundTruthDomains.CREATIVE_ATTRIBUTION.status,
      assets_with_performance_data: creativeAssetsCount,
      assets_with_confirmed_financial_attribution: 0, // nunca inventado — nenhum criativo específico tem venda financeira confirmada ligada a ele hoje
      missing_to_link: ['session_id por clique de anúncio', 'transaction_id do lado Meta (não existe)', 'join determinístico creative_id -> transaction_id'],
      reason: 'performance por criativo (spend/ctr/compra_meta) é real; qualquer alegação de "este criativo específico gerou R$X de receita confirmada" seria inventada — a Hotmart não carrega ad_id (item 11 do audit real).',
    },
    campaign_attribution: {
      status: groundTruthDomains.CAMPAIGN_ATTRIBUTION.status,
      missing_to_link: ['mesmo gap estrutural de creative_attribution, em nível de campanha'],
      reason: 'desempenho de campanha Meta != atribuição financeira automática de campanha (mesmo princípio do item 2 aplicado a campanha).',
    },
  };
}

module.exports = { buildCreativeCampaignAttributionGaps };
