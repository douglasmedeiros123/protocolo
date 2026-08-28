'use strict';

// CRO DIAGNOSTICS (PASSO 9, item 16 + PASSO 9.1, itens 3-6) — nunca marca VALIDATED sem
// experimento/evidência adequada. causal_status documenta o quão forte é a evidência por trás:
//   OBSERVED     : um fato bruto, direto (ex: um id duplicado no HTML) — não é ainda uma causa
//   HYPOTHESIZED : uma possível explicação levantada, sem confirmação
//   SUPPORTED    : múltiplas evidências independentes apontam na mesma direção (ainda não é
//                  experimento controlado)
//   VALIDATED    : só depois de um experimento real concluído confirmando a hipótese — este
//                  módulo NUNCA atribui esse status sozinho.
//
// diagnostic_type (PASSO 9.1, item 3) separa FATO DE CÓDIGO de TEORIA DE CONVERSÃO — um id
// duplicado é TECHNICAL_ISSUE, nunca tem o mesmo peso epistêmico de uma CONVERSION_HYPOTHESIS.
//
// existence_confidence / impact_confidence (PASSO 9.1, item 4) — saber que um defeito EXISTE
// (verificável no código) é uma pergunta DIFERENTE de saber se ele CAUSA impacto de conversão
// (precisa de experimento). Só preenchidos pra TECHNICAL_ISSUE/FUNCTIONAL_FRICTION, onde essa
// distinção é o ponto central; ficam null nos outros tipos (o campo `confidence` já cobre a
// incerteza de hipóteses de conversão/comportamento, não faria sentido duplicar o conceito lá).
const CAUSAL_STATUSES = ['OBSERVED', 'HYPOTHESIZED', 'SUPPORTED', 'VALIDATED'];

// Limiar documentado (não é "achismo"): abaixo disso, lpv_to_checkout_rate é tratado como sinal
// de atenção — NUNCA como conclusão de que a LP está "ruim".
const LOW_INTENT_THRESHOLD = 0.15;

function buildCroDiagnostics({ parsed, sectionMap, funnelMetrics, performanceLayers, claritySnapshot }) {
  const diagnostics = [];

  for (const dup of parsed.duplicate_ids) {
    diagnostics.push({
      diagnostic_id: `CRO-DIAG-DUPLICATE-ID-${dup.id}`.toUpperCase(),
      diagnostic_type: 'TECHNICAL_ISSUE',
      observation: `O atributo id="${dup.id}" aparece ${dup.occurrences} vezes no HTML da LP.`,
      affected_layer: 'INTENT',
      severity: 'MEDIUM',
      confidence: 100,
      // existence_confidence: fato lido diretamente do HTML real — o defeito EXISTE, sem dúvida.
      // impact_confidence: NÃO sabemos ainda se isso de fato reduz conversão — não foi medido,
      // nunca testado isoladamente. Separar os dois evita concluir "isso está prejudicando a
      // conversão" só porque um problema técnico foi encontrado (PASSO 9.1, item 4).
      existence_confidence: 'HIGH',
      impact_confidence: 'LOW',
      validation_method: 'STATIC_CODE_CHECK', // já foi feito, é como este próprio diagnóstico nasceu
      evidence: { source: 'teste-b/index.html (parseado por htmlParser.js)', duplicate_id: dup.id, occurrences: dup.occurrences },
      possible_causes: [`O link "#${dup.id}" pode navegar até a PRIMEIRA ocorrência (não necessariamente a seção de preço/CTA), adicionando um passo extra de scroll antes da oferta.`],
      causal_status: 'OBSERVED',
      recommended_investigation: 'FUNCTIONAL_TEST barato (quase R$0): testar manualmente o clique no CTA do hero em mobile e desktop pra confirmar onde o scroll para — não precisa de experimento pago pra essa primeira validação.',
    });
  }

  if (parsed.faq_questions.length) {
    diagnostics.push({
      diagnostic_id: 'CRO-DIAG-FAQ-ANSWERS-NOT-IN-STATIC-HTML',
      diagnostic_type: 'FUNCTIONAL_FRICTION',
      observation: `${parsed.faq_questions.length} perguntas de FAQ encontradas no HTML, mas o conteúdo da resposta não está presente no HTML estático (accordion fica "hidden" sem texto visível na fonte).`,
      affected_layer: 'INTENT',
      severity: 'LOW',
      confidence: 70,
      existence_confidence: 'HIGH', // o fato de estar ausente no HTML estático é verificável
      impact_confidence: 'LOW', // pode ser comportamento normal de SPA (JS preenche depois) — não é necessariamente fricção real
      validation_method: 'FUNCTIONAL_TEST',
      evidence: { source: 'teste-b/index.html (parseado)', faq_questions: parsed.faq_questions },
      possible_causes: ['Conteúdo carrega via JS após hidratação (comportamento normal de SPA) e funciona no navegador real.', 'Falha real de implementação onde a resposta nunca aparece.'],
      causal_status: 'HYPOTHESIZED',
      recommended_investigation: 'Abrir a LP num navegador real (mobile e desktop) e clicar em cada pergunta pra confirmar se a resposta realmente aparece (FUNCTIONAL_TEST, custo ~R$0).',
    });
  }

  diagnostics.push({
    diagnostic_id: 'CRO-DIAG-LONG-PAGE-MOBILE-TRAFFIC',
    diagnostic_type: 'BEHAVIORAL_HYPOTHESIS',
    observation: `A LP tem ${sectionMap.length} seções reais de conteúdo servindo um público majoritariamente mobile/in-app (dado do Data Agent).`,
    affected_layer: 'ENGAGEMENT',
    severity: 'MEDIUM',
    confidence: 50,
    existence_confidence: null, // não se aplica a hipótese comportamental do mesmo jeito que a um defeito de código
    impact_confidence: null,
    validation_method: 'BEHAVIORAL_DATA',
    evidence: {
      source: 'section map real (teste-b/index.html)',
      page_length_sections: sectionMap.length,
      cro_001_historical_citation: claritySnapshot.status === 'AVAILABLE'
        ? 'Clarity disponível nesta execução — ver claritySnapshot para o comportamento atual.'
        : '71% do tráfego via Instagram in-app, scroll médio 16,8%, tempo ativo 11s — citado como "dado real do Clarity" na criação do CRO-001 (analytics/data/experiments/CRO-001.json, 2026-08-27). NÃO reconfirmado nesta execução — Clarity está indisponível agora (ver claritySnapshot).',
    },
    possible_causes: ['Página longa demais pro tempo de atenção real do público in-app.', 'Conteúdo bem estruturado, mas primeira dobra não retém quem não rola.'],
    causal_status: 'HYPOTHESIZED',
    recommended_investigation: 'Reconfirmar engajamento via nova coleta do Clarity assim que o limite diário da API resetar (BEHAVIORAL_DATA, custo ~R$0 — só esperar o dado).',
  });

  const intentValue = performanceLayers.INTENT.value;
  diagnostics.push({
    diagnostic_id: 'CRO-DIAG-INTENT-BASELINE',
    diagnostic_type: 'CONVERSION_HYPOTHESIS',
    observation: intentValue != null
      ? `lpv_to_checkout_rate histórico (${funnelMetrics.period.days_found} dias com dado): ${(intentValue * 100).toFixed(2)}%.`
      : 'lpv_to_checkout_rate não pôde ser calculado (sem LPV suficiente no período).',
    affected_layer: 'INTENT',
    severity: intentValue != null && intentValue < LOW_INTENT_THRESHOLD ? 'HIGH' : 'MEDIUM',
    confidence: funnelMetrics.confidence,
    existence_confidence: null,
    impact_confidence: null,
    validation_method: 'CONTROLLED_EXPERIMENT', // a métrica em si já é observada; a CAUSA exige experimento pra provar
    evidence: { source: 'funnelMetrics.js (analytics/data/daily)', ...funnelMetrics.raw, low_intent_threshold: LOW_INTENT_THRESHOLD },
    possible_causes: ['Fricção na primeira dobra (hipótese já registrada em CRO-001).', 'Descompasso entre promessa do anúncio e a LP (ver messageMatch.js).', 'Falta de prova/confiança suficiente antes da oferta.', 'Fricção técnica de navegação (ver CRO-DIAG-DUPLICATE-ID-OFERTA) — ainda não medida isoladamente.'],
    causal_status: 'OBSERVED',
    recommended_investigation: 'Isolar UMA variável por vez (ver cro001Analysis.js) pra testar causalmente uma das possible_causes — mas validar tecnicamente as causas de custo ~R$0 primeiro (ver technicalActions).',
  });

  return diagnostics;
}

