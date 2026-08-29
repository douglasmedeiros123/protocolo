'use strict';

// item 14A.11 — o sistema inicia com SAFE_MODE=true, sempre. Em SAFE_MODE, mutações externas são
// PROIBIDAS — mesmo uma Action APPROVED vira DRY_RUN_ONLY se o connector for mutável. Este é o
// valor real e único deste PASSO 14A — nenhum código neste repo pode desligar isso.
const SAFE_MODE = true; // constante, nunca uma variável de ambiente sobrescrevível por este PASSO

function isSafeModeActive() { return SAFE_MODE; }

/**
 * enforceSafeMode() — item 14A.11. Recebe uma decisão de execução já aprovada e, se o connector é
 * mutável (`connectorIsMutable=true`) e SAFE_MODE está ativo, força o modo pra DRY_RUN_ONLY —
 * mesmo que o status da Action seja APPROVED. Isso é aplicado incondicionalmente, nunca
 * contornável por confidence alta ou por uma política que "libere" SAFE_MODE (item 14A.5 —
 * SAFE_MODE também é implicitamente um domínio protegido: nada neste PASSO expõe uma forma de
 * desativá-lo).
 */
function enforceSafeMode({ actionStatus, connectorIsMutable }) {
  if (!isSafeModeActive()) {
    return { enforced_mode: connectorIsMutable ? 'EXTERNAL_MUTATION' : 'DRY_RUN', safe_mode_active: false, forced: false };
  }
  if (connectorIsMutable) {
    return {
      enforced_mode: 'DRY_RUN_ONLY',
      safe_mode_active: true,
      forced: actionStatus === 'APPROVED', // mesmo aprovada, é forçada — nunca alcança mutação real
      reason: 'SAFE_MODE=true e o connector é mutável — execução real é PROIBIDA independente do status da Action (item 14A.11).',
    };
  }
  return { enforced_mode: 'DRY_RUN', safe_mode_active: true, forced: false, reason: 'connector não-mutável (read-only) — sem risco de mutação externa mesmo fora de SAFE_MODE.' };
}

module.exports = { SAFE_MODE, isSafeModeActive, enforceSafeMode };
