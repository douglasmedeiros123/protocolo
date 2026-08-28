'use strict';

// FÓRMULA (adaptação do RICE, documentada — nunca é opinião de IA no momento do cálculo,
// os 5 fatores são NÚMEROS informados na criação do experimento, o score é aritmética pura):
//
//   score = (impact_reais * confidence) / (cost_reais * speed_dias * risk)
//
//   impact_reais : lucro/prejuízo projetado (R$) do impactModel, no budget_limit do experimento
//                  — pode ser negativo (experimento que projeta piorar o lucro pontua baixo/negativo)
//   confidence   : 0.0–1.0, calculado por evidenceScore() abaixo a partir de sinais reais já
//                  observados (nunca um "acho que" solto — ver evidenceScore)
//   cost_reais   : budget_limit em R$ (mínimo 1, pra nunca dividir por zero)
//   speed_dias   : dias estimados até atingir minimum_evidence (mínimo 1)
//   risk         : 1 (baixo) a 5 (alto) — quanto o experimento pode dar errado de forma cara/
//                  irreversível; ver RISK_BY_CATEGORY abaixo (não é chute, é uma tabela fixa
//                  por categoria, documentada, a mesma pra todo experimento daquela categoria)
//
// Maior score = maior retorno potencial por real gasto e por dia de espera.

const RISK_BY_CATEGORY = {
  // Risco de dar errado de forma cara/irreversível NO CURTO PRAZO, 1 (baixo) a 5 (alto).
  CREATIVE: 1, // só troca de anúncio, pausa fácil, gasto pequeno de teste
  CRO: 1, // mudança na própria LP, reversível por commit/deploy, zero risco de mídia
  TRACKING: 2, // mexe em configuração de rastreamento — erro pode distorcer decisão futura, mas não gasta dinheiro extra
  OFFER: 2, // mudança de oferta/preço, reversível, mas pode afetar percepção de marca se malfeita
  AOV: 2, // mesma categoria de risco que OFFER (geralmente é a mesma alavanca)
  CHECKOUT: 3, // bug introduzido no checkout pode derrubar TODA a conversão, não só o teste
  MEDIA_BUYING: 3, // gasto de mídia real em jogo imediatamente, erro custa dinheiro rápido
};

/**
 * Confiança (0–1) a partir de EVIDÊNCIAS reais informadas (não da "opinião" de quem cria o
 * experimento) — cada evidência é um booleano objetivo, com peso fixo documentado.
 */
const EVIDENCE_WEIGHTS = {
  has_specific_measured_metric: 0.3, // a hipótese cita um número real medido (ex: Clarity, funil)
  has_funnel_gap_quantified: 0.3, // o gap de funil relevante já foi quantificado pelo Profit/Data Agent
  has_corroborating_independent_source: 0.2, // 2+ fontes independentes apontam a mesma direção
  has_prior_precedent_this_project: 0.2, // já foi observado um resultado parecido antes neste projeto
};

function evidenceScore(evidenceFlags = {}) {
  let score = 0;
  const applied = [];
  for (const [key, weight] of Object.entries(EVIDENCE_WEIGHTS)) {
    if (evidenceFlags[key]) { score += weight; applied.push(key); }
  }
  return { confidence: Math.min(1, score), applied_evidence: applied };
}

function riskForCategory(category) {
  return RISK_BY_CATEGORY[category] ?? 3; // categoria desconhecida = risco médio-alto por cautela
}

function computePriorityScore({ impactReais, confidence, costReais, speedDias, risk }) {
  const safeCost = Math.max(costReais, 1);
  const safeSpeed = Math.max(speedDias, 1);
  const safeRisk = Math.max(risk, 1);
  const score = (impactReais * confidence) / (safeCost * safeSpeed * safeRisk);
  return {
    score,
    factors: { impactReais, confidence, costReais: safeCost, speedDias: safeSpeed, risk: safeRisk },
    formula: 'score = (impact_reais * confidence) / (cost_reais * speed_dias * risk)',
  };
}

/**
 * Normaliza um lote de scores brutos pra escala 0–100 (min-max) — só pra LEITURA humana, o
 * score bruto (priority.score) continua existindo e é o que carrega o valor real. Min-max é
 * monotônico: nunca muda a ORDEM entre os experimentos, só a escala. Com 1 experimento só
 * (min==max), todos viram 100 (não há o que comparar).
 */
function normalizeScores(experiments) {
  const scores = experiments.map((e) => e.priority.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  return experiments.map((e) => ({
    ...e,
    priority: {
      ...e.priority,
      score_normalized_0_100: range === 0 ? 100 : Math.round(((e.priority.score - min) / range) * 100),
    },
  }));
}

module.exports = { computePriorityScore, evidenceScore, riskForCategory, normalizeScores, RISK_BY_CATEGORY, EVIDENCE_WEIGHTS };
