'use strict';

const { PATTERN_LIBRARY } = require('./patternLibrary');
const { classifyBottleneck } = require('./bottleneckClassification');
const { selectComprehensionMechanism } = require('./mechanismSelection');

// item 23 — cada regra de geração cita um gatilho REAL (nunca "porque VSL costuma funcionar",
// item 23 exemplo proibido). "trigger" é uma função dos dados reais de diagnóstico — se ela
// não avaliar true, o challenger correspondente NUNCA é gerado (item 11: biblioteca != recomendação).
const CHALLENGER_RULES = [
  {
    rule_id: 'MONETIZATION_LAYER',
    family: 'FRONTEND_BACKEND',
    trigger: (diag) => diag.missing_monetization_signals.length > 0,
    why_generated: (diag) => ({ reason: 'missing_monetization', ref: diag.missing_monetization_signals.map((s) => s.diagnostic_id) }),
    added_stages: ['UPSELL'],
    architecture_hypothesis: 'Adicionar uma camada de monetização pós-compra (upsell) pode aumentar a receita por comprador sem depender de mais tráfego novo.',
    primary_mechanism: 'INCREASE_AOV',
    expected_economic_mechanism: 'AOV/receita-por-comprador ↑ → ROAS financeiro ↑, sem alterar CPA (magnitude: UNKNOWN — nenhuma taxa de conversão real da nova camada existe ainda).',
  },
  {
    // PASSO 12.2, item 4 — COMPREHENSION_NEED != VSL_AUTOMATICAMENTE. `dynamicFamily` escolhe o
    // mecanismo real por fator defensável (mechanismSelection.js) — nunca um family estático aqui.
    rule_id: 'COMPREHENSION_BUILDING_STAGE',
    family: null,
    dynamicFamily: (diag) => selectComprehensionMechanism({ videoFormatSignal: diag.video_format_signal }),
    trigger: (diag, currentStageTypes) => diag.known_path_to_target.status === 'NO_KNOWN_PATH' && !currentStageTypes.includes('VSL') && !currentStageTypes.includes('ADVERTORIAL'),
    why_generated: (diag) => ({ reason: 'economic_gap+customer_journey', ref: `known_path_to_target=NO_KNOWN_PATH (gap real: ROAS ${diag.financial_roas} vs target); arquitetura atual vai direto de anúncio pra página de venda, sem estágio intermediário de compreensão do mecanismo — STRUCTURAL_ABSENCE, não prova de que compreensão é o gargalo (item 1).` }),
    architecture_hypothesis: 'Introduzir um estágio de compreensão do mecanismo antes da página de oferta PODE aumentar a taxa de LP→checkout — hipótese gerada pela ausência estrutural + gap econômico não fechado pelas alavancas conhecidas, NÃO por evidência real de que compreensão é o gargalo específico (item 3).',
    primary_mechanism: 'INCREASE_COMPREHENSION',
    expected_economic_mechanism: 'conversion (LP→checkout) ↑ → CPA efetivo ↓ → ROAS ↑ (magnitude: UNKNOWN).',
  },
  {
    // PASSO 12.1, items 5-6 + PASSO 12.2, items 6-9 — WHATSAPP nunca é gerado só pra compensar
    // tracking degradado, e o gatilho real (CANCELLED/EXPIRED) é TRANSACTION_STATE_EVIDENCE —
    // nunca promovido silenciosamente a "abandono confirmado recuperável". Renomeado de
    // ABANDONMENT_RECOVERY pra INCOMPLETE_PURCHASE_RECOVERY: mais rigoroso sobre o que os dados
    // realmente provam (transações incompletas, não abandono/recuperabilidade confirmados).
    rule_id: 'INCOMPLETE_PURCHASE_RECOVERY',
    family: 'WHATSAPP_ASSISTED',
    trigger: (diag) => diag.cancelled_or_expired_transactions > 0,
    why_generated: (diag) => ({ reason: 'conversion_friction', ref: `TRANSACTION_STATE_EVIDENCE: ${diag.cancelled_or_expired_transactions} transação(ões) real(is) em status CANCELLED/EXPIRED (Hotmart) — prova que a transação ficou incompleta, NÃO prova de abandono recuperável confirmado nem de contactabilidade (item 6).` }),
    added_stages: ['WHATSAPP'],
    architecture_hypothesis: 'Contato assistido via WhatsApp direcionado a transações incompletas (CANCELLED/EXPIRED) PODE recuperar uma fração NÃO CONHECIDA dessas transações — taxa de recuperação, contactabilidade e elegibilidade de canal são desconhecidas hoje (item 9), nunca assumidas.',
    primary_mechanism: 'REDUCE_FRICTION',
    expected_economic_mechanism: 'recuperar transação incompleta → transação adicional realizada → receita ↑ (mesmo CPA de mídia já pago) — magnitude/taxa: UNKNOWN, nunca inventada (item 9).',
    secondary_benefit_note: 'benefício secundário possível: um canal assistido também gera um sinal de conversão de primeira-parte (first-party) — mas isso é secundário, nunca a razão pela qual este challenger foi gerado (item 5).',
    // item 8 — nunca inventar elegibilidade/recuperabilidade/contactabilidade. Sempre UNKNOWN sem
    // dado real que confirme (Hotmart não carrega telefone/consentimento/histórico de contato).
    extraFields: (diag) => ({
      transaction_state_evidence: { cancelled_or_expired_count: diag.cancelled_or_expired_transactions, status_types_observed: ['CANCELLED', 'EXPIRED'], source: 'Hotmart real (analytics/data/daily/*.json) — fato de estado de transação, não de comportamento do comprador.' },
      recoverable_population_status: 'UNKNOWN', // nunca CONFIRMED sem follow-up real registrado
      contactability_status: 'UNKNOWN', // Hotmart não confirma telefone/canal de contato válido
      channel_eligibility_status: 'UNKNOWN', // consentimento/elegibilidade legal de contato não avaliados
    }),
  },
  {
    rule_id: 'LEANER_VARIANT',
    family: 'DIRECT_TO_OFFER',
    trigger: (diag, currentStageTypes, currentFamily) => currentFamily !== 'DIRECT_TO_OFFER',
    why_generated: () => ({ reason: 'conversion_friction', ref: 'a arquitetura atual (SALES_PAGE) tem mais estágios de conteúdo antes do checkout do que o mínimo estrutural — reduzir a distância entre intenção e oferta é uma hipótese de baixo custo/baixa distância a testar antes de qualquer reconstrução maior.' }),
    added_stages: [],
    removes_stages: ['long_form_content_sections'],
    architecture_hypothesis: 'Reduzir a página de venda a um formato mais direto (menos seções antes do CTA) pode reduzir abandono por fricção de leitura, sem mudar o mecanismo/oferta.',
    primary_mechanism: 'REDUCE_FRICTION',
    expected_economic_mechanism: 'conversion (LP→checkout) ↑ → CPA ↓ → ROAS ↑ (magnitude: UNKNOWN).',
  },
  {
    rule_id: 'STRATEGIC_DIVERSIFICATION_ORGANIC',
    family: 'CONTENT_TO_OFFER',
    trigger: (diag, currentStageTypes, currentFamily, searchBreadth) => diag.known_path_to_target.status === 'NO_KNOWN_PATH' && ['BROAD', 'RADICAL'].includes(searchBreadth),
    why_generated: () => ({ reason: 'strategic_diversification', ref: 'toda a arquitetura atual depende 100% de mídia paga Meta — testar um caminho orgânico/conteúdo gera informação ortogonal (item 37), independente de o mecanismo de anúncio pago estar certo ou errado.' }),
    added_stages: ['CONTENT'],
    architecture_hypothesis: 'Um caminho de conteúdo/orgânico até a oferta reduz a dependência total de CPA de mídia paga e testa uma alavanca economicamente ortogonal às já conhecidas.',
    primary_mechanism: 'REDUCE_CPA',
    expected_economic_mechanism: 'CPA agregado (mídia+conteúdo) ↓ → ROAS agregado ↑ — mas com velocidade de resultado muito mais lenta (conteúdo não escala como mídia paga). Magnitude: UNKNOWN.',
    strategic_diversification_value: true,
    // item 10 — diversificação justifica o candidato por si só (valor de informação), mas nunca
    // recebe evidência de performance orgânica real (não coletamos dado orgânico ainda).
    extraFields: () => ({ diversification_evidence_status: 'NOT_AVAILABLE' }),
  },
];

