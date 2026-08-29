'use strict';

const { classifyCausalMethod } = require('./causalDiscipline');

// PASSO 13.1, item 4 — auditoria da cadeia real EXPOSURE -> VARIANT -> SESSION/IDENTITY ->
// DOWNSTREAM ACTION -> FINANCIAL TRANSACTION -> NET REVENUE. Pergunta central: mesmo adicionando
// CHECKOUT_INITIATED amanhã, conseguiríamos atribuir corretamente o outcome financeiro à
// variante testada? Resposta: só em nível de SESSÃO individual não — falta session_id/variant_id
// reais pra isso (nunca vai existir só por causa de mais um evento). Em nível de DATA/ARQUITETURA
// (o método real disponível hoje), sim — Hotmart já linka toda transação por order_date_utc.
function auditExposureToFinancialOutcomeChain({ hasSessionId, hasVariantId, hasArchitectureVersionTimeline }) {
  const chain = [
    { stage: 'EXPERIMENT_EXPOSURE', status: hasVariantId ? 'AVAILABLE_AT_SESSION_LEVEL' : (hasArchitectureVersionTimeline ? 'AVAILABLE_AT_DATE_RANGE_LEVEL' : 'NOT_AVAILABLE'), note: 'sem variant_id real, exposição só é conhecida no nível de qual arquitetura estava live em qual data — não por sessão individual.' },
    { stage: 'VARIANT', status: hasVariantId ? 'AVAILABLE_AT_SESSION_LEVEL' : 'NOT_AVAILABLE_AT_SESSION_LEVEL', note: 'nenhum variant_id real persiste hoje (identifierSpine).' },
    { stage: 'SESSION_IDENTITY', status: hasSessionId ? 'AVAILABLE' : 'NOT_AVAILABLE', note: 'sem session_id real no pipeline (identifierSpine) — nenhuma ação downstream é linkável a uma exposição específica no nível de usuário.' },
    { stage: 'DOWNSTREAM_ACTION', status: 'PARTIAL', note: 'ações agregadas por dia existem (lpv/checkout via Meta); ações por sessão individual não.' },
    { stage: 'FINANCIAL_TRANSACTION', status: 'AVAILABLE_AT_DATE_LEVEL', note: 'Hotmart confirma toda transação real com order_date_utc — já linkável por data, sem instrumentação nova.' },
    { stage: 'NET_REVENUE', status: 'AVAILABLE_AT_DATE_LEVEL', note: 'net_revenue por data já é computável hoje (profit/aggregate.js) — mesma granularidade da transação.' },
  ];

  const sessionLevelPossible = hasSessionId && hasVariantId;
  const dateRangeLevelPossible = hasArchitectureVersionTimeline; // requer saber qual arquitetura rodou em qual data — hoje NÃO existe um registro explícito disso

  return {
    chain,
    session_level_attribution_possible: sessionLevelPossible,
    date_range_level_attribution_possible: dateRangeLevelPossible,
    // item 4 — resposta direta à pergunta central, nunca disfarçada.
    would_checkout_initiated_alone_unlock_full_attribution: false,
    why: 'CHECKOUT_INITIATED é um evento de FUNIL (explica onde o visitante estava), não um evento de IDENTIDADE/EXPOSIÇÃO — mesmo com ele implementado amanhã, sem session_id/variant_id reais, o outcome financeiro continuaria não-atribuível a uma variante específica no nível de sessão. O verdadeiro blocker da cadeia é EXPOSURE_IDENTITY (session_id/variant_id), não CHECKOUT_INITIATED.',
    true_bottleneck_stage: sessionLevelPossible ? null : (dateRangeLevelPossible ? null : 'EXPOSURE_IDENTITY'),
  };
}

/**
 * buildMinimumViableAttribution() — item 5. Não exige tracking perfeito — exige o suficiente pra
 * ESTA decisão específica. Hoje, sem session_id/variant_id, o único método realmente disponível
 * SEM nenhuma instrumentação nova é comparação agregada por data (before/after), porque Hotmart
 * já linka toda transação real por data (order_date_utc) — financial outcome linkage já existe.
 */
function buildMinimumViableAttribution({ hasArchitectureVersionTimeline = false } = {}) {
  const chainAudit = auditExposureToFinancialOutcomeChain({ hasSessionId: false, hasVariantId: false, hasArchitectureVersionTimeline });
  const causal = classifyCausalMethod({ hasRandomization: false, hasControlGroup: false, comparesBeforeAfter: true, isMultiVariable: false });

  return {
    method: 'AGGREGATE_TEMPORAL_COMPARISON', // único método hoje sem instrumentação nova nenhuma
    available_methods: [
      { method: 'AGGREGATE_TEMPORAL_COMPARISON', status: 'AVAILABLE_TODAY', requires: hasArchitectureVersionTimeline ? [] : ['registro de qual arquitetura esteve live em qual data (leve — não é instrumentação de evento, é um registro operacional)'] },
      { method: 'AGGREGATE_PARALLEL_CAMPAIGN_COMPARISON', status: 'NEEDS_OPERATIONAL_SETUP', requires: ['campanha/adset Meta separado por variante — decisão operacional, não de tracking'] },
      { method: 'SESSION_LEVEL_RANDOMIZED_EXPERIMENT', status: 'NOT_AVAILABLE', requires: ['session_id real', 'variant_id real', 'sistema de randomização'] },
    ],
    which_variant_was_exposed: hasArchitectureVersionTimeline ? 'AVAILABLE_AT_DATE_RANGE_LEVEL' : 'NEEDS_LIGHTWEIGHT_IMPLEMENTATION',
    which_financial_outcome_occurred: 'AVAILABLE — HOTMART.TRANSACTION_APPROVED já linkado por order_date_utc, sem trabalho novo.',
    net_revenue_belonging_to_test: 'AVAILABLE_AT_AGGREGATE_LEVEL — soma de net_revenue no intervalo de datas do teste vs. baseline.',
    contamination_that_remains: [
      'sazonalidade/dia-da-semana pode se confundir com o efeito testado (BEFORE_AFTER nunca é CAUSAL_PROOF, item 25)',
      'mudanças simultâneas de criativo/oferta/campanha no mesmo período contaminam o resultado',
      'tráfego orgânico/direto não separável do pago no mesmo período',
    ],
    defensible_confidence_level: causal.causal_confidence, // LOW — nunca inflado
    causal_method: causal.method,
    sufficient_for_decision: true,
    sufficiency_note: 'suficiente pra uma decisão binária de baixo-risco/reversível (manter ou reverter a mudança de arquitetura) com confiança causal LOW e explicitamente rotulada como tal — nunca suficiente pra uma alegação causal forte ou pra decisões de alto capital irreversíveis.',
    what_would_upgrade_confidence: ['session_id + variant_id reais permitiriam comparação aleatorizada concorrente, elevando de LOW pra MEDIUM/HIGH', 'registro explícito de qual arquitetura esteve live em qual data eliminaria a única lacuna do método agregado hoje'],
    exposure_to_financial_outcome_chain: chainAudit,
  };
}

module.exports = { auditExposureToFinancialOutcomeChain, buildMinimumViableAttribution };
