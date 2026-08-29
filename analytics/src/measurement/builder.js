'use strict';

const { resolveProductId } = require('../../config/product');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');
const { analyzeStrategy } = require('../strategy-search/builder');
const { loadAssets: loadCreativeAssets } = require('../creative/registry');

const { buildSourceOfTruthMatrix } = require('./sourceOfTruth');
const { buildIdentifierSpine } = require('./identifierSpine');
const { buildAttributionLayerAssessment } = require('./attributionLayers');
const { buildTrackingContract, resetContractCounter } = require('./trackingContract');
const { buildFunnelMeasurementAudit } = require('./funnelAudit');
const { evaluateMeasurementCapitalGate } = require('./capitalGate');
const { evaluateBlockerDependencyGraph } = require('./blockerDependencyGraph');
const { buildAnomalyFindings } = require('./anomalyDetection');
const { buildMinimumViableAttribution } = require('./minimumViableAttribution');
const { buildExecutionSafetySignal } = require('./executionSafetySignal');
const { buildRevenueAttribution, buildProfitAttribution } = require('./revenueProfitAttribution');
const { buildCreativeCampaignAttributionGaps } = require('./creativeCampaignAttribution');
const { buildExperimentAttributionInterface } = require('./experimentMeasurement');
const { buildDataQualityDimensions } = require('./dataQualityDimensions');
const { buildMeasurementDebtRegistry } = require('./measurementDebt');
const { buildStrategyHandoffMeasurement } = require('./strategyHandoff');
const { formMeasurementRecommendation } = require('./recommendationEngine');
const { OWNERSHIP_BOUNDARIES } = require('./boundaries');
const { CORE_INVARIANTS } = require('./enums');

const MEASUREMENT_VERSION = 'MEASUREMENT-V1';

/**
 * analyzeMeasurement() — PASSO 13. Orquestrador only-leitura: audita o repo/dados persistidos
 * reais (nunca internet, item 53), nunca implementa tracking (item 54), nunca decide estratégia
 * (só se é responsável medir/gastar capital nela). Reusa analyzeStrategy() (Strategy Search) e
 * aggregatePeriod (Profit) só por leitura — nunca duplica os agents.
 */
