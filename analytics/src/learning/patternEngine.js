'use strict';

const { classifyHypothesisStatus } = require('./status');

// Agrupa learnings por (category + target_metric) — mais largo que hypothesis_key (que também
// olha mechanism/context/funnel_stage/asset_type). Um "padrão" aqui é "será que mexer nessa
// métrica, por QUALQUER mecanismo testado, costuma dar efeito na mesma direção" — evidência
// agregada, nunca inventada: só existe padrão se existir learning real (SUCCESS/FAILURE) por
// trás. INCONCLUSIVE entra na contagem de observações mas não no average_effect nem na direção.
function patternKey(learning) {
  return `${learning.category}::${learning.target_metric || (learning.applicable_to && learning.applicable_to.target_metric) || 'unspecified'}`;
}

function buildPatterns(enrichedLearnings) {
  const byKey = new Map();
  for (const l of enrichedLearnings) {
    const key = patternKey({ category: l.category, target_metric: l.applicable_to && l.applicable_to.target_metric });
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(l);
  }

  const patterns = [];
  for (const [key, group] of byKey.entries()) {
    const directional = group.filter((l) => l.result === 'SUCCESS' || l.result === 'FAILURE');
    const successes = group.filter((l) => l.result === 'SUCCESS').length;
    const failures = group.filter((l) => l.result === 'FAILURE').length;

    const effects = directional.filter((l) => l.delta_percent != null).map((l) => l.delta_percent);
    const average_effect = effects.length ? effects.reduce((s, e) => s + e, 0) / effects.length : null;

    const confidence = group.length ? group.reduce((s, l) => s + (l.confidence || 0), 0) / group.length : 0;
    const { status } = classifyHypothesisStatus({ successes, failures, confidence });

    // product_ids_observed / cross_product_observations: com 1 produto só, isso fica sempre
    // [produto_único] / 0 — NUNCA inventamos evidência cross-product (PASSO 6.1, item 6). O
    // "produto primário" é o mais frequente no grupo; observações de qualquer outro produto
    // contam como cross_product_observations.
    const productCounts = {};
    for (const l of group) productCounts[l.product_id] = (productCounts[l.product_id] || 0) + 1;
    const product_ids_observed = Object.keys(productCounts);
    const primaryProductId = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0][0];
    const cross_product_observations = group.filter((l) => l.product_id !== primaryProductId).length;

    const [category, target_metric] = key.split('::');
    patterns.push({
      pattern_id: `PATTERN-${key.replace(/[^a-zA-Z0-9]/g, '_')}`,
      pattern_name: `${category} / ${target_metric}`,
      category, target_metric,
      observations: group.length,
      supported_by: group.map((l) => l.source_experiment_id),
      associated_metric: target_metric,
      average_effect,
      confidence: Math.round(confidence * 100) / 100,
      status,
      product_ids_observed,
      cross_product_observations,
    });
  }
  return patterns;
}

module.exports = { buildPatterns, patternKey };
