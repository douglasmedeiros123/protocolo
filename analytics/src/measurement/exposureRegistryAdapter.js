'use strict';

const path = require('path');
const { readJson } = require('../utils/fs');

// PASSO 16, item 12 — substitui os DOIS hardcodes de EXPOSURE_IDENTITY:false (measurement/
// builder.js e measurement/strategyHandoff.js) por uma leitura real do registry persistido.
//
// IMPORTANTE (evita dependência circular): execution/measurementHandoff.js já importa
// measurement/builder.js (execution -> measurement). Se measurement importasse execution/
// registry.js, criaria measurement -> execution -> measurement. Por isso este adapter lê o
// arquivo bruto diretamente (mesmo caminho usado por execution/registry.js's DEFAULT_DIR), nunca
// importando nenhum módulo de execution/.
const DEFAULT_EXECUTION_DATA_DIR = path.join(__dirname, '..', '..', 'data', 'execution');

function loadRawExposureRegistry(dataDir = DEFAULT_EXECUTION_DATA_DIR) {
  return readJson(path.join(dataDir, 'exposure-registry.json')) || [];
}

/**
 * resolveExposureIdentityEvidence() — item 12. A pergunta que blockerDependencyGraph.js precisa
 * responder pro nó EXPOSURE_IDENTITY não é "o candidato específico já tem uma entrada" (impossível
 * pra um vencedor ainda não implantado) — é "sabemos, com evidência real, qual arquitetura está
 * live AGORA" (o marcador que fundamenta a comparação prospectiva AGGREGATE_TEMPORAL_COMPARISON
 * uma vez que o próximo deploy realmente aconteça). Mesma lógica de
 * execution/exposureIdentityRegistry.js's isHistoricalBackfillRequiredForNextExperiment().
 */
function resolveExposureIdentityEvidence({ productId = null, dataDir = DEFAULT_EXECUTION_DATA_DIR } = {}) {
  const registry = loadRawExposureRegistry(dataDir);
  const activeEntries = registry.filter((e) => e.status === 'ACTIVE' && (productId == null || e.product_id == null || e.product_id === productId));
  const currentArchitectureMarkerEntries = activeEntries.filter((e) => e.observation_type === 'CURRENT_ARCHITECTURE_OBSERVATION');
  const hasExposureIdentity = currentArchitectureMarkerEntries.length > 0;

  return {
    has_exposure_identity: hasExposureIdentity,
    matched_entries: currentArchitectureMarkerEntries,
    all_active_entries_count: activeEntries.length,
    reason: hasExposureIdentity
      ? `${currentArchitectureMarkerEntries.length} entrada(s) real(is) ACTIVE de CURRENT_ARCHITECTURE_OBSERVATION encontrada(s) em analytics/data/execution/exposure-registry.json — suficiente pra fundamentar AGGREGATE_TEMPORAL_COMPARISON prospectivamente (mesmo com live_from=UNKNOWN), consistente com execution/exposureIdentityRegistry.js's isHistoricalBackfillRequiredForNextExperiment().`
      : 'nenhuma entrada real ACTIVE de CURRENT_ARCHITECTURE_OBSERVATION encontrada no registro — EXPOSURE_IDENTITY permanece não satisfeito (nunca assumido por omissão).',
  };
}

module.exports = { DEFAULT_EXECUTION_DATA_DIR, loadRawExposureRegistry, resolveExposureIdentityEvidence };
