#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { analyzeStrategy, STRATEGY_SEARCH_VERSION } = require('./strategy-search/builder');
const { loadArchitectures, saveArchitectures, saveAnalysis, saveComparisons, saveRecommendations, saveTestPlans } = require('./strategy-search/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--analyze') args.analyze = true;
    else if (argv[i] === '--architectures') args.architectures = true;
    else if (argv[i] === '--compare') args.compare = true;
    else if (argv[i] === '--recommend') args.recommend = true;
    else if (argv[i] === '--test-plan') args.testPlan = true;
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(result) {
  const a = result.analysis;
  return {
    product_id: result.product_id,
    analysis_id: a.analysis_id,
    current_architecture: a.current_architecture.architecture_id,
    current_family: a.current_architecture.family,
    financial_roas: a.current_economics.financial_roas,
    target_roas: a.current_economics.target_roas,
    challenge_current_strategy: a.challenge_current_strategy.status,
    optimization_vs_rearchitecture: a.optimization_vs_rearchitecture.decision,
    search_breadth: a.search_breadth.breadth,
    search_depth: a.search_depth.depth,
    challengers_count: a.challengers.length,
    decision_tie: a.decision_tie,
    recommendation_type: a.recommendation.recommendation_type,
    recommended_architecture_id: a.recommendation.recommended_architecture_id,
    confidence: a.recommendation.confidence,
    fallback_architecture_id: a.recommendation.fallback_architecture_id,
    counterfactual: a.counterfactual.answer,
  };
}

function persist(result) {
  saveArchitectures(result.architectures);
  saveAnalysis(result.analysis);
  saveComparisons({ ranking: result.analysis.ranking, decision_tie: result.analysis.decision_tie, tie_break_factor_order: result.analysis.tie_break_factor_order });
  saveRecommendations([{ recommendation_id: result.analysis.analysis_id, ...result.analysis.recommendation }]);
  saveTestPlans(result.analysis.challengers.map((c) => c.mva_test));
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.rebuild) {
    const result = analyzeStrategy({ productId });
    persist(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.analyze || args.architectures || args.compare || args.recommend || args.testPlan) {
    const result = analyzeStrategy({ productId });
    saveArchitectures(result.architectures);
    saveAnalysis(result.analysis);
    const out = args.summary ? summaryOf(result)
      : args.architectures ? result.architectures
      : args.compare ? { ranking: result.analysis.ranking, decision_tie: result.analysis.decision_tie }
      : args.recommend ? result.analysis.recommendation
      : args.testPlan ? result.analysis.challengers.map((c) => c.mva_test)
      : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.summary) {
    const architectures = loadArchitectures();
    const out = architectures.length ? architectures : { reason: 'Nenhuma análise persistida ainda — rode --rebuild ou --analyze primeiro.' };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  throw new Error('uso: node strategy-search.js [--rebuild] [--analyze] [--architectures] [--compare] [--recommend] [--test-plan] [--summary] [--product ID]');
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf, STRATEGY_SEARCH_VERSION };
