'use strict';

const { RISK_LEVELS } = require('./enums');
const { classifyBlastRadius } = require('./blastRadius');

// item 14A.13 — nível de risco derivado de capital_at_risk/reversibility/measurement_quality/
// confidence/anomaly_state/scope/blast_radius. Nunca inventa capital quando UNKNOWN — UNKNOWN
// capital eleva o risco (nunca reduz), porque decidir sem saber o tamanho da aposta é
// estruturalmente mais arriscado que decidir sabendo (item 14A.15 do relatório).
const REVERSIBILITY_RISK_WEIGHT = { REVERSIBLE: 0, PARTIALLY_REVERSIBLE: 1, HARD_TO_REVERSE: 2, IRREVERSIBLE: 3, UNKNOWN: 2 };
const BLAST_RADIUS_RISK_WEIGHT = { SINGLE_ASSET: 0, CAMPAIGN: 1, PRODUCT: 2, FUNNEL: 2, ACCOUNT: 3, GLOBAL: 4 };
const ANOMALY_RISK_WEIGHT = { NORMAL: 0, WARNING: 1, CRITICAL: 2, CAPITAL_BLOCKING: 3 };
const CONFIDENCE_RISK_WEIGHT = { HIGH: 0, MEDIUM: 1, LOW: 2, VERY_LOW: 3, NOT_ASSESSABLE: 2 };

function classifyRiskLevel({ capitalAtRisk, reversibility, measurementCapitalGateState, confidence, anomalySeverity, subjectType }) {
  const { blast_radius: blastRadius } = classifyBlastRadius(subjectType);

  let score = 0;
  const factors = [];

  // capital: UNKNOWN nunca vira 0 — soma um peso de risco explícito por desconhecimento (item 15
  // do relatório 14A: "unknown capital != zero risk").
  if (capitalAtRisk == null) { score += 2; factors.push('capital_at_risk=UNKNOWN eleva o risco (nunca tratado como zero).'); }
  else if (capitalAtRisk > 0) { score += 1; factors.push(`capital_at_risk=${capitalAtRisk} conhecido e > 0.`); }

  const revWeight = REVERSIBILITY_RISK_WEIGHT[reversibility] ?? REVERSIBILITY_RISK_WEIGHT.UNKNOWN;
  score += revWeight; factors.push(`reversibility=${reversibility || 'UNKNOWN'} (+${revWeight}).`);

  const blastWeight = BLAST_RADIUS_RISK_WEIGHT[blastRadius] ?? BLAST_RADIUS_RISK_WEIGHT.ACCOUNT;
  score += blastWeight; factors.push(`blast_radius=${blastRadius} (+${blastWeight}).`);

  const measurementWeight = measurementCapitalGateState === 'READY_FOR_CAPITAL' ? 0 : measurementCapitalGateState === 'BLOCKED_BY_MEASUREMENT' ? 3 : 1;
  score += measurementWeight; factors.push(`measurement_capital_gate=${measurementCapitalGateState || 'UNKNOWN'} (+${measurementWeight}).`);

  const confWeight = CONFIDENCE_RISK_WEIGHT[confidence] ?? CONFIDENCE_RISK_WEIGHT.NOT_ASSESSABLE;
  score += confWeight; factors.push(`confidence=${confidence || 'NOT_ASSESSABLE'} (+${confWeight}).`);

  const anomalyWeight = ANOMALY_RISK_WEIGHT[anomalySeverity] ?? 0;
  score += anomalyWeight; factors.push(`anomaly_severity=${anomalySeverity || 'NORMAL'} (+${anomalyWeight}).`);

  let level;
  if (score >= 9) level = 'CRITICAL';
  else if (score >= 6) level = 'HIGH';
  else if (score >= 3) level = 'MEDIUM';
  else level = 'LOW';

  return { risk_level: level, score, blast_radius: blastRadius, factors };
}

module.exports = { classifyRiskLevel, RISK_LEVELS, REVERSIBILITY_RISK_WEIGHT, BLAST_RADIUS_RISK_WEIGHT };
