#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('./utils/fs');
const { buildDraftExperiment } = require('./experiments/builder');
const { loadAllExperiments, saveExperiment, listExperimentIds } = require('./experiments/registry');
const { compareGapMagnitude } = require('./experiments/pathAnalysis');
const { computeCapitalCycle, computeCommittedBudget } = require('./experiments/capitalCycle');
const { normalizeScores } = require('./experiments/priority');
const { minimumEvidenceFor, estimateDaysToEvidence } = require('./experiments/evidence');

const PROFIT_DIR = path.join(__dirname, '..', 'data', 'profit');

function loadLatestProfitSnapshot(profitDate) {
  if (profitDate) {
    const snap = readJson(path.join(PROFIT_DIR, `${profitDate}.json`));
    if (!snap) throw new Error(`Sem snapshot de Profit Engine em analytics/data/profit/${profitDate}.json`);
    return snap;
  }
  if (!fs.existsSync(PROFIT_DIR)) throw new Error('analytics/data/profit/ não existe — rode o Profit Engine antes.');
  const files = fs.readdirSync(PROFIT_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error('Nenhum snapshot de Profit Engine encontrado.');
  return readJson(path.join(PROFIT_DIR, files[files.length - 1]));
}

/**
 * Taxas diárias reais — só do que dá pra medir sem inventar (compras e gasto vêm agregados no
 * current_financials; LPV/checkout por dia não estão nesse nível, ficam null e o cálculo de
 * dias-até-evidência cai no duration_days mínimo da categoria pra essas duas).
 */
function dailyRatesFromWindow(window) {
  const days = window.period.days_requested || 1;
  const f = window.current_financials;
  return {
    lpv_per_day: null,
    checkouts_per_day: null,
    compras_per_day: f.numero_compradores_reais / days,
    spend_per_day: f.gasto_meta / days,
  };
}

/** budget_limit é derivado do tempo REAL estimado até minimum_evidence, não de uma "semana" arbitrária. */
function budgetForCategory(category, dailyRates) {
  const minEv = minimumEvidenceFor(category);
  const speedDias = estimateDaysToEvidence(minEv, dailyRates);
  const budgetLimit = Math.round((dailyRates.spend_per_day || 0) * speedDias * 100) / 100;
  return { minEv, speedDias, budgetLimit };
}

function candidateDrafts(window, capitalCycle, maxBudgetPercentOfCycle, dailyRates, existingIds) {
  const cf = window.current_financials;
  const gapCmp = compareGapMagnitude(window.gaps);

  const specs = [
    {
      category: 'CREATIVE',
      change: 'concentrarmos o orçamento nos 2 criativos com amostra estatística real (Criativo 01 e 05) em vez de manter 23 variantes fragmentadas',
      expectedImprovement: 'o CTR/CPM ponderado melhore e o CPA financeiro caia',
      reason: 'hoje 21 das 23 variantes têm menos de 10 checkouts cada (sem confiança estatística), e só Criativo 01 (ROAS 0,76) e 05 (ROAS 1,12) têm sinal real — dado já levantado nesta sessão',
      targetMetric: 'cpa_financeiro',
      secondaryMetrics: ['ctr', 'cpm'],
      expectedEffect: { cpaChangePct: -0.15, aovChangePct: 0 },
      startCondition: 'orçamento realocado 100% para Criativo 01 e 05, demais pausados',
      successCondition: 'cpa_financeiro do período de teste <= baseline * 0.90 (redução real de 10%+)',
      failureCondition: 'cpa_financeiro do período de teste >= baseline (piorou ou ficou igual)',
      evidenceFlags: { has_specific_measured_metric: true, has_funnel_gap_quantified: true, has_corroborating_independent_source: false, has_prior_precedent_this_project: true },
    },
    {
      category: 'CRO',
      change: 'reduzirmos a fricção da primeira dobra da LP no navegador in-app do Instagram (menos payload, hook nos 2-3s iniciais, sem depender de scroll pra ver a oferta)',
      expectedImprovement: 'a taxa LPV→Checkout aumente',
      reason: `71% do tráfego vem do Instagram in-app com scroll médio de 16,8% e só 11s de tempo ativo (dado real do Clarity), e o gap pra meta de ROAS 2 no caminho CPA precisa de ${gapCmp.cpa_reduction_needed_percent != null ? (gapCmp.cpa_reduction_needed_percent * 100).toFixed(0) : '?'}% de redução`,
      targetMetric: 'taxa_lpv_checkout',
      secondaryMetrics: ['scroll_depth_avg_pct', 'engagement_active_time_s'],
      expectedEffect: { cpaChangePct: -0.20, aovChangePct: 0 },
      startCondition: 'nova versão da LP publicada, tráfego mantido no mesmo nível',
      successCondition: 'taxa_lpv_checkout do período de teste >= baseline * 1.20 (alta real de 20%+)',
      failureCondition: 'taxa_lpv_checkout do período de teste <= baseline',
      evidenceFlags: { has_specific_measured_metric: true, has_funnel_gap_quantified: true, has_corroborating_independent_source: true, has_prior_precedent_this_project: false },
    },
    {
      category: 'AOV',
      change: 'reforçarmos a oferta de order bump (bundle Núcleo+Objeções+Cobrança) na tela de checkout',
      expectedImprovement: 'o AOV líquido suba',
      reason: `o attach rate de order bump hoje é de ${(cf.order_bump_attach_rate * 100).toFixed(1)}% (real, 30 dias) e o caminho AOV pra ROAS 2 precisa de +${gapCmp.aov_increase_needed_percent != null ? (gapCmp.aov_increase_needed_percent * 100).toFixed(0) : '?'}%`,
      targetMetric: 'order_bump_attach_rate',
      secondaryMetrics: ['aov_liquido'],
      expectedEffect: { cpaChangePct: 0, aovChangePct: 0.10 },
      startCondition: 'bundle configurado e ativo no checkout',
      successCondition: 'aov_liquido do período de teste >= baseline * 1.10',
      failureCondition: 'aov_liquido do período de teste <= baseline',
      evidenceFlags: { has_specific_measured_metric: true, has_funnel_gap_quantified: true, has_corroborating_independent_source: false, has_prior_precedent_this_project: false },
    },
    {
      category: 'MEDIA_BUYING',
      change: 'restringirmos o posicionamento dos anúncios a Instagram Reels/Stories, cortando Facebook (Feed/Reels/Stories)',
      expectedImprovement: 'o CPM caia e, no mesmo gasto, o CPA financeiro melhore',
      reason: 'dado real de posicionamento (breakdown Meta) mostrou R$118,48 gastos em Facebook com ZERO vendas, contra ROAS 0,87 em Instagram Reels+Stories',
      targetMetric: 'cpm',
      secondaryMetrics: ['cpa_financeiro'],
      expectedEffect: { cpaChangePct: -0.25, aovChangePct: 0 },
      startCondition: 'conjunto de anúncios reconfigurado para posicionamento manual Instagram Reels+Stories',
      successCondition: 'cpa_financeiro do período de teste <= baseline * 0.85',
      failureCondition: 'cpa_financeiro do período de teste >= baseline',
      evidenceFlags: { has_specific_measured_metric: true, has_funnel_gap_quantified: false, has_corroborating_independent_source: true, has_prior_precedent_this_project: false },
    },
  ];

  const drafts = [];
  const idsSoFar = [...existingIds];
  for (const spec of specs) {
    const { minEv, speedDias, budgetLimit } = budgetForCategory(spec.category, dailyRates);
    const stopCondition = `minimum_evidence atingido (${JSON.stringify(minEv)}) OU ${speedDias.toFixed(1)} dias corridos (estimado no ritmo real atual), o que vier primeiro`;
    const exp = buildDraftExperiment(
      { ...spec, budgetLimit, stopCondition, dailyRates, existingIds: idsSoFar },
      window, capitalCycle, maxBudgetPercentOfCycle
    );
    drafts.push(exp);
    idsSoFar.push(exp.experiment_id);
  }
  return drafts;
}

function rankExperiments(experiments) {
  const sorted = [...experiments].sort((a, b) => (b.priority?.score ?? -Infinity) - (a.priority?.score ?? -Infinity));
  return normalizeScores(sorted);
}

function parseFlags(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    profitDate: get('--profit-date'),
    cycleBudget: get('--cycle-budget') != null ? parseFloat(get('--cycle-budget')) : undefined,
    cycleStart: get('--cycle-start'),
    cycleEnd: get('--cycle-end'),
    maxBudgetPercentOfCycle: get('--max-budget-percent-of-cycle') != null ? parseFloat(get('--max-budget-percent-of-cycle')) : undefined,
  };
}

