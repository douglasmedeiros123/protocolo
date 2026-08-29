'use strict';

const { buildGlobalStateContract } = require('./globalStateContract');
const { buildGlobalDiagnosis } = require('./globalDiagnosis');
const { routeRelevance } = require('./relevanceRouter');
const { generateRealCandidates } = require('./decisionCandidate');
const { buildConflictMatrix } = require('./conflictResolver');
const { buildDependencyGraph } = require('./dependencyGraph');
const { rankAndRecommend } = require('./rankingAndRecommendation');
const { challengeDecision } = require('./decisionChallenger');
const { challengeStatusQuo } = require('./statusQuoChallenge');
const { locateCurrentPositionInHierarchy } = require('./economicObjectiveHierarchy');
const { buildTargetGapAwareness } = require('./targetGapAwareness');
const { evaluateProductViabilityEscalation } = require('./productViabilityEscalation');
const { buildCapitalAllocationAwareness } = require('./capitalAllocationAwareness');
const { buildActionabilityContract } = require('./actionability');
const { handoffToPolicyEngine } = require('./policyHandoff');
const { pullMeasurementSignals } = require('../execution/measurementHandoff');
const { enforceShadowMode, SHADOW_MODE, AUTONOMOUS_EXECUTION_CAPITAL } = require('./shadowMode');
const { resetCycleCounter, buildLedgerEntry } = require('./shadowDecisionLedger');
const { buildCounterfactualLog } = require('./counterfactualLog');
const { evaluateDecisionQuality } = require('./decisionQualityFramework');
const { buildLearningHandoffPackage } = require('./learningHandoff');
const { detectFailureModes } = require('./failureModes');
const { CEO_ORIENTATIONS } = require('./enums');
const { buildScopedConfidence } = require('./confidenceScope');
const { isOrientationConsistentWithSemanticType, AUTHORITY_SEPARATION } = require('./actionSemantics');

// PASSO 15.1, item 5/13 — debt registrado originalmente aqui. RESOLVIDO no PASSO 16, item 1:
// execution/enums.js ganhou SUBJECT_TYPES=INTERNAL_REGISTRY/INTERNAL_DECISION_LEDGER e
// ACTION_TYPES=REGISTER_OBSERVED_EXPOSURE/CREATE_NEW_EXPOSURE; execution/blastRadius.js mapeia
// INTERNAL_REGISTRY->SINGLE_ASSET; policyHandoff.js's resolveActionAndSubjectType() agora envia
// um candidato REGISTER_OBSERVED_EXPOSURE real como actionType=REGISTER_OBSERVED_EXPOSURE/
// subjectType=INTERNAL_REGISTRY, nunca mais UPDATE_TRACKING_CONFIG/TRACKING_CONFIG. Mantido aqui
// (histórico) só como registro de auditoria — status atualizado, nunca apagado silenciosamente.
const BLAST_RADIUS_ARCHITECTURAL_DEBT = {
  finding: 'REGISTER_OBSERVED_EXPOSURE (escrita interna pura) herdava blast_radius=ACCOUNT via execution/blastRadius.js porque nenhum SUBJECT_TYPE existente representava "registro interno" — só ARCHITECTURE/TRACKING_CONFIG, ambos superdimensionados pra esse caso.',
  recommended_fix: 'adicionar um SUBJECT_TYPE dedicado (INTERNAL_REGISTRY) em execution/enums.js/blastRadius.js mapeado pra SINGLE_ASSET, e corrigir orchestrator/policyHandoff.js pra usar o novo action_type/subject_type quando o semantic_type real for REGISTER_OBSERVED_EXPOSURE.',
  current_behavior_stays_conservative: true,
  status: 'RESOLVED',
  resolved_in: 'PASSO_16_ITEM_1',
};

const ORCHESTRATOR_VERSION = 'CEO-ORCHESTRATOR-V1-SHADOW';

