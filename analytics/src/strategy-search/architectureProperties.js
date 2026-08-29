'use strict';

// item 41 — distância estrutural: proporção de estágios NOVOS (não presentes na arquitetura
// atual) sobre o total. Documentado, nunca escolhido caso a caso.
function computeArchitectureDistance(candidateStageTypes, currentStageTypes) {
  const newStages = candidateStageTypes.filter((t) => !currentStageTypes.includes(t));
  const ratio = candidateStageTypes.length > 0 ? newStages.length / candidateStageTypes.length : 0;
  let distance;
  if (ratio === 0) distance = 'LOW';
  else if (ratio <= 0.34) distance = 'MEDIUM';
  else if (ratio <= 0.67) distance = 'HIGH';
  else distance = 'RADICAL';
  return { distance, new_stage_ratio: Math.round(ratio * 10000) / 10000, new_stages: newStages, reason: `${newStages.length} de ${candidateStageTypes.length} estágios são novos em relação à arquitetura atual (${(ratio * 100).toFixed(0)}%).` };
}

// item 42 — reversibilidade, mapeada diretamente da distância (documentado, não um julgamento à parte).
const REVERSIBILITY_BY_DISTANCE = { LOW: 'REVERSIBLE', MEDIUM: 'REVERSIBLE', HIGH: 'PARTIALLY_REVERSIBLE', RADICAL: 'HARD_TO_REVERSE' };
function computeReversibility(distance) {
  return { reversibility: REVERSIBILITY_BY_DISTANCE[distance] || 'PARTIALLY_REVERSIBLE', reason: `derivado da distância estrutural (${distance}) — mapeamento documentado, nunca escolhido por arquitetura individual.` };
}

// item 75-79 — contrato de medição. Nunca afirma que IDs/eventos já existem hoje — são requisitos
// futuros (item 79: nunca inventar IDs atuais).
const STAGE_EVENT_MAP = {
  AD: 'ad_impression/ad_click', CONTENT: 'content_view', ADVERTORIAL: 'advertorial_view', VSL: 'video_watch_progress',
  QUIZ: 'quiz_start/quiz_complete', LEAD_CAPTURE: 'lead_captured', SALES_PAGE: 'page_view/scroll_depth',
  PRODUCT_PAGE: 'page_view', CHECKOUT: 'checkout_initiated/purchase', ORDER_BUMP: 'bump_offered/bump_accepted',
  BUNDLE: 'bundle_offered/bundle_accepted', UPSELL: 'upsell_offered/upsell_accepted', DOWNSELL: 'downsell_offered/downsell_accepted',
  WHATSAPP: 'whatsapp_message_sent/whatsapp_reply', EMAIL: 'email_sent/email_open/email_click', WEBINAR: 'webinar_join/webinar_watch_time',
  APPLICATION: 'application_submitted', COMMUNITY: 'community_joined', THANK_YOU: 'thank_you_view', ACCESS: 'access_granted',
  RETARGETING: 'retargeting_impression', OTHER: 'custom_event',
};
// item 77 — só superfícies tecnicamente controláveis/observáveis (páginas próprias) — NUNCA
// checkout externo (Hotmart), que não controlamos.
const CLARITY_CONTROLLABLE_STAGE_TYPES = ['CONTENT', 'ADVERTORIAL', 'VSL', 'QUIZ', 'LEAD_CAPTURE', 'SALES_PAGE', 'PRODUCT_PAGE', 'UPSELL', 'DOWNSELL', 'THANK_YOU', 'ACCESS'];

function buildTrackingContractRequirements(stageTypes) {
  return {
    stages: stageTypes,
    events: [...new Set(stageTypes.map((t) => STAGE_EVENT_MAP[t] || 'custom_event'))],
    identifiers: ['session_id', 'click_id', 'transaction_id', 'customer_id'], // item 79 — requisito futuro, nunca IDs reais afirmados hoje
    revenue_events: stageTypes.filter((t) => ['CHECKOUT', 'ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL'].includes(t)),
    attribution_requirements: ['UTM_CONTINUITY'], // item 78
    behavioral_measurement_surfaces: stageTypes.filter((t) => CLARITY_CONTROLLABLE_STAGE_TYPES.includes(t)),
    note: 'requisitos futuros de instrumentação — não afirma que já existem hoje (item 75/79).',
  };
}

