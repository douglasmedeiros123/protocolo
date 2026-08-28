'use strict';

const { checkPriorLearning } = require('../learning/checkPriorLearning');

// PRIOR LEARNING (PASSO 8, item 15) + CROSS-PRODUCT LEARNING (item 16) — reusa o Learning
// Engine já existente (nunca duplica a lógica de status/confidence). category é sempre
// 'CREATIVE'; mechanism = a variável que a nova geração está mudando (variable_changed), o
// mesmo campo que o Experiment Engine/Learning Engine já usam pra chave canônica de hipótese —
// isso é o que faz "hook" testado no Creative 05 comparável com "hook" testado em qualquer
// outro criativo do MESMO produto (a chave é product-scoped, nunca mistura produtos — ver
// PASSO 6.1, item 5).
function checkCreativePriorLearning({ productId, targetMetric, variableChanged }, hypotheses) {
  return checkPriorLearning(
    { product_id: productId, category: 'CREATIVE', target_metric: targetMetric, mechanism: variableChanged },
    hypotheses
  );
}

module.exports = { checkCreativePriorLearning };
