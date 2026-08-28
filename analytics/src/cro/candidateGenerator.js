'use strict';

const { buildCroHypothesis } = require('./hypothesis');
const { checkCroPriorLearning } = require('./priorLearning');
const { validateCroCausalTarget } = require('./causalityMap');
const { toExperimentCompatibleFields, estimateBudgetForCroCandidate } = require('./experimentCompat');
const { minimumEvidenceFor } = require('../experiments/evidence');
const { computeInformationGainPerReal } = require('./informationGain');
const { adjustConfidenceForPriorLearning, normalizeExpectedValueScores } = require('../decision/expectedValue');

// VALIDATION_METHOD (PASSO 9.1, itens 6-7) — como esta variável PODE ser pré-validada antes de
// (ou em vez de) gastar mídia num experimento controlado. Tabela fixa por variável, documentada
// — nunca escolhida por candidato pra favorecer um resultado específico:
//   CTA_VISIBILITY/PRICE_PRESENTATION : posição/visibilidade é um fato do markup — dá pra checar
//     manualmente (clique real) quase sem custo antes de qualquer experimento.
//   GUARANTEE : presença/posição já é verificável direto no HTML (STATIC_CODE_CHECK).
//   PAGE_SPEED/HERO/MOBILE_LAYOUT : dá pra inspecionar/testar funcionalmente sem tráfego pago.
//   HEADLINE/PROOF : não existe atalho barato — só se aprende se a nova versão converte melhor
//     rodando o experimento de verdade com tráfego real.
const VALIDATION_METHOD_BY_VARIABLE = {
  CTA_VISIBILITY: 'FUNCTIONAL_TEST',
  PRICE_PRESENTATION: 'STATIC_CODE_CHECK',
  GUARANTEE: 'STATIC_CODE_CHECK',
  PAGE_SPEED: 'FUNCTIONAL_TEST',
  HERO: 'FUNCTIONAL_TEST',
  MOBILE_LAYOUT: 'FUNCTIONAL_TEST',
  HEADLINE: 'CONTROLLED_EXPERIMENT',
  PROOF: 'CONTROLLED_EXPERIMENT',
};

// IMPLEMENTATION COST (PASSO 9, item 24) — classificação documentada, não estética. LOW = troca
// de texto/reordenação de elemento já existente; MEDIUM = criar elemento novo (proof, hero
// visual); HIGH = mudança técnica/estrutural (performance, reconstrução de seção inteira).
const IMPLEMENTATION_COST_BY_VARIABLE = {
  HEADLINE: 'LOW', CTA_VISIBILITY: 'LOW', GUARANTEE: 'LOW', PRICE_PRESENTATION: 'LOW',
  HERO: 'MEDIUM', PROOF: 'MEDIUM', MOBILE_LAYOUT: 'MEDIUM',
  PAGE_SPEED: 'HIGH',
};
const COST_MULTIPLIER = { LOW: 1.0, MEDIUM: 0.7, HIGH: 0.4 };

// Mesma família de custo/risco/tempo do Creative Agent (consistência entre engines).
const RELATIVE_COST = { EXPLOIT: 1, EXPLORE: 2 };
const RISK = { EXPLOIT: 1, EXPLORE: 2 };
const TIME_TO_EVIDENCE_DAYS = 7; // minimum_evidence.duration_days da categoria CRO
const LEARNING_VALUE_MULTIPLIER = { EXPLOIT: 1.0, EXPLORE: 1.3 };
const CAUSALITY_MULTIPLIER = { VALID: 1.0, WEAK: 0.5 }; // INVALID nunca chega aqui — filtrado antes

