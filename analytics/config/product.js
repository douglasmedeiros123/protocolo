'use strict';

// Configuração de produto — não é segredo, mas muda com o negócio (preço, nome de bump, etc).
// Centralizado aqui em vez de espalhado pelos normalizadores/métricas.

// product_id default deste produto — hoje só existe UM produto rodando na Máquina de ROI, mas
// já preparamos o terreno pra múltiplos produtos no futuro (PASSO 6.1): todo código que precisa
// de um product_id chama resolveProductId() em vez de hardcodar essa string.
const PRODUCT_ID = 'protocolo_resposta_garantida';
const MAIN_PRODUCT_NAME = 'Protocolo da Resposta Garantida';
const TICKET = 67.0;

// Nomes exatos (como aparecem no campo buyer.name da Hotmart) de compras de teste feitas
// pelo próprio dono da conta ou por ele a pedido — conhecidos nesta sessão em 2026-08-27.
// Isso é frágil por natureza (depende do nome bater exatamente) — é um ponto documentado
// como limitação no README, não uma solução robusta de detecção de teste.
const KNOWN_TEST_BUYERS = ['Celso Prates', 'Douglas da Mota Medeiros'];

const SALE_STATUSES_COUNTED_AS_REVENUE = ['COMPLETE', 'APPROVED'];

/**
 * Único ponto de verdade pro product_id — nunca hardcode PRODUCT_ID em outro arquivo.
 * Aceita: uma string de product_id já resolvida, um objeto tipo-experimento com .product_id
 * opcional, ou nada — sempre retorna um id válido (nunca null/undefined/erro).
 */
function resolveProductId(source) {
  if (typeof source === 'string' && source.trim()) return source.trim();
  if (source && typeof source === 'object' && source.product_id) return source.product_id;
  return PRODUCT_ID;
}

module.exports = {
  PRODUCT_ID,
  MAIN_PRODUCT_NAME,
  TICKET,
  KNOWN_TEST_BUYERS,
  SALE_STATUSES_COUNTED_AS_REVENUE,
  resolveProductId,
};