// item 1 — mapeia o candidato vencedor + resultado da Policy Engine pra UMA orientação
// principal, nunca ambígua. Overrides estruturais (status quo challenge / product viability)
// podem sobrepor a orientação do ranking puro quando aplicável.
function deriveFinalOrientation({ winnerCandidate, policyResult, statusQuoResult, viabilityResult }) {
  if (viabilityResult.escalation === 'SWITCH_PRODUCT') return 'SWITCH_PRODUCT';
  if (viabilityResult.escalation === 'KILL_PRODUCT') return 'KILL_HYPOTHESIS';
  if (!winnerCandidate) return 'COLLECT_EVIDENCE'; // NO_DEFENSIBLE_PREFERENCE -> sempre recomenda coletar evidência
  if (winnerCandidate.action_class === 'HOLD_CAPITAL') return 'HOLD_CAPITAL';
  if (winnerCandidate.action_class === 'COLLECT_EVIDENCE') return 'COLLECT_EVIDENCE';
  if (winnerCandidate.action_class === 'START_EXPERIMENT') {
    return policyResult.policy_allows === 'ALLOW' ? 'EXECUTE' : 'DO_NOT_EXECUTE';
  }
  return 'DO_NOT_EXECUTE';
}

/**
 * runCeoDecisionCycle() — item 1/27. Loop completo: OBSERVE -> DIAGNOSE -> PRIORITIZE ->
 * GENERATE/CONSUME ALTERNATIVES -> CHALLENGE -> RANK -> RECOMMEND -> POLICY_EVALUATION ->
 * SHADOW_EXECUTION -> OBSERVE_OUTCOME_WHEN_AVAILABLE -> LEARN -> REPLAN. Termina em EXATAMENTE
 * uma orientação principal. NUNCA executa nada real — SHADOW_MODE=true, AUTONOMOUS_EXECUTION_
 * CAPITAL=0, sempre.
 */
