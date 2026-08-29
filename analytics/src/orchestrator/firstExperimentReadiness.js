'use strict';

const { resolveProductId } = require('../../config/product');
const { todayBRT } = require('../utils/dates');
const { analyzeStrategy } = require('../strategy-search/builder');
const { analyzeMeasurement } = require('../measurement/builder');
const { analyzePlan } = require('../planner/builder');
const { loadAssets: loadCreativeAssets } = require('../creative/registry');
const { buildExperimentDraftProposal } = require('../strategy-search/experimentDraftProposal');
const { emptyTierDefinition } = require('../execution/authorityTiers');
const {
  auditEvidenceRuleFoundation, buildExperimentDesignRuleStatus, buildMetricSeparation,
  buildStructuredDecisionQuestion, buildMultiStageDecisionStructure,
  HARM_THRESHOLD_STATUS, STOP_CONTINUE_STATES, buildReadinessSubdimensions,
  FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING, buildHistoricalEvidenceSummary,
} = require('./experimentDecisionSemantics');

// item 20 — os 8 estados possíveis, semântica rigorosa (nunca ambígua, nunca forçada).
const READINESS_STATES = [
  'READY_FOR_IMPLEMENTATION', 'READY_FOR_DEPLOYMENT', 'READY_FOR_EXECUTION',
  'BLOCKED_BY_MEASUREMENT', 'BLOCKED_BY_DESIGN', 'BLOCKED_BY_POLICY', 'BLOCKED_BY_CAPITAL', 'BLOCKED_BY_UNKNOWN',
];

// item 19 — PLANNER_FINANCIAL_TRUTH_LABEL_DEBT. Não modifica planner/scaleGate.js/trackingScopes.js
// (write boundary proíbe) — só registra formalmente o achado já investigado no PASSO 15.1.
const PLANNER_FINANCIAL_TRUTH_LABEL_DEBT = {
  debt_id: 'PLANNER_FINANCIAL_TRUTH_LABEL_DEBT',
  priority: 'MEDIUM',
  finding: 'planner/scaleGate.js\'s evaluateScaleGate() bloqueia citando "FINANCIAL_TRUTH=DEGRADED", lendo esse status de planner/trackingScopes.js (PASSO 11.1) — uma definição de DEGRADED que conflava ruído de PLATFORM_ATTRIBUTION com FINANCIAL_TRUTH de verdade. O Measurement Agent (PASSO 13/13.1) já resolveu isso corretamente, separando FINANCIAL_TRANSACTION_TRUTH de PLATFORM_ATTRIBUTION — mas o Planner nunca foi atualizado pra consumir essa distinção.',
  classification: 'STALE_LABELING_METHODOLOGY',
  root_cause: 'trackingScopes.js (planner/) foi escrito ANTES do Measurement Agent existir — seu próprio comentário de cabeçalho já antecipava essa dívida.',
  current_authority: 'Measurement permanece a autoridade atual pra financial truth (item 19) — o label do Planner é STALE, não FALSE, e nunca sobrepõe o valor real vindo de Measurement neste sistema (sourceOfTruthHierarchy.js já resolve esse conflito, PASSO 15.1).',
  recommended_fix: 'atualizar planner/trackingScopes.js pra consumir measurement/builder.js\'s FINANCIAL_TRANSACTION_TRUTH em vez de recalcular seu próprio status — fora do write boundary deste PASSO (Planner explicitamente não pode ser modificado, item 19 do PASSO 16).',
  status: 'AUDITED_NOT_FIXED',
};

