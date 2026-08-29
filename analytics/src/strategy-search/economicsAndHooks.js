'use strict';

const { classifyProfitStatus } = require('../profit/status');
const { safeDiv } = require('../metrics/safeDiv');

// item 46 — economia de front-end, nunca exige ROAS3 do front-end sozinho se um backend/
// lifecycle futuro pudesse justificar economicamente — mas SEM lifecycle comprovado hoje, nunca
// inventa receita de backend (item 46/97).
function buildFrontendEconomics({ financialRoas, targetRoas, lucroPrejuizo }) {
  return {
    front_end_status: classifyProfitStatus(financialRoas, targetRoas),
    front_end_profit: lucroPrejuizo,
    requires_backend_to_justify: financialRoas != null && targetRoas != null ? financialRoas < targetRoas : null,
    backend_revenue_assumed: 0, // NUNCA inventado — sempre 0/ausente até Lifecycle Agent existir (item 46/97)
    note: 'front-end não precisa sozinho de ROAS>=3 SE um backend/lifecycle real justificasse — mas nenhum backend real existe hoje, então esse crédito nunca é aplicado (item 46).',
  };
}

// item 47 — três tipos de ROAS. LIFETIME sempre NOT_AVAILABLE até existir Lifecycle Agent.
function buildRoasTypes({ mainProductRevenue, totalRevenue, spend }) {
  return {
    ACQUISITION_ROAS: safeDiv(mainProductRevenue, spend), // só produto principal — custo real de aquisição do comprador novo
    TRANSACTION_ROAS: safeDiv(totalRevenue, spend), // inclui bump — economia real da transação completa
    LIFETIME_ROAS: 'NOT_AVAILABLE', // item 47 — sem Lifecycle Agent, nunca inventado
  };
}

// item 52 — meta de lucro mensal. NUNCA hardcode R$300k — só usa se configurado explicitamente.
function evaluateProfitTargetCapacity({ monthlyProfitTarget = null } = {}) {
  if (monthlyProfitTarget == null) {
    return { monthly_profit_target: 'NOT_CONFIGURED', capacity_assessment: 'NOT_CONFIGURED', reason: 'nenhuma meta de lucro mensal configurada (item 52) — nunca inventado.' };
  }
  return { monthly_profit_target: monthlyProfitTarget, capacity_assessment: 'NOT_ESTIMABLE', reason: 'meta configurada, mas capacidade real de contribuição por arquitetura ainda não é calculável sem dado de volume/margem validado.' };
}

// item 54 — requisitos de mensagem/copy pra um futuro Copy Intelligence — nunca implementa Copy Agent.
function buildMessageArchitectureRequirements() {
  return { message_requirement: 'NOT_IMPLEMENTED — reservado para Copy Intelligence Agent futuro (item 54).', awareness_stage_hypothesis: null, mechanism_requirement: null, proof_requirement: null, objection_requirement: null };
}

// item 55-56 — hooks de evidência de cliente/mercado, nunca implementados agora.
function buildCustomerEvidenceHook(requiredEvidenceList = []) {
  return { customer_evidence_required: requiredEvidenceList, customer_evidence_available: 'NOT_AVAILABLE — Customer Intelligence Agent não implementado ainda (item 55).' };
}
function buildMarketEvidenceHook(requiredEvidenceList = []) {
  return { market_evidence_required: requiredEvidenceList, market_evidence_available: 'NOT_AVAILABLE — Market Intelligence Agent não implementado ainda (item 56).' };
}

// item 97 — Lifecycle nunca recebe receita atribuída; só um rótulo estrutural PLANNED/REQUIRED/OPTIONAL.
function buildLifecyclePlaceholder(includesLifecycleStage) {
  return { lifecycle_layer: includesLifecycleStage ? 'PLANNED' : 'OPTIONAL', revenue_attributed: 0, note: 'Lifecycle nunca recebe receita atribuída sem o agente real (item 97).' };
}

// item 98 — Media Buying: só hipótese/desconhecido, nunca dado real inventado.
function buildTrafficAssumptions() {
  return { status: 'HYPOTHESIS', assumed_source: 'Meta Ads (canal real hoje)', volume_assumption: 'UNKNOWN', note: 'Media Buying Agent não implementado — suposições de tráfego são hipótese, nunca dado real (item 98).' };
}

module.exports = {
  buildFrontendEconomics, buildRoasTypes, evaluateProfitTargetCapacity,
  buildMessageArchitectureRequirements, buildCustomerEvidenceHook, buildMarketEvidenceHook,
  buildLifecyclePlaceholder, buildTrafficAssumptions,
};
