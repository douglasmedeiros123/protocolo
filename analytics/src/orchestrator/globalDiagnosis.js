'use strict';

const { resolveConflict } = require('./sourceOfTruthHierarchy');
const { buildClaimTemporalStatus, buildSupersessionExplanation } = require('./claimTemporalStatus');

// item 4-5 — diagnóstico global estruturado + restrição dominante. A pergunta certa nunca é
// "qual agente tem maior score" — é "qual restrição impede maior progresso econômico agora".
// Derivado do estado real consumido em globalStateContract.js, nunca hardcoded.

/**
 * detectCrossAgentConflicts() — item 3/8. Achado real e recorrente deste sistema: Planner
 * (scale_gate/tracking_assessment) usa um label "FINANCIAL_TRUTH=DEGRADED" herdado da lógica
 * antiga (decision/trackingAssessment.js, que mistura ruído de PLATFORM_ATTRIBUTION com a
 * própria Hotmart), enquanto o Measurement Agent (PASSO 13.1, especializado e mais recente
 * nesta claim específica) reporta FINANCIAL_TRANSACTION_TRUTH=RELIABLE — porque separou
 * corretamente as duas saúdes. Resolvido pela hierarquia de fonte de verdade: Measurement é a
 * autoridade MAIS PRÓXIMA da fonte pra essa claim específica (scope+freshness+evidence_quality
 * maiores) — Planner não é ignorado, só não vence este conflito específico.
 */
function detectCrossAgentConflicts({ plannerScaleGateReason, measurementFinancialTruthStatus, plannerGeneratedAt, measurementGeneratedAt }) {
  const conflicts = [];
  const plannerSaysDegraded = /FINANCIAL_TRUTH=DEGRADED/.test(plannerScaleGateReason || '');
  if (plannerSaysDegraded && measurementFinancialTruthStatus === 'RELIABLE') {
    const resolution = resolveConflict([
      { origin_domain: 'PLANNER_TRACKING_ASSESSMENT', claim: 'FINANCIAL_TRUTH=DEGRADED', evidence_quality: 'MEDIUM', scope: 'LOW', freshness: 'LOW', confidence: 'MEDIUM', causal_strength: 'LOW' },
      { origin_domain: 'MEASUREMENT_FINANCIAL_TRUTH', claim: 'FINANCIAL_TRANSACTION_TRUTH=RELIABLE', evidence_quality: 'HIGH', scope: 'HIGH', freshness: 'HIGH', confidence: 'HIGH', causal_strength: 'HIGH' },
    ]);

    // PASSO 15.1, item 1-4 — origem auditada: planner/trackingScopes.js (PASSO 11.1) usa uma
    // definição de FINANCIAL_TRUTH que MISTURA ruído de PLATFORM_ATTRIBUTION com a própria
    // Hotmart (statusFromConfidence() sobre assessTracking().confidence_score) — o próprio
    // código documenta isso como debt arquitetural, antecipando o Measurement Agent que hoje
    // existe (PASSO 13/13.1) e resolveu a separação corretamente. NÃO é um valor cacheado/
    // histórico (o Planner recalcula a cada execução sobre dado real) — é uma METODOLOGIA DE
    // LABEL superada (opção B do audit: estado atual, label/definição antiga), nunca um cache
    // stale no sentido de timestamp velho. STALE != FALSE — o Planner não está errado
    // historicamente, só usa uma definição de "DEGRADED" que a Measurement Agent superou.
    const plannerClaimTemporal = buildClaimTemporalStatus({ source: 'PLANNER_TRACKING_ASSESSMENT', observedAt: plannerGeneratedAt || null, referencePeriod: null, supersededBy: 'MEASUREMENT_FINANCIAL_TRUTH' });
    const measurementClaimTemporal = buildClaimTemporalStatus({ source: 'MEASUREMENT_FINANCIAL_TRUTH', observedAt: measurementGeneratedAt || null, referencePeriod: null, supersededBy: null });
    const supersession = buildSupersessionExplanation({
      historicalClaim: { source: 'PLANNER_TRACKING_ASSESSMENT', claim: 'FINANCIAL_TRUTH=DEGRADED' },
      currentClaim: { source: 'MEASUREMENT_FINANCIAL_TRUTH', claim: 'FINANCIAL_TRANSACTION_TRUTH=RELIABLE' },
      reason: 'planner/trackingScopes.js (PASSO 11.1) usa uma definição de FINANCIAL_TRUTH anterior à separação FINANCIAL_TRUTH_HEALTH/PLATFORM_ATTRIBUTION_HEALTH feita pelo Measurement Agent (PASSO 13.1) — a própria origem do código documenta isso como debt arquitetural antecipado, nunca um bug silencioso.',
    });

    conflicts.push({
      domain_a: 'PLANNER', claim_a: 'scale_gate bloqueado citando FINANCIAL_TRUTH=DEGRADED',
      domain_b: 'MEASUREMENT', claim_b: 'FINANCIAL_TRANSACTION_TRUTH=RELIABLE (PASSO 13.1, separação de saúdes)',
      resolution,
      real_finding: true,
      root_cause_audit: {
        classification: 'STALE_LABELING_METHODOLOGY', // nem A nem C puros — a claim é recomputada sobre dado real a cada execução (nunca um cache/artifact histórico), mas usa uma DEFINIÇÃO/metodologia de "DEGRADED" que o Measurement Agent (mais específico) já superou.
        source_file: 'analytics/src/planner/trackingScopes.js',
        self_documented_debt: true, // o próprio arquivo já documenta essa limitação desde o PASSO 11.1, antecipando o Measurement Agent
        planner_not_modified: true, // fora do write boundary deste PASSO — só auditado
      },
      claim_a_temporal_status: plannerClaimTemporal,
      claim_b_temporal_status: measurementClaimTemporal,
      supersession_explanation: supersession,
      note: 'conflito real detectado nesta execução, não sintético — Measurement prevalece pra esta claim específica pela hierarquia de fonte de verdade (nunca votação). Planner NUNCA é chamado de "errado" — sua claim é SUPERSEDED_FOR_CURRENT_DECISION, preservada como válida historicamente (item 3).',
    });
  }
  return conflicts;
}

