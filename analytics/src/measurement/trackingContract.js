'use strict';

const { buildEventTaxonomyForStages } = require('./eventTaxonomy');
const { buildControlSurfaces } = require('./controlSurfaces');
const { IDENTIFIER_SPINE_NAMES } = require('./enums');

const REVENUE_EVENTS = ['PURCHASE', 'REFUND', 'CANCELLED', 'EXPIRED', 'ORDER_BUMP_ACCEPTED'];

// PASSO 13.1, items 1-2 — REQUIRED_FOR_OBSERVABILITY != REQUIRED_FOR_INTERPRETABILITY,
// REQUIRED_FOR_DIAGNOSIS != REQUIRED_FOR_CAPITAL, NICE_TO_HAVE_EVENT != CAPITAL_BLOCKER. A
// classificação binária do PASSO 13 original (CAPITAL_BLOCKING_EVENTS fixo) foi substituída por
// esta escala de 5 níveis, com rationale explícito por requisito — nunca "é REQUIRED, logo
// bloqueia" (item 2).
const REQUIREMENT_CLASSES = ['CAPITAL_BLOCKING_REQUIREMENT', 'INTERPRETABILITY_REQUIREMENT', 'DIAGNOSTIC_REQUIREMENT', 'QUALITY_ENHANCEMENT', 'OPTIONAL'];

// item 1 — eventos com proxy agregado real já existente hoje (sem instrumentação nova) — por
// isso nunca bloqueiam capital sozinhos, mesmo aparecendo como REQUIRED no nível de evento
// discreto de sessão. CHECKOUT_INITIATED tem proxy real: meta.totals.checkout (Meta Insights,
// agregado por dia) já permite calcular lpv_to_checkout_rate no nível de data/arquitetura, que é
// o único nível de comparação hoje disponível (ver minimumViableAttribution.js).
const EVENTS_WITH_AGGREGATE_PROXY = ['CHECKOUT_INITIATED'];

// eventos puramente comportamentais/de funil — nunca indispensáveis pra saber SE o efeito
// econômico ocorreu, só explicam COMO/ONDE (item 1: REQUIRED_FOR_DIAGNOSIS != REQUIRED_FOR_CAPITAL).
const BEHAVIORAL_DIAGNOSTIC_EVENTS = ['PAGE_VIEW', 'LANDING_PAGE_VIEW', 'CONTENT_VIEW', 'SCROLL_DEPTH', 'ENGAGED_SESSION', 'CTA_VIEW', 'CTA_CLICK', 'CHECKOUT_VIEW', 'PAYMENT_ATTEMPT', 'RETURN_VISIT', 'UPSELL_VIEW', 'DOWNSELL_VIEW'];

/**
 * classifyRequirement() — item 1-2. Nunca "é REQUIRED, logo bloqueia" — cada requisito carrega
 * seu próprio blocking_rationale, affected_decision, affected_metric e what_is_lost_if_missing.
 * `primaryOrGuardrailEvents` vem do MVA test real do subject (primary_metric/secondary_metrics
 * traduzidos pra eventos) — um evento só vira INTERPRETABILITY_REQUIREMENT se ESTE teste
 * específico depender dele pra interpretar sua métrica escolhida.
 */
