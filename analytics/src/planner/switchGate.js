'use strict';

const { AGENT_COVERED_LEVERS } = require('./leverRegistry');

// item 21 — padrão mínimo de invalidação, documentado (não um número mágico único). Configurável
// por produto/contexto no futuro; hoje são os valores conservadores padrão do projeto.
const MINIMUM_INVALIDATION_EVIDENCE = {
  min_completed_experiments_total: 3,
  min_completed_experiments_per_key_lever: 1, // pelo menos 1 experimento concluído em CADA lever-chave (CREATIVE/CRO/OFFER)
  min_data_completeness: 0.8,
  key_levers: ['CREATIVE', 'CRO', 'OFFER'],
  description: 'Para permitir SWITCH_PRODUCT: pelo menos 3 experimentos concluídos no total, com pelo menos 1 concluído em CADA lever-chave (Creative/CRO/Offer), data_completeness >= 80%, e o gap econômico permanecendo implausível mesmo assim (item 21).',
};

function criterion(status, reason) { return { status, reason }; } // status: PASS | FAIL | UNKNOWN

/**
 * evaluateSwitchProductGate() — item 19. Avalia os 10 critérios documentados. Qualquer critério
 * sem dado suficiente vira UNKNOWN (nunca PASS por omissão — omissão nunca libera o gate).
 */
