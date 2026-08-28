'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { linkBumpTransactionsToBuyers, resolveBaseOrderId } = require('../src/offer/buyerAttribution');
const { explainTransactionVsBuyerCount } = require('../src/offer/transactionAccounting');
const { computeComponentRefundRates } = require('../src/offer/economics');
const { generateOfferCandidates } = require('../src/offer/candidateGenerator');
const { simulateBumpStrategy } = require('../src/offer/bumpStrategyModel');
const { analyzeOffer } = require('../src/offer/builder');
const { dateRange } = require('../src/utils/dates');

const REAL_DATES = dateRange('2026-07-30', '2026-08-28');

// Fixtures escrevem arquivos direto na raiz do dir temporário (mesma convenção de
// buyerAttribution.js/economics.js: dataDir É a pasta "daily", não a raiz do projeto).
function makeFixtureDir(daysByDate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-buyer-attribution-'));
  for (const [date, snapshot] of Object.entries(daysByDate)) {
    fs.writeFileSync(path.join(dir, `${date}.json`), JSON.stringify(snapshot));
  }
  return dir;
}

function tx({ id, product = 'Protocolo da Resposta Garantida', isMain = true, status = 'COMPLETE', gross = 67, net = 59, buyer, counted = true, test_buyer = false, date = '2026-08-01' }) {
  return {
    transaction_id: id, order_date_utc: `${date}T10:00:00.000Z`, product_name: product,
    is_main_product: isMain, status, gross, hotmart_fee: 0, net, payment_method: 'PIX',
    buyer_name: buyer, is_known_test_buyer: test_buyer, counted_as_revenue: counted,
  };
}

function snapshot(date, transactions) {
  return { date, hotmart: { transactions } };
}

test('item 1: 3 bump transactions / 11 buyers != necessariamente 27,27% attach rate — proxy e buyer-level são campos DIFERENTES', () => {
  const r = analyzeOffer({});
  const ba = r.buyer_attribution;
  assert.equal(ba.bump_transaction_count, 3);
  assert.equal(ba.unique_main_buyers_eligible, 11);
  assert.equal(ba.bump_transactions_per_buyer, Math.round(r.economics.order_bump_attach_rate * 10000) / 10000); // proxy = número antigo (arredondado 4 casas)
  assert.notEqual(ba.buyer_level_attach_rate, ba.bump_transactions_per_buyer); // buyer-level NÃO é o mesmo número
});

test('item 2: buyer_level_attach_rate exige linkage confiável — nunca aceita simples contagem de linhas/transações', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', counted: true }),
      tx({ id: 'M2', buyer: 'Bruno', counted: true }),
      // bump sem qualquer base compartilhada e sem nome/data batendo com nenhum main
      tx({ id: 'BUMP-STANDALONE', product: 'Pack X', isMain: false, buyer: 'Carla Desconhecida', date: '2026-08-09' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(r.buyer_level_attach_rate, null);
  assert.equal(r.buyer_level_attach_rate_status, 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL');
});

test('item 3: linkage estrutural ausente -> attach null (nunca um número inventado), mas a transação continua contada', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', counted: true }),
      tx({ id: 'BUMP-1', product: 'Pack X', isMain: false, buyer: 'Alguém Não Ligado' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(r.buyers_with_bump, null);
  assert.equal(r.bump_transaction_count, 1); // a transação em si nunca desaparece
});

test('item 4: proxy no nível de transação continua disponível mesmo sem NENHUM linkage confiável', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', counted: true }),
      tx({ id: 'M2', buyer: 'Bruno', counted: true }),
      tx({ id: 'BUMP-1', product: 'Pack X', isMain: false, buyer: 'Zzz', date: '2026-08-09' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(r.buyer_level_attach_rate_status, 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL');
  assert.equal(r.bump_transactions_per_buyer, 0.5); // 1 bump tx / 2 buyers — continua calculável
  assert.equal(r.bump_transactions_per_buyer_metric_type, 'TRANSACTION_LEVEL_PROXY');
});

test('item 5: mesmo comprador pode levar MÚLTIPLOS bumps distintos no mesmo pedido (average_bumps_per_buyer > 1)', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'ORD1C1', buyer: 'Ana' }),
      tx({ id: 'ORD1C2', product: 'Pack X', isMain: false, buyer: 'Ana' }),
      tx({ id: 'ORD1C3', product: 'Pack Y', isMain: false, buyer: 'Ana' }),
      tx({ id: 'ORD2', buyer: 'Bruno' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(r.buyers_with_bump, 1); // só Ana, deduplicada
  assert.equal(r.average_bumps_per_buyer, 2); // 2 links / 1 comprador
});

test('item 6: any_bump_attach_rate NÃO é obrigatoriamente igual à soma dos component_attach_rate (sem dupla contagem)', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'ORD1C1', buyer: 'Ana' }),
      tx({ id: 'ORD1C2', product: 'Pack X', isMain: false, buyer: 'Ana' }),
      tx({ id: 'ORD1C3', product: 'Pack Y', isMain: false, buyer: 'Ana' }),
      tx({ id: 'ORD2', buyer: 'Bruno' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  const sumOfComponents = r.per_component.reduce((s, c) => s + (c.component_attach_rate || 0), 0);
  assert.equal(r.any_bump_attach_rate, 0.5); // 1 comprador único de 2 elegíveis
  assert.ok(sumOfComponents > r.any_bump_attach_rate); // soma dos componentes (0.5+0.5=1.0) > any_bump (0.5)
});

test('item 7: no double counting — buyers_with_bump usa comprador ÚNICO, nunca soma de transações vinculadas', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'ORD1C1', buyer: 'Ana' }),
      tx({ id: 'ORD1C2', product: 'Pack X', isMain: false, buyer: 'Ana' }),
      tx({ id: 'ORD1C3', product: 'Pack Y', isMain: false, buyer: 'Ana' }),
    ]),
  });
  const r = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(r.bump_transaction_count, 2); // 2 links confiáveis (ORD1C2, ORD1C3)
  assert.equal(r.buyers_with_bump, 1); // não 2 — é 1 comprador só
});

