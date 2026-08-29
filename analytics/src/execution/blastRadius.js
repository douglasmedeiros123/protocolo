'use strict';

const { BLAST_RADII } = require('./enums');

// item 14A.14 — quanto maior o blast radius, maior a exigência de policy/human approval. Mapa
// documentado, nunca escolhido caso a caso.
const APPROVAL_REQUIREMENT_BY_BLAST_RADIUS = {
  SINGLE_ASSET: 'POLICY_ONLY',
  CAMPAIGN: 'POLICY_ONLY',
  PRODUCT: 'HUMAN_APPROVAL_RECOMMENDED',
  FUNNEL: 'HUMAN_APPROVAL_RECOMMENDED',
  ACCOUNT: 'HUMAN_APPROVAL_REQUIRED',
  GLOBAL: 'HUMAN_APPROVAL_REQUIRED',
};

function classifyBlastRadius(subjectType) {
  const MAP = {
    AD: 'SINGLE_ASSET', ADSET: 'CAMPAIGN', CAMPAIGN: 'CAMPAIGN', ARCHITECTURE: 'FUNNEL',
    EXPERIMENT: 'FUNNEL', PRODUCT: 'PRODUCT', OFFER: 'PRODUCT', TRACKING_CONFIG: 'ACCOUNT',
    LANDING_PAGE: 'FUNNEL',
  };
  const radius = MAP[subjectType] || 'ACCOUNT'; // subject desconhecido -> nunca assume o menor risco
  return { blast_radius: radius, approval_requirement: APPROVAL_REQUIREMENT_BY_BLAST_RADIUS[radius], reason: `subject_type=${subjectType} mapeado pra ${radius} (mapa documentado, item 14A.14).` };
}

module.exports = { classifyBlastRadius, APPROVAL_REQUIREMENT_BY_BLAST_RADIUS, BLAST_RADII };
