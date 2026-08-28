'use strict';

const { buildProductHypothesisKey } = require('./canonicalKey');
const { resolveProductId } = require('../../config/product');

// Limiar mínimo de confiança pra tratar uma hipótese SUPPORTED/STRONG como "suporte real" —
// abaixo disso, mesmo com status não-invalidado, a evidência ainda é fraca demais pra guiar
// decisão (evita "1 sucesso isolado com confidence baixa" virar luz verde precipitada).
const MIN_CONFIDENCE_FOR_SUPPORT = 50;

/**
 * checkPriorLearning() — NÃO bloqueia nada, só informa. Consulta o Hypothesis Registry (já
 * construído, ver hypothesisRegistry.js) pela chave PRODUCT-SCOPED de uma proposta de
 * experimento NOVA e devolve um dos 5 veredictos pedidos. A busca é sempre dentro do mesmo
 * produto (product_id resolvido via config/product.js se não informado) — nunca compara contra
 * evidência de outro produto (PASSO 6.1, item 5).
 *
 * @param {object} proposedFields  { product_id?, category, target_metric, mechanism, context, funnel_stage, asset_type }
 * @param {array}  hypotheses      analytics/data/learning/hypotheses.json já carregado
 */
function checkPriorLearning(proposedFields, hypotheses) {
  const productId = resolveProductId(proposedFields);
  const key = buildProductHypothesisKey(productId, proposedFields);
  const entry = hypotheses.find((h) => h.product_hypothesis_key === key);

  if (!entry) {
    return { verdict: 'NO_PRIOR_EVIDENCE', product_hypothesis_key: key, entry: null };
  }
  if (entry.status === 'INVALIDATED') {
    return { verdict: 'PREVIOUSLY_INVALIDATED', product_hypothesis_key: key, entry };
  }
  if (entry.status === 'CONTRADICTED') {
    return { verdict: 'CONTRADICTORY_EVIDENCE', product_hypothesis_key: key, entry };
  }
  if ((entry.status === 'SUPPORTED' || entry.status === 'STRONG') && entry.current_confidence >= MIN_CONFIDENCE_FOR_SUPPORT) {
    return { verdict: 'SUPPORTING_EVIDENCE', product_hypothesis_key: key, entry };
  }
  return { verdict: 'INSUFFICIENT_EVIDENCE', product_hypothesis_key: key, entry };
}

module.exports = { checkPriorLearning, MIN_CONFIDENCE_FOR_SUPPORT };
