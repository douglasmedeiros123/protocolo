'use strict';

const { compareByTieBreak, explainFactorWin, TIE_BREAK_FACTOR_ORDER } = require('./comparisonAndRanking');

// PASSO 12.1, item 2 — confidence NÃO É posição no ranking. #1 pode ter LOW confidence.
// STRONG_EVIDENCE_TYPES são os únicos que sustentam MEDIUM/HIGH — STRUCTURAL_EXISTENCE_EVIDENCE/
// HYPOTHESIS/GENERAL_MARKETING_KNOWLEDGE/INFERENCE NUNCA sustentam mais que LOW sozinhos (item 2:
// "MISSING_MONETIZATION_LAYER" é gatilho de hipótese, não prova de que vai performar melhor).
const STRONG_EVIDENCE_TYPES = ['PERFORMANCE_EVIDENCE', 'VALIDATED_LEARNING'];
const WEAK_EVIDENCE_TYPES = ['STRUCTURAL_EXISTENCE_EVIDENCE', 'HYPOTHESIS', 'GENERAL_MARKETING_KNOWLEDGE', 'INFERENCE'];

/**
 * computeRecommendationConfidence() — item 32/33 (PASSO 12) + item 2 (PASSO 12.1). Avalia a
 * PROFUNDIDADE real da evidência do vencedor — número de experimentos concluídos, presença de
 * VALIDATED_LEARNING/PERFORMANCE_EVIDENCE, unknowns, dependência de conhecimento geral — nunca
 * qual fator do ranking decidiu (isso é ranking position, não confidence, item 2).
 */
function computeRecommendationConfidence({ ranking, hasCompletedComparativeExperiment }) {
  const winner = ranking[0];
  const evidenceBasis = winner.evidence_basis || [];
  const hasStrongEvidence = evidenceBasis.some((e) => STRONG_EVIDENCE_TYPES.includes(e.type));
  const onlyWeakEvidence = evidenceBasis.length > 0 && evidenceBasis.every((e) => WEAK_EVIDENCE_TYPES.includes(e.type) || e.type === 'OBSERVED_EVIDENCE' || e.type === 'PRODUCT_SPECIFIC_EVIDENCE');

  if (hasCompletedComparativeExperiment && hasStrongEvidence) {
    return { confidence: 'HIGH', basis: 'existe experimento real concluído comparando arquiteturas, com resultado de performance real (PERFORMANCE_EVIDENCE/VALIDATED_LEARNING) sustentando o vencedor.' };
  }
  if (hasStrongEvidence) {
    return { confidence: 'MEDIUM', basis: 'evidência de performance real (PERFORMANCE_EVIDENCE/VALIDATED_LEARNING) existe, mas sem experimento comparativo formal concluído entre TODAS as alternativas — nunca HIGH sem isso.' };
  }
  if (winner.is_current) {
    return { confidence: 'LOW', basis: 'a arquitetura atual tem evidência OPERACIONAL real (OBSERVED_EVIDENCE: receita/funil observados), mas nenhuma evidência COMPARATIVA estabelecendo que é a melhor opção — nunca MEDIUM só por estar rodando (item 4).' };
  }
  if (onlyWeakEvidence) {
    return { confidence: 'LOW', basis: `a base do vencedor é só ${[...new Set(evidenceBasis.map((e) => e.type))].join('/')} — existência estrutural + hipótese/mecanismo, nunca evidência de performance real. Nunca MEDIUM/HIGH só por vencer um fator de ranking de alta prioridade (item 2).` };
  }
  if (evidenceBasis.length === 0) {
    return { confidence: 'VERY_LOW', basis: 'nenhuma base de evidência registrada pro vencedor.' };
  }
  return { confidence: 'LOW', basis: 'best currently supported hypothesis (item 5) — evidência mista, sem performance real ainda.' };
}

// item 34/59/7 — recommendation_type é SEMPRE derivado do optimization_vs_rearchitecture
// RECONCILIADO (challengeAndBreadth.js's reconcileOptimizationVsRearchitecture) — nunca computado
// de forma independente, pra nunca poder contradizer o item reportado ao lado dele (PASSO 12.1 item 7).
const RECOMMENDATION_TYPE_BY_RECONCILED_DECISION = {
  OPTIMIZE_CURRENT: 'KEEP_AND_OPTIMIZE',
  TEST_VARIANT: 'TEST_INCREMENTAL_VARIANT',
  TEST_NEW_ARCHITECTURE: 'TEST_ALTERNATIVE_ARCHITECTURE',
  REBUILD_ARCHITECTURE: 'REBUILD_RECOMMENDED',
};
function deriveRecommendationType(reconciledDecision) {
  return RECOMMENDATION_TYPE_BY_RECONCILED_DECISION[reconciledDecision] || 'TEST_ALTERNATIVE_ARCHITECTURE';
}

