'use strict';

// PASSO 12.2, items 1-3 — challengers cujo gatilho é uma AUSÊNCIA estrutural (não existe estágio
// X / não existe camada de monetização Y). A ausência em si é STRUCTURAL_ABSENCE (fato real) —
// isso só GERA a hipótese de que aquilo é o gargalo (HYPOTHESIZED_BOTTLENECK), nunca prova.
const ABSENCE_BASED_RULE_IDS = ['MONETIZATION_LAYER', 'COMPREHENSION_BUILDING_STAGE'];

/**
 * classifyBottleneck() — item 1. Ladder STRUCTURAL_ABSENCE → HYPOTHESIZED_BOTTLENECK →
 * OBSERVED_BOTTLENECK → VALIDATED_BOTTLENECK. Hoje, sem nenhum sinal comportamental específico
 * (ex.: scroll-depth/tempo-na-seção correlacionado) nem experimento concluído, o teto real é
 * sempre HYPOTHESIZED_BOTTLENECK — nunca inflado sem essa evidência (item 3).
 */
function classifyBottleneck({ ruleId, hasObservedSignal = false, hasValidatedExperiment = false }) {
  if (!ABSENCE_BASED_RULE_IDS.includes(ruleId)) {
    return { classification: 'NOT_APPLICABLE', structural_absence: false, reason: 'este challenger não é gerado por uma ausência estrutural de componente — a escala STRUCTURAL_ABSENCE→BOTTLENECK não se aplica.' };
  }
  if (hasValidatedExperiment) {
    return { classification: 'VALIDATED_BOTTLENECK', structural_absence: true, reason: 'experimento real concluído confirma este gargalo especificamente.' };
  }
  if (hasObservedSignal) {
    return { classification: 'OBSERVED_BOTTLENECK', structural_absence: true, reason: 'sinal comportamental real específico (não só a ausência do componente) aponta pra este gargalo.' };
  }
  return {
    classification: 'HYPOTHESIZED_BOTTLENECK',
    structural_absence: true,
    reason: 'a ausência do componente é um FATO real (STRUCTURAL_ABSENCE) — isso só GERA a hipótese de que é o gargalo (item 1/2), nunca prova. Nenhum sinal comportamental específico observado ainda que eleve pra OBSERVED_BOTTLENECK.',
  };
}

module.exports = { classifyBottleneck, ABSENCE_BASED_RULE_IDS };
