'use strict';

const { checkAllConnectorsHealth } = require('./connectorHealth');
const hotmartConnector = require('./hotmartConnector');

// PASSO 18.5, item 23 — registry DERIVADO (nunca hardcoded): READ real depende de credencial +
// código de leitura existir; WRITE depende de o código de execução real existir (nenhum existe
// hoje, deliberadamente — item 10/24) mesmo quando a credencial permitiria.
async function buildOperationalCapabilityRegistry() {
  const health = await checkAllConnectorsHealth();

  function readStatus(platformHealth) {
    return platformHealth.health === 'AUTHENTICATED' ? 'ENABLED' : 'DISABLED';
  }

  return {
    META: {
      READ: readStatus(health.META),
      WRITE: 'AVAILABLE_BUT_APPROVAL_REQUIRED', // proposeBudgetChange/proposeCampaignStatusChange existem (metaConnector.js); execução real nunca implementada (item 10/24)
      health: health.META.health,
    },
    HOTMART: {
      READ: readStatus(health.HOTMART),
      WRITE: 'NOT_AVAILABLE', // WRITE_CAPABILITY real = UNKNOWN_REQUIRES_VALIDATION em todos os itens — nunca declarado AVAILABLE sem confirmação real
      write_detail: hotmartConnector.WRITE_CAPABILITY,
      health: health.HOTMART.health,
    },
    CLARITY: {
      READ: readStatus(health.CLARITY),
      WRITE: 'NOT_SUPPORTED', // API é read-only por natureza do produto
      health: health.CLARITY.health,
    },
    GITHUB: {
      READ: readStatus(health.GITHUB),
      WRITE: 'AVAILABLE_VIA_GIT_CLI_NOT_VIA_CONNECTOR', // commit/push já usado nesta sessão, mas fora deste connector tipado
      health: health.GITHUB.health,
    },
    DEPLOYMENT: {
      READ: 'ENABLED_VIA_GITHUB_COMMIT_STATUS', // já usado nos PASSOs 18/19 (API de status do GitHub, não uma API Vercel dedicada)
      WRITE: 'AVAILABLE_VIA_GIT_PUSH', // deploy real acontece via push, confirmado no PASSO 18
      health: health.VERCEL.health,
    },
  };
}

module.exports = { buildOperationalCapabilityRegistry };
