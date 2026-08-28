#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { loadHypotheses } = require('./learning/registry');
const { runCreativeIntelligence, analyzeRealCreatives, buildAssetsForRegistry } = require('./creative/builder');
const { generateNextCreativeCandidates } = require('./creative/candidateGenerator');
const { loadAssets, loadCandidates, loadAnalysis, saveAssets, saveCandidates, saveAnalysis } = require('./creative/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--analyze') args.analyze = true;
    else if (argv[i] === '--generate-candidates') args.generateCandidates = true;
    else if (argv[i] === '--creative') args.creative = argv[++i];
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(analysis, candidates) {
  return {
    product_id: analysis.product_id,
    total_creatives_found: analysis.total_creatives_found,
    creatives_with_sufficient_sample: analysis.creatives_with_sufficient_sample,
    best_current_signal: analysis.best_current_signal,
    champion: analysis.champion,
    candidates: candidates.map((c) => ({
      candidate_id: c.candidate_id, parent_creative_id: c.parent_creative_id, mode: c.mode,
      variable_changed: c.variable_changed, target_metric: c.target_metric, priority_score: c.priority_score,
    })),
  };
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);
  const hypotheses = loadHypotheses();

  if (args.creative) {
    const asset = loadAssets().find((a) => a.creative_id === args.creative);
    const out = asset || { creative_id: args.creative, found: false };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.rebuild) {
    const result = runCreativeIntelligence({ productId, hypotheses });
    saveAssets(result.assets);
    saveCandidates(result.candidates);
    saveAnalysis(result.analysis);
    const out = args.summary ? summaryOf(result.analysis, result.candidates) : { analysis: result.analysis, assets: result.assets, candidates: result.candidates };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.analyze) {
    const analysis = analyzeRealCreatives({ productId, hypotheses });
    const assets = buildAssetsForRegistry(analysis);
    saveAssets(assets);
    saveAnalysis(analysis);
    const out = args.summary ? summaryOf(analysis, []) : analysis;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.generateCandidates) {
    const analysis = loadAnalysis() || analyzeRealCreatives({ productId, hypotheses });
    const candidates = generateNextCreativeCandidates({ assets: analysis.assets, hypotheses, productId: analysis.product_id, count: 4 });
    saveCandidates(candidates);
    process.stdout.write(JSON.stringify(candidates, null, 2) + '\n');
    return candidates;
  }

  if (args.summary) {
    const analysis = loadAnalysis();
    const candidates = loadCandidates();
    const out = analysis ? summaryOf(analysis, candidates) : { reason: 'Nenhuma análise persistida ainda — rode --rebuild ou --analyze primeiro.' };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  throw new Error('uso: node creative.js [--rebuild] [--analyze] [--generate-candidates] [--creative ID] [--summary] [--product ID]');
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf };
