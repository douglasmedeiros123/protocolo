'use strict';

// CREATIVE HYPOTHESIS (PASSO 8, item 11) — formato "Se alterarmos X, esperamos Y porque Z."
// EXPECTED_DIRECTIONS documenta o vocabulário aceito pro sentido esperado da métrica.
const EXPECTED_DIRECTIONS = ['INCREASE', 'DECREASE'];

function buildCreativeHypothesis({ variableChanged, metricExpectedToMove, reason, expectedDirection }) {
  if (!variableChanged) throw new Error('variableChanged é obrigatório — toda hipótese de criativo precisa dizer o que está mudando.');
  if (!EXPECTED_DIRECTIONS.includes(expectedDirection)) throw new Error(`expectedDirection inválido: ${expectedDirection}. Use ${EXPECTED_DIRECTIONS.join(' ou ')}.`);

  return {
    variable_changed: variableChanged,
    metric_expected_to_move: metricExpectedToMove,
    reason,
    expected_direction: expectedDirection,
    statement: `Se alterarmos ${variableChanged}, esperamos que ${metricExpectedToMove} ${expectedDirection === 'INCREASE' ? 'aumente' : 'diminua'} porque ${String(reason).replace(/\.+$/, '')}.`,
  };
}

module.exports = { buildCreativeHypothesis, EXPECTED_DIRECTIONS };
