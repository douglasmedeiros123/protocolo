'use strict';

// PASSO 11 (items 7-9, 20, 48-53, 87) + PASSO 11.1 (items 1-12) — o cérebro central do Strategic
// Planner. Ordem de avaliação documentada e determinística. Guardrails vêm SEMPRE antes de
// qualquer verdict propositivo.

// item 51 — OPTIMIZE exige mais que "candidato causal plausível não testado": exige que pelo
// menos 1 categoria já tenha um experimento CONCLUÍDO. DRAFT/candidato != testado (item 43).
const HYPOTHESIS_SPACE_ALLOWS_OPTIMIZE = ['PARTIALLY_EXPLORED', 'WELL_EXPLORED', 'NEAR_EXHAUSTED', 'EXHAUSTED'];

function computeVerdict({ economicsSnapshot, hypothesisSpaceStatus, expectedEconomicValueOfContinuing, knownPathToTarget, switchGate, scaleGate, financialTruthStatus }) {
  const dq = economicsSnapshot.period.data_completeness;

  // GUARDRAIL 1 (PASSO 11.1, item 1/5) — só FINANCIAL_TRUTH=BLOCKED força HOLD, nunca qualquer
  // flag crítica genérica. Um flag Meta-only (DEGRADED) NUNCA congela o produto inteiro — Hotmart
  // continua sendo fonte de verdade financeira íntegra o suficiente pra avaliar o resto.
  if (financialTruthStatus === 'BLOCKED') {
    return finalize('HOLD', 'HIGH', 'INSUFFICIENT_EVIDENCE', {
      why_this_verdict: 'FINANCIAL_TRUTH=BLOCKED — a própria fonte de verdade financeira (Hotmart) está comprometida no período (flag bloqueante real, não só ruído Meta) — nenhuma decisão de capital pode se apoiar em número nenhum.',
      what_would_change_it: 'corrigir a causa raiz da flag bloqueante e confirmar Hotmart íntegra por um novo período.',
      what_remains_unknown: 'se a economia real, sem a distorção, já estaria mais perto do target.',
    });
  }

  // GUARDRAIL 2 — data_completeness criticamente baixa também é HOLD (item 49: "data quality").
  if (dq != null && dq < 0.5) {
    return finalize('HOLD', 'HIGH', 'INSUFFICIENT_EVIDENCE', {
      why_this_verdict: `data_completeness=${dq} está criticamente baixa — menos da metade dos dias do período tem snapshot real.`,
      what_would_change_it: 'restaurar a coleta diária completa e reavaliar com um período íntegro.',
      what_remains_unknown: 'a economia real do produto nos dias sem dado.',
    });
  }

  // GUARDRAIL 3 (items 19-21) — SWITCH_PRODUCT só passa pelo gate rigoroso. ROAS ruim sozinho
  // NUNCA basta (item 20).
  if (switchGate.eligible === true) {
    return finalize('SWITCH_PRODUCT', 'HIGH', 'INVALIDATED', {
      why_this_verdict: `todos os 10 critérios do switch gate passaram: ${switchGate.reason}`,
      what_would_change_it: 'novo lever real (ainda não explorado/instrumentado) com evidência de valor positivo, ou VOI voltando a subir.',
      what_remains_unknown: 'o valor esperado de um produto alternativo real (expected_economic_value_of_switching permanece UNKNOWN até existir Product Selection Agent).',
    });
  }

  // item 52 — SCALE exige sustentabilidade/confiança/amostra, nunca "um dia bom".
  if (scaleGate.status === 'ELIGIBLE_FOR_SCALE') {
    return finalize('SCALE', 'HIGH', 'PROVEN', {
      why_this_verdict: scaleGate.reason,
      what_would_change_it: 'queda sustentada do ROAS financeiro abaixo do target, ou degradação de FINANCIAL_TRUTH.',
      what_remains_unknown: 'retorno marginal em níveis de gasto ainda maiores (marginal_return continua NOT_ESTIMABLE — item 34).',
    });
  }

  // item 50 — OPTIMIZE: pelo menos 1 categoria com experimento CONCLUÍDO + EV ECONÔMICO real
  // positivo (nunca só "existem alavancas disponíveis" — isso é VOI, não EV, PASSO 11.1 item 8).
  if (HYPOTHESIS_SPACE_ALLOWS_OPTIMIZE.includes(hypothesisSpaceStatus.status) && expectedEconomicValueOfContinuing.status === 'POSITIVE') {
    return finalize('OPTIMIZE', 'MEDIUM', 'PLAUSIBLE', {
      why_this_verdict: `hypothesis_space_status=${hypothesisSpaceStatus.status} (${hypothesisSpaceStatus.reason}) e expected_economic_value_of_continuing=POSITIVE (${expectedEconomicValueOfContinuing.basis}).`,
      what_would_change_it: 'resultado real (SUCCESS/FAILURE) do próximo experimento concluído na alavanca priorizada.',
      what_remains_unknown: 'se a alavanca priorizada, quando testada de novo/escalada, continua entregando o mesmo efeito.',
    });
  }

  // item 51 — estado padrão honesto: produto em aprendizado, evidência insuficiente pra um
  // verdict mais forte, perguntas decisivas ainda abertas. NÃO hardcoded.
  const viability = hypothesisSpaceStatus.status === 'UNKNOWN' || economicsSnapshot.financials.roas_financeiro == null
    ? 'UNKNOWN' : 'INSUFFICIENT_EVIDENCE';
  return finalize('CONTINUE_VALIDATION', hypothesisSpaceStatus.status === 'UNKNOWN' ? 'LOW' : 'MEDIUM', viability, {
    why_this_verdict: `hypothesis_space_status=${hypothesisSpaceStatus.status}, known_path_to_target=${knownPathToTarget.status}, expected_economic_value_of_continuing=${expectedEconomicValueOfContinuing.status} — ainda não há evidência real suficiente pra afirmar um caminho plausível OU pra descartar o produto. "${knownPathToTarget.reason}"`,
    what_would_change_it: 'o primeiro experimento concluído (SUCCESS/FAILURE/INCONCLUSIVE) em qualquer alavanca-chave (Creative/CRO/Offer) muda hypothesis_space_status e reabre a avaliação de OPTIMIZE.',
    what_remains_unknown: 'se alguma das alavancas com candidato real (ver lever_registry) realmente move a métrica quando testada — isso é, por definição, o que ainda não sabemos até rodar o experimento.',
  });

  function finalize(verdict, confidence, viabilityStatus, reasoning) {
    return { verdict, verdict_confidence: confidence, viability_status: viabilityStatus, reasoning };
  }
}

module.exports = { computeVerdict, HYPOTHESIS_SPACE_ALLOWS_OPTIMIZE };
