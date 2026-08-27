'use strict';

function group(metrics, name) {
  const found = (metrics || []).find((g) => g.metricName === name);
  return found ? found.information : null;
}

function normalizeClarity(raw) {
  if (!raw.available) {
    return { date: raw.date, available: false, reason: raw.reason, sessions: null, behavior: null };
  }

  const metrics = raw.metrics;
  const traffic = (group(metrics, 'Traffic') || [{}])[0];
  const scroll = (group(metrics, 'ScrollDepth') || [{}])[0];
  const engagement = (group(metrics, 'EngagementTime') || [{}])[0];
  const deadClick = (group(metrics, 'DeadClickCount') || [{}])[0];
  const rageClick = (group(metrics, 'RageClickCount') || [{}])[0];
  const device = group(metrics, 'Device') || [];
  const browser = group(metrics, 'Browser') || [];

  return {
    date: raw.date,
    available: true,
    window_days: raw.numOfDays,
    sessions: {
      total: traffic.totalSessionCount ?? null,
      bots: traffic.totalBotSessionCount ?? null,
      distinct_users: traffic.distinctUserCount ?? null,
    },
    behavior: {
      scroll_depth_avg_pct: scroll.averageScrollDepth ?? null,
      engagement_total_time_s: engagement.totalTime ?? null,
      engagement_active_time_s: engagement.activeTime ?? null,
      dead_click_pct: deadClick.sessionsWithMetricPercentage ?? null,
      rage_click_pct: rageClick.sessionsWithMetricPercentage ?? null,
    },
    device: device.map((d) => ({ name: d.name, sessions: Number(d.sessionsCount) })),
    browser: browser.map((b) => ({ name: b.name, sessions: Number(b.sessionsCount) })),
  };
}

module.exports = { normalizeClarity };
