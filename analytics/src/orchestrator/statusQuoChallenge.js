'use strict';

const { STATUS_QUO_CHALLENGE_CONCLUSIONS } = require('./enums');

// item 13 — desafia a estrutura inteira, nunca privilegia o produto atual só porque existe
// código/ativos/histórico. Deriva a conclusão do estado real — nunca hardcoda KEEP_CURRENT_PRODUCT.
function challengeStatusQuo(diagnosis) {
  const { product_viability_state, profitability_state, economic_state, capital_state } = diagnosis;

  if (product_viability_state.viability_status === 'INSUFFICIENT_EVIDENCE') {
    return {
      conclusion: 'KEEP_CURRENT_PRODUCT', // não por privilégio — por FALTA de evidência suficiente pra qualquer alternativa
      reason: `viability_status=INSUFFICIENT_EVIDENCE, verdict=${product_viability_state.verdict} — não é privilégio ao produto atual: é que NENHUMA alternativa (CHANGE_OFFER/CHANGE_FUNNEL/SWITCH_PRODUCT/etc.) tem evidência real suficiente pra ser recomendada em vez do que já existe. A conclusão seria a mesma se o produto fosse novo — o critério é evidência, não histórico/sunk cost.`,
      privileged_by_sunk_cost: false,
    };
  }

  if (economic_state.known_path_to_target.status === 'NO_KNOWN_PATH' && profitability_state.status === 'LOSS') {
    return {
      conclusion: 'HOLD_CAPITAL',
      reason: 'sem caminho conhecido pro North Star e em prejuízo — nem escalar o que existe nem trocar de produto tem evidência suficiente ainda; reter capital até acumular evidência é a conclusão estrutural, não status quo por inércia.',
      privileged_by_sunk_cost: false,
    };
  }

  if (capital_state.authority_tier === 'TIER_0_ANALYZE_ONLY') {
    return { conclusion: 'HOLD_CAPITAL', reason: 'TIER_0 — nenhuma mudança estrutural real (oferta/funil/preço/produto) pode ser executada autonomamente de qualquer forma.', privileged_by_sunk_cost: false };
  }

  return { conclusion: 'KEEP_CURRENT_PRODUCT', reason: 'nenhum critério estrutural documentado indicou mudança — nunca por privilégio ao histórico, sempre por ausência de evidência suficiente pra alternativa melhor.', privileged_by_sunk_cost: false };
}

module.exports = { challengeStatusQuo, STATUS_QUO_CHALLENGE_CONCLUSIONS };
