'use strict';

const { assessTracking } = require('../decision/trackingAssessment');

// ============================================================================================
// DÍVIDA ARQUITETURAL REGISTRADA (PASSO 11.1) — NÃO IMPLEMENTAR AGORA.
//
// Este módulo resolve tracking-por-escopo com o granularity disponível hoje (6 escopos, reusando
// assessTracking() já existente). Mas FINANCIAL_TRUTH aqui é uma mistura de dois conceitos que
// um futuro "Measurement & Attribution Intelligence Agent" deveria separar de verdade:
//
//   FINANCIAL_TRANSACTION_TRUTH — a transação em si aconteceu/não aconteceu (Hotmart nunca
//     deixa de ser a fonte de verdade disso; corrompida só por BLOCKING_CODES reais como
//     MISSING_DATA/NEGATIVE_OR_IMPOSSIBLE_REVENUE/DUPLICATE_TRANSACTION).
//   REVENUE_TRUTH — o valor bruto/líquido reconhecido por transação (hoje junto com
//     FINANCIAL_TRANSACTION_TRUTH, mas conceitualmente distinto — ex.: reembolso parcial,
//     ajuste de imposto, moeda).
//   PLATFORM_ATTRIBUTION — o que o Meta reporta como resultado (compra_meta/receita_meta),
//     hoje tratado aqui como um único escopo degradável.
//   CROSS_PLATFORM_RECONCILIATION — o processo de casar evento Meta com transação Hotmart
//     (hoje é só a comparação agregada dia-a-dia em dataQuality.js — não existe reconciliação
//     transação-a-transação real).
//   CREATIVE_ATTRIBUTION / CAMPAIGN_ATTRIBUTION — já existem aqui, mas herdam a mesma
//     limitação: sem ad_id na Hotmart, a reconciliação é estrutural-mente impossível hoje, só
//     inferida por ausência de contradição agregada.
//   EXPERIMENT_ATTRIBUTION — hoje aproximado por categoria do experimento (CREATIVE vs
//     CRO/OFFER/AOV/MEDIA_BUYING); um agente dedicado poderia atribuir por experimento real,
//     não por categoria.
//
// Regra a preservar quando esse agente existir: divergência Meta x Hotmart NUNCA significa que
// "a verdade financeira deixou de existir" — só que a RECONCILIAÇÃO entre as duas fontes está
// degradada. Hotmart continua sendo a fonte de verdade de transação/receita, sempre.
// ============================================================================================

/**
 * PASSO 11.1, items 1-3 — tracking NÃO é binário. REUSA assessTracking() (decision/
 * trackingAssessment.js, já existente desde o PASSO 7) — nunca reimplementa a distinção
 * BLOCKING/DEGRADING. Hotmart é a fonte de verdade financeira; um flag Meta degradante NUNCA
 * corrompe FINANCIAL_TRUTH sozinho (confirmado em profit/aggregate.js: sum.gross_revenue/
 * net_revenue/orders_count vêm 100% de snapshot.hotmart, nunca de snapshot.meta).
 *
 * META_PURCHASE_WITHOUT_HOTMART_SALE (a única flag degradante catalogada hoje) infla
 * meta.totals.compra_meta/receita_meta e o rollup POR ANÚNCIO em meta.by_ad[] — que
 * creative/metricsAggregator.js usa DIRETO, sem checagem cruzada contra Hotmart por anúncio
 * (Hotmart não carrega ad_id). Por isso ela degrada especificamente PLATFORM_ATTRIBUTION,
 * CREATIVE_ATTRIBUTION e CAMPAIGN_ATTRIBUTION — nunca FINANCIAL_TRUTH, nunca FUNNEL_MEASUREMENT
 * (LPV/checkout/CTR são eventos independentes do Purchase).
 */
function statusFromConfidence({ isBlocking, confidenceScore, hasDegradingEvidence }) {
  if (isBlocking) return 'BLOCKED';
  if (hasDegradingEvidence && confidenceScore < 100) return 'DEGRADED';
  return 'RELIABLE';
}

