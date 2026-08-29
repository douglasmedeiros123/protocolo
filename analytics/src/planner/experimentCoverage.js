'use strict';

const { CATEGORIES } = require('../experiments/schema');

// item 43 — status que contam como "concluído" pra fins de cobertura estratégica. DRAFT/READY/
// RUNNING/PAUSED NUNCA contam como testado — só o resultado final importa.
const COMPLETED_STATUSES = ['SUCCESS', 'FAILURE', 'INCONCLUSIVE'];
const IN_PROGRESS_STATUSES = ['READY', 'RUNNING', 'PAUSED'];

/**
 * buildExperimentCoverage() — item 43/44. Classifica experimentos reais por categoria,
 * diferenciando DRAFT de COMPLETED explicitamente. Nunca finge que DRAFT = testado.
 */
function buildExperimentCoverage(experiments) {
  const byCategory = {};
  for (const cat of CATEGORIES) {
    const inCat = experiments.filter((e) => e.category === cat);
    byCategory[cat] = {
      total: inCat.length,
      draft: inCat.filter((e) => e.status === 'DRAFT').length,
      in_progress: inCat.filter((e) => IN_PROGRESS_STATUSES.includes(e.status)).length,
      completed: inCat.filter((e) => COMPLETED_STATUSES.includes(e.status)).length,
      success: inCat.filter((e) => e.status === 'SUCCESS').length,
      failure: inCat.filter((e) => e.status === 'FAILURE').length,
      inconclusive: inCat.filter((e) => e.status === 'INCONCLUSIVE').length,
      cancelled: inCat.filter((e) => e.status === 'CANCELLED').length,
    };
  }
  return {
    by_category: byCategory,
    total_experiments: experiments.length,
    total_completed: experiments.filter((e) => COMPLETED_STATUSES.includes(e.status)).length,
    total_draft: experiments.filter((e) => e.status === 'DRAFT').length,
    note: 'DRAFT/READY/RUNNING/PAUSED nunca contam como "testado" — só SUCCESS/FAILURE/INCONCLUSIVE (item 43).',
  };
}

/**
 * buildLearningEvidence() — item 44. Separa aprendizado real (persistido) por lever/categoria —
 * nunca conta aprendizado sintético como evidência se não vier do registro real.
 */
function buildLearningEvidence(hypotheses) {
  const byCategory = {};
  for (const cat of CATEGORIES) {
    const inCat = hypotheses.filter((h) => h.category === cat);
    byCategory[cat] = {
      supporting_learnings: inCat.filter((h) => h.status === 'STRONG' || h.status === 'SUPPORTED').length,
      contradictory_learnings: inCat.filter((h) => h.status === 'CONTRADICTED').length,
      invalidated_hypotheses: inCat.filter((h) => h.status === 'INVALIDATED').length,
      provisional: inCat.filter((h) => h.status === 'PROVISIONAL').length,
      total: inCat.length,
    };
  }
  return { by_category: byCategory, total_hypotheses: hypotheses.length, source: 'analytics/data/learning/hypotheses.json — real, nunca sintético.' };
}

/**
 * classifyHypothesisSpaceStatus() — item 18. NUNCA "testamos X de Y hipóteses possíveis" (não há
 * um denominador conhecido de "todas as hipóteses possíveis"). Usa sinais qualitativos reais:
 * quantos levers têm >=1 hipótese testada, quantas categorias têm experimento concluído,
 * quantas hipóteses fortes/invalidadas existem.
 */
function classifyHypothesisSpaceStatus(experimentCoverage, learningEvidence) {
  if (experimentCoverage.total_experiments === 0) return { status: 'UNKNOWN', reason: 'nenhum experimento registrado ainda.' };

  const categoriesWithCompleted = Object.values(experimentCoverage.by_category).filter((c) => c.completed > 0).length;
  const categoriesWithAnyExperiment = Object.values(experimentCoverage.by_category).filter((c) => c.total > 0).length;
  const totalHypotheses = learningEvidence.total_hypotheses;

  if (categoriesWithCompleted === 0) {
    return { status: 'LARGELY_UNEXPLORED', reason: `${categoriesWithAnyExperiment} categoria(s) tem(êm) experimento registrado, mas 0 concluído (todos DRAFT/READY/RUNNING) — nenhuma evidência real de resultado ainda.` };
  }
  if (categoriesWithCompleted <= 1 && totalHypotheses <= 2) {
    return { status: 'PARTIALLY_EXPLORED', reason: `${categoriesWithCompleted} categoria(s) com experimento concluído, ${totalHypotheses} hipótese(s) registrada(s) — ainda início de exploração.` };
  }
  if (categoriesWithCompleted >= 2 && categoriesWithCompleted < CATEGORIES.length - 1) {
    return { status: 'WELL_EXPLORED', reason: `${categoriesWithCompleted} de ${CATEGORIES.length} categorias com experimento concluído.` };
  }
  if (categoriesWithCompleted >= CATEGORIES.length - 1) {
    return { status: 'NEAR_EXHAUSTED', reason: `quase todas as categorias (${categoriesWithCompleted}/${CATEGORIES.length}) têm experimento concluído.` };
  }
  return { status: 'UNKNOWN', reason: 'combinação de sinais não se encaixa em nenhuma classificação documentada.' };
}

module.exports = { buildExperimentCoverage, buildLearningEvidence, classifyHypothesisSpaceStatus, COMPLETED_STATUSES, IN_PROGRESS_STATUSES };
