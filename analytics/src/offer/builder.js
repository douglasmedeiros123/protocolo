'use strict';

const { resolveProductId } = require('../../config/product');
const { resolveAssetOrigin } = require('../learning/assetOrigin');
const { loadExperiment } = require('../experiments/registry');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');
const { aggregatePeriod } = require('../profit/aggregate');
const { computeCurrentFinancials } = require('../profit/financials');

const { resolveOfferSourceOfTruth } = require('./sourceOfTruth');
const { computeOfferEconomics, computeComponentRefundRates } = require('./economics');
const { linkBumpTransactionsToBuyers } = require('./buyerAttribution');
const { explainTransactionVsBuyerCount } = require('./transactionAccounting');
const { decomposeAov } = require('./aovDecomposition');
const { buildRealRevenueTree } = require('./revenueTree');
const { computeRoas3Gap } = require('./roasGap');
const { diagnoseOfferPerformanceLayers } = require('./performanceLayers');
const { runOfferScenarios } = require('./scenarioEngine');
const { buildOfferDiagnostics } = require('./diagnostics');
const { analyzeAov001 } = require('./aov001Analysis');
const { generateOfferCandidates } = require('./candidateGenerator');
const { rankOfferCandidates } = require('./ranking');
const { OWNERSHIP_BOUNDARIES } = require('./boundaries');

const OFFER_ID = 'OFFER-V1'; // única versão conhecida hoje — baseline (PASSO 10, item 4)

/**
 * buildOfferComponents() — monta a lista de componentes (item 9) a partir da fonte de verdade
 * REAL (item 5) + placeholders explícitos NOT_IMPLEMENTED pros estágios do funil que a
 * estratégia futura descreve (item 8) mas que não existem ainda. UNKNOWN != 0 (item 10): campos
 * sem dado ficam null, nunca 0.
 */
function buildOfferComponents(sourceOfTruth, economics, componentRefundRates, buyerAttribution) {
  const components = [];
  const ba = buyerAttribution || { per_component: [] };

  components.push({
    component_id: 'COMPONENT-MAIN', type: 'MAIN_PRODUCT', status: 'ACTIVE',
    price: sourceOfTruth.main_product.confirmed_price, net_price_if_known: null, position: 1, parent_component: null,
    eligibility: 'all_buyers', attach_rate: null, take_rate: null,
    gross_revenue: economics.main_product_revenue, net_revenue: null,
    refund_rate: componentRefundRates.main_product_refund_rate, margin_if_known: null,
    confidence: 100, source: sourceOfTruth.main_product.source,
  });

  sourceOfTruth.confirmed_active_bumps.forEach((b, i) => {
    const componentAttach = ba.per_component.find((c) => c.product_name === b.product_name);
    components.push({
      component_id: `COMPONENT-BUMP-${i + 1}`, type: 'ORDER_BUMP', status: 'ACTIVE',
      price: b.average_price, net_price_if_known: null, position: 2, parent_component: 'COMPONENT-MAIN',
      eligibility: 'checkout_toggle',
      // PASSO 10.1, item 9/10 — attach_rate aqui é o proxy de transação (agregado); o attach
      // buyer-level real (só linkage estrutural confirmada) fica em component_attach_rate_buyer_level.
      attach_rate: economics.order_bump_attach_rate,
      attach_rate_metric_type: 'TRANSACTION_LEVEL_PROXY',
      component_attach_rate_buyer_level: componentAttach ? componentAttach.component_attach_rate : null,
      take_rate: null,
      gross_revenue: b.gross_revenue, net_revenue: b.net_revenue,
      refund_rate: componentRefundRates.order_bump_refund_rate, margin_if_known: null,
      confidence: b.transactions_found >= 3 ? 60 : 30, // amostra pequena -> confiança moderada/baixa, nunca alta
      source: b.source, product_name: b.product_name,
    });
  });

  // PLANNED/NOT_IMPLEMENTED — item 7/8: nunca ACTIVE, nunca receita inventada.
  components.push({ component_id: 'COMPONENT-BUNDLE-PLANNED', type: 'BUMP_BUNDLE', status: 'PLANNED', price: null, net_price_if_known: null, position: 2, parent_component: 'COMPONENT-MAIN', eligibility: null, attach_rate: null, take_rate: null, gross_revenue: null, net_revenue: null, refund_rate: null, margin_if_known: null, confidence: 0, source: 'PASSO 10 item 8 — estratégia descrita, nenhum bundle real implementado.' });
  components.push({ component_id: 'COMPONENT-UPSELL-PLANNED', type: 'UPSELL', status: 'NOT_IMPLEMENTED', price: null, net_price_if_known: null, position: 3, parent_component: 'COMPONENT-MAIN', eligibility: null, attach_rate: null, take_rate: null, gross_revenue: null, net_revenue: null, refund_rate: null, margin_if_known: null, confidence: 0, source: 'PASSO 10 item 8 — estratégia descrita, nenhum upsell real implementado.' });
  components.push({ component_id: 'COMPONENT-DOWNSELL1-PLANNED', type: 'DOWNSELL', status: 'NOT_IMPLEMENTED', price: null, net_price_if_known: null, position: 4, parent_component: 'COMPONENT-UPSELL-PLANNED', eligibility: null, attach_rate: null, take_rate: null, gross_revenue: null, net_revenue: null, refund_rate: null, margin_if_known: null, confidence: 0, source: 'PASSO 10 item 8.' });
  components.push({ component_id: 'COMPONENT-DOWNSELL2-PLANNED', type: 'DOWNSELL', status: 'NOT_IMPLEMENTED', price: null, net_price_if_known: null, position: 5, parent_component: 'COMPONENT-DOWNSELL1-PLANNED', eligibility: null, attach_rate: null, take_rate: null, gross_revenue: null, net_revenue: null, refund_rate: null, margin_if_known: null, confidence: 0, source: 'PASSO 10 item 8.' });

  return components;
}

