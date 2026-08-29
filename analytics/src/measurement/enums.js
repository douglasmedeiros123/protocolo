'use strict';

// PASSO 13 — enums centrais do Measurement & Attribution Intelligence. Item 3: nenhum status
// aqui é escolhido caso a caso — sempre a mesma tabela documentada em todo o módulo.

// item 3 — status de escopo de mensuração. RELIABLE exige critério verificável, nunca "dado existe".
const MEASUREMENT_SCOPE_STATUSES = ['RELIABLE', 'DEGRADED', 'PARTIAL', 'NOT_AVAILABLE', 'BLOCKED', 'UNKNOWN'];

// item 8 — os 17 domínios do Source-of-Truth Matrix (lista fechada do PASSO 13).
const SOURCE_OF_TRUTH_DOMAINS = [
  'FINANCIAL_TRANSACTION_TRUTH', 'REVENUE_TRUTH', 'REFUND_TRUTH', 'PRODUCT_TRUTH', 'ORDER_BUMP_TRUTH',
  'ACQUISITION_SPEND', 'PLATFORM_ATTRIBUTION', 'WEB_BEHAVIOR', 'FUNNEL_EVENT_TRUTH', 'CREATIVE_ATTRIBUTION',
  'CAMPAIGN_ATTRIBUTION', 'EXPERIMENT_ATTRIBUTION', 'CUSTOMER_IDENTITY', 'LIFECYCLE_ATTRIBUTION',
  'LTV_TRUTH', 'PROFIT_TRUTH', 'CROSS_PLATFORM_RECONCILIATION',
];

// item 11 — status de um TRACKING_CONTRACT.
const CONTRACT_STATUSES = ['DRAFT', 'INCOMPLETE', 'READY_FOR_IMPLEMENTATION', 'IMPLEMENTED_UNVALIDATED', 'VALIDATED', 'DEGRADED', 'FAILED'];

// item 13 — status de cada evento canônico dentro de uma arquitetura real.
const EVENT_LIFECYCLE_STATUSES = ['REQUIRED', 'IMPLEMENTED', 'OBSERVED', 'VALIDATED'];

// item 13 — taxonomia canônica de eventos (extensível — nunca assume que todos existem).
const CANONICAL_EVENTS = [
  'PAGE_VIEW', 'LANDING_PAGE_VIEW', 'CONTENT_VIEW', 'SCROLL_DEPTH', 'ENGAGED_SESSION', 'CTA_VIEW', 'CTA_CLICK',
  'CHECKOUT_INITIATED', 'CHECKOUT_VIEW', 'PAYMENT_ATTEMPT', 'PURCHASE', 'REFUND', 'CANCELLED', 'EXPIRED',
  'ORDER_BUMP_ACCEPTED', 'UPSELL_VIEW', 'UPSELL_ACCEPTED', 'UPSELL_DECLINED', 'DOWNSELL_VIEW', 'DOWNSELL_ACCEPTED',
  'LEAD_CAPTURED', 'WHATSAPP_STARTED', 'EMAIL_CAPTURED', 'RETURN_VISIT', 'REPURCHASE',
];

// item 16 — namespacing por fonte, pra nunca confundir "Meta diz que comprou" com "Hotmart confirma
// que comprou". CANONICAL_FINANCIAL_PURCHASE só existe quando as regras de verdade permitirem (hoje,
// nunca — Hotmart é a única fonte financeira real).
const EVENT_SOURCE_NAMESPACES = ['META', 'HOTMART', 'WEB', 'GA4', 'SERVER', 'CLARITY', 'CANONICAL'];

// item 18 — espinha de identificadores (nunca inventa IDs que não existem de verdade).
const IDENTIFIER_SPINE_NAMES = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'meta_click_id', 'session_id', 'anonymous_visitor_id', 'customer_id', 'lead_id',
  'transaction_id', 'experiment_id', 'variant_id', 'creative_id', 'ad_id', 'adset_id', 'campaign_id', 'product_id',
];

