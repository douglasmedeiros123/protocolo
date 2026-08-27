'use strict';

// Verificações de qualidade de dado. Regra de ouro: gera FLAG, nunca corrige o dado sozinho.
// Cada flag é { code, severity ('info'|'warn'|'critical'), message, details }.

const EPSILON = 0.01; // tolerância de centavo pra comparação de valores monetários
const CPA_RATIO_THRESHOLD = 3; // cpa_meta vs cpa_financeiro divergindo mais que 3x = suspeito
const SUDDEN_CHANGE_THRESHOLD = 0.5; // 50% de mudança dia-a-dia numa métrica-chave

function closeEnough(a, b, eps = EPSILON) {
  return Math.abs(a - b) <= eps;
}

function checkMetaPurchaseWithoutHotmartSale(meta, hotmart) {
  const metaCompras = meta.totals.compra_meta;
  const hotmartVendasReais = hotmart.totals.orders_count + hotmart.totals.order_bumps_count;
  if (metaCompras > hotmartVendasReais) {
    return {
      code: 'META_PURCHASE_WITHOUT_HOTMART_SALE',
      severity: 'critical',
      message: `Meta reportou ${metaCompras} compra(s), mas a Hotmart só confirma ${hotmartVendasReais} venda(s) real(is) (COMPLETE/APPROVED, sem teste) neste dia.`,
      details: { meta_compras: metaCompras, hotmart_vendas_reais: hotmartVendasReais, delta: metaCompras - hotmartVendasReais },
    };
  }
  return null;
}

function checkSuspiciousRepeatedPurchaseValue(meta, hotmart) {
  if (meta.totals.compra_meta <= 0) return null;
  const avgValue = meta.totals.receita_meta / meta.totals.compra_meta;
  const realValues = hotmart.transactions
    .filter((t) => t.counted_as_revenue)
    .flatMap((t) => [t.gross, t.net].filter((v) => v != null));
  const matchesSomeReal = realValues.some((v) => closeEnough(v, avgValue));
  if (!matchesSomeReal) {
    return {
      code: 'SUSPICIOUS_REPEATED_PURCHASE_VALUE',
      severity: 'warn',
      message: `Valor médio de compra reportado pela Meta (R$${avgValue.toFixed(2)}) não bate com nenhum valor bruto ou líquido de transação real da Hotmart neste dia — pode ser um valor fixo/desatualizado no evento de Purchase.`,
      details: { meta_avg_purchase_value: Number(avgValue.toFixed(2)), hotmart_real_values: realValues },
    };
  }
  return null;
}

function checkNegativeOrImpossibleRevenue(meta, hotmart) {
  const flags = [];
  if (meta.totals.receita_meta < 0) {
    flags.push({ code: 'NEGATIVE_OR_IMPOSSIBLE_REVENUE', severity: 'critical', message: 'Receita reportada pela Meta é negativa.', details: { field: 'meta.totals.receita_meta', value: meta.totals.receita_meta } });
  }
  if (hotmart.totals.gross_revenue < 0 || hotmart.totals.net_revenue < 0) {
    flags.push({ code: 'NEGATIVE_OR_IMPOSSIBLE_REVENUE', severity: 'critical', message: 'Receita bruta ou líquida da Hotmart é negativa.', details: { gross: hotmart.totals.gross_revenue, net: hotmart.totals.net_revenue } });
  }
  return flags;
}

function checkCpaInconsistent(economics) {
  const { cpa_meta, cpa_financeiro } = economics;
  if (cpa_meta == null || cpa_financeiro == null || cpa_meta <= 0 || cpa_financeiro <= 0) return null;
  const ratio = Math.max(cpa_meta, cpa_financeiro) / Math.min(cpa_meta, cpa_financeiro);
  if (ratio >= CPA_RATIO_THRESHOLD) {
    return {
      code: 'CPA_INCONSISTENT',
      severity: 'warn',
      message: `CPA (Meta) e CPA (financeiro/Hotmart) divergem em ${ratio.toFixed(1)}x neste dia.`,
      details: { cpa_meta, cpa_financeiro, ratio: Number(ratio.toFixed(2)) },
    };
  }
  return null;
}

