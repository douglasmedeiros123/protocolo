'use strict';

const { CAPITAL_GATE_STATES } = require('./enums');

// PASSO 13.1, item 6 — mapeamento determinístico e documentado do nó-raiz do blocker dependency
// graph pro estado de capital gate. EXPOSURE_IDENTITY hoje é satisfazível com um registro leve
// (não instrumentação de evento) — mesmo assim mapeado pro estado mais próximo existente
// (NEEDS_TRACKING_IMPLEMENTATION), mas a `reason` do gate sempre distingue os dois tipos de
// trabalho explicitamente, nunca deixando implícito que é o mesmo esforço de editar GTM/Pixel.
const GATE_STATE_BY_GRAPH_BLOCKER = {
  EXPOSURE_IDENTITY: 'NEEDS_TRACKING_IMPLEMENTATION',
  FINANCIAL_OUTCOME_LINKAGE: 'NEEDS_TRACKING_IMPLEMENTATION',
  EXPERIMENT_ATTRIBUTION: 'NEEDS_TRACKING_IMPLEMENTATION',
};

/**
 * evaluateMeasurementCapitalGate() — item 40-42 (PASSO 13), recalibrado no PASSO 13.1 (items
 * 1-2/4/6/8) pra nunca decidir a partir de um evento isolado (CHECKOUT_INITIATED) quando o
 * blocker de verdade é estrutural (EXPOSURE_IDENTITY no blocker dependency graph) — e pra
 * consumir anomaly findings só quando o escopo afetado sobrepõe a dependência real da decisão
 * (item 8: ANOMALY_SCOPE != GLOBAL_BLOCK, BLOCK ONLY DEPENDENT DECISIONS).
 */
