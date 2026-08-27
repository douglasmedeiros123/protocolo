'use strict';

function group(metrics, name) {
  const found = (metrics || []).find((g) => g.metricName === name);
  return found ? found.information : null;
}

// A API do Clarity devolve o MESMO campo às vezes como string ("125") e às vezes como number
// (125) em chamadas diferentes, mesmo quando o valor não mudou (confirmado empiricamente:
// derrubava a idempotência sem nenhuma mudança real de tráfego por trás). Normaliza pra number
// sempre — nunca deixa a inconsistência de tipo da API virar "mudança" no nosso diff.
function num(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Normaliza um "Clarity behavior snapshot" (independente de data-alvo — ver collectors/clarity.js).
 * `raw` vem do collector em caso de sucesso; em caso de falha na coleta, `normalizeClarityFailure`
 * monta o mesmo formato com source_status:'unavailable'|'error', sem inventar métrica nenhuma.
 */
function normalizeClarity(raw) {
  const metrics = raw.metrics;
  const traffic = (group(metrics, 'Traffic') || [{}])[0];
  const scroll = (group(metrics, 'ScrollDepth') || [{}])[0];
  const engagement = (group(metrics, 'EngagementTime') || [{}])[0];
  const deadClick = (group(metrics, 'DeadClickCount') || [{}])[0];
  const rageClick = (group(metrics, 'RageClickCount') || [{}])[0];
  const device = group(metrics, 'Device') || [];
  const browser = group(metrics, 'Browser') || [];

  return {
    collected_at: raw.collected_at,
    window_supported_by_api: raw.window_supported_by_api,
    source_status: raw.source_status,
    sessions: {
      total: num(traffic.totalSessionCount),
      bots: num(traffic.totalBotSessionCount),
      distinct_users: num(traffic.distinctUserCount),
    },
    behavior: {
      scroll_depth_avg_pct: num(scroll.averageScrollDepth),
      engagement_total_time_s: num(engagement.totalTime),
      engagement_active_time_s: num(engagement.activeTime),
      dead_click_pct: num(deadClick.sessionsWithMetricPercentage),
      rage_click_pct: num(rageClick.sessionsWithMetricPercentage),
    },
    device: device.map((d) => ({ name: d.name, sessions: num(d.sessionsCount) })),
    browser: browser.map((b) => ({ name: b.name, sessions: num(b.sessionsCount) })),
  };
}

/** Usado quando a coleta falha (token ausente, API fora do ar, etc.) — nunca inventa métrica. */
function normalizeClarityFailure(reason, status = 'error') {
  return {
    collected_at: new Date().toISOString(),
    window_supported_by_api: null,
    source_status: status, // 'unavailable' (limitação conhecida) ou 'error' (falha real)
    reason,
    sessions: null,
    behavior: null,
    device: null,
    browser: null,
  };
}

module.exports = { normalizeClarity, normalizeClarityFailure };