// Clarity não entra mais aqui — deixou de ser uma "fonte do dia-alvo" (ver collectors/clarity.js
// e a seção "Clarity" do README). Data quality do snapshot de negócio só cobre Meta/Hotmart/GitHub.
function checkMissingData({ meta, hotmart, github }) {
  const flags = [];
  if (!meta || meta.by_ad.length === 0) {
    flags.push({ code: 'MISSING_DATA', severity: 'info', message: 'Meta não retornou nenhuma linha de anúncio para este dia (pode ser campanha pausada, ou realmente sem veiculação).', details: { source: 'meta' } });
  }
  if (!hotmart) {
    flags.push({ code: 'MISSING_DATA', severity: 'critical', message: 'Coleta da Hotmart falhou ou não foi executada.', details: { source: 'hotmart' } });
  }
  if (!github) {
    flags.push({ code: 'MISSING_DATA', severity: 'info', message: 'Coleta do histórico de commits (GitHub) não executada.', details: { source: 'github' } });
  }
  return flags;
}

function checkDuplicateTransaction(hotmart) {
  const seen = new Map();
  const dupes = [];
  for (const t of hotmart.transactions) {
    if (seen.has(t.transaction_id)) dupes.push(t.transaction_id);
    seen.set(t.transaction_id, true);
  }
  if (dupes.length > 0) {
    return {
      code: 'DUPLICATE_TRANSACTION',
      severity: 'critical',
      message: `${dupes.length} transaction_id duplicado(s) encontrado(s) nos dados normalizados da Hotmart — não deveria acontecer (a coleta deduplica por transaction_id).`,
      details: { duplicate_ids: dupes },
    };
  }
  return null;
}

function checkSuddenMetricChange(economics, previousDaySnapshot) {
  if (!previousDaySnapshot || !previousDaySnapshot.metrics) return null;
  const prev = previousDaySnapshot.metrics.economics;
  const flags = [];
  for (const field of ['roas_financeiro', 'cpa_financeiro']) {
    const curr = economics[field];
    const prior = prev ? prev[field] : null;
    if (curr == null || prior == null || prior === 0) continue;
    const relChange = Math.abs(curr - prior) / Math.abs(prior);
    if (relChange >= SUDDEN_CHANGE_THRESHOLD) {
      flags.push({
        code: 'SUDDEN_METRIC_CHANGE',
        severity: 'info',
        message: `${field} mudou ${(relChange * 100).toFixed(0)}% em relação ao dia anterior.`,
        details: { field, previous: prior, current: curr },
      });
    }
  }
  return flags;
}

/** Roda todos os checks e devolve uma lista achatada de flags (nunca lança erro). */
function runDataQualityChecks({ meta, hotmart, github, economics, previousDaySnapshot }) {
  const flags = [];
  const pushIf = (result) => {
    if (!result) return;
    if (Array.isArray(result)) flags.push(...result.filter(Boolean));
    else flags.push(result);
  };

  pushIf(checkMissingData({ meta, hotmart, github }));
  if (meta && hotmart) {
    pushIf(checkMetaPurchaseWithoutHotmartSale(meta, hotmart));
    pushIf(checkSuspiciousRepeatedPurchaseValue(meta, hotmart));
    pushIf(checkNegativeOrImpossibleRevenue(meta, hotmart));
    pushIf(checkDuplicateTransaction(hotmart));
  }
  if (economics) {
    pushIf(checkCpaInconsistent(economics));
    pushIf(checkSuddenMetricChange(economics, previousDaySnapshot));
  }
  return flags;
}

module.exports = {
  runDataQualityChecks,
  // exportadas individualmente para os testes
  checkMetaPurchaseWithoutHotmartSale,
  checkSuspiciousRepeatedPurchaseValue,
  checkNegativeOrImpossibleRevenue,
  checkCpaInconsistent,
  checkDuplicateTransaction,
  checkSuddenMetricChange,
};
