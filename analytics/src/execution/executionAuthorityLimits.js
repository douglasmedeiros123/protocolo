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

// PASSO 14B, item 1 — formaliza os 4 conceitos de capital (renomeando/estendendo os 3 do PASSO
// 14A.1 + o novo ABSOLUTE_PROHIBITED_CAPITAL/ACTION). ABSOLUTE_PROHIBITED_CAPITAL é um teto
// RÍGIDO — nunca ultrapassável por nenhuma autoridade, mesmo TIER_4/aprovação humana (ex.: um
// valor além do qual a própria continuidade do negócio fica em risco). Nenhum valor real é
// inventado — NOT_CONFIGURED até uma política externa definir.
function classifyCapitalConcepts({ recommendedValue, currentValue, capitalSafetyProfile }) {
  const range = buildRecommendationRange({ recommendedValue, currentValue });
  const authority = evaluateExecutionAuthority({ recommendationRange: range, capitalSafetyProfile });
  const absoluteProhibitedLimit = capitalSafetyProfile && capitalSafetyProfile.max_loss_before_pause !== 'NOT_CONFIGURED' ? capitalSafetyProfile.max_loss_before_pause : 'NOT_CONFIGURED';
  const exceedsAbsoluteProhibition = absoluteProhibitedLimit !== 'NOT_CONFIGURED' && recommendedValue != null ? recommendedValue > absoluteProhibitedLimit : false; // NUNCA true sem limite real configurado — mas nunca presumido seguro tb (ver reason)

  return {
    RECOMMENDED_CAPITAL: range, // item 1 — nunca truncado, mesmo que ultrapasse todos os outros 3
    AUTONOMOUS_EXECUTION_CAPITAL: { limit: authority.autonomous_execution_limit, within_limit: authority.within_autonomous_limit },
    HUMAN_APPROVED_CAPITAL: { limit: authority.human_approved_execution_limit, within_limit: authority.within_human_approved_limit },
    ABSOLUTE_PROHIBITED_CAPITAL: {
      limit: absoluteProhibitedLimit,
      exceeds_prohibition: exceedsAbsoluteProhibition,
      reason: absoluteProhibitedLimit === 'NOT_CONFIGURED'
        ? 'nenhum teto absoluto real configurado — nunca presumido seguro; qualquer execução autônoma real permanece bloqueada por outras camadas (Policy Engine/Approval Policy) até isso existir.'
        : (exceedsAbsoluteProhibition ? 'recomendação excede o teto absoluto — nenhuma autoridade, mesmo TIER_4/aprovação humana, pode autorizar isso.' : 'dentro do teto absoluto configurado.'),
    },
    note: 'os 4 conceitos são deliberadamente separados — RECOMMENDED_CAPITAL nunca é reduzido pelos outros 3 (item 1: intelligence != authority).',
  };
}

module.exports = { buildRecommendationRange, evaluateExecutionAuthority, classifyCapitalConcepts };
