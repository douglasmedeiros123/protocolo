'use strict';

// item 24 — separa GENERAL_MARKETING_KNOWLEDGE de PRODUCT_SPECIFIC_EVIDENCE, e INFERENCE de
// HYPOTHESIS de OBSERVED_EVIDENCE de VALIDATED_LEARNING. Usado por todo o módulo pra rotular
// cada afirmação com o tipo real de base que ela tem — nunca misturado.
function tagEvidence(items) {
  return items.map((item) => ({ ...item }));
}

// PASSO 12.1, item 3 — gatilhos que citam AUSÊNCIA/EXISTÊNCIA estrutural (ex.: "não existe
// upsell", "checkout abandonado X vezes") são STRUCTURAL_EXISTENCE_EVIDENCE — um FATO real, mas
// nunca prova de que a mudança proposta vai performar bem. PERFORMANCE_EVIDENCE só existe depois
// de um experimento real concluído (nunca presente aqui, item 3/9).
// PASSO 12.2, item 1 — "economic_gap+customer_journey" (o gatilho do VSL) também cita uma
// AUSÊNCIA estrutural (nenhum estágio de compreensão existe) — mesma disciplina do
// missing_monetization: gera hipótese, nunca é PRODUCT_SPECIFIC_EVIDENCE de que a mudança vai
// performar bem.
const STRUCTURAL_EXISTENCE_REASONS = ['missing_monetization', 'existing_signals', 'conversion_friction', 'economic_gap+customer_journey'];

/**
 * buildEvidenceBasisForChallenger() — monta evidence_basis[] de um challenger, classificando
 * cada item pelo tipo real: a citação ao diagnóstico real (why_generated.ref) é
 * STRUCTURAL_EXISTENCE_EVIDENCE quando cita um fato de ausência/presença (item 3 — "MISSING é
 * gatilho de hipótese, não prova de upside") ou PRODUCT_SPECIFIC_EVIDENCE nos demais casos
 * (economic_gap, strategic_diversification — não são sobre existência de um componente
 * específico); a descrição do padrão da biblioteca é GENERAL_MARKETING_KNOWLEDGE (conhecimento
 * geral, nunca vira evidência do produto); a hipótese estrutural em si é sempre HYPOTHESIS
 * (nunca afirma resultado, item 28). PERFORMANCE_EVIDENCE nunca é adicionado aqui — só entraria
 * via um experimento real concluído (item 3).
 */
function buildEvidenceBasisForChallenger(challenger) {
  const basis = [];
  const reason = challenger.why_generated && challenger.why_generated.reason;
  const isStructuralExistence = STRUCTURAL_EXISTENCE_REASONS.some((r) => reason === r || (typeof reason === 'string' && reason.includes(r)));
  basis.push({
    type: isStructuralExistence ? 'STRUCTURAL_EXISTENCE_EVIDENCE' : 'PRODUCT_SPECIFIC_EVIDENCE',
    statement: JSON.stringify(challenger.why_generated),
    source: 'diagnóstico real (Planner/CRO/Offer, read-only).',
    note: isStructuralExistence ? 'fato de existência/ausência — NUNCA prova de performance futura (item 3/9).' : null,
  });
  if (challenger.pattern_description) {
    basis.push({ type: 'GENERAL_MARKETING_KNOWLEDGE', statement: challenger.pattern_description, source: 'patternLibrary.js — conhecimento estrutural, nunca evidência do produto (item 24).' });
  }
  basis.push({ type: 'HYPOTHESIS', statement: challenger.architecture_hypothesis, source: 'gerado por challengerGenerator.js — nunca afirma resultado (item 28).' });
  return basis;
}

/**
 * buildEvidenceBasisForCurrent() — mesma disciplina pra arquitetura atual: o que sabemos dela é
 * OBSERVED_EVIDENCE (dados reais persistidos) — evidência OPERACIONAL (item 4: ela funciona
 * operacionalmente) — nunca VALIDATED_LEARNING/PERFORMANCE_EVIDENCE COMPARATIVA sem experimento
 * real concluído contra alternativa (isso exigiria hasCompletedExperiment=true).
 */
function buildEvidenceBasisForCurrent({ financialRoas, structuralFrictionSignals, hasCompletedExperiment }) {
  const basis = [
    { type: 'OBSERVED_EVIDENCE', statement: `financial ROAS real = ${financialRoas} — evidência OPERACIONAL (a arquitetura funciona e gera receita real), não evidência COMPARATIVA (não prova que é a melhor opção disponível, item 4).`, source: 'profit/aggregate.js + profit/financials.js.' },
  ];
  for (const s of structuralFrictionSignals) {
    basis.push({ type: s.causal_status === 'OBSERVED' ? 'OBSERVED_EVIDENCE' : 'HYPOTHESIS', statement: s.observation, source: `CRO diagnóstico real: ${s.diagnostic_id}.` });
  }
  if (hasCompletedExperiment) basis.push({ type: 'VALIDATED_LEARNING', statement: 'existe experimento real concluído comparando esta arquitetura contra alternativa.', source: 'experiments/registry.js.' });
  return basis;
}

module.exports = { tagEvidence, buildEvidenceBasisForChallenger, buildEvidenceBasisForCurrent };
