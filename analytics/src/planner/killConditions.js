'use strict';

/**
 * buildStopKillConditions() — item 74. Cada nível (experiment/validation_cycle/product_validation)
 * só recebe um threshold real se configurado explicitamente — nunca inventado.
 */
function buildStopKillConditions({ experimentMaxLoss = null, validationCycleStopLoss = null, productValidationMaxSpend = null } = {}) {
  return {
    experiment: experimentMaxLoss != null
      ? { max_loss: experimentMaxLoss, reason: `parar o experimento se a perda acumulada ultrapassar ${experimentMaxLoss}.` }
      : { max_loss: 'NOT_CONFIGURED', reason: 'nenhum limite de perda por experimento configurado.' },
    validation_cycle: validationCycleStopLoss != null
      ? { stop_loss: validationCycleStopLoss, reason: `parar o ciclo de validação se a perda acumulada ultrapassar ${validationCycleStopLoss}.` }
      : { stop_loss: 'NOT_CONFIGURED', reason: 'nenhum stop-loss de ciclo configurado.' },
    product_validation: productValidationMaxSpend != null
      ? { max_spend: productValidationMaxSpend, reason: `reavaliar viabilidade do produto se o gasto total de validação ultrapassar ${productValidationMaxSpend} sem atingir os milestones esperados.` }
      : { max_spend: 'NOT_CONFIGURED', reason: 'nenhum teto de gasto de validação de produto configurado.' },
  };
}

/**
 * buildSwitchConditions() — item 75. Condições necessárias/recomendadas — reflete o switch gate
 * real (nunca duplica lógica própria). "alternative" fica UNKNOWN até existir Product Selection
 * Agent, conforme item 23.
 */
function buildSwitchConditions(switchGate) {
  return {
    conditions: [
      { condition: 'tracking suficiente', met: switchGate.criteria.tracking_sufficiency.status === 'PASS' },
      { condition: 'evidência mínima atingida (dados/experimentos/amostra)', met: switchGate.criteria.data_quality.status === 'PASS' && switchGate.criteria.minimum_evidence_volume.status === 'PASS' && switchGate.criteria.completed_experiments.status === 'PASS' },
      { condition: 'alavancas-chave adequadamente exploradas', met: switchGate.criteria.key_levers_explored.status === 'PASS' },
      { condition: 'gap econômico permanece implausível mesmo assim', met: switchGate.criteria.no_plausible_economic_path.status === 'PASS' },
      { condition: 'expected_value_of_continuing <= expected_value_of_switching (switching pode estar UNKNOWN — item 23)', met: switchGate.criteria.expected_value_of_continuing.status === 'PASS' },
    ],
    all_met: switchGate.eligible,
    note: 'switch_conditions espelha o switch gate real (evaluateSwitchProductGate) — nunca uma lógica paralela. A alternativa (produto B) permanece UNKNOWN até existir Product Selection Agent.',
  };
}

/**
 * buildScaleConditions() — espelha o scale gate real, mesmo princípio do switch_conditions acima.
 */
function buildScaleConditions(scaleGate) {
  return {
    status: scaleGate.status,
    reason: scaleGate.reason,
    marginal_return: scaleGate.marginal_return,
    note: 'scale_conditions espelha o scale gate real (evaluateScaleGate) — nunca uma lógica paralela.',
  };
}

module.exports = { buildStopKillConditions, buildSwitchConditions, buildScaleConditions };
