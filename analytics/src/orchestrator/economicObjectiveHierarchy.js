'use strict';

const { ECONOMIC_OBJECTIVE_HIERARCHY } = require('./enums');

// item 14 — MAXIMIZE_SUSTAINABLE_ABSOLUTE_PROFIT é o objetivo final; North Star (ROAS 3.0,
// decision/northStar.js) é um marco estratégico existente NO CAMINHO pra esse objetivo, nunca o
// objetivo em si. Nunca sacrifica lucro absoluto só pra manter ROAS visualmente alto.
function locateCurrentPositionInHierarchy(diagnosis) {
  const { measurement_state, profitability_state, experiment_state, capital_state } = diagnosis;

  if (measurement_state.financial_truth_health !== 'RELIABLE') return { current_level: 'PROTECT_FINANCIAL_TRUTH', reason: `financial_truth_health=${measurement_state.financial_truth_health} — nada abaixo disso na hierarquia é seguro perseguir ainda.` };
  if (capital_state.authority_tier === 'TIER_0_ANALYZE_ONLY') return { current_level: 'PROTECT_CAPITAL', reason: 'TIER_0 — proteger capital (não gastar autonomamente) é o nível ativo agora.' };
  if (profitability_state.status === 'LOSS' || profitability_state.status === 'CRITICAL_LOSS') return { current_level: 'RESTORE_ACHIEVE_ECONOMIC_VIABILITY', reason: `profitability_state=${profitability_state.status} — ainda não alcançou viabilidade econômica básica.` };
  if (experiment_state.completed_experiments === 0) return { current_level: 'GENERATE_RELIABLE_LEARNING', reason: '0 experimentos concluídos — gerar aprendizado confiável é o nível ativo antes de perseguir lucratividade repetível.' };
  return { current_level: 'REACH_REPEATABLE_PROFITABILITY', reason: 'níveis anteriores da hierarquia já satisfeitos pelo estado real — próximo nível é lucratividade repetível.' };
}

module.exports = { ECONOMIC_OBJECTIVE_HIERARCHY, locateCurrentPositionInHierarchy };
