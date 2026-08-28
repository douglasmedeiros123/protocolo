#!/usr/bin/env node
'use strict';

const { todayBRT, isValidDateStr } = require('./utils/dates');
const { resolveProductId } = require('../config/product');
const { loadAllExperiments } = require('./experiments/registry');
const { computeCapitalCycle, computeCommittedBudget } = require('./experiments/capitalCycle');
const { loadHypotheses } = require('./learning/registry');
const { loadLatestProfitSnapshot } = require('./decision/profitSnapshot');
const { buildDecision } = require('./decision/builder');
const { saveDecision, loadAllDecisions } = require('./decision/registry');

function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--product') args.product = argv[++i];
    else if (argv[i] === '--summary') args.summary = true;
    else if (argv[i] === '--explain') args.explain = true;
    else if (argv[i] === '--simulate-cycle-budget') args.simulateCycleBudget = parseFloat(argv[++i]);
    else if (argv[i] === '--max-budget-percent-of-cycle') args.maxBudgetPercentOfCycle = parseFloat(argv[++i]);
  }
  return args;
}

/**
 * `--simulate-cycle-budget` NUNCA autoriza gasto — só simula um ciclo de capital hipotético
 * (7 dias corridos a partir de reference_date) pra permitir validar budget_check e montar
 * capital_tranches. Sem essa flag, capital_cycle fica CAPITAL_NOT_CONFIGURED (default seguro —
 * PROTECT_CAPITAL é a recomendação natural nesse caso).
 */
function run(argv) {
  const args = parseArgs(argv);
  const referenceDate = args.date || todayBRT();
  if (!isValidDateStr(referenceDate)) throw new Error(`--date inválida: ${referenceDate} (use YYYY-MM-DD)`);
  const productId = resolveProductId(args.product);

  const profitSnapshotResult = loadLatestProfitSnapshot(referenceDate);
  const experiments = loadAllExperiments();
  const hypotheses = loadHypotheses();

  const capitalCycle = args.simulateCycleBudget != null
    ? computeCapitalCycle({
      cycleBudget: args.simulateCycleBudget,
      cycleStart: referenceDate,
      cycleEnd: addDays(referenceDate, 6),
      committedFromExperiments: computeCommittedBudget(experiments),
    })
    : computeCapitalCycle({ cycleBudget: null, cycleStart: null, cycleEnd: null });

  const decision = buildDecision({
    productId,
    profitSnapshotResult,
    experiments,
    hypotheses,
    capitalCycle,
    maxBudgetPercentOfCycleOverride: args.maxBudgetPercentOfCycle ?? null,
    reasonToRetestByExperimentId: {},
  });

  const saved = saveDecision(decision);

  if (args.summary) {
    process.stdout.write(JSON.stringify({
      decision_id: saved.decision_id,
      product_id: saved.product_id,
      decision_mode: saved.decision_mode,
      north_star: saved.north_star,
      recommended_action: saved.recommended_action,
      action_type: saved.action_type,
      experiment_id: saved.experiment_id,
      capital_policy: saved.capital_policy,
      priority_score: saved.priority_score,
      decision_confidence: saved.decision_confidence,
      best_use_of_next_100: saved.best_use_of_next_100,
    }, null, 2) + '\n');
  } else if (args.explain) {
    process.stdout.write(JSON.stringify({
      decision_id: saved.decision_id,
      decision_trace: saved.decision_trace,
      alternative_actions: saved.alternative_actions,
      kill_condition: saved.kill_condition,
      release_conditions: saved.release_conditions,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(JSON.stringify(saved, null, 2) + '\n');
  }

  return saved;
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, parseArgs, addDays, loadAllDecisions };
