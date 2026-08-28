'use strict';

const { minimumEvidenceFor } = require('../experiments/evidence');

// EXPERIMENT ENGINE INTEGRATION (PASSO 10, item 42) — category = AOV (otimizar componente
// existente, compatível com o precedente real do AOV-001) ou OFFER (introduzir componente novo
// — bundle/upsell/downsell) — nunca quebra a compatibilidade já existente. minimum_evidence
// reusa exatamente o mesmo de evidence.js (AOV e OFFER já têm a mesma regra hoje: compras>=15,
// 14 dias).
function toExperimentCompatibleFields(candidate) {
  const category = candidate.action_type === 'OPTIMIZE_EXISTING_COMPONENT' ? 'AOV' : 'OFFER';
  const minimumEvidence = minimumEvidenceFor(category);
  return {
    category,
    target_metric: candidate.target_metric,
    expected_effect: candidate.expected_effect,
    minimum_evidence: minimumEvidence,
    success_condition: `${candidate.target_metric} do período de teste melhora na direção esperada (${candidate.hypothesis.expected_direction}) vs baseline do ${candidate.parent_offer_version}.`,
    failure_condition: `${candidate.target_metric} do período de teste não melhora, ou piora, vs baseline do ${candidate.parent_offer_version}.`,
  };
}

module.exports = { toExperimentCompatibleFields };
