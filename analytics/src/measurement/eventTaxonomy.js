'use strict';

const { CANONICAL_EVENTS } = require('./enums');

// item 13-17 — taxonomia canônica extensível. Cada evento distingue REQUIRED/IMPLEMENTED/
// OBSERVED/VALIDATED — nunca assume que todos existem só porque o estágio existe (item 13).
// STAGE_TO_EVENTS documenta quais estágios de arquitetura EXIGEM quais eventos canônicos —
// requisito, não afirmação de que já existem.
const STAGE_TO_EVENTS = {
  AD: ['PAGE_VIEW'],
  CONTENT: ['CONTENT_VIEW', 'ENGAGED_SESSION'],
  ADVERTORIAL: ['CONTENT_VIEW', 'SCROLL_DEPTH', 'ENGAGED_SESSION', 'CTA_VIEW', 'CTA_CLICK'],
  VSL: ['CONTENT_VIEW', 'ENGAGED_SESSION', 'CTA_VIEW', 'CTA_CLICK'],
  QUIZ: ['LEAD_CAPTURED'],
  LEAD_CAPTURE: ['LEAD_CAPTURED', 'EMAIL_CAPTURED'],
  SALES_PAGE: ['LANDING_PAGE_VIEW', 'SCROLL_DEPTH', 'ENGAGED_SESSION', 'CTA_VIEW', 'CTA_CLICK'],
  PRODUCT_PAGE: ['PAGE_VIEW', 'CTA_CLICK'],
  CHECKOUT: ['CHECKOUT_INITIATED', 'CHECKOUT_VIEW', 'PAYMENT_ATTEMPT', 'PURCHASE', 'REFUND', 'CANCELLED', 'EXPIRED'],
  ORDER_BUMP: ['ORDER_BUMP_ACCEPTED'],
  BUNDLE: ['ORDER_BUMP_ACCEPTED'],
  UPSELL: ['UPSELL_VIEW', 'UPSELL_ACCEPTED', 'UPSELL_DECLINED'],
  DOWNSELL: ['DOWNSELL_VIEW', 'DOWNSELL_ACCEPTED'],
  WHATSAPP: ['WHATSAPP_STARTED'],
  EMAIL: ['EMAIL_CAPTURED'],
  WEBINAR: ['ENGAGED_SESSION'],
  APPLICATION: ['LEAD_CAPTURED'],
  COMMUNITY: ['RETURN_VISIT'],
  THANK_YOU: ['PAGE_VIEW'],
  ACCESS: ['PAGE_VIEW', 'RETURN_VISIT'],
  RETARGETING: ['PAGE_VIEW'],
  OTHER: [],
};

// item 16 — namespacing por fonte, pra nunca confundir a alegação da Meta com a confirmação
// financeira da Hotmart. CANONICAL_FINANCIAL_PURCHASE só existiria quando as regras de verdade
// permitirem (hoje nunca automaticamente — Hotmart continua sendo a única fonte).
function eventSourceSemantics(event, platform) {
  if (event === 'PURCHASE') {
    return [
      { namespace: 'HOTMART.TRANSACTION_APPROVED', status: 'VALIDATED', is_financial_truth: true, note: 'única fonte que confirma dinheiro real recebido.' },
      { namespace: 'META.PURCHASE', status: platform.meta_pixel_capi.browser_pixel_status === 'CONFIRMED' ? 'OBSERVED' : 'NEEDS_RUNTIME_VALIDATION', is_financial_truth: false, note: 'alegação de plataforma — já observada divergindo da Hotmart em dias reais (ghost purchase). ATTRIBUTED_PURCHASE != CONFIRMED_FINANCIAL_TRANSACTION.' },
      { namespace: 'GA4.PURCHASE', status: 'NEEDS_RUNTIME_VALIDATION', is_financial_truth: false, note: 'não confirmável sem acesso ao conteúdo do container GTM.' },
      { namespace: 'WEB.PURCHASE_SIGNAL', status: 'NOT_AVAILABLE', is_financial_truth: false, note: 'nenhum dataLayer.push de ecommerce encontrado.' },
    ];
  }
  if (event === 'CHECKOUT_INITIATED') {
    return [
      { namespace: 'META.INITIATE_CHECKOUT', status: platform.meta_pixel_capi.browser_pixel_status === 'CONFIRMED' ? 'OBSERVED' : 'NEEDS_RUNTIME_VALIDATION', is_financial_truth: false, note: 'possível via tag GTM não confirmável estaticamente.' },
      { namespace: 'WEB.CHECKOUT_CLICK', status: 'NOT_AVAILABLE', is_financial_truth: false, note: 'link de checkout é estático, sem dataLayer.push associado encontrado.' },
    ];
  }
  if (event === 'REFUND' || event === 'CANCELLED' || event === 'EXPIRED') {
    return [{ namespace: 'HOTMART.TRANSACTION_STATUS', status: 'VALIDATED', is_financial_truth: true, note: 'status real observado por transação.' }];
  }
  return [
    { namespace: 'WEB.CLIENT_EVENT', status: 'NOT_AVAILABLE', is_financial_truth: false, note: 'nenhum evento discreto de funil confirmado hoje (sem dataLayer/GA4 ecommerce).' },
    { namespace: 'CLARITY.BEHAVIOR_SIGNAL', status: platform.clarity.live_session_collection_status === 'CONFIRMED' ? 'PARTIAL' : 'NOT_AVAILABLE', is_financial_truth: false, note: 'Clarity é comportamento agregado de conta, nunca evento discreto por página no pipeline atual.' },
  ];
}

/**
 * buildEventTaxonomyForStages() — item 13-17. Recebe os stage_types REAIS de uma arquitetura
 * (atual ou candidata do Strategy Search) e retorna, pra cada evento canônico exigido por esses
 * estágios, o status real REQUIRED/IMPLEMENTED/OBSERVED/VALIDATED e a semântica por fonte.
 */
function buildEventTaxonomyForStages(stageTypes, platform) {
  const requiredEvents = [...new Set(stageTypes.flatMap((t) => STAGE_TO_EVENTS[t] || []))];
  return requiredEvents.map((event) => {
    const semantics = eventSourceSemantics(event, platform);
    const anyValidated = semantics.some((s) => s.status === 'VALIDATED');
    const anyObserved = semantics.some((s) => s.status === 'OBSERVED' || s.status === 'VALIDATED' || s.status === 'PARTIAL');
    const status = anyValidated ? 'VALIDATED' : anyObserved ? 'OBSERVED' : 'REQUIRED';
    return { event, status, source_semantics: semantics };
  });
}

module.exports = { CANONICAL_EVENTS, STAGE_TO_EVENTS, eventSourceSemantics, buildEventTaxonomyForStages };
