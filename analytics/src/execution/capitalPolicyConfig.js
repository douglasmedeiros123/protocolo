'use strict';

const { CAPITAL_SAFETY_PROFILE_KEYS, CAPITAL_SAFETY_PROFILE_NAMES } = require('./capitalSafety');

// PASSO 14B, item 18 — os valores reais de capital policy devem viver em configuração externa/
// versionada — a LLM só LÊ (loadCapitalSafetyConfig já é isso). Este módulo formaliza o
// CONTRATO de onde essa config viveria (fora deste PASSO — nenhum arquivo de config real é
// criado aqui) e lista, de forma read-only, o que precisa ser definido antes de execução real.
const CAPITAL_POLICY_CONFIG_CONTRACT = {
  storage: 'arquivo de configuração externo/versionado (ex.: analytics/config/capital-policy.json ou equivalente) — fora do escopo deste PASSO, nunca criado/inventado aqui.',
  access: 'READ_ONLY pela LLM/Agent — nunca escrito por código deste PASSO. Escrita exige autoridade externa (mesmo padrão de ACTIVE_CAPITAL_PROFILE/ACTIVE_AUTHORITY_TIER em selfModificationProtection.js).',
  versioning: 'mudança de config real deve ser rastreável (quem mudou, quando, valor anterior) — requisito estrutural, implementação de fato fica pra quando a config real existir.',
  schema_keys: CAPITAL_SAFETY_PROFILE_KEYS,
  profiles: CAPITAL_SAFETY_PROFILE_NAMES,
};

function listParametersNeedingDefinitionBeforeRealExecution() {
  return CAPITAL_SAFETY_PROFILE_KEYS.map((key) => ({
    parameter: key,
    status: 'NOT_CONFIGURED',
    required_before: 'qualquer execução autônoma real (TIER_1+) — TIER_0_ANALYZE_ONLY nunca precisa disso.',
  }));
}

module.exports = { CAPITAL_POLICY_CONFIG_CONTRACT, listParametersNeedingDefinitionBeforeRealExecution };
