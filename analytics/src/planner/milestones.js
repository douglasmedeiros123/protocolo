'use strict';

const { TARGET_FINANCIAL_ROAS } = require('../decision/northStar');

// item 6 — ladder de milestones. ROAS 3 (o North Star, reusado — nunca duplicado) é sempre o
// ÚLTIMO degrau, nunca um objetivo final substituído por um intermediário.
const MILESTONE_LADDER = [0.75, 0.90, 1.00, 1.20, 1.50, 2.00, 2.50, TARGET_FINANCIAL_ROAS];

/**
 * computeMilestoneProgress() — item 6. Adapta o ladder se CURRENT já superar algum marco (nunca
 * aponta pra trás). Se roas atual for null/desconhecido, tudo fica null (nunca 0 forçado).
 */
function computeMilestoneProgress(currentRoas) {
  if (currentRoas == null || !Number.isFinite(currentRoas)) {
    return { current_roas: null, next_milestone: null, gap_to_next_milestone: null, gap_to_north_star: null, ladder: MILESTONE_LADDER, reason: 'financial ROAS atual indisponível — sem dado suficiente no período.' };
  }
  const nextMilestone = MILESTONE_LADDER.find((m) => m > currentRoas) ?? null;
  const gapToNorthStar = Math.round((TARGET_FINANCIAL_ROAS - currentRoas) * 10000) / 10000;
  return {
    current_roas: currentRoas,
    next_milestone: nextMilestone,
    gap_to_next_milestone: nextMilestone != null ? Math.round((nextMilestone - currentRoas) * 10000) / 10000 : 0,
    gap_to_north_star: gapToNorthStar,
    ladder: MILESTONE_LADDER,
    reason: nextMilestone != null
      ? `próximo degrau é ROAS ${nextMilestone} — degrau intermediário, NÃO o objetivo final (item 6).`
      : `ROAS atual (${currentRoas}) já alcançou ou superou o North Star (${TARGET_FINANCIAL_ROAS}).`,
  };
}

// item 35 — marcos financeiros além de ROAS. Reconhece progresso econômico mesmo antes de ROAS 3.
const FINANCIAL_MILESTONES = ['BREAK_EVEN', 'POSITIVE_CONTRIBUTION', 'ROAS_1_2', 'ROAS_1_5', 'ROAS_2', 'ROAS_2_5', 'ROAS_3'];

function classifyFinancialMilestone(currentRoas, lucroPrejuizo) {
  if (currentRoas == null && lucroPrejuizo == null) return { milestone: 'UNKNOWN', reached: [] };
  const reached = [];
  if (lucroPrejuizo != null && lucroPrejuizo > 0) reached.push('POSITIVE_CONTRIBUTION');
  if (currentRoas != null) {
    if (currentRoas >= 1.0) reached.push('BREAK_EVEN');
    if (currentRoas >= 1.2) reached.push('ROAS_1_2');
    if (currentRoas >= 1.5) reached.push('ROAS_1_5');
    if (currentRoas >= 2.0) reached.push('ROAS_2');
    if (currentRoas >= 2.5) reached.push('ROAS_2_5');
    if (currentRoas >= TARGET_FINANCIAL_ROAS) reached.push('ROAS_3');
  }
  return { milestone: reached.length ? reached[reached.length - 1] : 'NONE_YET', reached };
}

module.exports = { MILESTONE_LADDER, computeMilestoneProgress, FINANCIAL_MILESTONES, classifyFinancialMilestone };
