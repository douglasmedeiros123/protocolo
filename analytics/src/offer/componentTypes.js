'use strict';

// OFFER COMPONENT TYPES (PASSO 10, item 9)
const OFFER_COMPONENT_TYPES = ['MAIN_PRODUCT', 'ORDER_BUMP', 'BUMP_BUNDLE', 'UPSELL', 'DOWNSELL', 'BONUS', 'SUBSCRIPTION', 'OTHER'];

// COMPONENT STATUS (PASSO 10, itens 5/7/10) — ACTIVE exige transação Hotmart real confirmando o
// componente; PLANNED é estratégia futura descrita (nunca vira receita/ACTIVE sozinha);
// NOT_IMPLEMENTED é um componente do funil (upsell/downsell) que ainda não existe no checkout;
// UNKNOWN é quando não há dado suficiente pra classificar em nenhum dos três.
const COMPONENT_STATUSES = ['ACTIVE', 'PLANNED', 'UNKNOWN', 'NOT_IMPLEMENTED'];

// OFFER FUNNEL STAGES (PASSO 10, item 7) — a ordem conceitual do funil de monetização.
const OFFER_FUNNEL_STAGES = ['MAIN_PRODUCT', 'ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL_1', 'DOWNSELL_2', 'LIFECYCLE'];

function isValidComponentType(v) { return OFFER_COMPONENT_TYPES.includes(v); }
function isValidComponentStatus(v) { return COMPONENT_STATUSES.includes(v); }

module.exports = { OFFER_COMPONENT_TYPES, COMPONENT_STATUSES, OFFER_FUNNEL_STAGES, isValidComponentType, isValidComponentStatus };
