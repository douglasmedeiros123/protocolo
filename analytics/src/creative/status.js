'use strict';

// CREATIVE STATUS (PASSO 8, item 18 + PASSO 8.1, itens 1/2/8) — 11 estados, regras
// determinísticas e documentadas. CHAMPION exige EVIDÊNCIA SUFICIENTE (Learning Engine STRONG).
// LOSER exige evidência MAIS FORTE que "ficou em 2º lugar" — nunca depende só do ranking
// relativo (PASSO 8.1, item 8): precisa de amostra suficiente + gap de score real + confiança
// ACIMA de um threshold (configurável) + opcionalmente um experimento concluído com FAILURE
// (evidência independente que dispensa o threshold de confiança, porque vem de um resultado
// real, não de uma métrica de mídia ainda em coleta).
const CREATIVE_STATUSES = [
  'DRAFT', 'READY_TO_TEST', 'TESTING', 'CHALLENGER', 'BEST_SIGNAL', 'WEAKER_SIGNAL',
  'CHAMPION', 'FATIGUED', 'LOSER', 'INCONCLUSIVE', 'ARCHIVED',
];

// Gap (0-100, em pontos de creative_score) abaixo do qual um criativo NÃO-líder ainda é
// considerado "no páreo" (CHALLENGER) em vez de "claramente atrás" (WEAKER_SIGNAL/LOSER).
const CHALLENGER_MAX_GAP = 15;

// LOSER exige gap >= este limiar...
const LOSER_SCORE_GAP = 25;
// ...E score_confidence >= este limiar (configurável — item 1: "confiança acima de um
// threshold configurável"). Com score_basis=PLATFORM_ONLY, score_confidence é sempre capada em
// 60 (ver score.js) — abaixo deste limiar de 70, então LOSER fica INALCANÇÁVEL só com proxy de
// mídia, exatamente a regra pedida: "sem atribuição financeira, Creative 01 não deve virar
// LOSER". Só passa a ser alcançável com atribuição financeira real OU um experimento concluído.
const LOSER_MIN_CONFIDENCE = 70;

/**
 * @param {object} input
 *   sampleSufficient        bool
 *   isArchived              bool  — nunca inferido
 *   isFatigued              bool  — só true com dado de tendência REAL (fatigue.js)
 *   isBestAmongCompared     bool  — maior creative_score dentre os com amostra suficiente
 *   hasChampionEvidence     bool  — hipótese STRONG no Learning Engine pra CREATIVE neste produto
 *   scoreGapFromBest        number|null — >=0, quanto este creative fica ABAIXO do melhor
 *   scoreConfidence         number|null — score_confidence (0-100) deste creative
 *   experimentConcludedFailure bool — existe um experimento REAL concluído como FAILURE
 *                                      testando este creative (nunca inferido — só se informado
 *                                      explicitamente pelo Experiment/Learning Engine)
 */
function classifyCreativeStatus({
  sampleSufficient, isArchived, isFatigued, isBestAmongCompared, hasChampionEvidence,
  scoreGapFromBest, scoreConfidence, experimentConcludedFailure = false,
}) {
  if (isArchived) return { status: 'ARCHIVED', reason: 'Marcado como arquivado explicitamente.' };
  if (isFatigued) return { status: 'FATIGUED', reason: 'Tendência real de queda (CTR/CPA/ROAS) detectada — ver fatigue.js.' };
  if (!sampleSufficient) return { status: 'INCONCLUSIVE', reason: 'Amostra abaixo do minimum_evidence da categoria CREATIVE — ainda não é possível concluir.' };

  if (isBestAmongCompared && hasChampionEvidence) return { status: 'CHAMPION', reason: 'Melhor do peer group E com hipótese STRONG comprovada pelo Learning Engine.' };
  if (isBestAmongCompared) return { status: 'BEST_SIGNAL', reason: 'Melhor do peer group até agora, mas ainda SEM evidência suficiente (Learning Engine) pra virar CHAMPION.' };

  if (experimentConcludedFailure) {
    return { status: 'LOSER', reason: 'Experimento real concluído como FAILURE testando este criativo — evidência independente, não depende de confidence de mídia.' };
  }

  if (scoreGapFromBest == null) {
    return { status: 'CHALLENGER', reason: 'Sem base de comparação de score ainda — tratado como concorrente ativo, nunca como perdedor por padrão.' };
  }
  if (scoreGapFromBest < CHALLENGER_MAX_GAP) {
    return { status: 'CHALLENGER', reason: `Gap de score (${scoreGapFromBest.toFixed(1)}) abaixo de ${CHALLENGER_MAX_GAP} — ainda no páreo.` };
  }
  if (scoreGapFromBest >= LOSER_SCORE_GAP && (scoreConfidence ?? 0) >= LOSER_MIN_CONFIDENCE) {
    return { status: 'LOSER', reason: `Gap de score (${scoreGapFromBest.toFixed(1)}) >= ${LOSER_SCORE_GAP} E score_confidence (${scoreConfidence}) >= ${LOSER_MIN_CONFIDENCE} — evidência forte o suficiente.` };
  }
  return {
    status: 'WEAKER_SIGNAL',
    reason: `Gap de score (${scoreGapFromBest.toFixed(1)}) relevante, mas score_confidence (${scoreConfidence ?? 0}) abaixo de ${LOSER_MIN_CONFIDENCE} — sinal mais fraco, NÃO evidência forte o bastante pra LOSER (falta atribuição financeira ou experimento concluído).`,
  };
}

module.exports = { CREATIVE_STATUSES, classifyCreativeStatus, LOSER_SCORE_GAP, LOSER_MIN_CONFIDENCE, CHALLENGER_MAX_GAP };
