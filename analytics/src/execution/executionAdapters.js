'use strict';

const { enforceSafeMode } = require('./safeMode');

// item 14A.10 — interface abstrata pra futuros connectors. NENHUM connector real é implementado
// aqui — cada adapter abaixo é um stub que sabe validar/simular, mas cujo execute() permanece
// bloqueado em SAFE_MODE (sempre, item 14A.11), independente do subject/ação.
function createStubAdapter({ name, mutable }) {
  return {
    name,
    mutable,
    /** validate() — nunca chama nada externo, só checa a forma do request. */
    validate(request) {
      if (!request || !request.action_id) return { valid: false, reason: 'request sem action_id.' };
      return { valid: true, reason: 'request estruturalmente válido (validação local, nenhuma chamada externa).' };
    },
    /** simulate() — nunca chama nada externo, só projeta o resultado. */
    simulate(request) {
      return {
        would_call_external_api: this.mutable,
        simulated_result: 'SIMULATED_OK',
        note: `simulação pura — nenhuma chamada real feita a ${name} (item 14A.10).`,
      };
    },
    /**
     * execute() — item 14A.10/11. SEMPRE bloqueado/stubbed em SAFE_MODE. Nunca remove este guard
     * — é a única linha de defesa contra mutação real neste PASSO.
     */
    execute(request) {
      const enforcement = enforceSafeMode({ actionStatus: request.status, connectorIsMutable: this.mutable });
      if (enforcement.enforced_mode !== 'EXTERNAL_MUTATION') {
        return { executed: false, blocked: true, enforced_mode: enforcement.enforced_mode, reason: enforcement.reason || 'SAFE_MODE ativo — execução real bloqueada.' };
      }
      // inalcançável enquanto SAFE_MODE=true (safeMode.js não expõe forma de desativar).
      throw new Error('execução externa real não implementada neste PASSO — SAFE_MODE deveria ter bloqueado antes daqui.');
    },
  };
}

const MediaExecutionAdapter = createStubAdapter({ name: 'MediaExecutionAdapter', mutable: true });
const TrackingExecutionAdapter = createStubAdapter({ name: 'TrackingExecutionAdapter', mutable: true });
const WebsiteExecutionAdapter = createStubAdapter({ name: 'WebsiteExecutionAdapter', mutable: true });
const OfferExecutionAdapter = createStubAdapter({ name: 'OfferExecutionAdapter', mutable: true });
// PASSO 16, item 1-2 — escrita interna pura (registro local, nunca sistema externo). mutable:
// false é uma afirmação estrutural real (não um relaxamento de segurança) — este adapter nunca
// ganha capacidade de deploy/tracking/campanha; ele só sabe escrever um registro JSON local.
const InternalRegistryAdapter = createStubAdapter({ name: 'InternalRegistryAdapter', mutable: false });

const ADAPTERS_BY_ACTION_TYPE = {
  ADJUST_BUDGET: MediaExecutionAdapter, PAUSE_CAMPAIGN: MediaExecutionAdapter, ACTIVATE_CAMPAIGN: MediaExecutionAdapter, ADJUST_BID: MediaExecutionAdapter,
  UPDATE_TRACKING_CONFIG: TrackingExecutionAdapter,
  DEPLOY_LP_CHANGE: WebsiteExecutionAdapter, PUBLISH_CREATIVE: WebsiteExecutionAdapter,
  UPDATE_PRODUCT_PRICE: OfferExecutionAdapter, UPDATE_OFFER: OfferExecutionAdapter,
  REGISTER_OBSERVED_EXPOSURE: InternalRegistryAdapter, // item 2 — nunca pode fazer deploy/alterar página/tráfego/campanha
  CREATE_NEW_EXPOSURE: WebsiteExecutionAdapter, // item 2 — mutação externa real (colocar variante live) — nunca mascarada como registro interno
};

function resolveAdapter(actionType) { return ADAPTERS_BY_ACTION_TYPE[actionType] || null; }

module.exports = { createStubAdapter, MediaExecutionAdapter, TrackingExecutionAdapter, WebsiteExecutionAdapter, OfferExecutionAdapter, InternalRegistryAdapter, ADAPTERS_BY_ACTION_TYPE, resolveAdapter };
