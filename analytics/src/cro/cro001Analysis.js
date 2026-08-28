'use strict';

const { validateCroCausalTarget } = require('./causalityMap');
const { VALIDATION_METHOD_BY_VARIABLE } = require('./candidateGenerator');

// ANÁLISE DO CRO-001 EXISTENTE (PASSO 9, item 25) — SÓ LEITURA, nunca altera o experimento real.
// Detecta, via keyword matching determinístico sobre o texto REAL de hypothesis.change, quantas
// variáveis de CRO distintas estão bundladas num único experimento.
const BUNDLED_VARIABLE_SIGNALS = [
  { variable: 'PAGE_SPEED', regex: /payload|carregamento|velocidade/i, snippet_hint: 'menos payload' },
  { variable: 'HEADLINE', regex: /hook|2-3s|primeiros segundos/i, snippet_hint: 'hook nos 2-3s iniciais' },
  { variable: 'CTA_VISIBILITY', regex: /scroll|dobra|oferta vis[ií]vel|sem depender de scroll/i, snippet_hint: 'sem depender de scroll pra ver a oferta' },
];

function detectBundledVariables(changeText) {
  return BUNDLED_VARIABLE_SIGNALS.filter((s) => s.regex.test(changeText)).map((s) => ({ variable: s.variable, matched_signal: s.snippet_hint }));
}

/**
 * analyzeCro001(experiment, technicalActions) — recebe o experimento REAL já carregado
 * (analytics/data/experiments/CRO-001.json) e as ações técnicas já detectadas (diagnostics.js)
 * e devolve o diagnóstico. NUNCA modifica o objeto recebido, NUNCA recalcula custo/validação
 * (isso já vive em diagnostics.js/informationGain.js — reusado aqui, não duplicado).
 */
