#!/usr/bin/env node
'use strict';

const { loadAllExperiments } = require('./experiments/registry');
const { buildRawLearning, CLOSED_STATUSES } = require('./learning/learningBuilder');
const { buildHypothesisRegistry } = require('./learning/hypothesisRegistry');
const { buildPatterns } = require('./learning/patternEngine');
const { checkPriorLearning } = require('./learning/checkPriorLearning');
const { loadLearnings, loadPatterns, loadHypotheses, saveLearnings, savePatterns, saveHypotheses } = require('./learning/registry');

/**
 * Rebuild completo e determinístico: lê TODOS os experimentos, recalcula learnings/hypotheses/
 * patterns do zero (nunca faz append incremental — é assim que a idempotência é garantida:
 * mesmo conjunto de experimentos fechados sempre produz o mesmo conjunto de learnings).
 * `tagsByExperimentId` é opcional — permite informar mechanism/context/funnel_stage/asset_type
 * por experiment_id (esses campos não existem no schema do Experiment Engine hoje).
 */
function rebuild(tagsByExperimentId = {}, dirs = {}) {
  const { experimentsDir, learningDir } = dirs;
  const experiments = loadAllExperiments(experimentsDir);
  const closedExperiments = experiments.filter((e) => CLOSED_STATUSES.includes(e.status));
  const draftOrOpenExperiments = experiments.filter((e) => !CLOSED_STATUSES.includes(e.status));

  const existingLearnings = loadLearnings(learningDir);
  const existingById = new Map(existingLearnings.map((l) => [l.learning_id, l]));

  const rawLearnings = closedExperiments
    .map((exp) => buildRawLearning(exp, tagsByExperimentId[exp.experiment_id] || {}))
    .filter(Boolean);

  const { learnings: enriched, hypotheses } = buildHypothesisRegistry(rawLearnings);

  const now = new Date().toISOString();
  const finalLearnings = enriched.map((l) => {
    const prior = existingById.get(l.learning_id);
    return { ...l, created_at: prior ? prior.created_at : now, updated_at: now };
  });

  // last_tested_at por hipótese = created_at mais recente entre os learnings do grupo
  const finalHypotheses = hypotheses.map((h) => {
    const dates = h.learning_ids.map((id) => finalLearnings.find((l) => l.learning_id === id).created_at);
    return { ...h, last_tested_at: dates.sort().slice(-1)[0] || null };
  });

  const patterns = buildPatterns(finalLearnings);

  saveLearnings(finalLearnings, learningDir);
  saveHypotheses(finalHypotheses, learningDir);
  savePatterns(patterns, learningDir);

  return {
    total_experiments: experiments.length,
    closed_experiments: closedExperiments.length,
    open_or_draft_experiments: draftOrOpenExperiments.length,
    open_or_draft_ids: draftOrOpenExperiments.map((e) => e.experiment_id),
    learnings: finalLearnings,
    hypotheses: finalHypotheses,
    patterns,
  };
}

function summary(dirs = {}) {
  const { experimentsDir, learningDir } = dirs;
  const experiments = loadAllExperiments(experimentsDir);
  const closed = experiments.filter((e) => CLOSED_STATUSES.includes(e.status));
  const learnings = loadLearnings(learningDir);
  const hypotheses = loadHypotheses(learningDir);
  const patterns = loadPatterns(learningDir);

  const byCategory = {};
  for (const h of hypotheses) {
    byCategory[h.category] = byCategory[h.category] || { hypotheses: 0, times_tested: 0 };
    byCategory[h.category].hypotheses += 1;
    byCategory[h.category].times_tested += h.times_tested;
  }

  return {
    total_experiments: experiments.length,
    completed_experiments: closed.length,
    learnings: learnings.length,
    hypotheses_tested: hypotheses.length,
    patterns_detected: patterns.length,
    strong: hypotheses.filter((h) => h.status === 'STRONG').map((h) => h.product_hypothesis_key),
    invalidated: hypotheses.filter((h) => h.status === 'INVALIDATED').map((h) => h.product_hypothesis_key),
    contradicted: hypotheses.filter((h) => h.status === 'CONTRADICTED').map((h) => h.product_hypothesis_key),
    categories_with_most_evidence: Object.entries(byCategory)
      .sort((a, b) => b[1].times_tested - a[1].times_tested)
      .map(([category, stats]) => ({ category, ...stats })),
  };
}

function showExperiment(experimentId, dirs = {}) {
  const { experimentsDir, learningDir } = dirs;
  const learnings = loadLearnings(learningDir);
  const found = learnings.find((l) => l.source_experiment_id === experimentId);
  if (found) return { has_learning: true, learning: found };
  const experiments = loadAllExperiments(experimentsDir);
  const exp = experiments.find((e) => e.experiment_id === experimentId);
  if (!exp) return { has_learning: false, reason: `experimento ${experimentId} não encontrado` };
  return { has_learning: false, reason: `status atual é ${exp.status} — só SUCCESS/FAILURE/INCONCLUSIVE viram learning` };
}

function showHypothesis(key, dirs = {}) {
  const hypotheses = loadHypotheses(dirs.learningDir);
  const entry = hypotheses.find((h) => h.product_hypothesis_key === key);
  return entry || { product_hypothesis_key: key, found: false };
}

function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    rebuild: argv.includes('--rebuild'),
    experiment: get('--experiment'),
    summary: argv.includes('--summary'),
    hypothesis: get('--hypothesis'),
  };
}

function run(argv) {
  const args = parseArgs(argv);
  const out = {};
  if (args.rebuild) out.rebuild = rebuild();
  if (args.experiment) out.experiment = showExperiment(args.experiment);
  if (args.summary) out.summary = summary();
  if (args.hypothesis) out.hypothesis = showHypothesis(args.hypothesis);
  if (!args.rebuild && !args.experiment && !args.summary && !args.hypothesis) {
    throw new Error('uso: node learning.js [--rebuild] [--experiment ID] [--summary] [--hypothesis KEY]');
  }
  return out;
}

if (require.main === module) {
  try {
    const result = run(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  }
}

module.exports = { rebuild, summary, showExperiment, showHypothesis, checkPriorLearning, run, parseArgs };
