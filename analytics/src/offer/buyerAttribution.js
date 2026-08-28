'use strict';

const path = require('path');
const { readJson } = require('../utils/fs');

const DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

// PASSO 10.1, item 1 — status possíveis de linkage, do mais forte pro mais fraco. NUNCA promovido
// a "confident" sem prova estrutural real.
const LINK_METHODS = { STRUCTURAL_ORDER_ID: 'STRUCTURAL_ORDER_ID', NAME_DATE_HEURISTIC: 'NAME_DATE_HEURISTIC', NONE: 'NONE' };

function resolveBaseOrderId(transactionId) {
  return String(transactionId || '').replace(/C\d+$/, '');
}

function normalizeBuyerName(name) {
  return String(name || '').trim().toLowerCase();
}

function loadTransactions(dates, dataDir) {
  const all = [];
  for (const date of dates) {
    const snapshot = readJson(path.join(dataDir, `${date}.json`));
    if (!snapshot || !snapshot.hotmart) continue;
    for (const t of snapshot.hotmart.transactions || []) all.push(t);
  }
  return all;
}

/**
 * Liga cada transação de bump a um comprador SOMENTE quando há prova estrutural real: o próprio
 * transaction_id do Hotmart compartilha o mesmo pedido-base (sufixo "C1"/"C2" = itens do mesmo
 * checkout — ex.: HP3626434570C1 = produto principal, HP3626434570C2 = bump, mesmo pedido). Isso
 * NÃO é "inferir unicidade a partir de linhas/transações" (proibido pelo item 3) — é ler uma
 * chave estrutural literal já presente no dado persistido.
 *
 * Quando essa chave não existe, um match por buyer_name+data é reportado à parte como sinal
 * HEURÍSTICO (nunca conta pro numerador confiável) — buyer_name é texto livre, sem garantia de
 * unicidade (duas pessoas podem ter o mesmo nome; a mesma pessoa pode ter o nome grafado
 * diferente entre duas transações).
 */
