'use strict';

const { ATTRIBUTION_LAYERS } = require('./enums');

/**
 * buildAttributionLayerAssessment() — item 20-21. As 8 camadas nunca se substituem
 * automaticamente — cada uma tem sua própria fonte, status e confiança, derivadas do
 * source-of-truth matrix real (nunca reafirmadas do zero).
 */
function buildAttributionLayerAssessment(sourceOfTruthDomains) {
  const layers = {
    PLATFORM_ATTRIBUTION: { basis_domain: 'PLATFORM_ATTRIBUTION', status: sourceOfTruthDomains.PLATFORM_ATTRIBUTION.status, confidence: sourceOfTruthDomains.PLATFORM_ATTRIBUTION.confidence, note: 'alegação da Meta sobre uma conversão — nunca confirmação financeira (item 2).' },
    SESSION_ATTRIBUTION: { basis_domain: 'WEB_BEHAVIOR', status: 'NOT_AVAILABLE', confidence: 'NOT_ASSESSABLE', note: 'sem session_id real no pipeline (identifierSpine) — não há como ligar uma sessão específica a um evento downstream.' },
    TRANSACTION_ATTRIBUTION: { basis_domain: 'FINANCIAL_TRANSACTION_TRUTH', status: sourceOfTruthDomains.FINANCIAL_TRANSACTION_TRUTH.status, confidence: sourceOfTruthDomains.FINANCIAL_TRANSACTION_TRUTH.confidence, note: 'transaction_id real da Hotmart — verdade financeira, não verdade de origem de tráfego.' },
    EXPERIMENT_ATTRIBUTION: { basis_domain: 'EXPERIMENT_ATTRIBUTION', status: sourceOfTruthDomains.EXPERIMENT_ATTRIBUTION.status, confidence: sourceOfTruthDomains.EXPERIMENT_ATTRIBUTION.confidence, note: 'interface pronta, nenhum experimento real de arquitetura concluído ainda.' },
    CREATIVE_ATTRIBUTION: { basis_domain: 'CREATIVE_ATTRIBUTION', status: sourceOfTruthDomains.CREATIVE_ATTRIBUTION.status, confidence: sourceOfTruthDomains.CREATIVE_ATTRIBUTION.confidence, note: 'performance por criativo é real; ligação financeira criativo->venda não é.' },
    CAMPAIGN_ATTRIBUTION: { basis_domain: 'CAMPAIGN_ATTRIBUTION', status: sourceOfTruthDomains.CAMPAIGN_ATTRIBUTION.status, confidence: sourceOfTruthDomains.CAMPAIGN_ATTRIBUTION.confidence, note: 'mesmo limite estrutural de CREATIVE_ATTRIBUTION, em nível de campanha.' },
    LIFECYCLE_ATTRIBUTION: { basis_domain: 'LIFECYCLE_ATTRIBUTION', status: sourceOfTruthDomains.LIFECYCLE_ATTRIBUTION.status, confidence: sourceOfTruthDomains.LIFECYCLE_ATTRIBUTION.confidence, note: 'não implementado.' },
    CROSS_PLATFORM_RECONCILIATION: { basis_domain: 'CROSS_PLATFORM_RECONCILIATION', status: sourceOfTruthDomains.CROSS_PLATFORM_RECONCILIATION.status, confidence: sourceOfTruthDomains.CROSS_PLATFORM_RECONCILIATION.confidence, note: 'reconciliação agregada dia-a-dia real (measurement/reconciliation.js) — nunca por transação individual.' },
  };
  const missing = ATTRIBUTION_LAYERS.filter((l) => !layers[l]);
  if (missing.length > 0) throw new Error(`Attribution layers incompletas: ${missing.join(', ')}`);
  return { layers, rule: 'nenhuma camada substitui automaticamente outra — PLATFORM_ATTRIBUTION != CROSS_PLATFORM_RECONCILIATION (item 2).' };
}

module.exports = { buildAttributionLayerAssessment };
