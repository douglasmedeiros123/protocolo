'use strict';

const { minimumEvidenceFor } = require('../experiments/evidence');

let mvaCounter = 0;
function resetMvaCounter() { mvaCounter = 0; }

// item 40 — quando a mudança é isolável, single-variable; trocar a arquitetura inteira
// necessariamente muda múltiplas coisas de uma vez — nesse caso MULTI_COMPONENT_ARCHITECTURE_TEST
// e confiança causal reduzida (nunca escondido).
function classifyTestType(changedStageCount) {
  return changedStageCount <= 1 ? 'SINGLE_VARIABLE_TEST' : 'MULTI_COMPONENT_ARCHITECTURE_TEST';
}

/**
 * buildMinimumViableArchitectureTest() — items 38-39. "Qual é a MENOR implementação capaz de
 * testar a hipótese estrutural?" — preserva o máximo de componentes existentes possível (item
 * 39: preserved_components), muda só o necessário pra isolar a hipótese.
 */
function buildMinimumViableArchitectureTest({ productId, architecture, currentStageTypes }) {
  mvaCounter += 1;
  const changedComponents = architecture.stage_types.filter((t) => !currentStageTypes.includes(t));
  const preservedComponents = currentStageTypes.filter((t) => architecture.stage_types.includes(t));
  const testType = classifyTestType(changedComponents.length);

  let minimumEvidence = null;
  try { minimumEvidence = minimumEvidenceFor(architecture.primary_mechanism === 'INCREASE_AOV' ? 'OFFER' : 'CRO'); } catch { minimumEvidence = null; }

  return {
    test_id: `MVA-${productId}-${String(mvaCounter).padStart(3, '0')}`,
    architecture_id: architecture.architecture_id,
    hypothesis: architecture.architecture_hypothesis,
    minimum_changes: changedComponents,
    preserved_components: preservedComponents,
    changed_components: changedComponents,
    test_type: testType, // item 40
    primary_metric: architecture.primary_mechanism === 'INCREASE_AOV' ? 'net_aov' : 'lpv_to_checkout_rate',
    secondary_metrics: ['financial_roas', 'refund_rate'],
    required_tracking: changedComponents, // estágios novos exigem instrumentação nova
    minimum_evidence: minimumEvidence, // item 43 — NOT_ESTIMABLE implícito quando minimumEvidenceFor não tem spend definido pra categoria
    estimated_implementation_cost: 'NOT_ESTIMABLE', // item 43/20 — nunca inventado
    estimated_measurement_capital: 'NOT_ESTIMABLE', // item 43/44 — nunca assume R$1.000 (item 44)
    success_condition: `${architecture.primary_mechanism === 'INCREASE_AOV' ? 'net_aov' : 'lpv_to_checkout_rate'} melhora na direção esperada vs baseline da arquitetura atual, com amostra mínima atingida.`,
    failure_condition: 'métrica primária não melhora, ou piora, vs baseline, com amostra mínima atingida.',
    kill_condition: 'refund_rate sobe de forma desproporcional ao ganho observado, ou custo operacional (se houver dependência humana) inviabiliza o teste antes da amostra mínima.',
    redecision_condition: 'resultado (SUCCESS/FAILURE/INCONCLUSIVE) real disponível — reexecutar Strategy Search pra recalcular ranking/recomendação.',
    causal_confidence_note: testType === 'MULTI_COMPONENT_ARCHITECTURE_TEST'
      ? 'múltiplos componentes mudam ao mesmo tempo — confiança causal do resultado é reduzida (item 40), o teste informa "esta combinação funciona melhor?", não "esta variável específica causa o efeito".'
      : 'mudança isolada em 1 componente — confiança causal alta se o resultado for claro.',
  };
}

module.exports = { buildMinimumViableArchitectureTest, classifyTestType, resetMvaCounter };
