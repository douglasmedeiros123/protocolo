'use strict';

// item 14A.8 — contador determinístico/simulável de frequência de ação. Sem banco real — adapter
// em memória com interface pronta pra uma futura Persistence Layer (item 14A.18), fixture state
// injetável pelos testes.
function createInMemoryRateLimitCounter() {
  const events = []; // { at: ISOString, capitalDelta: number|null }
  return {
    recordAction({ at = new Date().toISOString(), capitalDelta = null } = {}) { events.push({ at, capitalDelta }); },
    countInWindow(nowIso, windowMs) {
      const now = Date.parse(nowIso);
      return events.filter((e) => now - Date.parse(e.at) <= windowMs).length;
    },
    capitalChangedInWindow(nowIso, windowMs) {
      const now = Date.parse(nowIso);
      return events.filter((e) => now - Date.parse(e.at) <= windowMs && e.capitalDelta != null).reduce((sum, e) => sum + e.capitalDelta, 0);
    },
    _debugEvents() { return [...events]; },
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * evaluateRateLimits() — item 14A.3 (ACTION_FREQUENCY_POLICY). `limits` vem de capitalSafety.js
 * (NOT_CONFIGURED quando não definido — nunca inventa um teto).
 */
function evaluateRateLimits({ counter, nowIso = new Date().toISOString(), limits }) {
  const actionsPerMinute = counter.countInWindow(nowIso, MINUTE_MS);
  const actionsPerHour = counter.countInWindow(nowIso, HOUR_MS);
  const capitalChangesPerHour = counter.capitalChangedInWindow(nowIso, HOUR_MS);

  const violations = [];
  if (limits.max_changes_per_hour !== 'NOT_CONFIGURED' && actionsPerHour >= limits.max_changes_per_hour) {
    violations.push(`actions_per_hour=${actionsPerHour} >= max_changes_per_hour=${limits.max_changes_per_hour}`);
  }
  if (limits.max_changes_per_day !== 'NOT_CONFIGURED') {
    const perDay = counter.countInWindow(nowIso, 24 * HOUR_MS);
    if (perDay >= limits.max_changes_per_day) violations.push(`actions_per_day=${perDay} >= max_changes_per_day=${limits.max_changes_per_day}`);
  }

  return {
    actions_per_minute: actionsPerMinute,
    actions_per_hour: actionsPerHour,
    capital_changes_per_hour: capitalChangesPerHour,
    excessive_action_frequency: violations.length > 0,
    violations,
  };
}

module.exports = { createInMemoryRateLimitCounter, evaluateRateLimits, MINUTE_MS, HOUR_MS };
