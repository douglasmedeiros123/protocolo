'use strict';

/**
 * evaluateChallengeCurrentStrategy() — item 7, recalibrado no PASSO 12.1 item 4. "Preservamos a
 * arquitetura atual por evidência a favor, ou só porque ela já existe?" — separa explicitamente
 * OPERATIONAL_EVIDENCE (ela funciona: tem comprador real, receita real, funil observado) de
 * COMPARATIVE_EVIDENCE (ela é comprovadamente MELHOR que uma alternativa). "Tem vendas" nunca
 * vira "é a melhor arquitetura" sozinho (item 4) — mas também nunca é ignorado: uma arquitetura
 * com evidência operacional real e nenhuma evidência estrutural contra ela é
 * PROVISIONALLY_SUPPORTED, não INCUMBENCY_ONLY (reservado pra quando nem evidência operacional
 * real específica do produto existe).
 */
function evaluateChallengeCurrentStrategy({ experimentCoverage, structuralFrictionSignals, financialRoas, targetRoas, hypothesisSpaceStatus, buyers }) {
  if (hypothesisSpaceStatus.status === 'UNKNOWN' || financialRoas == null || targetRoas == null) {
    return { status: 'UNKNOWN', operational_evidence: 'UNKNOWN', comparative_evidence: 'UNKNOWN', reason: 'dados insuficientes pra avaliar se a arquitetura atual tem evidência real a favor.' };
  }

  const operationalEvidence = buyers != null && buyers > 0 ? 'OBSERVED' : 'ABSENT';

  const hasStrongStructuralEvidenceAgainst = structuralFrictionSignals.some((s) => s.causal_status === 'VALIDATED' || s.impact_confidence === 'HIGH');
  if (hasStrongStructuralEvidenceAgainst) {
    return { status: 'EVIDENCE_AGAINST', operational_evidence: operationalEvidence, comparative_evidence: 'NOT_ESTABLISHED', reason: 'existe achado técnico/estrutural com causal_status=VALIDATED ou impact_confidence=HIGH — evidência real contra a integridade da arquitetura atual, mesmo com evidência operacional presente.' };
  }

  const completed = experimentCoverage.total_completed;
  const successCount = Object.values(experimentCoverage.by_category).reduce((s, c) => s + c.success, 0);
  const comparativeEvidence = completed === 0 ? 'NOT_ESTABLISHED' : (successCount > 0 ? 'ESTABLISHED' : 'PARTIAL');

  if (comparativeEvidence === 'ESTABLISHED') {
    return { status: 'EVIDENCE_SUPPORTED', operational_evidence: operationalEvidence, comparative_evidence: comparativeEvidence, reason: `${successCount} experimento(s) real(is) com resultado SUCCESS sustentam a arquitetura atual comparativamente, além da evidência operacional.` };
  }
  if (comparativeEvidence === 'PARTIAL') {
    return { status: 'PROVISIONALLY_SUPPORTED', operational_evidence: operationalEvidence, comparative_evidence: comparativeEvidence, reason: `${completed} experimento(s) concluído(s), mas nenhum SUCCESS claro ainda — suporte provisório, além da evidência operacional real.` };
  }
  // comparativeEvidence === 'NOT_ESTABLISHED' (0 experimentos concluídos comparando nada)
  if (operationalEvidence === 'OBSERVED') {
    return {
      status: 'PROVISIONALLY_SUPPORTED', operational_evidence: operationalEvidence, comparative_evidence: comparativeEvidence,
      reason: `evidência OPERACIONAL real existe (compradores/receita/funil observados) — a arquitetura funciona. Mas nenhuma evidência COMPARATIVA estabelece que ela é superior a uma alternativa (0 experimentos concluídos comparando, item 4) — "tem vendas" não é "é a melhor arquitetura".`,
    };
  }
  return { status: 'INCUMBENCY_ONLY', operational_evidence: operationalEvidence, comparative_evidence: comparativeEvidence, reason: 'nenhuma evidência operacional nem comparativa real específica do produto — a arquitetura continua só porque já está implementada (item 8).' };
}

// item 21 — decisão explícita entre otimizar o que existe ou testar algo estruturalmente
// diferente. Nunca hardcoded — deriva de alavancas ainda não testadas + known_path_to_target.
function evaluateOptimizationVsRearchitecture({ leverStates, knownPathToTarget }) {
  if (!knownPathToTarget || knownPathToTarget.status === 'UNKNOWN') {
    return { decision: 'INSUFFICIENT_EVIDENCE', reason: 'known_path_to_target ainda não avaliável.' };
  }
  const keyLevers = leverStates.filter((l) => ['CREATIVE', 'CRO', 'OFFER'].includes(l.lever_id));
  const untestedLevers = keyLevers.filter((l) => l.state === 'AVAILABLE' || l.state === 'UNEXPLORED');

  if (untestedLevers.length > 0 && knownPathToTarget.status !== 'NO_KNOWN_PATH') {
    return { decision: 'OPTIMIZE_CURRENT', reason: `${untestedLevers.length} alavanca(s) da arquitetura atual ainda não testada(s) (${untestedLevers.map((l) => l.lever_id).join(', ')}), e os cenários já modelados ainda mostram caminho plausível dentro da arquitetura atual.` };
  }
  if (untestedLevers.length > 0 && knownPathToTarget.status === 'NO_KNOWN_PATH') {
    return { decision: 'TEST_VARIANT', reason: `${untestedLevers.length} alavanca(s) da arquitetura atual ainda não testada(s) (${untestedLevers.map((l) => l.lever_id).join(', ')}), mas mesmo otimizadas ao máximo os cenários já modelados não fecham o gap sozinhos — testar variantes rápidas antes de justificar reconstrução total.` };
  }
  if (untestedLevers.length === 0 && knownPathToTarget.status === 'NO_KNOWN_PATH') {
    return { decision: 'TEST_NEW_ARCHITECTURE', reason: 'alavancas conhecidas da arquitetura atual já exploradas e o gap continua sem caminho conhecido — justifica testar uma arquitetura estruturalmente diferente.' };
  }
  return { decision: 'INSUFFICIENT_EVIDENCE', reason: 'combinação de sinais não permite uma decisão defensável ainda.' };
}

