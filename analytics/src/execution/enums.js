'use strict';

// PASSO 14A — enums centrais da Execution Safety Architecture. Tudo aqui é DRY_RUN/SIMULATION/
// READ_ONLY (item 14A, regra absoluta) — nenhum destes estados é acionado por uma mutação real.

// item 14A.1 — estados do Action Contract.
const ACTION_STATES = [
  'PROPOSED', 'POLICY_REVIEW', 'APPROVED', 'DENIED', 'AWAITING_HUMAN_APPROVAL',
  'DRY_RUN_READY', 'EXECUTING', 'EXECUTED', 'FAILED', 'ROLLED_BACK', 'CANCELLED', 'EXPIRED',
];

// item 14A.1 — modos de execução. EXTERNAL_MUTATION nunca é alcançável enquanto SAFE_MODE=true
// (ver safeMode.js) — existe no enum pra documentar o contrato futuro, nunca acionado aqui.
const EXECUTION_MODES = ['DRY_RUN', 'SIMULATION', 'EXTERNAL_MUTATION'];

// item 14A.2 — resultados da Policy Engine.
const POLICY_RESULTS = ['ALLOW', 'DENY', 'REQUIRE_HUMAN_APPROVAL', 'DEFER', 'ALLOW_DRY_RUN_ONLY'];

// item 14A.3 — categorias de política, mínimo exigido.
const POLICY_CATEGORIES = [
  'CAPITAL_LIMIT_POLICY', 'BUDGET_DELTA_POLICY', 'ACTION_FREQUENCY_POLICY', 'COOLDOWN_POLICY',
  'MEASUREMENT_READINESS_POLICY', 'FINANCIAL_TRUTH_POLICY', 'ANOMALY_POLICY', 'EXPERIMENT_POLICY',
  'REVERSIBILITY_POLICY', 'HUMAN_APPROVAL_POLICY', 'GLOBAL_FREEZE_POLICY',
];

// item 14A.6 — estados do Circuit Breaker (motor lógico/simulação — nenhuma chamada real a API).
const CIRCUIT_BREAKER_STATES = ['CLOSED', 'WARNING', 'OPEN', 'MANUAL_LOCK'];
const CIRCUIT_BREAKER_ACTIONS = ['ALLOW_EXECUTION', 'BLOCK_EXECUTION', 'FREEZE_SCOPE', 'GLOBAL_FREEZE'];
const CIRCUIT_BREAKER_TRIGGERS = [
  'EXCESSIVE_ACTION_FREQUENCY', 'BUDGET_ACCELERATION', 'FINANCIAL_TRUTH_BLOCKED',
  'CRITICAL_DEPENDENT_ANOMALY', 'REPEATED_EXECUTION_FAILURE', 'UNEXPECTED_SPEND',
  'LOSS_THRESHOLD', 'POLICY_VIOLATION', 'DUPLICATE_ACTION_STORM',
];

// item 14A.13 — nível de risco.
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// item 14A.14 — blast radius, do menor pro maior.
const BLAST_RADII = ['SINGLE_ASSET', 'CAMPAIGN', 'PRODUCT', 'FUNNEL', 'ACCOUNT', 'GLOBAL'];

// item 14A.19 — rollback.
const ROLLBACK_STATUSES = ['SUPPORTED', 'IRREVERSIBLE_NOT_SUPPORTED', 'UNKNOWN'];

// item 14A.12 — aprovação humana.
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'];

// item 14A.4 — chaves de política de capital (nunca inventadas — UNKNOWN/NOT_CONFIGURED quando
// não existir configuração real).
const CAPITAL_SAFETY_KEYS = [
  'max_capital_per_action', 'max_capital_per_experiment', 'max_daily_capital',
  'max_budget_delta_percent', 'max_budget_delta_absolute', 'max_changes_per_hour',
  'max_changes_per_day', 'cooldown_after_change', 'max_unconfirmed_spend', 'max_loss_before_pause',
];

// item 14A.10 — tipos de action_type (extensível — nunca hardcoda um único tipo de mutação).
const ACTION_TYPES = [
  'ADJUST_BUDGET', 'PAUSE_CAMPAIGN', 'ACTIVATE_CAMPAIGN', 'ADJUST_BID', 'PUBLISH_CREATIVE',
  'UPDATE_TRACKING_CONFIG', 'UPDATE_PRODUCT_PRICE', 'UPDATE_OFFER', 'DEPLOY_LP_CHANGE',
  'START_EXPERIMENT', 'STOP_EXPERIMENT', 'OTHER',
];
const SUBJECT_TYPES = ['CAMPAIGN', 'AD', 'ADSET', 'ARCHITECTURE', 'EXPERIMENT', 'PRODUCT', 'OFFER', 'TRACKING_CONFIG', 'LANDING_PAGE'];

module.exports = {
  ACTION_STATES, EXECUTION_MODES, POLICY_RESULTS, POLICY_CATEGORIES,
  CIRCUIT_BREAKER_STATES, CIRCUIT_BREAKER_ACTIONS, CIRCUIT_BREAKER_TRIGGERS,
  RISK_LEVELS, BLAST_RADII, ROLLBACK_STATUSES, APPROVAL_STATUSES,
  CAPITAL_SAFETY_KEYS, ACTION_TYPES, SUBJECT_TYPES,
};
