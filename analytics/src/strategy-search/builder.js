'use strict';

const { resolveProductId } = require('../../config/product');
const { standardWindows } = require('../profit/windows');
const { todayBRT } = require('../utils/dates');
const { analyzePlan } = require('../planner/builder');
const { loadAssets: loadCreativeAssets } = require('../creative/registry');

const { buildCurrentArchitecture } = require('./currentArchitecture');
const { buildCurrentFunnelMetrics } = require('./currentFunnel');
const { buildCurrentArchitectureDiagnosis } = require('./currentDiagnosis');
const { evaluateChallengeCurrentStrategy, evaluateOptimizationVsRearchitecture, computeSearchBreadth, computeSearchDepth, reconcileOptimizationVsRearchitecture } = require('./challengeAndBreadth');
const { generateChallengers } = require('./challengerGenerator');
const { buildEvidenceBasisForChallenger, buildEvidenceBasisForCurrent } = require('./evidenceClassification');
const {
  computeArchitectureDistance, computeReversibility, buildTrackingContractRequirements,
  evaluateTrackingReadiness, computeAutomationFitness, computeScaleFitness, buildCapacityConstraints,
} = require('./architectureProperties');
const {
  buildFrontendEconomics, buildRoasTypes, evaluateProfitTargetCapacity,
  buildMessageArchitectureRequirements, buildCustomerEvidenceHook, buildMarketEvidenceHook,
  buildLifecyclePlaceholder, buildTrafficAssumptions,
} = require('./economicsAndHooks');
const { buildMinimumViableArchitectureTest, resetMvaCounter } = require('./mvaTestBuilder');
const { rankArchitectures } = require('./comparisonAndRanking');
const { evaluateCounterfactual, buildPreMortem, buildPostMortemTemplate } = require('./counterfactualAndPremortem');
const { formRecommendation } = require('./recommendationEngine');
const { evaluateArchitectureTestEligibility, evaluateParallelTestEligibility } = require('./testEligibility');
const { buildExperimentDraftProposal } = require('./experimentDraftProposal');
const { buildStrategySearchMemory, buildCustomerAndMarketEvidenceGaps } = require('./searchMemory');
const { OWNERSHIP_BOUNDARIES } = require('./boundaries');

const STRATEGY_SEARCH_VERSION = 'STRATEGY-SEARCH-V1';

/**
 * enrichChallenger() — anexa todas as propriedades estruturais reais (items 41-58/75-84) a um
 * challenger gerado por challengerGenerator.js, antes de entrar no ranking.
 */
function enrichChallenger(challenger, { currentStageTypes, productId }) {
  const distanceResult = computeArchitectureDistance(challenger.stage_types, currentStageTypes);
  const reversibilityResult = computeReversibility(distanceResult.distance);
  const trackingReadinessResult = evaluateTrackingReadiness(challenger.stage_types);
  const automationFitnessResult = computeAutomationFitness(challenger.stage_types);
  const scaleFitnessResult = computeScaleFitness();
  const trackingContract = buildTrackingContractRequirements(challenger.stage_types);
  const evidenceBasis = buildEvidenceBasisForChallenger(challenger);
  const customerMarketGaps = buildCustomerAndMarketEvidenceGaps(challenger);
  const messageRequirements = buildMessageArchitectureRequirements();
  const lifecycle = buildLifecyclePlaceholder(challenger.stage_types.includes('LIFECYCLE'));
  const trafficAssumptions = buildTrafficAssumptions();

  const enriched = {
    ...challenger,
    product_id: productId,
    is_current: false,
    distance: distanceResult.distance,
    distance_detail: distanceResult,
    reversibility: reversibilityResult.reversibility,
    tracking_readiness: trackingReadinessResult.readiness,
    tracking_readiness_detail: trackingReadinessResult,
    automation_fitness: automationFitnessResult.fitness,
    automation_fitness_detail: automationFitnessResult,
    scale_fitness: scaleFitnessResult.fitness,
    scale_fitness_detail: scaleFitnessResult,
    tracking_contract_requirements: trackingContract,
    evidence_basis: evidenceBasis,
    unknowns: customerMarketGaps.map((g) => g.question),
    customer_market_evidence_gaps: customerMarketGaps,
    message_architecture_requirements: messageRequirements,
    lifecycle_placeholder: lifecycle,
    traffic_assumptions: trafficAssumptions,
    risks: [], // preenchido pelo pré-mortem só pro vencedor final (evita duplicar trabalho pra quem não vence)
  };

  const mvaTest = buildMinimumViableArchitectureTest({ productId, architecture: enriched, currentStageTypes });
  // PASSO 12.1, item 1 — só os gaps de evidência de cliente/mercado indispensáveis pra DEFINIR a
  // hipótese (ex.: quais perguntas de qualificação um QUIZ precisa) contam como
  // PREREQUISITE_EVIDENCE. A ausência de resultado de performance (o que o teste vai medir)
  // NUNCA entra aqui — isso é EVIDENCE_OBJECTIVE, o próprio propósito do teste.
  const testEligibility = evaluateArchitectureTestEligibility({ trackingReadiness: enriched.tracking_readiness, isCurrent: false, prerequisiteEvidenceGaps: customerMarketGaps });
  const experimentDraft = buildExperimentDraftProposal({ architecture: enriched, mvaTest });

  return { ...enriched, mva_test: mvaTest, test_eligibility: testEligibility.eligibility, test_eligibility_detail: testEligibility, experiment_draft_proposal: experimentDraft };
}

