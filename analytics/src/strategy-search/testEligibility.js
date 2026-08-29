'use strict';

// ============================================================================================
// HANDOFF EXPLÍCITO PARA O PASSO 13 — MEASUREMENT & ATTRIBUTION INTELLIGENCE (NÃO IMPLEMENTAR
// AGORA).
//
// A recomendação real do Strategy Search hoje (2026-08-29, snapshot do PASSO 12.2) é testar uma
// arquitetura alternativa baseada em ADVERTORIAL (ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE),
// mas:
//   test_eligibility = NEEDS_TRACKING
//   tracking_readiness = PARTIAL
// (ver evaluateArchitectureTestEligibility()/evaluateTrackingReadiness() em
// architectureProperties.js — o estágio ADVERTORIAL novo não tem instrumentação real confirmada
// hoje, só AD/SALES_PAGE/CHECKOUT/ORDER_BUMP têm).
//
// Ou seja: a MELHOR HIPÓTESE estratégica disponível hoje não pode receber capital de teste ainda
// — falta capacidade de mensuração, não falta estratégia. O futuro Measurement & Attribution
// Intelligence Agent (dívida já registrada em planner/trackingScopes.js no PASSO 11.1 —
// FINANCIAL_TRANSACTION_TRUTH/REVENUE_TRUTH/PLATFORM_ATTRIBUTION/CROSS_PLATFORM_RECONCILIATION/
// CREATIVE_ATTRIBUTION/CAMPAIGN_ATTRIBUTION/EXPERIMENT_ATTRIBUTION) deve elevar tracking_readiness
// do(s) estágio(s) novos de uma arquitetura candidata ANTES de qualquer liberação de capital pra
// testá-la — essa é a pré-condição real que o PASSO 13 precisa resolver primeiro.
// ============================================================================================

/**
 * evaluateArchitectureTestEligibility() — item 84 (PASSO 12), recalibrado no PASSO 12.1 item 1:
 * a elegibilidade NÃO PODE ser circular. O próprio propósito do teste é produzir
 * EVIDENCE_OBJECTIVE (ex.: "upsell aumenta receita/comprador?") — a AUSÊNCIA desse resultado
 * NUNCA bloqueia o teste sozinha (isso seria exigir a resposta antes de fazer a pergunta).
 * NEEDS_EVIDENCE só dispara quando existe PREREQUISITE_EVIDENCE real faltando — algo
 * indispensável pra sequer DEFINIR a hipótese/implementação corretamente (ex.: perguntas de
 * qualificação de um QUIZ, restrição técnica desconhecida) — nunca "não sabemos ainda se vai
 * performar bem" (isso é o próprio objetivo do teste).
 */
function evaluateArchitectureTestEligibility({ trackingReadiness, isCurrent, prerequisiteEvidenceGaps = [] }) {
  if (isCurrent) return { eligibility: 'READY', reason: 'já implementada e instrumentada — não exige nova elegibilidade de teste.' };
  if (trackingReadiness === 'NOT_READY') return { eligibility: 'NEEDS_TRACKING', reason: 'estágios novos sem instrumentação real confirmada hoje — sem tracking mínimo, o teste seria inconclusivo (item 1, exemplo explícito).' };
  if (prerequisiteEvidenceGaps.length > 0) {
    return { eligibility: 'NEEDS_EVIDENCE', reason: `evidência prévia indispensável pra definir a hipótese/implementação corretamente ainda não coletada: ${prerequisiteEvidenceGaps.map((g) => g.type).join(', ')}.` };
  }
  if (trackingReadiness === 'PARTIAL') return { eligibility: 'NEEDS_TRACKING', reason: 'parte dos estágios novos ainda sem instrumentação real — sem isso o teste geraria dado incompleto (item 1).' };
  if (trackingReadiness === 'READY') return { eligibility: 'NEEDS_IMPLEMENTATION', reason: 'tracking pronto e nenhuma evidência pré-requisito faltando — só falta implementar o(s) estágio(s) novo(s) pra medir de verdade.' };
  return { eligibility: 'UNKNOWN', reason: 'tracking_readiness não avaliável.' };
}

// item 74 — só permite teste paralelo se capital/tracking/separação causal/capacidade
// operacional permitirem — NUNCA executa, só avalia elegibilidade.
function evaluateParallelTestEligibility({ candidateA, candidateB, capitalAvailable }) {
  if (!candidateA || !candidateB) return { eligible: false, reason: 'menos de 2 candidatos elegíveis pra paralelizar.' };
  const bothReady = candidateA.tracking_readiness === 'READY' && candidateB.tracking_readiness === 'READY';
  const causallySeparable = candidateA.family !== candidateB.family; // famílias diferentes -> menor risco de confundir causa
  const capitalKnown = capitalAvailable != null;
  const eligible = bothReady && causallySeparable && capitalKnown;
  return {
    eligible,
    reason: eligible
      ? 'ambos READY em tracking, famílias diferentes (separação causal plausível), capital configurado.'
      : `bloqueado — tracking_ready=${bothReady}, causal_separation=${causallySeparable}, capital_configurado=${capitalKnown}.`,
  };
}

module.exports = { evaluateArchitectureTestEligibility, evaluateParallelTestEligibility };
