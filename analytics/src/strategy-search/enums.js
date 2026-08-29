'use strict';

// PASSO 12 — enums centrais do Strategy Search + Funnel Architecture Intelligence. Um arquivo
// só, mesmo padrão consolidado do planner/enums.js.

// item 10 — famílias de padrão de funil. Biblioteca de CONHECIMENTO ESTRUTURAL — nunca gera
// automaticamente uma alternativa pra cada família (item 11).
const FUNNEL_FAMILIES = [
  'DIRECT_TO_OFFER', 'SALES_PAGE', 'VSL', 'ADVERTORIAL', 'QUIZ', 'LEAD_MAGNET', 'TRIPWIRE',
  'WHATSAPP_ASSISTED', 'EMAIL_ASSISTED', 'WEBINAR', 'APPLICATION', 'CHALLENGE', 'FREE_TRIAL',
  'SUBSCRIPTION', 'CONTINUITY', 'COMMUNITY', 'FRONTEND_BACKEND', 'CONTENT_TO_OFFER',
  'ORGANIC_TO_OFFER', 'HYBRID', 'CUSTOM',
];

// item 15 — tipos de estágio de funil, extensível.
const STAGE_TYPES = [
  'AD', 'CONTENT', 'ADVERTORIAL', 'VSL', 'QUIZ', 'LEAD_CAPTURE', 'SALES_PAGE', 'PRODUCT_PAGE',
  'CHECKOUT', 'ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL', 'WHATSAPP', 'EMAIL', 'WEBINAR',
  'APPLICATION', 'COMMUNITY', 'THANK_YOU', 'ACCESS', 'RETARGETING', 'OTHER',
];

// item 14 — status de arquitetura. Só CURRENT/CANDIDATE hoje, salvo evidência real (nunca
// TESTING/SUPPORTED/WEAKER_SIGNAL/INVALIDATED sem um experimento real concluído).
const ARCHITECTURE_STATUSES = ['CURRENT', 'CANDIDATE', 'TESTING', 'SUPPORTED', 'WEAKER_SIGNAL', 'INVALIDATED', 'RETIRED'];

// item 7 — challenge_current_strategy.
const CHALLENGE_STATES = ['EVIDENCE_SUPPORTED', 'PROVISIONALLY_SUPPORTED', 'INCUMBENCY_ONLY', 'EVIDENCE_AGAINST', 'UNKNOWN'];

// item 21/59 — optimization vs rearchitecture / tipos de recomendação.
const OPTIMIZATION_VS_REARCHITECTURE_STATES = ['OPTIMIZE_CURRENT', 'TEST_VARIANT', 'TEST_NEW_ARCHITECTURE', 'REBUILD_ARCHITECTURE', 'INSUFFICIENT_EVIDENCE'];
const RECOMMENDATION_TYPES = ['KEEP_AND_OPTIMIZE', 'TEST_INCREMENTAL_VARIANT', 'TEST_ALTERNATIVE_ARCHITECTURE', 'REBUILD_RECOMMENDED', 'PRODUCT_DISCOVERY_REQUIRED', 'NO_DEFENSIBLE_PREFERENCE'];

// item 33 — confiança qualitativa, nunca falsa precisão numérica (item 32).
const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'];

// item 29-30 — mecanismo primário de melhora + mecanismo econômico esperado.
const PRIMARY_MECHANISMS = ['INCREASE_INTENT', 'INCREASE_COMPREHENSION', 'INCREASE_TRUST', 'REDUCE_FRICTION', 'INCREASE_AOV', 'INCREASE_LTV', 'IMPROVE_QUALIFICATION', 'IMPROVE_MESSAGE_MATCH', 'REDUCE_CPA', 'OTHER'];

// item 41-42 — distância estrutural + reversibilidade.
const ARCHITECTURE_DISTANCES = ['LOW', 'MEDIUM', 'HIGH', 'RADICAL'];
const REVERSIBILITY_LEVELS = ['REVERSIBLE', 'PARTIALLY_REVERSIBLE', 'HARD_TO_REVERSE'];

// item 49-51 — fitness de automação/escala.
const FITNESS_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

// item 66-67 — amplitude/profundidade de busca.
const SEARCH_BREADTHS = ['NARROW', 'MODERATE', 'BROAD', 'RADICAL'];
const SEARCH_DEPTHS = ['INCREMENTAL', 'STRUCTURAL', 'BUSINESS_MODEL'];

