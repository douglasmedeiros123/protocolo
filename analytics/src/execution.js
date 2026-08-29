#!/usr/bin/env node
'use strict';

// PASSO 14A — CLI de segurança de execução. NENHUMA opção aqui executa mutação externa —
// tudo é DRY_RUN/SIMULATION/READ_ONLY (regra absoluta do PASSO).
const { resolveProductId } = require('../config/product');
const { proposeAndDryRunNextAction, EXECUTION_VERSION } = require('./execution/builder');
const { POLICY_CATEGORIES } = require('./execution/enums');
const { loadCapitalSafetyConfig } = require('./execution/capitalSafety');
const { evaluateCircuitBreaker } = require('./execution/circuitBreaker');
const { loadActions, loadApprovals, loadExposureRegistry, loadCircuitBreakerState } = require('./execution/registry');
const { SAFE_MODE } = require('./execution/safeMode');
const { runSyntheticR30ToR500Scenarios } = require('./execution/syntheticBudgetScenario');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--policies') args.policies = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--circuit-breaker') args.circuitBreaker = true;
    else if (argv[i] === '--actions') args.actions = true;
    else if (argv[i] === '--approvals') args.approvals = true;
    else if (argv[i] === '--exposure-registry') args.exposureRegistry = true;
    else if (argv[i] === '--safety') args.safety = true;
    else if (argv[i] === '--authority') args.authority = true;
    else if (argv[i] === '--buckets') args.buckets = true;
    else if (argv[i] === '--scale-ladder') args.scaleLadder = true;
    else if (argv[i] === '--limits') args.limits = true;
    else if (argv[i] === '--synthetic-scenario') args.syntheticScenario = true;
    else if (argv[i] === '--posture') args.posture = true;
  }
  return args;
}

function summaryOf(result) {
  return {
    version: EXECUTION_VERSION,
    safe_mode: result.safe_mode,
    proposed: result.proposed,
    action_type: result.action ? result.action.action_type : null,
    subject_id: result.action ? result.action.subject_id : null,
    policy_result: result.dry_run ? result.dry_run.policy_result.final_result : null,
    risk_level: result.dry_run ? result.dry_run.risk_level : null,
    human_approval_required: result.dry_run ? result.dry_run.human_approval_required : null,
    circuit_breaker_state: result.dry_run ? result.dry_run.circuit_breaker_state : null,
    would_execute_externally: result.would_execute_externally === true, // sempre false — nunca alterado por este CLI
  };
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);

  if (args.policies) {
    process.stdout.write(JSON.stringify({ categories: POLICY_CATEGORIES, capital_safety_config: loadCapitalSafetyConfig() }, null, 2) + '\n');
    return;
  }
  if (args.circuitBreaker) {
    const state = loadCircuitBreakerState();
    const evaluated = evaluateCircuitBreaker({ signals: {}, currentState: state.state, scope: 'GLOBAL' });
    process.stdout.write(JSON.stringify({ persisted_state: state, evaluated_with_no_new_signals: evaluated }, null, 2) + '\n');
    return;
  }
  if (args.actions) { process.stdout.write(JSON.stringify(loadActions(), null, 2) + '\n'); return; }
  if (args.approvals) { process.stdout.write(JSON.stringify(loadApprovals(), null, 2) + '\n'); return; }
  if (args.exposureRegistry) { process.stdout.write(JSON.stringify(loadExposureRegistry(), null, 2) + '\n'); return; }
  if (args.safety) { process.stdout.write(JSON.stringify({ safe_mode: SAFE_MODE, external_mutations: 'FORBIDDEN' }, null, 2) + '\n'); return; }
  if (args.syntheticScenario) { process.stdout.write(JSON.stringify(runSyntheticR30ToR500Scenarios(), null, 2) + '\n'); return; }

  // --dry-run e --summary (e default) fazem a mesma coisa: propõem a próxima ação real do
  // sistema e rodam o dry-run completo sobre ela. NUNCA executam nada.
  const result = proposeAndDryRunNextAction({ productId });
  const out = args.summary ? summaryOf(result)
    : args.authority ? { posture_recommendation: result.authority_posture_recommendation, tiers: result.authority_tiers }
    : args.buckets ? result.capital_buckets
    : args.scaleLadder ? result.scale_ladder
    : args.limits ? result.real_limit_recommendations
    : args.posture ? result.capital_posture_simulation
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

module.exports = { run, parseArgs, summaryOf, EXECUTION_VERSION };
