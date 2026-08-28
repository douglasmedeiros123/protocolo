#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { analyzeOffer, OFFER_ID } = require('./offer/builder');
const { loadOffers, loadAnalysis, saveOffers, saveAnalysis, saveDiagnostics, saveCandidates, saveScenarios } = require('./offer/registry');
const { simulateBumpStrategy } = require('./offer/bumpStrategyModel');
const { simulateUpsellDownsellTree } = require('./offer/upsellDownsellModel');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--analyze') args.analyze = true;
    else if (argv[i] === '--generate-candidates') args.generateCandidates = true;
    else if (argv[i] === '--offer') args.offer = argv[++i];
    else if (argv[i] === '--simulate') args.simulate = argv[++i]; // 'bump' | 'upsell'
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(result) {
  return {
    product_id: result.product_id,
    offer_id: result.offer_id,
    buyers: result.economics.buyers,
    gross_aov: result.economics.gross_aov,
    net_aov: result.economics.net_aov,
    order_bump_attach_rate_transaction_proxy: result.economics.order_bump_attach_rate,
    transaction_accounting: result.transaction_accounting,
    buyer_attribution: result.buyer_attribution ? {
      bump_transaction_count: result.buyer_attribution.bump_transaction_count,
      buyers_with_bump: result.buyer_attribution.buyers_with_bump,
      buyer_level_attach_rate: result.buyer_attribution.buyer_level_attach_rate,
      buyer_level_attach_rate_status: result.buyer_attribution.buyer_level_attach_rate_status,
      bump_transactions_without_structural_link: result.buyer_attribution.bump_transactions_without_structural_link,
      bump_transactions_per_buyer: result.buyer_attribution.bump_transactions_per_buyer,
    } : null,
    component_refund_rates: result.component_refund_rates ? {
      main_product: result.component_refund_rates.main_product,
      order_bump: result.component_refund_rates.order_bump,
    } : null,
    financial_cpa: result.financial_cpa,
    financial_roas_current: result.financial_roas_current,
    roas3_gap: { required_net_revenue_per_buyer_at_current_cpa: result.roas3_gap.required_net_revenue_per_buyer_at_current_cpa, aov_gap_to_roas3_percent: result.roas3_gap.aov_gap_to_roas3_percent, required_cpa_at_current_net_revenue_per_buyer: result.roas3_gap.required_cpa_at_current_net_revenue_per_buyer },
    diagnostics_count: result.diagnostics.length,
    aov_001_is_too_broad: result.aov_001_analysis.is_too_broad,
    candidates: result.candidates.map((c) => ({
      candidate_id: c.candidate_id, mode: c.mode, action_type: c.action_type, variable_changed: c.variable_changed,
      target_metric: c.target_metric, causality: c.causality.status, priority_score: c.priority_score,
    })),
    decision_tie: result.decision_tie,
  };
}

function persist(result) {
  saveOffers([result.offer]);
  saveDiagnostics(result.diagnostics);
  saveCandidates(result.candidates);
  saveAnalysis(result);
  saveScenarios(result.scenarios);
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.offer) {
    const offer = loadOffers().find((o) => o.offer_id === args.offer);
    const out = offer || { offer_id: args.offer, found: false };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.simulate) {
    const out = args.simulate === 'bump' ? simulateBumpStrategy({}) : simulateUpsellDownsellTree({});
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.rebuild) {
    const result = analyzeOffer({ productId });
    persist(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.analyze) {
    const result = analyzeOffer({ productId });
    saveOffers([result.offer]);
    saveAnalysis(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.generateCandidates) {
    const result = analyzeOffer({ productId });
    saveCandidates(result.candidates);
    process.stdout.write(JSON.stringify(result.candidates, null, 2) + '\n');
    return result.candidates;
  }

  if (args.summary) {
    const analysis = loadAnalysis();
    const out = analysis ? summaryOf(analysis) : { reason: 'Nenhuma análise persistida ainda — rode --rebuild ou --analyze primeiro.' };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  throw new Error('uso: node offer.js [--rebuild] [--analyze] [--generate-candidates] [--offer ID] [--simulate bump|upsell] [--summary] [--product ID]');
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf, OFFER_ID };