function buildClaritySurfacesRequired(stageTypes) {
  return stageTypes.filter((t) => CLARITY_CONTROLLABLE_STAGE_TYPES.includes(t));
}

/**
 * evaluateTrackingReadiness() — item 76. Uma arquitetura pode ser estrategicamente boa e ainda
 * NOT_READY pra receber capital, se os estágios novos não têm instrumentação real hoje. Só os
 * estágios já presentes na arquitetura atual (AD/SALES_PAGE/CHECKOUT/ORDER_BUMP) têm tracking
 * real confirmado (GTM/Clarity/Hotmart, ver project memory) — qualquer estágio novo é sem
 * instrumentação até prova em contrário.
 */
const STAGE_TYPES_WITH_REAL_TRACKING_TODAY = ['AD', 'SALES_PAGE', 'CHECKOUT', 'ORDER_BUMP'];
function evaluateTrackingReadiness(stageTypes) {
  if (!stageTypes || stageTypes.length === 0) return { readiness: 'UNKNOWN', reason: 'nenhum estágio informado — prontidão de tracking não avaliável.', missing: [] };
  const withTracking = stageTypes.filter((t) => STAGE_TYPES_WITH_REAL_TRACKING_TODAY.includes(t));
  const withoutTracking = stageTypes.filter((t) => !STAGE_TYPES_WITH_REAL_TRACKING_TODAY.includes(t));
  if (withoutTracking.length === 0) return { readiness: 'READY', reason: 'todos os estágios já têm instrumentação real confirmada hoje.', missing: [] };
  if (withTracking.length === 0) return { readiness: 'NOT_READY', reason: 'nenhum estágio desta arquitetura tem instrumentação real hoje.', missing: withoutTracking };
  return { readiness: 'PARTIAL', reason: `${withoutTracking.length} de ${stageTypes.length} estágio(s) sem instrumentação real confirmada hoje.`, missing: withoutTracking };
}

// item 49-50 — fitness de automação: estágios com dependência humana real reduzem o fitness.
const HUMAN_DEPENDENT_STAGE_TYPES = ['WHATSAPP', 'APPLICATION', 'COMMUNITY'];
function computeAutomationFitness(stageTypes) {
  const humanStages = stageTypes.filter((t) => HUMAN_DEPENDENT_STAGE_TYPES.includes(t));
  if (humanStages.length === 0) return { fitness: 'HIGH', reason: 'nenhum estágio com dependência humana direta identificada.', human_dependency: [] };
  return { fitness: 'LOW', reason: `inclui estágio(s) com dependência humana real: ${humanStages.join(', ')} — reduz automation_fitness (item 49), mesmo que a economia seja favorável (item 49: lucro vence elegância, mas o custo operacional é real).`, human_dependency: humanStages };
}

// item 51 — scale fitness NUNCA HIGH sem evidência real de volume/estabilidade — sempre UNKNOWN
// hoje (nenhuma arquitetura, atual ou candidata, tem esse tipo de evidência ainda).
function computeScaleFitness() {
  return { fitness: 'UNKNOWN', reason: 'sem experimento real validando volume/estabilidade em escala ainda — nunca HIGH sem evidência (item 51).' };
}

// item 53 — restrições de capacidade, hoje UNKNOWN (nenhum dado real sobre teto de tráfego/
// conversão/operação/fulfillment/caixa foi coletado ainda).
function buildCapacityConstraints() {
  return { traffic_ceiling: 'UNKNOWN', conversion_ceiling: 'UNKNOWN', operational_ceiling: 'UNKNOWN', fulfillment_ceiling: 'UNKNOWN', cashflow_ceiling: 'UNKNOWN' };
}

module.exports = {
  computeArchitectureDistance, computeReversibility, buildTrackingContractRequirements,
  buildClaritySurfacesRequired, evaluateTrackingReadiness, computeAutomationFitness,
  computeScaleFitness, buildCapacityConstraints, STAGE_EVENT_MAP, CLARITY_CONTROLLABLE_STAGE_TYPES,
};
