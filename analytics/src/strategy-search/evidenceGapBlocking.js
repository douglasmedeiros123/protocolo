'use strict';

// PASSO 12.3 — nem todo gap de evidência bloqueia o teste. "Seria melhor saber" NUNCA é
// suficiente sozinho — um gap só bloqueia quando torna o Minimum Viable Architecture Test
// INVALID, UNINTERPRETABLE ou UNIMPLEMENTABLE sem ele.
const EVIDENCE_GAP_BLOCKING_CLASSIFICATIONS = [
  'BLOCKING_PREREQUISITE_EVIDENCE',   // torna o teste inválido/ininterpretável/inimplementável sem ele
  'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP', // melhora qualidade/confiança, mas o teste continua válido sem ele
  'EVIDENCE_OBJECTIVE',               // é o próprio resultado que o teste vai produzir — nunca bloqueia a si mesmo
  'UNKNOWN_THAT_REDUCES_CONFIDENCE',  // gap não catalogado — reduz confiança, nunca bloqueia sem rationale explícito
];

// item 1 — auditoria explícita: MARKET_EVIDENCE_GAP (sofisticação/consciência de mercado) e
// CUSTOMER_EVIDENCE_GAP (perguntas de qualificação ideais) melhoram QUALIDADE da mensagem/
// implementação, mas NÃO impedem escrever e medir um teste válido usando o melhor entendimento
// atual (GENERAL_MARKETING_KNOWLEDGE + o que já se sabe do produto) — um advertorial ou quiz
// "com o entendimento de hoje" ainda produz um resultado real e interpretável. Documentado por
// tipo de gap, nunca escolhido caso a caso.
const GAP_TYPE_BLOCKING_DEFAULT = {
  MARKET_EVIDENCE_GAP: {
    classification: 'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP',
    blocking: false,
    blocking_rationale: null,
    reason: 'sofisticação/consciência de mercado melhora a qualidade da mensagem do advertorial, mas não torna o teste inválido/ininterpretável/inimplementável sem ela — dá pra escrever e medir com o entendimento atual (item 1-2).',
  },
  CUSTOMER_EVIDENCE_GAP: {
    classification: 'NON_BLOCKING_STRATEGIC_EVIDENCE_GAP',
    blocking: false,
    blocking_rationale: null,
    reason: 'perguntas de qualificação ideais melhoram a precisão do quiz/application, mas um conjunto plausível (conhecimento geral) ainda permite implementar e medir um teste interpretável.',
  },
};

/**
 * classifyEvidenceGapBlocking() — item 2. Um gap só vira BLOCKING_PREREQUISITE_EVIDENCE com
 * rationale explícito de por que o teste seria INVALID/UNINTERPRETABLE/UNIMPLEMENTABLE sem ele —
 * nunca por suposição. Gaps não catalogados nunca bloqueiam por padrão (UNKNOWN_THAT_REDUCES_
 * CONFIDENCE, item 2: ausência de rationale explícito nunca vira bloqueio).
 */
function classifyEvidenceGapBlocking(gap) {
  const known = GAP_TYPE_BLOCKING_DEFAULT[gap.type];
  if (known) return { ...known, gap_type: gap.type };
  return {
    classification: 'UNKNOWN_THAT_REDUCES_CONFIDENCE',
    blocking: false,
    blocking_rationale: null,
    reason: 'tipo de gap não catalogado — sem rationale explícito de bloqueio, nunca bloqueia por padrão (item 2).',
    gap_type: gap.type,
  };
}

module.exports = { classifyEvidenceGapBlocking, EVIDENCE_GAP_BLOCKING_CLASSIFICATIONS, GAP_TYPE_BLOCKING_DEFAULT };
