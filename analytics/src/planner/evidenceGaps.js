'use strict';

// item 13 — mesma filosofia de information_gain aprendida no CRO/Offer: preferir evidência
// barata+decisiva antes de experimento caro+pouco informativo. Nunca regra absoluta (item 60).
const CONFIDENCE_GAIN_BY_METHOD = { STATIC_CODE_CHECK: 40, FUNCTIONAL_TEST: 60, BEHAVIORAL_DATA: 50, CONTROLLED_EXPERIMENT: 90 };
const DEFAULT_COST_BY_METHOD = { STATIC_CODE_CHECK: 0, FUNCTIONAL_TEST: 0, BEHAVIORAL_DATA: 0, CONTROLLED_EXPERIMENT: 300 };

function computeInformationGainPerReal(validationMethod, costEstimate) {
  const gain = CONFIDENCE_GAIN_BY_METHOD[validationMethod] ?? 30;
  const cost = Math.max(costEstimate ?? DEFAULT_COST_BY_METHOD[validationMethod] ?? 100, 1);
  return Math.round((gain / cost) * 1000) / 1000;
}

// item 16 — definição FORMAL de DECISION_CRITICAL: só qualifica se o resultado puder
// plausivelmente mudar pelo menos um destes. "Pode subir a prioridade de um candidato" NÃO basta.
const DECISION_CRITICAL_CONSEQUENCES = ['verdict', 'viability_status', 'capital_posture', 'switch_gate', 'scale_gate', 'strategic_order', 'large_capital_release_or_block'];

// item 13/17 — classificação + categoria, atribuídas por ORIGEM real do gap (nunca escolhidas
// caso a caso). PRODUCT_VIABILITY (afeta se o produto é viável) é sempre a categoria mais forte;
// LOCAL_OPTIMIZATION/DATA_QUALITY nunca competem em pé de igualdade com ela (item 17).
const GAP_SOURCE_PROFILES = {
  KNOWN_PATH: { classification: 'DECISION_CRITICAL', category: 'PRODUCT_VIABILITY', plausible_consequences: ['verdict', 'viability_status', 'switch_gate'] },
  LEVER_EXHAUSTION: { classification: 'DECISION_CRITICAL', category: 'PRODUCT_VIABILITY', plausible_consequences: ['switch_gate', 'viability_status'] },
  OFFER_DATA_GAP: { classification: 'DECISION_RELEVANT', category: 'DATA_QUALITY', plausible_consequences: [] },
  CRO_TECHNICAL_OBSERVED: { classification: 'DECISION_RELEVANT', category: 'LOCAL_OPTIMIZATION', plausible_consequences: [] },
  // item 14 — achado que só existe porque o método de coleta (HTML estático) não consegue
  // confirmar comportamento pós-hidratação. Isso é uma LIMITAÇÃO DE INSPEÇÃO DO DADO, não uma
  // afirmação de problema real de usuário — nunca promovido acima de INFORMATIONAL sem prova.
  CRO_TECHNICAL_HYPOTHESIZED: { classification: 'INFORMATIONAL', category: 'LOCAL_OPTIMIZATION', plausible_consequences: [], data_inspection_limitation: true },
};

let gapCounter = 0;
function nextGapId(productId) {
  gapCounter += 1;
  return `EVGAP-${productId}-${String(gapCounter).padStart(3, '0')}`;
}

function buildGap({ productId, source, question, whyItMatters, currentKnowledge, missingEvidence, decisionItCouldChange, collectionMethod, estimatedCost }) {
  const method = collectionMethod || 'BEHAVIORAL_DATA';
  const profile = GAP_SOURCE_PROFILES[source] || { classification: 'LOW_VALUE', category: 'LOCAL_OPTIMIZATION', plausible_consequences: [] };
  return {
    evidence_gap_id: nextGapId(productId),
    product_id: productId,
    question,
    why_it_matters: whyItMatters,
    current_knowledge: currentKnowledge,
    missing_evidence: missingEvidence,
    decision_it_could_change: decisionItCouldChange,
    collection_method: method,
    estimated_cost: estimatedCost ?? DEFAULT_COST_BY_METHOD[method] ?? null,
    estimated_time_to_evidence: null, // sem base real de tempo, nunca inventar (item 58)
    priority: null, // preenchido por rankEvidenceGaps()
    status: 'OPEN',
    // item 13/16-17 — classificação formal, nunca "todo gap é decision-changing" (auditado no PASSO 11.1).
    decision_classification: profile.classification,
    category: profile.category,
    plausible_consequences: profile.plausible_consequences,
    decision_changing_evidence: profile.classification === 'DECISION_CRITICAL',
    data_inspection_limitation: profile.data_inspection_limitation === true,
    information_gain_per_real: computeInformationGainPerReal(method, estimatedCost),
  };
}