function linkBumpTransactionsToBuyers(dates, dataDir = DAILY_DIR) {
  const all = loadTransactions(dates, dataDir);
  const mainTx = all.filter((t) => t.is_main_product);
  const bumpTx = all.filter((t) => !t.is_main_product);
  const mainEligible = mainTx.filter((t) => t.counted_as_revenue);

  const links = bumpTx.map((b) => {
    const base = resolveBaseOrderId(b.transaction_id);
    const structuralMatch = base !== b.transaction_id
      ? mainTx.find((m) => m.transaction_id !== b.transaction_id && resolveBaseOrderId(m.transaction_id) === base)
      : null;

    if (structuralMatch) {
      return {
        bump_transaction_id: b.transaction_id, product_name: b.product_name, date: b.date,
        link_method: LINK_METHODS.STRUCTURAL_ORDER_ID, confident: true,
        linked_buyer_name: structuralMatch.buyer_name, linked_main_transaction_id: structuralMatch.transaction_id,
        reason: `transaction_id compartilha o mesmo pedido-base (${base}) com uma transação real do produto principal — mesmo checkout, prova estrutural.`,
      };
    }

    const heuristicMatch = mainTx.find((m) => m.order_date_utc && b.order_date_utc
      && normalizeBuyerName(m.buyer_name) === normalizeBuyerName(b.buyer_name)
      && m.order_date_utc.slice(0, 10) === b.order_date_utc.slice(0, 10));

    return {
      bump_transaction_id: b.transaction_id, product_name: b.product_name, date: b.date,
      link_method: heuristicMatch ? LINK_METHODS.NAME_DATE_HEURISTIC : LINK_METHODS.NONE,
      confident: false,
      linked_buyer_name: heuristicMatch ? heuristicMatch.buyer_name : null,
      linked_main_transaction_id: heuristicMatch ? heuristicMatch.transaction_id : null,
      reason: heuristicMatch
        ? `nenhum pedido-base estrutural compartilhado; nome+data coincidem com ${heuristicMatch.transaction_id} — sinal heurístico, NÃO contado como buyer-level confiável (buyer_name não é chave estável).`
        : 'nenhum pedido-base estrutural nem coincidência de nome+data com transação do produto principal.',
    };
  });

  const confidentLinks = links.filter((l) => l.confident);
  const uniqueConfidentBuyers = new Set(confidentLinks.map((l) => normalizeBuyerName(l.linked_buyer_name)));
  const unlinkedCount = links.length - confidentLinks.length;
  const uniqueMainBuyers = new Set(mainEligible.map((t) => normalizeBuyerName(t.buyer_name))).size;

  let status;
  let buyersWithBump = null;
  let anyBumpAttachRate = null;
  if (bumpTx.length === 0) {
    status = 'NO_BUMP_TRANSACTIONS';
    buyersWithBump = 0;
    anyBumpAttachRate = uniqueMainBuyers > 0 ? 0 : null;
  } else if (confidentLinks.length === 0) {
    status = 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL';
  } else if (unlinkedCount > 0) {
    status = 'PARTIAL_ATTRIBUTION_LOWER_BOUND';
    buyersWithBump = uniqueConfidentBuyers.size;
    anyBumpAttachRate = uniqueMainBuyers > 0 ? Math.round((buyersWithBump / uniqueMainBuyers) * 10000) / 10000 : null;
  } else {
    status = 'ATTRIBUTED_STRUCTURAL';
    buyersWithBump = uniqueConfidentBuyers.size;
    anyBumpAttachRate = uniqueMainBuyers > 0 ? Math.round((buyersWithBump / uniqueMainBuyers) * 10000) / 10000 : null;
  }

  // Item 2 — sinal observável que NÃO exige linkage nenhuma: quantas transações de bump existem
  // por comprador financeiro elegível. Rotulado explicitamente como proxy de transação, nunca
  // chamado de attach rate.
  const bumpTransactionsPerBuyer = uniqueMainBuyers > 0 ? Math.round((bumpTx.length / uniqueMainBuyers) * 10000) / 10000 : null;

  // Item 4 — por componente (produto de bump), usando só linkage confiável. Soma dos
  // component_attach_rate PODE ultrapassar any_bump_attach_rate (double counting não é permitido
  // no any_bump; é permitido/esperado quando o mesmo comprador leva mais de um bump distinto).
  const productNames = [...new Set(bumpTx.map((b) => b.product_name))];
  const perComponent = productNames.map((productName) => {
    const componentLinks = confidentLinks.filter((l) => l.product_name === productName);
    const componentBuyers = new Set(componentLinks.map((l) => normalizeBuyerName(l.linked_buyer_name)));
    const componentTxCount = bumpTx.filter((b) => b.product_name === productName).length;
    return {
      product_name: productName,
      bump_transaction_count: componentTxCount,
      structurally_linked_buyer_count: componentBuyers.size,
      component_attach_rate: uniqueMainBuyers > 0 && componentBuyers.size > 0 ? Math.round((componentBuyers.size / uniqueMainBuyers) * 10000) / 10000 : (componentBuyers.size === 0 ? 0 : null),
    };
  });

  // average_bumps_per_buyer — só entre compradores com >=1 link confiável (nunca inclui os
  // unlinked, que não têm comprador confirmado nenhum pra dividir).
  const averageBumpsPerBuyer = uniqueConfidentBuyers.size > 0
    ? Math.round((confidentLinks.length / uniqueConfidentBuyers.size) * 10000) / 10000
    : null;

  return {
    bump_transaction_count: bumpTx.length,
    bump_units: bumpTx.length, // sem campo de quantidade nos dados reais persistidos — 1 unidade por transação, documentado explicitamente (não suposto)
    bump_transactions_per_buyer: bumpTransactionsPerBuyer,
    bump_transactions_per_buyer_metric_type: 'TRANSACTION_LEVEL_PROXY', // NUNCA chamado de attach_rate (item 2)
    links,
    bump_transactions_without_structural_link: unlinkedCount,
    unique_main_buyers_eligible: uniqueMainBuyers,
    buyers_with_bump: buyersWithBump,
    any_bump_attach_rate: anyBumpAttachRate,
    buyer_level_attach_rate: anyBumpAttachRate, // alias formal — mesma definição do item 3 (unique buyers c/ >=1 bump / unique main buyers elegíveis)
    buyer_level_attach_rate_status: status,
    average_bumps_per_buyer: averageBumpsPerBuyer,
    per_component: perComponent,
    method: confidentLinks.length === 0 ? 'NONE_AVAILABLE' : (unlinkedCount === 0 ? 'STRUCTURAL_ORDER_ID' : 'STRUCTURAL_ORDER_ID_PARTIAL'),
    note: 'buyer_level_attach_rate/any_bump_attach_rate só contam links STRUCTURAL_ORDER_ID (prova real de mesmo pedido). Links NAME_DATE_HEURISTIC são reportados em "links" mas NUNCA entram no numerador confiável (item 3 — nunca inferir unicidade a partir de linhas/transações).',
  };
}

module.exports = { resolveBaseOrderId, normalizeBuyerName, linkBumpTransactionsToBuyers, LINK_METHODS };