function analyzeMeasurement({ productId, dataDir, referenceDate, strategyPlannerArgs = {} } = {}) {
  resetContractCounter();
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();
  const dates = standardWindows(refDate).last_30d.dates;

  // item 8-9 — matriz central. Todo o resto do módulo reusa agg/tracking/platform/reconciliation
  // computados aqui, nunca recalculados com lógica divergente em outro lugar.
  const sourceOfTruth = buildSourceOfTruthMatrix({ dates, dataDir });
  const { agg, tracking, platform, reconciliation, financialTruthHealth } = sourceOfTruth;
  const financialTruthBlocking = financialTruthHealth.status === 'BLOCKED'; // item 9-10 — só BLOCKING_CODES, nunca ruído de PLATFORM_ATTRIBUTION

  const identifierSpine = buildIdentifierSpine(platform);
  const attributionLayers = buildAttributionLayerAssessment(sourceOfTruth.domains);

  // arquitetura atual real (mesma reconstrução do Strategy Search — nunca duplicada, lida do
  // próprio resultado real do analyzeStrategy() abaixo).
  const strategyResult = analyzeStrategy({ productId: resolvedProductId, dataDir, referenceDate: refDate, plannerArgs: strategyPlannerArgs });
  const currentStageTypes = strategyResult.analysis.current_architecture.stages.filter((s) => s.status === 'ACTIVE').map((s) => s.type);

  const currentArchitectureId = strategyResult.analysis.current_architecture.architecture_id;
  const currentContract = buildTrackingContract({
    subjectType: 'CURRENT_ARCHITECTURE', subjectId: currentArchitectureId,
    architectureId: currentArchitectureId, stageTypes: currentStageTypes,
    platform, financialTruthBlocking, productId: resolvedProductId, primaryOrGuardrailEvents: [], // arquitetura atual não é um MVA test — sem métrica de teste específica associada
  });
  const currentFunnelAudit = buildFunnelMeasurementAudit(currentStageTypes, platform);

  // item 6 — mesmo blocker dependency graph aplicado à arquitetura atual: informativo apenas
  // (capital já está sendo gasto hoje de qualquer forma), mas caracteriza a mesma confiança
  // estrutural que qualquer teste novo enfrentaria.
  const currentCheckoutInitiated = currentContract.required_events.find((e) => e.event === 'CHECKOUT_INITIATED');
  const currentBlockerGraph = evaluateBlockerDependencyGraph({
    evidence: { FINANCIAL_OUTCOME_LINKAGE: true, EXPOSURE_IDENTITY: false, CHECKOUT_INITIATED_EVENT: currentCheckoutInitiated ? ['OBSERVED', 'VALIDATED'].includes(currentCheckoutInitiated.status) : false },
  });
  const currentAnomalyFindings = buildAnomalyFindings({ reconciliation, decisionDependsOnScopes: ['EXPERIMENT_ATTRIBUTION', 'FINANCIAL_TRUTH'] });
  const currentCapitalGate = evaluateMeasurementCapitalGate({
    contract: currentContract, financialTruthBlocking, reconciliationMatchRate: reconciliation.match_rate,
    blockerGraph: currentBlockerGraph, anomalyFindings: currentAnomalyFindings.findings,
  });
  const currentExecutionSafetySignal = buildExecutionSafetySignal({ subjectId: currentArchitectureId, financialTruthHealth, capitalGate: currentCapitalGate });
  const currentMinimumViableAttribution = buildMinimumViableAttribution({ hasArchitectureVersionTimeline: false });

  // item 26-27 — handoff dinâmico do vencedor REAL do Strategy Search (nunca hardcoded).
  const strategyHandoff = buildStrategyHandoffMeasurement({
    strategyResult, platform, financialTruthBlocking, financialTruthHealth, reconciliationMatchRate: reconciliation.match_rate, reconciliation, productId: resolvedProductId,
  });

  const revenueAttribution = buildRevenueAttribution({ grossRevenue: agg.sum.gross_revenue, spend: agg.sum.spend });
  const profitAttribution = buildProfitAttribution({ spend: agg.sum.spend, grossRevenue: agg.sum.gross_revenue, netRevenue: agg.sum.net_revenue, refundsGross: agg.sum.refunds_gross, hotmartFeeTotal: agg.sum.hotmart_fee_total });

  const creativeAssets = loadCreativeAssets(strategyPlannerArgs.creativeDir);
  const creativeCampaignGaps = buildCreativeCampaignAttributionGaps({ creativeAssetsCount: creativeAssets.length, groundTruthDomains: sourceOfTruth.domains });

  const experimentAttributionInterface = buildExperimentAttributionInterface({ hasRunningExperiment: false });

  const dataQualityDimensions = buildDataQualityDimensions({
    dataCompleteness: agg.data_completeness, matchRate: reconciliation.match_rate,
    trackingConfidenceScore: tracking.confidence_score, ghostPurchaseDaysCount: reconciliation.ghost_purchase_days.length,
    daysEvaluated: reconciliation.days_evaluated,
  });

  const measurementDebt = buildMeasurementDebtRegistry({ sourceOfTruth, platform, reconciliation });
  const recommendation = formMeasurementRecommendation({
    debtRegistry: measurementDebt, capitalGateForWinner: strategyHandoff.found ? strategyHandoff.capital_gate : null,
    winnerArchitectureId: strategyHandoff.found ? strategyHandoff.winner_architecture_id : null,
    blockerGraphForWinner: strategyHandoff.found ? strategyHandoff.blocker_dependency_graph : null,
  });

  const analysisId = `MEASUREMENT-${resolvedProductId}-${refDate}`;

  const analysis = {
    analysis_id: analysisId,
    product_id: resolvedProductId,
    version: MEASUREMENT_VERSION,
    created_at: new Date().toISOString(),
    core_invariants: CORE_INVARIANTS,
    source_of_truth_matrix: sourceOfTruth.domains,
    identifier_spine: identifierSpine,
    attribution_layers: attributionLayers,
    current_architecture_id: strategyResult.analysis.current_architecture.architecture_id,
    current_tracking_contract: currentContract,
    current_funnel_measurement_audit: currentFunnelAudit,
    current_blocker_dependency_graph: currentBlockerGraph,
    current_anomaly_findings: currentAnomalyFindings.findings,
    current_measurement_capital_gate: currentCapitalGate, // informativo — capital já está sendo gasto hoje de qualquer forma; isto caracteriza a CONFIANÇA por trás dos números, nunca uma recomendação de pausar operação
    current_execution_safety_signal: currentExecutionSafetySignal,
    current_minimum_viable_attribution: currentMinimumViableAttribution,
    strategy_handoff: strategyHandoff,
    revenue_attribution: revenueAttribution,
    profit_attribution: profitAttribution,
    creative_campaign_attribution_gaps: creativeCampaignGaps,
    experiment_attribution_interface: experimentAttributionInterface,
    data_quality_dimensions: dataQualityDimensions,
    reconciliation,
    measurement_debt: measurementDebt,
    recommendation,
    platform_audit: platform,
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
    real_audit_note: 'nenhuma pesquisa externa realizada (item 53) — todo o audit acima vem de leitura direta do repo (HTML/JS servidos hoje, coletores, normalizadores) e de dados diários persistidos reais (analytics/data/daily/*.json). Nenhum tracking foi implementado/alterado (item 54). Nenhuma ação real de campanha/produto/preço/deploy foi executada.',
  };

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    analysis,
    strategy_result_consumed: { winner_architecture_id: strategyResult.analysis.recommendation.recommended_architecture_id, generated_at: strategyResult.generated_at },
  };
}

module.exports = { analyzeMeasurement, MEASUREMENT_VERSION };
