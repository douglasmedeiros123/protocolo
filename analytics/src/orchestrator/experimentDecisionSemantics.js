'use strict';

// PASSO 16.1 — FIRST EXPERIMENT DECISION SEMANTICS. NUNCA constrói o advertorial, NUNCA faz
// deploy, NUNCA gasta capital — só define a SEMÂNTICA de decisão (o que conta como sinal
// comportamental, o que conta como resultado econômico, quando um resultado pode ser declarado
// vencedor). Escopo estritamente orchestrator/ — Experiment Engine (experiments/) nunca é
// modificado (item 13); onde ele seria necessário, uma dívida é registrada.

// ==========================================================================
// item 1-2 — auditoria de fundamento da regra de evidência + status explícito.
// ==========================================================================

// item 1 — inspeção real de experiments/evidence.js: MINIMUM_EVIDENCE_BY_CATEGORY é uma tabela
// estática por categoria (lpv/checkouts/compras/spend/duration_days fixos), sem nenhuma fórmula
// que use taxa de conversão baseline, effect size mínimo detectável, nível de confiança, ou
// desconto de confiança causal pra testes MULTI_COMPONENT_ARCHITECTURE_TEST
// (mvaTestBuilder.js's classifyTestType). O próprio comentário do arquivo cita "mesmo princípio
// dos intervalos de Wilson" como INSPIRAÇÃO, nunca como cálculo aplicado (nenhum baseline_rate/
// confidence_level/MDE é usado pra derivar os números 100/10/7 etc.). Conclusão real, não
// inventada: os thresholds são defaults históricos documentados por categoria de alavanca
// (CREATIVE/CRO/OFFER/...), nunca calibrados especificamente pra um teste que insere/remove um
// ESTÁGIO INTEIRO do funil (mudança estrutural, não um ajuste dentro da mesma página).
function auditEvidenceRuleFoundation({ mvaTest }) {
  return {
    experiment_nature: 'FUNNEL_ARCHITECTURE',
    consumed_category: 'CRO',
    minimum_evidence_consumed: mvaTest.minimum_evidence,
    classification: 'HISTORICAL_DEFAULT_ONLY', // A) fundamento arquitetural/econômico | B) default histórico | C) outra situação -> real resposta é B
    finding: 'experiments/evidence.js\'s MINIMUM_EVIDENCE_BY_CATEGORY é uma tabela estática por categoria — nenhuma fórmula (baseline conversion rate, minimum detectable effect, nível de confiança, desconto de confiança causal pra mudança multi-componente) deriva os números 100 LPV/10 checkouts/7 dias. O comentário do próprio arquivo cita "intervalos de Wilson" como inspiração geral, nunca como cálculo aplicado.',
    reason: 'category=CRO foi escolhida por proximidade (strategy-search/experimentDraftProposal.js\'s NEAREST_EXISTING_CATEGORY_BY_MECHANISM), não porque CRO thresholds foram desenhados pra testes de inserção de estágio de funil — uma mudança estrutural tem dinâmica de exposição diferente de um ajuste on-page (mesma página, cor/copy). Não há evidência no código de que essa diferença foi considerada ao fixar 100/10/7.',
  };
}

// item 2 — nunca promove a aproximação a regra validada.
function buildExperimentDesignRuleStatus({ foundationAudit }) {
  if (foundationAudit.classification === 'ARCHITECTURAL_ECONOMIC_FOUNDATION') {
    return { status: 'VALIDATED_DECISION_RULE', reason: 'fundamento real específico encontrado — não é o caso hoje.' };
  }
  return {
    status: 'NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION',
    reference_rule: foundationAudit.minimum_evidence_consumed,
    reason: 'CRO thresholds continuam utilizáveis como REFERÊNCIA OPERACIONAL PROVISÓRIA (guia prático de quando parar de coletar), mas nunca como regra de decisão validada pra julgar vencedor de arquitetura. REFERENCE != VALIDATED_DECISION_RULE — distinção nunca apagada em nenhum relatório/uso posterior.',
  };
}

