'use strict';

const { buildOfferHypothesis } = require('./hypothesis');
const { checkOfferPriorLearning } = require('./priorLearning');
const { validateOfferCausalTarget, normalizeMetricName } = require('./causalityMap');
const { toExperimentCompatibleFields } = require('./experimentCompat');
const { computeMinimumAttachRateForPositiveIncrementalValue } = require('./breakEven');
const { adjustConfidenceForPriorLearning, normalizeExpectedValueScores } = require('../decision/expectedValue');

// PASSO 10.1, item 11 — só penaliza candidatos cujo target_metric dependa DIRETAMENTE do attach
// rate buyer-level; métricas de receita agregada (net_aov, net_revenue_per_buyer...) continuam
// confiáveis mesmo sem linkage total, e não são penalizadas por esta flag.
const ATTRIBUTION_CONFIDENCE_MULTIPLIER_BY_STATUS = {
  ATTRIBUTED_STRUCTURAL: 1.0,
  PARTIAL_ATTRIBUTION_LOWER_BOUND: 0.8,
  NOT_ATTRIBUTABLE_AT_BUYER_LEVEL: 0.5,
  NO_BUMP_TRANSACTIONS: 1.0,
};

// IMPLEMENTATION COST (mesma escala 0-1 documentada do CRO Agent — item 24/35).
const IMPLEMENTATION_COST_BY_VARIABLE = {
  BUMP_COPY: 'LOW', BUMP_PRICE: 'LOW', GUARANTEE: 'LOW',
  BUNDLE_DISCOUNT: 'MEDIUM', UPSELL_OFFER_DESIGN: 'HIGH', UPSELL_PRICE: 'MEDIUM', DOWNSELL_PRICE: 'MEDIUM',
};
const COST_MULTIPLIER = { LOW: 1.0, MEDIUM: 0.7, HIGH: 0.4 };

// OPTIMIZE_EXISTING_COMPONENT vs ADD_NEW_COMPONENT (item 32) — otimizar algo com dado real
// observado tem MENOS incerteza que introduzir uma estrutura nova. Documentado, não estético.
const ACTION_TYPE_BY_VARIABLE = {
  BUMP_COPY: 'OPTIMIZE_EXISTING_COMPONENT', BUMP_PRICE: 'OPTIMIZE_EXISTING_COMPONENT', GUARANTEE: 'OPTIMIZE_EXISTING_COMPONENT',
  BUNDLE_DISCOUNT: 'ADD_NEW_COMPONENT', UPSELL_OFFER_DESIGN: 'ADD_NEW_COMPONENT', UPSELL_PRICE: 'ADD_NEW_COMPONENT', DOWNSELL_PRICE: 'ADD_NEW_COMPONENT',
};
const ACTION_TYPE_CONFIDENCE_MULTIPLIER = { OPTIMIZE_EXISTING_COMPONENT: 1.0, ADD_NEW_COMPONENT: 0.6 };
const ACTION_TYPE_RISK = { OPTIMIZE_EXISTING_COMPONENT: 1, ADD_NEW_COMPONENT: 3 };

const RELATIVE_COST = { EXPLOIT: 1, EXPLORE: 2 };
const TIME_TO_EVIDENCE_DAYS = 14; // minimum_evidence.duration_days de AOV/OFFER (evidence.js)
const LEARNING_VALUE_MULTIPLIER = { EXPLOIT: 1.0, EXPLORE: 1.3 };
const CAUSALITY_MULTIPLIER = { VALID: 1.0, WEAK: 0.5 }; // INVALID nunca chega aqui — filtrado antes
const CAUSAL_DISTANCE_MULTIPLIER = { DIRECT: 1.0, INDIRECT: 0.8 };

