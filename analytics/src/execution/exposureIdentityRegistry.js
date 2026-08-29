'use strict';

// item 14A.17 — MDEBT-007 (Measurement PASSO 13.1) é MUST_HAVE_BEFORE_TEST: nenhum registro real
// de qual arquitetura esteve live em qual data existe hoje. Este módulo desenha o mecanismo
// MÍNIMO — domínio + registry local, NUNCA deploy real, NUNCA altera nenhuma página. Uma vez
// preenchido com entradas reais (fora do escopo deste PASSO — exige decisão operacional humana
// de quando registrar cada deploy), resolve EXPOSURE_IDENTITY em blockerDependencyGraph.js
// (measurement/blockerDependencyGraph.js) e habilita o método AGGREGATE_TEMPORAL_COMPARISON
// (measurement/minimumViableAttribution.js) com um which_variant_was_exposed real, não
// NEEDS_LIGHTWEIGHT_IMPLEMENTATION.
let entryCounter = 0;
function resetEntryCounter() { entryCounter = 0; }

// PASSO 16, item 5 — Exposure Identity Contract completo. live_from/live_until aceitam
// explicitamente 'UNKNOWN' — nunca uma data inventada (item 5/7).
function buildArchitectureLiveEntry({
  productId = null, architectureId, experimentId = null, variantId = null, liveFrom, liveUntil = null,
  environment, observationType = 'CURRENT_ARCHITECTURE_OBSERVATION', deploymentEvidenceType = 'UNKNOWN',
  deploymentReference, evidenceSource = null, confidence = 'NOT_ASSESSABLE', recordedBy, provenance = null,
}) {
  entryCounter += 1;
  const entryId = `ALR-${String(entryCounter).padStart(5, '0')}`;
  return {
    entry_id: entryId,
    exposure_id: entryId, // alias — item 5 pede exposure_id explicitamente
    product_id: productId,
    architecture_id: architectureId,
    experiment_id: experimentId,
    variant_id: variantId,
    live_from: liveFrom == null ? 'UNKNOWN' : liveFrom, // KNOWN ou UNKNOWN, nunca inventado
    live_until: liveUntil, // null = ainda live
    environment,
    observation_type: observationType, // ex.: CURRENT_ARCHITECTURE_OBSERVATION vs EXPERIMENT_VARIANT_DEPLOYMENT
    deployment_evidence_type: deploymentEvidenceType, // DEPLOYMENT_CONFIRMED|DEPLOYMENT_PROXY|REPO_CHANGE_ONLY|UNKNOWN
    deployment_reference: deploymentReference,
    evidence_source: evidenceSource, // de onde veio a evidência real (ex.: 'vercel.json + strategy-search/currentArchitecture.js')
    confidence,
    status: liveUntil ? 'ENDED' : 'ACTIVE',
    recorded_by: recordedBy,
    recorded_at: new Date().toISOString(),
    provenance, // trilha de auditoria — nunca omitida quando disponível
  };
}

/**
 * queryArchitectureLiveOnDate() — dado um registry real (array de entradas) e uma data, resolve
 * qual arquitetura esteve live nesse dia — a peça que faltava pra EXPOSURE_IDENTITY em nível de
 * data/arquitetura (item 4/5 do PASSO 13.1).
 */
function queryArchitectureLiveOnDate(registry, dateIso) {
  const date = Date.parse(dateIso);
  const matches = registry.filter((e) => {
    const from = Date.parse(e.live_from);
    const until = e.live_until ? Date.parse(e.live_until) : Infinity;
    return date >= from && date <= until;
  });
  if (matches.length === 0) return { found: false, reason: `nenhuma entrada do registro cobre ${dateIso} — EXPOSURE_IDENTITY permanece NOT_AVAILABLE pra esta data.` };
  if (matches.length > 1) return { found: true, ambiguous: true, matches, reason: 'múltiplas entradas sobrepostas pra mesma data — registro precisa de correção manual, nunca escolhido automaticamente aqui.' };
  return { found: true, ambiguous: false, entry: matches[0] };
}

/** isRegistrySufficientForAggregateComparison() — item 14A.17: o registro cobre integralmente o intervalo de datas pedido? */
function isRegistrySufficientForAggregateComparison(registry, dates) {
  const gaps = dates.filter((d) => !queryArchitectureLiveOnDate(registry, d).found);
  return { sufficient: gaps.length === 0, covered_days: dates.length - gaps.length, total_days: dates.length, gaps };
}

// PASSO 14A.1, item 8 — o operador humano não deve precisar LEMBRAR manualmente de registrar
// cada mudança. Contrato conceitual do lifecycle (documentado aqui, nunca implementado como
// deploy real neste PASSO): uma Action de deploy só vira entrada no registry depois de
// EXECUTED+confirmada — nunca antes, nunca por suposição.
const DEPLOYMENT_LIFECYCLE_CONTRACT = {
  flow: [
    'APPROVED_DEPLOYMENT (Action Contract em status APPROVED, action_type=DEPLOY_LP_CHANGE ou equivalente)',
    'deployment occurs (fora da autoridade da LLM — Execution Layer/External Connector real, não implementado neste PASSO)',
    'deployment_reference confirmed (ex.: commit sha real + confirmação de que foi ao ar, nunca só o commit em si)',
    'architecture_live_registry record created automaticamente pelo Execution Layer — nunca por lembrança manual do operador',
    'exposure period begins (live_from = confirmação real do deploy)',
  ],
  end_flow: [
    'END/ROLLBACK/SWITCH (nova Action Contract real, ou halt confirmado)',
    'live_until recorded na entrada anterior automaticamente — nunca deixado em aberto por esquecimento',
  ],
  rule: 'o registry é populado como EFEITO COLATERAL do lifecycle de deployment/execution autorizado (futuro, fora do escopo deste PASSO) — nunca uma tarefa manual separada que um humano precisa lembrar de fazer.',
};

