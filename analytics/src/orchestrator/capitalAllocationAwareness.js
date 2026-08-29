'use strict';

const { buildCandidate, rankCandidatesAndFindBestUse } = require('../execution/capitalAllocationInterface');

// item 17 — consome a interface BEST_USE_OF_NEXT_CAPITAL do PASSO 14B (execution/
// capitalAllocationInterface.js), read-only, nunca reimplementada. CEO V1 não constrói um
// Capital Allocator completo — só traduz os candidatos deste ciclo pra esse formato e pergunta
// qual dominaria SE capital estivesse disponível (sem afirmar que está).
function buildCapitalAllocationAwareness(ceoCandidates) {
  const domainMap = { STRATEGY_SEARCH: 'MEDIA', MEASUREMENT: 'MEASUREMENT', PLANNER: 'MEASUREMENT', CEO_BASELINE: 'RESERVE' };
  const interfaceCandidates = ceoCandidates.map((c) => buildCandidate({
    domain: domainMap[c.source_agent] || 'RESERVE',
    requiredCapital: typeof c.capital_required === 'number' ? c.capital_required : null,
    expectedValue: typeof c.ev === 'number' ? c.ev : null, // nunca inventa — só passa o EV real, se existir
    valueOfInformation: c.voi === 'NOT_ASSESSABLE' ? 'NOT_ASSESSABLE' : c.voi,
    risk: typeof c.risk === 'string' && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(c.risk) ? c.risk : 'UNKNOWN',
    confidence: c.confidence, timeToSignal: c.time_to_signal, reversibility: c.reversibility,
  }));
  const result = rankCandidatesAndFindBestUse(interfaceCandidates);
  return { ...result, note: 'ranking conceitual — não afirma que capital real está disponível pra gastar agora (ver capitalPostureSimulation.js do PASSO 14B, TIER_0=zero capital autônomo).' };
}

module.exports = { buildCapitalAllocationAwareness };