// INFORMATION GAIN (PASSO 10, item 53 — mesmo conceito aprendido no CRO Agent): se dá pra
// aprender sobre a hipótese analisando dado JÁ EXISTENTE (BEHAVIORAL_DATA) em vez de comprometer
// capital num experimento controlado, isso pesa a favor no desempate. Tabela documentada, fixa
// por variável — nunca escolhida por candidato pra favorecer um resultado.
const VALIDATION_METHOD_BY_VARIABLE = {
  BUMP_COPY: 'BEHAVIORAL_DATA', // já dá pra olhar o padrão real de attach por período/segmento
  BUNDLE_DISCOUNT: 'BEHAVIORAL_DATA', // dá pra modelar com cannibalization.js usando dado real dos bumps individuais
  BUMP_PRICE: 'CONTROLLED_EXPERIMENT', // não existe atalho barato pra saber se novo preço muda attach
  UPSELL_OFFER_DESIGN: 'CONTROLLED_EXPERIMENT', // não existe estrutura nem dado prévio
  UPSELL_PRICE: 'CONTROLLED_EXPERIMENT',
  DOWNSELL_PRICE: 'CONTROLLED_EXPERIMENT',
  GUARANTEE: 'BEHAVIORAL_DATA',
};
const CONFIDENCE_GAIN_BY_METHOD = { STATIC_CODE_CHECK: 40, FUNCTIONAL_TEST: 60, BEHAVIORAL_DATA: 50, CONTROLLED_EXPERIMENT: 90 };
function computeInformationGainPerReal(validationMethod, controlledExperimentCostEstimate) {
  const confidenceGain = CONFIDENCE_GAIN_BY_METHOD[validationMethod] ?? 0;
  const cost = validationMethod === 'CONTROLLED_EXPERIMENT' ? Math.max(controlledExperimentCostEstimate ?? 300, 1) : 1; // métodos de dado existente ~R$0, piso R$1 (nunca divide por zero)
  return Math.round((confidenceGain / cost) * 1000) / 1000;
}