test('item 8: 18 transações do produto principal != automaticamente 18 compradores — diferença explicada pela estrutura real', () => {
  const r = explainTransactionVsBuyerCount(REAL_DATES);
  assert.equal(r.main_product_transaction_count, 18);
  assert.equal(r.financial_buyer_count, 11);
  assert.equal(r.difference, 7);
  assert.equal(r.difference_fully_explained, true);
  const reasons = r.difference_breakdown.map((b) => b.reason).sort();
  assert.deepEqual(reasons, ['CANCELLED', 'EXPIRED', 'REFUNDED', 'TEST_TRANSACTION']);
});

test('item 9: refund_transaction_rate e refund_buyer_rate têm denominadores DIFERENTES e podem divergir', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', status: 'COMPLETE', counted: true }),
      tx({ id: 'M2', buyer: 'Ana', status: 'REFUNDED', counted: false }), // Ana tem 2 transações relevantes, 1 refundada
      tx({ id: 'M3', buyer: 'Bruno', status: 'COMPLETE', counted: true }),
    ]),
  });
  const r = computeComponentRefundRates(['2026-08-01'], dir);
  assert.equal(r.main_product.refund_transaction_rate, Math.round((1 / 3) * 10000) / 10000); // 1 refund / 3 transações relevantes
  assert.equal(r.main_product.refund_buyer_rate, 0.5); // 1 comprador refundado / 2 compradores distintos
  assert.notEqual(r.main_product.refund_transaction_rate, r.main_product.refund_buyer_rate);
});

test('item 10: refund_value_rate usa valor monetário, não contagem — diverge de refund_transaction_rate quando os valores são desiguais', () => {
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', status: 'COMPLETE', counted: true, gross: 100, net: 90 }),
      tx({ id: 'M2', buyer: 'Bruno', status: 'REFUNDED', counted: false, gross: 10, net: 8 }),
    ]),
  });
  const r = computeComponentRefundRates(['2026-08-01'], dir);
  assert.equal(r.main_product.refund_transaction_rate, 0.5); // 1 de 2 transações
  assert.equal(r.main_product.refund_value_rate, Math.round((10 / 110) * 10000) / 10000); // 10 / (100+10) — bem diferente de 0.5
  assert.notEqual(r.main_product.refund_value_rate, r.main_product.refund_transaction_rate);
});

test('item 11: AOV usa FINANCIAL BUYERS como denominador, documentado explicitamente — nunca transaction count bruto', () => {
  const r = analyzeOffer({});
  assert.match(r.economics.denominators.gross_aov, /financial_buyer_count/);
  assert.match(r.economics.denominators.net_aov, /mesmo denominador financeiro/);
  assert.equal(r.economics.buyers, r.transaction_accounting.financial_buyer_count);
});