// item 20 — camadas de atribuição, nunca uma substitui a outra automaticamente.
const ATTRIBUTION_LAYERS = [
  'PLATFORM_ATTRIBUTION', 'SESSION_ATTRIBUTION', 'TRANSACTION_ATTRIBUTION', 'EXPERIMENT_ATTRIBUTION',
  'CREATIVE_ATTRIBUTION', 'CAMPAIGN_ATTRIBUTION', 'LIFECYCLE_ATTRIBUTION', 'CROSS_PLATFORM_RECONCILIATION',
];

// item 21 — confiança de atribuição, baseada em evidência observável, nunca probabilidade inventada.
const ATTRIBUTION_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW', 'NOT_ASSESSABLE'];

// item 23 — taxonomia de divergência do Reconciliation Engine.
const DIVERGENCE_TYPES = [
  'MATCHED', 'PARTIAL_MATCH', 'UNMATCHED_PLATFORM_ONLY', 'UNMATCHED_FINANCIAL_ONLY', 'VALUE_MISMATCH',
  'DUPLICATE_SUSPECTED', 'TEST_TRANSACTION', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'UNKNOWN',
];

// item 30 — classificação de superfície de controle. Nunca presume controle sobre o checkout Hotmart.
const CONTROL_SURFACE_STATUSES = ['CONTROLLED', 'PARTIALLY_CONTROLLED', 'EXTERNAL', 'UNKNOWN'];

// item 40 — estados do MEASUREMENT_CAPITAL_GATE.
const CAPITAL_GATE_STATES = [
  'READY_FOR_CAPITAL', 'NEEDS_TRACKING_IMPLEMENTATION', 'NEEDS_TRACKING_VALIDATION',
  'NEEDS_RECONCILIATION', 'BLOCKED_BY_MEASUREMENT', 'UNKNOWN',
];

// item 34 — dimensões de qualidade de dado (qualitativas, sem falsa precisão numérica).
const DATA_QUALITY_DIMENSIONS = ['COMPLETENESS', 'CONSISTENCY', 'FRESHNESS', 'UNIQUENESS', 'VALIDITY', 'JOINABILITY', 'TRACEABILITY'];

// item 32 — 3 níveis de atribuição de receita.
const REVENUE_ATTRIBUTION_TIERS = ['ACQUISITION_REVENUE', 'TRANSACTION_REVENUE', 'LIFETIME_REVENUE'];

// item 25 — método causal, nunca confundido entre si.
const CAUSAL_METHODS = ['BEFORE_AFTER', 'CORRELATION', 'CONTROLLED_EXPERIMENT', 'PLATFORM_REPORTED_LIFT', 'UNKNOWN'];

// item 2 — os 17 invariantes centrais do PASSO 13, documentados uma única vez (referenciados,
// nunca reafirmados caso a caso em outro arquivo).
const CORE_INVARIANTS = [
  'FINANCIAL_TRUTH != PLATFORM_ATTRIBUTION', 'PLATFORM_ATTRIBUTION != CROSS_PLATFORM_RECONCILIATION',
  'ATTRIBUTED_PURCHASE != CONFIRMED_FINANCIAL_TRANSACTION', 'TRACKING_GAP != BUSINESS_FAILURE',
  'MISSING_EVENT != ZERO_EVENTS', 'UNKNOWN != ZERO', 'NOT_AVAILABLE != ZERO', 'DEGRADED != BLOCKED',
  'CORRELATION != CAUSATION', 'EVENT_RECEIVED != EVENT_CORRECT', 'EVENT_CORRECT != ATTRIBUTION_CORRECT',
  'ATTRIBUTION_CORRECT != FINANCIAL_TRUTH', 'REVENUE != PROFIT',
];

module.exports = {
  MEASUREMENT_SCOPE_STATUSES, SOURCE_OF_TRUTH_DOMAINS, CONTRACT_STATUSES, EVENT_LIFECYCLE_STATUSES,
  CANONICAL_EVENTS, EVENT_SOURCE_NAMESPACES, IDENTIFIER_SPINE_NAMES, ATTRIBUTION_LAYERS,
  ATTRIBUTION_CONFIDENCE_LEVELS, DIVERGENCE_TYPES, CONTROL_SURFACE_STATUSES, CAPITAL_GATE_STATES,
  DATA_QUALITY_DIMENSIONS, REVENUE_ATTRIBUTION_TIERS, CAUSAL_METHODS, CORE_INVARIANTS,
};