// item 88 — regret_if_wrong: reversibilidade real do vencedor, nunca um valor à parte.
function computeRegretIfWrong(winner) {
  if (winner.is_current) return { regret_if_wrong: 'LOW', basis: 'manter a arquitetura atual não introduz risco novo.' };
  const map = { REVERSIBLE: 'LOW', PARTIALLY_REVERSIBLE: 'MEDIUM', HARD_TO_REVERSE: 'HIGH' };
  return { regret_if_wrong: map[winner.reversibility] || 'UNKNOWN', basis: `derivado da reversibilidade real (${winner.reversibility}).` };
}

// item 89 — assimetria de decisão, qualitativa (sem valores inventados).
function computeDecisionAsymmetry(winner) {
  if (winner.is_current) {
    return { upside_if_right: 'baixo — já é o estado atual, não há ganho incremental de "confirmar" o que já roda.', downside_if_wrong: 'oportunidade perdida de testar uma alavanca que poderia fechar parte do gap econômico.' };
  }
  const upsideMap = { LOW: 'incremental — mudança pequena, ganho esperado proporcional.', MEDIUM: 'moderado — pode mover uma métrica-chave de forma perceptível.', HIGH: 'alto — pode reabrir um caminho pro ROAS 3 hoje classificado NO_KNOWN_PATH.', RADICAL: 'alto — mesma lógica de HIGH, com mais amplitude estrutural.' };
  const downsideMap = { LOW: 'baixo — reversível, custo de aprendizado limitado se falhar.', MEDIUM: 'moderado — parcialmente reversível.', HIGH: 'alto — difícil de reverter, custo real se a hipótese estiver errada.', RADICAL: 'alto — mesma lógica de HIGH.' };
  return { upside_if_right: upsideMap[winner.distance] || 'UNKNOWN', downside_if_wrong: downsideMap[winner.distance] || 'UNKNOWN' };
}

// item 10 — WHY_THIS precisa de rationale ESTRATÉGICO substantivo (qual problema resolve, por
// que testar agora, mecanismo econômico, por que o teste gera informação útil) — o fator técnico
// do ranking entra só como detalhe de apoio, nunca como a explicação inteira.
function buildWhyThis(winner, knownPathToTarget) {
  if (winner.is_current) {
    return `a arquitetura atual segue rodando: tem evidência operacional real (compradores/receita reais), e nenhum challenger hoje tem evidência forte o bastante pra justificar substituí-la — mudar agora teria custo real sem base defensável mais forte. (Vantagem técnica: ${winner.final_rank_reason})`;
  }
  const problem = winner.why_generated ? JSON.stringify(winner.why_generated.ref) : 'gap estrutural observado';
  return `resolve ${problem}. Hipótese: ${winner.architecture_hypothesis} Mecanismo econômico esperado: ${winner.expected_economic_mechanism}. Vale testar agora porque ${knownPathToTarget && knownPathToTarget.status === 'NO_KNOWN_PATH' ? 'as alavancas já conhecidas da arquitetura atual não fecham o gap sozinhas — este teste produz uma informação que hoje não temos' : 'é a hipótese com melhor base defensável disponível hoje'}. (Vantagem técnica no ranking: ${winner.final_rank_reason})`;
}

// item 11 — WHY_NOT precisa de rationale substantivo (não só "perdeu no fator X") — deriva das
// propriedades REAIS do perdedor (distância, evidência, mecanismo) comparadas ao vencedor.
function buildWhyNot(winner, loser) {
  const factor = explainFactorWin(winner, loser);
  const parts = [];
  if (loser.is_current) {
    parts.push('tem evidência operacional real (receita/funil observados), mas nenhuma evidência comparativa estabelecendo que é superior ao vencedor.');
  } else if (loser.architecture_hypothesis) {
    parts.push(`${loser.architecture_id} propõe: ${loser.architecture_hypothesis}`);
  }
  if (loser.distance && winner.distance && loser.distance !== winner.distance) {
    const distanceRank = { LOW: 0, MEDIUM: 1, HIGH: 2, RADICAL: 3 };
    if (distanceRank[loser.distance] > distanceRank[winner.distance]) parts.push('exige uma mudança estrutural maior que o vencedor, com mais componentes novos e menos clareza causal sobre o que realmente moveu o resultado.');
  }
  const loserHasEvidence = (loser.evidence_basis || []).some((e) => ['PRODUCT_SPECIFIC_EVIDENCE', 'STRUCTURAL_EXISTENCE_EVIDENCE', 'OBSERVED_EVIDENCE'].includes(e.type));
  if (!loserHasEvidence) parts.push('não temos hoje evidência real específica do produto que sustente esse mecanismo como o gargalo dominante.');
  parts.push(`perde no fator técnico: ${factor}.`);
  return parts.join(' ');
}

