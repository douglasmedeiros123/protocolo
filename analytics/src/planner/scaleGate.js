'use strict';

// item 33 — thresholds documentados (não arbitrários/irresponsáveis): reusa os mesmos limiares
// já usados em profit/status.js (PROFITABLE >= 1.05, SCALE_CANDIDATE >= target) — nunca um novo
// número paralelo inventado só pro Planner.
const MIN_BUYERS_FOR_TEST_SCALE = 10;
const MIN_BUYERS_FOR_SCALE = 20; // amostra maior exigida pra escala definitiva (item 80: 1 dia bom != scale)
const MIN_DATA_COMPLETENESS = 0.8;

/**
 * evaluateScaleGate() — item 33. ROAS 3 não precisa ser o ÚNICO momento em que uma pequena
 * escala experimental pode acontecer (ELIGIBLE_FOR_TEST_SCALE em PROFITABLE já sustentável), mas
 * SCALE definitivo respeita os thresholds — nunca liberado por "um dia bom".
 */
function evaluateScaleGate({ economicsSnapshot, financialTruthStatus }) {
  const { financials, profit_status: profitStatus, roas3_gap: roas3Gap, period } = economicsSnapshot;

  // PASSO 11.1, item 25 — SCALE continua bloqueável por tracking, diferente de VALIDATE/MEASURE/
  // FIX (que nunca dependem de FINANCIAL_TRUTH). Aqui exigimos RELIABLE, não só "não-BLOCKED" —
  // escalar capital real é a decisão de MAIOR risco, então mesmo DEGRADED barra.
  if (financialTruthStatus === 'BLOCKED') {
    return { status: 'BLOCKED', reason: 'FINANCIAL_TRUTH=BLOCKED — a fonte de verdade financeira está comprometida, nenhuma decisão de escala pode se apoiar nela.', marginal_return: 'NOT_ESTIMABLE' };
  }
  if (financialTruthStatus === 'DEGRADED') {
    return { status: 'BLOCKED', reason: 'FINANCIAL_TRUTH=DEGRADED — escalar capital real exige confiança máxima na fonte de verdade financeira (diferente de VALIDATE/MEASURE/FIX, que não dependem disso).', marginal_return: 'NOT_ESTIMABLE' };
  }
  if (financials.roas_financeiro == null) {
    return { status: 'UNKNOWN', reason: 'financial ROAS indisponível no período.', marginal_return: 'NOT_ESTIMABLE' };
  }
  if (period.data_completeness != null && period.data_completeness < MIN_DATA_COMPLETENESS) {
    return { status: 'BLOCKED', reason: `data_completeness=${period.data_completeness} abaixo do mínimo (${MIN_DATA_COMPLETENESS}) — amostra de dias insuficiente pra confiar em decisão de escala.`, marginal_return: 'NOT_ESTIMABLE' };
  }

  const buyers = financials.numero_compradores_reais;
  if (buyers == null) {
    return { status: 'UNKNOWN', reason: 'número de compradores reais indisponível.', marginal_return: 'NOT_ESTIMABLE' };
  }

  if (financials.roas_financeiro >= roas3Gap.target_roas && buyers >= MIN_BUYERS_FOR_SCALE) {
    return {
      status: 'ELIGIBLE_FOR_SCALE',
      reason: `ROAS financeiro (${financials.roas_financeiro}) >= target (${roas3Gap.target_roas}), com ${buyers} compradores (>= ${MIN_BUYERS_FOR_SCALE}) — sustentabilidade mínima de amostra atingida.`,
      marginal_return: 'NOT_ESTIMABLE', // item 34 — conceito preparado, não implementado: exige série de gastos incrementais reais pra medir retorno marginal
    };
  }
  if (profitStatus === 'PROFITABLE' && buyers >= MIN_BUYERS_FOR_TEST_SCALE) {
    return {
      status: 'ELIGIBLE_FOR_TEST_SCALE',
      reason: `profit_status=PROFITABLE (ROAS ${financials.roas_financeiro} >= 1.05, abaixo do target 3.0), ${buyers} compradores — elegível pra um pequeno teste de escala, não escala definitiva.`,
      marginal_return: 'NOT_ESTIMABLE',
    };
  }
  return {
    status: 'NOT_ELIGIBLE',
    reason: `ROAS financeiro (${financials.roas_financeiro}) e/ou amostra (${buyers} compradores) abaixo dos limiares de escala.`,
    marginal_return: 'NOT_ESTIMABLE',
  };
}

module.exports = { evaluateScaleGate, MIN_BUYERS_FOR_TEST_SCALE, MIN_BUYERS_FOR_SCALE, MIN_DATA_COMPLETENESS };
