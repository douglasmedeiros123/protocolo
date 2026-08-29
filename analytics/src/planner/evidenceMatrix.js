'use strict';

const { EVIDENCE_MATRIX_CATEGORIES } = require('./enums');

function leverToMatrixCell(lever) {
  if (!lever) return { state: 'UNKNOWN', confidence: null, supporting_evidence: [], contradictory_evidence: [], unknowns: ['lever não construído'] };
  const supporting = [];
  const contradictory = [];
  const unknowns = [];
  if (lever.completed_experiments > 0) supporting.push(`${lever.completed_experiments} experimento(s) concluído(s)`);
  if (lever.candidates_available > 0) supporting.push(`${lever.candidates_available} candidato(s) real(is) gerado(s)`);
  if (lever.current_state === 'EXHAUSTED') contradictory.push('alavanca marcada EXHAUSTED — candidatos causais válidos esgotados');
  if (lever.current_state === 'UNEXPLORED' || lever.current_state === 'UNKNOWN') unknowns.push('nenhuma evidência real coletada ainda nesta alavanca');
  return { state: lever.current_state, confidence: lever.confidence, supporting_evidence: supporting, contradictory_evidence: contradictory, unknowns };
}

/**
 * buildEvidenceMatrix() — item 47. Uma célula por categoria documentada, sempre com os 5 campos
 * pedidos. Nunca inventa supporting_evidence/contradictory_evidence — só cita o que é real.
 */
function buildEvidenceMatrix({ economicsSnapshot, levers = [], experimentCoverage, learningEvidence, hypothesisSpaceStatus }) {
  const criticalFlagsByDay = economicsSnapshot.critical_flags_by_day || [];
  const matrix = {};
  const findLever = (id) => levers.find((l) => l.lever_id === id);

  // DATA_QUALITY
  const dq = economicsSnapshot.period.data_completeness;
  matrix.DATA_QUALITY = {
    state: dq == null ? 'UNKNOWN' : (dq >= 0.95 ? 'GOOD' : dq >= 0.8 ? 'PARTIAL' : 'POOR'),
    confidence: dq,
    supporting_evidence: dq != null ? [`data_completeness=${dq} (${economicsSnapshot.period.days_found}/${economicsSnapshot.period.dates_requested} dias)`] : [],
    contradictory_evidence: economicsSnapshot.period.days_missing.length ? [`${economicsSnapshot.period.days_missing.length} dia(s) sem snapshot no período`] : [],
    unknowns: dq == null ? ['nenhum período analisado ainda'] : [],
  };

  // TRACKING
  const criticalCount = criticalFlagsByDay.length;
  matrix.TRACKING = {
    state: criticalCount === 0 ? 'GOOD' : 'CRITICAL_ISSUES_PRESENT',
    confidence: null,
    supporting_evidence: criticalCount === 0 ? ['nenhuma flag crítica de tracking no período'] : [],
    contradictory_evidence: criticalCount > 0 ? [`${criticalCount} dia(s) com flag crítica de tracking`] : [],
    unknowns: [],
  };

  matrix.CREATIVE = leverToMatrixCell(findLever('CREATIVE'));
  matrix.CRO = leverToMatrixCell(findLever('CRO'));
  matrix.OFFER = leverToMatrixCell(findLever('OFFER'));
  matrix.MEDIA_BUYING = leverToMatrixCell(findLever('MEDIA_BUYING'));

  // FINANCIAL_ECONOMICS
  matrix.FINANCIAL_ECONOMICS = {
    state: economicsSnapshot.profit_status,
    confidence: economicsSnapshot.financials.roas_financeiro != null ? economicsSnapshot.period.data_completeness : null,
    supporting_evidence: economicsSnapshot.financials.roas_financeiro != null ? [`financial ROAS real = ${economicsSnapshot.financials.roas_financeiro}`] : [],
    contradictory_evidence: economicsSnapshot.known_quantified_levers_close_gap === false ? ['cenários combinados já modelados (CPA-30%+AOV+30%) não fecham o gap pro ROAS 3'] : [],
    unknowns: economicsSnapshot.known_quantified_levers_close_gap == null ? ['cenário combinado real ainda não calculável'] : [],
  };

  // EXPERIMENT_COVERAGE
  matrix.EXPERIMENT_COVERAGE = {
    state: experimentCoverage.total_completed === 0 ? 'NONE_COMPLETED' : 'SOME_COMPLETED',
    confidence: null,
    supporting_evidence: experimentCoverage.total_completed > 0 ? [`${experimentCoverage.total_completed} experimento(s) concluído(s) de ${experimentCoverage.total_experiments}`] : [],
    contradictory_evidence: [],
    unknowns: experimentCoverage.total_draft > 0 ? [`${experimentCoverage.total_draft} experimento(s) ainda em DRAFT — não conta como testado`] : [],
  };

  // LEARNING_COVERAGE
  matrix.LEARNING_COVERAGE = {
    state: hypothesisSpaceStatus.status,
    confidence: null,
    supporting_evidence: learningEvidence.total_hypotheses > 0 ? [`${learningEvidence.total_hypotheses} hipótese(s) real(is) registrada(s)`] : [],
    contradictory_evidence: [],
    unknowns: learningEvidence.total_hypotheses === 0 ? ['nenhuma hipótese com resultado real registrada ainda'] : [],
  };

  for (const cat of EVIDENCE_MATRIX_CATEGORIES) {
    if (!matrix[cat]) matrix[cat] = { state: 'UNKNOWN', confidence: null, supporting_evidence: [], contradictory_evidence: [], unknowns: ['categoria não construída'] };
  }
  return matrix;
}

module.exports = { buildEvidenceMatrix };
