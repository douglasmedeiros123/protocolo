'use strict';

const { RELEVANCE_TIERS } = require('./enums');

// item 6 — RELEVANCE_ROUTER. Determinístico/rule-based nesta V1 (nunca LLM cost optimization
// completo ainda). Decide quais domínios merecem atenção profunda neste ciclo — reduz ruído.
const DOMAINS = ['MEASUREMENT', 'STRATEGY_SEARCH', 'PLANNER_DECISION', 'CREATIVE', 'CRO', 'OFFER', 'EXECUTION_POLICY', 'CAPITAL_AUTHORITY', 'LEARNING'];

function routeRelevance(diagnosis) {
  const routing = {};

  // o domínio do dominant_constraint é sempre CRITICAL_NOW.
  const dominantDomainMap = { MEASUREMENT: 'MEASUREMENT', ECONOMICS: 'PLANNER_DECISION', INSUFFICIENT_EVIDENCE: 'PLANNER_DECISION', CAPITAL: 'CAPITAL_AUTHORITY', PRODUCT_VIABILITY: 'PLANNER_DECISION' };
  const criticalDomain = dominantDomainMap[diagnosis.dominant_constraint.category] || null;

  for (const domain of DOMAINS) {
    if (domain === criticalDomain) { routing[domain] = 'CRITICAL_NOW'; continue; }
    if (domain === 'STRATEGY_SEARCH') { routing[domain] = 'CRITICAL_NOW'; continue; } // sempre relevante — é onde a próxima ação de maior prioridade normalmente nasce
    if (domain === 'EXECUTION_POLICY') { routing[domain] = 'CRITICAL_NOW'; continue; } // toda recomendação executável passa por aqui — nunca background
    if (domain === 'CAPITAL_AUTHORITY') { routing[domain] = 'RELEVANT'; continue; }
    if (['CREATIVE', 'CRO', 'OFFER'].includes(domain)) {
      // se measurement é o bottleneck sistêmico, esses levers ficam BACKGROUND (não são a
      // restrição ativa agora, mas continuam existindo/monitorados).
      routing[domain] = diagnosis.dominant_constraint.category === 'MEASUREMENT' ? 'BACKGROUND' : 'RELEVANT';
      continue;
    }
    if (domain === 'LEARNING') { routing[domain] = diagnosis.experiment_state.completed_experiments === 0 ? 'BACKGROUND' : 'RELEVANT'; continue; }
    routing[domain] = 'RELEVANT';
  }

  return { routing, critical_now: Object.entries(routing).filter(([, t]) => t === 'CRITICAL_NOW').map(([d]) => d), domains: DOMAINS, tiers: RELEVANCE_TIERS };
}

module.exports = { routeRelevance, DOMAINS, RELEVANCE_TIERS };
