'use strict';

const { minimumEvidenceFor } = require('../experiments/evidence');

// CREATIVE SCORE (PASSO 8, item 9 + PASSO 8.1, item 5) — 0-100, NUNCA só CTR e NUNCA passa
// falsa precisão: todo score vem com `score_basis` explícito dizendo com QUE tipo de dado foi
// calculado. 4 componentes, cada um normalizado 0-100 por MIN-MAX dentro do peer group. Pesos
// documentados, somam 1.0:
//
//   economics (40%)  : roas_marketing — PROXY de mídia (não existe financial_roas por
//                       criativo, ver performanceLayers.js FINANCIAL_ECONOMICS). Maior é melhor.
//   intent     (25%) : lpv_to_checkout_rate — a promessa do anúncio bateu com a LP? Maior é melhor.
//   traffic    (20%) : cost_per_lpv (invertido — MENOR custo é melhor)
//   sample     (15%) : volume de evidência (lpv/checkout) relativo ao minimum_evidence da
//                       categoria CREATIVE — satura em 100 quando 3x acima do mínimo.
const WEIGHTS = { economics: 0.40, intent: 0.25, traffic: 0.20, sample: 0.15 };

// Penalidade fixa aplicada à score_confidence (não ao creative_score) por não existir atribuição
// financeira real (Hotmart) por criativo — o score usa proxies de mídia, então a confiança nunca
// pode ser tão alta quanto seria com dado financeiro de verdade.
const NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP = 60;

// SCORE_BASIS (PASSO 8.1, item 5) — declara explicitamente com que tipo de dado o score foi
// calculado, pra nunca transmitir falsa precisão a quem consome:
//   FINANCIAL_AND_PLATFORM : existe atribuição financeira (Hotmart) E dado de mídia (Meta)
//   PARTIAL                : só atribuição financeira, sem dado de mídia completo
//   PLATFORM_ONLY          : só dado de mídia (Meta) — é o caso de TODO criativo hoje, porque
//                              não existe atribuição financeira por criativo neste pipeline
//   INSUFFICIENT           : amostra abaixo do minimum_evidence — score nem foi calculado
const SCORE_BASIS = ['FINANCIAL_AND_PLATFORM', 'PARTIAL', 'PLATFORM_ONLY', 'INSUFFICIENT'];

function resolveScoreBasis({ sampleSufficient, hasFinancialAttribution, hasPlatformData }) {
  if (!sampleSufficient) return 'INSUFFICIENT';
  if (hasFinancialAttribution && hasPlatformData) return 'FINANCIAL_AND_PLATFORM';
  if (hasFinancialAttribution) return 'PARTIAL';
  if (hasPlatformData) return 'PLATFORM_ONLY';
  return 'INSUFFICIENT';
}

function minMaxNormalize(value, values, higherIsBetter) {
  const valid = values.filter((v) => v != null);
  if (value == null || valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return 100; // só 1 valor distinto no grupo — nada pra comparar, vira 100
  const ratio = (value - min) / (max - min);
  return Math.round((higherIsBetter ? ratio : 1 - ratio) * 100);
}

function sampleScore(performance) {
  const min = minimumEvidenceFor('CREATIVE'); // { lpv: 30, checkouts: 5, ... }
  const lpvRatio = min.lpv ? Math.min(3, (performance.lpv || 0) / min.lpv) / 3 : 1;
  const checkoutRatio = min.checkouts ? Math.min(3, (performance.checkout || 0) / min.checkouts) / 3 : 1;
  return Math.round(((lpvRatio + checkoutRatio) / 2) * 100);
}

/**
 * @param {object} performance      do criativo sendo pontuado
 * @param {object[]} peerPerformances performance[] de TODO o peer group (inclui o próprio) — a
 *                                    normalização min-max precisa do conjunto inteiro.
 * @param {boolean} sampleSufficient já calculado fora (minimum_evidence CREATIVE)
 */
function computeCreativeScore(performance, peerPerformances, sampleSufficient = true) {
  const hasFinancialAttribution = performance.financial_revenue != null; // hoje sempre false — nunca inventado
  const hasPlatformData = performance.roas_marketing != null || performance.ctr != null;
  const score_basis = resolveScoreBasis({ sampleSufficient, hasFinancialAttribution, hasPlatformData });

  if (score_basis === 'INSUFFICIENT') {
    return {
      creative_score: null,
      score_confidence: 0,
      score_basis,
      confidence_reason: 'Amostra abaixo do minimum_evidence da categoria CREATIVE — score não calculado.',
      components: { economics: null, intent: null, traffic: null, sample: null },
      weights: WEIGHTS,
      formula: 'score = média ponderada de {economics, intent, traffic, sample}, cada um normalizado 0-100 por min-max dentro do peer group.',
    };
  }

  const economics = minMaxNormalize(performance.roas_marketing, peerPerformances.map((p) => p.roas_marketing), true);
  const intent = minMaxNormalize(performance.lpv_to_checkout_rate, peerPerformances.map((p) => p.lpv_to_checkout_rate), true);
  const traffic = minMaxNormalize(performance.cost_per_lpv, peerPerformances.map((p) => p.cost_per_lpv), false);
  const sample = sampleScore(performance);

  const components = { economics, intent, traffic, sample };
  const availableWeights = Object.entries(WEIGHTS).filter(([k]) => components[k] != null);
  const weightSum = availableWeights.reduce((s, [, w]) => s + w, 0);

  const creative_score = weightSum > 0
    ? Math.round(availableWeights.reduce((s, [k, w]) => s + components[k] * w, 0) / weightSum)
    : null;

  // score_confidence: parte do componente de amostra, capada quando score_basis não inclui
  // atribuição financeira (PLATFORM_ONLY/PARTIAL) — nunca fingimos alta confiança só com proxy.
  const confidenceCap = score_basis === 'FINANCIAL_AND_PLATFORM' ? 100 : NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP;
  const score_confidence = creative_score == null ? 0 : Math.min(sample, confidenceCap);

  return {
    creative_score,
    score_confidence,
    score_basis,
    confidence_reason: score_basis === 'FINANCIAL_AND_PLATFORM'
      ? 'Score calculado com atribuição financeira real — confiança não é capada por proxy de mídia.'
      : `Confiança capada em ${NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP} — score_basis=${score_basis} (sem atribuição financeira Hotmart por criativo, só proxies de mídia).`,
    components,
    weights: WEIGHTS,
    formula: 'score = média ponderada de {economics, intent, traffic, sample}, cada um normalizado 0-100 por min-max dentro do peer group; pesos redistribuídos proporcionalmente quando um componente está indisponível.',
  };
}

module.exports = { computeCreativeScore, minMaxNormalize, sampleScore, resolveScoreBasis, WEIGHTS, SCORE_BASIS, NO_FINANCIAL_ATTRIBUTION_CONFIDENCE_CAP };