// item 24 — tipo de evidência, nunca confundido (conhecimento geral != evidência do produto).
// PASSO 12.1, item 3 — STRUCTURAL_EXISTENCE_EVIDENCE (fato observado de que algo existe/não
// existe, ex.: "não há upsell") é explicitamente separado de PERFORMANCE_EVIDENCE (resultado real
// de desempenho, só existe após experimento concluído) — a ausência nunca vira prova de upside.
const EVIDENCE_TYPES = ['GENERAL_MARKETING_KNOWLEDGE', 'PRODUCT_SPECIFIC_EVIDENCE', 'INFERENCE', 'HYPOTHESIS', 'OBSERVED_EVIDENCE', 'VALIDATED_LEARNING', 'STRUCTURAL_EXISTENCE_EVIDENCE', 'PERFORMANCE_EVIDENCE'];

// PASSO 12.1, item 1 — elegibilidade de teste não pode ser circular. PREREQUISITE_EVIDENCE (falta
// antes de medir) é sempre distinta de EVIDENCE_OBJECTIVE (o que o próprio teste vai produzir).
const EVIDENCE_ROLE_TYPES = ['PREREQUISITE_EVIDENCE', 'EVIDENCE_OBJECTIVE'];

// PASSO 12.1, item 4 — evidência operacional (a arquitetura funciona) != evidência comparativa
// (a arquitetura é a melhor opção). "Tem vendas" nunca vira "é a melhor arquitetura" sozinho.
const OPERATIONAL_EVIDENCE_STATES = ['OBSERVED', 'ABSENT', 'UNKNOWN'];
const COMPARATIVE_EVIDENCE_STATES = ['ESTABLISHED', 'PARTIAL', 'NOT_ESTABLISHED', 'UNKNOWN'];

// PASSO 12.2, item 1 — ausência de estágio != evidência de gargalo. Ladder explícita: um fato de
// ausência (STRUCTURAL_ABSENCE) só GERA hipótese (HYPOTHESIZED_BOTTLENECK); só sinal
// comportamental real específico eleva pra OBSERVED_BOTTLENECK; só experimento concluído eleva
// pra VALIDATED_BOTTLENECK.
const BOTTLENECK_CLASSIFICATIONS = ['STRUCTURAL_ABSENCE', 'HYPOTHESIZED_BOTTLENECK', 'OBSERVED_BOTTLENECK', 'VALIDATED_BOTTLENECK'];

// PASSO 12.2, items 8/10 — estado de confirmação genérico pra afirmações que nunca podem ser
// inventadas (população recuperável, contactabilidade, elegibilidade de canal, evidência de
// diversificação orgânica). UNKNOWN != zero, UNKNOWN != confirmado.
const EVIDENCE_CONFIRMATION_STATES = ['CONFIRMED', 'PARTIAL', 'UNKNOWN', 'NOT_AVAILABLE'];

// item 69 — counterfactual.
const COUNTERFACTUAL_ANSWERS = ['YES', 'PROBABLY_YES', 'PROBABLY_NO', 'NO', 'UNKNOWN'];

// item 76/84 — prontidão de tracking / elegibilidade de teste.
const TRACKING_READINESS_STATES = ['READY', 'PARTIAL', 'NOT_READY', 'UNKNOWN'];
const ARCHITECTURE_TEST_ELIGIBILITY_STATES = ['READY', 'BLOCKED', 'NEEDS_TRACKING', 'NEEDS_IMPLEMENTATION', 'NEEDS_EVIDENCE', 'UNKNOWN'];

// item 47 — tipos de ROAS.
const ROAS_TYPES = ['ACQUISITION_ROAS', 'TRANSACTION_ROAS', 'LIFETIME_ROAS'];

// item 88 — regret.
const REGRET_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'];

module.exports = {
  FUNNEL_FAMILIES, STAGE_TYPES, ARCHITECTURE_STATUSES, CHALLENGE_STATES,
  OPTIMIZATION_VS_REARCHITECTURE_STATES, RECOMMENDATION_TYPES, CONFIDENCE_LEVELS,
  PRIMARY_MECHANISMS, ARCHITECTURE_DISTANCES, REVERSIBILITY_LEVELS, FITNESS_LEVELS,
  SEARCH_BREADTHS, SEARCH_DEPTHS, EVIDENCE_TYPES, COUNTERFACTUAL_ANSWERS,
  TRACKING_READINESS_STATES, ARCHITECTURE_TEST_ELIGIBILITY_STATES, ROAS_TYPES, REGRET_LEVELS,
  EVIDENCE_ROLE_TYPES, OPERATIONAL_EVIDENCE_STATES, COMPARATIVE_EVIDENCE_STATES,
  BOTTLENECK_CLASSIFICATIONS, EVIDENCE_CONFIRMATION_STATES,
};