// item 66 — amplitude de busca. NO_KNOWN_PATH + gap grande aumenta amplitude (item 65) — nunca
// aumenta certeza de que o funil atual está errado.
function computeSearchBreadth({ knownPathToTarget, financialRoas, targetRoas, hypothesisSpaceStatus }) {
  if (!knownPathToTarget || knownPathToTarget.status === 'UNKNOWN' || financialRoas == null || targetRoas == null) {
    return { breadth: 'MODERATE', reason: 'dados insuficientes pra calibrar amplitude — MODERATE por padrão conservador.' };
  }
  if (knownPathToTarget.status === 'YES') return { breadth: 'NARROW', reason: 'já existe caminho conhecido pro target — não há necessidade de busca ampla.' };

  const gapRatio = financialRoas > 0 ? targetRoas / financialRoas : Infinity;
  if (knownPathToTarget.status === 'NO_KNOWN_PATH' && ['NEAR_EXHAUSTED', 'EXHAUSTED'].includes(hypothesisSpaceStatus.status)) {
    return { breadth: 'RADICAL', reason: `NO_KNOWN_PATH e alavancas conhecidas já bem exploradas (${hypothesisSpaceStatus.status}) sem resultado — justifica busca radical.` };
  }
  if (knownPathToTarget.status === 'NO_KNOWN_PATH' && gapRatio >= 3) {
    return { breadth: 'BROAD', reason: `NO_KNOWN_PATH e gap de ROAS de ${gapRatio.toFixed(1)}x — amplia a busca (item 65), sem concluir que a arquitetura atual está errada.` };
  }
  return { breadth: 'MODERATE', reason: `known_path_to_target=${knownPathToTarget.status}, gap de ${gapRatio.toFixed(1)}x — amplitude moderada.` };
}

/**
 * computeSearchDepth() — item 67, recalibrado no PASSO 12.1 item 8. search_depth = nível de
 * mudança ESTRUTURAL REALMENTE EXPLORADO pelos challengers gerados (distância real deles) —
 * nunca derivado só da decisão preliminar optimization_vs_rearchitecture, que pode divergir do
 * que os challengers realmente propõem (a inconsistência que o item 8 flagrou).
 */
function computeSearchDepth(challengerDistances = []) {
  if (challengerDistances.length === 0) return { depth: 'INCREMENTAL', reason: 'nenhum challenger gerado — nenhuma mudança estrutural explorada.' };
  if (challengerDistances.includes('RADICAL')) return { depth: 'BUSINESS_MODEL', reason: 'ao menos um challenger com distância RADICAL — muda o modelo de negócio, não só a execução.' };
  if (challengerDistances.some((d) => d === 'MEDIUM' || d === 'HIGH')) return { depth: 'STRUCTURAL', reason: `challengers gerados envolvem mudança estrutural real (distância MEDIUM/HIGH: ${challengerDistances.join(', ')}), não apenas incrementos na arquitetura atual.` };
  return { depth: 'INCREMENTAL', reason: 'todos os challengers gerados são variações de baixa distância (LOW) da arquitetura atual.' };
}

// item 7 — optimization_vs_rearchitecture FINAL, reconciliado com o vencedor real do ranking.
// A decisão preliminar (evaluateOptimizationVsRearchitecture, usada só pra calibrar
// search_breadth ANTES de gerar challengers) nunca deve ser reportada como resultado final se
// contradisser o que o ranking realmente escolheu — recommendation_type é sempre derivado desta
// versão reconciliada, nunca computado de forma independente (item 7: nunca podem se contradizer).
function reconcileOptimizationVsRearchitecture({ winner, preliminaryDecision }) {
  if (winner.is_current) {
    return { decision: preliminaryDecision === 'TEST_VARIANT' ? 'TEST_VARIANT' : 'OPTIMIZE_CURRENT', reason: 'o vencedor real do ranking é a própria arquitetura atual.' };
  }
  if (winner.distance === 'LOW') return { decision: 'TEST_VARIANT', reason: `vencedor (${winner.architecture_id}) é uma variação de baixa distância (LOW) da arquitetura atual — mesma família/estrutura, mudança pequena.` };
  if (winner.distance === 'MEDIUM' || winner.distance === 'HIGH') return { decision: 'TEST_NEW_ARCHITECTURE', reason: `vencedor (${winner.architecture_id}) muda de família/estrutura (distance=${winner.distance}) em relação à arquitetura atual — TEST_NEW_ARCHITECTURE, nunca TEST_VARIANT (item 7).` };
  return { decision: 'REBUILD_ARCHITECTURE', reason: `vencedor (${winner.architecture_id}) tem distância RADICAL — reconstrução profunda, não uma variante.` };
}

module.exports = { evaluateChallengeCurrentStrategy, evaluateOptimizationVsRearchitecture, computeSearchBreadth, computeSearchDepth, reconcileOptimizationVsRearchitecture };