/**
 * generateChallengers() — items 10-12/22-24/68 (PASSO 12), recalibrado no PASSO 12.2 (items
 * 1-10). Só inclui um challenger se o TRIGGER real avaliar true — nunca gera automaticamente um
 * por família da biblioteca (item 11). Entre 2 e 6 (item 22) — nunca quantidade artificial.
 * Anexa bottleneck_classification (item 1-3) a challengers baseados em ausência estrutural, e
 * resolve family dinamicamente quando a regra define dynamicFamily (item 4).
 */
function generateChallengers({ diagnosis, currentStageTypes, currentFamily, searchBreadth }) {
  const generated = [];
  let idx = 0;
  for (const rule of CHALLENGER_RULES) {
    if (!rule.trigger(diagnosis, currentStageTypes, currentFamily, searchBreadth)) continue;
    idx += 1;

    let family = rule.family;
    let familySelection = null;
    if (rule.dynamicFamily) {
      familySelection = rule.dynamicFamily(diagnosis);
      family = familySelection.family;
    }
    const addedStages = rule.dynamicFamily ? [familySelection.stage_type] : rule.added_stages;

    const pattern = PATTERN_LIBRARY[family];
    const bottleneck = classifyBottleneck({ ruleId: rule.rule_id });
    const extra = rule.extraFields ? rule.extraFields(diagnosis) : {};

    generated.push({
      architecture_id: `ARCH-CAND-${String(idx).padStart(2, '0')}-${rule.rule_id}`,
      family,
      family_selection: familySelection, // item 4 — auditável: por que ESTA família e não outra
      status: 'CANDIDATE',
      stage_types: [...new Set([...currentStageTypes, ...addedStages])],
      why_generated: rule.why_generated(diagnosis),
      architecture_hypothesis: rule.architecture_hypothesis, // item 28 — nunca afirma resultado
      primary_mechanism: rule.primary_mechanism,
      expected_economic_mechanism: rule.expected_economic_mechanism, // item 30 — nunca inventa magnitude
      strategic_diversification_value: rule.strategic_diversification_value === true,
      bottleneck_classification: bottleneck.classification, // item 1-3
      bottleneck_classification_detail: bottleneck,
      rule_id: rule.rule_id,
      pattern_description: pattern ? pattern.description : null,
      ...extra,
    });
  }
  return generated.slice(0, 6); // item 22 — teto de 6, nunca inflado artificialmente
}

module.exports = { generateChallengers, CHALLENGER_RULES };
