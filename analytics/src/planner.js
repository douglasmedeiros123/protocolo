#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { analyzePlan, PLAN_VERSION } = require('./planner/builder');
const { loadPlans, loadRoadmap, savePlans, saveViability, saveEvidenceGaps, saveRoadmap, saveScenarios } = require('./planner/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--analyze') args.analyze = true;
    else if (argv[i] === '--viability') args.viability = true;
    else if (argv[i] === '--roadmap') args.roadmap = true;
    else if (argv[i] === '--scenarios') args.scenarios = true;
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(result) {
  return {
    product_id: result.product_id,
    plan_id: result.plan.plan_id,
    verdict: result.plan.verdict,
    verdict_confidence: result.plan.verdict_confidence,
    viability_status: result.plan.viability_status,
    capital_posture: result.plan.capital_posture,
    financial_roas: result.economics_snapshot.financials.roas_financeiro,
    target_roas: result.economics_snapshot.roas3_gap.target_roas,
    financial_truth_status: result.tracking_scopes.FINANCIAL_TRUTH.status,
    known_path_to_target: result.known_path_to_target.status,
    hypothesis_space_status: result.hypothesis_space_status.status,
    expected_economic_value_of_continuing: result.expected_economic_value_of_continuing.status,
    value_of_information_of_continuing: result.value_of_information_of_continuing.status,
    switch_gate_eligible: result.switch_gate.eligible,
    scale_gate_status: result.scale_gate.status,
    evidence_gaps_count: result.evidence_gaps.length,
    actions_count: result.actions.length,
    decision_tie: result.decision_tie,
    roadmap: result.roadmap,
    best_next_strategic_action: result.best_next_strategic_action.action,
  };
}

function persist(result) {
  savePlans([result.plan]);
  saveViability({ product_id: result.product_id, viability_status: result.plan.viability_status, verdict: result.plan.verdict, verdict_confidence: result.plan.verdict_confidence, evidence_matrix: result.evidence_matrix, generated_at: result.generated_at });
  saveEvidenceGaps(result.evidence_gaps);
  saveRoadmap(result.roadmap);
  saveScenarios(result.plan.scenario_analysis);
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.roadmap && !args.rebuild) {
    const roadmap = loadRoadmap();
    const out = roadmap || { reason: 'Nenhum roadmap persistido ainda — rode --rebuild primeiro.' };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.rebuild) {
    const result = analyzePlan({ productId });
    persist(result);
    const out = args.summary ? summaryOf(result) : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.analyze || args.viability || args.scenarios) {
    const result = analyzePlan({ productId });
    savePlans([result.plan]);
    const out = args.summary ? summaryOf(result)
      : args.viability ? { viability_status: result.plan.viability_status, verdict: result.plan.verdict, verdict_confidence: result.plan.verdict_confidence, reasoning: result.plan.verdict_reasoning, evidence_matrix: result.evidence_matrix }
      : args.scenarios ? result.plan.scenario_analysis
      : result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  if (args.summary) {
    const plans = loadPlans();
    const latest = plans.length ? plans[plans.length - 1] : null;
    const out = latest || { reason: 'Nenhum plano persistido ainda — rode --rebuild ou --analyze primeiro.' };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  throw new Error('uso: node planner.js [--rebuild] [--analyze] [--viability] [--roadmap] [--scenarios] [--summary] [--product ID]');
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf, PLAN_VERSION };
