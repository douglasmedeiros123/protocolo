'use strict';

// BEST USE OF NEXT CAPITAL (PASSO 7.1) — corrige uma confusão semântica do PASSO 7: a pergunta
// "qual o melhor uso dos próximos R$X?" é uma decisão MARGINAL, não pode nunca liberar mais do
// que X, mesmo que a tranche planejada do experimento (capital_tranches, ver tranches.js) seja
// maior. capital_tranches continua existindo como planejamento MACRO do experimento inteiro;
// bestUseOfNextCapital() é a fatia real dessa decisão especificamente pro capital em análise
// agora — o restante da tranche planejada NUNCA é liberado automaticamente, sempre exige nova
// decisão/reavaliação (ver PASSO 7.1, item 4).
//
// REGRA (item 2, sempre verdadeira quando a ação é RUN_EXPERIMENT):
//   capital_release_initial = min(
//     available_decision_capital,   // o X perguntado (amount) — nunca hardcoded em 100
//     recommended_tranche_size,     // a 1ª tranche planejada pelo modelo de risco/evidência
//     cycle_available,              // nunca libera mais do que existe no ciclo simulado/real
//     experiment_budget_remaining,  // nunca mais do que falta do budget_limit do experimento
//   )
// Nenhum desses 4 limites pode ser violado — o mínimo sempre vence.
//
// experiment_budget_remaining hoje é sempre o budget_limit inteiro: o Decision Engine ainda não
// executa nada, então não existe rastro de "quanto já foi liberado" pra este experimento — isso
// é uma capability futura (Execution/Scaling Agent), não inventada aqui.
function bestUseOfNextCapital(amount, { recommended, capitalCycle, winnerExperiment, capitalTranches }) {
  const available_decision_capital = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const cycle_available = capitalCycle && capitalCycle.status === 'CONFIGURED' ? capitalCycle.cycle_available : null;

  if (!recommended || recommended.action_type !== 'RUN_EXPERIMENT' || !winnerExperiment) {
    // DO_NOT_SPEND é sempre uma resposta válida (item 5) — capital disponível não obriga gasto.
    return {
      action: 'DO_NOT_SPEND',
      experiment_id: null,
      reason: recommended ? recommended.reason : 'Nenhuma ação recomendada.',
      expected_value_score: 0,
      available_decision_capital,
      experiment_budget_limit: null,
      experiment_budget_remaining: null,
      recommended_tranche_size: 0,
      cycle_available,
      capital_release_initial: 0,
      capital_release_max: 0,
      next_release_condition: null,
      stop_condition: null,
    };
  }

  const experiment_budget_limit = winnerExperiment.budget_limit;
  const experiment_budget_remaining = experiment_budget_limit; // ver nota acima — nada foi liberado ainda
  const recommended_tranche_size = capitalTranches.tranches[0]?.amount ?? 0;

  const limits = [available_decision_capital, recommended_tranche_size, experiment_budget_remaining];
  if (cycle_available != null) limits.push(Math.max(cycle_available, 0));
  const capital_release_initial = Math.max(0, Math.round(Math.min(...limits) * 100) / 100);

  return {
    action: capital_release_initial > 0 ? 'RUN_EXPERIMENT' : 'DO_NOT_SPEND',
    experiment_id: winnerExperiment.experiment_id,
    reason: recommended.reason,
    expected_value_score: recommended.expected_value.expected_value_score,
    available_decision_capital,
    experiment_budget_limit,
    experiment_budget_remaining,
    recommended_tranche_size,
    cycle_available,
    capital_release_initial,
    // capital_release_max NÃO é limitado por `amount` — representa o teto total planejável pro
    // experimento inteiro (capital_tranches já capado pelo ciclo), útil pra contexto, nunca
    // liberado de uma vez só (item 3).
    capital_release_max: capitalTranches.total_allocated ?? experiment_budget_limit,
    next_release_condition: capitalTranches.tranches[1]?.release_condition ?? null,
    stop_condition: capitalTranches.tranches[0]?.stop_condition ?? null,
  };
}

module.exports = { bestUseOfNextCapital };