function buildCurrentEntry({ currentArchitecture, currentStageTypes, financialRoas, structuralFrictionSignals, hasCompletedComparativeExperiment }) {
  return {
    architecture_id: currentArchitecture.architecture_id,
    family: currentArchitecture.family,
    status: 'CURRENT',
    stage_types: currentStageTypes,
    is_current: true,
    architecture_hypothesis: null,
    primary_mechanism: 'OTHER',
    strategic_diversification_value: false,
    distance: 'LOW',
    reversibility: 'REVERSIBLE',
    tracking_readiness: 'READY',
    automation_fitness: computeAutomationFitness(currentStageTypes).fitness,
    scale_fitness: computeScaleFitness().fitness,
    evidence_basis: buildEvidenceBasisForCurrent({ financialRoas, structuralFrictionSignals, hasCompletedComparativeExperiment }),
    unknowns: [],
    risks: structuralFrictionSignals.map((s) => s.observation),
    why_generated: null,
  };
}

/**
 * analyzeStrategy() — PASSO 12. Orquestrador only-leitura: nunca escreve fora do que o chamador
 * decidir persistir, nunca chama API externa, nunca executa nenhuma ação real. Reusa
 * planner/builder.js (analyzePlan) e os source-of-truth do Offer/CRO — nunca duplica os agents
 * (item 19).
 */
