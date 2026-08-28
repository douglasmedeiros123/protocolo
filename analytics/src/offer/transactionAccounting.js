'use strict';

const path = require('path');
const { readJson } = require('../utils/fs');

const DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

/**
 * PASSO 10.1, item 5 — explica exatamente a diferença entre "18 transações do produto principal"
 * e "11 compradores financeiros", lendo a ESTRUTURA REAL persistida (status/counted_as_revenue/
 * is_known_test_buyer de cada transação) — nunca suposto.
 */
function explainTransactionVsBuyerCount(dates, dataDir = DAILY_DIR) {
  const all = [];
  for (const date of dates) {
    const snapshot = readJson(path.join(dataDir, `${date}.json`));
    if (!snapshot || !snapshot.hotmart) continue;
    for (const t of snapshot.hotmart.transactions || []) all.push(t);
  }
  const main = all.filter((t) => t.is_main_product);
  const mainCounted = main.filter((t) => t.counted_as_revenue);

  const breakdown = [];
  const testCount = main.filter((t) => t.is_known_test_buyer && !t.counted_as_revenue).length;
  if (testCount > 0) breakdown.push({ reason: 'TEST_TRANSACTION', count: testCount, note: 'is_known_test_buyer=true — transação de teste, nunca contada como venda real.' });
  const refundedCount = main.filter((t) => t.status === 'REFUNDED').length;
  if (refundedCount > 0) breakdown.push({ reason: 'REFUNDED', count: refundedCount, note: 'status=REFUNDED — venda que aconteceu e foi revertida; counted_as_revenue=false.' });
  const cancelledCount = main.filter((t) => t.status === 'CANCELLED').length;
  if (cancelledCount > 0) breakdown.push({ reason: 'CANCELLED', count: cancelledCount, note: 'status=CANCELLED — checkout iniciado, nunca completado como venda.' });
  const expiredCount = main.filter((t) => t.status === 'EXPIRED').length;
  if (expiredCount > 0) breakdown.push({ reason: 'EXPIRED', count: expiredCount, note: 'status=EXPIRED — link de pagamento expirou sem conclusão.' });

  const explainedSum = breakdown.reduce((s, b) => s + b.count, 0);
  const uniqueBuyerCount = new Set(mainCounted.map((t) => String(t.buyer_name || '').trim().toLowerCase())).size;

  return {
    main_product_transaction_count: main.length,
    financial_buyer_count: mainCounted.length,
    unique_buyer_count_if_available: uniqueBuyerCount,
    financial_buyer_count_matches_unique_buyer_count: mainCounted.length === uniqueBuyerCount,
    difference: main.length - mainCounted.length,
    difference_fully_explained: explainedSum === (main.length - mainCounted.length),
    difference_breakdown: breakdown,
    definitions: {
      main_product_transaction_count: 'Todas as transações reais com is_main_product=true, qualquer status (COMPLETE/APPROVED/REFUNDED/CANCELLED/EXPIRED), incluindo transações de teste.',
      financial_buyer_count: 'Transações com counted_as_revenue=true — é o denominador financeiro usado em AOV/CPA/ROAS em todo o projeto (Profit Engine, Decision Engine). Assume 1 transação contada = 1 comprador.',
      unique_buyer_count_if_available: 'Contagem de buyer_name distintos (normalizado) entre as transações counted_as_revenue=true — valida (ou não) a suposição acima, sem substituí-la como denominador financeiro oficial.',
    },
    source: 'Hotmart real (analytics/data/daily/*.json) — campos status, counted_as_revenue, is_known_test_buyer, buyer_name de cada transação.',
  };
}

module.exports = { explainTransactionVsBuyerCount };
