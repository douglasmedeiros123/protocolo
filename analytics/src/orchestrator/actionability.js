'use strict';

// item 18 — a recomendação precisa ser executável conceitualmente, nunca "melhorar conversão".
// WHAT/WHY/OWNER_SYSTEM/DEPENDENCIES/SUCCESS_SIGNAL/FAILURE_SIGNAL/MEASUREMENT_PLAN/
// CAPITAL_REQUIREMENT/AUTHORITY_REQUIREMENT/NEXT_REVIEW_TRIGGER, derivado do candidato real
// vencedor — nunca um texto genérico fixo.
function buildActionabilityContract(winnerCandidate, { authorityTier }) {
  if (!winnerCandidate) return null;
  return {
    what: winnerCandidate.hypothesis,
    why: `action_class=${winnerCandidate.action_class}, voi=${winnerCandidate.voi}, evidence=${winnerCandidate.evidence.join('; ') || 'nenhuma evidência adicional listada'}.`,
    owner_system: winnerCandidate.source_agent,
    dependencies: winnerCandidate.dependencies,
    success_signal: winnerCandidate.measurement_requirements.length > 0
      ? `${winnerCandidate.measurement_requirements.join(', ')} resolvido(s) e confirmável(is) via measurement/blockerDependencyGraph.js.`
      : 'candidato específico não define measurement_requirements — sucesso avaliado pelo action_class (ex.: HOLD_CAPITAL = nenhuma mudança negativa observada).',
    failure_signal: 'candidato não resolve o que se propôs (ex.: registro de exposure identity não elimina o blocker real, ou experimento não produz sinal interpretável).',
    measurement_plan: winnerCandidate.measurement_requirements,
    capital_requirement: winnerCandidate.capital_required,
    authority_requirement: authorityTier,
    next_review_trigger: 'próximo ciclo do CEO (reexecução do loop) ou quando o estado consumido mudar materialmente (novo experimento concluído, novo dado de measurement, mudança de tier).',
  };
}

module.exports = { buildActionabilityContract };