function buildCandidate({ id, variableChanged, targetMetric, mode, currentState, proposedDirection, reasonToTest, evidence, evidenceSources = [], productId, landingPageId, funnelMetrics, hypotheses, baselineValue, expectedDirection }) {
  const causality = validateCroCausalTarget(variableChanged, targetMetric);
  if (causality.status === 'INVALID') return null; // NUNCA entra no ranking (item 13)

  const priorLearning = checkCroPriorLearning({ productId, targetMetric, variableChanged }, hypotheses || []);
  const baseConfidence = 0.6; // sem histórico de score prévio pra esta LP (só existe LP-V1) — confidence de partida documentada, não inventada por variável
  const priorAdjustedConfidence = adjustConfidenceForPriorLearning(baseConfidence, priorLearning.verdict);
  const adjustedConfidence = Math.min(1, priorAdjustedConfidence * CAUSALITY_MULTIPLIER[causality.status]);

  const implementationCost = IMPLEMENTATION_COST_BY_VARIABLE[variableChanged] || 'MEDIUM';
  const costMultiplier = COST_MULTIPLIER[implementationCost];
  const validationMethod = VALIDATION_METHOD_BY_VARIABLE[variableChanged] || 'CONTROLLED_EXPERIMENT';
  const budgetInfo = estimateBudgetForCroCandidate(funnelMetrics, minimumEvidenceFor('CRO'));
  const informationGainPerReal = computeInformationGainPerReal(validationMethod, budgetInfo.budget_estimate);

  // impacto esperado: PROXY determinístico (não projeção financeira) — gap entre o baseline
  // atual e o LOW_INTENT_THRESHOLD documentado (quanto mais abaixo do limiar, mais espaço de
  // melhora plausível). Nunca um número de resultado garantido.
  const impactProxy = baselineValue != null ? Math.max(0.1, 1 - baselineValue / 0.15) : 0.2;

  const relativeCost = RELATIVE_COST[mode];
  const risk = RISK[mode];
  const rawPriority = (Math.max(impactProxy, 0.05) * adjustedConfidence * LEARNING_VALUE_MULTIPLIER[mode] * costMultiplier) / (relativeCost * TIME_TO_EVIDENCE_DAYS * risk);

  const hypothesis = buildCroHypothesis({
    productId, landingPageId, variableChanged, currentState, proposedDirection, targetMetric,
    expectedDirection, reason: reasonToTest, evidence, causality: causality.status, confidence: adjustedConfidence, priorLearningStatus: priorLearning.verdict,
  });

  const candidate = {
    candidate_id: id,
    product_id: productId,
    parent_landing_page_version: landingPageId,
    proposed_version: `${landingPageId}-V${(parseInt((landingPageId.match(/V(\d+)/) || [null, '1'])[1], 10) + 1)}`,
    mode,
    variable_changed: variableChanged,
    preserved_elements: Object.keys(IMPLEMENTATION_COST_BY_VARIABLE).filter((v) => v !== variableChanged),
    proposed_change: {
      direction: proposedDirection,
      note: 'Direção conceitual, não copy final — ver PASSO 9 item 32 (não inventar copy definitiva).',
    },
    hypothesis,
    target_metric: targetMetric,
    causality,
    expected_effect: {
      target_metric: targetMetric,
      expected_direction: expectedDirection,
      baseline_value: baselineValue,
      note: 'Proxy determinístico (gap vs limiar documentado) — NÃO é projeção financeira nem número garantido.',
    },
    confidence: Math.round(adjustedConfidence * 100) / 100,
    risk,
    implementation_cost: implementationCost,
    learning_value: mode === 'EXPLORE' ? 'HIGH' : 'MEDIUM',
    prior_learning_status: priorLearning.verdict,
    // PASSO 9.1 — evidence_sources é uma lista ESTRUTURADA (não prosa) pra que evidence_quality
    // no tie-break (ranking.js) seja uma contagem real e auditável, nunca um número inventado.
    evidence_sources: evidenceSources,
    validation_method: validationMethod,
    information_gain_per_real: informationGainPerReal,
    pre_experiment_validation: {
      validation_method: validationMethod,
      estimated_validation_cost_reais: validationMethod === 'CONTROLLED_EXPERIMENT' ? budgetInfo.budget_estimate : 0,
      note: validationMethod === 'CONTROLLED_EXPERIMENT'
        ? 'Sem atalho barato documentado — só se aprende rodando o experimento controlado com tráfego real.'
        : `Pode ser pré-validado via ${validationMethod} antes de qualquer gasto de mídia (custo ~R$0).`,
    },
    cro_brief: buildCroBrief({ variableChanged, proposedDirection, targetMetric, expectedDirection, currentState, hypothesis }),
    _raw_priority: rawPriority,
  };

  return { ...candidate, ...toExperimentCompatibleFields(candidate, funnelMetrics) };
}

