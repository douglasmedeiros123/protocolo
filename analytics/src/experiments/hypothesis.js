'use strict';

/**
 * Toda hipótese segue o formato fixo "Se fizermos X, esperamos que Y melhore porque Z" —
 * força quem cria o experimento a articular a mudança, a métrica-alvo e o motivo (baseado em
 * dado real), em vez de uma frase solta. `render()` monta a frase final pra leitura humana.
 */
function buildHypothesis({ change, expectedImprovement, reason }) {
  if (!change || !expectedImprovement || !reason) {
    throw new Error('Hipótese incompleta: precisa de change (X), expectedImprovement (Y) e reason (Z, baseado em dado real).');
  }
  return {
    change,
    expectedImprovement,
    reason,
    statement: `Se ${change}, esperamos que ${expectedImprovement} porque ${reason}.`,
  };
}

module.exports = { buildHypothesis };
