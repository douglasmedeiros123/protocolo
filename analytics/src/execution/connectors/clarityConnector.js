'use strict';

const { collectClarity } = require('../../collectors/clarity');
const env = require('../../../config/env');

// PASSO 18.5, item 15-16 — Clarity é BEHAVIORAL_EVIDENCE, nunca FINANCIAL_TRANSACTION_TRUTH
// (Hotmart) nem PLATFORM_TRUTH (Meta). READ_ONLY por natureza da própria API.
async function readBehavioralInsights() {
  const { ok } = env.status().clarity;
  if (!ok) return { available: false, reason: 'CREDENTIAL_SETUP_REQUIRED', platform: 'CLARITY' };
  const raw = await collectClarity();
  return {
    available: raw.source_status === 'available',
    platform: 'CLARITY',
    truth_role: 'BEHAVIORAL_EVIDENCE',
    collected_at: raw.collected_at,
    window: raw.window_supported_by_api,
    metrics: raw.metrics,
  };
}

module.exports = { readBehavioralInsights };
