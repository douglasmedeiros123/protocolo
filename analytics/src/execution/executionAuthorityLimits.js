'use strict';

const { isConfigured } = require('./capitalSafety');

// PASSO 14A.1, item 3 — INTELLIGENCE != AUTHORITY. A máquina pode RECOMENDAR uma ação muito
// maior do que seu limite autônomo — a recomendação em si nunca é limitada; só a AUTORIDADE DE
// EXECUÇÃO é. Três conceitos deliberadamente separados, nunca fundidos em um só número:
//   RECOMMENDATION_RANGE        — o que a inteligência propõe, sem teto.
//   AUTONOMOUS_EXECUTION_LIMIT  — até onde a execução pode ir SEM aprovação humana (do perfil de
//                                 capital safety ativo — NOT_CONFIGURED hoje, nunca inventado).
//   HUMAN_APPROVED_EXECUTION_LIMIT — até onde a execução pode ir COM aprovação humana explícita
//                                 (também do perfil — NOT_CONFIGURED hoje).
function buildRecommendationRange({ recommendedValue, currentValue }) {
  return { recommended_value: recommendedValue, current_value: currentValue, delta: (recommendedValue != null && currentValue != null) ? recommendedValue - currentValue : null };
}

/**
 * evaluateExecutionAuthority() — item 3. Nunca reduz a recomendação — só classifica onde ela cai
 * em relação aos limites de autoridade (que hoje não existem — NOT_CONFIGURED, então nenhum
 * valor jamais está "dentro" de um limite autônomo real).
 */
function evaluateExecutionAuthority({ recommendationRange, capitalSafetyProfile }) {
  const autonomousLimit = capitalSafetyProfile && isConfigured(capitalSafetyProfile, 'max_capital_per_action') ? capitalSafetyProfile.max_capital_per_action : 'NOT_CONFIGURED';
  const humanApprovedLimit = capitalSafetyProfile && isConfigured(capitalSafetyProfile, 'human_approval_threshold') ? capitalSafetyProfile.human_approval_threshold : 'NOT_CONFIGURED';

  const recommendedValue = recommendationRange.recommended_value;
  const withinAutonomousLimit = autonomousLimit !== 'NOT_CONFIGURED' && recommendedValue != null ? recommendedValue <= autonomousLimit : false; // NUNCA true sem limite real configurado
  const withinHumanApprovedLimit = humanApprovedLimit !== 'NOT_CONFIGURED' && recommendedValue != null ? recommendedValue <= humanApprovedLimit : false;

  return {
    recommendation_range: recommendationRange, // NUNCA truncado
    autonomous_execution_limit: autonomousLimit,
    human_approved_execution_limit: humanApprovedLimit,
    within_autonomous_limit: withinAutonomousLimit,
    within_human_approved_limit: withinHumanApprovedLimit,
    exceeds_known_limits: autonomousLimit === 'NOT_CONFIGURED' && humanApprovedLimit === 'NOT_CONFIGURED' ? 'UNKNOWN' : !withinHumanApprovedLimit,
    note: 'a recomendação em si NUNCA é reduzida por este limite — só sua elegibilidade de execução autônoma/aprovada é classificada aqui (item 3: intelligence != authority).',
  };
}

module.exports = { buildRecommendationRange, evaluateExecutionAuthority };
