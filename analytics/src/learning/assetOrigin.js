'use strict';

// asset_origin representa a ORIGEM DO ATIVO testado (criativo, LP, oferta, etc.) — NÃO quem
// executou o experimento. Um criativo gerado futuramente por um Creative Agent tem
// asset_origin = MACHINE mesmo que um humano tenha disparado o experimento.
const ASSET_ORIGINS = ['MACHINE', 'HUMAN', 'EXTERNAL', 'MIXED', 'UNKNOWN'];

function isValidAssetOrigin(value) {
  return ASSET_ORIGINS.includes(value);
}

/**
 * Resolve asset_origin de um experimento. Só aceita o valor se ele vier EXPLICITAMENTE e válido
 * no próprio registro do experimento (ex.: escrito por quem criou o ativo). Nunca infere
 * MACHINE/HUMAN por dedução — sem evidência explícita, o default é sempre UNKNOWN. Isso cobre
 * de propósito os 4 DRAFTs atuais (nenhum deles tem esse campo ainda): eles viram UNKNOWN, não
 * HUMAN nem MACHINE.
 */
function resolveAssetOrigin(experiment) {
  if (experiment && isValidAssetOrigin(experiment.asset_origin)) return experiment.asset_origin;
  return 'UNKNOWN';
}

module.exports = { ASSET_ORIGINS, isValidAssetOrigin, resolveAssetOrigin };
