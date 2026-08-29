'use strict';

// item 34-35 — prioridade nunca é só contagem de gaps. Ordem de fatores documentada (mesmo
// padrão de tie-break já usado no Strategy Search comparisonAndRanking.js), nunca escolhida
// caso a caso.
const IMPACT_WEIGHT = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const DEBT_PRIORITY_FACTOR_ORDER = ['decision_impact', 'capital_risk', 'affected_scopes_count'];

function compareDebt(a, b) {
  for (const factor of DEBT_PRIORITY_FACTOR_ORDER) {
    const av = factor === 'affected_scopes_count' ? a.affected_scopes.length : IMPACT_WEIGHT[a[factor]];
    const bv = factor === 'affected_scopes_count' ? b.affected_scopes.length : IMPACT_WEIGHT[b[factor]];
    if (av !== bv) return bv - av; // maior impacto primeiro
  }
  return a.debt_id.localeCompare(b.debt_id);
}

/**
 * buildMeasurementDebtRegistry() — item 34. Cada item nasce de uma evidência REAL já computada
 * (source-of-truth matrix / platformAudit / reconciliation) — nunca um gap genérico inventado.
 */
function buildMeasurementDebtRegistry({ sourceOfTruth, platform, reconciliation }) {
  const items = [];

  if (sourceOfTruth.domains.FUNNEL_EVENT_TRUTH.status === 'NOT_AVAILABLE') {
    items.push({
      debt_id: 'MDEBT-001', domain: 'FUNNEL_EVENT_TRUTH',
      description: 'nenhum evento discreto de funil (view_item/begin_checkout/purchase via dataLayer) confirmado em nenhuma página real hoje.',
      decision_impact: 'HIGH', capital_risk: 'HIGH',
      affected_scopes: ['EXPERIMENT_ATTRIBUTION', 'SESSION_ATTRIBUTION', 'CROSS_PLATFORM_RECONCILIATION'],
      affected_experiments: ['qualquer MVA test futuro que precise medir progressão de funil além de compra final'],
      implementation_dependency: 'requer instrumentação real (dataLayer.push) nas páginas próprias — NÃO implementado neste PASSO (fora do escopo, item 54).',
      validation_dependency: 'após implementação, precisa reconciliar contra HOTMART.TRANSACTION_APPROVED antes de virar VALIDATED.',
    });
  }
  if (platform.meta_pixel_capi.browser_pixel_status === 'NEEDS_RUNTIME_VALIDATION') {
    items.push({
      debt_id: 'MDEBT-002', domain: 'PLATFORM_ATTRIBUTION',
      description: 'mecanismo real de origem do evento Purchase/InitiateCheckout da Meta não é confirmável neste repo (pode ser pixel injetado via GTM, não confirmável estaticamente).',
      decision_impact: 'HIGH', capital_risk: 'MEDIUM',
      affected_scopes: ['PLATFORM_ATTRIBUTION', 'CREATIVE_ATTRIBUTION', 'CAMPAIGN_ATTRIBUTION'],
      affected_experiments: ['qualquer decisão que dependa de compra_meta como sinal isolado'],
      implementation_dependency: 'nenhuma implementação nova necessária pra ESCLARECER — precisa de validação de runtime (inspecionar o container GTM ao vivo), fora do escopo deste PASSO (item 53).',
      validation_dependency: 'NEEDS_RUNTIME_VALIDATION.',
    });
  }
  if (platform.utm_to_checkout.utm_forwarding_status === 'NOT_AVAILABLE') {
    items.push({
      debt_id: 'MDEBT-003', domain: 'CROSS_PLATFORM_RECONCILIATION',
      description: 'nenhum UTM é propagado da LP pro link de checkout Hotmart — continuidade de atribuição se perde na travessia pro checkout externo.',
      decision_impact: 'MEDIUM', capital_risk: 'MEDIUM',
      affected_scopes: ['CAMPAIGN_ATTRIBUTION', 'CROSS_PLATFORM_RECONCILIATION'],
      affected_experiments: ['qualquer teste que precise atribuir receita por campanha/criativo específico com mais confiança'],
      implementation_dependency: 'requer lógica de passthrough de UTM no bundle da LP — NÃO implementado neste PASSO (fora do escopo).',
      validation_dependency: 'após implementação, validar se a Hotmart preserva o parâmetro até a transação (ela não expõe isso hoje — pode nunca ser possível, item 11 do audit real).',
    });
  }
  items.push({
    debt_id: 'MDEBT-004', domain: 'SESSION_ATTRIBUTION',
    description: 'nenhum session_id/anonymous_visitor_id real chega ao pipeline de dados — impossibilita ligar comportamento web a uma transação específica.',
    decision_impact: 'HIGH', capital_risk: 'MEDIUM',
    affected_scopes: ['SESSION_ATTRIBUTION', 'EXPERIMENT_ATTRIBUTION', 'LIFECYCLE_ATTRIBUTION'],
    affected_experiments: ['qualquer experimento A/B real de arquitetura — sem isso, EXPERIMENT_ATTRIBUTION permanece NOT_AVAILABLE indefinidamente'],
    implementation_dependency: 'requer sistema de identidade de sessão — NÃO implementado neste PASSO.',
    validation_dependency: 'NOT_APPLICABLE até existir.',
  });
  if (platform.clarity.per_page_attribution_in_pipeline_status === 'NOT_AVAILABLE') {
    items.push({
      debt_id: 'MDEBT-005', domain: 'WEB_BEHAVIOR',
      description: 'normalizador de Clarity descarta o campo de URL por página (PopularPages/PageTitle) — o pipeline de decisão só recebe comportamento agregado de conta, nunca por LP.',
      decision_impact: 'MEDIUM', capital_risk: 'LOW',
      affected_scopes: ['WEB_BEHAVIOR'],
      affected_experiments: ['testes que comparem comportamento entre duas LPs diferentes ao mesmo tempo'],
      implementation_dependency: 'mudança pequena e aditiva em normalizers/clarity.js — candidata a implementação futura de baixo custo, mas fora do escopo deste PASSO.',
      validation_dependency: 'nenhuma — é dado observacional, não financeiro.',
    });
  }
  // PASSO 13.1, item 6 — achado da recalibração: o verdadeiro blocker de EXPERIMENT_ATTRIBUTION
  // não é um evento discreto (CHECKOUT_INITIATED), é a ausência de um registro de qual
  // arquitetura esteve live em qual data (EXPOSURE_IDENTITY no blocker dependency graph) — leve,
  // operacional, nunca instrumentação de evento/GTM/Pixel.
  items.push({
    debt_id: 'MDEBT-007', domain: 'EXPERIMENT_ATTRIBUTION', blocker_node: 'EXPOSURE_IDENTITY',
    description: 'nenhum registro real de qual arquitetura esteve live em qual intervalo de datas — sem isso, mesmo o método de atribuição mínima viável (comparação agregada por data) não consegue linkar exposição a outcome financeiro.',
    decision_impact: 'HIGH', capital_risk: 'MEDIUM',
    affected_scopes: ['EXPERIMENT_ATTRIBUTION'],
    affected_experiments: ['qualquer MVA test real do Strategy Search — este é o blocker raiz real (blockerDependencyGraph.js), não um evento discreto'],
    implementation_dependency: 'registro operacional leve (ex.: log de deploy com data + architecture_id) — NÃO é instrumentação de evento/GTM/Pixel, e não implementado neste PASSO (fora do escopo).',
    validation_dependency: 'nenhuma adicional — uma vez registrado, o método AGGREGATE_TEMPORAL_COMPARISON já é utilizável (minimumViableAttribution.js).',
  });
  items.push({
    debt_id: 'MDEBT-006', domain: 'META_PIXEL_CAPI',
    description: 'nenhuma implementação de Conversions API (server-side) existe — dependência 100% de evento client-side (se houver), sem rede de segurança contra bloqueio de cookies/adblock.',
    decision_impact: 'MEDIUM', capital_risk: 'LOW',
    affected_scopes: ['PLATFORM_ATTRIBUTION'],
    affected_experiments: ['nenhum hoje — só relevante quando o volume justificar o investimento de engenharia'],
    implementation_dependency: 'requer infraestrutura de servidor nova — investimento de engenharia real, fora do escopo deste PASSO.',
    validation_dependency: 'NOT_APPLICABLE até existir.',
  });

  return items.sort(compareDebt).map((item, i) => ({ ...item, priority_rank: i + 1 }));
}

module.exports = { buildMeasurementDebtRegistry, compareDebt, DEBT_PRIORITY_FACTOR_ORDER };