/**
 * FIX_TECHNICAL_ISSUE / VALIDATE_TECHNICAL_ISSUE (PASSO 9.1, itens 5-6) — prepara a estrutura
 * de ação SEM executar nada. Só gerado pra diagnósticos TECHNICAL_ISSUE/FUNCTIONAL_FRICTION,
 * onde existe algo concreto e barato pra fazer antes de (ou em vez de) rodar um experimento.
 */
function buildTechnicalActions(diagnostics) {
  return diagnostics
    .filter((d) => d.diagnostic_type === 'TECHNICAL_ISSUE' || d.diagnostic_type === 'FUNCTIONAL_FRICTION')
    .map((d) => ({
      action_id: `${d.diagnostic_id}-ACTION`,
      diagnostic_id: d.diagnostic_id,
      // VALIDATE_TECHNICAL_ISSUE quando o impacto ainda não foi confirmado (impact_confidence
      // baixo/médio); FIX_TECHNICAL_ISSUE só faria sentido depois de confirmado que vale a pena
      // corrigir — hoje, com impact_confidence LOW em todos os casos reais, a ação recomendada é
      // sempre validar primeiro, nunca "corrigir" sem saber se importa.
      action_type: d.impact_confidence === 'HIGH' ? 'FIX_TECHNICAL_ISSUE' : 'VALIDATE_TECHNICAL_ISSUE',
      validation_method: d.validation_method,
      estimated_cost_reais: 0, // STATIC_CODE_CHECK/FUNCTIONAL_TEST — sem gasto de mídia
      description: `${d.observation} — existence_confidence=${d.existence_confidence}, impact_confidence=${d.impact_confidence}.`,
      recommended_investigation: d.recommended_investigation,
      note: 'Preparado estruturalmente — NÃO executado. Uma correção técnica evidente pode futuramente competir com RUN_EXPERIMENT no Decision Engine (integração aditiva, ver decision/croIntegration.js).',
    }));
}

module.exports = { buildCroDiagnostics, buildTechnicalActions, CAUSAL_STATUSES, LOW_INTENT_THRESHOLD };
