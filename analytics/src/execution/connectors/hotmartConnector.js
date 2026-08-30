'use strict';

const { collectHotmart } = require('../../collectors/hotmart');
const { normalizeHotmart } = require('../../normalizers/hotmart');
const env = require('../../../config/env');

// PASSO 18.5, item 4-6, 25 — adapters tipados. READ_ONLY (a Hotmart pública não expõe endpoint de
// mutação de produto/preço/checkout pra integrações OAuth client_credentials — ver item 6).

async function readTransactions(dateStr) {
  const { ok } = env.status().hotmart;
  if (!ok) return { available: false, reason: 'CREDENTIAL_SETUP_REQUIRED', platform: 'HOTMART' };
  const raw = await collectHotmart(dateStr);
  const normalized = normalizeHotmart(raw);
  return { available: true, platform: 'HOTMART', date: dateStr, transactions: normalized.transactions, totals: normalized.totals };
}

// item 5 — não existe endpoint de "produtos/ofertas" dedicado na integração real (só
// sales/history) — "produtos" são derivados de item.product.name dentro de transações reais.
// Isso é CONFIRMED (veio de uma venda real), nunca INFERRED por nome parecido.
async function readProducts(dateStr) {
  const result = await readTransactions(dateStr);
  if (!result.available) return result;
  const byProduct = new Map();
  for (const t of result.transactions) {
    if (!t.counted_as_revenue) continue;
    const key = t.product_name;
    if (!byProduct.has(key)) byProduct.set(key, { product_name: key, is_main_product: t.is_main_product, transactions: 0, gross: 0, net: 0 });
    const entry = byProduct.get(key);
    entry.transactions += 1;
    entry.gross += t.gross;
    entry.net += t.net || 0;
  }
  return { available: true, platform: 'HOTMART', date: dateStr, products: [...byProduct.values()], note: 'derivado de transações reais (sales/history) — Hotmart não expõe um catálogo de ofertas via esta API, nunca inventado (item 5).' };
}

// item 6 — write capability real. A API pública client_credentials da Hotmart usada aqui
// (sales/history) não documenta NENHUM endpoint de mutação — nunca assumido, nunca testado
// (testar exigiria uma mutação real, proibida neste PASSO).
const WRITE_CAPABILITY = {
  create_or_edit_product: 'UNKNOWN_REQUIRES_VALIDATION — não documentado pela API usada aqui; painel Hotmart pode suportar, API não foi testada.',
  create_or_edit_offer: 'UNKNOWN_REQUIRES_VALIDATION',
  refund_transaction: 'UNKNOWN_REQUIRES_VALIDATION — Hotmart tem processo de reembolso, mas não confirmado via esta integração client_credentials.',
  change_price: 'UNKNOWN_REQUIRES_VALIDATION',
};

module.exports = { readTransactions, readProducts, WRITE_CAPABILITY };
