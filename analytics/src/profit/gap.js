'use strict';

const { safeDiv } = require('../metrics/safeDiv');

/**
 * Distância até o ROAS-alvo, em dois caminhos INDEPENDENTES (nunca misturados):
 *  - CAMINHO CPA: quanto o CPA precisaria cair, mantendo o AOV como está.
 *  - CAMINHO AOV: quanto o AOV precisaria subir, mantendo o CPA como está.
 * Valores podem sair negativos de propósito — significa que aquele caminho sozinho já bate
 * ou passa da meta (ex: reduction_needed negativo = CPA atual já está abaixo do necessário).
 */
function computeGap(currentFinancials, targetRoas) {
  const { cpa_financeiro, aov_liquido, roas_financeiro } = currentFinancials;

  const cpa_path = (() => {
    if (aov_liquido == null || cpa_financeiro == null || cpa_financeiro === 0) {
      return { cpa_max_for_target: null, reduction_needed_value: null, reduction_needed_percent: null };
    }
    const cpa_max_for_target = aov_liquido / targetRoas;
    const reduction_needed_value = cpa_financeiro - cpa_max_for_target;
    const reduction_needed_percent = reduction_needed_value / cpa_financeiro;
    return { cpa_max_for_target, reduction_needed_value, reduction_needed_percent };
  })();

  const aov_path = (() => {
    if (cpa_financeiro == null || aov_liquido == null || aov_liquido === 0) {
      return { aov_min_for_target: null, increase_needed_value: null, increase_needed_percent: null };
    }
    const aov_min_for_target = cpa_financeiro * targetRoas;
    const increase_needed_value = aov_min_for_target - aov_liquido;
    const increase_needed_percent = increase_needed_value / aov_liquido;
    return { aov_min_for_target, increase_needed_value, increase_needed_percent };
  })();

  return {
    target_roas: targetRoas,
    current: { cpa_financeiro, aov_liquido, roas_financeiro },
    cpa_path,
    aov_path,
  };
}

module.exports = { computeGap };
