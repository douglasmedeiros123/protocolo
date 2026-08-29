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
// PASSO 16, item 1-2 — REGISTER_OBSERVED_EXPOSURE (escrita interna: registra uma observação de
// estado que já existe) e CREATE_NEW_EXPOSURE (mutação externa real: coloca uma arquitetura/
// variante nova live) são tipos DELIBERADAMENTE separados — nunca a mesma ação disfarçada.
const ACTION_TYPES = [
  'ADJUST_BUDGET', 'PAUSE_CAMPAIGN', 'ACTIVATE_CAMPAIGN', 'ADJUST_BID', 'PUBLISH_CREATIVE',
  'UPDATE_TRACKING_CONFIG', 'UPDATE_PRODUCT_PRICE', 'UPDATE_OFFER', 'DEPLOY_LP_CHANGE',
  'START_EXPERIMENT', 'STOP_EXPERIMENT', 'REGISTER_OBSERVED_EXPOSURE', 'CREATE_NEW_EXPOSURE', 'OTHER',
];
// PASSO 16, item 1 — INTERNAL_REGISTRY/INTERNAL_DECISION_LEDGER são subjects de ESCRITA INTERNA
// pura (nunca tocam sistema externo) — blast radius deve refletir isso (blastRadius.js).
const SUBJECT_TYPES = ['CAMPAIGN', 'AD', 'ADSET', 'ARCHITECTURE', 'EXPERIMENT', 'PRODUCT', 'OFFER', 'TRACKING_CONFIG', 'LANDING_PAGE', 'INTERNAL_REGISTRY', 'INTERNAL_DECISION_LEDGER'];

// PASSO 14B — item 1: 4 conceitos de capital deliberadamente separados. RECOMMENDED_CAPITAL
// nunca é truncado pelos outros três.
const CAPITAL_CONCEPTS = ['RECOMMENDED_CAPITAL', 'AUTONOMOUS_EXECUTION_CAPITAL', 'HUMAN_APPROVED_CAPITAL', 'ABSOLUTE_PROHIBITED_CAPITAL'];

// item 2 — tiers de autoridade, do menor pro maior.
const AUTHORITY_TIERS_V2 = ['TIER_0_ANALYZE_ONLY', 'TIER_1_MICRO_AUTONOMY', 'TIER_2_CONTROLLED_AUTONOMY', 'TIER_3_SCALED_AUTONOMY', 'TIER_4_HUMAN_OVERRIDE'];

// item 4-5 — gates de promoção/rebaixamento de autoridade.
const PROMOTION_GATE_RESULTS = ['NOT_READY', 'ELIGIBLE_FOR_REVIEW', 'PROMOTE', 'HOLD', 'DEMOTE'];

// item 6 — buckets de capital.
const CAPITAL_BUCKETS = ['VALIDATION_CAPITAL', 'EXPLOITATION_CAPITAL', 'EXPLORATION_CAPITAL', 'MEASUREMENT_CAPITAL', 'RESERVE_CAPITAL'];

// item 8 — decisões de escalonamento de orçamento.
const BUDGET_ESCALATION_DECISIONS = ['DIRECT_JUMP', 'STEPWISE_SCALE', 'HOLD', 'REDUCE', 'STOP', 'REQUIRE_HUMAN_APPROVAL', 'DENY'];

// item 9 — escada de escala.
const SCALE_LADDER_STAGES = ['STAGE_0_VALIDATION', 'STAGE_1_SIGNAL_CONFIRMED', 'STAGE_2_ECONOMIC_CONFIRMATION', 'STAGE_3_CONTROLLED_SCALE', 'STAGE_4_AGGRESSIVE_SCALE'];

// item 11 — categorias de custo/perda, nunca fundidas.
const LOSS_CATEGORIES = ['BUSINESS_LOSS', 'EXPERIMENT_LEARNING_COST', 'MEASUREMENT_COST', 'EXECUTION_COST'];

// item 14 — a máquina precisa poder recomendar não-ação, sem viés de "sempre gastar".
const NO_ACTION_RECOMMENDATIONS = ['DO_NOT_SPEND', 'HOLD_CAPITAL', 'COLLECT_EVIDENCE', 'KILL_HYPOTHESIS', 'SWITCH_PRODUCT'];

// item 19 — categorias de limite reais a recomendar.
const LIMIT_CATEGORIES = ['HARD_SAFETY_LIMIT', 'AUTONOMOUS_LIMIT', 'HUMAN_APPROVAL_THRESHOLD', 'EXPERIMENT_LOSS_LIMIT'];
// PASSO 14B, calibração final — CURRENT_AUTHORITY_STATE != PERMANENT_ECONOMIC_POLICY.
// DEFENSIBLE_CURRENT_TIER_LIMIT: um valor real, mas só válido ENQUANTO o tier atual for TIER_0
// (não é uma política econômica permanente, é um reflexo do estado atual). NOT_APPLICABLE_AT_
// TIER_0: o próprio conceito não se aplica ainda (ex.: HUMAN_APPROVAL_THRESHOLD não existe
// enquanto não há execução autônoma pra aprovar).
const LIMIT_DEFENSIBILITY = ['DEFENSIBLE', 'DEFENSIBLE_CURRENT_TIER_LIMIT', 'NOT_APPLICABLE_AT_TIER_0', 'NOT_DEFENSIBLE_TO_SET'];

// item 3 — o que TIER_0_ANALYZE_ONLY PODE e NÃO PODE fazer, explícito (nunca implícito).
const TIER_0_ALLOWED_CAPABILITIES = ['ANALYZE', 'DIAGNOSE', 'RANK', 'RECOMMEND', 'PROPOSE', 'DRY_RUN', 'SIMULATE'];
const TIER_0_FORBIDDEN_CAPABILITIES = ['EXECUTE_EXTERNAL_MUTATION', 'SPEND_AUTONOMOUSLY'];

// item 2 — critérios que decidirão o HUMAN_APPROVAL_THRESHOLD real quando a máquina subir de
// tier — nunca inventado agora, só documentado como dependência futura.
const FUTURE_HUMAN_APPROVAL_THRESHOLD_CRITERIA = [
  'capital_disponivel', 'tolerancia_de_risco_do_operador', 'historico_da_maquina', 'experiment_performance',
  'loss_containment', 'reversibility', 'authority_tier', 'measurement_quality', 'action_type', 'blast_radius',
];

module.exports = {
  ACTION_STATES, EXECUTION_MODES, POLICY_RESULTS, POLICY_CATEGORIES,
  CIRCUIT_BREAKER_STATES, CIRCUIT_BREAKER_ACTIONS, CIRCUIT_BREAKER_TRIGGERS,
  RISK_LEVELS, BLAST_RADII, ROLLBACK_STATUSES, APPROVAL_STATUSES,
  CAPITAL_SAFETY_KEYS, ACTION_TYPES, SUBJECT_TYPES,
  CAPITAL_CONCEPTS, AUTHORITY_TIERS_V2, PROMOTION_GATE_RESULTS, CAPITAL_BUCKETS,
  BUDGET_ESCALATION_DECISIONS, SCALE_LADDER_STAGES, LOSS_CATEGORIES, NO_ACTION_RECOMMENDATIONS,
  LIMIT_CATEGORIES, LIMIT_DEFENSIBILITY, TIER_0_ALLOWED_CAPABILITIES, TIER_0_FORBIDDEN_CAPABILITIES,
  FUTURE_HUMAN_APPROVAL_THRESHOLD_CRITERIA,
};
