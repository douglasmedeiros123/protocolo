#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { analyzeCro, LANDING_PAGE_ID } = require('./cro/builder');
const { loadLandingPages, loadAnalysis, loadDiagnostics, loadCandidates, saveLandingPages, saveAnalysis, saveDiagnostics, saveCandidates } = require('./cro/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--analyze') args.analyze = true;
    else if (argv[i] === '--generate-candidates') args.generateCandidates = true;
    else if (argv[i] === '--landing-page') args.landingPage = argv[++i];
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(result) {
  return {
    product_id: result.product_id,
    source_of_truth: result.source_of_truth.considered_path,
    landing_page_id: result.landing_page_id,
    section_count: result.section_map.length,
    clarity_status: result.clarity_current_behavior_snapshot.status,
    lpv_to_checkout_rate: result.historical_funnel_metrics.lpv_to_checkout_rate,
    diagnostics_count: result.diagnostics.length,
    cro_001_is_too_broad: result.cro_001_analysis.is_too_broad,
    candidates: result.candidates.map((c) => ({
      candidate_id: c.candidate_id, mode: c.mode, variable_changed: c.variable_changed,
      target_metric: c.target_metric, causality: c.causality.status, priority_score: c.priority_score,
    })),
  };
}

function persist(result) {
  saveLandingPages([result.landing_page]);
  saveDiagnostics(result.diagnostics);
  saveCandidates(result.candidates);
  saveAnalysis(result);
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.landingPage) {
    const lp = loadLandingPages().find((l) => l.landing_page_id === args.landingPage);
    const out = lp || { landing_page_id: args.landingPage, found: false };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.rebuild) {
    const result = analyzeCro({ productId });
    persist(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.analyze) {
    const result = analyzeCro({ productId });
    saveLandingPages([result.landing_page]);
    saveAnalysis(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.generateCandidates) {
    const result = analyzeCro({ productId });
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

  throw new Error('uso: node cro.js [--rebuild] [--analyze] [--generate-candidates] [--landing-page ID] [--summary] [--product ID]');
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf, LANDING_PAGE_ID };
