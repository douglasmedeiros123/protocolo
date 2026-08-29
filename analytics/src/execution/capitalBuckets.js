'use strict';

const { CAPITAL_BUCKETS } = require('./enums');

// PASSO 14B, item 6 — 5 buckets de capital, cada um com propósito/regras/EV/VOI distintos.
// EV != VOI é preservado explicitamente (um bucket pode ter EV baixo/negativo e ainda ser a
// melhor alocação por causa do VOI, e vice-versa). Nenhum percentual é forçado — allocation_
// percent fica NOT_CONFIGURED até uma decisão externa real (item 6: "não force percentuais ainda").
function buildCapitalBucketDefinitions() {
  return {
    VALIDATION_CAPITAL: {
      purpose: 'confirmar economicamente se uma hipótese/arquitetura funciona antes de escalar — o capital dos MVA tests do Strategy Search.',
      allowed_actions: ['START_EXPERIMENT'],
      risk_profile: 'MEDIUM — perda esperada limitada, mas resultado binário (funciona/não funciona).',
      approval_rules: 'segue authorityTiers.js/humanApprovalMatrix.js normalmente — nenhuma regra especial de bucket além disso.',
      expected_information_value: 'ALTA por definição (é o propósito do bucket) — VOI > EV como critério de aceitação.',
      expected_economic_value: 'UNKNOWN por padrão — não inventado; vem do MVA test específico quando existir.',
      max_loss_logic: 'limitado ao capital do MVA test específico (mvaTest.estimated_measurement_capital, hoje NOT_ESTIMABLE — nunca 0 por omissão).',
      replenishment_logic: 'NOT_CONFIGURED — depende de política de capital real.',
    },
    EXPLOITATION_CAPITAL: {
      purpose: 'escalar o que JÁ tem evidência econômica confirmada (financially_reconciled) — nunca hipóteses ainda não testadas.',
      allowed_actions: ['ADJUST_BUDGET', 'ADJUST_BID', 'ACTIVATE_CAMPAIGN'],
      risk_profile: 'depende do estágio da scaleLadder — mais alto quanto mais agressivo o estágio.',
      approval_rules: 'exige measurement_readiness=READY_FOR_CAPITAL como pré-condição (mesmo princípio do capital_gate do Measurement Agent).',
      expected_information_value: 'BAIXA — não é o propósito, é aproveitar o que já se sabe.',
      expected_economic_value: 'deve ser POSITIVO e financeiramente reconciliado — nunca alocado em EV negativo/desconhecido.',
      max_loss_logic: 'NOT_CONFIGURED — depende de política de capital real (max_daily_capital).',
      replenishment_logic: 'NOT_CONFIGURED.',
    },
    EXPLORATION_CAPITAL: {
      purpose: 'evitar que a máquina fique permanentemente conservadora — testar direções novas quando VOI justificar (item 7).',
      allowed_actions: ['START_EXPERIMENT'],
      risk_profile: 'ALTO — aceita EV negativo esperado quando VOI compensa (mesmo princípio de lossBudget.js).',
      approval_rules: 'sujeito a explorationPolicy.js — nunca um percentual fixo automático.',
      expected_information_value: 'critério de aceitação primário.',
      expected_economic_value: 'PODE ser negativo — nunca é motivo de rejeição sozinho quando VOI/risco/reversibilidade justificam.',
      max_loss_logic: 'sujeito a MAX_ACCEPTABLE_LEARNING_LOSS (lossBudget.js) — nunca ilimitado.',
      replenishment_logic: 'NOT_CONFIGURED.',
    },
    MEASUREMENT_CAPITAL: {
      purpose: 'financiar a instrumentação/medição necessária pra tornar outras decisões interpretáveis — não é uma aposta de negócio, é custo de infraestrutura de decisão.',
      allowed_actions: ['UPDATE_TRACKING_CONFIG'],
      risk_profile: 'BAIXO — custo conhecido, não é apostado em resultado incerto.',
      approval_rules: 'segue MEASUREMENT_READINESS_POLICY — nunca gasto sem uma lacuna real de mensuração identificada (measurement/measurementDebt.js).',
      expected_information_value: 'estrutural — habilita medir outros EVs/VOIs corretamente no futuro.',
      expected_economic_value: 'NOT_APPLICABLE — não é o critério certo pra este bucket.',
      max_loss_logic: 'limitado ao custo de implementação, nunca capital de mídia.',
      replenishment_logic: 'NOT_CONFIGURED.',
    },
    RESERVE_CAPITAL: {
      purpose: 'capital deliberadamente NÃO alocado — proteção contra perda inesperada, ou aguardando melhor oportunidade (item "reserve capital is valid best allocation").',
      allowed_actions: [], // nenhuma ação de gasto — é o "não fazer nada" formalizado em capital
      risk_profile: 'NENHUM por definição.',
      approval_rules: 'manter em reserva nunca exige aprovação — é o estado seguro por padrão.',
      expected_information_value: 'NOT_APPLICABLE.',
      expected_economic_value: 'NOT_APPLICABLE — capital parado não gera EV nem perda operacional.',
      max_loss_logic: 'zero, por definição (não é gasto).',
      replenishment_logic: 'NOT_CONFIGURED.',
    },
  };
}

module.exports = { CAPITAL_BUCKETS, buildCapitalBucketDefinitions };