function buildCroBrief({ variableChanged, proposedDirection, targetMetric, expectedDirection, currentState, hypothesis }) {
  return {
    objective: `Testar isoladamente "${variableChanged}" na LP atual, preservando as demais variáveis principais.`,
    observation: currentState || 'Ver diagnostics.js pra observação completa que originou este candidato.',
    hypothesis: hypothesis.statement,
    current_state: currentState,
    proposed_change: proposedDirection, // DIREÇÃO, nunca copy final (item 32)
    preserve: Object.keys(IMPLEMENTATION_COST_BY_VARIABLE).filter((v) => v !== variableChanged),
    avoid: 'Não alterar mais de uma variável principal ao mesmo tempo — isolamento causal (item 20).',
    target_metric: targetMetric,
    expected_direction: expectedDirection,
    mobile_requirements: 'Tráfego majoritariamente mobile/in-app (Instagram) — validar a mudança primeiro no viewport mobile antes do desktop.',
    desktop_requirements: 'Manter paridade visual com a versão mobile; não é o viewport prioritário pra esta LP.',
    measurement_plan: `Comparar ${targetMetric} da LP com a mudança vs baseline da LP atual, mesmo período mínimo de evidência.`,
    minimum_evidence: 'Ver minimum_evidence da categoria CRO (lpv>=100, checkouts>=10, 7 dias) — mesmo padrão do CRO-001.',
    success_condition: `${targetMetric} do período de teste melhora na direção esperada (${expectedDirection}) vs baseline.`,
    failure_condition: `${targetMetric} do período de teste não melhora, ou piora, vs baseline.`,
    rollback_condition: 'Reverter pra versão anterior da LP se failure_condition for atingida antes do minimum_evidence completo, ou se uma métrica de camada anterior (ARRIVAL/FIRST_VIEW) piorar drasticamente.',
  };
}

/**
 * generateCroCandidates() (PASSO 9, item 19) — NÃO altera código da LP. Gera 3-5 especificações
 * (EXPLOIT ataca o diagnóstico com mais evidência atual — o refinamento do próprio CRO-001;
 * EXPLORE testa ângulos ainda não cobertos). Candidatos INVALID nunca aparecem (filtrados em
 * buildCandidate).
 */
