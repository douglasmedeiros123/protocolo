'use strict';

const { buildGlobalHypothesisKey, buildProductHypothesisKey } = require('./canonicalKey');
const { resolveAssetOrigin } = require('./assetOrigin');
const { resolveProductId } = require('../../config/product');

const CLOSED_STATUSES = ['SUCCESS', 'FAILURE', 'INCONCLUSIVE'];

// Todo learning nasce com escopo PRODUCT_SPECIFIC — mesmo que fique STRONG dentro de um único
// produto, ele NUNCA vira automaticamente CROSS_PRODUCT_CANDIDATE ou global. Isso é uma decisão
// futura (lógica de transferência entre produtos, ainda não construída), não um efeito colateral
// de confidence alta. Ver PASSO 6.1, item 4.
const DEFAULT_LEARNING_SCOPE = 'PRODUCT_SPECIFIC';

/**
 * Constrói um Learning "cru" (sem confidence/times_observed/status ainda — isso depende do
 * grupo inteiro de experimentos com a mesma hipótese, calculado depois em hypothesisRegistry.js)
 * a partir de UM experimento encerrado. DRAFT/READY/RUNNING/PAUSED nunca chegam aqui — retorna
 * null (o item 9/15 pede explicitamente pra não virarem "aprendizado conclusivo").
 *
 * `tags` são os campos extras da chave canônica (mechanism/context/funnel_stage/asset_type) —
 * opcionais, não existem no schema do Experiment Engine hoje, então quem chama pode informar;
 * sem eles, a chave usa "unspecified" nesses campos (nunca inventa um valor).
 */
function buildRawLearning(experiment, tags = {}) {
  if (!CLOSED_STATUSES.includes(experiment.status)) return null;

  const product_id = resolveProductId(experiment);
  const canonicalFields = {
    category: experiment.category,
    target_metric: experiment.target_metric,
    mechanism: tags.mechanism,
    context: tags.context,
    funnel_stage: tags.funnel_stage,
    asset_type: tags.asset_type,
  };
  const global_hypothesis_key = buildGlobalHypothesisKey(canonicalFields);
  const product_hypothesis_key = buildProductHypothesisKey(product_id, canonicalFields);

  const actual = experiment.actual_result || {};
  const metricBefore = experiment.baseline ? experiment.baseline[experiment.target_metric] : null;
  const metricAfter = Object.prototype.hasOwnProperty.call(actual, experiment.target_metric) ? actual[experiment.target_metric] : null;
  const delta_absolute = (metricBefore != null && metricAfter != null) ? metricAfter - metricBefore : null;
  const delta_percent = (delta_absolute != null && metricBefore) ? delta_absolute / metricBefore : null;

  const trackingFlags = Array.isArray(actual.tracking_flags) ? actual.tracking_flags : null;
  const criticalFlags = trackingFlags ? trackingFlags.filter((f) => f.severity === 'critical') : [];

  return {
    learning_id: `LEARN-${experiment.experiment_id}`,
    source_experiment_id: experiment.experiment_id,
    product_id,
    category: experiment.category,
    hypothesis: experiment.hypothesis,
    global_hypothesis_key,
    product_hypothesis_key,
    learning_scope: DEFAULT_LEARNING_SCOPE,
    asset_origin: resolveAssetOrigin(experiment),
    asset_refs: {
      creative_id: experiment.creative_id ?? null,
      landing_page_version: experiment.landing_page_version ?? null,
      offer_version: experiment.offer_version ?? null,
      funnel_version: experiment.funnel_version ?? null,
      relationship_sequence_id: experiment.relationship_sequence_id ?? null,
    },
    result: experiment.status,
    conclusion: experiment.conclusion || null,
    evidence: experiment.actual_result || null,
    metric_before: metricBefore,
    metric_after: metricAfter,
    delta_absolute,
    delta_percent,
    what_worked: experiment.status === 'SUCCESS' ? (experiment.learning && experiment.learning.summary) || null : null,
    what_failed: experiment.status === 'FAILURE' ? (experiment.learning && experiment.learning.summary) || null : null,
    what_not_to_repeat: (experiment.learning && experiment.learning.what_not_to_repeat) || null,
    reusable_insight: (experiment.learning && experiment.learning.next_test_suggestion) || null,
    applicable_to: { category: experiment.category, attacks_path: experiment.attacks_path, target_metric: experiment.target_metric },
    tracking_flags_responsible: criticalFlags.map((f) => f.code),
    tracking_checked: trackingFlags != null,
    minimum_evidence: experiment.minimum_evidence || null,
  };
}

module.exports = { buildRawLearning, CLOSED_STATUSES };
