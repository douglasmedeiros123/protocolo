'use strict';

const { validateOfferCausalTarget } = require('./causalityMap');

// ANÁLISE DO AOV-001 EXISTENTE (PASSO 10, item 43) — SÓ LEITURA, nunca altera o experimento
// real. hypothesis.change do AOV-001 real cita "bundle Núcleo+Objeções+Cobrança" — um BUNDLE
// (item novo) empacotado com a REFORÇO DE OFERTA do bump existente — 2 mecanismos diferentes
// (BUNDLE_DISCOUNT + BUMP_COPY) dentro de 1 experimento só.
const BUNDLED_VARIABLE_SIGNALS = [
  { variable: 'BUMP_COPY', regex: /reforçar(mos)?\s+a\s+oferta/i, snippet_hint: 'reforçarmos a oferta de order bump' },
  { variable: 'BUNDLE_DISCOUNT', regex: /bundle/i, snippet_hint: 'bundle Núcleo+Objeções+Cobrança' },
];

function detectBundledVariables(changeText) {
  return BUNDLED_VARIABLE_SIGNALS.filter((s) => s.regex.test(changeText)).map((s) => ({ variable: s.variable, matched_signal: s.snippet_hint }));
}

/**
 * analyzeAov001(experiment) — SÓ LEITURA, nunca modifica o experimento recebido. Avalia se a
 * hipótese ainda é coerente, se está ampla demais (múltiplos mecanismos), e se o budget/amplitude
 * são testáveis dado o capital_cycle real (o AOV-001 real já reprovou no budget_check —
 * EXCEEDS_CYCLE_AVAILABLE — com o ciclo simulado de R$1.000 usado no Decision Engine).
 */
function analyzeAov001(experiment) {
  if (!experiment) {
    return { found: false, reason: 'AOV-001 não encontrado em analytics/data/experiments/.' };
  }

  const changeText = experiment.hypothesis?.change || '';
  const bundled = detectBundledVariables(changeText);
  const isMultiVariable = bundled.length > 1;

  const evidence = [{
    claim: 'attach rate de order bump hoje é 27,3% (real, 30 dias)',
    source: 'Citado em hypothesis.reason do AOV-001 (analytics/data/experiments/AOV-001.json, created_at 2026-08-27T21:49:33Z) — número real, reconfirmável via economics.js.',
    status: 'REAL e reconfirmável — order_bump_attach_rate é recalculado por este agente a partir dos mesmos dados Hotmart.',
  }];

  const inferences = [
    {
      claim: 'Reforçar a oferta do bundle vai subir o AOV líquido',
      why_inference: 'Não isola se o ganho viria do BUNDLE em si (novo componente, nunca testado) ou do REFORÇO DE COPY do bump já existente — são 2 mecanismos causais diferentes empacotados juntos.',
    },
    {
      claim: 'O caminho AOV pra ROAS 2 precisa de +237%',
      why_inference: 'Matemática real do Profit Engine (verificável), mas justifica POR QUE atacar AOV é prioritário — não QUAL variável específica resolve.',
    },
  ];

  const causalValidation = bundled.map((b) => ({
    variable: b.variable,
    matched_signal: b.matched_signal,
    ...validateOfferCausalTarget(b.variable, experiment.target_metric),
  }));

  const validCandidates = causalValidation.filter((v) => v.status === 'VALID');
  // Entre as variáveis VALID, prioriza a que JÁ TEM componente real ativo (BUMP_COPY —
  // otimização de componente EXISTENTE, menor incerteza) sobre a que exige componente NOVO
  // (BUNDLE_DISCOUNT — nenhum bundle real existe hoje) — mesmo critério de
  // OPTIMIZE_EXISTING_COMPONENT vs ADD_NEW_COMPONENT do candidateGenerator.js (item 32), nunca
  // hardcoded "bundle > copy" ou vice-versa.
  const scored = validCandidates.map((v) => ({
    ...v,
    is_existing_component: v.variable === 'BUMP_COPY',
  }));
  const sorted = [...scored].sort((a, b) => (b.is_existing_component ? 1 : 0) - (a.is_existing_component ? 1 : 0));
  const recommendedFirstVariable = sorted[0] || null;
  const tiedWithFirst = recommendedFirstVariable ? sorted.filter((v) => v.is_existing_component === recommendedFirstVariable.is_existing_component) : [];
  const variableSelectionTie = tiedWithFirst.length > 1;

  return {
    found: true,
    experiment_id: experiment.experiment_id,
    status: experiment.status,
    target_metric: experiment.target_metric,
    budget_limit: experiment.budget_limit,
    budget_check: experiment.budget_check,
    is_testable_at_current_cycle: experiment.budget_check ? experiment.budget_check.valid !== false : null,
    hypothesis_still_coherent: true,
    coherence_note: 'A lógica geral (reforçar oferta de bump/bundle sobe AOV) continua plausível — o problema identificado é de ESCOPO (2 mecanismos causais empacotados: reforço de copy do bump existente + bundle novo nunca testado).',
    bundled_variables_detected: bundled,
    is_multi_variable: isMultiVariable,
    is_too_broad: isMultiVariable,
    evidence,
    inferences,
    causal_validation_per_variable: causalValidation,
    recommended_variable_to_isolate_first: recommendedFirstVariable,
    variable_selection_is_tie: variableSelectionTie,
    refinement_recommendation: isMultiVariable
      ? `AOV-001 combina ${bundled.length} mecanismos causais distintos (${bundled.map((b) => b.variable).join(', ')}) num único experimento. Recomendação: dividir em experimentos sequenciais, começando por ${recommendedFirstVariable ? recommendedFirstVariable.variable : 'a variável VALID mais direta'}${recommendedFirstVariable?.is_existing_component ? ' (componente EXISTENTE, menor incerteza que introduzir o bundle novo)' : ''}. ${experiment.budget_check && experiment.budget_check.valid === false ? `IMPORTANTE: o budget_limit atual (R$${experiment.budget_limit}) reprova no capital_cycle simulado (${experiment.budget_check.status}) — mesmo refinado, o AOV-001 real precisaria de um budget_limit recalculado antes de ser testável.` : ''}`.trim()
      : 'AOV-001 já testa uma variável principal — nenhum refinamento de escopo necessário.',
  };
}

module.exports = { analyzeAov001, detectBundledVariables, BUNDLED_VARIABLE_SIGNALS };
