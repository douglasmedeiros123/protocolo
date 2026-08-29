'use strict';

const { NO_ACTION_RECOMMENDATIONS } = require('./enums');

// PASSO 14B, item 14 — a máquina precisa poder recomendar NÃO gastar. Nenhum viés de "sempre
// gastar": cada recomendação de não-ação é derivada de condições reais, nunca um fallback vazio.
function recommendNoAction({ financialTruthHealthStatus, measurementReadiness, hypothesisSpaceStatus, financialRoas, targetRoas, hasViableCandidate, capitalAvailable }) {
  if (financialTruthHealthStatus === 'BLOCKED') {
    return { recommendation: 'DO_NOT_SPEND', reason: 'FINANCIAL_TRUTH_HEALTH=BLOCKED — não há base confiável nem pra saber quanto foi gasto/ganho; não gastar até restaurar integridade.' };
  }
  if (measurementReadiness === 'BLOCKED_BY_MEASUREMENT') {
    return { recommendation: 'COLLECT_EVIDENCE', reason: 'measurement_readiness bloqueado por mensuração — o próximo passo certo é resolver o blocker de medição, não gastar capital que não seria interpretável.' };
  }
  if (capitalAvailable === false) {
    return { recommendation: 'HOLD_CAPITAL', reason: 'capital não disponível — reter é a única opção real, independente de quão boa seja a oportunidade.' };
  }
  if (financialRoas != null && financialRoas < 0.5) {
    return { recommendation: 'KILL_HYPOTHESIS', reason: `financial_roas=${financialRoas} — perda severa e sustentada confirmada; a hipótese atual não é viável, matar antes de continuar queimando capital.` };
  }
  if (hypothesisSpaceStatus === 'EXHAUSTED' && !hasViableCandidate && financialRoas != null && financialRoas < targetRoas) {
    return { recommendation: 'SWITCH_PRODUCT', reason: 'espaço de hipóteses de arquitetura exaurido, nenhum candidato viável restante, e a economia atual não atinge o alvo — trocar de produto é a opção estrutural restante (nunca continuar tentando variações do mesmo funil indefinidamente).' };
  }
  if (!hasViableCandidate) {
    return { recommendation: 'COLLECT_EVIDENCE', reason: 'nenhum candidato viável identificado ainda — coletar mais evidência antes de qualquer decisão de gasto.' };
  }
  return { recommendation: null, reason: 'condições atuais não exigem recomendação de não-ação — uma ação real pode ser avaliada normalmente.' };
}

module.exports = { recommendNoAction, NO_ACTION_RECOMMENDATIONS };
