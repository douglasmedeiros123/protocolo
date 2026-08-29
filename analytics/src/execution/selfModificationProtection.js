'use strict';

// item 14A.5 — a LLM/CEO/Agent NUNCA pode alterar seus próprios capital limits, Circuit Breaker
// thresholds, human approval thresholds, global freeze rules ou permission levels. Mudanças
// nessas políticas exigem origem externa/autorizada — nunca a própria LLM propondo a mudança.
const PROTECTED_POLICY_DOMAINS = [
  'CAPITAL_LIMITS', 'CIRCUIT_BREAKER_THRESHOLDS', 'HUMAN_APPROVAL_THRESHOLDS',
  'GLOBAL_FREEZE_RULES', 'PERMISSION_LEVELS',
  'ACTIVE_CAPITAL_PROFILE', // PASSO 14A.1, item 4 — trocar o profile ativo (VALIDATION/CONTROLLED_SCALE/AGGRESSIVE_SCALE/MANUAL_OVERRIDE) é tão protegido quanto os limites em si.
];

const AUTHORIZED_ORIGINS = ['HUMAN_OPERATOR', 'EXTERNAL_CONFIG_FILE_SIGNED', 'ADMIN_CONSOLE'];
const UNAUTHORIZED_ORIGINS = ['LLM_RECOMMENDATION', 'AGENT_SELF_PROPOSAL', 'CEO_ORCHESTRATOR', 'POLICY_ENGINE_ITSELF'];

/**
 * evaluatePolicyChangeRequest() — item 14A.5. Nunca permite que uma mudança em domínio protegido
 * venha de uma origem não-autorizada — mesmo que a origem alegue ser "em nome do usuário" ou
 * "recomendação de alta confiança". Regra fixa, não julgamento livre de LLM (item 14A.2).
 */
function evaluatePolicyChangeRequest({ domain, requestedByOrigin }) {
  if (!PROTECTED_POLICY_DOMAINS.includes(domain)) {
    return { allowed: true, reason: `${domain} não é um domínio protegido (item 14A.5) — segue o fluxo normal de política.` };
  }
  const isAuthorized = AUTHORIZED_ORIGINS.includes(requestedByOrigin);
  return {
    allowed: isAuthorized,
    reason: isAuthorized
      ? `origem ${requestedByOrigin} está na lista de origens autorizadas pra alterar ${domain}.`
      : `BLOQUEADO — domínio protegido (${domain}) nunca pode ser alterado por origem ${requestedByOrigin}. Mudanças aqui exigem origem externa/autorizada explícita (item 14A.5) — a LLM/Agent/Orchestrator nunca se autoaprova.`,
  };
}

module.exports = { evaluatePolicyChangeRequest, PROTECTED_POLICY_DOMAINS, AUTHORIZED_ORIGINS, UNAUTHORIZED_ORIGINS };
