'use strict';

// OFFER DIAGNOSTIC TYPES (PASSO 10, item 21) — "upsell inexistente" NUNCA é classificado
// automaticamente como problema: vira MISSING_MONETIZATION_LAYER (uma lacuna estrutural
// observada), e o IMPACTO de preenchê-la continua hipótese (causal_status nunca VALIDATED aqui).
const OFFER_DIAGNOSTIC_TYPES = [
  'REVENUE_LEAK', 'LOW_ATTACH', 'LOW_TAKE_RATE', 'HIGH_REFUND', 'PRICE_FRICTION',
  'OFFER_COMPLEXITY', 'CANNIBALIZATION_RISK', 'MISSING_MONETIZATION_LAYER', 'DATA_GAP',
  'ECONOMIC_OPPORTUNITY', 'OTHER',
];

function isValidOfferDiagnosticType(v) { return OFFER_DIAGNOSTIC_TYPES.includes(v); }

module.exports = { OFFER_DIAGNOSTIC_TYPES, isValidOfferDiagnosticType };