test('item 12: contribuição agregada do bump continua calculável mesmo sem atribuição buyer-level total, mas é rotulada como agregada', () => {
  const r = analyzeOffer({});
  assert.equal(typeof r.aov_decomposition.components.order_bump_contribution_gross, 'number');
  assert.equal(r.aov_decomposition.components.order_bump_contribution_attribution_level, 'AGGREGATE_REVENUE_CONTRIBUTION');
});

test('item 13: flag de atribuição reduz confidence SÓ em candidatos que dependem de attach rate buyer-level — não em receita agregada', () => {
  const r = analyzeOffer({});
  const attachCandidate = r.candidates.find((c) => c.target_metric === 'order_bump_attach_rate');
  const revenueCandidate = r.candidates.find((c) => c.target_metric === 'net_aov');
  assert.equal(attachCandidate.buyer_level_attribution.targets_buyer_level_attach, true);
  assert.ok(attachCandidate.buyer_level_attribution.confidence_multiplier < 1);
  assert.equal(revenueCandidate.buyer_level_attribution.targets_buyer_level_attach, false);
  assert.equal(revenueCandidate.buyer_level_attribution.confidence_multiplier, 1);
});

test('item 14: ranking recalcula a partir da fórmula real — nada hardcoded pra manter OFFER-CAND-001 em primeiro por padrão', () => {
  // fixture onde NENHUM bump tem linkage — penalidade máxima (0.5) no candidato de attach rate.
  const dir = makeFixtureDir({
    '2026-08-01': snapshot('2026-08-01', [
      tx({ id: 'M1', buyer: 'Ana', counted: true }),
      tx({ id: 'M2', buyer: 'Bruno', counted: true }),
      tx({ id: 'BUMP-1', product: 'Pack X', isMain: false, buyer: 'Zzz', date: '2026-08-09' }),
    ]),
  });
  const ba = linkBumpTransactionsToBuyers(['2026-08-01'], dir);
  assert.equal(ba.buyer_level_attach_rate_status, 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL');
  const economics = { buyers: 2, period: { data_completeness: 1 }, refund_rate: 0, order_bump_attach_rate: 0.5 };
  const candidates = generateOfferCandidates({ productId: 'p', offerId: 'OFFER-V1', economics, diagnostics: [], hypotheses: [], buyerAttribution: ba });
  const attachCandidate = candidates.find((c) => c.target_metric === 'order_bump_attach_rate');
  assert.equal(attachCandidate.buyer_level_attribution.confidence_multiplier, 0.5); // penalidade máxima, calculada, não hardcoded
});

test('item 15: bundle simulator NUNCA assume o proxy de attach como truth — exige input explícito ou retorna NOT_ESTIMABLE', () => {
  const r = simulateBumpStrategy({}); // nenhuma taxa passada — mesmo que economics.order_bump_attach_rate exista em outro lugar
  assert.equal(r.revenue_per_buyer_estimate, 'NOT_ESTIMABLE');
});

test('item 16: idempotência — mesma chamada real produz exatamente o mesmo resultado de atribuição', () => {
  const a = linkBumpTransactionsToBuyers(REAL_DATES);
  const b = linkBumpTransactionsToBuyers(REAL_DATES);
  assert.deepEqual(a, b);
});

test('resolveBaseOrderId: sufixo C1/C2 removido; ID sem sufixo permanece igual', () => {
  assert.equal(resolveBaseOrderId('HP3626434570C1'), 'HP3626434570');
  assert.equal(resolveBaseOrderId('HP3626434570C2'), 'HP3626434570');
  assert.equal(resolveBaseOrderId('HP4055488722'), 'HP4055488722');
});

test('real: 2 de 3 bumps têm ligação estrutural (mesmo pedido-base) — 1 fica como heurística não confiável', () => {
  const r = linkBumpTransactionsToBuyers(REAL_DATES);
  const structural = r.links.filter((l) => l.link_method === 'STRUCTURAL_ORDER_ID');
  const heuristic = r.links.filter((l) => l.link_method === 'NAME_DATE_HEURISTIC');
  assert.equal(structural.length, 2);
  assert.equal(heuristic.length, 1);
  assert.equal(r.buyer_level_attach_rate_status, 'PARTIAL_ATTRIBUTION_LOWER_BOUND');
});
