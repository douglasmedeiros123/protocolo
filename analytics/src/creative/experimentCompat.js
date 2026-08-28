'use strict';

const { minimumEvidenceFor } = require('../experiments/evidence');

// EXPERIMENT ENGINE INTEGRATION (PASSO 8, item 20) — só prepara os campos compatíveis com o
// schema do Experiment Engine (category/target_metric/expected_effect/minimum_evidence/
// success_condition/failure_condition). NÃO cria nem executa experimento — quem decide criar o
// experimento de verdade é um humano (ou, no futuro, o próprio Decision Engine chamando
// experiments/builder.js), nunca este módulo.
function toExperimentCompatibleFields(candidate) {
  const minimumEvidence = minimumEvidenceFor('CREATIVE');
  return {
    category: 'CREATIVE',
    target_metric: candidate.target_metric,
    expected_effect: candidate.expected_effect,
    minimum_evidence: minimumEvidence,
    success_condition: `${candidate.target_metric} do período de teste melhora na direção esperada (${candidate.hypothesis.expected_direction}) vs baseline do ${candidate.parent_creative_id}.`,
    failure_condition: `${candidate.target_metric} do período de teste não melhora, ou piora, vs baseline do ${candidate.parent_creative_id}.`,
  };
}

module.exports = { toExperimentCompatibleFields };
