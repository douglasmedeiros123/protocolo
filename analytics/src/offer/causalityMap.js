'use strict';

// CAUSALITY MAP DA OFERTA (PASSO 10, item 18-19) — VALID/WEAK/INVALID + DIRECT/INDIRECT
// documentado, nunca opinião de IA no momento do cálculo. CTR de anúncio nunca é alvo válido
// pra variável de oferta (fora do controle da economia da transação — isso é Creative/CRO).
const OFFER_CAUSAL_MAP = {
  BUMP_PRICE: { bump_attach_rate: 'VALID', net_aov: 'VALID', financial_roas: 'WEAK' },
  BUMP_COPY: { bump_attach_rate: 'VALID' },
  BUNDLE_DISCOUNT: { bundle_attach_rate: 'VALID', net_aov: 'VALID', ctr: 'INVALID' },
  UPSELL_PRICE: { upsell_take_rate: 'VALID', net_revenue_per_buyer: 'VALID' },
  UPSELL_OFFER_DESIGN: { upsell_take_rate: 'VALID' },
  DOWNSELL_PRICE: { downsell_take_rate: 'VALID', net_revenue_per_buyer: 'WEAK' },
  GUARANTEE: { refund_rate: 'WEAK', ctr: 'INVALID' },
  MAIN_PRICE: { financial_roas: 'WEAK', net_aov: 'VALID' }, // preço real não é alterado por este agente — só modelado
};

// DIRECT vs INDIRECT (item 19) — a variável de oferta afeta a métrica IMEDIATA do próprio
// componente diretamente; qualquer métrica agregada de negócio (financial_roas) é sempre
// INDIRECT (a oferta influencia, mas mídia/CPA também pesam — nunca "este bump causará ROAS 3").
const DIRECT_METRICS = ['bump_attach_rate', 'bundle_attach_rate', 'upsell_take_rate', 'downsell_take_rate'];
const INDIRECT_METRICS = ['net_aov', 'net_revenue_per_buyer', 'financial_roas', 'refund_rate'];

// Experimentos reais mais antigos (ex: AOV-001) e o Profit Engine usam nomes de métrica
// diferentes dos canônicos deste agente (ex: target_metric "order_bump_attach_rate" do
// Experiment Engine == "bump_attach_rate" aqui; "aov_liquido" == "net_aov"). Alias
// determinístico — nunca perde o dado por causa da nomenclatura ser de outra época (mesmo
// padrão usado em cro/causalityMap.js).
const METRIC_NAME_ALIASES = {
  order_bump_attach_rate: 'bump_attach_rate',
  aov_liquido: 'net_aov',
  cpa_financeiro: 'financial_roas',
  roas_financeiro: 'financial_roas',
};

function normalizeMetricName(targetMetric) {
  return METRIC_NAME_ALIASES[targetMetric] || targetMetric;
}

function resolveCausalDistance(targetMetric) {
  if (DIRECT_METRICS.includes(targetMetric)) return 'DIRECT';
  if (INDIRECT_METRICS.includes(targetMetric)) return 'INDIRECT';
  return 'INDIRECT'; // default conservador — nunca assume DIRECT sem estar catalogado
}

/**
 * validateOfferCausalTarget() (PASSO 10, item 18) — VALID/WEAK/INVALID. INVALID nunca entra no
 * ranking de candidatos.
 */
function validateOfferCausalTarget(variableChanged, targetMetric) {
  const entry = OFFER_CAUSAL_MAP[variableChanged];
  if (!entry) return { status: 'INVALID', causal_distance: null, reason: `Variável "${variableChanged}" não catalogada no causality map da oferta.` };
  const normalizedMetric = normalizeMetricName(targetMetric);
  const status = entry[normalizedMetric];
  const causalDistance = resolveCausalDistance(normalizedMetric);
  const metricLabel = `${targetMetric}${normalizedMetric !== targetMetric ? ` (normalizado: "${normalizedMetric}")` : ''}`;
  if (status === 'INVALID') return { status: 'INVALID', causal_distance: causalDistance, reason: `${variableChanged} não tem relação causal plausível com "${metricLabel}" (fora do controle da economia da oferta).` };
  if (!status) return { status: 'WEAK', causal_distance: causalDistance, reason: `Relação entre "${variableChanged}" e "${metricLabel}" não documentada explicitamente — tratada como fraca por padrão conservador.` };
  return { status, causal_distance: causalDistance, reason: `${variableChanged} -> ${metricLabel}: relação ${status === 'VALID' ? 'validada' : 'fraca'}, ${causalDistance === 'DIRECT' ? 'efeito direto no próprio componente' : 'efeito indireto — nunca a causa única de um resultado agregado como financial_roas'}.` };
}

module.exports = { OFFER_CAUSAL_MAP, DIRECT_METRICS, INDIRECT_METRICS, METRIC_NAME_ALIASES, normalizeMetricName, resolveCausalDistance, validateOfferCausalTarget };
