'use strict';

// Limites de proteção de capital — NENHUM valor aqui é inventado. Ficam `null` (não
// configurados) até você definir um número real de negócio. O Profit Engine calcula e informa
// com o que houver disponível, mas NUNCA bloqueia campanha nem altera orçamento nesta etapa —
// isso é preparação de lógica pra uma automação futura, não automação em si.
module.exports = {
  monthly_budget: null, // ex: 1500.00 — orçamento de mídia planejado pro mês, se você definir um
  max_monthly_loss: null, // ex: -500.00 — prejuízo líquido máximo tolerado no mês antes de qualquer ação
  max_test_budget_percent: null, // ex: 0.20 — fração do orçamento mensal liberada pra testar criativo/oferta nova
  max_daily_spend: null, // ex: 60.00 — teto de gasto diário
};
