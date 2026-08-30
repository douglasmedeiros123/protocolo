'use strict';

const metaConnector = require('./metaConnector');
const hotmartConnector = require('./hotmartConnector');
const clarityConnector = require('./clarityConnector');
const { analyzeMeasurement } = require('../../measurement/builder');
const { todayBRT } = require('../../utils/dates');

// PASSO 18.5, item 30 — snapshot operacional unificado. NUNCA mistura fontes de verdade: cada
// bloco cita explicitamente sua própria fonte/papel (FINANCIAL_TRANSACTION_TRUTH vs PLATFORM_TRUTH
// vs BEHAVIORAL_EVIDENCE), nunca fundidos num único número.
async function buildOperationalDashboardState({ dateStr, productId, dataDir, referenceDate } = {}) {
  const refDate = dateStr || todayBRT();

  const [metaInsights, hotmartTransactions, clarityBehavior] = await Promise.all([
    metaConnector.readInsights(refDate),
    hotmartConnector.readTransactions(refDate),
    clarityConnector.readBehavioralInsights(),
  ]);

  const measurement = analyzeMeasurement({ productId, dataDir, referenceDate });

  return {
    generated_at: new Date().toISOString(),
    META: { truth_role: 'PLATFORM_TRUTH', ...metaInsights },
    HOTMART: { truth_role: 'FINANCIAL_TRANSACTION_TRUTH', ...hotmartTransactions },
    CLARITY: clarityBehavior,
    MEASUREMENT: {
      financial_truth_health: measurement.analysis.source_of_truth_matrix.FINANCIAL_TRANSACTION_TRUTH.status,
      platform_attribution_health: measurement.analysis.source_of_truth_matrix.PLATFORM_ATTRIBUTION.status,
      reconciliation_health: measurement.analysis.source_of_truth_matrix.CROSS_PLATFORM_RECONCILIATION.status,
    },
    EXPERIMENT: {
      current_blocker: measurement.analysis.current_blocker_dependency_graph.current_blocker,
      winner_architecture_id: measurement.analysis.strategy_handoff.found ? measurement.analysis.strategy_handoff.winner_architecture_id : null,
    },
    CAPITAL: {
      current_authorized_state: 'TIER_0_ANALYZE_ONLY',
      mva_incremental_budget_authority: 0,
    },
    truth_hierarchy_note: 'Hotmart=FINANCIAL_TRANSACTION_TRUTH, Meta=PLATFORM_TRUTH, Clarity=BEHAVIORAL_EVIDENCE, GTM/dataLayer=INSTRUMENTATION_SIGNAL — nunca misturados neste snapshot (item 15/16 do PASSO 18.5).',
  };
}

module.exports = { buildOperationalDashboardState };
