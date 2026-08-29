#!/usr/bin/env node
'use strict';

const { resolveProductId } = require('../config/product');
const { analyzeMeasurement, MEASUREMENT_VERSION } = require('./measurement/builder');
const {
  saveAnalysis, saveSourceOfTruth, saveMeasurementScopes, saveEventTaxonomy, saveIdentifierSpine,
  saveReconciliation, saveMeasurementDebt, saveTrackingContracts, saveCapitalGates,
} = require('./measurement/registry');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--contracts') args.contracts = true;
    else if (argv[i] === '--scopes') args.scopes = true;
    else if (argv[i] === '--reconciliation') args.reconciliation = true;
    else if (argv[i] === '--debt') args.debt = true;
    else if (argv[i] === '--capital-gate') args.capitalGate = true;
    else if (argv[i] === '--architecture') args.architecture = true;
    else if (argv[i] === '--experiment') args.experiment = true;
    else if (argv[i] === '--anomalies') args.anomalies = true;
    else if (argv[i] === '--safety-signal') args.safetySignal = true;
    else if (argv[i] === '--mva') args.mva = true;
    else if (argv[i] === '--rebuild') args.rebuild = true;
  }
  return args;
}

function summaryOf(result) {
  const a = result.analysis;
  return {
    product_id: result.product_id,
    analysis_id: a.analysis_id,
    version: a.version,
    financial_transaction_truth_status: a.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.status,
    platform_attribution_status: a.source_of_truth_matrix.PLATFORM_ATTRIBUTION.status,
    funnel_event_truth_status: a.source_of_truth_matrix.FUNNEL_EVENT_TRUTH.status,
    cross_platform_reconciliation_status: a.source_of_truth_matrix.CROSS_PLATFORM_RECONCILIATION.status,
    current_architecture_capital_gate: a.current_measurement_capital_gate.state,
    current_blocker: a.current_measurement_capital_gate.current_blocker,
    strategy_winner_architecture_id: a.strategy_handoff.winner_architecture_id,
    strategy_winner_capital_gate: a.strategy_handoff.found ? a.strategy_handoff.capital_gate.state : null,
    strategy_winner_current_blocker: a.strategy_handoff.found ? a.strategy_handoff.capital_gate.current_blocker : null,
    ghost_purchase_days: a.reconciliation.ghost_purchase_days.length,
    measurement_debt_top: a.measurement_debt[0] ? a.measurement_debt[0].debt_id : null,
    recommendation: a.recommendation.recommended_debt_id,
    must_have_before_test: a.recommendation.must_have_before_test.map((i) => i.debt_id),
  };
}

function persist(result) {
  const a = result.analysis;
  saveAnalysis(a);
  saveSourceOfTruth(a.source_of_truth_matrix);
  saveMeasurementScopes({ scopes: a.source_of_truth_matrix, attribution_layers: a.attribution_layers });
  saveEventTaxonomy(a.current_tracking_contract.required_events);
  saveIdentifierSpine(a.identifier_spine);
  saveReconciliation(a.reconciliation);
  saveMeasurementDebt(a.measurement_debt);
  saveTrackingContracts([a.current_tracking_contract, ...(a.strategy_handoff.found ? [a.strategy_handoff.tracking_contract] : [])]);
  saveCapitalGates([
    { subject_id: a.current_architecture_id, ...a.current_measurement_capital_gate },
    ...(a.strategy_handoff.found ? [{ subject_id: a.strategy_handoff.winner_architecture_id, ...a.strategy_handoff.capital_gate }] : []),
  ]);
}

function run(argv) {
  const args = parseArgs(argv);
  const productId = resolveProductId(args.product);
  const result = analyzeMeasurement({ productId });

  if (args.rebuild) persist(result);

  const a = result.analysis;
  const out = args.summary ? summaryOf(result)
    : args.contracts ? { current: a.current_tracking_contract, strategy_winner: a.strategy_handoff.found ? a.strategy_handoff.tracking_contract : null }
    : args.scopes ? a.source_of_truth_matrix
    : args.reconciliation ? a.reconciliation
    : args.debt ? a.measurement_debt
    : args.capitalGate ? { current: a.current_measurement_capital_gate, strategy_winner: a.strategy_handoff.found ? a.strategy_handoff.capital_gate : null }
    : args.architecture ? a.strategy_handoff
    : args.experiment ? a.experiment_attribution_interface
    : args.anomalies ? { current: a.current_anomaly_findings, strategy_winner: a.strategy_handoff.found ? a.strategy_handoff.anomaly_findings : null }
    : args.safetySignal ? { current: a.current_execution_safety_signal, strategy_winner: a.strategy_handoff.found ? a.strategy_handoff.execution_safety_signal : null }
    : args.mva ? { current: a.current_minimum_viable_attribution, strategy_winner: a.strategy_handoff.found ? a.strategy_handoff.minimum_viable_attribution : null }
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

module.exports = { run, parseArgs, summaryOf, persist, MEASUREMENT_VERSION };
