'use strict';

const { dateRange } = require('../utils/dates');
const { aggregatePeriod } = require('../profit/aggregate');
const { resolveProductId } = require('../../config/product');

const { computeNorthStar } = require('./northStar');
const { classifyDecisionMode } = require('./mode');
const { resolveCapitalPolicy } = require('./capitalPolicy');
const { assessTracking } = require('./trackingAssessment');
const { buildExperimentCandidate } = require('./candidates');
const { normalizeExpectedValueScores } = require('./expectedValue');
const { buildCapitalTranches } = require('./tranches');
const { computeDecisionConfidence } = require('./confidence');
const { computeDecisionFingerprint } = require('./fingerprint');
const { bestUseOfNextCapital } = require('./nextCapital');

const NEXT_100_AMOUNT = 100; // convenção de exposição no CLI/decision object — o motor aceita qualquer valor (ver nextCapital.js)

const ACTION_LABELS = {
  RUN_EXPERIMENT: (c) => `Rodar experimento ${c.experiment_id} (${c.category}) visando ${c.target_metric}`,
  FIX_TRACKING: () => 'Corrigir tracking antes de qualquer decisão financeira',
  COLLECT_MORE_DATA: () => 'Coletar mais dados / criar novos experimentos',
  PROTECT_CAPITAL: () => 'Proteger capital — não autorizar novo gasto agora',
  MAINTAIN: () => 'Manter operação atual, sem gasto novo',
  PREPARE_SCALE: () => 'Preparar operação para escalar (sem gasto novo agora)',
};

function explainWhyLost(winner, candidate) {
  if (!candidate.is_eligible) return `inelegível: ${candidate.ineligible_reasons.join('; ')}`;
  const wScore = winner.expected_value?.expected_value_score ?? 0;
  const cScore = candidate.expected_value?.expected_value_score ?? 0;
  if (wScore !== cScore) return `expected_value_score menor (${cScore} vs ${wScore}) — menor impacto esperado por real/dia/risco.`;
  if (candidate.time_to_evidence !== winner.time_to_evidence) return `expected_value_score empatado, mas tempo até evidência maior (${candidate.time_to_evidence}d vs ${winner.time_to_evidence}d).`;
  if (candidate.risk !== winner.risk) return `expected_value_score e velocidade empatados, mas risco maior (${candidate.risk} vs ${winner.risk}).`;
  return 'empate total nos critérios objetivos — desempate arbitrário por ordem de leitura.';
}

/**
 * Orquestra o Decision Object completo (PASSO 7). Cruza Profit + Experiments + Learning +
 * Capital pra responder deterministicamente "qual a melhor próxima ação". NUNCA executa nada —
 * só recomenda, persiste a recomendação (via decision/registry.js) e explica o porquê.
 */
