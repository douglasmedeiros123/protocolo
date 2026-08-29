'use strict';

const fs = require('fs');
const path = require('path');
const { safeDiv } = require('../metrics/safeDiv');

const DEFAULT_DAILY_DIR = path.join(__dirname, '..', '..', 'data', 'daily');

function loadDay(date, dailyDir = DEFAULT_DAILY_DIR) {
  const filePath = path.join(dailyDir, `${date}.json`);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

/**
 * classifyDayDivergence() — item 23-24. O join real Meta<->Hotmart só existe no nível de
 * CONTAGEM/VALOR agregado por dia (item 11 do audit real: Hotmart nunca retorna identificador
 * de anúncio) — nunca finge granularidade por transação que não existe. Um dia pode carregar
 * MAIS de uma divergência ao mesmo tempo (ex.: ghost purchase + reembolso no mesmo dia) —
 * retorna sempre uma lista, nunca um único tipo forçado.
 */
function classifyDayDivergence(day) {
  if (!day || !day.meta || !day.hotmart) {
    return [{ type: 'UNKNOWN', evidence: 'dia sem coleta Meta e/ou Hotmart completa.', blocking_financial_truth: false }];
  }
  const divergences = [];
  const metaCompras = day.meta.totals.compra_meta || 0;
  const hotmartReais = (day.hotmart.totals.orders_count || 0) + (day.hotmart.totals.order_bumps_count || 0);
  const codes = new Set((day.tracking_flags || []).map((f) => f.code));

  if (metaCompras > hotmartReais) {
    divergences.push({
      type: 'UNMATCHED_PLATFORM_ONLY',
      evidence: `Meta reportou ${metaCompras} compra(s); Hotmart confirma ${hotmartReais} venda(s) real(is) — ${metaCompras - hotmartReais} compra(s) fantasma(s) da plataforma, sem lastro financeiro.`,
      blocking_financial_truth: false, // item: divergência NUNCA invalida a verdade financeira da Hotmart — só descreve o excesso do lado plataforma
      never_promoted_to_revenue: true,
    });
  } else if (hotmartReais > metaCompras) {
    divergences.push({
      type: 'UNMATCHED_FINANCIAL_ONLY',
      evidence: `Hotmart confirma ${hotmartReais} venda(s) real(is); Meta só reportou ${metaCompras} compra(s) atribuída(s) — venda real sem atribuição de plataforma (ex.: orgânico, outra fonte, ou perda de atribuição).`,
      blocking_financial_truth: false,
    });
  } else if (metaCompras > 0 && hotmartReais > 0) {
    if (codes.has('SUSPICIOUS_REPEATED_PURCHASE_VALUE')) {
      divergences.push({ type: 'VALUE_MISMATCH', evidence: 'contagem bate, mas o valor médio de compra reportado pela Meta não corresponde a nenhum valor bruto/líquido real da Hotmart no dia.', blocking_financial_truth: false });
    } else {
      divergences.push({ type: 'MATCHED', evidence: `contagem (${metaCompras}) e valor consistentes entre Meta e Hotmart neste dia.`, blocking_financial_truth: false });
    }
  }

  if (codes.has('DUPLICATE_TRANSACTION')) divergences.push({ type: 'DUPLICATE_SUSPECTED', evidence: 'transaction_id duplicado detectado nos dados normalizados da Hotmart.', blocking_financial_truth: false });
  if ((day.hotmart.totals.refunds_count || 0) > 0) divergences.push({ type: 'REFUNDED', evidence: `${day.hotmart.totals.refunds_count} reembolso(s) real(is) confirmados pela Hotmart.`, blocking_financial_truth: false });
  if ((day.hotmart.totals.cancellations_or_expired_count || 0) > 0) divergences.push({ type: 'CANCELLED', evidence: `${day.hotmart.totals.cancellations_or_expired_count} transação(ões) CANCELLED/EXPIRED confirmadas pela Hotmart — nunca contadas como abandono confirmado sem validação adicional (PASSO 12.2).`, blocking_financial_truth: false });
  if ((day.hotmart.totals.test_transactions_count || 0) > 0) divergences.push({ type: 'TEST_TRANSACTION', evidence: `${day.hotmart.totals.test_transactions_count} transação(ões) de teste conhecida(s) excluída(s) da receita.`, blocking_financial_truth: false });

  return divergences.length > 0 ? divergences : [{ type: 'MATCHED', evidence: 'sem atividade de compra em nenhuma das fontes neste dia — nada a reconciliar.', blocking_financial_truth: false }];
}

/**
 * buildReconciliation() — item 12-13/23-24. Roda a classificação real dia a dia sobre o período
 * pedido, agrega por tipo de divergência, e preserva explicitamente os casos reais já conhecidos
 * de META_PURCHASE_WITHOUT_HOTMART_SALE (nunca convertidos em receita, nunca apagados — item 24).
 */
function buildReconciliation({ dates, dataDir } = {}) {
  const dailyDir = dataDir ? path.join(dataDir) : DEFAULT_DAILY_DIR;
  const perDay = [];
  for (const date of dates || []) {
    const day = loadDay(date, dailyDir);
    perDay.push({ date, found: day != null, divergences: classifyDayDivergence(day) });
  }

  const byType = {};
  const ghostPurchaseDays = [];
  for (const d of perDay) {
    for (const div of d.divergences) {
      byType[div.type] = (byType[div.type] || 0) + 1;
      if (div.type === 'UNMATCHED_PLATFORM_ONLY') {
        ghostPurchaseDays.push({ date: d.date, evidence: div.evidence, never_promoted_to_revenue: true });
      }
    }
  }

  const daysWithData = perDay.filter((d) => d.found).length;
  const matchedDays = byType.MATCHED || 0;

  return {
    dates_requested: dates || [],
    days_evaluated: perDay.length,
    days_with_data: daysWithData,
    per_day: perDay,
    divergence_counts_by_type: byType,
    match_rate: safeDiv(matchedDays, daysWithData),
    ghost_purchase_days: ghostPurchaseDays, // item 24 — nunca revenue, nunca apagado, sempre preservado explicitamente
    invariant_note: 'nenhuma divergência aqui jamais altera ou invalida a verdade financeira da Hotmart (FINANCIAL_TRANSACTION_TRUTH) — o Reconciliation Engine só classifica e preserva, nunca corrige/apaga um lado com base no outro (item 12).',
  };
}

module.exports = { loadDay, classifyDayDivergence, buildReconciliation, DEFAULT_DAILY_DIR };
