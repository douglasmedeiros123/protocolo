'use strict';

/**
 * buildProductLearningPackage() — item 54. Interface FUTURA — só gera o pacote real quando o
 * produto for de fato encerrado (productEnded=true, passado explicitamente por quem chama).
 * Nunca gera um "pacote de encerramento" de um produto que ainda está em validação.
 */
function buildProductLearningPackage({ productEnded = false, productId, testedLevers, hypotheses, economics } = {}) {
  if (!productEnded) {
    return { available: false, reason: 'produto não foi encerrado — product_learning_package só é gerado quando o produto de fato termina (item 54).' };
  }
  return {
    available: true,
    product_id: productId,
    tested_levers: testedLevers ?? [],
    successful_hypotheses: (hypotheses || []).filter((h) => h.status === 'STRONG' || h.status === 'SUPPORTED'),
    failed_hypotheses: (hypotheses || []).filter((h) => h.status === 'INVALIDATED' || h.status === 'CONTRADICTED'),
    creative_learnings: (hypotheses || []).filter((h) => h.category === 'CREATIVE'),
    cro_learnings: (hypotheses || []).filter((h) => h.category === 'CRO'),
    offer_learnings: (hypotheses || []).filter((h) => h.category === 'OFFER' || h.category === 'AOV'),
    media_learnings: (hypotheses || []).filter((h) => h.category === 'MEDIA_BUYING'),
    economics: economics ?? null,
    customer_signals: 'NOT_AVAILABLE — nenhum agente de sinal de cliente implementado ainda.',
    unresolved_questions: [],
    cross_product_candidates: [],
  };
}

// item 55 — Product Discovery não existe ainda. Interface preparada, retorna NOT_AVAILABLE.
function buildNextProductCandidates() {
  return { candidates: [], status: 'NOT_AVAILABLE', reason: 'Product Discovery Agent não implementado ainda (item 55).' };
}

// item 56 — Portfolio Allocator não existe ainda. Estrutura preparada, não implementada.
function buildPortfolioPlaceholder() {
  return {
    products: [], capital_allocation: 'NOT_AVAILABLE', expected_return: 'NOT_AVAILABLE',
    risk: 'NOT_AVAILABLE', confidence: null, status: 'NOT_IMPLEMENTED',
    reason: 'Portfolio Allocator não implementado ainda — este produto único é toda a "carteira" hoje (item 56).',
  };
}

module.exports = { buildProductLearningPackage, buildNextProductCandidates, buildPortfolioPlaceholder };
