'use strict';

const { checkPriorLearning } = require('../learning/checkPriorLearning');

// PRIOR LEARNING (PASSO 9, item 18) — reusa o Learning Engine (nunca duplica lógica). category
// é sempre 'CRO'; mechanism = variable_changed. Product-scoped por natureza (buildProductHypothesisKey
// já garante isso — ver PASSO 6.1) — "Headline X aumentou LPV→checkout no Produto A" nunca vira
// "Headline X sempre funciona" (item 28).
function checkCroPriorLearning({ productId, targetMetric, variableChanged }, hypotheses) {
  return checkPriorLearning(
    { product_id: productId, category: 'CRO', target_metric: targetMetric, mechanism: variableChanged },
    hypotheses
  );
}

module.exports = { checkCroPriorLearning };
