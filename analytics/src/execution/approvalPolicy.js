'use strict';

const { isProfileConfigured } = require('./capitalSafety');

// PASSO 14A.1, item 1-2 — correção de segurança central: POLICY_DEFER != HUMAN_APPROVAL_NOT_
// REQUIRED, e SAFE_MODE != SUBSTITUTE_FOR_APPROVAL_POLICY. SAFE_MODE é uma barreira TÉCNICA
// temporária (bloqueia a chamada externa em si); esta é a regra de AUTORIDADE — decide se um
// humano precisaria aprovar a ação mesmo quando/se SAFE_MODE algum dia for desligado. As duas
// nunca se substituem.
const AUTHORITY_TIERS = ['POTENTIALLY_AUTONOMOUS', 'POLICY_DEPENDENT', 'HUMAN_APPROVAL_REQUIRED', 'HUMAN_APPROVAL_OR_DENY'];

/**
 * evaluateApprovalPolicy() — item 2. Semântica de autoridade padrão, determinística, nunca
 * reduzível pela LLM:
 *   - capital UNKNOWN -> NUNCA autorização autônoma, qualquer que seja o risk_level.
 *   - CRITICAL -> sempre HUMAN_APPROVAL_OR_DENY (autoridade nunca autônoma).
 *   - HIGH -> sempre HUMAN_APPROVAL_REQUIRED por padrão (só uma política EXTERNA real e
 *     explícita poderia mudar isso — nenhuma existe hoje).
 *   - MEDIUM -> policy_dependent; sem perfil de capital real configurado, o default seguro
 *     continua exigindo aprovação (nunca autônomo por omissão).
 *   - LOW + capital conhecido + reversível -> POTENCIALMENTE autônomo, mas só se um perfil de
 *     capital safety real estiver configurado; sem isso, aprovação humana permanece exigida.
 */
function evaluateApprovalPolicy({ riskLevel, capitalAtRisk, reversibility, capitalSafetyProfile }) {
  const capitalKnown = capitalAtRisk != null;
  const profileConfigured = capitalSafetyProfile ? isProfileConfigured(capitalSafetyProfile) : false;

  if (!capitalKnown) {
    return {
      human_approval_required: true,
      authority_tier: 'HUMAN_APPROVAL_REQUIRED',
      reason: 'capital_at_risk é UNKNOWN — capital desconhecido nunca resulta em autorização autônoma, independente do risk_level (item 2).',
    };
  }
  if (riskLevel === 'CRITICAL') {
    return { human_approval_required: true, authority_tier: 'HUMAN_APPROVAL_OR_DENY', reason: 'risk_level=CRITICAL sempre exige aprovação humana ou DENY conforme política — nunca autônomo.' };
  }
  if (riskLevel === 'HIGH') {
    return { human_approval_required: true, authority_tier: 'HUMAN_APPROVAL_REQUIRED', reason: 'risk_level=HIGH exige aprovação humana por padrão, salvo política externa explícita e mais definida dizendo o contrário — nenhuma política dessas existe hoje.' };
  }
  if (riskLevel === 'MEDIUM') {
    if (!profileConfigured) {
      return { human_approval_required: true, authority_tier: 'POLICY_DEPENDENT', reason: 'risk_level=MEDIUM é policy_dependent; sem perfil de capital safety real configurado, o default seguro exige aprovação humana (nunca autônomo por omissão).' };
    }
    return { human_approval_required: true, authority_tier: 'POLICY_DEPENDENT', reason: 'risk_level=MEDIUM é policy_dependent; um perfil real está configurado, mas a decisão final de autonomia depende de thresholds específicos não avaliados aqui (item 15 — configuração econômica real fica pra depois desta calibração).' };
  }
  // LOW
  if (!profileConfigured) {
    return { human_approval_required: true, authority_tier: 'POTENTIALLY_AUTONOMOUS', reason: 'risk_level=LOW com capital conhecido seria POTENCIALMENTE autônomo se reversível e com um perfil de capital safety real configurado — hoje NOT_CONFIGURED, então aprovação humana permanece exigida por segurança (SAFE_MODE não substitui esta política, item 2).' };
  }
  if (reversibility !== 'REVERSIBLE') {
    return { human_approval_required: true, authority_tier: 'POTENTIALLY_AUTONOMOUS', reason: `risk_level=LOW mas reversibility=${reversibility} — não totalmente reversível, aprovação humana permanece exigida mesmo com perfil configurado.` };
  }
  return { human_approval_required: false, authority_tier: 'POTENTIALLY_AUTONOMOUS', reason: 'risk_level=LOW, capital conhecido, reversível, e perfil de capital safety real configurado — autoridade autônoma potencialmente aplicável (sujeita aos thresholds do perfil, avaliados fora desta função).' };
}

module.exports = { evaluateApprovalPolicy, AUTHORITY_TIERS };