function classifyRequirement({ event, primaryOrGuardrailEvents = [] }) {
  if (REVENUE_EVENTS.includes(event)) {
    return {
      requirement_class: 'CAPITAL_BLOCKING_REQUIREMENT',
      blocking_rationale: 'sem confirmação financeira real deste evento, o teste não tem outcome econômico mensurável — é a definição de economicamente não-interpretável (item central do PASSO 13.1).',
      affected_decision: 'success_condition/failure_condition/kill_condition do teste',
      affected_metric: 'primary_metric (quando é receita) e guardrail (refund_rate)',
      what_is_lost_if_missing: 'capacidade de saber se a mudança gerou ou não resultado financeiro real — bloqueio total, não parcial.',
    };
  }
  if (primaryOrGuardrailEvents.includes(event)) {
    return {
      requirement_class: 'INTERPRETABILITY_REQUIREMENT',
      blocking_rationale: `este teste específico escolheu uma métrica que depende de ${event} para ser calculada — sem ele, a métrica primária/guardrail deste teste (não de todos os testes) fica indefinida.`,
      affected_decision: 'success_condition/failure_condition deste MVA test específico',
      affected_metric: 'primary_metric ou guardrail deste teste',
      what_is_lost_if_missing: 'capacidade de calcular a métrica que ESTE teste escolheu como critério de decisão — outro teste com métrica diferente não seria afetado.',
    };
  }
  if (EVENTS_WITH_AGGREGATE_PROXY.includes(event)) {
    return {
      requirement_class: 'DIAGNOSTIC_REQUIREMENT',
      blocking_rationale: 'já existe um proxy agregado real (contagem diária via Meta Insights) suficiente pra calcular a métrica no nível de comparação disponível hoje (data/arquitetura) — o evento discreto de sessão explica ONDE/COMO, não SE o efeito ocorreu.',
      affected_decision: 'diagnóstico de funil (por que a métrica mudou), nunca a decisão de sucesso/fracasso em si',
      affected_metric: 'granularidade por sessão da métrica de funil (não a métrica agregada em si, que já é calculável)',
      what_is_lost_if_missing: 'capacidade de explicar EM QUAL etapa exata o efeito aconteceu — não a capacidade de saber SE aconteceu.',
    };
  }
  if (BEHAVIORAL_DIAGNOSTIC_EVENTS.includes(event)) {
    return {
      requirement_class: 'QUALITY_ENHANCEMENT',
      blocking_rationale: 'granularidade comportamental adicional — melhora a qualidade da análise, nunca indispensável pra interpretar se o teste funcionou.',
      affected_decision: 'nenhuma decisão de capital diretamente',
      affected_metric: 'nenhuma métrica primária/guardrail diretamente',
      what_is_lost_if_missing: 'contexto comportamental mais rico — a decisão em si permanece interpretável sem isso.',
    };
  }
  return {
    requirement_class: 'OPTIONAL',
    blocking_rationale: 'nem indispensável, nem diagnóstico central — instrumentação de conveniência.',
    affected_decision: 'nenhuma', affected_metric: 'nenhuma', what_is_lost_if_missing: 'nada crítico.',
  };
}

// item 3 — pergunta central do MVA real: quais eventos este teste específico precisa pra avaliar
// o efeito PRIMÁRIO (interpretability), vs. só úteis pra explicar por que aconteceu (diagnóstico).
// Mapeamento documentado, nunca inventado por candidato.
const METRIC_TO_EVENTS = {
  lpv_to_checkout_rate: ['CHECKOUT_INITIATED'],
  net_aov: ['PURCHASE', 'ORDER_BUMP_ACCEPTED'],
  financial_roas: ['PURCHASE'],
  refund_rate: ['REFUND'],
};
function mapMetricsToEvents(metrics = []) {
  return [...new Set(metrics.flatMap((m) => METRIC_TO_EVENTS[m] || []))];
}

let contractCounter = 0;
function resetContractCounter() { contractCounter = 0; }

/**
 * computeContractStatus() — item 11 (PASSO 13). TRACKING_CONTRACT_READY != EXPERIMENT_READY_
 * FOR_CAPITAL (nunca confundidos — status aqui é só sobre O CONTRATO; capital gate é decidido em
 * capitalGate.js/blockerDependencyGraph.js, separadamente).
 */
function computeContractStatus({ eventStatuses, financialTruthBlocking }) {
  if (financialTruthBlocking) return 'FAILED';
  if (eventStatuses.length === 0) return 'DRAFT';
  const allValidated = eventStatuses.every((s) => s === 'VALIDATED');
  const anyValidated = eventStatuses.some((s) => s === 'VALIDATED');
  const anyBeyondRequired = eventStatuses.some((s) => s !== 'REQUIRED');
  const allRequired = eventStatuses.every((s) => s === 'REQUIRED');
  if (allValidated) return 'VALIDATED';
  if (anyValidated && anyBeyondRequired) return 'DEGRADED';
  if (anyBeyondRequired) return 'IMPLEMENTED_UNVALIDATED';
  if (allRequired) return 'READY_FOR_IMPLEMENTATION';
  return 'INCOMPLETE';
}

/**
 * buildTrackingContract() — items 10-12 (PASSO 13) + 1-2 (PASSO 13.1). Gera o contrato real pra
 * QUALQUER subject_type a partir dos stage_types reais — nunca hardcoda um estágio/evento
 * específico. `primaryOrGuardrailEvents` (opcional) permite ao chamador dizer quais eventos ESTE
 * subject específico realmente usa como métrica de decisão (vindo do mva_test real).
 */