/**
 * deriveRegistryEntryFromApprovedDeployment() — item 8. Função pura que MOSTRA como uma entrada
 * seria derivada automaticamente de uma Action real EXECUTED — nunca chamada por um deploy real
 * neste PASSO (nenhum deploy acontece). `deploymentConfirmation` precisa ser explícito — nunca
 * inferido só da existência da Action.
 */
function deriveRegistryEntryFromApprovedDeployment({ action, deploymentConfirmation, recordedBy = 'EXECUTION_LAYER_AUTOMATIC' }) {
  if (action.status !== 'EXECUTED') {
    return { derived: false, reason: `Action status=${action.status}, não EXECUTED — nenhuma entrada é derivada antes de confirmação real de execução (item 8).` };
  }
  if (!deploymentConfirmation || !deploymentConfirmation.confirmed_at || !deploymentConfirmation.deployment_reference) {
    return { derived: false, reason: 'deploymentConfirmation incompleto — live_from nunca é inventado a partir só do status da Action.' };
  }
  return {
    derived: true,
    entry: buildArchitectureLiveEntry({
      architectureId: action.target_state?.architecture_id || action.subject_id,
      experimentId: action.experiment_id,
      liveFrom: deploymentConfirmation.confirmed_at,
      environment: deploymentConfirmation.environment || 'production',
      deploymentReference: deploymentConfirmation.deployment_reference,
      recordedBy,
    }),
  };
}

// item 9 — classificação de evidência de deployment histórico. Nunca infere data exata só porque
// um commit existe, a menos que a relação commit->produção esteja comprovada no sistema.
const DEPLOYMENT_EVIDENCE_CLASSES = ['DEPLOYMENT_CONFIRMED', 'DEPLOYMENT_PROXY', 'REPO_CHANGE_ONLY', 'UNKNOWN'];

function classifyDeploymentEvidence({ hasConfirmedProductionDeployLog, hasVercelDeployRecordLinkedToCommit, hasGitCommitOnly }) {
  if (hasConfirmedProductionDeployLog) {
    return { class: 'DEPLOYMENT_CONFIRMED', reason: 'log real de deploy em produção confirma a data — evidência direta.' };
  }
  if (hasVercelDeployRecordLinkedToCommit) {
    return { class: 'DEPLOYMENT_PROXY', reason: 'registro de deploy (ex.: Vercel) existe e está linkado ao commit — evidência indireta mas razoável, nunca tratada como CONFIRMED.' };
  }
  if (hasGitCommitOnly) {
    return { class: 'REPO_CHANGE_ONLY', reason: 'só existe o commit no repositório — a relação commit->produção não está comprovada no sistema; NUNCA inferir data de produção a partir disso sozinho (item 9).' };
  }
  return { class: 'UNKNOWN', reason: 'nenhuma evidência real disponível — nunca inventada.' };
}

// item 10 — pergunta central: precisamos de backfill histórico pra rodar o PRÓXIMO experimento?
// Resposta derivada, não assumida: se registrarmos PROSPECTIVAMENTE a partir de agora (uma
// entrada "arquitetura atual, live desde <melhor data conhecida ou UNKNOWN>, ainda ativa" + uma
// segunda entrada no momento real do próximo deploy), o método AGGREGATE_TEMPORAL_COMPARISON do
// próximo MVA test (que compara around a data do PRÓXIMO deploy) já fica coberto — backfill de
// transições ANTERIORES não é necessário pra ISSO especificamente.
function isHistoricalBackfillRequiredForNextExperiment({ hasCurrentArchitectureMarkerEntry }) {
  if (hasCurrentArchitectureMarkerEntry) {
    return {
      required: false,
      reason: 'já existe uma entrada real marcando a arquitetura atual como ACTIVE — o próximo MVA test (comparação around a data do PRÓXIMO deploy) fica coberto criando só a entrada do vencedor no momento real do deploy futuro. Backfill de transições de arquitetura ANTERIORES a hoje não é indispensável pra ISSO especificamente — é SHOULD_HAVE/NICE_TO_HAVE pra análises retroativas mais amplas, nunca MUST_HAVE_BEFORE_TEST do próximo experimento.',
      minimum_entries_needed: ['entrada real da arquitetura atual (live_from pode ser UNKNOWN se a data exata de entrada em produção não for demonstrável — item 9)', 'entrada real do vencedor, criada no momento do deploy futuro real (nunca antes)'],
    };
  }
  return {
    required: false, // mesmo sem a marker entry hoje, criar UMA agora resolve — nunca é preciso reconstruir o passado inteiro
    reason: 'nenhuma entrada existe ainda, mas criar UMA entrada real agora (arquitetura atual, live_from=UNKNOWN se a data de entrada não for demonstrável, status=ACTIVE) já é suficiente — não é preciso reconstruir toda a história de deploys anteriores pra desbloquear o PRÓXIMO experimento.',
    minimum_entries_needed: ['1 entrada real da arquitetura atual (criável agora, mesmo com live_from=UNKNOWN)', 'entrada real do vencedor, criada no momento do deploy futuro real'],
  };
}

module.exports = {
  buildArchitectureLiveEntry, resetEntryCounter, queryArchitectureLiveOnDate, isRegistrySufficientForAggregateComparison,
  DEPLOYMENT_LIFECYCLE_CONTRACT, deriveRegistryEntryFromApprovedDeployment,
  DEPLOYMENT_EVIDENCE_CLASSES, classifyDeploymentEvidence, isHistoricalBackfillRequiredForNextExperiment,
};
