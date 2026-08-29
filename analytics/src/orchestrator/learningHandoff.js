'use strict';

// item 24 — quando outcome existir, o CEO NUNCA escreve "verdade global" diretamente. Só
// encaminha um pacote read-to-write pro Memory/Learning Engine existente (learning/registry.js)
// — nunca chama save* aqui (SHADOW_MODE: nenhuma escrita real de aprendizado acontece neste V1,
// só a preparação do pacote). product-specific != global automaticamente (mesma regra já usada
// pelo Strategy Search, strategySearchMemory.js).
function buildLearningHandoffPackage({ productId, ledgerEntry, decisionQuality, outcomeEvidence }) {
  if (!outcomeEvidence) {
    return { ready_to_forward: false, reason: 'nenhum outcome real disponível ainda — nada a encaminhar (item 24: nunca inventa evidência de outcome).' };
  }
  return {
    ready_to_forward: true,
    decision_context: { cycle_id: ledgerEntry.cycle_id, dominant_constraint: ledgerEntry.dominant_constraint, recommended_action: ledgerEntry.recommended_action },
    experiment_outcome_evidence: outcomeEvidence,
    confidence: ledgerEntry.confidence,
    causal_limitations: 'herda as mesmas limitações causais já documentadas em measurement/causalDiscipline.js (BEFORE_AFTER != CAUSAL_PROOF, etc.) — nunca reforçadas artificialmente aqui.',
    scope: 'PRODUCT_SPECIFIC', // nunca GLOBAL por padrão — promoção pra aprendizado global exigiria decisão explícita fora deste pacote (mesma regra do Strategy Search)
    product_id: productId,
    decision_quality_status: decisionQuality.status,
    forwarding_target: 'learning/registry.js (saveHypotheses/equivalente) — NÃO chamado por este módulo; só prepara o pacote (item 24, SHADOW_MODE).',
  };
}

module.exports = { buildLearningHandoffPackage };