// item 18 — categorias de implementation readiness (nunca hardcoded pro nome "Advertorial" —
// deriva do mva_test/winner real, qualquer família).
function auditImplementationReadiness({ winner, mvaTest }) {
  const newStages = mvaTest.changed_components;
  return {
    CONTENT_REQUIREMENTS: { status: 'NOT_STARTED', detail: `copy/roteiro editorial pro(s) estágio(s) novo(s) (${newStages.join(', ')}) — nada escrito ainda (item 18, nunca produzido neste PASSO).` },
    DESIGN_REQUIREMENTS: { status: 'NOT_STARTED', detail: `layout/visual pro(s) estágio(s) novo(s) — nenhum design real existe hoje pra ${newStages.join(', ')}.` },
    TECHNICAL_REQUIREMENTS: { status: 'NOT_STARTED', detail: `página/rota real pro(s) estágio(s) novo(s) não existe no repo (${newStages.join(', ')} não confirmado em vercel.json nem como arquivo servido real).` },
    TRACKING_REQUIREMENTS: { status: winner.tracking_readiness === 'PARTIAL' ? 'PARTIAL' : 'NOT_STARTED', detail: winner.tracking_readiness_detail ? winner.tracking_readiness_detail.reason : 'instrumentação pro(s) estágio(s) novo(s) não confirmada.' },
    DEPLOYMENT_REQUIREMENTS: { status: 'NOT_STARTED', detail: 'nenhuma regra de host/roteamento real existe pro tratamento ainda — DEPLOY_LP_CHANGE real não ocorreu (nem pode ocorrer neste PASSO).' },
    ASSET_REQUIREMENTS: { status: 'NOT_STARTED', detail: 'nenhum asset (imagem/vídeo/criativo) específico pro estágio novo foi produzido ou confirmado.' },
    treatment_exists_as_real_page: false,
    reason: 'nenhuma implementação real do vencedor foi construída ou publicada — apenas um contrato de requisitos, nunca a página em si (item 18 explicitamente proíbe construir a página neste PASSO).',
  };
}

// item 16 — separação estrutural. Nunca deixa Meta purchase substituir Hotmart financial truth
// (ghost-purchase protection preservada, consumindo os campos já computados por Measurement —
// nunca recalculados aqui).
function buildSignalSeparation({ measurementAnalysis }) {
  const a = measurementAnalysis;
  return {
    FINANCIAL_OUTCOME: {
      source: 'Hotmart real (measurement/revenueProfitAttribution.js via source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH)',
      status: a.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.status,
      note: 'única fonte de verdade financeira — nunca substituída por sinal de plataforma (item 16).',
    },
    PLATFORM_SIGNAL: {
      source: 'Meta Ads/Pixel (measurement/builder.js via source_of_truth_matrix.PLATFORM_ATTRIBUTION)',
      status: a.source_of_truth_matrix.PLATFORM_ATTRIBUTION.status,
      note: 'sinal de plataforma (ex.: "purchase" do Meta) NUNCA é tratado como venda financeira real — só corrobora/diagnostica, nunca decide (ghost-purchase protection).',
    },
    BEHAVIORAL_SIGNAL: {
      source: 'funil real (measurement/funnelAudit.js, tracking_contract) + Clarity (WEB_BEHAVIOR)',
      status: a.source_of_truth_matrix.WEB_BEHAVIOR ? a.source_of_truth_matrix.WEB_BEHAVIOR.status : 'NOT_AVAILABLE',
      note: 'explica ONDE/COMO no funil (LP view, checkout initiated, scroll) — nunca usado como prova de resultado financeiro por si só (mesma disciplina de FUNNEL_DIAGNOSTICS em blockerDependencyGraph.js: informativo, nunca decide SE o efeito ocorreu).',
    },
    ghost_purchase_protection: {
      preserved: true,
      real_ghost_purchase_days_found: a.reconciliation.ghost_purchase_days.length,
      reason: 'measurement/reconciliation.js já detecta e preserva dias com ghost purchases reais (Meta reporta purchase sem transação Hotmart correspondente) — nunca promovidos a revenue. Este módulo consome esse resultado, nunca recalcula.',
    },
  };
}

