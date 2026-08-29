'use strict';

const { evaluateBudgetEscalation } = require('./budgetEscalationPolicy');

// PASSO 14B, item 17 — cenário EXPLICITAMENTE SINTÉTICO (R$30/dia -> R$500/dia). NUNCA usado
// como política real — só prova que a máquina PODE recomendar um valor muito acima do seu limite
// autônomo, e que a Policy Engine reage diferente conforme a força real da evidência (A/B/C).
const SYNTHETIC_MARKER = 'SYNTHETIC_FIXTURE_NEVER_A_REAL_POLICY';

const SYNTHETIC_BASE = {
  currentBudget: 30, recommendedBudget: 500, financialTruthHealthStatus: 'RELIABLE',
  measurementReadiness: 'NEEDS_TRACKING_IMPLEMENTATION', anomalyState: 'NORMAL', campaignStability: 'STABLE', targetRoas: 3.0,
};

function runSyntheticR30ToR500Scenarios() {
  const scenarioA = { // financial performance weak/uncertain
    ...SYNTHETIC_BASE, financialRoas: 0.6, marginalRoas: 'UNKNOWN', sampleSufficient: false, confidence: 'LOW',
  };
  const scenarioB = { // strong signal but limited confirmation
    ...SYNTHETIC_BASE, financialRoas: 2.5, marginalRoas: 'UNKNOWN', sampleSufficient: true, confidence: 'MEDIUM',
  };
  const scenarioC = { // financially confirmed extraordinary opportunity
    ...SYNTHETIC_BASE, financialRoas: 4.0, marginalRoas: 4.2, sampleSufficient: true, confidence: 'HIGH',
  };

  return {
    marker: SYNTHETIC_MARKER,
    scenario_A_weak_uncertain: { inputs: scenarioA, result: evaluateBudgetEscalation(scenarioA) },
    scenario_B_strong_signal_limited_confirmation: { inputs: scenarioB, result: evaluateBudgetEscalation(scenarioB) },
    scenario_C_confirmed_extraordinary: { inputs: scenarioC, result: evaluateBudgetEscalation(scenarioC) },
    note: 'números 30/500/0.6/2.5/4.0/4.2 são SINTÉTICOS — nunca usados como valores de política real (item 17). Recomendação da máquina pode ser R$500 mesmo sem autoridade autônoma pra executar isso (item 1/3: intelligence != authority).',
  };
}

module.exports = { runSyntheticR30ToR500Scenarios, SYNTHETIC_MARKER };
