'use strict';

// PASSO 15.1, item 9 — confidence precisa de escopo explícito. HIGH em DECISION_CONFIDENCE
// (esta é a próxima ação correta) NUNCA implica HIGH em STRATEGY_CONFIDENCE (o advertorial vai
// funcionar), PRODUCT_VIABILITY_CONFIDENCE (o produto é viável) ou MEASUREMENT_CONFIDENCE (a
// medição está completa) — são 4 perguntas diferentes.
const CONFIDENCE_SCOPES = ['DECISION_CONFIDENCE', 'STRATEGY_CONFIDENCE', 'PRODUCT_VIABILITY_CONFIDENCE', 'MEASUREMENT_CONFIDENCE'];

/**
 * buildScopedConfidence() — item 9. Cada escopo vem de uma fonte real distinta — nunca um único
 * número genérico reutilizado pros 4.
 */
function buildScopedConfidence({ decisionConfidence, strategyConfidence, productViabilityConfidence, measurementConfidence }) {
  return {
    decision_confidence: decisionConfidence, // "esta é a próxima ação correta dado o que sabemos" — do ranking do CEO
    strategy_confidence: strategyConfidence, // do Strategy Search real (recommendation.confidence) — hoje LOW pro advertorial
    product_viability_confidence: productViabilityConfidence, // do Planner real (plan.verdict_confidence)
    measurement_confidence: measurementConfidence, // da saúde de measurement real (financial_truth_health/capital_gate)
    scopes: CONFIDENCE_SCOPES,
    warning: 'decision_confidence alta NUNCA deve ser lida como confiança na estratégia/viabilidade/medição em si — são 4 perguntas diferentes, cada uma com sua própria fonte real (item 9).',
  };
}

module.exports = { CONFIDENCE_SCOPES, buildScopedConfidence };
