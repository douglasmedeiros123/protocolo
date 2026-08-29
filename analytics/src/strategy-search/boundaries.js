'use strict';

// items 58/91-96 — limites explícitos. Nenhuma integração listada aqui escreve no domínio do
// outro lado — todas são leitura (mesmo padrão de offer/cro/creative/planner boundaries.js).
const OWNERSHIP_BOUNDARIES = {
  STRATEGY_SEARCH_VS_PLANNER: {
    planner_owns: ['qual caminho estratégico seguir dentro da arquitetura atual (verdict/capital_posture/roadmap)'],
    strategy_search_owns: ['se a própria arquitetura deveria mudar — funil, produto de entrada, mecanismo, sequência'],
    boundary_rule: 'Planner decide o QUE fazer dentro da arquitetura; Strategy Search decide SE a arquitetura em si merece mudar. Read-only — nunca altera planner/builder.js. Pode fornecer recommended_architecture/architecture_alternatives/architecture_evidence_gap/architecture_test ao Planner (item 91), nunca o contrário automaticamente.',
  },
  STRATEGY_SEARCH_VS_DECISION: {
    decision_owns: ['a próxima decisão operacional única'],
    strategy_search_owns: ['a estrutura de longo prazo que essas decisões operam dentro dela'],
    boundary_rule: 'Read-only/additivo (item 92) — nunca altera a decisão operacional existente.',
  },
  STRATEGY_SEARCH_VS_EXPERIMENT: {
    experiment_owns: ['registrar/rodar/medir uma hipótese individual real'],
    strategy_search_owns: ['gerar EXPERIMENT_DRAFT_PROPOSAL — nunca registrar automaticamente no Experiment Engine (item 93)'],
    boundary_rule: 'Strategy Search só PROPÕE um draft de experimento estruturalmente compatível — quem decide registrar de verdade é decisão humana + Experiment Engine.',
  },
  STRATEGY_SEARCH_VS_CRO: {
    cro_owns: ['otimização da página existente (copy, seções, testes de conversão dentro da LP atual)'],
    strategy_search_owns: ['se a página existente merece continuar sendo a arquitetura principal (item 94)'],
    boundary_rule: 'CRO otimiza o que já existe; Strategy Search decide se vale a pena continuar otimizando isso ou testar algo estruturalmente diferente.',
  },
  STRATEGY_SEARCH_VS_OFFER: {
    offer_owns: ['transaction economics — preço, bump, bundle, upsell/downsell específicos'],
    strategy_search_owns: ['qual PAPEL a oferta ocupa na arquitetura geral (item 95)'],
    boundary_rule: 'Offer decide os detalhes econômicos da transação; Strategy Search decide onde/como a oferta se encaixa na jornada estrutural.',
  },
  STRATEGY_SEARCH_VS_CREATIVE: {
    creative_owns: ['o asset de anúncio em si — hook, formato, ângulo'],
    strategy_search_owns: ['qual mensagem/entry architecture o criativo precisa alimentar (item 96)'],
    boundary_rule: 'Creative decide o asset; Strategy Search decide a arquitetura de entrada que esse asset precisa servir.',
  },
  STRATEGY_SEARCH_VS_PRODUCT_SWITCH: {
    rule: 'Trocar de FUNIL não é trocar de PRODUTO (item 58). Strategy Search nunca aciona SWITCH_PRODUCT nem o switch gate do Planner — isso permanece exclusivamente do Planner (PASSO 11, items 19-21).',
  },
};

module.exports = { OWNERSHIP_BOUNDARIES };
