'use strict';

// PASSO 11, items 61-67 — limites explícitos de responsabilidade entre o Strategic Planner e
// cada engine/agente já existente. Nenhuma integração listada aqui escreve no domínio do outro
// lado — todas são leitura (mesmo padrão dos boundaries de offer/cro/creative).
const OWNERSHIP_BOUNDARIES = {
  PLANNER_VS_DECISION: {
    decision_owns: ['qual decisão operacional agora (RUN_EXPERIMENT/FIX_TRACKING/COLLECT_MORE_DATA/PROTECT_CAPITAL/MAINTAIN/PREPARE_SCALE)', 'tranches de capital', 'a próxima decisão tática única'],
    planner_owns: ['qual caminho estratégico estamos seguindo e por quê', 'sequência de várias decisões ao longo do tempo', 'veredito de viabilidade do produto'],
    boundary_rule: 'Decision Engine responde "qual decisão operacional agora?"; Planner responde "qual caminho estratégico e por quê?". Planner NUNCA altera decision/builder.js — integração é leitura pura (decision/*Integration.js).',
  },
  PLANNER_VS_PROFIT: {
    profit_owns: ['qual é a economia real (ROAS, CPA, AOV, lucro) — cálculo determinístico a partir de dados persistidos'],
    planner_owns: ['o que essa economia implica para a estratégia (verdict, viability, roadmap)'],
    boundary_rule: 'Profit Engine calcula os números; Planner interpreta o que eles significam estrategicamente. Planner nunca recalcula a economia com fórmula própria — sempre reusa profit/aggregate.js + profit/financials.js.',
  },
  PLANNER_VS_EXPERIMENT: {
    experiment_owns: ['como registrar/rodar/medir uma hipótese individual', 'lifecycle de status de um experimento'],
    planner_owns: ['qual hipótese merece entrar na sequência estratégica (roadmap NOW/NEXT/LATER)'],
    boundary_rule: 'Experiment Engine é o mecanismo de teste; Planner decide a ORDEM estratégica de uso desse mecanismo. Planner nunca cria/executa/altera status de experimento.',
  },
  PLANNER_VS_CREATIVE: {
    creative_owns: ['qual criativo/candidato específico gerar ou testar'],
    planner_owns: ['quanto peso estratégico dar ao lever CREATIVE agora, frente às outras alavancas'],
    boundary_rule: 'Creative decide o quê testar dentro do próprio domínio; Planner decide SE agora é a hora de investir nesse lever.',
  },
  PLANNER_VS_CRO: {
    cro_owns: ['qual hipótese de conversão/técnica investigar na LP'],
    planner_owns: ['vale investigar CRO agora, antes ou depois de outra ação (ex.: validar bug técnico antes de rodar experimento pago)'],
    boundary_rule: 'CRO decide O QUE investigar; Planner decide QUANDO, relativo às outras alavancas e ao capital disponível.',
  },
  PLANNER_VS_OFFER: {
    offer_owns: ['como melhorar a economia da transação (bump/bundle/upsell/downsell) especificamente'],
    planner_owns: ['quanto essa melhoria pode contribuir pra fechar o gap estratégico do ROAS 3'],
    boundary_rule: 'Offer modela a economia da oferta; Planner traduz isso em contribuição pro gap estratégico geral.',
  },
  PLANNER_VS_LIFECYCLE: {
    lifecycle_owns: ['como gerar receita incremental pós-lead/pós-compra (AINDA NÃO IMPLEMENTADO)'],
    planner_owns: ['quanto Lifecycle, quando existir, alteraria a viabilidade econômica — hoje é UNQUANTIFIED_LEVER'],
    boundary_rule: 'Lifecycle não existe ainda (item 67) — o Planner reconhece essa alavanca como UNQUANTIFIED, nunca estima seu valor sem o agente real.',
  },
};

module.exports = { OWNERSHIP_BOUNDARIES };