function analyzeCro001(experiment, technicalActions = []) {
  if (!experiment) {
    return { found: false, reason: 'CRO-001 não encontrado em analytics/data/experiments/.' };
  }

  const changeText = experiment.hypothesis?.change || '';
  const bundled = detectBundledVariables(changeText);
  const isMultiVariable = bundled.length > 1;

  const evidence = [{
    claim: '71% do tráfego vem do Instagram in-app com scroll médio de 16,8% e só 11s de tempo ativo',
    source: 'Citado como "dado real do Clarity" no momento da criação do CRO-001 (analytics/data/experiments/CRO-001.json, created_at 2026-08-27T21:49:33Z)',
    status: 'HISTÓRICO — não reconfirmado nesta execução (o Clarity está indisponível agora, ver claritySnapshot.js). Era um dado real na origem, mas não foi revalidado nesta análise.',
  }];

  const inferences = [
    {
      claim: 'Reduzir a fricção da primeira dobra vai aumentar a taxa LPV->checkout',
      why_inference: 'As métricas de engajamento (scroll baixo, tempo ativo curto) mostram que o público não se aprofunda na página — mas isso, sozinho, não isola QUAL elemento específico (velocidade, headline ou visibilidade do CTA) é o gargalo real. É um salto causal razoável, não uma evidência direta de mecanismo.',
    },
    {
      claim: 'O gap de CPA precisa de 70% de redução pra bater a meta de ROAS 2',
      why_inference: 'É matemática real do Profit Engine (verificável), mas justifica POR QUE atacar CRO é prioritário — não QUAL variável específica resolve o problema.',
    },
  ];

  const causalValidation = bundled.map((b) => ({
    variable: b.variable,
    matched_signal: b.matched_signal,
    ...validateCroCausalTarget(b.variable, experiment.target_metric),
  }));

  // PASSO 9.1, item 2: NUNCA hardcoda "CTA_VISIBILITY > HEADLINE". Entre as variáveis VALID,
  // prioriza pelo MESMO critério objetivo usado no tie-break dos candidates (ranking.js):
  // 1) evidence_quality real — quantas ações técnicas/diagnósticos JÁ EXISTENTES corroboram essa
  //    variável (ex: o duplicate-id corrobora CTA_VISIBILITY, mas nada corrobora HEADLINE hoje);
  // 2) information_gain_per_real — se a variável pode ser pré-validada quase de graça
  //    (VALIDATION_METHOD_BY_VARIABLE != CONTROLLED_EXPERIMENT), isso pesa a favor dela.
  // Se os dois critérios empatarem de verdade entre 2+ variáveis VALID, isso é reportado como
  // tie_note explícito — nunca resolvido por uma ordem arbitrária de variáveis.
  const validCandidates = causalValidation.filter((v) => v.status === 'VALID');
  const scoredCandidates = validCandidates.map((v) => {
    const corroboratingActions = technicalActions.filter((a) => a.description && a.description.toLowerCase().includes(v.variable.toLowerCase().replace(/_/g, ' ')))
      .concat(v.variable === 'CTA_VISIBILITY' ? technicalActions.filter((a) => a.diagnostic_id.includes('DUPLICATE-ID')) : []);
    const evidenceQuality = new Set(corroboratingActions.map((a) => a.diagnostic_id)).size;
    const validationMethod = VALIDATION_METHOD_BY_VARIABLE[v.variable] || 'CONTROLLED_EXPERIMENT';
    const cheapToValidate = validationMethod !== 'CONTROLLED_EXPERIMENT';
    return { ...v, evidence_quality: evidenceQuality, validation_method: validationMethod, cheap_to_validate: cheapToValidate };
  });
  const sortedCandidates = [...scoredCandidates].sort((a, b) => {
    if (b.evidence_quality !== a.evidence_quality) return b.evidence_quality - a.evidence_quality;
    if (a.cheap_to_validate !== b.cheap_to_validate) return a.cheap_to_validate ? -1 : 1;
    return 0; // empate real nos 2 critérios objetivos
  });
  const recommendedFirstVariable = sortedCandidates[0] || null;
  const tiedWithFirst = recommendedFirstVariable
    ? sortedCandidates.filter((v) => v.evidence_quality === recommendedFirstVariable.evidence_quality && v.cheap_to_validate === recommendedFirstVariable.cheap_to_validate)
    : [];
  const variableSelectionTie = tiedWithFirst.length > 1;

  // BEST NEXT INVESTIGATION (PASSO 9.1, itens 9-10): se a variável recomendada tem um caminho de
  // validação BARATO (!= CONTROLLED_EXPERIMENT) e existe uma ação técnica real de baixo custo
  // pendente, a melhor PRÓXIMA ação pode não ser gastar mídia ainda — pode ser validar tecnicamente
  // primeiro. Nunca forçado: só ocorre quando os dados realmente apontam pra isso.
  const relevantTechnicalAction = technicalActions.find((a) => a.diagnostic_id.includes('DUPLICATE-ID')) || null;
  const bestNextInvestigation = relevantTechnicalAction && recommendedFirstVariable && recommendedFirstVariable.cheap_to_validate
    ? {
      action_type: 'VALIDATE_TECHNICAL_ISSUE',
      reason: `Existe uma ação técnica de custo ~R$0 (${relevantTechnicalAction.diagnostic_id}, ${relevantTechnicalAction.validation_method}) relacionada à variável mais recomendada (${recommendedFirstVariable.variable}). Faz sentido validá-la ANTES de comprometer o budget do experimento (ver candidate.pre_experiment_validation.estimated_validation_cost_reais) — a correção, se confirmada necessária, é quase grátis e remove um confundidor de qualquer teste futuro.`,
      technical_action_id: relevantTechnicalAction.action_id,
    }
    : {
      action_type: 'RUN_EXPERIMENT',
      reason: recommendedFirstVariable
        ? `Nenhuma ação técnica de validação barata pendente corrobora especificamente ${recommendedFirstVariable.variable} — a evidência disponível já é a máxima possível sem rodar o experimento controlado.`
        : 'Nenhuma variável VALID identificada — sem recomendação de próxima ação baseada em causalidade.',
    };

  const hypothesisStillCoherent = true; // a lógica geral continua plausível — o problema é ESCOPO, não lógica

  return {
    found: true,
    experiment_id: experiment.experiment_id,
    status: experiment.status,
    target_metric: experiment.target_metric,
    hypothesis_still_coherent: hypothesisStillCoherent,
    coherence_note: 'A lógica geral (reduzir fricção na primeira dobra melhora conversão) continua plausível e alinhada ao target_metric — o problema identificado é de ESCOPO (variáveis demais empacotadas), não de lógica.',
    bundled_variables_detected: bundled,
    is_multi_variable: isMultiVariable,
    evidence,
    inferences,
    causal_validation_per_variable: causalValidation,
    recommended_variable_to_isolate_first: recommendedFirstVariable,
    variable_selection_is_tie: variableSelectionTie,
    variable_selection_tie_candidates: variableSelectionTie ? tiedWithFirst.map((v) => v.variable) : [],
    best_next_investigation: bestNextInvestigation,
    is_too_broad: isMultiVariable,
    refinement_recommendation: isMultiVariable
      ? `CRO-001 combina ${bundled.length} variáveis principais (${bundled.map((b) => b.variable).join(', ')}) num único experimento — isso reduz a qualidade do aprendizado causal (MULTI_VARIABLE_TEST). Recomendação: dividir em experimentos sequenciais.${variableSelectionTie ? ` Entre ${tiedWithFirst.map((v) => v.variable).join(' e ')}, a evidência disponível hoje é EQUIVALENTE (mesmo evidence_quality e mesmo custo de validação) — nenhuma das duas é forçada a vencer; ver ranking.js pros candidates gerados pra desempate mais fino.` : ` Começando por ${recommendedFirstVariable ? recommendedFirstVariable.variable : 'a variável validada mais diretamente ligada ao target_metric'} (maior evidence_quality real hoje), preservando as demais variáveis como estão.`} ${bestNextInvestigation.action_type === 'VALIDATE_TECHNICAL_ISSUE' ? 'IMPORTANTE: existe uma validação técnica de custo ~R$0 pendente — considere fazê-la antes de comprometer o budget do experimento (ver best_next_investigation).' : ''}`.trim()
      : 'CRO-001 já testa uma variável principal — nenhum refinamento de escopo necessário.',
  };
}

module.exports = { analyzeCro001, detectBundledVariables, BUNDLED_VARIABLE_SIGNALS };
