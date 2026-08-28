'use strict';

// MODOS DE DECISÃO (PASSO 7, item 2) — thresholds documentados, nunca opinião de IA no momento
// do cálculo. Usa 3 janelas do Profit Engine (7d/14d/30d) — nunca ROAS instantâneo sozinho.
//
//   RECOVERY   : roas_financeiro(30d) < 1.0, OU sem dado suficiente (default mais seguro)
//   DEFENSE    : operação estava saudável (roas_financeiro(30d) >= 1.0) mas a janela recente
//                (7d) caiu abaixo de DETERIORATION_RATIO do valor de 30d — checado ANTES dos
//                limiares simples de ROAS porque é sobre TENDÊNCIA, não nível absoluto.
//   VALIDATION : roas_financeiro(30d) >= 1.0 E evidence_tier == 0 (nenhuma hipótese SUPPORTED/
//                STRONG ainda, nem consistência multi-janela)
//   GROWTH     : roas_financeiro(30d) >= 1.0 E evidence_tier == 1 ("evidência crescente": pelo
//                menos 1 hipótese SUPPORTED, OU as janelas 7d e 30d concordam, ambas >= 1.0)
//   SCALE      : roas_financeiro(30d) >= 1.0 E evidence_tier == 2 (pelo menos 1 hipótese STRONG
//                E as janelas 7d/14d/30d TODAS >= 1.0 E nenhuma flag de tracking BLOQUEANTE)
//
// "ROAS instantâneo" sozinho NUNCA basta pra SCALE — exige evidence_tier 2, que depende de
// STRONG (repetição real comprovada pelo Learning Engine), consistência entre janelas E
// tracking confiável.
const DETERIORATION_RATIO = 0.7; // 7d caiu abaixo de 70% do nível de 30d = deterioração relevante

function computeEvidenceTier({ hasStrongHypothesis, hasSupportedHypothesis, windowsConsistent, allWindowsPositive, trackingBlocking }) {
  if (!trackingBlocking && hasStrongHypothesis && allWindowsPositive) return 2;
  if (hasSupportedHypothesis || windowsConsistent) return 1;
  return 0;
}

function classifyDecisionMode({ roas30d, roas7d, roas14d, hasStrongHypothesis, hasSupportedHypothesis, trackingBlocking }) {
  if (roas30d == null) {
    return { mode: 'RECOVERY', reason: 'roas_financeiro(30d) indisponível — modo mais seguro por padrão.', evidence_tier: 0 };
  }

  const windowsConsistent = roas7d != null && roas7d >= 1.0 && roas30d >= 1.0;
  const allWindowsPositive = [roas7d, roas14d, roas30d].every((r) => r != null && r >= 1.0);

  const wasHealthy = roas30d >= 1.0;
  const deteriorated = wasHealthy && roas7d != null && roas7d < roas30d * DETERIORATION_RATIO;
  if (deteriorated) {
    return {
      mode: 'DEFENSE',
      reason: `roas_financeiro(30d)=${roas30d.toFixed(3)} indicava operação saudável, mas roas_financeiro(7d)=${roas7d.toFixed(3)} caiu abaixo de ${(DETERIORATION_RATIO * 100).toFixed(0)}% desse nível.`,
      evidence_tier: null,
    };
  }

  if (roas30d < 1.0) {
    return { mode: 'RECOVERY', reason: `roas_financeiro(30d) (${roas30d.toFixed(3)}) < 1.0.`, evidence_tier: 0 };
  }

  const evidence_tier = computeEvidenceTier({ hasStrongHypothesis, hasSupportedHypothesis, windowsConsistent, allWindowsPositive, trackingBlocking });

  if (evidence_tier === 2) {
    return { mode: 'SCALE', reason: 'roas_financeiro(30d) >= 1.0, hipótese STRONG comprovada, janelas 7d/14d/30d consistentes e tracking confiável.', evidence_tier };
  }
  if (evidence_tier === 1) {
    return { mode: 'GROWTH', reason: 'roas_financeiro(30d) >= 1.0 e evidência crescente (hipótese SUPPORTED ou janelas 7d/30d consistentes).', evidence_tier };
  }
  return { mode: 'VALIDATION', reason: 'roas_financeiro(30d) >= 1.0 mas ainda sem evidência suficiente de sustentabilidade.', evidence_tier };
}

module.exports = { classifyDecisionMode, computeEvidenceTier, DETERIORATION_RATIO };