// ==========================================================================
// item 3 — separação leading indicator / economic outcome / guardrails.
// ==========================================================================
function buildMetricSeparation({ mvaTest, planFinancials, measurementAnalysis }) {
  return {
    LEADING_INDICATOR: {
      metric: mvaTest.primary_metric,
      role: 'sinal comportamental antecipado (funil) — informa ONDE/COMO o efeito aparece primeiro, nunca decide sozinho o resultado econômico.',
    },
    ECONOMIC_OUTCOME: {
      metrics: ['financial_roas', 'financial_sales_revenue', 'financial_cpa'],
      current_baseline: {
        financial_roas: planFinancials.roas_financeiro,
        financial_cpa: planFinancials.cpa_financeiro,
        gross_revenue: measurementAnalysis.revenue_attribution.ACQUISITION_REVENUE.value,
        net_revenue: measurementAnalysis.profit_attribution.net_revenue,
      },
      role: 'única fonte que pode declarar WINNER/LOSS econômico — sempre de FINANCIAL_TRANSACTION_TRUTH (Hotmart), nunca de sinal de plataforma.',
    },
    GUARDRAIL_METRICS: {
      metrics: ['refund_rate', 'financial_truth_health', 'ghost_purchase_reconciliation_anomalies', 'measurement_integrity'],
      current_baseline: {
        refund_rate: planFinancials.refund_rate,
        financial_truth_health: measurementAnalysis.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.status,
        ghost_purchase_days: measurementAnalysis.reconciliation.ghost_purchase_days.length,
        measurement_integrity: measurementAnalysis.data_quality_dimensions ? measurementAnalysis.data_quality_dimensions.overall_status || 'SEE_DATA_QUALITY_DIMENSIONS' : 'UNKNOWN',
      },
      role: 'nunca decide o resultado sozinho — pode IMPEDIR uma declaração de WINNER mesmo com economic outcome favorável (deterioração desproporcional).',
    },
  };
}

// ==========================================================================
// item 4 — behavioral win != economic win.
// ==========================================================================
// direction: 'IMPROVED' | 'DETERIORATED' | 'FLAT' | 'UNKNOWN' — nunca calculado aqui a partir de
// dados reais ainda inexistentes (nenhum experimento rodou); função pura de classificação,
// alimentada por quem chama com valores reais OU sintéticos de teste.
function classifyBehavioralVsEconomicOutcome({ behavioralDirection, economicDirection }) {
  if (behavioralDirection === 'IMPROVED' && economicDirection === 'DETERIORATED') {
    return { classification: 'BEHAVIORAL_IMPROVEMENT_WITH_ECONOMIC_DETERIORATION', reason: 'melhora comportamental isolada NUNCA é suficiente — o resultado econômico piorou, então isto NUNCA pode ser declarado WINNER (item 4, regra obrigatória).' };
  }
  if (behavioralDirection === 'IMPROVED' && economicDirection === 'IMPROVED') {
    return { classification: 'BEHAVIORAL_AND_ECONOMIC_IMPROVEMENT', reason: 'os dois na mesma direção favorável — candidato a WINNER, mas ainda depende de classifyEvidenceSufficiency() antes de qualquer declaração final (item 5).' };
  }
  if (behavioralDirection === 'DETERIORATED' && economicDirection === 'IMPROVED') {
    return { classification: 'BEHAVIORAL_DETERIORATION_WITH_ECONOMIC_IMPROVEMENT', reason: 'combinação rara/contraintuitiva — nunca descartada automaticamente, mas exige investigação (possível ruído/anomalia) antes de qualquer conclusão.' };
  }
  if (behavioralDirection === 'DETERIORATED' && economicDirection === 'DETERIORATED') {
    return { classification: 'BOTH_DETERIORATED', reason: 'ambos pioraram — nunca WINNER.' };
  }
  return { classification: 'INCONCLUSIVE_DIRECTION', reason: 'pelo menos uma direção é FLAT/UNKNOWN — nenhuma conclusão de vencedor é sustentável ainda.' };
}

