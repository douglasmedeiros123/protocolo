'use strict';

// OFFER DIAGNOSTICS (PASSO 10, item 20) — causal_status nunca VALIDATED sem experimento real.
// "upsell inexistente" vira MISSING_MONETIZATION_LAYER (uma lacuna OBSERVADA), nunca uma
// afirmação de que resolveria o problema (item 21).
const HIGH_REFUND_THRESHOLD = 0.05; // documentado: acima de 5% do bruto, sinalizamos pra atenção (não "ruim" por padrão externo, é o próprio limiar de proteção de capital do produto)

function buildOfferDiagnostics({ productId, offerId, economics, aovDecomposition, componentRefundRates, buyerAttribution }) {
  const diagnostics = [];

  diagnostics.push({
    diagnostic_id: 'OFFER-DIAG-REVENUE-CONCENTRATION',
    product_id: productId, offer_id: offerId,
    observation: `Produto principal contribui ${aovDecomposition.components.main_product_contribution != null ? (aovDecomposition.components.main_product_contribution / aovDecomposition.gross_aov * 100).toFixed(1) : '?'}% do AOV bruto; order bump contribui ${aovDecomposition.components.order_bump_contribution_gross != null ? (aovDecomposition.components.order_bump_contribution_gross / aovDecomposition.gross_aov * 100).toFixed(1) : '?'}%.`,
    affected_layer: 'BUMP_ATTACH',
    diagnostic_type: 'ECONOMIC_OPPORTUNITY',
    severity: 'MEDIUM',
    confidence: economics.buyers >= 10 ? 70 : 40,
    evidence: { main_product_contribution: aovDecomposition.components.main_product_contribution, order_bump_contribution_gross: aovDecomposition.components.order_bump_contribution_gross, buyers: economics.buyers },
    possible_causes: ['Attach rate do bump pode ter espaço de crescimento.', 'Preço/copy do bump pode não estar otimizado.', 'Nenhuma camada de monetização pós-compra existe ainda (upsell/downsell/bundle).'],
    causal_status: 'OBSERVED',
    recommended_investigation: 'Ver MISSING_MONETIZATION_LAYER e candidates de otimização do bump atual — nenhuma causa específica confirmada ainda.',
  });

  diagnostics.push({
    diagnostic_id: 'OFFER-DIAG-MISSING-MONETIZATION-LAYER',
    product_id: productId, offer_id: offerId,
    observation: 'Nenhum bundle, upsell ou downsell real existe hoje — a monetização pós-compra é NOT_IMPLEMENTED (ver sourceOfTruth.js).',
    affected_layer: 'POST_PURCHASE_UPSELL',
    diagnostic_type: 'MISSING_MONETIZATION_LAYER',
    severity: 'MEDIUM',
    confidence: 100, // fato estrutural, verificável — nenhum componente desse tipo existe
    evidence: { confirmed_active_bumps_count: 2, upsell_active: false, downsell_active: false, bundle_active: false },
    possible_causes: ['Estratégia futura ainda não implementada (item 8 — PLANNED).', 'Pode ou não valer a pena — impacto ainda é hipótese, nunca confirmado.'],
    causal_status: 'OBSERVED', // a AUSÊNCIA é observada; o IMPACTO de preenchê-la seria HYPOTHESIZED, nunca afirmado aqui
    recommended_investigation: 'Ver candidates EXPLORE (upsell/bundle) — nenhuma conclusão de que isso "resolveria" o ROAS.',
  });

  if (economics.refund_rate != null && economics.refund_rate > HIGH_REFUND_THRESHOLD) {
    diagnostics.push({
      diagnostic_id: 'OFFER-DIAG-REFUND-RATE',
      product_id: productId, offer_id: offerId,
      observation: `refund_rate real do período: ${(economics.refund_rate * 100).toFixed(2)}% (${economics.refunds_count} refund(s) em ${economics.buyers} compradores) — acima do limiar de atenção (${(HIGH_REFUND_THRESHOLD * 100).toFixed(0)}%).`,
      affected_layer: 'REFUND',
      diagnostic_type: 'HIGH_REFUND',
      severity: economics.refunds_count <= 1 ? 'LOW' : 'MEDIUM', // amostra pequena (1 refund) -> severidade baixa, não dramatizar
      confidence: economics.refunds_count <= 2 ? 30 : 60, // amostra pequena = baixa confiança de que é um padrão
      evidence: { refunds_count: economics.refunds_count, refund_rate: economics.refund_rate, component_refund_rates: componentRefundRates },
      possible_causes: ['Amostra pequena (1 refund) pode não representar um padrão real.', 'Refund concentrado no produto principal, não no bump (ver component_refund_rates).'],
      causal_status: 'OBSERVED',
      recommended_investigation: 'Acompanhar refund_rate em períodos maiores antes de tratar como padrão — 1 evento não é evidência suficiente (SUPPORTED exigiria mais observações).',
    });
  }

  const ba = buyerAttribution || {};
  diagnostics.push({
    diagnostic_id: 'OFFER-DIAG-BUMP-BUYER-GRANULARITY',
    product_id: productId, offer_id: offerId,
    observation: `order_bump_attach_rate (${economics.order_bump_attach_rate != null ? (economics.order_bump_attach_rate * 100).toFixed(1) + '%' : '?'}) é um proxy no nível de TRANSAÇÃO (linhas de bump / pedidos financeiros). No nível de comprador único, a ligação estrutural (mesmo transaction_id-base do checkout) confirma ${ba.buyers_with_bump ?? '?'} comprador(es) de ${ba.unique_main_buyers_eligible ?? '?'} elegíveis (buyer_level_attach_rate = ${ba.buyer_level_attach_rate != null ? (ba.buyer_level_attach_rate * 100).toFixed(1) + '%' : 'null'}), com ${ba.bump_transactions_without_structural_link ?? '?'} transação(ões) de bump sem ligação estrutural confirmada (status: ${ba.buyer_level_attach_rate_status || 'desconhecido'}).`,
    affected_layer: 'BUMP_ATTACH',
    diagnostic_type: 'DATA_GAP',
    severity: 'LOW',
    confidence: 100,
    evidence: { order_bumps_count: economics.order_bumps_count, buyers: economics.buyers, buyer_level_attach_rate: ba.buyer_level_attach_rate, buyer_level_attach_rate_status: ba.buyer_level_attach_rate_status, bump_transactions_without_structural_link: ba.bump_transactions_without_structural_link },
    possible_causes: ['Nem toda transação de bump carrega um transaction_id com sufixo de pedido-base (C1/C2) que permita ligação estrutural direta ao comprador.'],
    causal_status: 'OBSERVED',
    recommended_investigation: 'Ver offer/buyerAttribution.js — ligação via buyer_name+data é reportada como sinal heurístico, nunca promovida a fato buyer-level confirmado (PASSO 10.1, item 3).',
  });

  // PASSO 10.1, item 11 — flag explícita quando a atribuição buyer-level não é total. NÃO
  // prejudica métricas de receita agregada (essas continuam confiáveis) — só afeta candidatos/
  // hipóteses que dependem diretamente do attach rate buyer-level (ver candidateGenerator.js).
  if (ba.buyer_level_attach_rate_status && ba.buyer_level_attach_rate_status !== 'ATTRIBUTED_STRUCTURAL' && ba.buyer_level_attach_rate_status !== 'NO_BUMP_TRANSACTIONS') {
    diagnostics.push({
      diagnostic_id: 'OFFER-DIAG-BUMP-BUYER-ATTRIBUTION-FLAG',
      product_id: productId, offer_id: offerId,
      observation: ba.buyer_level_attach_rate_status === 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL'
        ? 'Nenhuma transação de bump pôde ser ligada estruturalmente a um comprador do produto principal — buyer_level_attach_rate é null (NOT_ATTRIBUTABLE_AT_BUYER_LEVEL).'
        : `Atribuição buyer-level parcial: ${ba.bump_transactions_without_structural_link} de ${ba.bump_transaction_count} transação(ões) de bump sem ligação estrutural confirmada — buyer_level_attach_rate (${(ba.buyer_level_attach_rate * 100).toFixed(1)}%) é um LIMITE INFERIOR, não o valor final.`,
      affected_layer: 'BUMP_ATTACH',
      diagnostic_type: 'DATA_GAP',
      severity: 'LOW',
      confidence: 100,
      evidence: { flag: 'BUMP_BUYER_ATTRIBUTION_UNAVAILABLE', status: ba.buyer_level_attach_rate_status, unlinked_count: ba.bump_transactions_without_structural_link },
      possible_causes: ['Estrutura de transaction_id do Hotmart nem sempre expõe o pedido-base compartilhado entre item principal e bump.'],
      causal_status: 'OBSERVED',
      recommended_investigation: 'Reduz confidence de hipóteses/candidatos cujo target_metric dependa diretamente de attach rate buyer-level — não afeta métricas de receita agregada (gross/net revenue, AOV), que permanecem confiáveis.',
    });
  }

  return diagnostics;
}

module.exports = { buildOfferDiagnostics, HIGH_REFUND_THRESHOLD };