function classifyProfitabilityState(plan) {
  return { status: plan.current_state.profit_status.status, financial_roas: plan.current_state.financial_roas, target_roas: plan.north_star.target_roas, gap_to_next_milestone: plan.current_state.milestone_progress.gap_to_next_milestone, reason: plan.current_state.profit_status.reason };
}

function classifyExperimentState(plannerResult) {
  const completed = plannerResult.switch_gate.criteria.completed_experiments;
  return { completed_experiments: completed.status === 'FAIL' ? 0 : null, hypothesis_space_status: plannerResult.hypothesis_space_status.status, key_levers_explored: plannerResult.switch_gate.criteria.key_levers_explored };
}

/**
 * deriveDominantConstraint() — item 4. Árvore de prioridade documentada (nunca hardcoda a
 * resposta atual): financial truth comprometida > blocker de mensuração sistêmico (afeta
 * QUALQUER experimento, não só um lever) > evidência insuficiente > viabilidade de produto >
 * capital/autoridade > outros levers estruturais.
 */
function deriveDominantConstraint(stateContract, correctedFinancialTruthStatus) {
  const { planner, measurement, execution } = stateContract.data;

  if (correctedFinancialTruthStatus === 'BLOCKED') {
    return { category: 'ECONOMICS', reason: 'FINANCIAL_TRANSACTION_TRUTH (Measurement, fonte mais confiável pra esta claim) está BLOCKED — nenhum progresso econômico é interpretável até restaurar isso. Vence qualquer outra restrição.' };
  }

  const currentBlocker = measurement.analysis.current_measurement_capital_gate.current_blocker;
  const winnerBlocker = measurement.analysis.strategy_handoff.found ? measurement.analysis.strategy_handoff.capital_gate.current_blocker : null;
  const systemicMeasurementBlocker = currentBlocker != null && currentBlocker === winnerBlocker;
  if (systemicMeasurementBlocker) {
    return {
      category: 'MEASUREMENT',
      reason: `current_blocker=${currentBlocker} aparece IGUAL no capital_gate da arquitetura atual E do vencedor real do Strategy Search — não é um problema de um lever específico, é sistêmico: bloqueia a capacidade de atribuir outcome financeiro a QUALQUER experimento (Creative/CRO/Offer/Architecture), porque nenhum tem como linkar exposição->resultado sem isso. Dominante sobre INSUFFICIENT_EVIDENCE porque é a causa raiz — resolver isso é pré-requisito pra qualquer evidência nova contar.`,
    };
  }

  const completedExperimentsFail = planner.switch_gate.criteria.completed_experiments.status === 'FAIL';
  if (completedExperimentsFail && planner.hypothesis_space_status.status === 'LARGELY_UNEXPLORED') {
    return { category: 'INSUFFICIENT_EVIDENCE', reason: `${planner.switch_gate.criteria.completed_experiments.reason} hypothesis_space_status=LARGELY_UNEXPLORED — sem mensuração bloqueando (measurement não é sistêmico agora), a restrição real é simplesmente não ter evidência real acumulada ainda.` };
  }

  if (execution.authority_posture_recommendation && execution.authority_posture_recommendation.recommended_tier === 'TIER_0_ANALYZE_ONLY') {
    return { category: 'CAPITAL', reason: 'autoridade de execução em TIER_0 (nenhum capital autônomo real) — mesmo com evidência/mensuração ok, nenhuma ação real pode ser executada sem revisão humana em cada passo.' };
  }

  return { category: 'UNKNOWN', reason: 'nenhum critério estrutural documentado identificou uma restrição dominante clara com o estado atual — nunca inventado.' };
}

