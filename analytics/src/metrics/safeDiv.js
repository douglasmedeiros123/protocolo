'use strict';

/** Divisão que nunca produz NaN/Infinity — retorna null quando o denominador é 0 ou inválido. */
function safeDiv(numerator, denominator) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number') return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

module.exports = { safeDiv };
