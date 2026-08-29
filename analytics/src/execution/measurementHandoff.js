'use strict';

const { analyzeMeasurement } = require('../measurement/builder');

// item 14A.15 — adapter read-only sobre o Measurement Agent real (PASSO 13/13.1). Nunca duplica
// a lógica de measurement — só extrai os campos relevantes pra uma decisão de execução.
function pullMeasurementSignals({ productId, dataDir, referenceDate, subjectId } = {}) {
  const result = analyzeMeasurement({ productId, dataDir, referenceDate });
  const a = result.analysis;
  const isWinner = a.strategy_handoff.found && (subjectId == null || subjectId === a.strategy_handoff.winner_architecture_id);
  const isCurrent = subjectId == null || subjectId === a.current_architecture_id;

  const subjectCapitalGate = isWinner ? a.strategy_handoff.capital_gate : isCurrent ? a.current_measurement_capital_gate : null;
  const subjectSafetySignal = isWinner ? a.strategy_handoff.execution_safety_signal : isCurrent ? a.current_execution_safety_signal : null;
  const subjectAnomalies = isWinner ? a.strategy_handoff.anomaly_findings : isCurrent ? a.current_anomaly_findings : [];

  return {
    financial_truth_health: { status: a.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.status, confidence: a.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.confidence },
    platform_attribution_health: { status: a.source_of_truth_matrix.PLATFORM_ATTRIBUTION.status, confidence: a.source_of_truth_matrix.PLATFORM_ATTRIBUTION.confidence },
    reconciliation_health: { status: a.source_of_truth_matrix.CROSS_PLATFORM_RECONCILIATION.status, match_rate: a.reconciliation.match_rate },
    capital_gate: subjectCapitalGate,
    execution_safety_signal: subjectSafetySignal,
    anomalies: subjectAnomalies,
    current_blocker: subjectCapitalGate ? subjectCapitalGate.current_blocker : null,
    winner_architecture_id: a.strategy_handoff.winner_architecture_id,
    current_architecture_id: a.current_architecture_id,
    must_have_before_test: a.recommendation.must_have_before_test,
    generated_at: result.generated_at,
    source: 'measurement/builder.js analyzeMeasurement() — leitura direta, nunca duplicada.',
  };
}

module.exports = { pullMeasurementSignals };
