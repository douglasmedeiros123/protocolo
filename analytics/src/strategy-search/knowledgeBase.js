'use strict';

// item 25-26 — base de conhecimento estratégico: PRINCÍPIOS, nunca atribuídos a "gurus"
// (item 26 — nenhuma simulação de personalidade). Cada entrada é GENERAL_MARKETING_KNOWLEDGE por
// definição — nunca confundida com PRODUCT_SPECIFIC_EVIDENCE (item 24).
const MARKETING_KNOWLEDGE_BASE = {
  direct_response: 'Comunicação desenhada pra gerar uma ação mensurável imediata (clique, lead, compra), não só branding.',
  market_awareness: 'O quanto o mercado já sabe que tem o problema, que existe solução, e que este produto é uma opção — determina quanto a mensagem precisa "educar" antes de vender.',
  market_sophistication: 'O quanto o mercado já foi exposto a promessas similares — mercados sofisticados exigem mecanismo/ângulo diferenciado, não só a mesma promessa repetida.',
  mechanism: 'O "como" específico pelo qual a promessa é cumprida — diferencia a oferta de promessas genéricas concorrentes.',
  big_idea: 'O conceito central único que organiza toda a comunicação da oferta.',
  offer: 'O pacote completo do que é entregue, por quanto, com quais garantias — não é só o preço.',
  risk_reversal: 'Mecanismo que transfere o risco da decisão do comprador pro vendedor (garantia, teste, reembolso).',
  proof: 'Evidência de que a promessa é cumprida — depoimentos, dados, demonstração.',
  pricing: 'Como o preço é apresentado e justificado — não só o valor numérico.',
  anchoring: 'Referência de valor apresentada antes do preço final, pra calibrar a percepção de valor.',
  commitment: 'Grau de compromisso que a ação de compra exige do cliente — pode ser reduzido (micro-compromissos) ou aumentado (compromisso público) estrategicamente.',
  continuity: 'Estrutura de receita recorrente em vez de transação única.',
  ascension: 'Sequência planejada de ofertas crescentes ao longo do relacionamento com o cliente.',
  backend: 'Produtos/ofertas vendidos depois da primeira compra, geralmente de maior ticket/margem.',
  ltv: 'Valor total esperado de um cliente ao longo do relacionamento, não só da primeira transação.',
  retargeting: 'Comunicação direcionada a quem já teve contato prévio com a marca/oferta.',
  lead_nurture: 'Sequência de comunicação que constrói confiança/conhecimento antes de pedir a venda.',
  advertorial: 'Conteúdo com formato editorial que introduz a oferta de forma menos direta que um anúncio tradicional.',
  vsl: 'Vídeo estruturado pra vender — geralmente combina história, mecanismo, prova e oferta em sequência.',
  quiz: 'Interação que qualifica/segmenta o visitante e personaliza a comunicação seguinte.',
  webinar: 'Apresentação (ao vivo ou gravada) que ensina e converte ao final.',
  application: 'Processo de candidatura que filtra e qualifica antes de oferecer a venda.',
  subscription: 'Modelo de cobrança recorrente.',
  community: 'Espaço de pertencimento entre clientes, usado como camada de retenção/valor.',
  urgency: 'Elemento que limita o tempo disponível pra decisão.',
  scarcity: 'Elemento que limita a quantidade disponível.',
  guarantee: 'Compromisso formal que reduz o risco percebido da compra.',
  social_proof: 'Evidência de que outras pessoas já validaram a oferta.',
  objection_handling: 'Antecipação e resposta às razões pelas quais o cliente não compraria.',
  customer_journey: 'Sequência de etapas que um cliente percorre do primeiro contato até a compra (e depois).',
  conversion_friction: 'Qualquer elemento que dificulta ou atrasa a ação de conversão.',
  message_market_match: 'O quanto a mensagem específica ressoa com o estado de consciência real do público-alvo.',
  offer_market_fit: 'O quanto a estrutura específica da oferta (preço, formato, garantia) se encaixa no que o mercado está disposto a aceitar.',
};

function getKnowledgeConcept(key) { return MARKETING_KNOWLEDGE_BASE[key] || null; }

// item 27 — interface futura de pesquisa de mercado externa. Hoje sempre NOT_AVAILABLE — nunca
// chama web/API neste passo.
function getExternalMarketEvidence() {
  return { status: 'NOT_AVAILABLE', reason: 'pesquisa de mercado externa não implementada neste PASSO — reservado para agente futuro (item 27).', data: null };
}

// item 24 — helper de classificação: tudo que vem desta base é sempre GENERAL_MARKETING_KNOWLEDGE.
function tagAsGeneralKnowledge(conceptKeys) {
  return conceptKeys.map((k) => ({ concept: k, definition: getKnowledgeConcept(k), evidence_type: 'GENERAL_MARKETING_KNOWLEDGE' }));
}

module.exports = { MARKETING_KNOWLEDGE_BASE, getKnowledgeConcept, getExternalMarketEvidence, tagAsGeneralKnowledge };