/**
 * formRecommendation() — items 3-6/34-37/85-90 (PASSO 12), recalibrado no PASSO 12.1 (items
 * 2/7/10-12). O CORAÇÃO do "opinionated intelligence": sempre forma uma posição quando há base
 * defensável de ranking (item 3), mesmo com confidence baixa (item 5). Só retorna
 * NO_DEFENSIBLE_PREFERENCE quando o topo do ranking é um empate real em TODOS os 14 fatores
 * (item 6) — e mesmo assim recomenda que evidência coletar pra desempatar.
 */
function formRecommendation({ ranking, reconciledDecision, hasCompletedComparativeExperiment, fallbackId, counterfactual, preMortem, knownPathToTarget }) {
  const winner = ranking[0];
  const runnerUp = ranking[1];

  // item 6 — verdadeira incomparabilidade: só quando o TOPO do ranking empata em tudo.
  const trueIncomparability = runnerUp != null && compareByTieBreak(winner, runnerUp) === 0;
  if (trueIncomparability) {
    return {
      recommendation_type: 'NO_DEFENSIBLE_PREFERENCE',
      recommended_architecture_id: null,
      confidence: 'VERY_LOW',
      why_this_architecture: null,
      why_not_current: null,
      why_not_alternatives: null,
      evidence_supporting: [],
      evidence_against: [],
      unknowns: [`${winner.architecture_id} e ${runnerUp.architecture_id} empatam em todos os 14 fatores de comparação — nenhuma base defensável pra diferenciar hoje.`],
      what_would_break_the_tie: [`o primeiro sinal real (product_specific_evidence ou experimento concluído) que diferencie ${winner.architecture_id} de ${runnerUp.architecture_id} em qualquer um dos 14 fatores.`],
      fallback_architecture_id: fallbackId,
      counterfactual, pre_mortem: preMortem,
      regret_if_wrong: 'UNKNOWN', upside_if_right: 'UNKNOWN', downside_if_wrong: 'UNKNOWN',
      what_would_change_my_mind: [`resultado real de um teste barato que quebre o empate entre ${winner.architecture_id} e ${runnerUp.architecture_id}.`],
    };
  }

  const { confidence, basis: confidenceBasis } = computeRecommendationConfidence({ ranking, hasCompletedComparativeExperiment });
  const recommendationType = deriveRecommendationType(reconciledDecision);
  const regret = computeRegretIfWrong(winner);
  const asymmetry = computeDecisionAsymmetry(winner);

  // item 11 — why_not_current já cobre a arquitetura atual separadamente; evita duplicar a
  // mesma explicação em why_not_alternatives.
  const whyNotAlternatives = ranking.slice(1).filter((r) => !r.is_current).map((r) => ({ architecture_id: r.architecture_id, why_not: buildWhyNot(winner, r) }));

  const evidenceSupporting = (winner.evidence_basis || []).filter((e) => ['PRODUCT_SPECIFIC_EVIDENCE', 'STRUCTURAL_EXISTENCE_EVIDENCE', 'OBSERVED_EVIDENCE', 'VALIDATED_LEARNING', 'PERFORMANCE_EVIDENCE'].includes(e.type));
  const evidenceAgainst = (winner.risks || []);

  return {
    recommendation_type: recommendationType,
    recommended_architecture_id: winner.architecture_id,
    confidence,
    confidence_basis: confidenceBasis,
    why_this_architecture: buildWhyThis(winner, knownPathToTarget),
    why_not_current: winner.is_current ? null : buildWhyNot(winner, ranking.find((r) => r.is_current)),
    why_not_alternatives: whyNotAlternatives,
    evidence_supporting: evidenceSupporting,
    evidence_against: evidenceAgainst,
    unknowns: winner.unknowns || [],
    what_would_change_my_mind: [ // item 86 — obrigatório, sempre falsificável (item 87: sem ego, sem defender decisão anterior)
      'resultado real (SUCCESS/FAILURE/INCONCLUSIVE) do MVA test desta recomendação.',
      'novo diagnóstico estrutural real (CRO/Offer/Creative) que mude o ranking dos 14 fatores.',
      winner.is_current ? 'um challenger passando a ter evidência product-specific real que hoje não existe.' : 'evidência de que a arquitetura atual, se testada de novo, teria performado melhor do que o histórico sugere.',
    ],
    fallback_architecture_id: fallbackId,
    counterfactual,
    pre_mortem: preMortem,
    regret_if_wrong: regret.regret_if_wrong,
    regret_basis: regret.basis,
    upside_if_right: asymmetry.upside_if_right,
    downside_if_wrong: asymmetry.downside_if_wrong,
  };
}

module.exports = { formRecommendation, computeRecommendationConfidence, deriveRecommendationType, computeRegretIfWrong, computeDecisionAsymmetry, buildWhyThis, buildWhyNot, STRONG_EVIDENCE_TYPES, WEAK_EVIDENCE_TYPES };
