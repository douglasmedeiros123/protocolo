'use strict';

let actionCounter = 0;
function nextActionId(productId) {
  actionCounter += 1;
  return `PLAN-ACTION-${productId}-${String(actionCounter).padStart(3, '0')}`;
}

/**
 * buildCostModel() — PASSO 11.1, items 19-21. Separa análise (já sunk/computacional),
 * implementação (produzir a mudança em si) e capital de medição (mídia real necessária pra
 * VALIDAR a mudança com uma amostra confiável). "Gerar candidato" nunca é confundido com "provar
 * performance" (item 19) — um custo desconhecido NUNCA vira 0 silenciosamente (item 20).
 */
function buildCostModel({ analysisCost = 0, implementationCost = null, measurementCapital = null } = {}) {
  const parts = [analysisCost, implementationCost, measurementCapital];
  const anyUnknown = parts.some((p) => p === 'NOT_ESTIMABLE' || p == null);
  return {
    analysis_cost: analysisCost,
    implementation_cost: implementationCost,
    measurement_capital: measurementCapital,
    total_known_cost: anyUnknown ? 'NOT_ESTIMABLE' : parts.reduce((s, p) => s + p, 0),
  };
}

function buildAction({ productId, sourceAgent, sourceCandidateId, actionType, objective, targetMetric = null, expectedInformationGain = null, expectedEconomicImpact = 'NOT_ESTIMABLE', confidence = null, costModel = null, capitalRequired = null, successCondition = null, failureCondition = null, killCondition = null }) {
  const resolvedCostModel = buildCostModel(costModel || {});
  return {
    action_id: nextActionId(productId),
    product_id: productId,
    source_agent: sourceAgent,
    source_candidate_id: sourceCandidateId,
    action_type: actionType,
    objective,
    target_metric: targetMetric,
    expected_information_gain: expectedInformationGain,
    expected_economic_impact: expectedEconomicImpact, // item 27/36 — nunca inventado, sempre NOT_ESTIMABLE até experimento real informar
    confidence,
    cost_model: resolvedCostModel,
    // compat: estimated_cost/capital_required continuam expostos (usados pelo ranking/roadmap),
    // derivados do cost_model — nunca um número paralelo inventado.
    estimated_cost: resolvedCostModel.total_known_cost === 'NOT_ESTIMABLE' ? null : resolvedCostModel.total_known_cost,
    capital_required: capitalRequired ?? (resolvedCostModel.measurement_capital === 'NOT_ESTIMABLE' ? null : resolvedCostModel.measurement_capital),
    dependency_ids: [],
    success_condition: successCondition,
    failure_condition: failureCondition,
    kill_condition: killCondition,
    priority: null,
    tracking_eligibility: null, // preenchido por actionAssembler.js via trackingBlockMatrix.js
    status: 'PLANNED', // item 29 — sempre começa PLANNED; resolveDependencies()/finalizeActionStatuses() ajustam pra READY/BLOCKED
  };
}

// item 26 — regras de dependência documentadas (não inventadas por candidato). Cada regra:
// `before` identifica a ação que deve vir antes; `after` identifica a que depende dela.
const DEPENDENCY_RULES = [
  {
    id: 'VALIDATE_BEFORE_CRO_EXPERIMENT',
    before: (a) => a.source_agent === 'CRO' && a.action_type === 'VALIDATE',
    after: (a) => a.source_agent === 'CRO' && a.action_type === 'RUN_EXPERIMENT',
    reason: 'validar o achado técnico (quase custo zero) antes de comprometer mídia num experimento CRO que pode estar confundido por ele (item 14/26).',
  },
  {
    id: 'FIX_TRACKING_BEFORE_CREATIVE_WINNER',
    before: (a) => a.action_type === 'FIX' && /tracking/i.test(a.objective || ''),
    after: (a) => a.source_agent === 'CREATIVE' && a.action_type === 'RUN_EXPERIMENT',
    reason: 'declarar um vencedor criativo financeiro exige tracking financeiro íntegro (item 26).',
  },
];

/**
 * resolveDependencies() — item 26/29. Marca dependency_ids reais e nunca deixa uma ação
 * "pronta" (READY) se sua dependência ainda não foi resolvida no próprio lote gerado.
 */
function resolveDependencies(actions) {
  for (const rule of DEPENDENCY_RULES) {
    const beforeActions = actions.filter(rule.before);
    if (beforeActions.length === 0) continue;
    for (const action of actions.filter(rule.after)) {
      action.dependency_ids.push(...beforeActions.map((b) => b.action_id));
      action._dependency_reasons = action._dependency_reasons || [];
      action._dependency_reasons.push(rule.reason);
    }
  }
  return actions;
}

/**
 * detectStrategicContradictions() — item 68. Capital insuficiente no ciclo bloqueia qualquer
 * ação com capital_required > disponível. O blocker de TRACKING agora vem de
 * action.tracking_eligibility (trackingBlockMatrix.js) — PASSO 11.1, item 4: bloqueia a decisão
 * específica que depende do escopo afetado, nunca o produto inteiro.
 */
function detectStrategicContradictions(actions, { capitalAvailable }) {
  const contradictions = [];
  for (const action of actions) {
    if (action.tracking_eligibility && action.tracking_eligibility.eligible === false) {
      contradictions.push({ action_id: action.action_id, contradiction: action.tracking_eligibility.reason, resolution: `BLOCKED até ${action.tracking_eligibility.required_tracking_scope} deixar de estar BLOCKED.` });
    }
    if (capitalAvailable != null && action.capital_required != null && action.capital_required > capitalAvailable) {
      contradictions.push({ action_id: action.action_id, contradiction: `capital_required (${action.capital_required}) > capital disponível no ciclo (${capitalAvailable}).`, resolution: 'BLOCKED até liberação de mais capital.' });
    }
  }
  return contradictions;
}

/**
 * finalizeActionStatuses() — item 29. Só PLANNED/READY/BLOCKED (nunca RUNNING/COMPLETED
 * automaticamente). BLOCKED por dependência não resolvida OU contradição estratégica; READY
 * quando nenhuma das duas se aplica.
 */
function finalizeActionStatuses(actions, contradictions) {
  const blockedIds = new Set(contradictions.map((c) => c.action_id));
  for (const action of actions) {
    const hasUnresolvedDependency = action.dependency_ids.length > 0; // dependência gerada neste mesmo lote nunca está "concluída" ainda
    if (hasUnresolvedDependency || blockedIds.has(action.action_id)) {
      action.status = 'BLOCKED';
      action.blocked_reason = hasUnresolvedDependency
        ? (action._dependency_reasons || []).join(' ')
        : contradictions.filter((c) => c.action_id === action.action_id).map((c) => c.contradiction).join(' ');
    } else {
      action.status = 'READY';
    }
    delete action._dependency_reasons;
  }
  return actions;
}

function resetActionCounter() { actionCounter = 0; }

module.exports = { buildAction, buildCostModel, resolveDependencies, detectStrategicContradictions, finalizeActionStatuses, DEPENDENCY_RULES, resetActionCounter };
