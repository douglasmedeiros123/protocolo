'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeClarity, normalizeClarityFailure } = require('../src/normalizers/clarity');

function fakeRaw(overrides = {}) {
  return {
    collected_at: '2026-08-27T20:00:00.000Z',
    window_supported_by_api: 'últimos 1 dia',
    source_status: 'available',
    metrics: [
      { metricName: 'Traffic', information: [{ totalSessionCount: overrides.total ?? 9, totalBotSessionCount: 2, distinctUserCount: 6 }] },
      { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 26.89 }] },
      { metricName: 'EngagementTime', information: [{ totalTime: overrides.totalTime ?? 212, activeTime: 125 }] },
      { metricName: 'DeadClickCount', information: [{ sessionsWithMetricPercentage: 11.11 }] },
      { metricName: 'RageClickCount', information: [{ sessionsWithMetricPercentage: 0 }] },
      { metricName: 'Device', information: [{ name: 'Mobile', sessionsCount: overrides.deviceSessions ?? 7 }] },
      { metricName: 'Browser', information: [{ name: 'Chrome', sessionsCount: 5 }] },
    ],
  };
}

test('normalizeClarity: mesmo valor como string ou number produz o MESMO resultado normalizado (bug real da API, confirmado empiricamente)', () => {
  const asNumber = normalizeClarity(fakeRaw({ total: 9, totalTime: 212, deviceSessions: 7 }));
  const asString = normalizeClarity(fakeRaw({ total: '9', totalTime: '212', deviceSessions: '7' }));
  assert.deepEqual(asNumber, asString);
  assert.equal(typeof asNumber.sessions.total, 'number');
  assert.equal(typeof asString.sessions.total, 'number');
});

test('normalizeClarity: valores ausentes viram null, nunca NaN', () => {
  const raw = fakeRaw({});
  raw.metrics = raw.metrics.filter((m) => m.metricName !== 'Traffic');
  const normalized = normalizeClarity(raw);
  assert.equal(normalized.sessions.total, null);
  assert.equal(Number.isNaN(normalized.sessions.total), false);
});

test('normalizeClarityFailure: nunca inventa métrica, sempre null', () => {
  const failure = normalizeClarityFailure('token ausente', 'error');
  assert.equal(failure.source_status, 'error');
  assert.equal(failure.sessions, null);
  assert.equal(failure.behavior, null);
  assert.equal(failure.reason, 'token ausente');
});
