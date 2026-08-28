'use strict';

// CREATIVE PERFORMANCE LAYERS (PASSO 8, item 8 + PASSO 8.1, itens 3-4) — 5 camadas ACIONÁVEIS
// (ATTENTION/TRAFFIC_EFFICIENCY/INTENT/META_CONVERSION/PLATFORM_ECONOMICS) + 1 camada estrutural
// (FINANCIAL_ECONOMICS) que fica SEMPRE `NOT_ATTRIBUTABLE` até existir ligação confiável entre
// Meta e Hotmart no nível do criativo. NUNCA resumimos uma camada como "vencida" — cada
// diagnóstico é por MÉTRICA, e camadas com 2 métricas (META_CONVERSION) podem divergir e virar
// MIXED. Comparação é sempre relativa ao peer group (nunca um benchmark absoluto inventado).
const LAYERS = ['ATTENTION', 'TRAFFIC_EFFICIENCY', 'INTENT', 'META_CONVERSION', 'PLATFORM_ECONOMICS', 'FINANCIAL_ECONOMICS'];
const ACTIONABLE_LAYERS = ['ATTENTION', 'TRAFFIC_EFFICIENCY', 'INTENT', 'META_CONVERSION', 'PLATFORM_ECONOMICS'];

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * STRONGER/WEAKER puro (sem zona neutra) — os exemplos do PASSO 8.1 são diretos ("Creative 01
 * tem CTR maior"), então comparamos sem hedge: ratio >= 1 (ajustado pra "menor é melhor" quando
 * aplicável) = STRONGER, senão WEAKER. Empate exato (ratio==1) fica STRONGER por convenção
 * documentada (nunca WEAKER por padrão).
 */
function classifyMetric(value, peerValues, higherIsBetter) {
  const peerMedian = median(peerValues);
  if (value == null || peerMedian == null || peerMedian === 0) {
    return { classification: 'INSUFFICIENT_DATA', value, peer_median: peerMedian };
  }
  const ratio = value / peerMedian;
  const effectiveRatio = higherIsBetter ? ratio : 1 / ratio; // inverte pra "maior é sempre melhor" na comparação
  const classification = effectiveRatio >= 1 ? 'STRONGER' : 'WEAKER';
  return { classification, value, peer_median: peerMedian, ratio_to_peer_median: ratio };
}

/** Camada com 2 métricas que podem discordar (checkout->purchase rate e Meta CPA) -> MIXED. */
function diagnoseMetaConversion(performance, peerPerformances) {
  const purchaseRate = classifyMetric(performance.checkout_to_meta_purchase_rate, peerPerformances.map((p) => p.checkout_to_meta_purchase_rate), true);
  const metaCpa = classifyMetric(performance.meta_cpa, peerPerformances.map((p) => p.meta_cpa), false);

  const metrics = { checkout_to_meta_purchase_rate: purchaseRate, meta_cpa: metaCpa };
  if (purchaseRate.classification === 'INSUFFICIENT_DATA' || metaCpa.classification === 'INSUFFICIENT_DATA') {
    return { classification: 'INSUFFICIENT_DATA', metrics, note: 'checkout -> purchase (lado Meta) — fricção final de conversão. Uma das 2 métricas não tem dado suficiente.' };
  }
  const classification = purchaseRate.classification === metaCpa.classification ? purchaseRate.classification : 'MIXED';
  return {
    classification,
    metrics,
    note: classification === 'MIXED'
      ? 'checkout_to_meta_purchase_rate e meta_cpa apontam em direções diferentes — não resumir esta camada como vencida/perdida sem olhar as 2 métricas.'
      : 'checkout -> purchase (lado Meta) — fricção final de conversão.',
  };
}

function diagnosePerformanceLayers(performance, peerPerformances) {
  return {
    ATTENTION: { ...classifyMetric(performance.ctr, peerPerformances.map((p) => p.ctr), true), metric: 'ctr', note: 'CTR — capacidade do criativo de parar o scroll (thumbstop não é coletado hoje).' },
    TRAFFIC_EFFICIENCY: { ...classifyMetric(performance.cost_per_lpv, peerPerformances.map((p) => p.cost_per_lpv), false), metric: 'cost_per_lpv', note: 'click -> LPV — quanto custa levar quem clicou até a landing page.' },
    INTENT: { ...classifyMetric(performance.lpv_to_checkout_rate, peerPerformances.map((p) => p.lpv_to_checkout_rate), true), metric: 'lpv_to_checkout_rate', note: 'LPV -> checkout — a promessa do anúncio bate com o que a LP entrega?' },
    META_CONVERSION: diagnoseMetaConversion(performance, peerPerformances),
    PLATFORM_ECONOMICS: {
      ...classifyMetric(performance.roas_marketing, peerPerformances.map((p) => p.roas_marketing), true),
      metric: 'roas_marketing',
      note: 'ROAS atribuído pela Meta (PROXY de mídia) — NUNCA é financial_roas real. Ver FINANCIAL_ECONOMICS.',
    },
    // Estrutural, nunca calculado: não existe ligação confiável Meta<->Hotmart por criativo
    // ainda (Hotmart não recebe ad_id/UTM na transação). Fica sempre explícito, nunca omitido.
    FINANCIAL_ECONOMICS: {
      classification: 'NOT_ATTRIBUTABLE',
      value: null,
      peer_median: null,
      metric: 'financial_roas',
      note: 'Sem atribuição confiável Meta -> Hotmart no nível do criativo. Meta Purchase NUNCA deve ser tratado como buyer financeiro.',
    },
  };
}

module.exports = { LAYERS, ACTIONABLE_LAYERS, diagnosePerformanceLayers, classifyMetric, diagnoseMetaConversion, median };
