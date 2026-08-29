'use strict';

const { STAGE_TO_EVENTS, eventSourceSemantics } = require('./eventTaxonomy');
const { classifyControlSurface } = require('./controlSurfaces');
const { REVENUE_EVENTS } = require('./trackingContract');

/**
 * auditFunnelStage() — item 35-37. Por estágio REAL (atual ou candidato), audita observabilidade/
 * cobertura de evento/cobertura de identificador/linkagem de receita/cobertura comportamental —
 * nunca presume que um estágio existente está instrumentado só porque está "ativo" na arquitetura.
 */
function auditFunnelStage(stageType, platform) {
  const events = STAGE_TO_EVENTS[stageType] || [];
  const perEvent = events.map((event) => ({ event, source_semantics: eventSourceSemantics(event, platform) }));
  const anyObservedOrValidated = perEvent.some((e) => e.source_semantics.some((s) => ['OBSERVED', 'VALIDATED', 'PARTIAL'].includes(s.status)));
  const anyRevenueEvent = events.some((e) => REVENUE_EVENTS.includes(e));
  const revenueLinked = anyRevenueEvent && perEvent.some((e) => REVENUE_EVENTS.includes(e.event) && e.source_semantics.some((s) => s.is_financial_truth));
  const control = classifyControlSurface(stageType);

  return {
    stage_type: stageType,
    observability_status: anyObservedOrValidated ? 'OBSERVABLE' : 'NOT_OBSERVABLE',
    event_coverage: `${perEvent.filter((e) => e.source_semantics.some((s) => ['OBSERVED', 'VALIDATED', 'PARTIAL'].includes(s.status))).length}/${events.length}`,
    identifier_coverage_status: control === 'EXTERNAL' ? 'NOT_AVAILABLE' : 'NEEDS_RUNTIME_VALIDATION',
    revenue_linkage_status: anyRevenueEvent ? (revenueLinked ? 'CONFIRMED' : 'NOT_AVAILABLE') : 'NOT_APPLICABLE',
    behavior_coverage_status: control === 'CONTROLLED' ? (platform.clarity.live_session_collection_status === 'CONFIRMED' ? 'PARTIAL_ACCOUNT_WIDE_ONLY' : 'NOT_AVAILABLE') : 'NOT_APPLICABLE',
    control_surface: control,
    events,
  };
}

function buildFunnelMeasurementAudit(stageTypes, platform) {
  return stageTypes.map((t) => auditFunnelStage(t, platform));
}

module.exports = { auditFunnelStage, buildFunnelMeasurementAudit };