function buildCandidate({ id, variableChanged, targetMetric, mode, currentState, proposedDirection, reasonToTest, evidence, productId, offerId, economics, dataQuality, hypotheses, expectedDirection, buyerAttribution }) {
  const causality = validateOfferCausalTarget(variableChanged, targetMetric);
  if (causality.status === 'INVALID') return null; // NUNCA entra no ranking (item 18)

  const actionType = ACTION_TYPE_BY_VARIABLE[variableChanged] || 'ADD_NEW_COMPONENT';
  const priorLearning = checkOfferPriorLearning({ productId, category: actionType === 'OPTIMIZE_EXISTING_COMPONENT' ? 'AOV' : 'OFFER', targetMetric, variableChanged }, hypotheses || []);

  const baseConfidence = 0.6 * ACTION_TYPE_CONFIDENCE_MULTIPLIER[actionType];
  const priorAdjustedConfidence = adjustConfidenceForPriorLearning(baseConfidence, priorLearning.verdict);
  const causalMultiplier = CAUSALITY_MULTIPLIER[causality.status] * CAUSAL_DISTANCE_MULTIPLIER[causality.causal_distance];
  const dataQualityMultiplier = dataQuality != null ? Math.max(0.3, dataQuality) : 0.5;

  // PASSO 10.1, item 11 — penalidade SÓ quando o target_metric normalizado é o attach rate
  // buyer-level em si; métricas de receita agregada (net_aov etc) não usam este multiplicador.
  const targetsBuyerLevelAttach = normalizeMetricName(targetMetric) === 'bump_attach_rate';
  const attributionStatus = buyerAttribution ? buyerAttribution.buyer_level_attach_rate_status : null;
  const attributionConfidenceMultiplier = targetsBuyerLevelAttach && attributionStatus
    ? (ATTRIBUTION_CONFIDENCE_MULTIPLIER_BY_STATUS[attributionStatus] ?? 1.0)
    : 1.0;

  const adjustedConfidence = Math.min(1, priorAdjustedConfidence * causalMultiplier * dataQualityMultiplier * attributionConfidenceMultiplier);

  const implementationCost = IMPLEMENTATION_COST_BY_VARIABLE[variableChanged] || 'MEDIUM';
  const costMultiplier = COST_MULTIPLIER[implementationCost];
  const risk = ACTION_TYPE_RISK[actionType];
  const validationMethod = VALIDATION_METHOD_BY_VARIABLE[variableChanged] || 'CONTROLLED_EXPERIMENT';
  const informationGainPerReal = computeInformationGainPerReal(validationMethod);

  // Refund/cannibalization risk penalty (item 35) — sem dado suficiente pra afirmar risco
  // elevado, o multiplicador fica neutro (1.0), nunca penalizado por suposição.
  const refundRiskPenalty = economics.refund_rate != null && economics.refund_rate > 0.05 && actionType === 'ADD_NEW_COMPONENT' ? 1.2 : 1.0;
  const cannibalizationRiskPenalty = variableChanged === 'BUNDLE_DISCOUNT' ? 1.3 : 1.0; // bundle SEMPRE carrega risco estrutural de canibalização (item 14) — nunca "melhora AOV automaticamente"

  // impacto: PROXY determinístico (não uma projeção financeira) — baseado no tamanho da lacuna
  // de monetização (item 49/1): quanto MENOR a contribuição atual do componente, maior o espaço
  // proxy de melhora. Nunca um número de receita garantido.
  const impactProxy = actionType === 'OPTIMIZE_EXISTING_COMPONENT' ? 0.5 : 0.3; // ADD_NEW tem potencial maior mas mais incerto — refletido na confidence/risk, não aqui

  const relativeCost = RELATIVE_COST[mode];
  const rawPriority = (impactProxy * adjustedConfidence * LEARNING_VALUE_MULTIPLIER[mode] * costMultiplier) / (relativeCost * TIME_TO_EVIDENCE_DAYS * risk * refundRiskPenalty * cannibalizationRiskPenalty);

  const hypothesis = buildOfferHypothesis({
    productId, offerId, variableChanged, currentState, proposedDirection, targetMetric,
    expectedDirection, reason: reasonToTest, evidence, causality: causality.status, confidence: adjustedConfidence, priorLearningStatus: priorLearning.verdict,
  });

  // ECONOMIC VALUE (item 36) — NUNCA inventa taxa pra estimar impacto da MUDANÇA proposta (só
  // temos a taxa ATUAL, não a taxa depois da mudança) — por isso é sempre NOT_ESTIMABLE aqui,
  // deliberadamente, até existir um resultado real de experimento informando a nova taxa.
  const estimatedIncrementalNetRevenuePer100Buyers = 'NOT_ESTIMABLE';

  const breakEven = actionType === 'ADD_NEW_COMPONENT'
    ? computeMinimumAttachRateForPositiveIncrementalValue({ componentPrice: null, componentCostIfKnown: null })
    : { minimum_attach_rate: 'NOT_CALCULABLE', reason: 'Componente existente já tem attach rate observado — break-even de um componente NOVO não se aplica.' };

  const candidate = {
    candidate_id: id,
    product_id: productId,
    parent_offer_version: offerId,
    proposed_version: `${offerId}-V${(parseInt((offerId.match(/V(\d+)/) || [null, '1'])[1], 10) + 1)}`,
    mode,
    action_type: actionType,
    variable_changed: variableChanged,
    preserved_elements: Object.keys(IMPLEMENTATION_COST_BY_VARIABLE).filter((v) => v !== variableChanged),
    proposed_change: { direction: proposedDirection, note: 'Direção conceitual, não copy/nome/preço final — item 51 (não inventar produtos).' },
    hypothesis,
    target_metric: targetMetric,
    causality,
    expected_effect: {
      target_metric: targetMetric,
      expected_direction: expectedDirection,
      note: 'Proxy determinístico de oportunidade — NÃO é projeção financeira. Nenhum número de resultado é garantido.',
    },
    confidence: Math.round(adjustedConfidence * 100) / 100,
    buyer_level_attribution: {
      targets_buyer_level_attach: targetsBuyerLevelAttach,
      status: targetsBuyerLevelAttach ? attributionStatus : 'NOT_APPLICABLE',
      confidence_multiplier: targetsBuyerLevelAttach ? attributionConfidenceMultiplier : 1.0,
      note: targetsBuyerLevelAttach
        ? 'target_metric depende de attach rate buyer-level — confidence ajustada pelo status real de linkage (PASSO 10.1, item 11).'
        : 'target_metric não depende de attach rate buyer-level (ex.: receita agregada) — não penalizado por limitação de linkage.',
    },
    risk,
    implementation_cost: implementationCost,
    learning_value: mode === 'EXPLORE' ? 'HIGH' : 'MEDIUM',
    speed_to_evidence_days: TIME_TO_EVIDENCE_DAYS,
    prior_learning_status: priorLearning.verdict,
    estimated_incremental_net_revenue_per_100_buyers: estimatedIncrementalNetRevenuePer100Buyers,
    break_even_analysis: breakEven,
    evidence_sources: evidence || [],
    validation_method: validationMethod,
    information_gain_per_real: informationGainPerReal,
    pre_experiment_validation: {
      validation_method: validationMethod,
      note: validationMethod === 'CONTROLLED_EXPERIMENT'
        ? 'Sem atalho barato documentado — só se aprende rodando o experimento controlado.'
        : `Pode ser pré-validado analisando dado JÁ EXISTENTE (${validationMethod}) antes de comprometer capital num experimento novo.`,
    },
    offer_brief: buildOfferBrief({ variableChanged, proposedDirection, targetMetric, expectedDirection, currentState, hypothesis, actionType }),
    _raw_priority: rawPriority,
  };

  return { ...candidate, ...toExperimentCompatibleFields(candidate) };
}

