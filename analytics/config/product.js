'use strict';

// Configuração de produto — não é segredo, mas muda com o negócio (preço, nome de bump, etc).
// Centralizado aqui em vez de espalhado pelos normalizadores/métricas.

module.exports = {
  MAIN_PRODUCT_NAME: 'Protocolo da Resposta Garantida',
  TICKET: 67.0,

  // Nomes exatos (como aparecem no campo buyer.name da Hotmart) de compras de teste feitas
  // pelo próprio dono da conta ou por ele a pedido — conhecidos nesta sessão em 2026-08-27.
  // Isso é frágil por natureza (depende do nome bater exatamente) — é um ponto documentado
  // como limitação no README, não uma solução robusta de detecção de teste.
  KNOWN_TEST_BUYERS: ['Celso Prates', 'Douglas da Mota Medeiros'],

  SALE_STATUSES_COUNTED_AS_REVENUE: ['COMPLETE', 'APPROVED'],
};
