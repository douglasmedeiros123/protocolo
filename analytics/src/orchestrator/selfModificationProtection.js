'use strict';

const { evaluatePolicyChangeRequest: evaluateExecutionPolicyChangeRequest, PROTECTED_POLICY_DOMAINS: EXECUTION_PROTECTED_DOMAINS } = require('../execution/selfModificationProtection');

// item 25 — o CEO NÃO pode alterar: Policy Engine, Capital Authority, Authority Tier, Circuit
// Breaker, Human Approval Rules, SAFE_MODE, North Star, financial truth hierarchy, protected
// execution permissions. Ele pode RECOMENDAR mudança de política — nunca aplicar. Reusa
// execution/selfModificationProtection.js (nunca duplica a lógica), estendendo com os domínios
// específicos do CEO.
const CEO_PROTECTED_DOMAINS = [
  ...EXECUTION_PROTECTED_DOMAINS, // CAPITAL_LIMITS/CIRCUIT_BREAKER_THRESHOLDS/HUMAN_APPROVAL_THRESHOLDS/GLOBAL_FREEZE_RULES/PERMISSION_LEVELS/ACTIVE_CAPITAL_PROFILE/ACTIVE_AUTHORITY_TIER
  'NORTH_STAR_TARGET', 'FINANCIAL_TRUTH_HIERARCHY', 'SHADOW_MODE_FLAG', 'SOURCE_OF_TRUTH_HIERARCHY',
];

/**
 * evaluateCeoPolicyChangeRequest() — item 25. O CEO em si é sempre origem CEO_ORCHESTRATOR —
 * nunca autorizada pra domínios protegidos, mesmo quando a "recomendação" vem com alta confiança.
 * Ele pode registrar uma RECOMENDAÇÃO de mudança (texto/estrutura), nunca aplicá-la.
 */
function evaluateCeoPolicyChangeRequest({ domain, requestedByOrigin = 'CEO_ORCHESTRATOR' }) {
  if (CEO_PROTECTED_DOMAINS.includes(domain)) {
    return { allowed: false, reason: `${domain} é protegido — CEO_ORCHESTRATOR nunca aplica mudanças aqui, só pode RECOMENDAR (item 25). Aplicação exige origem externa/autorizada (HUMAN_OPERATOR/EXTERNAL_CONFIG_FILE_SIGNED/ADMIN_CONSOLE).` };
  }
  return evaluateExecutionPolicyChangeRequest({ domain, requestedByOrigin });
}

/** buildPolicyChangeRecommendation() — item 25: CEO pode recomendar, nunca aplicar. */
function buildPolicyChangeRecommendation({ domain, currentValue, recommendedValue, reason }) {
  return { domain, current_value: currentValue, recommended_value: recommendedValue, reason, applied: false, note: 'recomendação registrada — CEO nunca aplica mudanças de política protegida (item 25). Aplicação exige autoridade externa.' };
}

module.exports = { CEO_PROTECTED_DOMAINS, evaluateCeoPolicyChangeRequest, buildPolicyChangeRecommendation };
