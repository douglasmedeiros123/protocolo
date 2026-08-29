'use strict';

const { classifyActionSemantics } = require('./actionSemantics');

// item 7 — Decision Candidate Contract. UNKNOWN permanece UNKNOWN — nenhum EV/VOI/probabilidade
// é inventado. Candidatos são gerados a partir de outputs REAIS de agentes já existentes, nunca
// duplicando a lógica deles.
let candidateCounter = 0;
function resetCandidateCounter() { candidateCounter = 0; }

function buildCandidateContract({
  sourceAgent, actionClass, hypothesis, evidence = [], dependencies = [], expectedUpside = 'UNKNOWN',
  expectedDownside = 'UNKNOWN', ev = 'UNKNOWN', voi = 'NOT_ASSESSABLE', capitalRequired = 'UNKNOWN',
  timeToSignal = 'UNKNOWN', reversibility = 'UNKNOWN', blastRadius = 'UNKNOWN', measurementRequirements = [],
  confidence = 'NOT_ASSESSABLE', risk = 'UNKNOWN', strategicFit = 'UNKNOWN', northStarRelation = 'UNKNOWN',
}) {
  candidateCounter += 1;
  const candidate = {
    candidate_id: `CEO-CAND-${String(candidateCounter).padStart(4, '0')}`,
    source_agent: sourceAgent, action_class: actionClass, hypothesis, evidence, dependencies,
    expected_upside: expectedUpside, expected_downside: expectedDownside, ev, voi,
    capital_required: capitalRequired, time_to_signal: timeToSignal, reversibility, blast_radius: blastRadius,
    measurement_requirements: measurementRequirements, confidence, risk, strategic_fit: strategicFit,
    north_star_relation: northStarRelation,
  };
  // item 5-6 (PASSO 15.1) — classificação semântica real, derivada do candidato já montado
  // (nunca do domínio que ele descreve).
  candidate.action_semantics = classifyActionSemantics(candidate);
  return candidate;
}

/**
 * generateRealCandidates() — item 7/17. Gera candidatos reais a partir do stateContract já
 * construído (globalStateContract.js) — nunca inventa candidatos hipotéticos além do que os
 * agentes reais já produziram.
 */
function generateRealCandidates(stateContract) {
  resetCandidateCounter();
  const { planner, measurement, strategy_search, execution } = stateContract.data;
  const candidates = [];

  // candidato 1 — sempre disponível: não fazer nada de novo neste ciclo.
  const holdCapital = buildCandidateContract({
    sourceAgent: 'CEO_BASELINE', actionClass: 'HOLD_CAPITAL', hypothesis: 'nenhuma ação nova é executada neste ciclo — capital permanece em reserva.',
    evidence: [], dependencies: [], expectedUpside: 0, expectedDownside: 0, ev: 0, voi: 'NOT_ASSESSABLE',
    capitalRequired: 0, timeToSignal: 'NOT_APPLICABLE', reversibility: 'REVERSIBLE', blastRadius: 'SINGLE_ASSET',
    confidence: 'HIGH', risk: 'LOW', strategicFit: 'NEUTRAL', northStarRelation: 'NONE',
  });
  candidates.push(holdCapital);

  // candidato 2 — resolver o blocker de mensuração real (MUST_HAVE_BEFORE_TEST do Measurement).
  const mustHave = measurement.analysis.recommendation.must_have_before_test[0];
  let exposureIdentityCandidate = null;
  if (mustHave) {
    exposureIdentityCandidate = buildCandidateContract({
      sourceAgent: 'MEASUREMENT', actionClass: 'COLLECT_EVIDENCE',
      hypothesis: `registrar prospectivamente qual arquitetura está live (${mustHave.debt_id}: ${mustHave.description}) resolve EXPOSURE_IDENTITY.`,
      evidence: [`measurement_debt=${mustHave.debt_id}`, `current_blocker=${measurement.analysis.current_measurement_capital_gate.current_blocker}`],
      dependencies: [], expectedUpside: 'UNKNOWN', expectedDownside: 0, ev: 'UNKNOWN', voi: 'HIGH',
      capitalRequired: 0, // registro operacional leve, nunca instrumentação de evento/GTM/Pixel (mesmo achado do PASSO 13.1)
      timeToSignal: 'IMMEDIATE', reversibility: 'REVERSIBLE', blastRadius: 'SINGLE_ASSET',
      measurementRequirements: ['EXPOSURE_IDENTITY'], confidence: 'HIGH', risk: 'LOW',
      strategicFit: 'ENABLES_EXPERIMENT_ATTRIBUTION', northStarRelation: 'INDIRECT_PREREQUISITE',
    });
    candidates.push(exposureIdentityCandidate);
  }

  // candidato 3 — a ação real proposta pelo Execution Layer (MVA test do vencedor do Strategy Search).
  if (execution.proposed) {
    const action = execution.action;
    candidates.push(buildCandidateContract({
      sourceAgent: 'STRATEGY_SEARCH', actionClass: 'START_EXPERIMENT', hypothesis: action.requested_change,
      evidence: [`strategy_search_confidence=${strategy_search.analysis.recommendation.confidence}`, `winner_architecture_id=${action.target_state.architecture_id}`],
      dependencies: exposureIdentityCandidate ? [exposureIdentityCandidate.candidate_id] : [], // real: capital_gate do vencedor tem o MESMO current_blocker
      expectedUpside: 'UNKNOWN', expectedDownside: 'UNKNOWN', ev: 'UNKNOWN', voi: 'HIGH',
      capitalRequired: action.capital_required, timeToSignal: 'UNKNOWN', reversibility: action.reversibility,
      blastRadius: execution.dry_run.affected_scope, measurementRequirements: [execution.dry_run.current_measurement_blocker].filter(Boolean),
      confidence: action.confidence, risk: execution.dry_run.risk_level, strategicFit: strategy_search.analysis.recommendation.recommendation_type,
      northStarRelation: 'DIRECT_TEST_TOWARD_TARGET',
    }));
  }

  // candidato 4 — próxima ação estratégica do Planner (custo zero, resolve confundidor técnico).
  const plannerAction = planner.best_next_strategic_action;
  if (plannerAction && plannerAction.action) {
    const plannerVoi = /^ALTO/i.test(plannerAction.information_value || '') ? 'HIGH' : /^MÉDIO|^MEDIO/i.test(plannerAction.information_value || '') ? 'MEDIUM' : /^BAIXO/i.test(plannerAction.information_value || '') ? 'LOW' : 'NOT_ASSESSABLE';
    candidates.push(buildCandidateContract({
      sourceAgent: 'PLANNER', actionClass: 'COLLECT_EVIDENCE', hypothesis: plannerAction.decision_it_can_change,
      evidence: [`decision_relevance=${plannerAction.decision_relevance}`, `information_value_detail=${plannerAction.information_value}`], dependencies: plannerAction.dependency_unlock || [],
      expectedUpside: 'UNKNOWN', expectedDownside: 0, ev: 'UNKNOWN', voi: plannerVoi,
      capitalRequired: plannerAction.capital_required, timeToSignal: 'UNKNOWN', reversibility: 'REVERSIBLE',
      blastRadius: 'SINGLE_ASSET', confidence: 'MEDIUM', risk: 'LOW', strategicFit: 'RESOLVES_TECHNICAL_CONFOUNDER',
      northStarRelation: 'INDIRECT_PREREQUISITE',
    }));
  }

  return candidates;
}

module.exports = { buildCandidateContract, resetCandidateCounter, generateRealCandidates };
