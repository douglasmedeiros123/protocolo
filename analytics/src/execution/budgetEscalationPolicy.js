'use strict';

const { BUDGET_ESCALATION_DECISIONS } = require('./enums');

// PASSO 14B, item 8-9 — política explícita pra cenários tipo R$30/dia -> R$500/dia. NUNCA assume
// que stepwise é sempre melhor, nem que direct jump é sempre proibido — a decisão é derivada dos
// fatores reais, não de uma preferência fixa.
/**
 * evaluateBudgetEscalation() — nenhum fator sozinho decide; a árvore segue uma ordem de
 * severidade: financial truth/measurement bloqueante > performance confirmada negativa >
 * evidência insuficiente > marginal economics desconhecida (limita o tamanho do salto) >
 * confirmação econômica real (permite o salto, escalado pela magnitude).
 */
function evaluateBudgetEscalation({
  currentBudget, recommendedBudget, financialRoas, targetRoas, marginalRoas, // 'UNKNOWN' ou número
  sampleSufficient, confidence, financialTruthHealthStatus, measurementReadiness,
  anomalyState, campaignStability, // 'STABLE'|'UNSTABLE'|'UNKNOWN'
}) {
  const jumpMultiple = (currentBudget > 0 && recommendedBudget != null) ? recommendedBudget / currentBudget : null;

  if (financialTruthHealthStatus === 'BLOCKED') {
    return { decision: 'DENY', jump_multiple: jumpMultiple, reason: 'FINANCIAL_TRUTH_HEALTH=BLOCKED — nenhuma decisão de escalonamento de capital é responsável enquanto a fonte financeira estiver comprometida.' };
  }
  if (measurementReadiness === 'BLOCKED_BY_MEASUREMENT') {
    return { decision: 'DENY', jump_multiple: jumpMultiple, reason: 'measurement_readiness=BLOCKED_BY_MEASUREMENT — sem medir, escalar não gera aprendizado confiável.' };
  }
  if (anomalyState === 'CAPITAL_BLOCKING') {
    return { decision: 'STOP', jump_multiple: jumpMultiple, reason: 'anomalia CAPITAL_BLOCKING ativa — parar, nunca escalar sob essa condição.' };
  }
  if (financialRoas == null) {
    return { decision: 'HOLD', jump_multiple: jumpMultiple, reason: 'financial_roas UNKNOWN — sem outcome financeiro real, nenhuma escalada é defensável (coletar evidência primeiro).' };
  }
  if (financialRoas < 1.0) {
    return { decision: financialRoas < 0.5 ? 'STOP' : 'REDUCE', jump_multiple: jumpMultiple, reason: `financial_roas=${financialRoas} < 1.0 — performance financeira negativa/insuficiente confirmada; escalar pioraria a perda, não é hora de aumentar orçamento.` };
  }
  if (!sampleSufficient) {
    return { decision: 'HOLD', jump_multiple: jumpMultiple, reason: 'amostra insuficiente pra confirmar a performance observada — HOLD até sample_sufficient=true, nunca escala em cima de ruído.' };
  }
  if (campaignStability === 'UNSTABLE') {
    return { decision: 'REQUIRE_HUMAN_APPROVAL', jump_multiple: jumpMultiple, reason: 'campaign_stability=UNSTABLE — spend acceleration risk real, exige revisão humana antes de qualquer salto.' };
  }

  // a partir daqui, financial_roas>=1.0, amostra suficiente, sem anomalia bloqueante, campanha
  // estável — a decisão passa a depender de marginal economics + magnitude do salto + confiança.
  const marginalUnknown = marginalRoas === 'UNKNOWN' || marginalRoas == null;
  const bigJump = jumpMultiple != null && jumpMultiple >= 3; // R$30->R$500 é 16.6x — bem acima disso

  if (marginalUnknown) {
    // sem saber o retorno marginal, um salto grande é opportunity cost desconhecido vs. risco
    // desconhecido — nunca DIRECT_JUMP; STEPWISE_SCALE testa a curva real com exposição limitada.
    return {
      decision: bigJump ? 'STEPWISE_SCALE' : (confidence === 'HIGH' ? 'STEPWISE_SCALE' : 'REQUIRE_HUMAN_APPROVAL'),
      jump_multiple: jumpMultiple,
      reason: `marginal_roas=UNKNOWN — sem saber o retorno do próximo R$1, um salto ${bigJump ? 'grande' : ''} direto arrisca opportunity cost desconhecido; escalonamento em etapas revela a curva marginal real com exposição limitada por etapa (item 8: não assume stepwise universalmente melhor, mas é a escolha correta aqui pela ausência de dado marginal).`,
    };
  }

  if (marginalRoas >= targetRoas && confidence === 'HIGH' && financialRoas >= targetRoas) {
    return {
      decision: bigJump ? 'STEPWISE_SCALE' : 'DIRECT_JUMP', // mesmo com tudo confirmado, magnitude extrema ainda pondera a favor de stepwise — nunca ignorada
      jump_multiple: jumpMultiple,
      reason: `marginal_roas=${marginalRoas} e financial_roas=${financialRoas} ambos >= target (${targetRoas}), confiança alta — oportunidade econômica extraordinária confirmada. ${bigJump ? 'Magnitude do salto (' + jumpMultiple.toFixed(1) + 'x) ainda pesa a favor de etapas, mesmo com confirmação — opportunity cost de ir devagar é real, mas spend acceleration risk também é (item 8: nenhum dos dois vence por padrão).' : 'Salto direto defensável dado o tamanho contido.'}`,
    };
  }

  return { decision: 'REQUIRE_HUMAN_APPROVAL', jump_multiple: jumpMultiple, reason: 'sinal positivo mas não uma confirmação econômica extraordinária — decisão de escalonamento significativo fica pra revisão humana.' };
}

module.exports = { evaluateBudgetEscalation, BUDGET_ESCALATION_DECISIONS };