// item 17 — controle vs tratamento precisa ser SABÍVEL, não só teoricamente possível.
function buildControlTreatmentExposureDesign({ exposureOperationalizationResult = {}, winnerArchitectureId }) {
  const hasControlEntry = exposureOperationalizationResult.action === 'REGISTERED' || exposureOperationalizationResult.action === 'ALREADY_REGISTERED';
  return {
    control: {
      architecture_id: exposureOperationalizationResult.entry ? exposureOperationalizationResult.entry.architecture_id : null,
      exposure_identity_registered: hasControlEntry,
      live_from: exposureOperationalizationResult.entry ? exposureOperationalizationResult.entry.live_from : 'UNKNOWN',
    },
    treatment: {
      architecture_id: winnerArchitectureId,
      exposure_identity_registered: false, // nunca true antes do deploy real — item 10 (transição futura, não executada aqui)
      live_from: 'NOT_YET_DEPLOYED',
    },
    can_distinguish_control_vs_treatment: hasControlEntry,
    reason: hasControlEntry
      ? 'controle (arquitetura atual) já tem registro real de exposição (mesmo com live_from=UNKNOWN) — tratamento ainda não existe/não foi implantado, então sua entrada só será criada no momento real do deploy futuro (execution/exposureIdentityRegistry.js\'s DEPLOYMENT_LIFECYCLE_CONTRACT, item 10). Sem isso, EXPERIMENT_ATTRIBUTION não pode ser declarado completo (item 17).'
      : 'nenhum registro real de controle existe ainda — impossível declarar completude de EXPERIMENT_ATTRIBUTION.',
  };
}

/**
 * determineReadinessState() — item 20. Precedência explícita, nunca ambígua: measurement primeiro
 * (é a fundação), depois policy/capital (autoridade), depois o estágio real de implementação
 * (nunca força READY_FOR_EXECUTION sem tratamento construído/implantado).
 */
function determineReadinessState({ measurementBlocked, decisionRuleMissing, treatmentBuilt, treatmentDeployed }) {
  if (measurementBlocked) return { state: 'BLOCKED_BY_MEASUREMENT', reason: 'EXPOSURE_IDENTITY ou outro blocker de measurement ainda não satisfeito pro vencedor real — nenhum experimento pode ser julgado sem isso.' };
  if (decisionRuleMissing) return { state: 'BLOCKED_BY_DESIGN', reason: 'nenhuma regra de evidência mínima/decisão aplicável foi encontrada (nem aproximação real via experiments/evidence.js) — NEEDS_EXPERIMENT_DESIGN_CALIBRATION.' };
  if (!treatmentBuilt) return { state: 'READY_FOR_IMPLEMENTATION', reason: 'design do experimento real e pronto (hipótese, controle/tratamento, métricas, regra de decisão) e EXPOSURE_IDENTITY operacionalizado — mas o tratamento em si (página/estágio novo) ainda não foi construído. Próximo passo real é IMPLEMENTAR, nunca implantar/executar antes disso.' };
  if (!treatmentDeployed) return { state: 'READY_FOR_DEPLOYMENT', reason: 'tratamento construído mas ainda não implantado em produção.' };
  return { state: 'READY_FOR_EXECUTION', reason: 'tratamento construído e implantado — pronto pra iniciar coleta de dados real do experimento (execução em si continua exigindo autorização de capital/aprovação humana separadamente, nunca implícita aqui).' };
}

/**
 * buildFirstExperimentReadiness() — item 14/20. Consome dinamicamente o vencedor REAL do
 * Strategy Search (nunca hardcoded) + o resultado real de operationalizeExposureIdentity() já
 * executado — nunca força um estado de prontidão além do que a evidência real sustenta.
 */
