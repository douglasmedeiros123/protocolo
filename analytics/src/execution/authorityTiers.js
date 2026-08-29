'use strict';

const { AUTHORITY_TIERS_V2, TIER_0_ALLOWED_CAPABILITIES, TIER_0_FORBIDDEN_CAPABILITIES } = require('./enums');

// PASSO 14B, item 2 — 5 tiers de autoridade. Cada campo econômico nasce NOT_CONFIGURED — nenhum
// valor real é inventado aqui (item 19 trata das recomendações justificadas separadamente).
// Trocar o tier ativo é um domínio protegido (selfModificationProtection.js) — LLM nunca decide
// sozinha em qual tier opera.
const TIER_FIELD_KEYS = [
  'allowed_action_types', 'max_autonomous_capital_per_action', 'max_autonomous_capital_per_day',
  'max_budget_delta', 'max_action_frequency', 'required_measurement_health', 'required_confidence',
  'required_reversibility', 'allowed_blast_radius', 'human_approval_threshold', 'cooldown', 'loss_limits',
];

// item 2 — TIER_0 é o único com semântica fixa e universalmente segura (nunca executa nada,
// mesmo com política real configurada) — os demais ficam com campos NOT_CONFIGURED até uma
// decisão externa real definir os números.
function emptyTierDefinition(tierName) {
  const base = Object.fromEntries(TIER_FIELD_KEYS.map((k) => [k, 'NOT_CONFIGURED']));
  if (tierName === 'TIER_0_ANALYZE_ONLY') {
    // calibração final — CURRENT_AUTHORITY_STATE != PERMANENT_ECONOMIC_POLICY: max_autonomous_
    // capital_per_action/per_day=0 é real (DEFENSIBLE_CURRENT_TIER_LIMIT, ver
    // realLimitRecommendations.js), mas human_approval_threshold NÃO é 0 — o conceito não se
    // aplica ainda (NOT_APPLICABLE_AT_TIER_0), porque não há execução autônoma nenhuma pra um
    // humano aprovar "acima de um valor". Representar como 0 sugeriria "aprovar tudo acima de
    // zero", uma política econômica que não existe — a ausência do mecanismo em si.
    return {
      tier: tierName, ...base, allowed_action_types: [],
      max_autonomous_capital_per_action: 0, max_autonomous_capital_per_day: 0,
      human_approval_threshold: 'NOT_APPLICABLE_AT_TIER_0',
      allowed_capabilities: TIER_0_ALLOWED_CAPABILITIES, // item 3 — ANALYZE/DIAGNOSE/RANK/RECOMMEND/PROPOSE/DRY_RUN/SIMULATE — inteligência plena
      forbidden_capabilities: TIER_0_FORBIDDEN_CAPABILITIES, // EXECUTE_EXTERNAL_MUTATION/SPEND_AUTONOMOUSLY — nunca
      recommendation_range_capped: false, // item 4 — TIER_0 nunca limita o que a máquina pode RECOMENDAR, só o que pode EXECUTAR
      description: 'analisa/diagnostica/ranqueia/recomenda/propõe/simula em dry-run com inteligência plena — zero execução autônoma real. Sempre disponível, nunca precisa de configuração real.',
    };
  }
  return { tier: tierName, ...base, description: `tier estrutural definido, mas todos os limites econômicos NOT_CONFIGURED — nenhuma execução autônoma real é possível neste tier até uma política externa real definir os números (item 19).` };
}

function buildDefaultAuthorityTiers() {
  return Object.fromEntries(AUTHORITY_TIERS_V2.map((t) => [t, emptyTierDefinition(t)]));
}

/** isTierUsable() — mesmo um tier "mais alto" nunca autoriza nada sem limites reais configurados (exceto TIER_0, que é sempre 0 por definição). */
function isTierUsableForAutonomy(tierDefinition) {
  if (tierDefinition.tier === 'TIER_0_ANALYZE_ONLY') return false;
  return TIER_FIELD_KEYS.every((k) => tierDefinition[k] !== 'NOT_CONFIGURED');
}

module.exports = { AUTHORITY_TIERS_V2, TIER_FIELD_KEYS, emptyTierDefinition, buildDefaultAuthorityTiers, isTierUsableForAutonomy };