function evaluateSwitchProductGate({ economicsSnapshot, experimentCoverage, levers, learningEvidence, knownPathToTarget, capitalPlan, expectedEconomicValueOfContinuing, valueOfInformationOfContinuing, expectedEconomicValueOfSwitching, financialTruthStatus }) {
  const criteria = {};

  // 1. qualidade dos dados
  const dq = economicsSnapshot.period.data_completeness;
  criteria.data_quality = dq == null ? criterion('UNKNOWN', 'data_completeness indisponível.')
    : dq >= MINIMUM_INVALIDATION_EVIDENCE.min_data_completeness ? criterion('PASS', `data_completeness=${dq} >= ${MINIMUM_INVALIDATION_EVIDENCE.min_data_completeness}.`)
    : criterion('FAIL', `data_completeness=${dq} abaixo do mínimo (${MINIMUM_INVALIDATION_EVIDENCE.min_data_completeness}).`);

  // 2. tracking suficiente — PASSO 11.1, item 1-3: avaliado por ESCOPO (FINANCIAL_TRUTH), nunca
  // por "existe alguma flag crítica" genérica. DEGRADED (Meta-only) não reprova este critério —
  // só BLOCKED (Hotmart comprometida) reprova.
  criteria.tracking_sufficiency = financialTruthStatus === 'BLOCKED'
    ? criterion('FAIL', 'FINANCIAL_TRUTH=BLOCKED — a fonte de verdade financeira está comprometida.')
    : financialTruthStatus == null ? criterion('UNKNOWN', 'FINANCIAL_TRUTH não avaliado.')
    : criterion('PASS', `FINANCIAL_TRUTH=${financialTruthStatus} — Hotmart íntegra o suficiente pra sustentar a avaliação.`);

  // 3. volume mínimo de evidência (buyers reais no período, usado como proxy de volume)
  const buyers = economicsSnapshot.financials.numero_compradores_reais;
  criteria.minimum_evidence_volume = buyers == null ? criterion('UNKNOWN', 'número de compradores reais indisponível.')
    : buyers >= 10 ? criterion('PASS', `${buyers} compradores reais no período — volume mínimo de referência atingido.`)
    : criterion('FAIL', `${buyers} compradores reais — abaixo do volume mínimo de referência (10).`);

  // 4. experimentos concluídos (total mínimo)
  const totalCompleted = experimentCoverage.total_completed;
  criteria.completed_experiments = totalCompleted >= MINIMUM_INVALIDATION_EVIDENCE.min_completed_experiments_total
    ? criterion('PASS', `${totalCompleted} experimento(s) concluído(s) >= mínimo (${MINIMUM_INVALIDATION_EVIDENCE.min_completed_experiments_total}).`)
    : criterion('FAIL', `${totalCompleted} experimento(s) concluído(s) — abaixo do mínimo (${MINIMUM_INVALIDATION_EVIDENCE.min_completed_experiments_total}).`);

  // 5. principais alavancas exploradas (pelo menos 1 experimento concluído em CADA lever-chave)
  const keyLeverStates = MINIMUM_INVALIDATION_EVIDENCE.key_levers.map((id) => levers.find((l) => l.lever_id === id));
  const unexploredKeyLevers = keyLeverStates.filter((l) => !l || l.completed_experiments < MINIMUM_INVALIDATION_EVIDENCE.min_completed_experiments_per_key_lever).map((l) => l?.lever_id);
  criteria.key_levers_explored = unexploredKeyLevers.length === 0
    ? criterion('PASS', 'todos os levers-chave (Creative/CRO/Offer) têm pelo menos 1 experimento concluído.')
    : criterion('FAIL', `lever(s) sem experimento concluído: ${keyLeverStates.map((l, i) => (!l || l.completed_experiments < 1 ? MINIMUM_INVALIDATION_EVIDENCE.key_levers[i] : null)).filter(Boolean).join(', ') || 'desconhecido'}.`);

  // 6. hipóteses relevantes invalidadas
  const invalidated = learningEvidence.total_hypotheses > 0
    ? Object.values(learningEvidence.by_category).reduce((s, c) => s + c.invalidated_hypotheses, 0)
    : null;
  criteria.relevant_hypotheses_invalidated = invalidated == null ? criterion('UNKNOWN', 'nenhuma hipótese registrada ainda.')
    : invalidated > 0 ? criterion('PASS', `${invalidated} hipótese(s) invalidada(s) real(is).`)
    : criterion('FAIL', 'nenhuma hipótese invalidada ainda.');

  // 7. ausência de caminho econômico plausível
  criteria.no_plausible_economic_path = knownPathToTarget.status === 'NO_KNOWN_PATH' ? criterion('PASS', knownPathToTarget.reason)
    : knownPathToTarget.status === 'UNKNOWN' ? criterion('UNKNOWN', 'known_path_to_target ainda não avaliável.')
    : criterion('FAIL', `known_path_to_target=${knownPathToTarget.status} — ainda existe caminho plausível ou já atingido.`);

  // 8. capital adicional necessário
  criteria.additional_capital_required = capitalPlan && capitalPlan.available != null
    ? criterion('PASS', `capital disponível reportado: ${capitalPlan.available}.`)
    : criterion('UNKNOWN', 'capital de validação não configurado — não avaliável (item 30).');

  // 9. expected value de continuar — PASSO 11.1, item 12: PASS exige AMBOS (a) economic EV
  // NEGATIVE E (b) value of information LOW/NONE. HIGH VOI sozinho já reprova este critério,
  // mesmo com economic EV UNKNOWN — "não sabemos se dá retorno, mas ainda vale aprender" não
  // sustenta switch (item 11/12: nunca exigir EV positivo artificialmente pra JUSTIFICAR ficar,
  // mas HIGH VOI também nunca deve ser ignorado na hora de JUSTIFICAR sair).
  const voiStatus = valueOfInformationOfContinuing ? valueOfInformationOfContinuing.status : 'UNKNOWN';
  const voiLowEnough = voiStatus === 'LOW' || voiStatus === 'NONE';
  criteria.expected_value_of_continuing = expectedEconomicValueOfContinuing.status === 'NEGATIVE' && voiLowEnough
    ? criterion('PASS', `expected_economic_value_of_continuing=NEGATIVE e value_of_information_of_continuing=${voiStatus} — nem retorno econômico nem valor de aprendizado sustentam continuar.`)
    : expectedEconomicValueOfContinuing.status === 'UNKNOWN' && voiStatus === 'UNKNOWN' ? criterion('UNKNOWN', 'nem economic EV nem VOI avaliáveis ainda.')
    : criterion('FAIL', `expected_economic_value_of_continuing=${expectedEconomicValueOfContinuing.status}, value_of_information_of_continuing=${voiStatus} — ${voiStatus === 'HIGH' || voiStatus === 'MEDIUM' ? 'ainda há valor de aprendizado real que justifica continuar.' : 'EV econômico não é NEGATIVE o suficiente pra justificar sair.'}`);

  // 10. opportunity cost de testar outro produto
  criteria.opportunity_cost_of_testing_alternative = expectedEconomicValueOfSwitching.status === 'UNKNOWN'
    ? criterion('UNKNOWN', 'sem Product Selection Agent/alternativas reais modeladas ainda (item 23) — nunca inventado.')
    : criterion(expectedEconomicValueOfSwitching.status === 'POSITIVE' ? 'PASS' : 'FAIL', `expected_economic_value_of_switching=${expectedEconomicValueOfSwitching.status}.`);

  const values = Object.values(criteria);
  const failCount = values.filter((c) => c.status === 'FAIL').length;
  const unknownCount = values.filter((c) => c.status === 'UNKNOWN').length;
  const passCount = values.filter((c) => c.status === 'PASS').length;

  // gate só abre com TODOS os critérios PASS — qualquer FAIL ou UNKNOWN bloqueia (item 20: ROAS
  // ruim sozinho nunca basta).
  const eligible = failCount === 0 && unknownCount === 0 && passCount === values.length;

  return {
    criteria,
    eligible,
    pass_count: passCount, fail_count: failCount, unknown_count: unknownCount,
    reason: eligible ? 'todos os 10 critérios documentados passaram.' : `gate bloqueado — ${failCount} critério(s) reprovado(s), ${unknownCount} desconhecido(s). Qualquer FAIL/UNKNOWN impede SWITCH_PRODUCT (item 20).`,
    minimum_invalidation_evidence: MINIMUM_INVALIDATION_EVIDENCE,
  };
}

module.exports = { evaluateSwitchProductGate, MINIMUM_INVALIDATION_EVIDENCE };
