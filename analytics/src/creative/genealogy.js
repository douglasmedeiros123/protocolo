'use strict';

const { DNA_FIELDS } = require('./dna');

// ISOLATION OF VARIABLES (PASSO 8, item 6) — só as variáveis "principais" de conteúdo contam
// pro teste de variável única (mudanças de metadado como platform/placement não contam como
// "a variável testada"). Documentado, fixo — não é opinião por criativo.
const PRINCIPAL_VARIABLES = ['hook', 'angle', 'pain', 'desire', 'mechanism', 'promise', 'proof', 'objection', 'cta', 'visual_style', 'format'];

/**
 * Compara o DNA do pai com o do filho e decide se é teste de variável única. Se QUALQUER um dos
 * dois DNAs não tiver dado suficiente pra comparar (todos os campos principais null dos dois
 * lados), o resultado é UNKNOWN — nunca assumimos "variável única" sem evidência.
 */
function classifyVariableIsolation(parentDNA = {}, childDNA = {}) {
  const changed = PRINCIPAL_VARIABLES.filter((f) => {
    const p = parentDNA[f] ?? null;
    const c = childDNA[f] ?? null;
    return p !== c && (p != null || c != null);
  });

  const anyDataAtAll = PRINCIPAL_VARIABLES.some((f) => parentDNA[f] != null || childDNA[f] != null);
  if (!anyDataAtAll) {
    return { isolation_status: 'UNKNOWN', variables_changed: [], reason: 'Nenhum campo de DNA principal preenchido em nenhum dos dois lados — não é possível avaliar isolamento.' };
  }
  if (changed.length === 0) {
    return { isolation_status: 'NO_CHANGE_DETECTED', variables_changed: [], reason: 'Nenhuma variável principal do DNA difere entre pai e filho (dado disponível).' };
  }
  if (changed.length === 1) {
    return { isolation_status: 'SINGLE_VARIABLE', variables_changed: changed, reason: `Apenas "${changed[0]}" mudou — aprendizado causal limpo.` };
  }
  return { isolation_status: 'MULTI_VARIABLE_TEST', variables_changed: changed, reason: `${changed.length} variáveis mudaram (${changed.join(', ')}) — qualidade do aprendizado causal reduzida.` };
}

/**
 * Gera o próximo creative_id de uma genealogia: {parent_base_id}-V{geração seguinte}. Sequencial
 * e determinístico a partir dos ids já existentes daquela família (nunca timestamp/random).
 */
function nextGenerationId(baseCreativeId, existingIds = []) {
  const prefix = `${baseCreativeId}-V`;
  const usedVersions = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = usedVersions.length ? Math.max(...usedVersions) + 1 : 2; // V2 é a 1ª variação (o original é geração 1, sem sufixo)
  return `${prefix}${next}`;
}

module.exports = { PRINCIPAL_VARIABLES, classifyVariableIsolation, nextGenerationId };
