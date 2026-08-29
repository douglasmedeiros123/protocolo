'use strict';

const { evaluateApprovalPolicy } = require('./approvalPolicy');
const { classifyBlastRadius } = require('./blastRadius');

// PASSO 14B, item 13 — matriz de aprovação combinando risk/capital/blast_radius/reversibility/
// confidence/measurement_health/action_type/authority_tier. Dinâmica (derivada das regras já
// existentes + regras semânticas por action_type), nunca uma tabela de exemplos fixos — os
// exemplos conceituais do pedido (creative test pequeno, aumento grande de orçamento, mudança de
// preço, pausa global, mudança destrutiva de tracking) emergem das mesmas regras, não são
// hardcoded caso a caso.
const ACTION_TYPES_REQUIRING_APPROVAL_REGARDLESS = ['UPDATE_PRODUCT_PRICE', 'UPDATE_OFFER']; // afetam confiança/marca além de reversibilidade técnica pura
const ACTION_TYPES_REQUIRING_SPECIAL_AUTHORITY = ['UPDATE_TRACKING_CONFIG']; // risco circular: pode quebrar a própria capacidade de medir se dado errado

function evaluateHumanApprovalMatrix({ action, riskLevel, measurementReadiness, capitalSafetyProfile, hasSpecialAuthority = false }) {
  const blastRadiusResult = classifyBlastRadius(action.subject_type);
  const approval = evaluateApprovalPolicy({
    riskLevel, capitalAtRisk: action.capital_at_risk, reversibility: action.reversibility, capitalSafetyProfile,
  });

  if (ACTION_TYPES_REQUIRING_SPECIAL_AUTHORITY.includes(action.action_type) && !hasSpecialAuthority) {
    return { decision: 'DENY', authority_tier: approval.authority_tier, reason: `action_type=${action.action_type} pode comprometer a própria capacidade de medir (risco circular) — DENY por padrão, salvo autoridade especial explícita (nenhuma configurada hoje).`, blast_radius: blastRadiusResult.blast_radius };
  }
  if (ACTION_TYPES_REQUIRING_APPROVAL_REGARDLESS.includes(action.action_type)) {
    return { decision: 'REQUIRE_HUMAN_APPROVAL', authority_tier: approval.authority_tier, reason: `action_type=${action.action_type} afeta confiança/percepção de marca além de qualquer cálculo de reversibilidade técnica — sempre exige aprovação humana.`, blast_radius: blastRadiusResult.blast_radius };
  }
  if (blastRadiusResult.approval_requirement === 'HUMAN_APPROVAL_REQUIRED') {
    return { decision: 'REQUIRE_HUMAN_APPROVAL', authority_tier: approval.authority_tier, reason: `blast_radius=${blastRadiusResult.blast_radius} exige aprovação humana (ex.: mudança que afeta toda a conta/globalmente — mesmo princípio de uma "pausa de campanha global").`, blast_radius: blastRadiusResult.blast_radius };
  }
  if (measurementReadiness === 'BLOCKED_BY_MEASUREMENT') {
    return { decision: 'DENY', authority_tier: approval.authority_tier, reason: 'measurement_readiness=BLOCKED_BY_MEASUREMENT — nenhuma autoridade libera execução enquanto isso persistir.', blast_radius: blastRadiusResult.blast_radius };
  }
  if (approval.human_approval_required) {
    return { decision: 'REQUIRE_HUMAN_APPROVAL', authority_tier: approval.authority_tier, reason: approval.reason, blast_radius: blastRadiusResult.blast_radius };
  }
  return { decision: 'POTENTIALLY_AUTONOMOUS', authority_tier: approval.authority_tier, reason: approval.reason, blast_radius: blastRadiusResult.blast_radius };
}

module.exports = { evaluateHumanApprovalMatrix, ACTION_TYPES_REQUIRING_APPROVAL_REGARDLESS, ACTION_TYPES_REQUIRING_SPECIAL_AUTHORITY };
