'use strict';

const { checkPriorLearning } = require('../learning/checkPriorLearning');

// PRIOR LEARNING (PASSO 10, item 29) — reusa o Learning Engine (nunca duplica lógica).
// category varia (AOV pra otimização de componente existente, OFFER pra nova monetização —
// ver candidateGenerator.js item 42); mechanism = variable_changed. Product-scoped (nunca
// "bump de R$29 sempre funciona" — sempre product_id + contexto, ver item 44).
function checkOfferPriorLearning({ productId, category, targetMetric, variableChanged }, hypotheses) {
  return checkPriorLearning(
    { product_id: productId, category, target_metric: targetMetric, mechanism: variableChanged },
    hypotheses
  );
}

module.exports = { checkOfferPriorLearning };