const CLASSIFICATION_RANK = { DECISION_CRITICAL: 3, DECISION_RELEVANT: 2, INFORMATIONAL: 1, LOW_VALUE: 0 };
const CATEGORY_ECONOMIC_RELEVANCE_RANK = { PRODUCT_VIABILITY: 3, CAPITAL_ALLOCATION: 2, EXPERIMENT_SELECTION: 1, LOCAL_OPTIMIZATION: 0, DATA_QUALITY: 0 };

/**
 * rankEvidenceGaps() — item 15. Ordem: 1) capacidade de mudar verdict/estratégia (classificação),
 * 2) relevância econômica (categoria), 3) dependências desbloqueadas (reservado, hoje sempre 0 —
 * não wireado ainda ao grafo de dependência), 4) information gain, 5) confiança (reservado, hoje
 * 0 — nenhum gap carrega confidence própria ainda), 6) custo (ASC, entra por último — nunca
 * domina sozinho, item 15/16).
 */
function rankEvidenceGaps(gaps) {
  return gaps
    .map((g) => ({ ...g, _unlocks_dependency_rank: 0, _confidence_rank: 0 }))
    .sort((a, b) => {
      const byClass = CLASSIFICATION_RANK[b.decision_classification] - CLASSIFICATION_RANK[a.decision_classification];
      if (byClass !== 0) return byClass;
      const byCategory = CATEGORY_ECONOMIC_RELEVANCE_RANK[b.category] - CATEGORY_ECONOMIC_RELEVANCE_RANK[a.category];
      if (byCategory !== 0) return byCategory;
      const byDependency = b._unlocks_dependency_rank - a._unlocks_dependency_rank;
      if (byDependency !== 0) return byDependency;
      const byGain = b.information_gain_per_real - a.information_gain_per_real;
      if (byGain !== 0) return byGain;
      const byConfidence = b._confidence_rank - a._confidence_rank;
      if (byConfidence !== 0) return byConfidence;
      return (a.estimated_cost ?? Infinity) - (b.estimated_cost ?? Infinity); // custo por ÚLTIMO, nunca domina sozinho
    })
    .map(({ _unlocks_dependency_rank, _confidence_rank, ...g }, i) => ({ ...g, priority: i + 1 }));
}

/**
 * buildEvidenceGapRegistry() — items 11-13/16-17. Gera gaps A PARTIR de diagnósticos/estado
 * REAIS — nunca hardcode os exemplos do spec quando o dado não os sustenta.
 */
