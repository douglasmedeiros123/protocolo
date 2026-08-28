'use strict';

const STATUSES = ['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'SUCCESS', 'FAILURE', 'INCONCLUSIVE', 'CANCELLED'];
const CATEGORIES = ['CREATIVE', 'CRO', 'OFFER', 'AOV', 'CHECKOUT', 'TRACKING', 'MEDIA_BUYING'];

// Transições permitidas — não é uma máquina de estado rígida (não bloqueia), mas documenta o
// caminho esperado pra validação/testes. DRAFT é sempre o ponto de entrada.
const EXPECTED_FLOW = {
  DRAFT: ['READY', 'CANCELLED'],
  READY: ['RUNNING', 'CANCELLED'],
  RUNNING: ['PAUSED', 'SUCCESS', 'FAILURE', 'INCONCLUSIVE', 'CANCELLED'],
  PAUSED: ['RUNNING', 'CANCELLED'],
  SUCCESS: [], FAILURE: [], INCONCLUSIVE: [], CANCELLED: [],
};

function isValidStatus(status) {
  return STATUSES.includes(status);
}

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

/**
 * experiment_id determinístico: {CATEGORIA}-{sequencial de 3 dígitos dentro da categoria}.
 * Recebe a lista de ids já existentes (do registry) pra nunca colidir — não usa timestamp nem
 * random, então o mesmo estado de registry sempre produz o mesmo próximo id (testável).
 */
function generateExperimentId(category, existingIds = []) {
  if (!isValidCategory(category)) throw new Error(`Categoria inválida: ${category}. Use uma de: ${CATEGORIES.join(', ')}`);
  const prefix = `${category}-`;
  const usedNumbers = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** Molde vazio com todos os campos pedidos — cada função do engine preenche uma parte. */
function emptyExperimentTemplate() {
  return {
    experiment_id: null,
    created_at: null,
    status: 'DRAFT',
    category: null,
    hypothesis: null,
    baseline: null,
    target_metric: null,
    secondary_metrics: [],
    expected_effect: null,
    budget_limit: null,
    budget_check: null,
    start_condition: null,
    stop_condition: null,
    success_condition: null,
    failure_condition: null,
    minimum_evidence: null,
    attacks_path: null,
    priority: null,
    actual_result: null,
    conclusion: null,
    learning: null,
    next_action: null,
  };
}

module.exports = { STATUSES, CATEGORIES, EXPECTED_FLOW, isValidStatus, isValidCategory, generateExperimentId, emptyExperimentTemplate };
