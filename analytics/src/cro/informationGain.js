'use strict';

// INFORMATION GAIN PER REAL (PASSO 9.1, item 7) — heurística DELIBERADAMENTE simples (não é um
// modelo bayesiano rigoroso, documentado como tal): quanto de redução de incerteza um método de
// validação compra por real gasto. Objetivo único: deixar visível que "aprender via
// STATIC_CODE_CHECK" é estruturalmente mais barato que "aprender via CONTROLLED_EXPERIMENT",
// nunca decidir sozinho qual candidato vence.
//
// CONFIDENCE_GAIN_BY_METHOD (0-100, fixo por método — não varia por candidato): quanto cada
// método reduz incerteza, na média, quando aplicável. CONTROLLED_EXPERIMENT ganha mais
// confiança (prova causal real), mas custa caro; métodos estáticos ganham menos confiança
// individualmente, mas custam ~0.
const CONFIDENCE_GAIN_BY_METHOD = {
  STATIC_CODE_CHECK: 40,
  FUNCTIONAL_TEST: 60,
  BEHAVIORAL_DATA: 50,
  CONTROLLED_EXPERIMENT: 90,
};

// Custo estimado em R$ de cada método — métodos estáticos/funcionais têm piso de R$1 (nunca
// dividimos por zero); CONTROLLED_EXPERIMENT usa o budget_estimate real do candidato.
const FIXED_VALIDATION_COST_REAIS = {
  STATIC_CODE_CHECK: 0,
  FUNCTIONAL_TEST: 0,
  BEHAVIORAL_DATA: 0,
};

function computeInformationGainPerReal(validationMethod, controlledExperimentCost) {
  const confidenceGain = CONFIDENCE_GAIN_BY_METHOD[validationMethod] ?? 0;
  const cost = validationMethod === 'CONTROLLED_EXPERIMENT'
    ? Math.max(controlledExperimentCost ?? 0, 1)
    : Math.max(FIXED_VALIDATION_COST_REAIS[validationMethod] ?? 0, 1); // piso R$1, nunca 0 no denominador
  return Math.round((confidenceGain / cost) * 1000) / 1000;
}

module.exports = { computeInformationGainPerReal, CONFIDENCE_GAIN_BY_METHOD, FIXED_VALIDATION_COST_REAIS };