function buildEvidenceGapRegistry({ productId, croDiagnostics = [], offerDiagnostics = [], knownPathToTarget, leverExhaustionScore }) {
  gapCounter = 0;
  const gaps = [];

  // CRO: technical/functional friction com existence_confidence HIGH + impact_confidence LOW/null.
  // causal_status distingue OBSERVED (fato estrutural confirmado, ex.: id duplicado real) de
  // HYPOTHESIZED (achado que depende de comportamento pós-hidratação — limitação de inspeção
  // de dado estático, item 14) — nunca tratados com a mesma força.
  for (const d of croDiagnostics) {
    if ((d.diagnostic_type === 'TECHNICAL_ISSUE' || d.diagnostic_type === 'FUNCTIONAL_FRICTION') && d.existence_confidence === 'HIGH' && (d.impact_confidence === 'LOW' || d.impact_confidence == null)) {
      const source = d.causal_status === 'HYPOTHESIZED' ? 'CRO_TECHNICAL_HYPOTHESIZED' : 'CRO_TECHNICAL_OBSERVED';
      gaps.push(buildGap({
        productId, source,
        question: source === 'CRO_TECHNICAL_HYPOTHESIZED'
          ? `${d.observation} — isso é um problema real de conteúdo, ou só uma limitação do método de inspeção (HTML estático não confirma comportamento pós-hidratação)?`
          : `${d.observation} — isso está realmente reduzindo conversão?`,
        whyItMatters: source === 'CRO_TECHNICAL_HYPOTHESIZED'
          ? 'a ausência no HTML estático NÃO prova ausência pro usuário real (pode ser hidratação normal de SPA) — precisa de teste funcional em navegador real antes de qualquer conclusão (DATA_INSPECTION_LIMITATION, item 14).'
          : 'existe com certeza (existence_confidence HIGH), mas o IMPACTO na conversão não foi medido (impact_confidence LOW) — investigar é quase grátis antes de gastar mídia assumindo que é a causa.',
        currentKnowledge: `diagnóstico real: ${d.diagnostic_id} (${d.diagnostic_type}, causal_status=${d.causal_status}).`,
        missingEvidence: 'medição real do comportamento/impacto (teste funcional em navegador real).',
        decisionItCouldChange: 'prioridade de um candidato de otimização local do CRO — NÃO o verdict/viability_status do produto.',
        collectionMethod: d.validation_method || 'FUNCTIONAL_TEST',
        estimatedCost: 0,
      }));
    }
  }

  // Offer: DATA_GAP diagnostics reais (ex.: atribuição buyer-level parcial do bump, PASSO 10.1).
  for (const d of offerDiagnostics) {
    if (d.diagnostic_type === 'DATA_GAP') {
      gaps.push(buildGap({
        productId, source: 'OFFER_DATA_GAP',
        question: d.observation,
        whyItMatters: 'afeta a confiança de candidatos de oferta que dependem desta métrica — não o verdict geral do produto.',
        currentKnowledge: `diagnóstico real: ${d.diagnostic_id}.`,
        missingEvidence: d.recommended_investigation || 'evidência estrutural adicional (mais transações reais com linkage confiável).',
        decisionItCouldChange: 'confidence de candidatos de oferta específicos (não o verdict).',
        collectionMethod: 'BEHAVIORAL_DATA',
        estimatedCost: 0,
      }));
    }
  }

  // known_path_to_target NO_KNOWN_PATH real é DECISION_CRITICAL de verdade: afeta diretamente se
  // SWITCH_PRODUCT pode um dia se tornar racional (item 41/42).
  if (knownPathToTarget && knownPathToTarget.status === 'NO_KNOWN_PATH') {
    gaps.push(buildGap({
      productId, source: 'KNOWN_PATH',
      question: 'Existe uma combinação de alavancas AINDA NÃO quantificadas (novos criativos, CRO mais agressivo, nova arquitetura de oferta, mídia/audiência diferente) capaz de fechar o gap até ROAS 3?',
      whyItMatters: 'os cenários já modelados (CPA/AOV combinados) não fecham o gap — mas isso reflete o que já foi TESTADO, não o espaço total de possibilidades (item 10).',
      currentKnowledge: knownPathToTarget.reason,
      missingEvidence: 'resultado real de alavancas ainda não exploradas/exhaustadas (ver lever_exhaustion_score).',
      decisionItCouldChange: 'determina se o verdict pode legitimamente evoluir para SWITCH_PRODUCT (exige exaustão real das alavancas) ou deve permanecer CONTINUE_VALIDATION/OPTIMIZE.',
      collectionMethod: 'CONTROLLED_EXPERIMENT',
      estimatedCost: 300,
    }));
  }

  if (leverExhaustionScore && leverExhaustionScore.score === 'NOT_ESTIMABLE') {
    gaps.push(buildGap({
      productId, source: 'LEVER_EXHAUSTION',
      question: 'Quais alavancas (Creative/CRO/Offer/Media Buying) já foram exploradas o suficiente para serem descartadas com confiança?',
      whyItMatters: 'sem isso, lever_exhaustion_score não é calculável — e sem ele, SWITCH_PRODUCT nunca pode passar no gate (item 19-21).',
      currentKnowledge: leverExhaustionScore.reason,
      missingEvidence: 'mais experimentos concluídos por categoria (ver experiment_coverage).',
      decisionItCouldChange: 'viabiliza ou não uma futura reavaliação de SWITCH_PRODUCT com base real.',
      collectionMethod: 'CONTROLLED_EXPERIMENT',
      estimatedCost: 300,
    }));
  }

  return rankEvidenceGaps(gaps);
}

module.exports = { buildEvidenceGapRegistry, computeInformationGainPerReal, rankEvidenceGaps, GAP_SOURCE_PROFILES, DECISION_CRITICAL_CONSEQUENCES, CLASSIFICATION_RANK, CATEGORY_ECONOMIC_RELEVANCE_RANK };