function run(argv) {
  const command = argv[0];
  const flags = parseFlags(argv);

  const snapshot = loadLatestProfitSnapshot(flags.profitDate);
  const window = snapshot.windows.custom || snapshot.windows.last_30d;
  const dailyRates = dailyRatesFromWindow(window);

  const existingExperiments = loadAllExperiments();
  const committed = computeCommittedBudget(existingExperiments);
  const capitalCycle = computeCapitalCycle({
    cycleBudget: flags.cycleBudget, cycleStart: flags.cycleStart, cycleEnd: flags.cycleEnd,
    committedFromExperiments: committed,
  });

  if (command === 'create-drafts') {
    const existingIds = listExperimentIds();
    const drafts = candidateDrafts(window, capitalCycle, flags.maxBudgetPercentOfCycle, dailyRates, existingIds);
    for (const d of drafts) saveExperiment(d);
    process.stdout.write(`${drafts.length} experimentos DRAFT criados: ${drafts.map((d) => d.experiment_id).join(', ')}\n`);
    process.stdout.write(`capital_cycle.status: ${capitalCycle.status}\n`);
    return { drafts, capitalCycle };
  }

  if (command === 'rank') {
    const ranked = rankExperiments(loadAllExperiments());
    for (const e of ranked) {
      process.stdout.write(`${e.priority.score_normalized_0_100}  (raw ${e.priority.score.toFixed(4)})  ${e.experiment_id}  [${e.attacks_path}]  ${e.category}  ${e.status}\n`);
    }
    return ranked;
  }

  throw new Error(`Comando desconhecido: "${command}". Use: create-drafts | rank`);
}

if (require.main === module) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { run, candidateDrafts, rankExperiments, loadLatestProfitSnapshot, dailyRatesFromWindow, budgetForCategory, parseFlags };
