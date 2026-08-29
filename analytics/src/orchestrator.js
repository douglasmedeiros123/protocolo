#!/usr/bin/env node
'use strict';

// PASSO 15 — CEO/Orchestrator CLI. SHADOW_MODE sempre — nenhuma opção executa mutação externa.
const { resolveProductId } = require('../config/product');
const { runCeoDecisionCycle, ORCHESTRATOR_VERSION } = require('./orchestrator/builder');
const { runR5000ShadowScenario, runOperatorDisagreementScenario, runChallengeCurrentProductScenario, runLowConfidenceOpinionScenario, runTrueTieScenario } = require('./orchestrator/syntheticScenarios');
const { SHADOW_MODE } = require('./orchestrator/shadowMode');
const { loadLedger } = require('./orchestrator/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--cycle') args.cycle = true;
    else if (argv[i] === '--diagnosis') args.diagnosis = true;
    else if (argv[i] === '--candidates') args.candidates = true;
    else if (argv[i] === '--challenger') args.challenger = true;
    else if (argv[i] === '--ledger') args.ledger = true;
    else if (argv[i] === '--r5000-scenario') args.r5000 = true;
    else if (argv[i] === '--operator-disagreement-scenario') args.operatorDisagreement = true;
    else if (argv[i] === '--switch-product-scenario') args.switchProduct = true;
    else if (argv[i] === '--low-confidence-scenario') args.lowConfidence = true;
    else if (argv[i] === '--true-tie-scenario') args.trueTie = true;
  }
  return args;
}

function summaryOf(result) {
  return {
    version: ORCHESTRATOR_VERSION, shadow_mode: result.shadow_mode, autonomous_execution_capital: result.autonomous_execution_capital,
    dominant_constraint: result.diagnosis.dominant_constraint.category,
    final_orientation: result.final_orientation,
    recommended_candidate_id: result.ranking_result.recommended_candidate_id,
    confidence: result.ranking_result.confidence,
    policy_allows: result.policy_handoff.policy_allows,
    approval_requires: result.policy_handoff.approval_requires,
    circuit_breaker_state: result.policy_handoff.circuit_breaker_state,
    would_execute: result.shadow_execution.would_execute,
    failure_modes: result.failure_modes.detected.map((f) => f.mode),
    would_execute_externally: result.would_execute_externally,
  };
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.r5000) { process.stdout.write(JSON.stringify(runR5000ShadowScenario({ productId }), null, 2) + '\n'); return; }
  if (args.operatorDisagreement) { process.stdout.write(JSON.stringify(runOperatorDisagreementScenario({ productId }), null, 2) + '\n'); return; }
  if (args.switchProduct) { process.stdout.write(JSON.stringify(runChallengeCurrentProductScenario(), null, 2) + '\n'); return; }
  if (args.lowConfidence) { process.stdout.write(JSON.stringify(runLowConfidenceOpinionScenario(), null, 2) + '\n'); return; }
  if (args.trueTie) { process.stdout.write(JSON.stringify(runTrueTieScenario(), null, 2) + '\n'); return; }
  if (args.ledger) { process.stdout.write(JSON.stringify(loadLedger(), null, 2) + '\n'); return; }

  const result = runCeoDecisionCycle({ productId });
  const out = args.summary ? summaryOf(result)
    : args.diagnosis ? result.diagnosis
    : args.candidates ? result.candidates
    : args.challenger ? result.challenger_result
    : result;
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return out;
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, summaryOf, ORCHESTRATOR_VERSION, SHADOW_MODE };
