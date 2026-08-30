'use strict';

const { resolveOfferSourceOfTruth } = require('../../offer/sourceOfTruth');
const { standardWindows } = require('../../profit/windows');
const { todayBRT } = require('../../utils/dates');
const { resolveProductId } = require('../../../config/product');

// PASSO 18.5, item 5/31 — Product Monetization Map. Reusa offer/sourceOfTruth.js (já construído,
// PASSO 10/16 — nunca duplicado aqui), classificando cada relação como CONFIRMED (apareceu em
// transação Hotmart real, mesmo pedido/janela) / INFERRED / UNKNOWN. NUNCA infere relação
// comercial só por nome parecido (item 31, regra explícita).
function buildProductMonetizationMap({ productId, dataDir, referenceDate } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();
  const dates = standardWindows(refDate).last_30d.dates;
  const sourceOfTruth = resolveOfferSourceOfTruth(dates, resolvedProductId);

  const mainOffer = {
    product_id: resolvedProductId,
    offer_id: null, // Hotmart sales/history não expõe offer_id separado do produto — NUNCA inventado
    name: sourceOfTruth.main_product.name,
    price: sourceOfTruth.main_product.confirmed_price,
    status: sourceOfTruth.main_product.status,
    transactions: sourceOfTruth.main_product.transactions_found,
    relationship_confidence: 'CONFIRMED',
    relationship_evidence: 'config/product.js (TICKET) + transações reais Hotmart (is_main_product=true).',
  };

  const orderBumps = sourceOfTruth.confirmed_active_bumps.map((b) => ({
    name: b.product_name,
    price: b.average_price,
    gross_revenue: b.gross_revenue,
    net_revenue: b.net_revenue,
    transactions: b.transactions_found,
    refunded_count: b.refunded_count,
    relationship_to_parent_offer: 'ORDER_BUMP',
    relationship_confidence: 'CONFIRMED',
    relationship_evidence: 'apareceu em transação Hotmart real (is_main_product=false) — coocorrência real de venda, nunca inferido por nome (item 31).',
    status: b.status,
  }));

  // item 31 — upsell/downsell/subscription: nunca observados em transação real até hoje. O
  // repo documenta uma estratégia PLANEJADA (3 bumps + 1 upsell + 2 downsells), mas nenhum preço/
  // nome/take-rate desses componentes futuros existe em dado real — permanece UNKNOWN, nunca
  // promovido a CONFIRMED/INFERRED só porque está descrito como plano.
  const upsells = [];
  const downsells = [];
  const subscriptionsOrRecurring = [];
  const otherBackendOffers = [];

  return {
    product_id: resolvedProductId,
    main_offer: mainOffer,
    order_bumps: orderBumps,
    upsells,
    downsells,
    subscriptions_or_recurring: subscriptionsOrRecurring,
    other_backend_offers: otherBackendOffers,
    unknown_relationships: {
      note: sourceOfTruth.planned_architecture_note,
      classification: 'UNKNOWN',
      reason: 'estratégia de upsell/downsell é PLANNED (documentada no repo), nunca confirmada por transação real nem inferida por qualquer outro sinal — permanece UNKNOWN até existir evidência real (item 31, regra explícita contra inferência por nome).',
    },
    external_api_called: false, // mesma disciplina do offer/sourceOfTruth.js original — nunca chama rede pra montar este mapa
    sources_used: sourceOfTruth.sources_used,
  };
}

module.exports = { buildProductMonetizationMap };