// ==========================================================================
// item 5 — sufficiency separada de direção (nunca inventa significância estatística formal).
// ==========================================================================
function classifyEvidenceSufficiency({ minimumEvidenceMet, behavioralEconomicClassification }) {
  if (!minimumEvidenceMet) {
    return { evidence_volume: 'PROMISING_SIGNAL', economic_result: null, reason: 'amostra mínima de referência (provisória, item 2) ainda não atingida — sinal inicial, nunca suficiente pra declarar resultado econômico.' };
  }
  let economicResult;
  if (behavioralEconomicClassification === 'BEHAVIORAL_AND_ECONOMIC_IMPROVEMENT') economicResult = 'ECONOMIC_WIN';
  else if (behavioralEconomicClassification === 'BEHAVIORAL_IMPROVEMENT_WITH_ECONOMIC_DETERIORATION' || behavioralEconomicClassification === 'BOTH_DETERIORATED') economicResult = 'ECONOMIC_LOSS';
  else economicResult = 'INCONCLUSIVE';
  return {
    evidence_volume: 'SUFFICIENT_EVIDENCE',
    economic_result: economicResult,
    reason: `amostra mínima de referência atingida (nunca significância estatística formal — não implementada neste sistema). economic_result derivado da combinação leading/economic real (${behavioralEconomicClassification}), nunca de uma única venda isolada.`,
  };
}

// ==========================================================================
// item 6 — pergunta de decisão estruturada.
// ==========================================================================
function buildStructuredDecisionQuestion({ winner, mvaTest }) {
  return {
    question: `Adicionar ${mvaTest.changed_components.join(', ')} (estágio de compreensão antes da oferta) melhora suficientemente a eficiência do funil (${mvaTest.primary_metric}) SEM deteriorar a economia financeira (financial_roas/CPA), justificando continuar/investir na arquitetura ${winner.architecture_id}?`,
    structure: { leading_condition: mvaTest.primary_metric, economic_condition: 'financial_roas/financial_cpa não deteriora', decision_implication: 'continuar/investir vs reverter/descartar' },
    note: 'nunca formulada apenas como "X aumenta conversão?" — sempre acopla a condição econômica explicitamente (item 6).',
  };
}

// ==========================================================================
// item 7 — estrutura multi-estágio (mesmo experimento, nunca 3 experimentos separados).
// ==========================================================================
function buildMultiStageDecisionStructure({ metricSeparation }) {
  return {
    STAGE_A_BEHAVIORAL_SIGNAL: { question: `${metricSeparation.LEADING_INDICATOR.metric} melhora vs baseline?`, authority: 'NUNCA decide sozinho — só qualifica avanço pra Stage B.' },
    STAGE_B_FINANCIAL_CONFIRMATION: { question: 'a melhora comportamental (se houver) se sustenta em resultado financeiro REAL (Hotmart), não em sinal de plataforma (Meta)?', authority: 'exige FINANCIAL_OUTCOME real — nunca Meta purchase como substituto (ghost-purchase protection).' },
    STAGE_C_ECONOMIC_DECISION: { question: 'o resultado financeiro líquido (financial_roas/CPA) justifica continuar/investir, considerando guardrails (refund_rate, financial_truth_health, anomalias)?', authority: 'única etapa que autoriza uma conclusão econômica (WINNER/LOSS/CONTINUE) — nunca as etapas A ou B isoladamente.' },
    note: 'as 3 etapas avaliam os MESMOS dados coletados por UM experimento real, sequencialmente — item 7 explicitamente NÃO exige 3 experimentos separados, só impede concluir economia com base só em proxy comportamental (Stage A).',
  };
}

