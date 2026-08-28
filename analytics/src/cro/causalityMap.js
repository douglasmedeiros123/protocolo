'use strict';

// CAUSALITY MAP (PASSO 9, item 13) — mapa estrutural documentado, NUNCA opinião de IA no
// momento do cálculo: cada variável de CRO só é VALID pra métricas com relação causal
// plausível e direta. CHECKOUT_UX nunca entra como variável válida (checkout é da Hotmart,
// fora do controle da LP) — sempre INVALID, documentado no item 13.
const CRO_CAUSAL_MAP = {
  HEADLINE: { lpv_to_checkout_rate: 'VALID', click_to_lpv_rate: 'WEAK' },
  HERO: { lpv_to_checkout_rate: 'VALID', click_to_lpv_rate: 'WEAK' },
  CTA_VISIBILITY: { lpv_to_checkout_rate: 'VALID', checkout_to_meta_purchase_rate: 'WEAK' },
  PROOF: { lpv_to_checkout_rate: 'VALID' },
  GUARANTEE: { lpv_to_checkout_rate: 'VALID', checkout_to_meta_purchase_rate: 'WEAK' },
  PAGE_SPEED: { click_to_lpv_rate: 'VALID', lpv_to_checkout_rate: 'WEAK' },
  MOBILE_LAYOUT: { lpv_to_checkout_rate: 'VALID', click_to_lpv_rate: 'WEAK' },
  PRICE_PRESENTATION: { lpv_to_checkout_rate: 'VALID', checkout_to_meta_purchase_rate: 'WEAK' },
  // Fora do escopo da LP (Hotmart controla a experiência de checkout) — nunca um alvo causal
  // válido pra este agente, documentado explicitamente (item 13).
  CHECKOUT_UX: {},
};

// Experimentos reais mais antigos (ex: CRO-001) usam o nome de métrica em português do
// Experiment Engine (target_metric: "taxa_lpv_checkout"); os módulos novos deste PASSO usam o
// nome canônico em inglês (lpv_to_checkout_rate, ver funnelMetrics.js/performanceLayers.js).
// Alias determinístico — nunca perde o dado por causa da nomenclatura ser de outra época.
const METRIC_NAME_ALIASES = {
  taxa_lpv_checkout: 'lpv_to_checkout_rate',
  cpa_financeiro: 'financial_roas',
  roas_financeiro: 'financial_roas',
};

function normalizeMetricName(targetMetric) {
  return METRIC_NAME_ALIASES[targetMetric] || targetMetric;
}

const VARIABLE_NOTES = {
  HEADLINE: 'primeiros segundos de compreensão — afeta diretamente se quem chega entende a promessa antes de rolar a página.',
  HERO: 'primeira dobra inteira (headline + visual + CTA) — mesma lógica do HEADLINE, escopo maior.',
  CTA_VISIBILITY: 'se a chamada pra ação está visível sem esforço, afeta diretamente a intenção de avançar.',
  PROOF: 'evidência/prova social atua na decisão de avançar pro checkout, não na chegada à página.',
  GUARANTEE: 'redução de risco percebido — atua perto da decisão de compra, não na atenção inicial.',
  PAGE_SPEED: 'afeta principalmente se a pessoa chega a ver a página (bounce), pouca relação direta com a decisão de comprar em si.',
  MOBILE_LAYOUT: 'tráfego é majoritariamente mobile/in-app — problemas de layout mobile afetam toda a experiência pós-clique.',
  PRICE_PRESENTATION: 'como o preço é apresentado (parcelamento, ancoragem, desconto) afeta diretamente a decisão de avançar.',
  CHECKOUT_UX: 'checkout é servido pela Hotmart — fora do controle direto da LP.',
};

/**
 * validateCroCausalTarget() (PASSO 9, item 13) — VALID/WEAK/INVALID. Candidatos INVALID NUNCA
 * entram no ranking recomendado (filtrados no candidateGenerator.js); WEAK entra mas com
 * penalidade de confidence/priority.
 */
function validateCroCausalTarget(variableChanged, targetMetric) {
  const entry = CRO_CAUSAL_MAP[variableChanged];
  if (!entry) {
    return { status: 'INVALID', reason: `Variável "${variableChanged}" não catalogada no causality map — não é possível validar a relação causal.` };
  }
  if (variableChanged === 'CHECKOUT_UX') {
    return { status: 'INVALID', reason: `${VARIABLE_NOTES.CHECKOUT_UX} Não é um alvo causal válido pra este agente.` };
  }
  const normalizedMetric = normalizeMetricName(targetMetric);
  const status = entry[normalizedMetric];
  if (!status) {
    return { status: 'WEAK', reason: `Relação entre "${variableChanged}" e "${targetMetric}"${normalizedMetric !== targetMetric ? ` (normalizado: "${normalizedMetric}")` : ''} não documentada explicitamente no causality map — tratada como fraca por padrão conservador (nunca INVALID por omissão, nunca VALID sem estar catalogada).` };
  }
  return { status, reason: `${variableChanged} -> ${targetMetric}: ${VARIABLE_NOTES[variableChanged] || 'sem nota adicional.'}` };
}

module.exports = { CRO_CAUSAL_MAP, VARIABLE_NOTES, METRIC_NAME_ALIASES, normalizeMetricName, validateCroCausalTarget };
