'use strict';

const { recommendNoAction } = require('./noActionPolicy');
const { recommendInitialAuthorityPosture } = require('./authorityPosture');
const { classifyCurrentStage } = require('./scaleLadder');

// PASSO 14B, item 16 — "se o operador disponibilizasse capital adicional hoje, qual seria a
// postura da máquina?" NUNCA assume um valor de capital disponibilizado — responde em termos de
// postura/classe de ação, não de um número de orçamento específico.
function simulateCapitalPosture({ measurementSignals, strategyResultConsumed, financialsSnapshot }) {
  const financialTruthStatus = measurementSignals.financial_truth_health.status;
  const measurementReadiness = measurementSignals.capital_gate ? measurementSignals.capital_gate.state : 'UNKNOWN';
  const financialRoas = financialsSnapshot?.roas_financeiro ?? null;

  const noAction = recommendNoAction({
    financialTruthHealthStatus: financialTruthStatus,
    measurementReadiness,
    hypothesisSpaceStatus: 'UNKNOWN', // não recomputado aqui — viria do Planner real se necessário
    financialRoas,
    targetRoas: 3.0,
    hasViableCandidate: strategyResultConsumed?.winner_architecture_id != null,
    capitalAvailable: null, // item 16 — nunca assumido; a pergunta em si é hipotética
  });

  const authorityPosture = recommendInitialAuthorityPosture({
    financialRoasStatus: financialRoas == null ? 'UNKNOWN' : (financialRoas < 1 ? 'BELOW_BREAK_EVEN' : (financialRoas < 3 ? 'BREAK_EVEN' : 'ABOVE_BREAK_EVEN')),
    financialTruthHealthStatus: financialTruthStatus,
    platformAttributionHealthStatus: measurementSignals.platform_attribution_health.status,
    reconciliationHealthStatus: measurementSignals.reconciliation_health.status,
    completedExperiments: 0,
    strategyWinnerConfidence: strategyResultConsumed?.confidence ?? 'UNKNOWN',
    currentMeasurementBlocker: measurementSignals.current_blocker,
    capitalPolicyConfigured: false,
    safeModeActive: true,
  });

  const stage = classifyCurrentStage({
    financialRoas, sampleSufficient: false, marginalRoasKnown: false,
    hasCompletedValidation: false, hasSignalConfirmed: false,
  });

  return {
    capital_posture: noAction.recommendation || 'EVALUATE_NORMALLY',
    capital_posture_reason: noAction.reason,
    recommended_action_class: strategyResultConsumed?.winner_architecture_id ? 'START_EXPERIMENT (MVA test do vencedor real do Strategy Search)' : 'NENHUMA — sem vencedor real proposto.',
    autonomous_authority: authorityPosture.recommended_tier,
    human_approval_requirement: authorityPosture.recommended_tier === 'TIER_0_ANALYZE_ONLY' ? 'SEMPRE — TIER_0 nunca executa nada autonomamente.' : 'depende do tier/matriz de aprovação.',
    measurement_dependency: measurementSignals.current_blocker,
    recommended_scale_posture: stage.stage,
    reason: `mesmo que capital adicional fosse disponibilizado hoje, a postura recomendada seria "${noAction.recommendation || 'avaliar normalmente'}" — ${noAction.reason} Tier de autoridade recomendado: ${authorityPosture.recommended_tier}.`,
    confidence: authorityPosture.confidence,
  };
}

module.exports = { simulateCapitalPosture };
