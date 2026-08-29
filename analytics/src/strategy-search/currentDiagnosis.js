'use strict';

const { loadDiagnostics: loadCroDiagnostics } = require('../cro/registry');
const { loadDiagnostics: loadOfferDiagnostics } = require('../offer/registry');

/**
 * buildCurrentArchitectureDiagnosis() — item 19. Consome Creative/CRO/Offer/Planner/Decision/
 * Memory SÓ por leitura — nunca duplica a lógica deles. planResult já é o resultado real e
 * completo do Strategic Planner (read-only, passado pelo chamador) — este módulo só extrai e
 * reorganiza o que é relevante pra uma decisão de ARQUITETURA (não de candidato individual).
 */
function buildCurrentArchitectureDiagnosis({ planResult, croDir, offerDir }) {
  const croDiagnostics = loadCroDiagnostics(croDir);
  const offerDiagnostics = loadOfferDiagnostics(offerDir);

  const structuralFriction = croDiagnostics.filter((d) => d.diagnostic_type === 'TECHNICAL_ISSUE' || d.diagnostic_type === 'FUNCTIONAL_FRICTION');
  const missingMonetization = offerDiagnostics.filter((d) => d.diagnostic_type === 'MISSING_MONETIZATION_LAYER');

  return {
    financial_roas: planResult.economics_snapshot.financials.roas_financeiro,
    financial_roas_gap_to_target: planResult.plan.target_state.target_roas - (planResult.economics_snapshot.financials.roas_financeiro ?? 0),
    known_path_to_target: planResult.known_path_to_target,
    hypothesis_space_status: planResult.hypothesis_space_status,
    lever_states: planResult.levers.map((l) => ({ lever_id: l.lever_id, state: l.current_state })),
    evidence_matrix: planResult.evidence_matrix,
    structural_friction_signals: structuralFriction.map((d) => ({ diagnostic_id: d.diagnostic_id, observation: d.observation, causal_status: d.causal_status, impact_confidence: d.impact_confidence })),
    missing_monetization_signals: missingMonetization.map((d) => ({ diagnostic_id: d.diagnostic_id, observation: d.observation })),
    verdict: planResult.plan.verdict,
    viability_status: planResult.plan.viability_status,
    capital_posture: planResult.plan.capital_posture,
    source: 'leitura read-only de planner/builder.js (analyzePlan) + cro/registry.js + offer/registry.js — nenhuma lógica duplicada dos agents.',
  };
}

module.exports = { buildCurrentArchitectureDiagnosis };