// ==========================================================================
// item 8 — stop/continue. Nenhum limite universal de harm é inventado.
// ==========================================================================
const HARM_THRESHOLD_STATUS = 'NOT_CONFIGURED'; // nenhum limite defensável de "dano" foi definido/validado neste sistema — nunca inventado aqui.
const STOP_CONTINUE_STATES = ['CONTINUE_COLLECTING', 'PROMISING_CONTINUE', 'STOP_FOR_HARM', 'ECONOMICALLY_PROMISING', 'ECONOMICALLY_UNFAVORABLE', 'INCONCLUSIVE'];

function deriveStopContinueRecommendation({ evidenceVolume, economicResult, behavioralDirection, economicDirection, realGuardrailBreach }) {
  // STOP_FOR_HARM só a partir de um sinal JÁ definido em outro lugar do sistema (ex.:
  // financial_truth_health=BLOCKED) — nunca um threshold numérico inventado aqui (HARM_THRESHOLD_
  // STATUS=NOT_CONFIGURED documenta isso explicitamente).
  if (realGuardrailBreach) {
    return { recommendation: 'STOP_FOR_HARM', harm_threshold_status: HARM_THRESHOLD_STATUS, reason: `guardrail real já sinalizado por outro módulo (${realGuardrailBreach}) — nunca um limite numérico inventado aqui.` };
  }
  if (evidenceVolume === 'PROMISING_SIGNAL') {
    if (behavioralDirection === 'IMPROVED' && economicDirection === 'IMPROVED') {
      return { recommendation: 'PROMISING_CONTINUE', reason: 'amostra ainda insuficiente, mas sinal comportamental E econômico já apontam na mesma direção favorável — continuar com mais confiança que um CONTINUE_COLLECTING neutro.' };
    }
    return { recommendation: 'CONTINUE_COLLECTING', reason: 'amostra ainda insuficiente e nenhuma direção clara/favorável ainda — continuar coletando, nenhuma conclusão possível.' };
  }
  if (economicResult === 'ECONOMIC_WIN') return { recommendation: 'ECONOMICALLY_PROMISING', reason: 'amostra suficiente (referência provisória) + resultado econômico favorável — "promising", nunca "confirmed" (sem significância estatística formal).' };
  if (economicResult === 'ECONOMIC_LOSS') return { recommendation: 'ECONOMICALLY_UNFAVORABLE', reason: 'amostra suficiente + resultado econômico desfavorável.' };
  return { recommendation: 'INCONCLUSIVE', reason: 'amostra suficiente mas direção mista/indefinida.' };
}

// ==========================================================================
// item 9 — subdimensões de readiness (nunca deixa READY_FOR_IMPLEMENTATION implicar EXECUTION).
// ==========================================================================
function buildReadinessSubdimensions({ implementationReadiness, measurementBlocked, decisionRuleStatus, treatmentDeployed, capitalAuthorityTier }) {
  return {
    IMPLEMENTATION_READINESS: implementationReadiness.treatment_exists_as_real_page ? 'DONE' : 'READY_TO_START',
    MEASUREMENT_READINESS: measurementBlocked ? 'BLOCKED' : 'READY',
    DECISION_RULE_READINESS: decisionRuleStatus === 'NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION' ? 'PROVISIONAL_REFERENCE_ONLY' : 'VALIDATED',
    DEPLOYMENT_READINESS: treatmentDeployed ? 'DONE' : 'NOT_STARTED',
    EXECUTION_READINESS: capitalAuthorityTier === 'TIER_0_ANALYZE_ONLY' ? 'BLOCKED_BY_CAPITAL_AUTHORITY' : 'UNKNOWN',
    note: 'READY_FOR_IMPLEMENTATION (estado agregado) NUNCA implica que MEASUREMENT/DECISION_RULE/DEPLOYMENT/EXECUTION também estão prontos — cada dimensão é reportada separadamente (item 9).',
  };
}

