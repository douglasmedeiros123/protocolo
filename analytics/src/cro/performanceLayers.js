'use strict';

// CRO PERFORMANCE LAYERS (PASSO 9, item 12) — 6 camadas (ARRIVAL/FIRST_VIEW/ENGAGEMENT/INTENT/
// CHECKOUT_HANDOFF/SALE) + FINANCIAL_ECONOMICS. Diferente do Creative Agent (que compara N
// criativos entre si), aqui existe UMA LP só — não há peer group pra STRONGER/WEAKER. Cada
// camada reporta a métrica real disponível (ou null, explícito) + `influence_strength`
// documentado (o quanto essa camada plausivelmente pesa no resultado final, não é medido, é
// uma classificação estrutural do próprio funil — nunca usada cegamente, sempre com nota).
//
//   ARRIVAL           : click -> LPV (mede se o anúncio "entrega" quem clicou até a página)
//   FIRST_VIEW         : primeira dobra / compreensão inicial — sem medição comportamental
//                         direta hoje (Clarity indisponível na execução atual), avaliação só
//                         estrutural via HTML (ver diagnostics.js)
//   ENGAGEMENT          : scroll / tempo ativo — depende do Clarity (CURRENT_BEHAVIOR_SNAPSHOT)
//   INTENT              : LPV -> checkout — a métrica mais direta de "a LP convenceu"
//   CHECKOUT_HANDOFF     : saída da LP -> checkout — aqui o checkout é EXTERNO (Hotmart), fora
//                         do controle direto da LP (ver checkout_transition no CRO DNA)
//   SALE                : checkout -> Meta purchase — fricção final do lado Meta
//   FINANCIAL_ECONOMICS  : CPA/ROAS financeiro — sempre INDIRECT (a LP influencia, mas não
//                         determina sozinha; depende também de criativo, oferta, tráfego)
function diagnoseCroPerformanceLayers({ funnelMetrics, claritySnapshot, dnaCheckoutTransition }) {
  const claritySignal = claritySnapshot.status === 'AVAILABLE';

  return {
    ARRIVAL: {
      metric: 'click_to_lpv_rate',
      value: funnelMetrics.click_to_lpv_rate,
      sample_size: funnelMetrics.raw.clicks,
      influence_strength: 'MEDIUM',
      note: 'Depende de velocidade de carregamento e continuidade de payload entre o anúncio e a LP — problema técnico aqui derruba tudo o que vem depois.',
    },
    FIRST_VIEW: {
      metric: null,
      value: null,
      sample_size: null,
      influence_strength: 'HIGH',
      note: claritySignal
        ? 'Avaliação combinaria HTML estrutural + comportamento real do Clarity.'
        : 'Sem medição comportamental direta agora (Clarity indisponível nesta execução — ver claritySnapshot) — avaliação só estrutural via HTML (hero/headline/CTA visíveis sem scroll).',
    },
    ENGAGEMENT: {
      metric: claritySignal ? 'scroll_depth / active_time' : null,
      value: claritySignal ? claritySnapshot.behavior : null,
      sample_size: claritySignal ? claritySnapshot.sessions : null,
      influence_strength: 'HIGH',
      note: claritySignal ? 'Do CURRENT_BEHAVIOR_SNAPSHOT do Clarity — representa AGORA, não o período do funil histórico.' : 'Sem dado do Clarity disponível nesta execução.',
    },
    INTENT: {
      metric: 'lpv_to_checkout_rate',
      value: funnelMetrics.lpv_to_checkout_rate,
      sample_size: funnelMetrics.raw.lpv,
      influence_strength: 'HIGH',
      note: 'Métrica mais direta de "a LP convenceu quem chegou nela" — é o target_metric do CRO-001 real.',
    },
    CHECKOUT_HANDOFF: {
      metric: null,
      value: null,
      sample_size: null,
      influence_strength: 'MEDIUM',
      note: dnaCheckoutTransition
        ? `Checkout é EXTERNO (${dnaCheckoutTransition.type}) — a LP entrega o clique, mas a experiência de pagamento em si é da Hotmart, fora do controle direto deste agente.`
        : 'Tipo de checkout não confirmado no HTML.',
    },
    SALE: {
      metric: 'checkout_to_meta_purchase_rate',
      value: funnelMetrics.checkout_to_meta_purchase_rate,
      sample_size: funnelMetrics.raw.checkout,
      influence_strength: 'LOW',
      note: 'Meta Purchase != financial buyer real (Hotmart) — usar com cautela; é sinal de mídia, não confirmação financeira.',
    },
    FINANCIAL_ECONOMICS: {
      metric: 'financial_roas',
      value: funnelMetrics.financial_roas,
      sample_size: funnelMetrics.raw.orders_count,
      influence_strength: 'INDIRECT',
      note: 'A LP influencia o resultado financeiro, mas não o determina sozinha (criativo, oferta e tráfego também pesam) — nunca atribuído a uma seção específica.',
    },
  };
}

module.exports = { diagnoseCroPerformanceLayers };
