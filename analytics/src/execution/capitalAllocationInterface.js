'use strict';

// PASSO 14B, item 15 — interface futura de Capital Allocator (não construído por completo).
// Compara candidatos entre media/creative/CRO/offer/measurement/lifecycle/new_product/reserve —
// nunca inventa EV/VOI quando o candidato não tem dado real suficiente.
const CANDIDATE_DOMAINS = ['MEDIA', 'CREATIVE', 'CRO', 'OFFER', 'MEASUREMENT', 'LIFECYCLE', 'NEW_PRODUCT', 'RESERVE'];

function buildCandidate({ domain, requiredCapital, expectedValue, valueOfInformation, risk, confidence, timeToSignal, reversibility }) {
  if (!CANDIDATE_DOMAINS.includes(domain)) throw new Error(`domínio de candidato desconhecido: ${domain}`);
  return {
    candidate: domain,
    required_capital: requiredCapital ?? 'UNKNOWN',
    expected_value: expectedValue ?? 'UNKNOWN', // nunca inventado quando não há dado
    value_of_information: valueOfInformation ?? 'NOT_ASSESSABLE',
    risk: risk ?? 'UNKNOWN',
    confidence: confidence ?? 'NOT_ASSESSABLE',
    time_to_signal: timeToSignal ?? 'UNKNOWN',
    reversibility: reversibility ?? 'UNKNOWN',
  };
}

// item 15/22 — ranking nunca inventa EV pra desempatar; candidatos com EV UNKNOWN não são
// automaticamente piores que EV=0 (UNKNOWN != zero EV, item 21) — mas também não podem ser
// declarados "melhores" sem evidência. Ordem: (1) EV numérico real desc, (2) VOI qualitativo
// desc entre os que empatam/têm EV UNKNOWN, (3) risco asc como desempate final.
const VOI_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_ASSESSABLE: 0 };
const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3, UNKNOWN: 2 };

function compareCandidates(a, b) {
  const aEvNumeric = typeof a.expected_value === 'number';
  const bEvNumeric = typeof b.expected_value === 'number';
  if (aEvNumeric && bEvNumeric && a.expected_value !== b.expected_value) return b.expected_value - a.expected_value;
  if (aEvNumeric !== bEvNumeric) return aEvNumeric ? -1 : 1; // EV real conhecido vence EV desconhecido — mas isso não é "UNKNOWN=pior", é "conhecido é mais decidível"
  const voiDiff = (VOI_ORDER[b.value_of_information] ?? 0) - (VOI_ORDER[a.value_of_information] ?? 0);
  if (voiDiff !== 0) return voiDiff;
  return (RISK_ORDER[a.risk] ?? 2) - (RISK_ORDER[b.risk] ?? 2);
}

/**
 * rankCandidatesAndFindBestUse() — item 15. RESERVE_CAPITAL é um candidato válido como qualquer
 * outro — pode vencer o ranking (item 22: "reserve capital is valid best allocation").
 */
function rankCandidatesAndFindBestUse(candidates) {
  const ranked = [...candidates].sort(compareCandidates).map((c, i) => ({ ...c, rank: i + 1 }));
  return { ranking: ranked, best_use_of_next_capital: ranked[0] || null, tie_break_factor_order: ['expected_value_numeric_known', 'value_of_information', 'risk'] };
}

module.exports = { CANDIDATE_DOMAINS, buildCandidate, compareCandidates, rankCandidatesAndFindBestUse };
