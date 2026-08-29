'use strict';

// item 10-11 — biblioteca de padrões de funil. CONHECIMENTO ESTRUTURAL, não recomendação — nunca
// gera automaticamente uma alternativa pra cada família aqui. Cada entrada documenta estágios
// típicos e o mecanismo primário mais associado a ela (conhecimento geral, item 25), nunca uma
// afirmação de que funciona para ESTE produto (isso exigiria PRODUCT_SPECIFIC_EVIDENCE real).
const PATTERN_LIBRARY = {
  DIRECT_TO_OFFER: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'REDUCE_FRICTION', description: 'Anúncio leva direto pra uma página de oferta com CTA de compra imediato — menor distância entre intenção e compra.' },
  SALES_PAGE: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'INCREASE_COMPREHENSION', description: 'Página de vendas longa com stack de valor, prova e objeções antes do checkout.' },
  VSL: { typical_stages: ['AD', 'VSL', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Vídeo de vendas carrega a demonstração do mecanismo/prova antes da oferta.' },
  ADVERTORIAL: { typical_stages: ['AD', 'ADVERTORIAL', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'INCREASE_COMPREHENSION', description: 'Conteúdo em formato editorial pré-qualifica e constrói contexto antes da oferta.' },
  QUIZ: { typical_stages: ['AD', 'QUIZ', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'IMPROVE_QUALIFICATION', description: 'Quiz segmenta/qualifica o visitante e personaliza a oferta apresentada.' },
  LEAD_MAGNET: { typical_stages: ['AD', 'LEAD_CAPTURE', 'EMAIL', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Captura o lead com uma isca antes de apresentar a oferta paga.' },
  TRIPWIRE: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT', 'ORDER_BUMP', 'UPSELL'], typical_mechanism: 'INCREASE_AOV', description: 'Oferta de entrada barata seguida de upsells imediatos pra monetizar o comprador novo.' },
  WHATSAPP_ASSISTED: { typical_stages: ['AD', 'SALES_PAGE', 'WHATSAPP', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Atendimento humano/assistido via WhatsApp remove objeção antes da compra.' },
  EMAIL_ASSISTED: { typical_stages: ['AD', 'LEAD_CAPTURE', 'EMAIL', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Sequência de email nutre o lead antes da oferta.' },
  WEBINAR: { typical_stages: ['AD', 'WEBINAR', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Aula/webinar ao vivo ou gravado ensina e converte no final.' },
  APPLICATION: { typical_stages: ['AD', 'SALES_PAGE', 'APPLICATION', 'CHECKOUT'], typical_mechanism: 'IMPROVE_QUALIFICATION', description: 'Formulário de aplicação filtra o lead antes de oferecer a venda (comum em ticket mais alto).' },
  CHALLENGE: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'INCREASE_TRUST', description: 'Desafio de curta duração entrega valor incremental e converte ao longo do desafio.' },
  FREE_TRIAL: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT', 'ACCESS'], typical_mechanism: 'REDUCE_FRICTION', description: 'Acesso gratuito temporário reduz a fricção de decisão inicial.' },
  SUBSCRIPTION: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'INCREASE_LTV', description: 'Cobrança recorrente muda a economia de payback (LTV em vez de transação única).' },
  CONTINUITY: { typical_stages: ['CHECKOUT', 'ACCESS', 'EMAIL'], typical_mechanism: 'INCREASE_LTV', description: 'Estrutura de continuidade pós-compra pra reter e monetizar ao longo do tempo.' },
  COMMUNITY: { typical_stages: ['CHECKOUT', 'COMMUNITY', 'ACCESS'], typical_mechanism: 'INCREASE_LTV', description: 'Comunidade paga como camada de retenção/backend.' },
  FRONTEND_BACKEND: { typical_stages: ['AD', 'SALES_PAGE', 'CHECKOUT', 'UPSELL', 'DOWNSELL'], typical_mechanism: 'INCREASE_AOV', description: 'Produto de entrada desenhado pra alimentar um backend de maior ticket.' },
  CONTENT_TO_OFFER: { typical_stages: ['CONTENT', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'REDUCE_CPA', description: 'Tráfego orgânico/conteúdo alimenta a oferta, reduzindo dependência de mídia paga.' },
  ORGANIC_TO_OFFER: { typical_stages: ['CONTENT', 'LEAD_CAPTURE', 'SALES_PAGE', 'CHECKOUT'], typical_mechanism: 'REDUCE_CPA', description: 'Mesma lógica de CONTENT_TO_OFFER com captura intermediária.' },
  HYBRID: { typical_stages: [], typical_mechanism: 'OTHER', description: 'Combinação de 2+ famílias — não tem estágios típicos fixos, é composta caso a caso (item 12).' },
  CUSTOM: { typical_stages: [], typical_mechanism: 'OTHER', description: 'Arquitetura sem correspondência a um nome clássico — não exige nome (item 12).' },
};

function getPattern(family) { return PATTERN_LIBRARY[family] || null; }

module.exports = { PATTERN_LIBRARY, getPattern };
