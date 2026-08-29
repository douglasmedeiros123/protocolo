'use strict';

const { aggregatePeriod } = require('../profit/aggregate');
const { assessTracking } = require('../decision/trackingAssessment');
const { runFullPlatformAudit } = require('./platformAudit');
const { buildReconciliation } = require('./reconciliation');
const { buildFinancialTruthHealth, buildPlatformAttributionHealth } = require('./financialTruthHealth');
const { SOURCE_OF_TRUTH_DOMAINS } = require('./enums');

// item 9-10 — Source-of-Truth Matrix. Cada domínio é construído a partir de evidência real
// (aggregatePeriod/trackingAssessment/platformAudit/reconciliation), nunca de suposição. RELIABLE
// exige critério verificável explícito (nunca "dado existe" sozinho, item 9).
function confidenceLabel(score) {
  if (score == null) return 'NOT_ASSESSABLE';
  if (score >= 90) return 'HIGH';
  if (score >= 70) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'VERY_LOW';
}

function buildSourceOfTruthMatrix({ dates, dataDir } = {}) {
  const agg = aggregatePeriod(dates, dataDir);
  const tracking = assessTracking(agg.critical_flags_by_day);
  const platform = runFullPlatformAudit({ realCheckoutOrPurchaseActionsObserved: (agg.sum.checkout || 0) > 0 || (agg.sum.compra_meta || 0) > 0 });
  const reconciliation = buildReconciliation({ dates, dataDir });

  // PASSO 13.1, item 9-10 — FINANCIAL_TRUTH_HEALTH e PLATFORM_ATTRIBUTION_HEALTH são calculados
  // deliberadamente separados: ghost purchases (META_PURCHASE_WITHOUT_HOTMART_SALE) NUNCA
  // rebaixam a saúde financeira, só a saúde de atribuição de plataforma (uma divergência externa
  // nunca contamina automaticamente a fonte de verdade canônica).
  const financialTruthHealth = buildFinancialTruthHealth(agg.critical_flags_by_day);
  const platformAttributionHealth = buildPlatformAttributionHealth(agg.critical_flags_by_day);
  const financialStatus = financialTruthHealth.status;
  const financialConfidence = financialTruthHealth.confidence;

  const domains = {
    FINANCIAL_TRANSACTION_TRUTH: {
      source: 'Hotmart Sales History API (normalizers/hotmart.js)',
      status: financialStatus,
      confidence: financialConfidence,
      coverage: agg.data_completeness,
      freshness: 'coleta diária (D-1/D0)',
      known_limitations: ['sem campo de atribuição de anúncio (item 11 do audit real)', 'dependente de KNOWN_TEST_BUYERS por nome exato (frágil por natureza)'],
      fallback_source: 'NENHUM — única fonte de verdade financeira do sistema.',
      reconciliation_requirement: 'nenhuma — é o padrão contra o qual outras fontes reconciliam, nunca o inverso.',
      blocking_impact: financialTruthHealth.status === 'BLOCKED',
      evidence: financialTruthHealth.reason,
    },
    REVENUE_TRUTH: {
      source: 'Hotmart gross/net por transação (status COMPLETE/APPROVED, config/product.js SALE_STATUSES_COUNTED_AS_REVENUE)',
      status: financialStatus,
      confidence: financialConfidence,
      coverage: agg.data_completeness,
      freshness: 'coleta diária (D-1/D0)',
      known_limitations: ['receita bruta != lucro (REVENUE != PROFIT, item 2)'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'nenhuma.',
      blocking_impact: tracking.is_blocking,
      evidence: `receita bruta acumulada no período: R$${agg.sum.gross_revenue?.toFixed(2)}.`,
    },
    REFUND_TRUTH: {
      source: 'Hotmart status=REFUNDED por transação',
      status: agg.sum.refunds_count != null ? 'RELIABLE' : 'UNKNOWN',
      confidence: 'HIGH',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['nenhuma limitação estrutural conhecida além da cobertura de dias faltantes'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'nenhuma.',
      blocking_impact: false,
      evidence: `${agg.sum.refunds_count} reembolso(s) confirmado(s) no período, R$${agg.sum.refunds_gross?.toFixed(2)} bruto.`,
    },
    PRODUCT_TRUTH: {
      source: 'Hotmart product_name/is_main_product cruzado com config/product.js',
      status: 'RELIABLE',
      confidence: 'HIGH',
      coverage: 1,
      freshness: 'estático (config versionado)',
      known_limitations: ['produto único hoje — schema já preparado pra múltiplos produtos, mas não exercitado com dados reais'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'nenhuma.',
      blocking_impact: false,
      evidence: `product_id resolvido via resolveProductId() — sem hardcode disperso.`,
    },
    ORDER_BUMP_TRUTH: {
      source: 'Hotmart order_bumps_count/order_bump_gross/net (mesma transação, sufixo C1/C2)',
      status: 'RELIABLE',
      confidence: 'HIGH',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['identificação de bump depende de is_main_product=false na mesma janela de checkout — não há um flag explícito "é bump" separado no payload bruto'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'nenhuma.',
      blocking_impact: false,
      evidence: `${agg.sum.order_bumps_count} order bump(s) confirmados, R$${agg.sum.order_bump_gross?.toFixed(2)} bruto.`,
    },
    ACQUISITION_SPEND: {
      source: 'Meta Marketing Insights API (collectors/meta.js, /insights, leitura)',
      status: 'RELIABLE',
      confidence: 'HIGH',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['gasto é confiável como valor — o que NÃO é confiável é a atribuição de compra associada a ele (ver PLATFORM_ATTRIBUTION)'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'nenhuma — gasto não é uma alegação de conversão, é custo direto.',
      blocking_impact: false,
      evidence: `R$${agg.sum.spend?.toFixed(2)} de gasto Meta confirmado no período.`,
    },
    PLATFORM_ATTRIBUTION: {
      source: 'Meta compra_meta/receita_meta (evento Purchase do lado da plataforma, mecanismo real não confirmável — ver META_PIXEL_CAPI)',
      status: platformAttributionHealth.status,
      confidence: confidenceLabel(platformAttributionHealth.confidence_score),
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: [`${reconciliation.ghost_purchase_days.length} dia(s) reais confirmados com compra fantasma (Meta reporta compra sem venda Hotmart correspondente)`, 'mecanismo real de origem do evento Purchase da Meta é NEEDS_RUNTIME_VALIDATION — CAPI confirmadamente ausente; pixel de navegador PODE existir via injeção Custom HTML do GTM (hipótese plausível, mesma classe de mecanismo observada na Clarity, mas nunca confirmada como fato — ver platformAudit.meta_pixel_capi.browser_pixel_gtm_injection_hypothesis_status), não confirmável nem descartável neste repo'],
      fallback_source: 'Hotmart (FINANCIAL_TRANSACTION_TRUTH) — nunca o inverso.',
      reconciliation_requirement: 'obrigatória antes de qualquer decisão de capital baseada em compra_meta isolada.',
      blocking_impact: false, // degrada confiança, nunca bloqueia a verdade financeira (item core: DEGRADED != BLOCKED)
      evidence: `ATTRIBUTED_PURCHASE != CONFIRMED_FINANCIAL_TRANSACTION (item 2) — ${platformAttributionHealth.reason} Dias reais: ${reconciliation.ghost_purchase_days.map((g) => g.date).join(', ') || 'nenhum dia com ghost purchase no período avaliado'}.`,
    },
    WEB_BEHAVIOR: {
      source: 'Microsoft Clarity (collectors/clarity.js, project-live-insights)',
      status: platform.clarity.live_session_collection_status === 'CONFIRMED' ? 'PARTIAL' : 'NOT_AVAILABLE',
      confidence: 'LOW',
      coverage: 'NOT_ESTIMABLE',
      freshness: 'janela corrente (sem histórico por data, limite de 10 chamadas/dia)',
      known_limitations: ['normalizador descarta URL por página — pipeline de decisão recebe só agregado de conta, nunca por LP', 'mecanismo de instalação real (dentro do container GTM) não verificável neste repo'],
      fallback_source: 'NENHUM equivalente de comportamento — GA4 ecommerce não confirmado (ver FUNNEL_EVENT_TRUTH).',
      reconciliation_requirement: 'nenhuma — não é fonte financeira, nunca precisa reconciliar com Hotmart.',
      blocking_impact: false,
      evidence: platform.clarity.reason,
    },
    FUNNEL_EVENT_TRUTH: {
      source: 'dataLayer/GA4 ecommerce events (procurado nas páginas reais servidas hoje)',
      status: platform.gtm_ga4.ecommerce_datalayer_events_status === 'CONFIRMED' ? 'PARTIAL' : 'NOT_AVAILABLE',
      confidence: 'VERY_LOW',
      coverage: 0,
      freshness: 'NOT_APPLICABLE',
      known_limitations: ['nenhum dataLayer.push de ecommerce (view_item/add_to_cart/begin_checkout/purchase) encontrado em nenhuma página real', 'GA4 dentro do container GTM não é verificável sem acesso de runtime ao container (NEEDS_RUNTIME_VALIDATION)'],
      fallback_source: 'Hotmart pra receita; Clarity pra comportamento agregado (nenhum cobre eventos de funil discretos).',
      reconciliation_requirement: 'não aplicável hoje — não há evento de funil pra reconciliar.',
      blocking_impact: true,
      evidence: platform.gtm_ga4.reason,
    },
    CREATIVE_ATTRIBUTION: {
      source: 'Meta by_ad rollup (creative/metricsAggregator.js) somado diretamente por ad_id',
      status: 'DEGRADED',
      confidence: 'LOW',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['Hotmart não carrega ad_id — nenhum cross-check real entre criativo específico e venda financeira confirmada existe', 'compras fantasma da Meta (PLATFORM_ATTRIBUTION) já foram observadas caindo sobre ads específicos, inflando a leitura por criativo'],
      fallback_source: 'NENHUM — atribuição financeira por criativo específico é estruturalmente NOT_AVAILABLE hoje.',
      reconciliation_requirement: 'necessária, mas não implementável sem identificador determinístico (limite de API upstream, não de código).',
      blocking_impact: false,
      evidence: 'atribuição financeira por criativo específico nunca deve ser afirmada sem linkagem real clique→sessão→transação, que não existe hoje.',
    },
    CAMPAIGN_ATTRIBUTION: {
      source: 'Meta campaign_id/campaign_name (Insights API)',
      status: 'DEGRADED',
      confidence: 'LOW',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['mesmo limite estrutural de CREATIVE_ATTRIBUTION — desempenho de campanha != atribuição financeira automática de campanha'],
      fallback_source: 'reconciliação agregada dia-a-dia (ver CROSS_PLATFORM_RECONCILIATION), nunca por campanha isolada.',
      reconciliation_requirement: 'necessária antes de decisão de capital por campanha específica.',
      blocking_impact: false,
      evidence: 'performance de campanha Meta (spend/ctr/cpm) é confiável; atribuição financeira de campanha não é.',
    },
    EXPERIMENT_ATTRIBUTION: {
      source: 'Experiment Engine (experiments/registry.js) — nenhum experimento comparando arquiteturas concluído até hoje',
      status: 'NOT_AVAILABLE',
      confidence: 'NOT_ASSESSABLE',
      coverage: 0,
      freshness: 'NOT_APPLICABLE',
      known_limitations: ['nenhuma variante/sessão/evento/transação de experimento real vinculada hoje — interface existe (item 33), dado real não'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'não aplicável — nada a reconciliar sem experimento real rodando.',
      blocking_impact: true,
      evidence: 'hasCompletedComparativeExperiment=false (mesmo estado real já usado pelo Strategy Search).',
    },
    CUSTOMER_IDENTITY: {
      source: 'Hotmart buyer_name/ucode por transação',
      status: 'PARTIAL',
      confidence: 'LOW',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['identidade só existe DENTRO da Hotmart — nenhuma stitching com session_id/visitor_id do lado web/ad', 'sem customer_id único cross-plataforma'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'necessária pra qualquer LIFECYCLE_ATTRIBUTION real.',
      blocking_impact: false,
      evidence: 'nome do comprador é real e confiável como identidade financeira; não é utilizável como identidade cross-domínio.',
    },
    LIFECYCLE_ATTRIBUTION: {
      source: 'NENHUMA — não implementado',
      status: 'NOT_AVAILABLE',
      confidence: 'NOT_ASSESSABLE',
      coverage: 0,
      freshness: 'NOT_APPLICABLE',
      known_limitations: ['sem sistema de recompra/retenção instrumentado'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'não aplicável hoje.',
      blocking_impact: false,
      evidence: 'NOT_AVAILABLE — nunca projetado.',
    },
    LTV_TRUTH: {
      source: 'NENHUMA — não implementado',
      status: 'NOT_AVAILABLE',
      confidence: 'NOT_ASSESSABLE',
      coverage: 0,
      freshness: 'NOT_APPLICABLE',
      known_limitations: ['mesmo já documentado no Strategy Search: LIFETIME_ROAS sempre NOT_AVAILABLE'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'não aplicável hoje.',
      blocking_impact: false,
      evidence: 'NOT_AVAILABLE — nunca projetado.',
    },
    PROFIT_TRUTH: {
      source: 'profit/financials.js (gasto_meta, receita_liquida_hotmart, hotmart_fee) — sem outros custos variáveis/fixos rastreados',
      status: 'PARTIAL',
      confidence: 'MEDIUM',
      coverage: agg.data_completeness,
      freshness: 'coleta diária',
      known_limitations: ['lucro_prejuizo cobre gasto de mídia + taxa Hotmart; não cobre outros custos operacionais/fixos (não rastreados no sistema hoje)'],
      fallback_source: 'NENHUM — margem de contribuição é o teto de precisão hoje.',
      reconciliation_requirement: 'nenhuma adicional além das já cobertas por FINANCIAL_TRANSACTION_TRUTH/ACQUISITION_SPEND.',
      blocking_impact: false,
      evidence: `lucro_prejuizo real do período pode ser lido de profit/financials.js — representa margem de contribuição (mídia+taxa), nunca lucro líquido completo do negócio.`,
    },
    CROSS_PLATFORM_RECONCILIATION: {
      source: 'measurement/reconciliation.js (este PASSO) sobre aggregatePeriod',
      status: reconciliation.match_rate == null ? 'UNKNOWN' : (reconciliation.match_rate >= 0.9 ? 'RELIABLE' : (reconciliation.match_rate >= 0.5 ? 'PARTIAL' : 'DEGRADED')),
      confidence: confidenceLabel(reconciliation.match_rate == null ? null : reconciliation.match_rate * 100),
      coverage: reconciliation.days_with_data != null && dates ? reconciliation.days_with_data / dates.length : null,
      freshness: 'recalculado a cada execução, a partir dos snapshots diários reais',
      known_limitations: ['granularidade só dia-a-dia/agregada — join por transação individual é estruturalmente impossível (Hotmart não carrega ad_id)'],
      fallback_source: 'NENHUM.',
      reconciliation_requirement: 'este É o mecanismo de reconciliação — não reconcilia contra outra coisa.',
      blocking_impact: false,
      evidence: `match_rate=${reconciliation.match_rate}, ${reconciliation.ghost_purchase_days.length} dia(s) com compra fantasma preservados explicitamente.`,
    },
  };

  // sanity: nunca deixa um domínio da lista canônica sem entrada (item 9 — matriz completa).
  const missing = SOURCE_OF_TRUTH_DOMAINS.filter((d) => !domains[d]);
  if (missing.length > 0) throw new Error(`Source-of-Truth Matrix incompleta — domínios faltando: ${missing.join(', ')}`);

  // item 10 — as 3 saúdes ficam explicitamente separadas no topo do resultado, nunca só
  // implícitas dentro da matriz de 17 domínios — cada módulo a jusante (capitalGate/anomaly)
  // consome a que precisa, sem re-derivar.
  const healthSeparation = {
    FINANCIAL_TRUTH_HEALTH: financialTruthHealth,
    PLATFORM_ATTRIBUTION_HEALTH: platformAttributionHealth,
    CROSS_PLATFORM_RECONCILIATION_HEALTH: { status: domains.CROSS_PLATFORM_RECONCILIATION.status, match_rate: reconciliation.match_rate, ghost_purchase_days: reconciliation.ghost_purchase_days.length },
    rule: 'as 3 saúdes nunca se contaminam automaticamente — uma divergência de reconciliação/atribuição de plataforma nunca rebaixa a saúde financeira canônica (item 9/10).',
  };

  return {
    domains,
    health_separation: healthSeparation,
    generated_from: { aggregate_period: { dates_requested: agg.dates_requested, days_found: agg.days_found.length, data_completeness: agg.data_completeness }, tracking_assessment: tracking, reconciliation_summary: { match_rate: reconciliation.match_rate, ghost_purchase_days: reconciliation.ghost_purchase_days.length } },
    // expostos no topo pra reuso direto pelos demais módulos do builder — nunca recomputados
    // duas vezes com lógica divergente.
    agg, tracking, platform, reconciliation, financialTruthHealth, platformAttributionHealth,
  };
}

module.exports = { buildSourceOfTruthMatrix, confidenceLabel };
