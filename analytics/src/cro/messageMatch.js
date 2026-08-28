'use strict';

const { loadAssets } = require('../creative/registry');

// CREATIVE -> LP MESSAGE MATCH (PASSO 9, itens 14-15) — integra com o Creative Intelligence
// Agent (analytics/data/creatives/assets.json, real, persistido no PASSO 8). Um criativo com
// bom sinal de aquisição (ATTENTION/TRAFFIC_EFFICIENCY fortes) mas INTENT fraco NÃO prova
// problema na LP — só levanta uma hipótese, entre várias possíveis. NUNCA
// MESSAGE_MATCH_IS_THE_CAUSE sem experimento.
function diagnoseMessageMatch(dir) {
  const assets = loadAssets(dir);
  const findings = [];

  for (const creative of assets) {
    if (!creative.sample_sufficient || !creative.performance_layers) continue;
    const attention = creative.performance_layers.ATTENTION?.classification;
    const traffic = creative.performance_layers.TRAFFIC_EFFICIENCY?.classification;
    const intent = creative.performance_layers.INTENT?.classification;

    const goodAcquisition = attention === 'STRONGER' || traffic === 'STRONGER';
    const weakIntent = intent === 'WEAKER';

    if (goodAcquisition && weakIntent) {
      const strongLayers = [attention === 'STRONGER' ? 'ATTENTION' : null, traffic === 'STRONGER' ? 'TRAFFIC_EFFICIENCY' : null].filter(Boolean);
      findings.push({
        finding_id: `CRO-MESSAGE-MATCH-${creative.creative_id}`,
        creative_id: creative.creative_id,
        observation: `${creative.creative_id} tem sinal de aquisição forte em ${strongLayers.join(' e ')} (ATTENTION=${attention}, TRAFFIC_EFFICIENCY=${traffic}) mas INTENT fraco (LPV->checkout WEAKER) — ver analytics/data/creatives/assets.json (Creative Intelligence Agent, PASSO 8).`,
        diagnostic_status: 'POSSIBLE_MESSAGE_MATCH_ISSUE',
        possible_causes: [
          'Tráfego menos qualificado (o criativo atrai clique, mas não necessariamente intenção real de compra).',
          'Promessa do anúncio diferente do que a LP entrega (descompasso de mensagem).',
          'Curiosidade sem intenção — o hook gera clique por curiosidade, não por identificação com o problema.',
          'Primeira dobra da LP fraca (hipótese já coberta em CRO-001).',
          'Prova/confiança insuficiente na LP antes da oferta.',
          'Outro fator não identificado — não é uma lista exaustiva.',
        ],
        never_conclude: 'MESSAGE_MATCH_IS_THE_CAUSE — isso só pode ser confirmado com um experimento real comparando o mesmo criativo contra versões diferentes de LP (creative/LP pair, ver buildCreativeLpPairs).',
      });
    }
  }

  return findings;
}

/**
 * CREATIVE-LP PAIR (PASSO 9, item 15) — estrutura o par pra análise futura (quando existir mais
 * de uma versão de LP). Hoje só existe LP-V1, então nenhum par tem dado comparativo real ainda
 * — os pares são preparados estruturalmente, sem atribuir causalidade nenhuma (nunca inventa
 * performance por par sem dado real desagregado por par, que não existe hoje).
 */
function buildCreativeLpPairs(creativeAssets, landingPageId) {
  return creativeAssets
    .filter((c) => c.sample_sufficient)
    .map((c) => ({
      pair_id: `${c.creative_id}+${landingPageId}`,
      creative_id: c.creative_id,
      landing_page_id: landingPageId,
      has_disaggregated_performance_data: false,
      note: 'Sem atribuição de performance por par criativo+LP hoje (não existe granularidade suficiente nos dados coletados) — estrutura preparada pra quando houver mais de uma versão de LP.',
    }));
}

module.exports = { diagnoseMessageMatch, buildCreativeLpPairs };