/**
 * Orquestra a análise completa da oferta real (PASSO 10). Só LEITURA: nunca chama API externa,
 * nunca altera Hotmart/checkout/LP — quem chama decide persistir (sempre em analytics/data/offer/).
 */
function analyzeOffer({ productId, dataDir, referenceDate } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();
  const dates = standardWindows(refDate).last_30d.dates;

  const sourceOfTruth = resolveOfferSourceOfTruth(dates, resolvedProductId);
  const economics = computeOfferEconomics(dates, dataDir);
  const componentRefundRates = computeComponentRefundRates(dates, dataDir);
  const buyerAttribution = linkBumpTransactionsToBuyers(dates, dataDir);
  const transactionAccounting = explainTransactionVsBuyerCount(dates, dataDir);
  const aovDecomposition = decomposeAov(economics);
  const revenueTree = buildRealRevenueTree(economics, aovDecomposition);

  const agg = aggregatePeriod(dates, dataDir);
  const financials = computeCurrentFinancials(agg.sum);
  const roas3Gap = computeRoas3Gap({ financialCpa: financials.cpa_financeiro, netRevenuePerBuyer: financials.aov_liquido });

  const performanceLayers = diagnoseOfferPerformanceLayers({ economics, roas3Gap });
  const scenarios = runOfferScenarios({ currentCpa: financials.cpa_financeiro, currentNetRevenuePerBuyer: financials.aov_liquido });

  const diagnostics = buildOfferDiagnostics({ productId: resolvedProductId, offerId: OFFER_ID, economics, aovDecomposition, componentRefundRates, buyerAttribution });

  const aov001Experiment = loadExperiment('AOV-001');
  const aov001Analysis = analyzeAov001(aov001Experiment);

  const candidatesRaw = generateOfferCandidates({ productId: resolvedProductId, offerId: OFFER_ID, economics, diagnostics, hypotheses: [], buyerAttribution });
  const rankedResult = rankOfferCandidates(candidatesRaw);
  const candidates = rankedResult.ranking;

  const components = buildOfferComponents(sourceOfTruth, economics, componentRefundRates, buyerAttribution);

  const offer = {
    offer_id: OFFER_ID,
    product_id: resolvedProductId,
    version: 1,
    status: 'BASELINE',
    parent_version: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    asset_origin: resolveAssetOrigin({}), // nunca inferido retroativamente sem registro explícito (item 3)
    components,
    economics,
    diagnostics: diagnostics.map((d) => d.diagnostic_id),
    hypotheses: candidates.map((c) => c.hypothesis.hypothesis_id),
    experiment_id: aov001Experiment ? aov001Experiment.experiment_id : null,
    learning_status: null,
  };

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    source_of_truth: sourceOfTruth,
    offer_id: OFFER_ID,
    offer,
    economics,
    component_refund_rates: componentRefundRates,
    buyer_attribution: buyerAttribution,
    transaction_accounting: transactionAccounting,
    aov_decomposition: aovDecomposition,
    revenue_tree: revenueTree,
    financial_cpa: financials.cpa_financeiro,
    financial_roas_current: financials.roas_financeiro,
    roas3_gap: roas3Gap,
    performance_layers: performanceLayers,
    scenarios,
    diagnostics,
    aov_001_analysis: aov001Analysis,
    candidates,
    decision_tie: rankedResult.decision_tie,
    decision_tie_candidates: rankedResult.decision_tie_candidates,
    tie_break_factor_order: rankedResult.tie_break_factor_order,
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
  };
}

module.exports = { analyzeOffer, buildOfferComponents, OFFER_ID };
