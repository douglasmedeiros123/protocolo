'use strict';

// item 15 — WHERE_WE_ARE/WHERE_WE_NEED_TO_GO/WHAT_MUST_CHANGE/WHAT_WE_DONT_KNOW. Nunca
// recalcula — só organiza o que planner/measurement já calcularam.
function buildTargetGapAwareness(stateContract) {
  const { planner, measurement } = stateContract.data;
  const plan = planner.plan;

  return {
    where_we_are: { financial_roas: plan.current_state.financial_roas, profit_status: plan.current_state.profit_status.status, next_milestone: plan.current_state.milestone_progress.next_milestone },
    where_we_need_to_go: { north_star_target_roas: plan.north_star.target_roas, gap_absolute: plan.north_star.roas_gap_absolute, gap_percent: plan.north_star.roas_gap_percent, milestones: plan.north_star.milestones },
    what_must_change: planner.known_path_to_target.status === 'NO_KNOWN_PATH'
      ? ['os alavancas hoje quantificados (CPA/AOV) não fecham o gap sozinhos — algo estrutural (arquitetura/oferta/canal) provavelmente precisa mudar, não só otimização incremental.']
      : [`caminho conhecido: ${planner.known_path_to_target.reason}`],
    what_we_dont_know: [
      measurement.analysis.current_measurement_capital_gate.current_blocker ? `EXPOSURE_IDENTITY/measurement: ${measurement.analysis.current_measurement_capital_gate.reason}` : null,
      planner.target_planning.annual_target === 'NOT_CONFIGURED' ? 'nenhuma meta de capital/tempo real configurada (target_planning todo NOT_CONFIGURED).' : null,
      'marginal economics real (measurement/marginalEconomics.js) — UNKNOWN sem teste incremental real.',
    ].filter(Boolean),
    // item central: ROAS3 é marco estratégico, nunca requisito de todo teste intermediário.
    north_star_is_milestone_not_per_test_requirement: true,
  };
}

module.exports = { buildTargetGapAwareness };