function generateCroCandidates({ productId, landingPageId, funnelMetrics, cro001Analysis, hypotheses = [], croDna = {} }) {
  const baselineIntent = funnelMetrics.lpv_to_checkout_rate;
  const candidates = [];

  // EXPLOIT #1 — refinamento direto do CRO-001 real: isolar a variável recomendada pela própria
  // análise (ver cro001Analysis.js), com a maior base de evidência disponível hoje.
  const firstVar = cro001Analysis?.recommended_variable_to_isolate_first?.variable || 'CTA_VISIBILITY';
  candidates.push(buildCandidate({
    id: 'CRO-CAND-001', variableChanged: firstVar, targetMetric: 'lpv_to_checkout_rate', mode: 'EXPLOIT',
    currentState: 'Oferta/CTA de conversão só aparece depois de rolar a página (hero não expõe preço/oferta direto) — ver CRO DNA e section map.',
    proposedDirection: 'Reduzir a dependência de scroll pra alcançar a oferta/CTA principal na primeira dobra, sem remover o conteúdo de qualificação/prova.',
    reasonToTest: `refinamento do CRO-001 real (MULTI_VARIABLE_TEST detectado — ver cro001Analysis) isolando a variável com relação causal mais direta a ${'lpv_to_checkout_rate'}`,
    evidence: 'cro001Analysis.js: CRO-001 combina 3 variáveis; CTA_VISIBILITY validado como relação causal direta; id="oferta" duplicado no HTML real (ver diagnostics.js) reforça que a navegação até a oferta pode ter fricção extra.',
    evidenceSources: [
      { type: 'HISTORICAL_HYPOTHESIS', source: 'CRO-001 hypothesis.change — citação de Clarity histórica, não reconfirmada nesta execução.' },
      { type: 'TECHNICAL_OBSERVATION', source: 'CRO-DIAG-DUPLICATE-ID-OFERTA (HTML real, existence_confidence HIGH).' },
    ],
    productId, landingPageId, funnelMetrics, hypotheses, baselineValue: baselineIntent, expectedDirection: 'INCREASE',
  }));

  // EXPLOIT #2 — a 2ª variável do bundle original do CRO-001, agora isolada.
  const secondVar = firstVar === 'HEADLINE' ? 'CTA_VISIBILITY' : 'HEADLINE';
  candidates.push(buildCandidate({
    id: 'CRO-CAND-002', variableChanged: secondVar, targetMetric: 'lpv_to_checkout_rate', mode: 'EXPLOIT',
    currentState: `Headline atual: "${croDna.headline || 'ver croDna.headline'}" — promessa focada na entrega (scripts prontos), sem citar diretamente o problema específico do visitante nos primeiros segundos.`,
    proposedDirection: 'Aproximar os primeiros segundos de leitura (headline/hook) do problema específico e imediato do visitante, mantendo o restante da primeira dobra igual.',
    reasonToTest: 'segunda variável bundlada no CRO-001 real (hook nos 2-3s iniciais), agora isolada pra permitir aprendizado causal limpo.',
    evidence: 'cro001Analysis.js: HEADLINE validado como relação causal direta com lpv_to_checkout_rate; parte do texto original de hypothesis.change do CRO-001.',
    evidenceSources: [
      { type: 'HISTORICAL_HYPOTHESIS', source: 'CRO-001 hypothesis.change — citação de Clarity histórica, não reconfirmada nesta execução.' },
    ],
    productId, landingPageId, funnelMetrics, hypotheses, baselineValue: baselineIntent, expectedDirection: 'INCREASE',
  }));

  // EXPLORE #1 — ângulo não coberto pelo CRO-001 original: prova/confiança antes da oferta.
  candidates.push(buildCandidate({
    id: 'CRO-CAND-003', variableChanged: 'PROOF', targetMetric: 'lpv_to_checkout_rate', mode: 'EXPLORE',
    currentState: 'A LP tem 2 mockups de "antes e depois" de WhatsApp como prova, mas nenhum depoimento/avaliação real de cliente (ver croDna: testimonials=null, social_proof=null).',
    proposedDirection: 'Adicionar um elemento de prova social real (depoimento, avaliação ou contador verificável) antes da seção de oferta — só se houver material real disponível, nunca fabricado.',
    reasonToTest: 'ângulo estruturalmente diferente do CRO-001 (que só atacava fricção/velocidade/hook) — testa se a ausência de prova social real é um fator de conversão relevante.',
    evidence: 'croDna.js: testimonials e social_proof confirmados ausentes na LP real (busca não encontrou nenhum).',
    evidenceSources: [
      { type: 'STRUCTURAL_OBSERVATION', source: 'croDna.testimonials/social_proof confirmados ausentes na LP real (extractCroDnaFromParsedPage).' },
    ],
    productId, landingPageId, funnelMetrics, hypotheses, baselineValue: baselineIntent, expectedDirection: 'INCREASE',
  }));

  // EXPLORE #2 — reposicionar a garantia (já existe, mas só aparece perto do fim/oferta).
  candidates.push(buildCandidate({
    id: 'CRO-CAND-004', variableChanged: 'GUARANTEE', targetMetric: 'lpv_to_checkout_rate', mode: 'EXPLORE',
    currentState: 'Garantia de 7 dias já existe e aparece 3x na LP (badge no hero, seção de preço, seção final) — ver croDna.guarantee.',
    proposedDirection: 'Testar destacar visualmente a garantia mais cedo/perto do CTA principal (não criar uma garantia nova, só reposicionar/reforçar a existente).',
    reasonToTest: 'a garantia já existe e é forte (incondicional, 7 dias) — testar se reposicioná-la mais perto da decisão de avançar reduz a fricção de risco percebido.',
    evidence: 'croDna.js: guarantee confirmado presente 3x no HTML real; causalityMap.js: GUARANTEE validado como relação causal direta.',
    evidenceSources: [
      { type: 'STRUCTURAL_OBSERVATION', source: 'croDna.guarantee confirmado presente 3x no HTML real (extractCroDnaFromParsedPage).' },
    ],
    productId, landingPageId, funnelMetrics, hypotheses, baselineValue: baselineIntent, expectedDirection: 'INCREASE',
  }));

  const valid = candidates.filter(Boolean);
  const normalized = normalizeExpectedValueScores(valid.map((c) => ({ ...c, expected_value: { raw_ev: c._raw_priority } })));
  return normalized.map(({ _raw_priority, expected_value, ...c }) => ({ ...c, priority_score: expected_value.expected_value_score }));
}

module.exports = { generateCroCandidates, IMPLEMENTATION_COST_BY_VARIABLE, COST_MULTIPLIER, VALIDATION_METHOD_BY_VARIABLE };