function evaluateMeasurementCapitalGate({ contract, financialTruthBlocking, reconciliationMatchRate, blockerGraph, anomalyFindings = [], decisionDependsOnScopes }) {
  if (financialTruthBlocking) {
    return {
      state: 'BLOCKED_BY_MEASUREMENT',
      blocking_requirements: contract.capital_blocking_requirements.map((e) => e.event),
      non_blocking_gaps: contract.non_blocking_requirements.filter((e) => e.status === 'REQUIRED').map((e) => e.event),
      current_blocker: 'FINANCIAL_TRUTH_CORRUPTED',
      next_unlock: 'restaurar a integridade da própria fonte financeira (Hotmart) antes de qualquer outra coisa.',
      confidence: 'HIGH',
      reason: 'a própria fonte de verdade financeira está comprometida no período — nenhuma decisão de capital é responsável enquanto isso persistir.',
      anomaly_driven: false,
    };
  }

  // item 8 — anomalia CAPITAL_BLOCKING só bloqueia quando o escopo afetado sobrepõe a
  // dependência real desta decisão (a própria anomaly já vem contextualizada por
  // decisionDependsOnScopes em anomalyDetection.js — aqui só se consome o resultado).
  const capitalBlockingAnomaly = (anomalyFindings || []).find((a) => a.severity === 'CAPITAL_BLOCKING' && a.overlaps_decision);
  if (capitalBlockingAnomaly) {
    return {
      state: 'BLOCKED_BY_MEASUREMENT',
      blocking_requirements: [],
      non_blocking_gaps: [],
      current_blocker: `ANOMALY:${capitalBlockingAnomaly.type}`,
      next_unlock: 'resolver a anomalia antes de reavaliar capital.',
      confidence: 'HIGH',
      reason: `anomalia ${capitalBlockingAnomaly.type} classificada CAPITAL_BLOCKING e sobrepõe a dependência desta decisão (${capitalBlockingAnomaly.affected_scopes.join(', ')}): ${capitalBlockingAnomaly.reason}`,
      anomaly_driven: true,
    };
  }

  // item 6 — o blocker dependency graph, quando fornecido, é a autoridade sobre o current_blocker
  // real (nunca um evento isolado sendo apresentado como capability unlock suficiente, item 4).
  if (blockerGraph && blockerGraph.current_blocker) {
    const state = GATE_STATE_BY_GRAPH_BLOCKER[blockerGraph.current_blocker] || 'UNKNOWN';
    return {
      state,
      blocking_requirements: [blockerGraph.current_blocker],
      non_blocking_gaps: (blockerGraph.non_blocking_gaps || []).map((g) => g.soft_dependency),
      current_blocker: blockerGraph.current_blocker,
      remaining_blockers: blockerGraph.remaining_blockers,
      next_unlock: blockerGraph.next_unlock,
      unlock_dependency: blockerGraph.unlock_dependency,
      capability_unlocked: blockerGraph.capability_unlocked,
      confidence: 'HIGH',
      reason: blockerGraph.current_blocker === 'EXPOSURE_IDENTITY'
        ? `${blockerGraph.nodes.EXPOSURE_IDENTITY.description} Este é um registro operacional leve (qual arquitetura esteve live em qual data), NÃO instrumentação de evento/GTM/Pixel — mas continua sendo o blocker real da cadeia EXPOSURE->FINANCIAL_OUTCOME, mesmo que CHECKOUT_INITIATED seja implementado (item 4).`
        : blockerGraph.nodes[blockerGraph.current_blocker]?.description || 'blocker estrutural da cadeia de atribuição de experimento.',
      anomaly_driven: false,
    };
  }

  // fallback (sem blockerGraph fornecido) — mesma lógica anterior, restrita aos requisitos
  // genuinamente CAPITAL_BLOCKING_REQUIREMENT/INTERPRETABILITY_REQUIREMENT do contrato (item 1-2
  // — nunca inclui DIAGNOSTIC_REQUIREMENT/QUALITY_ENHANCEMENT/OPTIONAL).
  const blocking = contract.capital_blocking_requirements;
  const blockingStatuses = blocking.map((e) => e.status);
  const requiredOnly = blocking.filter((e) => e.status === 'REQUIRED').map((e) => e.event);
  const observedOnly = blocking.filter((e) => e.status === 'OBSERVED').map((e) => e.event);
  const nonBlockingGaps = contract.non_blocking_requirements.filter((e) => e.status === 'REQUIRED').map((e) => e.event);

  if (requiredOnly.length > 0) {
    return {
      state: 'NEEDS_TRACKING_IMPLEMENTATION',
      blocking_requirements: requiredOnly,
      non_blocking_gaps: nonBlockingGaps,
      current_blocker: 'TRACKING_IMPLEMENTATION',
      next_unlock: 'TRACKING_VALIDATION',
      confidence: 'HIGH',
      reason: `evento(s) indispensável(is) pra interpretar a métrica escolhida por este teste ainda sem nenhuma instrumentação observável: ${requiredOnly.join(', ')}.`,
      anomaly_driven: false,
    };
  }
  if (observedOnly.length > 0) {
    return {
      state: 'NEEDS_TRACKING_VALIDATION',
      blocking_requirements: observedOnly,
      non_blocking_gaps: nonBlockingGaps,
      current_blocker: 'TRACKING_VALIDATION',
      next_unlock: 'RECONCILIATION',
      confidence: 'MEDIUM',
      reason: `evento(s) observado(s) mas ainda sem validação cruzada contra a fonte de verdade correspondente: ${observedOnly.join(', ')}.`,
      anomaly_driven: false,
    };
  }
  if (blockingStatuses.length > 0 && !blockingStatuses.every((s) => s === 'VALIDATED')) {
    return {
      state: 'UNKNOWN', blocking_requirements: [], non_blocking_gaps: nonBlockingGaps, current_blocker: 'UNKNOWN', next_unlock: 'UNKNOWN', confidence: 'NOT_ASSESSABLE',
      reason: 'estado dos requisitos bloqueantes não totalmente classificável — nunca presumido READY sem confirmação explícita.', anomaly_driven: false,
    };
  }
  if (reconciliationMatchRate != null && reconciliationMatchRate < 0.9) {
    return {
      state: 'NEEDS_RECONCILIATION', blocking_requirements: [], non_blocking_gaps: nonBlockingGaps, current_blocker: 'RECONCILIATION', next_unlock: 'READY_FOR_CAPITAL', confidence: 'MEDIUM',
      reason: `taxa de reconciliação Meta<->Hotmart no período (${(reconciliationMatchRate * 100).toFixed(0)}%) abaixo do limiar de confiança pra liberar capital sem ressalva.`, anomaly_driven: false,
    };
  }

  return {
    state: 'READY_FOR_CAPITAL', blocking_requirements: [], non_blocking_gaps: nonBlockingGaps, current_blocker: null, next_unlock: null,
    confidence: nonBlockingGaps.length > 0 ? 'MEDIUM' : 'HIGH',
    reason: 'todos os requisitos que bloqueiam capital estão validados contra a fonte de verdade correspondente; lacunas remanescentes (se houver) são granularidade não-bloqueante.', anomaly_driven: false,
  };
}

module.exports = { evaluateMeasurementCapitalGate, CAPITAL_GATE_STATES, GATE_STATE_BY_GRAPH_BLOCKER };
