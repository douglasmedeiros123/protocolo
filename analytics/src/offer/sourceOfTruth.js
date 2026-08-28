'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/fs');
const { MAIN_PRODUCT_NAME, TICKET, resolveProductId } = require('../../config/product');

const DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

/**
 * SOURCE OF TRUTH DA OFERTA (PASSO 10, item 5) — só dados persistidos (Hotmart real +
 * config/product.js), nunca API externa. Um componente só vira ACTIVE se existir pelo menos 1
 * transação Hotmart real com aquele product_name — nunca promovido a ACTIVE só por aparecer
 * citado no texto de um hypothesis de experimento (ex: AOV-001 cita "bundle Núcleo+Objeções+
 * Cobrança", mas só Objeções e Cobrança têm transação real — Núcleo fica UNKNOWN).
 */
function discoverOfferComponentsFromHotmart(dates) {
  const byName = new Map();
  let mainProductTransactions = 0;

  for (const date of dates) {
    const snapshot = readJson(path.join(DAILY_DIR, `${date}.json`));
    if (!snapshot || !snapshot.hotmart) continue;
    for (const t of snapshot.hotmart.transactions || []) {
      if (t.is_main_product) { mainProductTransactions += 1; continue; }
      if (!byName.has(t.product_name)) {
        byName.set(t.product_name, { product_name: t.product_name, transactions: 0, gross: 0, net: 0, counted: 0, refunded: 0 });
      }
      const e = byName.get(t.product_name);
      e.transactions += 1;
      e.gross += t.gross;
      e.net += t.net || 0;
      if (t.counted_as_revenue) e.counted += 1;
      if (t.status === 'REFUNDED') e.refunded += 1;
    }
  }

  return {
    main_product: {
      name: MAIN_PRODUCT_NAME,
      confirmed_price: TICKET,
      status: 'ACTIVE',
      transactions_found: mainProductTransactions,
      source: 'config/product.js (MAIN_PRODUCT_NAME/TICKET) + transações reais Hotmart (is_main_product=true).',
    },
    confirmed_bumps: [...byName.values()].map((e) => ({
      product_name: e.product_name,
      status: 'ACTIVE',
      transactions_found: e.transactions,
      gross_revenue: Math.round(e.gross * 100) / 100,
      net_revenue: Math.round(e.net * 100) / 100,
      average_price: e.transactions ? Math.round((e.gross / e.transactions) * 100) / 100 : null,
      refunded_count: e.refunded,
      source: 'Transações Hotmart reais (is_main_product=false), analytics/data/daily/.',
    })),
  };
}

/**
 * Resolve a fonte de verdade completa: componentes ACTIVE confirmados por transação real + nota
 * explícita de que qualquer estratégia futura (item 8: 3 bumps de R$29, bundle, upsell,
 * downsells) é PLANNED_ARCHITECTURE e NUNCA deve ser tratada como receita/componente existente.
 */
function resolveOfferSourceOfTruth(dates, productId) {
  const discovered = discoverOfferComponentsFromHotmart(dates);
  return {
    product_id: resolveProductId(productId),
    main_product: discovered.main_product,
    confirmed_active_bumps: discovered.confirmed_bumps,
    planned_architecture_note: 'Estratégia descrita (PASSO 10, item 8) de 3 order bumps de R$29 cada (ou bundle com desconto), 1 upsell e 2 downsells é PLANNED — nenhum preço, take rate ou nome desses componentes futuros existe em transação real. NUNCA promovida a ACTIVE/componente existente por este agente.',
    sources_used: ['config/product.js', 'analytics/data/daily/*.json (Hotmart transactions reais)'],
    external_api_called: false,
  };
}

module.exports = { resolveOfferSourceOfTruth, discoverOfferComponentsFromHotmart };
