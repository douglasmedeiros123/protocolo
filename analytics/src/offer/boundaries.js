'use strict';

// OWNERSHIP BOUNDARIES (PASSO 10, itens 40/46/47) — documenta explicitamente quem decide o quê,
// pra dois agentes nunca "possuírem" a mesma decisão. Consumido pela análise (transparência) e
// pelos testes (garante que nenhum módulo do Offer Agent decide fora do seu escopo).
const OWNERSHIP_BOUNDARIES = {
  OFFER_VS_CRO: {
    cro_owns: ['PRICE_PRESENTATION (como o preço aparece/é comunicado na LP)', 'layout/copy da página de vendas', 'visibilidade do CTA'],
    offer_owns: ['preço/estrutura real da transação', 'economia real (AOV, attach/take rate, refund, margem)', 'composição de bump/bundle/upsell/downsell'],
    boundary_rule: 'CRO decide COMO a oferta é apresentada na LP; Offer decide O QUE a oferta É economicamente. Nenhum dos dois altera preço real.',
  },
  OFFER_VS_CREATIVE: {
    creative_owns: ['hook/ângulo do anúncio', 'como comunicar a oferta pro tráfego frio'],
    offer_owns: ['preço', 'estrutura de componentes', 'economia real da transação'],
    boundary_rule: 'Creative comunica a oferta; Creative NÃO decide preço. Offer define a economia; Offer NÃO decide hook de anúncio.',
  },
  OFFER_VS_LIFECYCLE: {
    offer_owns: ['TRANSACTION_AOV — economia da transação única (compra + bump/bundle/upsell/downsell no momento da compra)'],
    lifecycle_owns: ['LIFETIME_VALUE — receita futura via WhatsApp/e-mail pós-compra, recompra, retenção'],
    boundary_rule: 'Este agente cuida SOMENTE de TRANSACTION_AOV. LIFETIME_VALUE é um Agent futuro (Lifecycle/CRM), NÃO implementado aqui (item 40) — nunca confundir os dois conceitos nos outputs deste agente.',
  },
};

module.exports = { OWNERSHIP_BOUNDARIES };
