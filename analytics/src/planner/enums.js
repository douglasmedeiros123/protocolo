'use strict';

// PASSO 11 — enums centrais do Strategic Planner. Um arquivo só pra evitar espalhar 10+ enums
// pequenos por 10+ módulos — cada um é referenciado por vários módulos do planner.

// item 7 — veredito estratégico. SWITCH_PRODUCT é sempre RECOMENDAÇÃO, nunca ação automática.
const VERDICTS = ['CONTINUE_VALIDATION', 'OPTIMIZE', 'HOLD', 'SCALE', 'SWITCH_PRODUCT'];

// item 8 — separado do verdict. Ex.: verdict=CONTINUE_VALIDATION + viability=INSUFFICIENT_EVIDENCE é válido.
const VIABILITY_STATUSES = ['UNKNOWN', 'INSUFFICIENT_EVIDENCE', 'PLAUSIBLE', 'PROMISING', 'PROVEN', 'AT_RISK', 'UNLIKELY', 'INVALIDATED'];

// item 10 — nunca confundir "sem caminho MODELADO" com "produto inviável".
const KNOWN_PATH_STATUSES = ['YES', 'PARTIAL', 'NO_KNOWN_PATH', 'UNKNOWN'];

// item 15 — alavancas estratégicas.
const LEVER_TYPES = ['CREATIVE', 'CRO', 'OFFER', 'MEDIA_BUYING', 'PRICING', 'CHECKOUT', 'LIFECYCLE', 'ORGANIC', 'PRODUCT', 'OTHER'];

// item 16 — uma alavanca só vira EXHAUSTED com evidência adequada (nunca por "já mexemos nisso").
const LEVER_STATES = ['UNEXPLORED', 'AVAILABLE', 'TESTING', 'SUPPORTED', 'EXHAUSTED', 'INVALIDATED', 'BLOCKED', 'UNKNOWN'];

// item 18 — nunca contagem simples (testamos X de Y).
const HYPOTHESIS_SPACE_STATUSES = ['LARGELY_UNEXPLORED', 'PARTIALLY_EXPLORED', 'WELL_EXPLORED', 'NEAR_EXHAUSTED', 'EXHAUSTED', 'UNKNOWN'];

// item 27 — tipos de ação estratégica. Nenhum é executado por este PASSO.
const ACTION_TYPES = ['VALIDATE', 'FIX', 'MEASURE', 'RUN_EXPERIMENT', 'GENERATE_ASSET', 'IMPLEMENT', 'WAIT_FOR_DATA', 'SCALE_CAPITAL', 'REDUCE_CAPITAL', 'HOLD_CAPITAL', 'SWITCH_PRODUCT', 'OTHER'];

// item 29 — Planner só gera PLANNED/READY/BLOCKED; nunca RUNNING automaticamente.
const ACTION_STATUSES = ['PLANNED', 'BLOCKED', 'READY', 'RUNNING', 'COMPLETED', 'CANCELLED'];
const PLANNER_GENERATABLE_ACTION_STATUSES = ['PLANNED', 'BLOCKED', 'READY'];

// items 22-23 — nunca inventar valor monetário sem base.
const EXPECTED_VALUE_STATES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN'];

// item 33.
const SCALE_GATE_STATUSES = ['NOT_ELIGIBLE', 'ELIGIBLE_FOR_TEST_SCALE', 'ELIGIBLE_FOR_SCALE', 'BLOCKED', 'UNKNOWN'];

// item 47 — matriz de evidência por categoria.
const EVIDENCE_MATRIX_CATEGORIES = ['DATA_QUALITY', 'TRACKING', 'CREATIVE', 'CRO', 'OFFER', 'MEDIA_BUYING', 'FINANCIAL_ECONOMICS', 'EXPERIMENT_COVERAGE', 'LEARNING_COVERAGE'];

// item 38 — "estamos no caminho?" só quando existe meta temporal configurada.
const ON_TRACK_STATUSES = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_CONFIGURED', 'INSUFFICIENT_DATA'];

// item 19 — gate de troca de produto.
const SWITCH_GATE_CRITERIA_KEYS = [
  'data_quality', 'tracking_sufficiency', 'minimum_evidence_volume', 'completed_experiments',
  'key_levers_explored', 'relevant_hypotheses_invalidated', 'no_plausible_economic_path',
  'additional_capital_required', 'expected_value_of_continuing', 'opportunity_cost_of_testing_alternative',
];

// PASSO 11.1, item 2 — tracking não é binário. Cada escopo é avaliado independentemente.
const TRACKING_SCOPES = ['FINANCIAL_TRUTH', 'PLATFORM_ATTRIBUTION', 'CREATIVE_ATTRIBUTION', 'CAMPAIGN_ATTRIBUTION', 'FUNNEL_MEASUREMENT', 'EXPERIMENT_MEASUREMENT'];
const TRACKING_SCOPE_STATUSES = ['RELIABLE', 'DEGRADED', 'BLOCKED', 'UNKNOWN'];

// item 6 — postura de capital, separada do verdict. Permite CONTINUE_VALIDATION + SELECTIVE.
const CAPITAL_POSTURES = ['OPEN', 'SELECTIVE', 'HOLD', 'SCALE'];

// items 9-10 — EV econômico (estrito, exige base defensável) separado de VOI (qualitativo).
const EXPECTED_ECONOMIC_VALUE_STATES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN'];
const VALUE_OF_INFORMATION_STATES = ['HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'];

// item 13/16 — nem todo gap é decision-changing. Definição formal em evidenceGaps.js.
const EVIDENCE_GAP_CLASSIFICATIONS = ['DECISION_CRITICAL', 'DECISION_RELEVANT', 'INFORMATIONAL', 'LOW_VALUE'];
// item 17 — evita um detalhe de otimização local competir com uma pergunta de viabilidade do produto.
const EVIDENCE_GAP_CATEGORIES = ['PRODUCT_VIABILITY', 'CAPITAL_ALLOCATION', 'EXPERIMENT_SELECTION', 'LOCAL_OPTIMIZATION', 'DATA_QUALITY'];

function isValidEnumValue(list, value) { return list.includes(value); }

module.exports = {
  VERDICTS, VIABILITY_STATUSES, KNOWN_PATH_STATUSES, LEVER_TYPES, LEVER_STATES,
  HYPOTHESIS_SPACE_STATUSES, ACTION_TYPES, ACTION_STATUSES, PLANNER_GENERATABLE_ACTION_STATUSES,
  EXPECTED_VALUE_STATES, SCALE_GATE_STATUSES, EVIDENCE_MATRIX_CATEGORIES, ON_TRACK_STATUSES,
  SWITCH_GATE_CRITERIA_KEYS, TRACKING_SCOPES, TRACKING_SCOPE_STATUSES, CAPITAL_POSTURES,
  EXPECTED_ECONOMIC_VALUE_STATES, VALUE_OF_INFORMATION_STATES, EVIDENCE_GAP_CLASSIFICATIONS,
  EVIDENCE_GAP_CATEGORIES, isValidEnumValue,
};