function analyzeStrategy({ productId, dataDir, referenceDate, config = {}, plannerArgs = {} } = {}) {
  resetMvaCounter();
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();
  const dates = standardWindows(refDate).last_30d.dates;

  const planResult = analyzePlan({ productId: resolvedProductId, dataDir, referenceDate: refDate, ...plannerArgs });
  const currentArchitecture = buildCurrentArchitecture({ productId: resolvedProductId, dates });
  const currentFunnel = buildCurrentFunnelMetrics(dates, dataDir);
  const diagnosis = buildCurrentArchitectureDiagnosis({ planResult, croDir: plannerArgs.croDir, offerDir: plannerArgs.offerDir });

  const financialRoas = planResult.economics_snapshot.financials.roas_financeiro;
  const targetRoas = planResult.plan.target_state.target_roas;
  const currentStageTypes = currentArchitecture.stages.filter((s) => s.status === 'ACTIVE').map((s) => s.type);

  const buyers = planResult.economics_snapshot.financials.numero_compradores_reais;
  const challengeCurrentStrategy = evaluateChallengeCurrentStrategy({
    experimentCoverage: planResult.experiment_coverage, structuralFrictionSignals: diagnosis.structural_friction_signals,
    financialRoas, targetRoas, hypothesisSpaceStatus: planResult.hypothesis_space_status, buyers,
  });

  const leverStates = planResult.levers.map((l) => ({ lever_id: l.lever_id, state: l.current_state }));
  // preliminar — só pra calibrar search_breadth ANTES de gerar challengers (item 65-66). O
  // relatório final reporta a versão RECONCILIADA com o vencedor real do ranking (item 7).
  const optimizationVsRearchitecturePreliminary = evaluateOptimizationVsRearchitecture({ leverStates, knownPathToTarget: planResult.known_path_to_target });
  const searchBreadth = computeSearchBreadth({ knownPathToTarget: planResult.known_path_to_target, financialRoas, targetRoas, hypothesisSpaceStatus: planResult.hypothesis_space_status });

  // PASSO 12.2, item 4 — sinal real de formato de vídeo (Creative Intelligence Agent, read-only)
  // pra decidir entre VSL e alternativas — nunca invertido em "assume que sim" sem dado.
  const creativeAssets = loadCreativeAssets(plannerArgs.creativeDir);
  const hasConfirmedVideoAsset = creativeAssets.some((a) => a.format === 'VIDEO' || a.format_hint === 'VIDEO');
  const videoFormatSignal = hasConfirmedVideoAsset ? 'CONFIRMED' : (creativeAssets.length > 0 ? 'ABSENT' : 'UNKNOWN');

  const challengerDiagnosisInput = {
    missing_monetization_signals: diagnosis.missing_monetization_signals,
    known_path_to_target: planResult.known_path_to_target,
    tracking_scopes: planResult.tracking_scopes,
    financial_roas: financialRoas,
    cancelled_or_expired_transactions: currentFunnel.cancelled_or_expired_transactions, // item 5 — sinal real de abandono, nunca tracking degradado
    video_format_signal: videoFormatSignal, // item 4 — nunca hardcoda VSL
  };
  const rawChallengers = generateChallengers({ diagnosis: challengerDiagnosisInput, currentStageTypes, currentFamily: currentArchitecture.family, searchBreadth: searchBreadth.breadth });
  const challengers = rawChallengers.map((c) => enrichChallenger(c, { currentStageTypes, productId: resolvedProductId }));

  // item 67/8 — search_depth reflete a distância REAL dos challengers gerados, não a decisão
  // preliminar (nunca reportado de forma incoerente com o que realmente foi explorado).
  const searchDepth = computeSearchDepth(challengers.map((c) => c.distance));

  const hasCompletedComparativeExperiment = false; // item 69/26 — nenhum experimento real comparando arquiteturas existe hoje (honesto, não hardcoded como "sempre false" fora de contexto — é o estado real atual)

  const currentEntry = buildCurrentEntry({ currentArchitecture, currentStageTypes, financialRoas, structuralFrictionSignals: diagnosis.structural_friction_signals, hasCompletedComparativeExperiment });
  const rankResult = rankArchitectures([currentEntry, ...challengers]);

  const winner = rankResult.ranking[0];
  const runnerUpNotWinner = rankResult.ranking.find((r) => r.architecture_id !== winner.architecture_id);
  const fallbackId = runnerUpNotWinner ? runnerUpNotWinner.architecture_id : 'NO_FALLBACK_AVAILABLE';

  // item 7 — reconciliação final: recommendation_type É DERIVADO desta decisão, nunca computado
  // separadamente — elimina por construção a possibilidade de contradição entre os dois campos.
  const optimizationVsRearchitecture = reconcileOptimizationVsRearchitecture({ winner, preliminaryDecision: optimizationVsRearchitecturePreliminary.decision });

  const counterfactual = evaluateCounterfactual({
    ranking: rankResult.ranking, hasCompletedComparativeExperiment, knownPathToTarget: planResult.known_path_to_target,
    financialRoas, targetRoas, comparativeEvidence: challengeCurrentStrategy.comparative_evidence,
  });
  const preMortem = buildPreMortem(winner);
  const postMortemTemplate = buildPostMortemTemplate(winner);

  const recommendation = formRecommendation({
    ranking: rankResult.ranking, reconciledDecision: optimizationVsRearchitecture.decision,
    hasCompletedComparativeExperiment, fallbackId, counterfactual, preMortem, knownPathToTarget: planResult.known_path_to_target,
  });

  const parallelTestEligibility = evaluateParallelTestEligibility({
    candidateA: challengers[0] || null, candidateB: challengers[1] || null, capitalAvailable: planResult.capital_plan.available,
  });

  const frontendEconomics = buildFrontendEconomics({ financialRoas, targetRoas, lucroPrejuizo: planResult.economics_snapshot.financials.lucro_prejuizo });
  const roasTypes = buildRoasTypes({
    mainProductRevenue: planResult.economics_snapshot.financials.receita_bruta_hotmart - (planResult.economics_snapshot.financials.order_bump_revenue_bruto || 0),
    totalRevenue: planResult.economics_snapshot.financials.receita_bruta_hotmart, spend: planResult.economics_snapshot.financials.gasto_meta,
  });
  const profitTargetCapacity = evaluateProfitTargetCapacity(config.profitTarget);
  const capacityConstraints = buildCapacityConstraints();
  const customerEvidenceHook = buildCustomerEvidenceHook(['perfil demográfico real dos compradores', 'principais objeções reportadas']);
  const marketEvidenceHook = buildMarketEvidenceHook(['nível de sofisticação do mercado de "resposta no WhatsApp"', 'concorrência direta real']);

  const architecturesForPersistence = [
    { architecture_id: currentArchitecture.architecture_id, product_id: resolvedProductId, version: 1, name: currentArchitecture.name, family: currentArchitecture.family, status: 'CURRENT', hypothesis: null, stages: currentArchitecture.stages, conversion_events: [], monetization_layers: currentArchitecture.stages.filter((s) => ['ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL'].includes(s.type)).map((s) => s.type), followup_layers: [], dependencies: [], tracking_requirements: buildTrackingContractRequirements(currentStageTypes), evidence_basis: currentEntry.evidence_basis, unknowns: [], risks: currentEntry.risks, implementation_complexity: 'LOW', measurement_complexity: 'LOW' },
    ...challengers.map((c) => ({ architecture_id: c.architecture_id, product_id: resolvedProductId, version: 1, name: `${c.family} — ${c.rule_id}`, family: c.family, status: c.status, hypothesis: c.architecture_hypothesis, stages: c.stage_types.map((t) => ({ type: t })), conversion_events: c.tracking_contract_requirements.events, monetization_layers: c.stage_types.filter((t) => ['ORDER_BUMP', 'BUNDLE', 'UPSELL', 'DOWNSELL'].includes(t)), followup_layers: c.stage_types.filter((t) => ['EMAIL', 'WHATSAPP', 'COMMUNITY'].includes(t)), dependencies: [], tracking_requirements: c.tracking_contract_requirements, evidence_basis: c.evidence_basis, unknowns: c.unknowns, risks: c.risks, implementation_complexity: c.distance, measurement_complexity: c.tracking_readiness })),
  ];

  const strategySearchMemory = buildStrategySearchMemory({ productId: resolvedProductId, architectures: architecturesForPersistence });

  const analysisId = `STRATEGY-SEARCH-${resolvedProductId}-${refDate}`;

  const analysis = {
    analysis_id: analysisId,
    product_id: resolvedProductId,
    version: STRATEGY_SEARCH_VERSION,
    created_at: new Date().toISOString(),
    current_architecture: currentArchitecture,
    current_funnel: currentFunnel,
    current_economics: { financial_roas: financialRoas, target_roas: targetRoas, ...planResult.economics_snapshot.financials, front_end: frontendEconomics, roas_types: roasTypes },
    current_diagnosis: diagnosis,
    challenge_current_strategy: challengeCurrentStrategy,
    optimization_vs_rearchitecture: optimizationVsRearchitecture, // reconciliado com o vencedor real (item 7) — nunca contradiz recommendation_type
    optimization_vs_rearchitecture_preliminary: optimizationVsRearchitecturePreliminary, // só pra auditoria — usado apenas pra calibrar search_breadth antes de gerar challengers
    search_breadth: searchBreadth,
    search_depth: searchDepth,
    challengers,
    ranking: rankResult.ranking,
    decision_tie: rankResult.decision_tie,
    decision_tie_architecture_ids: rankResult.decision_tie_architecture_ids,
    tie_break_factor_order: rankResult.tie_break_factor_order,
    counterfactual,
    pre_mortem: preMortem,
    post_mortem_template: postMortemTemplate,
    recommendation,
    parallel_test_eligibility: parallelTestEligibility,
    profit_target_capacity: profitTargetCapacity,
    capacity_constraints: capacityConstraints,
    customer_evidence_hook: customerEvidenceHook,
    market_evidence_hook: marketEvidenceHook,
    strategy_search_memory: strategySearchMemory,
    ownership_boundaries: OWNERSHIP_BOUNDARIES,
  };

  return {
    product_id: resolvedProductId,
    generated_at: new Date().toISOString(),
    analysis,
    architectures: architecturesForPersistence,
    planner_result: planResult,
  };
}

module.exports = { analyzeStrategy, STRATEGY_SEARCH_VERSION };