function buildGlobalDiagnosis(stateContract) {
  const { planner, measurement, strategy_search, execution } = stateContract.data;
  const financialTruth = measurement.analysis.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH;

  const crossAgentConflicts = detectCrossAgentConflicts({
    plannerScaleGateReason: planner.scale_gate.reason,
    measurementFinancialTruthStatus: financialTruth.status,
    plannerGeneratedAt: planner.plan.created_at,
    measurementGeneratedAt: measurement.analysis.created_at,
  });

  const dominantConstraint = deriveDominantConstraint(stateContract, financialTruth.status);

  return {
    economic_state: { financial_roas: planner.plan.current_state.financial_roas, target_roas: planner.plan.north_star.target_roas, roas_gap_percent: planner.plan.north_star.roas_gap_percent, known_path_to_target: planner.known_path_to_target },
    profitability_state: classifyProfitabilityState(planner.plan),
    measurement_state: {
      financial_truth_health: financialTruth.status, // corrigido, nunca o label antigo do Planner
      platform_attribution_health: measurement.analysis.source_of_truth_matrix.PLATFORM_ATTRIBUTION.status,
      current_architecture_capital_gate: measurement.analysis.current_measurement_capital_gate.state,
      current_blocker: measurement.analysis.current_measurement_capital_gate.current_blocker,
    },
    experiment_state: classifyExperimentState(planner),
    product_viability_state: { verdict: planner.plan.verdict, verdict_confidence: planner.plan.verdict_confidence, viability_status: planner.plan.viability_status },
    strategy_state: { winner_architecture_id: strategy_search.analysis.recommendation.recommended_architecture_id, recommendation_type: strategy_search.analysis.recommendation.recommendation_type, confidence: strategy_search.analysis.recommendation.confidence },
    capital_state: { authority_tier: execution.authority_posture_recommendation ? execution.authority_posture_recommendation.recommended_tier : 'UNKNOWN', capital_posture: planner.capital_posture.posture },
    execution_state: { policy_result: execution.dry_run ? execution.dry_run.policy_result.final_result : null, circuit_breaker_state: execution.dry_run ? execution.dry_run.circuit_breaker_state : null, would_execute_externally: execution.would_execute_externally },
    learning_state: { hypothesis_space_status: planner.hypothesis_space_status.status, lever_exhaustion_score: planner.lever_exhaustion_score.score },
    cross_agent_conflicts: crossAgentConflicts,
    dominant_constraint: dominantConstraint,
  };
}

module.exports = { buildGlobalDiagnosis, deriveDominantConstraint, detectCrossAgentConflicts };
