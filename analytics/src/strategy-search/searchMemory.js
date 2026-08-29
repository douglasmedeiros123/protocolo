'use strict';

const { loadHypotheses } = require('../learning/registry');
const { classifyEvidenceGapBlocking } = require('./evidenceGapBlocking');

/**
 * buildStrategySearchMemory() — items 80-82. Lê o Memory/Learning Engine SÓ por leitura.
 * product-specific por padrão (item 80/81) — nunca promove aprendizado pra global/outro produto
 * automaticamente. Hoje, sem nenhuma arquitetura testada de verdade ainda, tudo fica vazio —
 * honesto, não inventado.
 */
function buildStrategySearchMemory({ productId, architectures }) {
  const hypotheses = loadHypotheses();
  const productHypotheses = hypotheses.filter((h) => h.product_id === productId);

  return {
    previous_architectures: [], // nenhum registro anterior de strategy-search existia antes deste PASSO
    tested_architectures: architectures.filter((a) => a.status === 'TESTING' || a.status === 'SUPPORTED' || a.status === 'INVALIDATED').map((a) => a.architecture_id),
    invalidated_architectures: architectures.filter((a) => a.status === 'INVALIDATED').map((a) => a.architecture_id),
    supported_architectures: architectures.filter((a) => a.status === 'SUPPORTED').map((a) => a.architecture_id),
    related_product_hypotheses: productHypotheses.length,
    cross_product_candidates: [], // item 81 — nunca promovido automaticamente
    note: 'product-specific por padrão (item 80) — cross-product só vira candidato explícito futuramente (item 81), nunca automático.',
  };
}

// items 99-100 (PASSO 12) — se a recomendação depende de algo que não sabemos sobre cliente/
// mercado, gera o gap explícito em vez de inventar a resposta. PASSO 12.3, item 1-2: cada gap
// carrega sua classificação de bloqueio real (evidenceGapBlocking.js) — nunca bloqueia o teste
// só por "seria melhor saber".
function buildCustomerAndMarketEvidenceGaps(architecture) {
  const gaps = [];
  if (['QUIZ', 'APPLICATION'].includes(architecture.family)) {
    gaps.push({ type: 'CUSTOMER_EVIDENCE_GAP', question: `Que perguntas de qualificação são realmente relevantes pro cliente deste produto? Não sabemos ainda (item 99) — Customer Intelligence Agent não implementado.` });
  }
  if (['ADVERTORIAL', 'CONTENT_TO_OFFER', 'ORGANIC_TO_OFFER'].includes(architecture.family)) {
    gaps.push({ type: 'MARKET_EVIDENCE_GAP', question: `Qual é o nível de sofisticação/consciência real deste mercado específico? Não sabemos ainda (item 100) — Market Intelligence Agent não implementado.` });
  }
  return gaps.map((g) => ({ ...g, ...classifyEvidenceGapBlocking(g) }));
}

module.exports = { buildStrategySearchMemory, buildCustomerAndMarketEvidenceGaps };