function buildFirstExperimentReadiness({ productId, dataDir, referenceDate, exposureOperationalizationResult, executionDataDir } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const refDate = referenceDate || todayBRT();

  const strategyResult = analyzeStrategy({ productId: resolvedProductId, dataDir, referenceDate: refDate });
  const measurementResult = analyzeMeasurement({ productId: resolvedProductId, dataDir, referenceDate: refDate, strategyPlannerArgs: { executionDataDir } });
  const measurementAnalysis = measurementResult.analysis;

  const winnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const currentIsWinner = winnerId === strategyResult.analysis.current_architecture.architecture_id;
  const winner = currentIsWinner ? null : strategyResult.analysis.challengers.find((c) => c.architecture_id === winnerId);

  if (!winner) {
    return {
      experiment_id: null, product_id: resolvedProductId, readiness: 'BLOCKED_BY_UNKNOWN',
      readiness_reason: currentIsWinner ? 'o vencedor real do Strategy Search é a própria arquitetura atual (nenhuma mudança recomendada hoje) — nenhum experimento de mudança de arquitetura é aplicável.' : 'vencedor não encontrado — estado inconsistente do Strategy Search.',
      generated_at: new Date().toISOString(),
    };
  }

  const mvaTest = winner.mva_test;
  const draftProposal = buildExperimentDraftProposal({ architecture: winner, mvaTest });
  const implementationReadiness = auditImplementationReadiness({ winner, mvaTest });
  const signalSeparation = buildSignalSeparation({ measurementAnalysis });
  const controlTreatment = buildControlTreatmentExposureDesign({ exposureOperationalizationResult, winnerArchitectureId: winnerId });

  // PASSO 16.1 — auditoria de fundamento da regra de evidência (item 1-2): nunca promove a
  // aproximação de categoria a regra validada.
  const foundationAudit = auditEvidenceRuleFoundation({ mvaTest });
  const designRuleStatus = buildExperimentDesignRuleStatus({ foundationAudit });

  const planResult = analyzePlan({ productId: resolvedProductId, dataDir, referenceDate: refDate });
  const metricSeparation = buildMetricSeparation({ mvaTest, planFinancials: planResult.economics_snapshot.financials, measurementAnalysis });
  const structuredDecisionQuestion = buildStructuredDecisionQuestion({ winner, mvaTest });
  const multiStageDecisionStructure = buildMultiStageDecisionStructure({ metricSeparation });
  const historicalEvidence = buildHistoricalEvidenceSummary({ planResult, measurementAnalysis, creativeAssetsCount: loadCreativeAssets().length });

  const strategyHandoff = measurementAnalysis.strategy_handoff;
  const measurementBlocked = strategyHandoff.found ? !strategyHandoff.blocker_dependency_graph.all_capital_blocking_satisfied : true;
  const decisionRuleMissing = mvaTest.minimum_evidence == null; // item 15 (PASSO 16) — nunca inventa; se null, é NOT_ESTIMABLE real (não calibrado). Distinto de NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION (item 2, PASSO 16.1) — este último é "regra existe mas é só referência provisória", nunca bloqueante por si (item 10).
  const treatmentBuilt = implementationReadiness.treatment_exists_as_real_page;
  const treatmentDeployed = false; // nunca true neste PASSO — nenhum deploy real ocorreu (write boundary)

  const readinessResult = determineReadinessState({ measurementBlocked, decisionRuleMissing, treatmentBuilt, treatmentDeployed });

  const tier0 = emptyTierDefinition('TIER_0_ANALYZE_ONLY');
  const readinessSubdimensions = buildReadinessSubdimensions({
    implementationReadiness, measurementBlocked, decisionRuleStatus: designRuleStatus.status, treatmentDeployed, capitalAuthorityTier: 'TIER_0_ANALYZE_ONLY',
  });

  return {
    experiment_id: draftProposal.mva_test_id,
    product_id: resolvedProductId,
    control_architecture: strategyResult.analysis.current_architecture.architecture_id,
    treatment_architecture: winnerId,
    treatment_family: winner.family,
    hypothesis: winner.architecture_hypothesis,
    primary_decision_question: structuredDecisionQuestion.question, // PASSO 16.1, item 6 — agora sempre acopla a condição econômica, nunca só "X aumenta conversão?"
    structured_decision_question: structuredDecisionQuestion,
    multi_stage_decision_structure: multiStageDecisionStructure, // PASSO 16.1, item 7
    success_signal: mvaTest.success_condition,
    failure_signal: mvaTest.failure_condition,
    financial_metrics: [mvaTest.secondary_metrics.find((m) => m === 'financial_roas') || 'financial_roas', 'refund_rate'].filter((v, i, arr) => arr.indexOf(v) === i),
    behavioral_metrics: [mvaTest.primary_metric],
    measurement_method: measurementAnalysis.strategy_handoff.found ? measurementAnalysis.strategy_handoff.minimum_viable_attribution.recommended_method || 'AGGREGATE_TEMPORAL_COMPARISON' : 'UNKNOWN',
    exposure_identity_method: 'CURRENT_ARCHITECTURE_OBSERVATION (execution/exposureIdentityRegistry.js) + comparação temporal agregada (measurement/minimumViableAttribution.js)',
    capital_requirement: mvaTest.estimated_measurement_capital, // NOT_ESTIMABLE real, nunca inventado (item 15/16)
    capital_authority: { current_tier: 'TIER_0_ANALYZE_ONLY', max_autonomous_capital_per_action: tier0.max_autonomous_capital_per_action, human_approval_threshold: tier0.human_approval_threshold, note: 'qualquer capital real pra rodar este experimento exige aprovação humana explícita — TIER_0 nunca autoriza gasto autônomo (PASSO 14B).' },
    implementation_requirements: implementationReadiness,
    deployment_requirements: implementationReadiness.DEPLOYMENT_REQUIREMENTS,
    rollback_halt_semantics: { method: 'HALT_ONLY (nenhum deploy real ocorreu ainda — nada a reverter). Uma vez implantado, seguiria execution/rollbackContract.js\'s classificação real por action_type (fora do escopo deste PASSO).' },
    minimum_observation_requirement: mvaTest.minimum_evidence,
    decision_rule_status: decisionRuleMissing ? 'NEEDS_EXPERIMENT_DESIGN_CALIBRATION' : designRuleStatus.status, // PASSO 16.1, item 2 — NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION quando a regra existe só como referência provisória (nunca promovida a validada)
    decision_rule_detail: draftProposal.category_note,
    experiment_design_rule_audit: foundationAudit, // PASSO 16.1, item 1
    experiment_design_rule_status: designRuleStatus, // PASSO 16.1, item 2 — REFERENCE != VALIDATED_DECISION_RULE explícito
    metric_separation: metricSeparation, // PASSO 16.1, item 3 — LEADING_INDICATOR/ECONOMIC_OUTCOME/GUARDRAIL_METRICS
    stop_continue_semantics: { // PASSO 16.1, item 8 — regra documentada, nunca aplicada a dados inexistentes
      current_status: 'NOT_YET_STARTED',
      reason: 'nenhum experimento real está coletando dados ainda (tratamento não construído/implantado) — nenhuma das classificações abaixo se aplica hoje.',
      available_recommendations: STOP_CONTINUE_STATES,
      harm_threshold_status: HARM_THRESHOLD_STATUS,
    },
    readiness_subdimensions: readinessSubdimensions, // PASSO 16.1, item 9
    experiment_category_debt: FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING, // PASSO 16.1, item 10
    historical_evidence: historicalEvidence, // PASSO 16.1, item 11
    current_blockers: {
      measurement: measurementBlocked ? strategyHandoff.blocker_dependency_graph.current_blocker : null,
      strategy_search: { current_blocker: winner.current_blocker, remaining_blockers: winner.remaining_blockers },
      implementation: Object.entries(implementationReadiness).filter(([k, v]) => v && v.status && v.status !== 'DONE').map(([k]) => k),
    },
    financial_platform_behavioral_signal_separation: signalSeparation,
    control_vs_treatment_exposure: controlTreatment,
    experiment_draft_proposal: draftProposal,
    readiness: readinessResult.state,
    readiness_reason: readinessResult.reason,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  READINESS_STATES, PLANNER_FINANCIAL_TRUTH_LABEL_DEBT,
  buildFirstExperimentReadiness, determineReadinessState, auditImplementationReadiness, buildSignalSeparation, buildControlTreatmentExposureDesign,
};
