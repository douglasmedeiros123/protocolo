'use strict';

/**
 * buildExperimentAttributionInterface() — item 38. Read-only, nunca executa nada — só descreve
 * o que seria necessário pra responder "qual sessão viu qual variante", "qual evento ocorreu",
 * "qual compra financeira pode ser ligada", "qual receita pertence ao experimento", "que
 * contaminação existe". Hoje, sem nenhum experimento real de arquitetura rodando, tudo fica
 * honestamente vazio/NOT_AVAILABLE.
 */
function buildExperimentAttributionInterface({ hasRunningExperiment }) {
  return {
    which_session_saw_which_variant: hasRunningExperiment ? 'NEEDS_RUNTIME_VALIDATION' : 'NOT_AVAILABLE',
    which_event_occurred: hasRunningExperiment ? 'NEEDS_RUNTIME_VALIDATION' : 'NOT_AVAILABLE',
    which_financial_purchase_linkable: 'NOT_AVAILABLE', // sem session_id real, nunca linkável hoje mesmo com experimento rodando
    revenue_belonging_to_experiment: 'NOT_AVAILABLE',
    period: null,
    contamination_risks: ['sem variant_id persistido por sessão/transação, contaminação entre variantes não é detectável hoje'],
    reason: hasRunningExperiment ? 'experimento real está rodando, mas a interface de leitura ainda depende de identificadores (session_id/variant_id) que não existem no pipeline hoje.' : 'nenhum experimento real de arquitetura concluído ou em execução hoje (mesmo estado já usado pelo Strategy Search).',
  };
}

/**
 * buildExperimentMeasurementContract() — item 39. Template do que um experimento REAL precisaria
 * ter definido antes de rodar — nunca inventa tamanho de amostra/threshold de significância sem
 * método e dado reais (item 39).
 */
function buildExperimentMeasurementContract({ mvaTest, trackingContract }) {
  if (!mvaTest) return null;
  return {
    experiment_id: mvaTest.test_id,
    primary_metric: mvaTest.primary_metric,
    secondary_metrics: mvaTest.secondary_metrics,
    guardrails: ['refund_rate não pode subir de forma desproporcional ao ganho observado (mesmo kill_condition do MVA)'],
    exposure_event: 'NOT_DEFINED — depende de variant_id/session_id que não existem hoje.',
    conversion_event: mvaTest.primary_metric === 'net_aov' ? 'PURCHASE (HOTMART.TRANSACTION_APPROVED)' : 'CHECKOUT_INITIATED',
    financial_outcome: 'HOTMART.TRANSACTION_APPROVED — única fonte financeira aceitável.',
    attribution_window: 'NOT_ESTIMABLE — sem dado histórico de tempo-até-conversão real coletado.',
    identity_requirements: ['session_id', 'variant_id'],
    minimum_measurement_requirements: mvaTest.minimum_evidence,
    contamination_risks: ['sem session_id/variant_id reais, um mesmo visitante pode ser exposto a mais de uma variante sem detecção'],
    stopping_measurement_conditions: [mvaTest.kill_condition],
    data_quality_requirements: ['nenhum evento pode contar como conversão sem reconciliação com HOTMART.TRANSACTION_APPROVED (mesmo princípio do trackingContract)'],
    tracking_contract_reference: trackingContract ? trackingContract.contract_id : null,
    note: 'template estrutural — nenhum valor numérico de amostra/significância é inventado aqui (item 39); minimum_measurement_requirements vem de experiments/evidence.js quando disponível, NOT_ESTIMABLE quando não.',
  };
}

module.exports = { buildExperimentAttributionInterface, buildExperimentMeasurementContract };