function buildOfferBrief({ variableChanged, proposedDirection, targetMetric, expectedDirection, currentState, hypothesis, actionType }) {
  return {
    objective: `Testar isoladamente "${variableChanged}" na oferta atual (${actionType}), preservando as demais variáveis principais.`,
    observation: currentState || 'Ver diagnostics.js pra observação completa que originou este candidato.',
    hypothesis: hypothesis.statement,
    current_state: currentState,
    proposed_change: proposedDirection, // DIREÇÃO, nunca copy/nome/preço final (item 51)
    preserve: Object.keys(IMPLEMENTATION_COST_BY_VARIABLE).filter((v) => v !== variableChanged),
    avoid: 'Não alterar mais de uma variável principal ao mesmo tempo — isolamento causal (item 31).',
    target_metric: targetMetric,
    secondary_metrics: ['net_aov', 'refund_rate'],
    expected_direction: expectedDirection,
    measurement_plan: `Comparar ${targetMetric} da oferta com a mudança vs baseline da oferta atual, mesmo período mínimo de evidência.`,
    minimum_evidence: 'Ver minimum_evidence da categoria AOV/OFFER (compras>=15, 14 dias) — mesmo padrão do AOV-001.',
    success_condition: `${targetMetric} do período de teste melhora na direção esperada (${expectedDirection}) vs baseline.`,
    failure_condition: `${targetMetric} do período de teste não melhora, ou piora, vs baseline.`,
    kill_condition: 'refund_rate do período de teste sobe de forma desproporcional ao ganho de AOV (guardrail financeiro), ou net_aov cai abaixo do baseline.',
    refund_guardrail: 'Nenhuma mudança é considerada sucesso se aumentar refund_rate a ponto de neutralizar o ganho de receita líquida.',
    cannibalization_guardrail: actionType === 'ADD_NEW_COMPONENT' ? 'Medir receita dos componentes existentes durante o teste — queda nos componentes atuais deve ser descontada do ganho aparente (ver cannibalization.js).' : 'Não aplicável — otimização de componente existente, sem novo componente concorrendo.',
    financial_guardrail: 'Hotmart é a fonte de verdade financeira — nunca decidir sucesso/fracasso com base em métrica de mídia (Meta Purchase != buyer financeiro).',
  };
}

/**
 * generateOfferCandidates() (PASSO 10, item 30) — NÃO cria produto/preço/checkout real. Gera
 * 3-5 briefs (EXPLOIT ataca componentes existentes com dado real; EXPLORE explora lacunas de
 * monetização — item 21/33). Candidatos INVALID nunca aparecem.
 */