function buildTrackingContract({ subjectType, subjectId, architectureId, experimentId = null, stageTypes, platform, financialTruthBlocking, productId, primaryOrGuardrailEvents = [] }) {
  contractCounter += 1;
  const eventTaxonomy = buildEventTaxonomyForStages(stageTypes, platform);
  const controlSurfaces = buildControlSurfaces(stageTypes);
  const requiredIdentifiers = IDENTIFIER_SPINE_NAMES;
  const revenueEventEntries = eventTaxonomy.filter((e) => REVENUE_EVENTS.includes(e.event));
  const missingEvents = eventTaxonomy.filter((e) => e.status === 'REQUIRED').map((e) => e.event);

  const classifiedEvents = eventTaxonomy.map((e) => ({ ...e, ...classifyRequirement({ event: e.event, primaryOrGuardrailEvents }) }));
  const capitalBlockingEntries = classifiedEvents.filter((e) => e.requirement_class === 'CAPITAL_BLOCKING_REQUIREMENT' || e.requirement_class === 'INTERPRETABILITY_REQUIREMENT');
  const nonBlockingEntries = classifiedEvents.filter((e) => !capitalBlockingEntries.includes(e));

  const contractStatus = computeContractStatus({ eventStatuses: eventTaxonomy.map((e) => e.status), financialTruthBlocking });

  return {
    contract_id: `TC-${subjectId}-${String(contractCounter).padStart(3, '0')}`,
    subject_type: subjectType,
    subject_id: subjectId,
    architecture_id: architectureId,
    experiment_id: experimentId,
    product_id: productId,
    required_stages: stageTypes,
    required_events: classifiedEvents, // cada evento carrega requirement_class/blocking_rationale/affected_decision/affected_metric/what_is_lost_if_missing (item 2)
    required_identifiers: requiredIdentifiers,
    required_revenue_events: revenueEventEntries,
    required_behavior_surfaces: controlSurfaces.filter((s) => s.clarity_installable).map((s) => s.stage_type),
    required_attribution_fields: ['utm_source', 'utm_medium', 'utm_campaign', 'transaction_id'],
    required_financial_reconciliation: 'toda alegação de compra (META.PURCHASE) deste subject precisa reconciliar com HOTMART.TRANSACTION_APPROVED antes de contar como receita real (item 12, PASSO 13).',
    source_of_truth_per_event: Object.fromEntries(eventTaxonomy.map((e) => [e.event, e.source_semantics.find((s) => s.is_financial_truth)?.namespace || 'NENHUMA fonte é verdade financeira pra este evento'])),
    validation_rules: [
      'PURCHASE só conta como receita real quando confirmado por HOTMART.TRANSACTION_APPROVED, nunca por META.PURCHASE isolado.',
      'CANCELLED/EXPIRED nunca contam como abandono recuperável confirmado sem validação adicional (PASSO 12.2).',
      'nenhum evento OBSERVED vira VALIDATED sem reconciliação cruzada com a fonte de verdade do domínio correspondente.',
      'REQUIRED_FOR_OBSERVABILITY != REQUIRED_FOR_INTERPRETABILITY — um evento REQUIRED só bloqueia capital se sua ausência tornar o teste economicamente/causalmente não-interpretável, incapaz de atribuir exposição->outcome, incapaz de reconciliar o outcome financeiro necessário, ou incapaz de aplicar os guardrails definidos (PASSO 13.1, item 1).',
    ],
    capital_blocking_requirements: capitalBlockingEntries,
    non_blocking_requirements: nonBlockingEntries,
    technical_control_status: controlSurfaces,
    contract_status: contractStatus,
    missing_requirements: missingEvents,
    validation_status: contractStatus === 'VALIDATED' ? 'VALIDATED' : contractStatus === 'DEGRADED' || contractStatus === 'IMPLEMENTED_UNVALIDATED' ? 'PARTIAL' : 'NOT_VALIDATED',
  };
}

module.exports = { buildTrackingContract, computeContractStatus, classifyRequirement, resetContractCounter, REQUIREMENT_CLASSES, EVENTS_WITH_AGGREGATE_PROXY, BEHAVIORAL_DIAGNOSTIC_EVENTS, REVENUE_EVENTS, METRIC_TO_EVENTS, mapMetricsToEvents };