function buildDecision({ productId, profitSnapshotResult, experiments, hypotheses, capitalCycle, maxBudgetPercentOfCycleOverride, reasonToRetestByExperimentId, dataDir }) {
  const resolvedProductId = resolveProductId(productId);
  const snapshot = profitSnapshotResult.snapshot;
  const last30d = snapshot?.windows?.last_30d ?? null;
  const last14d = snapshot?.windows?.last_14d ?? null;
  const last7d = snapshot?.windows?.last_7d ?? null;

  const roas30d = last30d?.current_financials?.roas_financeiro ?? null;
  const roas14d = last14d?.current_financials?.roas_financeiro ?? null;
  const roas7d = last7d?.current_financials?.roas_financeiro ?? null;

  const north_star = computeNorthStar(roas30d);

  // Rastreabilidade do financial_roas (PASSO 7.1, item 8) — nunca ajustamos a fórmula pra bater
  // com um número histórico; se o ROAS mudou de execução pra execução, a causa é a janela/dado
  // real ter mudado (mais dias com snapshot, novas vendas/reembolsos), não a fórmula.
  const roas_calculation = last30d ? {
    window: 'last_30d',
    period_from: last30d.period.from,
    period_to: last30d.period.to,
    spend: last30d.current_financials.gasto_meta,
    net_revenue: last30d.current_financials.receita_liquida_hotmart,
    roas_financeiro: roas30d,
    formula: 'roas_financeiro = receita_liquida_hotmart / gasto_meta, ambos somados sobre o período (nunca média de razões diárias — ver profit/financials.js e profit/aggregate.js).',
    data_completeness: last30d.data_quality?.data_completeness ?? null,
    days_found: last30d.data_quality?.days_found ?? null,
    days_requested: last30d.data_quality?.days_requested ?? null,
  } : { window: 'last_30d', reason: 'Nenhum snapshot last_30d disponível — roas_financeiro indisponível.' };

  // Tracking assessment sobre a MESMA janela usada pro roas30d (last_30d) — flags críticas por
  // dia, reclassificadas em BLOQUEANTE vs DEGRADANTE (PASSO 7, item 15).
  const trackingWindowDates = last30d ? dateRange(last30d.period.from, last30d.period.to) : [];
  const agg = trackingWindowDates.length ? aggregatePeriod(trackingWindowDates, dataDir) : { critical_flags_by_day: [] };
  const tracking = assessTracking(agg.critical_flags_by_day);

  const productHypotheses = (hypotheses || []).filter((h) => h.product_id === resolvedProductId);
  const hasStrongHypothesis = productHypotheses.some((h) => h.status === 'STRONG');
  const hasSupportedHypothesis = productHypotheses.some((h) => h.status === 'SUPPORTED' || h.status === 'STRONG');

  const modeResult = classifyDecisionMode({ roas30d, roas7d, roas14d, hasStrongHypothesis, hasSupportedHypothesis, trackingBlocking: tracking.is_blocking });
  const capital_policy = resolveCapitalPolicy(modeResult.mode);

  const productExperiments = (experiments || []).filter((e) => resolveProductId(e) === resolvedProductId);
  const draftReady = productExperiments.filter((e) => ['DRAFT', 'READY'].includes(e.status));
  const running = productExperiments.filter((e) => e.status === 'RUNNING');

  let candidates = draftReady.map((e) =>
    buildExperimentCandidate(e, { capitalCycle, hypotheses: productHypotheses, maxBudgetPercentOfCycleOverride, reasonToRetestByExperimentId })
  );
  candidates = normalizeExpectedValueScores(candidates);

  const decision_trace = [];
  decision_trace.push(`1. DATA QUALITY/TRACKING: ${tracking.reason}`);

  let recommended;
  const experimentById = Object.fromEntries(draftReady.map((e) => [e.experiment_id, e]));

  if (tracking.is_blocking) {
    recommended = {
      action_type: 'FIX_TRACKING', experiment_id: null, category: null, target_metric: null,
      attacks_path: 'TRACKING', reason: tracking.reason, evidence: { blocking_occurrences: tracking.blocking_occurrences },
      expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
    };
    decision_trace.push('-> FIX_TRACKING tem prioridade máxima: nenhuma decisão financeira é confiável enquanto a fonte de verdade estiver comprometida.');
  } else {
    decision_trace.push('-> nenhuma flag bloqueante encontrada — segue.');
    decision_trace.push(`2. CAPITAL SAFETY: capital_cycle.status=${capitalCycle.status}${capitalCycle.status === 'CONFIGURED' ? `, cycle_available=R$${capitalCycle.cycle_available.toFixed(2)}` : ''}`);

    if (capitalCycle.status !== 'CONFIGURED') {
      recommended = {
        action_type: 'PROTECT_CAPITAL', experiment_id: null, category: null, target_metric: null,
        attacks_path: 'MIXED', reason: 'capital_cycle não configurado — defina cycle_budget/cycle_start/cycle_end antes de autorizar qualquer teste real.',
        evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
      };
      decision_trace.push('-> PROTECT_CAPITAL: sem um ciclo de capital configurado, nenhum budget pode ser validado com segurança.');
    } else if (capitalCycle.cycle_available <= 0) {
      recommended = {
        action_type: 'PROTECT_CAPITAL', experiment_id: null, category: null, target_metric: null,
        attacks_path: 'MIXED', reason: `capital disponível no ciclo é R$${capitalCycle.cycle_available.toFixed(2)} — sem espaço pra novo teste.`,
        evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
      };
      decision_trace.push('-> PROTECT_CAPITAL: ciclo configurado mas sem capital disponível.');
    } else {
      decision_trace.push('-> capital disponível — segue.');
      decision_trace.push(`3. PROFITABILITY: modo=${modeResult.mode} (${modeResult.reason})`);
      decision_trace.push(`4. PRIOR LEARNING: ${candidates.length ? candidates.map((c) => `${c.experiment_id}=${c.prior_learning_status}`).join(', ') : 'nenhum candidato'}`);

      const eligible = candidates.filter((c) => c.is_eligible);
      const eligiblePositive = eligible.filter((c) => c.expected_value.raw_ev > 0);

      decision_trace.push(`5-6. EXPERIMENT PRIORITY / EXPECTED IMPACT: ${candidates.length ? candidates.map((c) => `${c.experiment_id}=${c.expected_value.expected_value_score}${c.is_eligible ? '' : ' (inelegível: ' + c.ineligible_reasons.join('; ') + ')'}`).join(' | ') : 'nenhum candidato'}`);

      if (candidates.length === 0) {
        recommended = {
          action_type: 'COLLECT_MORE_DATA', experiment_id: null, category: null, target_metric: null,
          attacks_path: 'MIXED', reason: 'Nenhum experimento DRAFT/READY disponível para este produto — colete mais dados ou crie novos experimentos antes de recomendar uma ação concreta.',
          evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
        };
        decision_trace.push('-> COLLECT_MORE_DATA: não há candidatos de experimento.');
      } else if (eligible.length === 0) {
        // Existem candidatos, mas NENHUM passa no budget_check contra o capital atual — capital
        // insuficiente pra qualquer teste elegível (distinto de "capital não configurado" e de
        // "elegíveis mas sem expected value positivo", ver PASSO 7 item 13).
        recommended = {
          action_type: 'PROTECT_CAPITAL', experiment_id: null, category: null, target_metric: null,
          attacks_path: 'MIXED', reason: `Existem ${candidates.length} candidato(s) de experimento, mas nenhum passa no budget_check contra o capital disponível no ciclo atual (R$${capitalCycle.cycle_available.toFixed(2)}) — capital insuficiente para qualquer teste elegível agora.`,
          evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
        };
        decision_trace.push('-> PROTECT_CAPITAL: nenhum candidato cabe no capital disponível no ciclo atual.');
      } else if (eligiblePositive.length === 0) {
        if (modeResult.mode === 'SCALE') {
          recommended = {
            action_type: 'PREPARE_SCALE', experiment_id: null, category: null, target_metric: null,
            attacks_path: 'MIXED', reason: 'Modo SCALE comprovado, mas nenhum candidato atual tem expected value positivo — prepare capital/operação para o próximo Scaling Agent em vez de forçar um teste sem retorno esperado.',
            evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
          };
          decision_trace.push('-> PREPARE_SCALE: modo SCALE sem candidato com expected value positivo.');
        } else {
          recommended = {
            action_type: 'MAINTAIN', experiment_id: null, category: null, target_metric: null,
            attacks_path: 'MIXED', reason: 'Existem candidatos elegíveis, mas nenhum tem expected value positivo no momento — manter operação atual, sem gastar.',
            evidence: {}, expected_value: null, capital_required: 0, risk: null, time_to_evidence: null, prior_learning_status: null,
          };
          decision_trace.push('-> MAINTAIN: nenhum candidato elegível com expected value positivo.');
        }
      } else {
        const sorted = [...eligiblePositive].sort(
          (a, b) => b.expected_value.expected_value_score - a.expected_value.expected_value_score
            || a.time_to_evidence - b.time_to_evidence
            || a.risk - b.risk
        );
        decision_trace.push('7. SPEED / 8. RISK: desempate por time_to_evidence e depois risk quando expected_value_score empata.');
        recommended = sorted[0];
        decision_trace.push(`Vencedor: ${recommended.experiment_id} — expected_value_score=${recommended.expected_value.expected_value_score}.`);
      }
    }
  }

  const winnerExperiment = recommended.experiment_id ? experimentById[recommended.experiment_id] : null;
  const capital_tranches = winnerExperiment ? buildCapitalTranches(winnerExperiment, capitalCycle) : { tranches: [], note: 'Ação recomendada não é RUN_EXPERIMENT — sem tranches a planejar.' };

  // best_use_of_next_100 é só a convenção de exposição (amount=100) da função genérica — a
  // decisão MARGINAL nunca libera mais do que `amount`, mesmo que a tranche planejada
  // (capital_tranches, macro) seja maior (PASSO 7.1).
  const best_use_of_next_100 = bestUseOfNextCapital(NEXT_100_AMOUNT, { recommended, capitalCycle, winnerExperiment, capitalTranches: capital_tranches });

  const rankedCandidates = [...candidates].sort(
    (a, b) => b.expected_value.expected_value_score - a.expected_value.expected_value_score
      || a.time_to_evidence - b.time_to_evidence
      || a.risk - b.risk
  );
  const alternative_actions = rankedCandidates
    .filter((c) => c.experiment_id !== recommended.experiment_id)
    .map((c, i) => ({
      rank: i + 2,
      experiment_id: c.experiment_id,
      action_type: c.action_type,
      category: c.category,
      target_metric: c.target_metric,
      expected_value_score: c.expected_value.expected_value_score,
      is_eligible: c.is_eligible,
      reason_lost_to_winner: explainWhyLost(recommended.experiment_id ? recommended : { expected_value: { expected_value_score: 0 }, time_to_evidence: Infinity, risk: Infinity, is_eligible: true }, c),
    }));

  const decision_confidence_result = computeDecisionConfidence({
    dataCompleteness: last30d?.data_quality?.data_completeness ?? 0,
    trackingConfidenceScore: tracking.confidence_score,
    experimentConfidence: recommended.expected_value?.confidence ?? candidates[0]?.expected_value?.confidence ?? 0.5,
    priorLearningVerdict: recommended.prior_learning_status ?? candidates[0]?.prior_learning_status ?? null,
    financialConfidence: last30d?.data_quality?.financial_confidence ?? null,
  });

  const kill_condition = winnerExperiment
    ? `failure_condition do experimento: "${winnerExperiment.failure_condition}"`
    : 'revisar a decisão se profit_status piorar, uma flag de tracking bloqueante surgir, ou o capital_cycle mudar.';

  const release_conditions = recommended.action_type === 'RUN_EXPERIMENT'
    ? capital_tranches.tranches.map((t) => t.release_condition)
    : [({
      FIX_TRACKING: 'flags de tracking bloqueantes resolvidas.',
      PROTECT_CAPITAL: 'capital_cycle configurado com cycle_available > 0.',
      COLLECT_MORE_DATA: 'pelo menos 1 experimento DRAFT/READY disponível para este produto.',
      MAINTAIN: 'novo candidato com expected_value_score > 0 disponível.',
      PREPARE_SCALE: 'novo candidato com expected_value_score > 0 disponível, ou decisão explícita de escalar mídia.',
    })[recommended.action_type] || 'reavaliar quando o estado de entrada mudar.'];

  const fingerprintInputs = {
    productId: resolvedProductId,
    snapshotDate: profitSnapshotResult.snapshot_date,
    roas30d, roas7d, roas14d,
    capitalCycle: {
      status: capitalCycle.status,
      cycle_budget: capitalCycle.cycle_budget,
      cycle_start: capitalCycle.cycle_start,
      cycle_end: capitalCycle.cycle_end,
      cycle_spent: capitalCycle.cycle_spent,
      cycle_available: capitalCycle.cycle_available,
    },
    experiments: productExperiments.map((e) => ({ id: e.experiment_id, status: e.status, budget_limit: e.budget_limit })),
    hypotheses: productHypotheses.map((h) => ({ key: h.product_hypothesis_key, status: h.status, confidence: h.current_confidence })),
    mode: modeResult.mode,
  };
  const fingerprint = computeDecisionFingerprint(fingerprintInputs);
  const decision_id = `DEC-${resolvedProductId}-${fingerprint.slice(0, 12)}`;

  const now = new Date().toISOString();

  return {
    decision_id,
    created_at: now,
    updated_at: now,
    product_id: resolvedProductId,
    decision_mode: modeResult.mode,
    decision_mode_reason: modeResult.reason,
    north_star,
    roas_calculation,
    recommended_action: (ACTION_LABELS[recommended.action_type] || (() => recommended.action_type))(recommended),
    action_type: recommended.action_type,
    target_metric: recommended.target_metric,
    attacks_path: recommended.attacks_path,
    reason: recommended.reason,
    evidence: recommended.evidence,
    expected_impact: recommended.expected_value ? { expected_profit_delta: recommended.expected_value.expected_profit_delta, expected_roas_delta: recommended.expected_value.expected_roas_delta } : null,
    confidence: recommended.expected_value?.adjusted_confidence ?? null,
    risk: recommended.risk,
    capital_required: recommended.capital_required,
    capital_policy,
    priority_score: recommended.expected_value?.expected_value_score ?? 0,
    experiment_id: recommended.experiment_id,
    prior_learning_status: recommended.prior_learning_status,
    running_experiments: running.map((e) => e.experiment_id),
    data_quality: { profit: last30d?.data_quality ?? null, tracking },
    kill_condition,
    release_conditions,
    alternative_actions,
    decision_status: 'RECOMMENDED',
    capital_tranches,
    best_use_of_next_100,
    decision_confidence: decision_confidence_result.decision_confidence,
    decision_confidence_components: decision_confidence_result.components,
    decision_trace,
    fingerprint,
    snapshot_date_used: profitSnapshotResult.snapshot_date,
    snapshot_is_stale: profitSnapshotResult.is_stale,
  };
}

module.exports = { buildDecision, explainWhyLost, ACTION_LABELS };
