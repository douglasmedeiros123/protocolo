'use strict';

const { IDENTIFIER_SPINE_NAMES } = require('./enums');

/**
 * buildIdentifierSpine() — item 18-19. Cada identificador real (nunca inventado) com
 * availability/source/persistence/scope/joinability/known_gaps, a partir do platformAudit real.
 */
function buildIdentifierSpine(platform) {
  const utmAvailable = false; // item 12/28 do audit real — nenhum UTM propagado ao checkout
  const table = {
    utm_source: { availability: 'NOT_AVAILABLE', source: 'nenhum — link de checkout Hotmart é estático', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['nenhuma lógica de passthrough de UTM da LP pro checkout encontrada no bundle (item 12/28)'] },
    utm_medium: { availability: 'NOT_AVAILABLE', source: 'idem utm_source', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['idem utm_source'] },
    utm_campaign: { availability: 'NOT_AVAILABLE', source: 'idem utm_source', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['idem utm_source'] },
    utm_content: { availability: 'NOT_AVAILABLE', source: 'idem utm_source', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['idem utm_source'] },
    utm_term: { availability: 'NOT_AVAILABLE', source: 'idem utm_source', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['idem utm_source'] },
    meta_click_id: { availability: 'NEEDS_RUNTIME_VALIDATION', source: 'fbclid, se capturado por um pixel injetado via GTM — não confirmável estaticamente', persistence: 'UNKNOWN', scope: 'session (se existir)', joinability: 'UNKNOWN', known_gaps: ['nenhum código de captura de fbc/fbp encontrado no repo'] },
    session_id: { availability: 'NOT_AVAILABLE', source: 'nenhum sistema de sessão web próprio identificado no repo', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['sem session_id, não há como ligar comportamento web a uma transação específica'] },
    anonymous_visitor_id: { availability: 'NEEDS_RUNTIME_VALIDATION', source: 'cookies de GA4/Clarity podem gerar um, mas não é lido/persistido em nenhum pipeline deste repo', persistence: 'UNKNOWN', scope: 'UNKNOWN', joinability: 'NOT_AVAILABLE', known_gaps: ['nunca chega ao pipeline de dados — mesmo se existir no navegador'] },
    customer_id: { availability: 'PARTIAL', source: 'Hotmart buyer_name/ucode (existe dentro da Hotmart, não cross-domínio)', persistence: 'permanente dentro da Hotmart', scope: 'transação/comprador Hotmart', joinability: 'NOT_AVAILABLE fora da Hotmart', known_gaps: ['sem stitching com identidade do lado ad/web'] },
    lead_id: { availability: 'NOT_AVAILABLE', source: 'nenhum sistema de captura de lead implementado hoje (produto é venda direta)', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: ['LEAD_CAPTURED nunca observado na arquitetura atual'] },
    transaction_id: { availability: 'CONFIRMED', source: 'Hotmart transaction_id por venda real', persistence: 'permanente', scope: 'transação', joinability: 'alta dentro da Hotmart, nula com Meta (sem ad_id na Hotmart)', known_gaps: ['nunca aparece do lado Meta — join Meta<->Hotmart é sempre probabilístico'] },
    experiment_id: { availability: 'PARTIAL', source: 'experiments/registry.js — existe como schema, sem experimento real de arquitetura concluído', persistence: 'por experimento', scope: 'experimento', joinability: 'NOT_AVAILABLE (nenhuma sessão/transação real vinculada ainda)', known_gaps: ['interface pronta, dado real ainda não existe'] },
    variant_id: { availability: 'NOT_AVAILABLE', source: 'nenhum sistema de variante A/B real rodando hoje', persistence: 'NOT_APPLICABLE', scope: 'NOT_APPLICABLE', joinability: 'NOT_APPLICABLE', known_gaps: [] },
    creative_id: { availability: 'CONFIRMED', source: 'Meta ad_id/ad_name por linha do Insights', persistence: 'permanente (Meta)', scope: 'anúncio', joinability: 'nula com Hotmart (sem ad_id na Hotmart)', known_gaps: ['atribuição financeira por criativo permanece NOT_AVAILABLE mesmo com creative_id real disponível'] },
    ad_id: { availability: 'CONFIRMED', source: 'Meta Insights API (collectors/meta.js)', persistence: 'permanente (Meta)', scope: 'anúncio/dia', joinability: 'nula com Hotmart', known_gaps: [] },
    adset_id: { availability: 'CONFIRMED', source: 'Meta Insights API', persistence: 'permanente (Meta)', scope: 'conjunto de anúncios/dia', joinability: 'nula com Hotmart', known_gaps: [] },
    campaign_id: { availability: 'CONFIRMED', source: 'Meta Insights API', persistence: 'permanente (Meta)', scope: 'campanha/dia', joinability: 'nula com Hotmart', known_gaps: [] },
    product_id: { availability: 'CONFIRMED', source: 'config/product.js resolveProductId()', persistence: 'permanente', scope: 'produto', joinability: 'alta (todo o pipeline usa o mesmo id)', known_gaps: [] },
  };
  const missing = IDENTIFIER_SPINE_NAMES.filter((n) => !table[n]);
  if (missing.length > 0) throw new Error(`Identifier spine incompleto: ${missing.join(', ')}`);
  return { identifiers: table, utm_continuity_available: utmAvailable, source: platform ? 'derivado do platformAudit real + normalizadores existentes' : 'estático' };
}

module.exports = { buildIdentifierSpine };
