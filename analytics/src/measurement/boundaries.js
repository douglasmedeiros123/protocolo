'use strict';

// item 45 — limites explícitos, read-only/aditivo com todo agent anterior — nunca altera o
// builder.js de outro domínio (mesmo padrão de boundaries.js do resto do projeto).
const OWNERSHIP_BOUNDARIES = {
  MEASUREMENT_VS_STRATEGY_SEARCH: {
    strategy_search_owns: ['qual arquitetura testar, ranking, recomendação estratégica, test_eligibility (elegibilidade estratégica ampla)'],
    measurement_owns: ['se é responsável do ponto de vista de MEDIÇÃO colocar capital nessa arquitetura específica (capital_gate) — nunca se a estratégia em si é boa'],
    boundary_rule: 'Strategy Search decide O QUE testar; Measurement decide SE dá pra medir isso com confiança suficiente pra gastar capital. Read-only sobre analyzeStrategy() — nunca reescreve challengers/ranking/recommendation.',
  },
  MEASUREMENT_VS_PLANNER: {
    planner_owns: ['a próxima ação estratégica dentro da arquitetura atual'],
    measurement_owns: ['a confiança de mensuração por trás dos números que o Planner usa (tracking_scopes/tracking_assessment já existentes no Planner são consumidos, nunca duplicados)'],
    boundary_rule: 'Read-only sobre analyzePlan() — nunca altera decision/roadmap/capital_plan do Planner.',
  },
  MEASUREMENT_VS_EXPERIMENT: {
    experiment_owns: ['registrar/rodar/medir uma hipótese individual real'],
    measurement_owns: ['o contrato de mensuração que um experimento precisaria ter pra ser interpretável (Experiment Measurement Contract) — nunca registra nem executa nada em experiments/registry.js'],
    boundary_rule: 'Só gera template/contrato — nunca chama saveExperiment.',
  },
  MEASUREMENT_VS_CREATIVE_CRO_OFFER: {
    creative_cro_offer_own: ['o asset/página/oferta em si'],
    measurement_owns: ['auditar o que falta pra ligar performance desses domínios a resultado financeiro confirmado — nunca fabrica essa linkagem, nunca altera os agents'],
    boundary_rule: 'Read-only — consome registry.js de cada domínio, nunca escreve neles.',
  },
  MEASUREMENT_VS_DECISION: {
    decision_owns: ['tracking_assessment (BLOCKING/DEGRADING) já usado pra decisão operacional'],
    measurement_owns: ['a auditoria completa de mensuração/atribuição — reusa decision/trackingAssessment.js por leitura, nunca duplica nem substitui'],
    boundary_rule: 'assessTracking() é chamado, nunca reimplementado.',
  },
  MEASUREMENT_NEVER_IMPLEMENTS_TRACKING: {
    rule: 'este agent NUNCA edita GTM, instala GA4/Pixel/CAPI, altera Hotmart, insere script em página real, nem cria a Advertorial ou qualquer página nova (items 27/54). Só audita, contrata e recomenda.',
  },
  // PASSO 13.1, item 13 — contrato futuro, documentado aqui, nunca implementado agora. LLM
  // recommendation != execution authority. execution_safety_signal (executionSafetySignal.js) é
  // um sinal READ-ONLY consumido futuramente por uma Policy Engine real — este Agent nunca
  // executa freeze/bloqueio/qualquer ação diretamente.
  FUTURE_CIRCUIT_BREAKER_CONTRACT: {
    architecture: 'CEO/ORCHESTRATOR -> POLICY ENGINE -> EXECUTION LAYER -> EXTERNAL API',
    measurement_role: 'fornece execution_safety_signal (severity/affected_scope/affected_decision_types/capital_action/reason/requires_human_review/resolution_condition) — nunca a Policy Engine em si.',
    rule: 'Circuit Breaker/runtime guardrails ficam fora da autoridade da LLM. Measurement fornece sinais; NÃO executa freeze/bloqueio diretamente. Isso será consumido futuramente pelo PASSO 14 — não implementado aqui.',
  },
};

module.exports = { OWNERSHIP_BOUNDARIES };