// ==========================================================================
// item 10 — dívida de categoria (Experiment Engine fora do write boundary — nunca modificado).
// ==========================================================================
const FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING = {
  debt_id: 'FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING',
  finding: 'experiments/schema.js CATEGORIES não tem uma categoria dedicada a testes de arquitetura de funil (inserção/remoção de estágio) — hoje aproximado via CRO (nearest-category, strategy-search/experimentDraftProposal.js), sem thresholds derivados especificamente pra esse tipo de mudança.',
  resolution_urgency: 'NOT_BLOCKING',
  reason: 'a regra provisória já está explicitamente marcada (EXPERIMENT_DESIGN_RULE_STATUS=NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION, REFERENCE != VALIDATED_DECISION_RULE, item 2) — construir/implantar/iniciar coleta do tratamento não depende de uma categoria formalmente calibrada. Precisa ser resolvida ANTES de qualquer declaração de WINNER/LOSS ser tratada como estatisticamente validada (nunca antes disso) — enquanto isso, toda declaração de resultado carrega o caveat PROVISIONAL_REFERENCE_ONLY adiante.',
  write_boundary_note: 'experiments/schema.js está fora do write boundary deste PASSO (analytics/src/orchestrator/ apenas) — não modificado. Debt registrado, nunca corrigido silenciosamente.',
  status: 'AUDITED_NOT_FIXED',
};

// ==========================================================================
// item 11 — evidência histórica real preservada, nunca promovida a causal.
// ==========================================================================
function buildHistoricalEvidenceSummary({ planResult, measurementAnalysis, creativeAssetsCount }) {
  const completedExperimentsTotal = Object.values(planResult.experiment_coverage.by_category).reduce((sum, c) => sum + c.completed, 0);
  const financials = planResult.economics_snapshot.financials;
  return {
    HISTORICAL_OPERATIONAL_EVIDENCE: { status: 'EXISTS', detail: `${financials.numero_compradores_reais} compradores reais, funil real operando (Hotmart real) no período avaliado.` },
    HISTORICAL_FINANCIAL_EVIDENCE: { status: 'EXISTS', detail: `financial_roas=${financials.roas_financeiro}, cpa_financeiro=R$${financials.cpa_financeiro}, receita líquida real=R$${financials.receita_liquida_hotmart} (Hotmart, FINANCIAL_TRANSACTION_TRUTH).` },
    HISTORICAL_BEHAVIORAL_EVIDENCE: { status: measurementAnalysis.source_of_truth_matrix.WEB_BEHAVIOR ? measurementAnalysis.source_of_truth_matrix.WEB_BEHAVIOR.status === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'EXISTS' : 'NOT_AVAILABLE', detail: 'Clarity real (measurement/sourceOfTruth.js WEB_BEHAVIOR) — comportamento agregado, nível de conta hoje (MDEBT-005).' },
    HISTORICAL_PLATFORM_CREATIVE_SIGNALS: { status: creativeAssetsCount > 0 ? 'EXISTS' : 'NOT_AVAILABLE', detail: `${creativeAssetsCount} criativo(s) real(is) registrado(s) (creative/registry.js).` },
    MVA_CONTROLLED_EXPERIMENTS_COMPLETED: completedExperimentsTotal,
    prior_vs_causal_distinction: `todo o histórico acima serve como PRIOR EVIDENCE pra gerar/ranquear hipóteses (já consumido por Strategy Search pra ranking) — NUNCA promovido automaticamente a evidência causal de experimento controlado. MVA_CONTROLLED_EXPERIMENTS_COMPLETED=${completedExperimentsTotal} continua verdadeiro e não é contradito nem escondido por nenhum dos itens acima (item 11).`,
  };
}

module.exports = {
  auditEvidenceRuleFoundation, buildExperimentDesignRuleStatus,
  buildMetricSeparation, classifyBehavioralVsEconomicOutcome, classifyEvidenceSufficiency,
  buildStructuredDecisionQuestion, buildMultiStageDecisionStructure,
  HARM_THRESHOLD_STATUS, STOP_CONTINUE_STATES, deriveStopContinueRecommendation,
  buildReadinessSubdimensions, FUNNEL_ARCHITECTURE_EXPERIMENT_CATEGORY_MISSING,
  buildHistoricalEvidenceSummary,
};