function generateOfferCandidates({ productId, offerId, economics, diagnostics = [], hypotheses = [], buyerAttribution = null }) {
  const candidates = [];
  const dataQuality = economics.period ? economics.period.data_completeness : 0.5;

  const ba = buyerAttribution || {};
  const proxyPct = economics.order_bump_attach_rate != null ? (economics.order_bump_attach_rate * 100).toFixed(1) + '%' : 'indisponível';
  const buyerLevelPct = ba.buyer_level_attach_rate != null ? (ba.buyer_level_attach_rate * 100).toFixed(1) + '%' : 'null (NOT_ATTRIBUTABLE)';
  const attributionCaveat = ba.buyer_level_attach_rate_status === 'PARTIAL_ATTRIBUTION_LOWER_BOUND'
    ? ` — LIMITE INFERIOR: ${ba.bump_transactions_without_structural_link} transação(ões) de bump sem ligação estrutural confirmada.`
    : (ba.buyer_level_attach_rate_status === 'NOT_ATTRIBUTABLE_AT_BUYER_LEVEL' ? ' — nenhuma ligação estrutural confirmada.' : '.');

  candidates.push(buildCandidate({
    id: 'OFFER-CAND-001', variableChanged: 'BUMP_COPY', targetMetric: 'order_bump_attach_rate', mode: 'EXPLOIT',
    // PASSO 10.1, item 10 — nunca apresenta o proxy de transação como se fosse fato buyer-level.
    currentState: `bump_transactions_per_buyer (proxy no nível de transação): ${proxyPct} (Pack Objeções + Pack Cobrança, ativos hoje). buyer_level_attach_rate (ligação estrutural confirmada): ${buyerLevelPct}${attributionCaveat}`,
    proposedDirection: 'Reforçar a apresentação/copy do bump existente na tela de checkout (mesmo mecanismo do AOV-001 real), sem alterar preço nem criar produto novo.',
    reasonToTest: 'refinamento do AOV-001 real — a hipótese original já aponta o attach rate atual como ponto de partida.',
    evidence: [
      { type: 'HISTORICAL_HYPOTHESIS', source: 'AOV-001 hypothesis.change (bundle Núcleo+Objeções+Cobrança).' },
      { type: 'OBSERVED_REVENUE', source: 'economics.order_bump_revenue_gross real, 30 dias (receita agregada, confiável independente de linkage).' },
      { type: 'TRANSACTION_LEVEL_PROXY', source: `bump_transactions_per_buyer = ${proxyPct} (buyerAttribution.js) — não é attach rate buyer-level.` },
      { type: 'BUYER_LEVEL_ATTRIBUTION_LIMITATION', source: `buyer_level_attach_rate = ${buyerLevelPct}, status=${ba.buyer_level_attach_rate_status || 'desconhecido'} — ver OFFER-DIAG-BUMP-BUYER-ATTRIBUTION-FLAG.` },
    ],
    productId, offerId, economics, dataQuality, hypotheses, expectedDirection: 'INCREASE', buyerAttribution: ba,
  }));

  candidates.push(buildCandidate({
    id: 'OFFER-CAND-002', variableChanged: 'BUMP_PRICE', targetMetric: 'net_aov', mode: 'EXPLOIT',
    currentState: `Bumps ativos hoje: Pack Objeções (~R$19,90) e Pack Cobrança (~R$14,90), preço médio real observado. net_aov é receita agregada por comprador financeiro — confiável independente da limitação de linkage buyer-level do attach rate.`,
    proposedDirection: 'Testar um ponto de preço diferente pro(s) bump(s) existente(s), sem criar produto novo.',
    reasonToTest: 'ângulo de preço, distinto do ângulo de copy — variável isolada (item 31).',
    evidence: [{ type: 'OBSERVED_METRIC', source: 'sourceOfTruth.js: preço médio real dos bumps ativos.' }],
    productId, offerId, economics, dataQuality, hypotheses, expectedDirection: 'INCREASE', buyerAttribution: ba,
  }));

  candidates.push(buildCandidate({
    id: 'OFFER-CAND-003', variableChanged: 'UPSELL_OFFER_DESIGN', targetMetric: 'net_revenue_per_buyer', mode: 'EXPLORE',
    currentState: 'Nenhum upsell real existe hoje (MISSING_MONETIZATION_LAYER, ver diagnostics.js).',
    proposedDirection: 'Explorar estruturalmente uma oferta de upsell pós-compra — sem definir nome, copy ou preço final ainda (item 51).',
    reasonToTest: 'lacuna de monetização estrutural observada (POST_PURCHASE_UPSELL é NOT_IMPLEMENTED) — maior valor de aprendizado, mas maior incerteza (ADD_NEW_COMPONENT).',
    evidence: [{ type: 'STRUCTURAL_OBSERVATION', source: 'OFFER-DIAG-MISSING-MONETIZATION-LAYER — nenhum upsell/downsell/bundle ativo hoje.' }],
    productId, offerId, economics, dataQuality, hypotheses, expectedDirection: 'INCREASE', buyerAttribution: ba,
  }));

  candidates.push(buildCandidate({
    id: 'OFFER-CAND-004', variableChanged: 'BUNDLE_DISCOUNT', targetMetric: 'net_aov', mode: 'EXPLORE',
    currentState: 'Nenhum bundle real existe hoje — AOV-001 já menciona um bundle conceitual (Núcleo+Objeções+Cobrança), mas nunca foi implementado (PLANNED, não ACTIVE).',
    proposedDirection: 'Explorar estruturalmente um bundle dos bumps existentes com desconto, medindo canibalização (ver cannibalization.js) antes de assumir ganho de AOV.',
    reasonToTest: 'a própria hipótese do AOV-001 já aponta pra essa direção — nunca assumir que bundle melhora AOV automaticamente (item 14).',
    evidence: [{ type: 'HISTORICAL_HYPOTHESIS', source: 'AOV-001 hypothesis.change menciona bundle explicitamente.' }],
    productId, offerId, economics, dataQuality, hypotheses, expectedDirection: 'INCREASE', buyerAttribution: ba,
  }));

  const valid = candidates.filter(Boolean);
  const normalized = normalizeExpectedValueScores(valid.map((c) => ({ ...c, expected_value: { raw_ev: c._raw_priority } })));
  return normalized.map(({ _raw_priority, expected_value, ...c }) => ({ ...c, priority_score: expected_value.expected_value_score }));
}

module.exports = {
  generateOfferCandidates, IMPLEMENTATION_COST_BY_VARIABLE, COST_MULTIPLIER,
  ACTION_TYPE_BY_VARIABLE, ACTION_TYPE_CONFIDENCE_MULTIPLIER, ACTION_TYPE_RISK,
};