function buildTrackingScopeMatrix({ criticalFlagsByDay = [], experiments = [] } = {}) {
  const assessment = assessTracking(criticalFlagsByDay);
  // assessTracking() já separou blocking de degrading/unclassified — aqui só reagrupamos o que
  // NÃO bloqueia Hotmart (degradante conhecido + código novo ainda não catalogado, tratado como
  // degradante por padrão, nunca ignorado — mesma regra de trackingAssessment.js).
  const metaPhantomOccurrences = [...assessment.degrading_occurrences, ...assessment.unclassified_occurrences];
  const hasMetaPhantom = metaPhantomOccurrences.length > 0;

  const financialTruthStatus = statusFromConfidence({ isBlocking: assessment.is_blocking, confidenceScore: assessment.confidence_score, hasDegradingEvidence: assessment.degrading_occurrences.length > 0 || assessment.unclassified_occurrences.length > 0 });

  const scopes = {
    // item 3 — Hotmart (spend total não existe do lado Hotmart; net revenue/financial buyers/
    // ROAS financeiro vêm 100% de hotmart.transactions, confirmado em profit/aggregate.js).
    FINANCIAL_TRUTH: {
      status: financialTruthStatus,
      confidence: assessment.confidence_score / 100,
      issues: assessment.is_blocking ? assessment.blocking_occurrences.map((o) => o.code) : [...new Set(metaPhantomOccurrences.map((o) => o.code))],
      affected_decisions: assessment.is_blocking ? ['qualquer decisão financeira agregada (ROAS/CPA/AOV/lucro real)'] : [],
      reason: assessment.reason,
    },
    PLATFORM_ATTRIBUTION: {
      status: hasMetaPhantom ? 'DEGRADED' : 'RELIABLE',
      confidence: hasMetaPhantom ? assessment.confidence_score / 100 : 1,
      issues: hasMetaPhantom ? [...new Set(metaPhantomOccurrences.map((o) => o.code))] : [],
      affected_decisions: hasMetaPhantom ? ['roas_meta/cpa_meta não são confiáveis isoladamente — usar sempre o financeiro Hotmart (metrics.economics.roas_financeiro).'] : [],
      reason: hasMetaPhantom ? `${metaPhantomOccurrences.length} dia(s) com Meta reportando mais compras que a Hotmart confirma.` : 'nenhuma discrepância Meta x Hotmart no período.',
    },
    CREATIVE_ATTRIBUTION: {
      status: hasMetaPhantom ? 'DEGRADED' : 'RELIABLE',
      confidence: hasMetaPhantom ? assessment.confidence_score / 100 : 1,
      issues: hasMetaPhantom ? [...new Set(metaPhantomOccurrences.map((o) => o.code))] : [],
      affected_decisions: hasMetaPhantom ? ['DECLARE_CREATIVE_FINANCIAL_WINNER — meta.by_ad[].compra_meta/receita_meta não tem reconciliação por anúncio contra Hotmart (Hotmart não carrega ad_id).'] : [],
      reason: hasMetaPhantom ? 'compra_meta/receita_meta por anúncio podem incluir compra(s) fantasma.' : 'nenhuma discrepância conhecida no rollup por anúncio.',
    },
    CAMPAIGN_ATTRIBUTION: {
      status: hasMetaPhantom ? 'DEGRADED' : 'RELIABLE',
      confidence: hasMetaPhantom ? assessment.confidence_score / 100 : 1,
      issues: hasMetaPhantom ? [...new Set(metaPhantomOccurrences.map((o) => o.code))] : [],
      affected_decisions: hasMetaPhantom ? ['decisão de orçamento por campanha baseada em roas_meta/cpa_meta agregado.'] : [],
      reason: hasMetaPhantom ? 'mesmo rollup de compra_meta usado no nível de campanha herda a mesma poluição.' : 'nenhuma discrepância conhecida no rollup por campanha.',
    },
    FUNNEL_MEASUREMENT: {
      status: 'RELIABLE',
      confidence: 1,
      issues: [],
      affected_decisions: [],
      reason: 'LPV/checkout/CTR/CPM são eventos independentes do evento Purchase — não afetados por META_PURCHASE_WITHOUT_HOTMART_SALE.',
    },
    // item 3 — depende da categoria do experimento: CRO/OFFER/AOV medem via Hotmart/funil
    // (RELIABLE); só CREATIVE mede eficiência via compra_meta por anúncio (DEGRADED).
    EXPERIMENT_MEASUREMENT: (() => {
      const creativeExperiments = experiments.filter((e) => e.category === 'CREATIVE');
      if (hasMetaPhantom && creativeExperiments.length > 0) {
        return {
          status: 'DEGRADED', confidence: assessment.confidence_score / 100,
          issues: [...new Set(metaPhantomOccurrences.map((o) => o.code))],
          affected_decisions: ['medição de experimentos CREATIVE (dependem de compra_meta por anúncio) — CRO/OFFER/AOV/MEDIA_BUYING medem via Hotmart/funil e não são afetados.'],
          reason: 'experimento(s) CREATIVE registrado(s); a métrica financeira por anúncio está degradada.',
        };
      }
      return { status: 'RELIABLE', confidence: 1, issues: [], affected_decisions: [], reason: 'experimentos ativos hoje (CRO/AOV/MEDIA_BUYING) medem via Hotmart/funil, não via compra_meta por anúncio.' };
    })(),
  };

  return { scopes, assessment };
}

module.exports = { buildTrackingScopeMatrix };
