#!/usr/bin/env node
'use strict';

const path = require('path');
const { todayBRT, isValidDateStr } = require('./utils/dates');
const { writeJson } = require('./utils/fs');
const { canonicalize } = require('./utils/canonical');

const { standardWindows, customWindow } = require('./profit/windows');
const { aggregatePeriod } = require('./profit/aggregate');
const { computeCurrentFinancials, computeUnitEconomics } = require('./profit/financials');
const { computeGap } = require('./profit/gap');
const { runPresetScenarios } = require('./profit/scenarios');
const { classifyProfitStatus } = require('./profit/status');
const { computeCapitalStatus } = require('./profit/capital');
const { computeFinancialConfidence } = require('./profit/dataQuality');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_TARGET_ROAS = 2;

/**
 * Roda a análise completa (financeiro + economia unitária + gap + cenários + status + data
 * quality) pra UMA janela de datas. Não toca API nenhuma — opera só sobre analytics/data/daily/
 * já persistido pelo Data Agent.
 */
function analyzeWindow(window, targetRoas, dataDir) {
  const agg = aggregatePeriod(window.dates, dataDir);
  const current_financials = computeCurrentFinancials(agg.sum);
  const unit_economics = computeUnitEconomics(current_financials, targetRoas);
  const gap = computeGap(current_financials, targetRoas);
  const scenarios = runPresetScenarios(current_financials);
  const profit_status = classifyProfitStatus(current_financials.roas_financeiro, targetRoas);
  const data_quality = computeFinancialConfidence(agg);

  return {
    period: { label: window.label, from: window.from, to: window.to, days_requested: window.dates.length },
    current_financials,
    unit_economics,
    targets: { target_roas: targetRoas },
    gaps: gap,
    scenarios,
    profit_status,
    data_quality,
  };
}

function parseArgs(argv) {
  const args = { targetRoas: DEFAULT_TARGET_ROAS };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
    else if (argv[i] === '--target-roas') args.targetRoas = parseFloat(argv[++i]);
    else if (argv[i] === '--monthly-budget') args.monthlyBudget = parseFloat(argv[++i]);
  }
  return args;
}

function run(argv) {
  const args = parseArgs(argv);

  // --from/--to sozinho: só o período customizado. Senão: data de referência (--date ou hoje)
  // + as 5 janelas padrão.
  if (args.from && args.to) {
    const window = customWindow(args.from, args.to);
    const analysis = analyzeWindow(window, args.targetRoas);
    const referenceDate = args.to;
    const output = {
      generated_at: new Date().toISOString(),
      reference_date: referenceDate,
      target_roas: args.targetRoas,
      // período customizado não tem uma janela "mês atual" própria — usa o gasto do próprio
      // período customizado como base de "spent" (mais correto que forçar null aqui, já que
      // no modo --from/--to você está deliberadamente definindo o período de referência).
      capital_status: computeCapitalStatus(
        analysis.current_financials.gasto_meta,
        args.monthlyBudget != null ? { monthly_budget: args.monthlyBudget } : {}
      ),
      windows: { custom: analysis },
    };
    writeOutput(referenceDate, output);
    return output;
  }

  const referenceDate = args.date || todayBRT();
  if (!isValidDateStr(referenceDate)) throw new Error(`--date inválida: ${referenceDate} (use YYYY-MM-DD)`);

  const windowDefs = standardWindows(referenceDate);
  const windows = {};
  for (const [key, def] of Object.entries(windowDefs)) windows[key] = analyzeWindow(def, args.targetRoas);

  const spentThisMonth = windows.current_month.current_financials.gasto_meta;

  const output = {
    generated_at: new Date().toISOString(),
    reference_date: referenceDate,
    target_roas: args.targetRoas,
    capital_status: computeCapitalStatus(
      spentThisMonth,
      args.monthlyBudget != null ? { monthly_budget: args.monthlyBudget } : {}
    ),
    windows,
  };
  writeOutput(referenceDate, output);
  return output;
}

function writeOutput(referenceDate, output) {
  const filePath = path.join(DATA_DIR, 'profit', `${referenceDate}.json`);
  writeJson(filePath, canonicalize(output));
  process.stdout.write(`Profit Engine: analytics/data/profit/${referenceDate}.json\n`);
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, analyzeWindow, parseArgs, DEFAULT_TARGET_ROAS };
