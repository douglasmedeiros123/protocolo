'use strict';

// Chave canônica determinística pra identificar hipóteses "parecidas" — SEM embeddings, SEM
// LLM (proibido nesta etapa). Usa só campos estruturados. Qualquer campo ausente vira o literal
// "unspecified" (nunca omitido silenciosamente — isso deixaria a chave ambígua e duas hipóteses
// diferentes colidiriam sem ninguém perceber).
const FIELDS = ['category', 'target_metric', 'mechanism', 'context', 'funnel_stage', 'asset_type'];

function normalizeField(value) {
  if (value == null || value === '') return 'unspecified';
  return String(value).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Chave GLOBAL — recebe um objeto com (parte de) os 6 campos e monta a chave — mesma entrada,
 * mesma chave, sempre. NÃO carrega produto: é a chave que permite, no futuro, comparar "a mesma
 * hipótese" entre produtos diferentes (transferência de aprendizado entre produtos, ainda não
 * implementada — ver product_hypothesis_key abaixo pra por que isso é seguro hoje).
 */
function buildHypothesisKey(fields = {}) {
  return FIELDS.map((f) => normalizeField(fields[f])).join('|');
}

function parseHypothesisKey(key) {
  const parts = key.split('|');
  const out = {};
  FIELDS.forEach((f, i) => { out[f] = parts[i]; });
  return out;
}

// Alias explícito — mesma função, nome que deixa claro (no resto do código) que essa chave é
// intencionalmente cega a produto.
const buildGlobalHypothesisKey = buildHypothesisKey;

/**
 * Chave PRODUCT-SCOPED — namespace a chave global pelo product_id. É ESTA chave que o
 * Hypothesis Registry usa pra agrupar evidência (nunca a global sozinha): garante que um
 * aprendizado do Produto A nunca vira evidência agregada do Produto B só porque a hipótese
 * (mecanismo/categoria/métrica) é textualmente igual. Formato: "{product_id}::{chave_global}" —
 * "::" nunca aparece dentro de um product_id normalizado (normalizeField remove espaços e não
 * introduz ":"), então o split é sempre não-ambíguo.
 */
function buildProductHypothesisKey(productId, fields = {}) {
  return `${normalizeField(productId)}::${buildGlobalHypothesisKey(fields)}`;
}

function parseProductHypothesisKey(key) {
  const sepIndex = key.indexOf('::');
  if (sepIndex === -1) return { product_id: null, global_hypothesis_key: key, ...parseHypothesisKey(key) };
  const productId = key.slice(0, sepIndex);
  const globalKey = key.slice(sepIndex + 2);
  return { product_id: productId, global_hypothesis_key: globalKey, ...parseHypothesisKey(globalKey) };
}

module.exports = {
  buildHypothesisKey,
  buildGlobalHypothesisKey,
  buildProductHypothesisKey,
  parseHypothesisKey,
  parseProductHypothesisKey,
  FIELDS,
};
