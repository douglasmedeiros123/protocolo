'use strict';

const { buildTrackingContract, mapMetricsToEvents } = require('./trackingContract');
const { evaluateMeasurementCapitalGate } = require('./capitalGate');
const { buildFunnelMeasurementAudit } = require('./funnelAudit');
const { buildExperimentMeasurementContract } = require('./experimentMeasurement');
const { evaluateBlockerDependencyGraph } = require('./blockerDependencyGraph');
const { buildAnomalyFindings } = require('./anomalyDetection');
const { buildMinimumViableAttribution } = require('./minimumViableAttribution');
const { buildExecutionSafetySignal } = require('./executionSafetySignal');

/**
 * buildStrategyHandoffMeasurement() — item 26-27 (PASSO 13). Consome o resultado REAL do
 * Strategy Search (analyzeStrategy(), leitura apenas) e gera o Tracking Contract + Capital Gate
 * do vencedor REAL — nunca hardcoda ADVERTORIAL nem qualquer outra família. PASSO 13.1: o capital
 * gate agora é decidido pelo blocker dependency graph real (item 6) + anomaly findings
 * contextualizados (item 8) + minimum viable attribution (item 5) — nunca por um único evento
 * discreto isolado (item 4).
 */
function buildStrategyHandoffMeasurement({ strategyResult, platform, financialTruthBlocking, financialTruthHealth, reconciliationMatchRate, reconciliation, productId }) {
  const analysis = strategyResult.analysis;
  const winnerId = analysis.recommendation.recommended_architecture_id;
  const currentIsWinner = winnerId === analysis.current_architecture.architecture_id;
  const winner = currentIsWinner
    ? { architecture_id: analysis.current_architecture.architecture_id, family: analysis.current_architecture.family, stage_types: analysis.current_architecture.stages.filter((s) => s.status === 'ACTIVE').map((s) => s.type), is_current: true, mva_test: null }
    : analysis.challengers.find((c) => c.architecture_id === winnerId);

  if (!winner) {
    return { found: false, reason: `winner_id ${winnerId} não encontrado nem em current_architecture nem em challengers — estado inconsistente do Strategy Search, nunca inventado aqui.` };
  }

  // item 3 — quais eventos ESTE teste específico precisa pra avaliar o efeito primário
  // (interpretability), derivado do mva_test real do vencedor, nunca hardcoded por família.
  const primaryOrGuardrailEvents = winner.mva_test ? mapMetricsToEvents([winner.mva_test.primary_metric, ...(winner.mva_test.secondary_metrics || [])]) : [];

  const contract = buildTrackingContract({
    subjectType: currentIsWinner ? 'CURRENT_ARCHITECTURE' : 'CANDIDATE_ARCHITECTURE',
    subjectId: winner.architecture_id, architectureId: winner.architecture_id,
    stageTypes: winner.stage_types, platform, financialTruthBlocking, productId, primaryOrGuardrailEvents,
  });

  // item 6 — blocker dependency graph real. FINANCIAL_OUTCOME_LINKAGE já existe hoje (Hotmart
  // linka toda transação por order_date_utc, sem trabalho novo). EXPOSURE_IDENTITY NÃO existe
  // (nenhum registro real de qual arquitetura esteve live em qual data foi encontrado no repo) —
  // é o blocker de verdade, nunca escondido atrás de CHECKOUT_INITIATED (item 4).
  const checkoutInitiatedEntry = contract.required_events.find((e) => e.event === 'CHECKOUT_INITIATED');
  const blockerGraph = evaluateBlockerDependencyGraph({
    evidence: {
      FINANCIAL_OUTCOME_LINKAGE: true,
      EXPOSURE_IDENTITY: false,
      CHECKOUT_INITIATED_EVENT: checkoutInitiatedEntry ? ['OBSERVED', 'VALIDATED'].includes(checkoutInitiatedEntry.status) : false,
    },
  });

  // item 7-8 — anomaly findings contextualizados à dependência real desta decisão (elegibilidade
  // de teste/experimento neste subject).
  const anomalyResult = reconciliation ? buildAnomalyFindings({ reconciliation, decisionDependsOnScopes: ['EXPERIMENT_ATTRIBUTION', 'FINANCIAL_TRUTH'] }) : { findings: [] };

  const capitalGate = evaluateMeasurementCapitalGate({
    contract, financialTruthBlocking, reconciliationMatchRate, blockerGraph, anomalyFindings: anomalyResult.findings,
  });
  const executionSafetySignal = buildExecutionSafetySignal({ subjectId: winner.architecture_id, financialTruthHealth, capitalGate });
  const funnelAudit = buildFunnelMeasurementAudit(winner.stage_types, platform);

  // item 5 — o que realmente permitiria testar esta mudança de forma economicamente
  // interpretável, sem exigir tracking perfeito.
  const minimumViableAttribution = buildMinimumViableAttribution({ hasArchitectureVersionTimeline: false });

  const mvaTrackingDesign = winner.mva_test ? {
    test_id: winner.mva_test.test_id,
    new_stages_requiring_instrumentation: winner.mva_test.changed_components,
    preserved_stages_already_tracked: winner.mva_test.preserved_components,
    primary_or_guardrail_events: primaryOrGuardrailEvents,
    events_still_required_for_interpretability: contract.capital_blocking_requirements.filter((e) => e.status === 'REQUIRED').map((e) => e.event),
    events_diagnostic_only_missing: contract.non_blocking_requirements.filter((e) => e.status === 'REQUIRED' && e.requirement_class === 'DIAGNOSTIC_REQUIREMENT').map((e) => e.event),
    experiment_measurement_contract: buildExperimentMeasurementContract({ mvaTest: winner.mva_test, trackingContract: contract }),
  } : null;

  return {
    found: true,
    winner_architecture_id: winnerId,
    winner_family: winner.family,
    winner_is_current: currentIsWinner,
    consumed_dynamically: true,
    tracking_contract: contract,
    blocker_dependency_graph: blockerGraph,
    anomaly_findings: anomalyResult.findings,
    capital_gate: capitalGate,
    execution_safety_signal: executionSafetySignal,
    minimum_viable_attribution: minimumViableAttribution,
    funnel_measurement_audit: funnelAudit,
    mva_tracking_design: mvaTrackingDesign,
    strategy_search_current_blocker: winner.current_blocker !== undefined ? winner.current_blocker : null,
    strategy_search_remaining_blockers: winner.remaining_blockers || [],
    note: 'tracking_readiness do Strategy Search (READY/PARTIAL/NOT_READY) é uma simplificação binária pra elegibilidade de teste; capital_gate aqui é decidido pelo blocker dependency graph real (item 6, PASSO 13.1) — nunca por um único evento discreto isolado, mesmo quando REQUIRED (item 1/4).',
  };
}

module.exports = { buildStrategyHandoffMeasurement };