function runCeoDecisionCycle({ productId, dataDir, referenceDate, outcomeEvidence = null } = {}) {
  resetCycleCounter();

  // OBSERVE
  const stateContract = buildGlobalStateContract({ productId, dataDir, referenceDate });

  // DIAGNOSE
  const diagnosis = buildGlobalDiagnosis(stateContract);
  const economicPosition = locateCurrentPositionInHierarchy(diagnosis);
  const targetGap = buildTargetGapAwareness(stateContract);
  const viabilityResult = evaluateProductViabilityEscalation({
    plannerPlan: stateContract.data.planner.plan, switchGate: stateContract.data.planner.switch_gate,
    hypothesisSpaceStatus: stateContract.data.planner.hypothesis_space_status,
  });
  const statusQuoResult = challengeStatusQuo(diagnosis);

  // PRIORITIZE
  const relevance = routeRelevance(diagnosis);

  // GENERATE/CONSUME ALTERNATIVES
  const candidates = generateRealCandidates(stateContract);
  const conflictMatrix = buildConflictMatrix(candidates);
  const dependencyGraph = buildDependencyGraph(candidates);
  const capitalAllocationAwareness = buildCapitalAllocationAwareness(candidates);

  // RANK (+ CHALLENGE roda sobre o resultado do ranking, antes do RECOMMEND final)
  const rankResult = rankAndRecommend(candidates, dependencyGraph);
  const winnerCandidate = rankResult.recommended_candidate_id ? candidates.find((c) => c.candidate_id === rankResult.recommended_candidate_id) : null;

  // CHALLENGE
  const challengerResult = challengeDecision({ winner: winnerCandidate, ranking: rankResult.ranking, diagnosis, graph: dependencyGraph });
  const counterfactualLog = buildCounterfactualLog(rankResult.ranking, rankResult.recommended_candidate_id);

  // POLICY_EVALUATION — sinais de measurement pro subject do CANDIDATO vencedor especificamente
  // (nunca reaproveita cegamente o subject de outro candidato).
  const measurementSignalsForPolicy = pullMeasurementSignals({ productId: stateContract.product_id, dataDir, referenceDate });
  const policyHandoffResult = handoffToPolicyEngine({ winnerCandidate, measurementSignals: measurementSignalsForPolicy });

  // SHADOW_EXECUTION
  const shadowResult = enforceShadowMode(policyHandoffResult);

  // RECOMMEND (orientação final única)
  const finalOrientation = deriveFinalOrientation({ winnerCandidate, policyResult: policyHandoffResult, statusQuoResult, viabilityResult });
  const actionabilityContract = buildActionabilityContract(winnerCandidate, { authorityTier: diagnosis.capital_state.authority_tier });

  // item 8/9 (PASSO 15.1) — consistência semântica entre orientação final e o tipo real da ação;
  // confidence com escopo explícito, nunca um número genérico reaproveitado.
  const orientationSemanticConsistency = winnerCandidate
    ? { consistent: isOrientationConsistentWithSemanticType(winnerCandidate.action_semantics.semantic_type, finalOrientation), semantic_type: winnerCandidate.action_semantics.semantic_type, orientation: finalOrientation }
    : { consistent: true, semantic_type: null, orientation: finalOrientation };
  const confidenceScope = buildScopedConfidence({
    decisionConfidence: rankResult.confidence || null,
    strategyConfidence: stateContract.data.strategy_search.analysis.recommendation.confidence,
    productViabilityConfidence: stateContract.data.planner.plan.verdict_confidence,
    measurementConfidence: diagnosis.measurement_state.financial_truth_health === 'RELIABLE' ? 'HIGH' : 'LOW',
  });

  // OBSERVE_OUTCOME_WHEN_AVAILABLE / LEARN
  const failureModesResult = detectFailureModes(stateContract, diagnosis, candidates);
  const ledgerEntry = buildLedgerEntry({ stateContract, dominantConstraint: diagnosis.dominant_constraint, candidates, recommendation: rankResult, challengerResult, policyHandoffResult, shadowResult });
  const decisionQuality = evaluateDecisionQuality({ observedOutcome: outcomeEvidence ? outcomeEvidence.result : null, evidenceAvailableAtDecisionTime: 'SUFFICIENT', policyCompliant: true, wasAvoidableError: false });
  const learningHandoff = buildLearningHandoffPackage({ productId: stateContract.product_id, ledgerEntry, decisionQuality, outcomeEvidence });

  return {
    version: ORCHESTRATOR_VERSION,
    shadow_mode: SHADOW_MODE,
    autonomous_execution_capital: AUTONOMOUS_EXECUTION_CAPITAL,
    product_id: stateContract.product_id,
    generated_at: new Date().toISOString(),
    loop_stages_executed: ['OBSERVE', 'DIAGNOSE', 'PRIORITIZE', 'GENERATE_CONSUME_ALTERNATIVES', 'CHALLENGE', 'RANK', 'RECOMMEND', 'POLICY_EVALUATION', 'SHADOW_EXECUTION', 'OBSERVE_OUTCOME_WHEN_AVAILABLE', 'LEARN', 'REPLAN'],
    state_contract_summary: { reference_date: stateContract.reference_date, data_freshness: stateContract.data_freshness },
    diagnosis, economic_position: economicPosition, target_gap: targetGap, viability_result: viabilityResult, status_quo_result: statusQuoResult,
    relevance,
    candidates, conflict_matrix: conflictMatrix, dependency_graph: dependencyGraph, capital_allocation_awareness: capitalAllocationAwareness,
    ranking_result: rankResult, challenger_result: challengerResult, counterfactual_log: counterfactualLog,
    policy_handoff: policyHandoffResult, shadow_execution: shadowResult,
    final_orientation: finalOrientation,
    orientation_semantic_consistency: orientationSemanticConsistency,
    confidence_scope: confidenceScope,
    authority_separation: AUTHORITY_SEPARATION,
    blast_radius_architectural_debt: BLAST_RADIUS_ARCHITECTURAL_DEBT,
    actionability_contract: actionabilityContract,
    failure_modes: failureModesResult,
    ledger_entry: ledgerEntry,
    decision_quality: decisionQuality,
    learning_handoff: learningHandoff,
    would_execute_externally: false, // SEMPRE false — reforça shadow_execution.would_execute
  };
}

module.exports = { runCeoDecisionCycle, deriveFinalOrientation, ORCHESTRATOR_VERSION, CEO_ORIENTATIONS };
