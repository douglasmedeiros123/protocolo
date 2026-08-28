'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeCurrentFinancials, computeUnitEconomics } = require('../src/profit/financials');

function fixtureSum(overrides = {}) {
  return {
    spend: 1000, impressions: 40000, clicks: 1000, lpv: 700, checkout: 60,
    compra_meta: 14, receita_meta: 900,
    gross_revenue: 1200, net_revenue: 1000, hotmart_fee_total: 200,
    orders_count: 10, order_bumps_count: 3,
    order_bump_gross: 150, order_bump_net: 130,
    refunds_count: 1, refunds_gross: 100,
    cancellations_or_expired_count: 0, test_transactions_count: 0,
    ...overrides,
  };
}

test('ROAS financeiro e de marketing calculados corretamente e são DIFERENTES entre si (fontes diferentes)', () => {
  const f = computeCurrentFinancials(fixtureSum());
  assert.equal(f.roas_financeiro, 1000 / 1000); // 1.0
  assert.equal(f.roas_marketing, 900 / 1000); // 0.9
  assert.notEqual(f.roas_financeiro, f.roas_marketing);
});

test('CPA financeiro usa vendas reais da Hotmart, CPA meta usa contagem do pixel', () => {
  const f = computeCurrentFinancials(fixtureSum());
  assert.equal(f.cpa_financeiro, 1000 / 10); // 100
  assert.equal(f.cpa_meta, 1000 / 14); // ~71.43
});

test('AOV bruto e líquido', () => {
  const f = computeCurrentFinancials(fixtureSum());
  assert.equal(f.aov_bruto, 1200 / 10);
  assert.equal(f.aov_liquido, 1000 / 10);
});

test('lucro/prejuízo = receita líquida Hotmart - gasto Meta (nunca usa receita da Meta)', () => {
  const lucro = computeCurrentFinancials(fixtureSum({ spend: 800, net_revenue: 1000 }));
  assert.equal(lucro.lucro_prejuizo, 200);
  const prejuizo = computeCurrentFinancials(fixtureSum({ spend: 1200, net_revenue: 1000 }));
  assert.equal(prejuizo.lucro_prejuizo, -200);
});

test('refund_rate e order bump revenue', () => {
  const f = computeCurrentFinancials(fixtureSum());
  assert.equal(f.refund_rate, 100 / 1200);
  assert.equal(f.order_bump_revenue_bruto, 150);
  assert.equal(f.order_bump_attach_rate, 3 / 10);
});

test('período SEM VENDAS: orders_count=0 não quebra — CPA/AOV (denominador=0) viram null, ROAS (numerador=0) vira 0 de verdade', () => {
  const f = computeCurrentFinancials(fixtureSum({ orders_count: 0, gross_revenue: 0, net_revenue: 0, order_bumps_count: 0 }));
  assert.equal(f.cpa_financeiro, null); // denominador (orders_count) é 0
  assert.equal(f.aov_bruto, null); // denominador (orders_count) é 0
  assert.equal(f.aov_liquido, null); // denominador (orders_count) é 0
  assert.equal(f.roas_financeiro, 0); // numerador (net_revenue) é 0, denominador (spend=1000) é válido -> 0 real, não null
});

test('período SEM GASTO: spend=0 não quebra — ROAS (spend no denominador) vira null; CPA (spend no numerador, dividido por vendas reais) vira 0 de verdade', () => {
  const f = computeCurrentFinancials(fixtureSum({ spend: 0 }));
  assert.equal(f.cpa_financeiro, 0); // 0 gasto / 10 vendas reais = R$0 de CPA, é um resultado real
  assert.equal(f.cpa_meta, 0); // idem
  assert.equal(f.roas_financeiro, null); // spend=0 é o DENOMINADOR aqui -> indefinido, não 0
  assert.equal(f.roas_marketing, null);
  // lucro/prejuízo continua calculável (receita - 0 gasto = lucro total)
  assert.equal(f.lucro_prejuizo, f.receita_liquida_hotmart);
});

test('CPA de equilíbrio é literalmente o AOV líquido (ROAS=1)', () => {
  const f = computeCurrentFinancials(fixtureSum());
  const ue = computeUnitEconomics(f, 2);
  assert.equal(ue.cpa_equilibrio, f.aov_liquido);
});

test('CPA máximo por ROAS: tabela completa, AOV/roas pra cada valor', () => {
  const f = computeCurrentFinancials(fixtureSum());
  const ue = computeUnitEconomics(f, 2);
  assert.equal(ue.cpa_maximo_por_roas[1], f.aov_liquido / 1);
  assert.equal(ue.cpa_maximo_por_roas[1.5], f.aov_liquido / 1.5);
  assert.equal(ue.cpa_maximo_por_roas[2], f.aov_liquido / 2);
  assert.equal(ue.cpa_maximo_por_roas[3], f.aov_liquido / 3);
});

test('AOV necessário pra sustentar cada CPA de referência, no ROAS-alvo', () => {
  const f = computeCurrentFinancials(fixtureSum());
  const ue = computeUnitEconomics(f, 2);
  assert.equal(ue.aov_necessario_por_cpa['30'], 30 * 2);
  assert.equal(ue.aov_necessario_por_cpa['70'], 70 * 2);
  assert.equal(ue.aov_necessario_por_cpa.atual, f.cpa_financeiro * 2);
});

test('as duas perguntas explícitas: AOV mantendo CPA, e CPA mantendo AOV, para ROAS 2', () => {
  const f = computeCurrentFinancials(fixtureSum());
  const ue = computeUnitEconomics(f, 2);
  assert.equal(ue.aov_necessario_mantendo_cpa_atual, f.cpa_financeiro * 2);
  assert.equal(ue.cpa_necessario_mantendo_aov_atual, f.aov_liquido / 2);
});

test('unit economics com CPA atual null (sem vendas) não quebra', () => {
  const f = computeCurrentFinancials(fixtureSum({ orders_count: 0, gross_revenue: 0, net_revenue: 0 }));
  const ue = computeUnitEconomics(f, 2);
  assert.equal(ue.aov_necessario_por_cpa.atual, null);
  assert.equal(ue.cpa_necessario_mantendo_aov_atual, null);
});
