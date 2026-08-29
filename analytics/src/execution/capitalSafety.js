'use strict';

const { CAPITAL_SAFETY_KEYS } = require('./enums');

// PASSO 14A.1, item 4 — perfis nomeados de capital safety. Nomes podem mudar; a estrutura é o
// que importa. NENHUM valor econômico real é inventado — todo perfil nasce com todas as chaves
// NOT_CONFIGURED, incluindo o novo human_approval_threshold (item 1). Mudar de perfil ativo é um
// domínio protegido (selfModificationProtection.js) — a LLM nunca troca o profile sozinha.
const CAPITAL_SAFETY_PROFILE_NAMES = ['VALIDATION', 'CONTROLLED_SCALE', 'AGGRESSIVE_SCALE', 'MANUAL_OVERRIDE'];

// item 1 — human_approval_threshold junta-se às 10 chaves originais (item 14A.4 do PASSO 14A).
const CAPITAL_SAFETY_PROFILE_KEYS = [...CAPITAL_SAFETY_KEYS, 'human_approval_threshold'];

function emptyCapitalSafetyProfile(name) {
  return { profile_name: name, ...Object.fromEntries(CAPITAL_SAFETY_PROFILE_KEYS.map((k) => [k, 'NOT_CONFIGURED'])) };
}

/** item 4 — todos os perfis nomeados existem como estrutura, todos NOT_CONFIGURED até uma decisão externa real. */
function buildDefaultCapitalSafetyProfiles() {
  return Object.fromEntries(CAPITAL_SAFETY_PROFILE_NAMES.map((name) => [name, emptyCapitalSafetyProfile(name)]));
}

// item 4 — nenhum perfil é "ativo" por padrão até uma decisão humana/externa real definir isso.
// A LLM nunca seleciona o profile ativo sozinha (ver selfModificationProtection.js).
function emptyCapitalSafetyConfig() { return emptyCapitalSafetyProfile('NONE_ACTIVE'); }

/**
 * loadCapitalSafetyConfig() — aceita um override explícito (só usado por fixtures sintéticas de
 * teste, nunca por dados reais inventados) — sem override, retorna o estado real hoje: tudo
 * NOT_CONFIGURED, porque nenhuma política de capital foi aprovada pelo negócio ainda.
 */
function loadCapitalSafetyConfig(overrides = null) {
  const base = emptyCapitalSafetyConfig();
  if (!overrides) return base;
  const merged = { ...base };
  for (const key of CAPITAL_SAFETY_PROFILE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) merged[key] = overrides[key];
  }
  return merged;
}

function isConfigured(config, key) {
  return config[key] !== 'NOT_CONFIGURED' && config[key] != null;
}

function isProfileConfigured(config) {
  return CAPITAL_SAFETY_PROFILE_KEYS.some((k) => isConfigured(config, k));
}

/**
 * evaluateCapitalLimit() — nunca assume que capital desconhecido é seguro (UNKNOWN capital !=
 * zero risk).
 */
function evaluateCapitalLimit({ config, key, requestedValue }) {
  if (!isConfigured(config, key)) {
    return { result: 'DEFER', reason: `${key} está NOT_CONFIGURED — sem política real definida, a Policy Engine não pode confirmar que a ação está dentro do limite. Nunca assume seguro por omissão.` };
  }
  if (requestedValue == null) {
    return { result: 'DEFER', reason: `valor solicitado pra ${key} é UNKNOWN — não avaliável sem o dado real (capital UNKNOWN != zero risk).` };
  }
  const limit = config[key];
  return requestedValue <= limit
    ? { result: 'ALLOW', reason: `${requestedValue} <= ${limit} (${key}).` }
    : { result: 'DENY', reason: `${requestedValue} > ${limit} (${key}) — excede o limite configurado.` };
}

module.exports = {
  emptyCapitalSafetyConfig, loadCapitalSafetyConfig, isConfigured, isProfileConfigured, evaluateCapitalLimit,
  CAPITAL_SAFETY_KEYS, CAPITAL_SAFETY_PROFILE_KEYS, CAPITAL_SAFETY_PROFILE_NAMES,
  emptyCapitalSafetyProfile, buildDefaultCapitalSafetyProfiles,
};
