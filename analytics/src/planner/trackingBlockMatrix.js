'use strict';

/**
 * PASSO 11.1, items 4/7 — tracking issue bloqueia a DECISÃO que depende dele, nunca o produto
 * inteiro. requiredTrackingScopeForAction() é derivado do action_type + source_agent real —
 * nunca hardcoded por candidato individual.
 */
function requiredTrackingScopeForAction(action) {
  // VALIDATE/FIX (custo ~R$0, STATIC_CODE_CHECK/FUNCTIONAL_TEST) nunca dependem de attribution
  // financeira — são checagens de código/UI, não medição de resultado (item 4 exemplo).
  if (action.action_type === 'VALIDATE' || action.action_type === 'FIX') return null;
  if (action.action_type === 'GENERATE_ASSET' || action.action_type === 'IMPLEMENT' || action.action_type === 'WAIT_FOR_DATA' || action.action_type === 'OTHER' || action.action_type === 'HOLD_CAPITAL' || action.action_type === 'MEASURE') return null;

  if (action.action_type === 'RUN_EXPERIMENT') {
    // CREATIVE mede eficiência via compra_meta/receita_meta POR ANÚNCIO (Meta) — exige
    // CREATIVE_ATTRIBUTION. CRO/OFFER/AOV medem via Hotmart/funil (FINANCIAL_TRUTH).
    // MEDIA_BUYING mede eficiência por campanha — exige CAMPAIGN_ATTRIBUTION.
    if (action.source_agent === 'CREATIVE') return 'CREATIVE_ATTRIBUTION';
    if (action.source_agent === 'MEDIA_BUYING') return 'CAMPAIGN_ATTRIBUTION';
    return 'FINANCIAL_TRUTH';
  }

  // SCALE_CAPITAL/REDUCE_CAPITAL/SWITCH_PRODUCT são decisões de capital agregado — exigem
  // financial truth íntegra, sempre (item 7 exemplo: "SCALE_CAPITAL exige financial truth").
  if (['SCALE_CAPITAL', 'REDUCE_CAPITAL', 'SWITCH_PRODUCT'].includes(action.action_type)) return 'FINANCIAL_TRUTH';

  return null;
}

/**
 * evaluateActionTrackingEligibility() — BLOCKED no escopo exigido é o único estado que desabilita
 * a ação (DEGRADED/RELIABLE/UNKNOWN nunca bloqueiam sozinhos — DEGRADED só reduz confiança,
 * conforme trackingAssessment.js já estabelecido no PASSO 7).
 */
function evaluateActionTrackingEligibility(action, trackingScopes) {
  const requiredScope = requiredTrackingScopeForAction(action);
  if (requiredScope == null) {
    return { required_tracking_scope: null, tracking_status: null, eligible: true, reason: 'esta ação não depende de nenhum escopo de tracking financeiro/attribution.' };
  }
  const scope = trackingScopes[requiredScope];
  const eligible = scope.status !== 'BLOCKED';
  return {
    required_tracking_scope: requiredScope,
    tracking_status: scope.status,
    eligible,
    reason: eligible
      ? `${requiredScope}=${scope.status} — não bloqueia (só BLOCKED bloqueia; DEGRADED só reduz confiança).`
      : `${requiredScope}=BLOCKED — ${scope.reason}`,
  };
}

module.exports = { requiredTrackingScopeForAction, evaluateActionTrackingEligibility };
