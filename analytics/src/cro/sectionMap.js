'use strict';

// PAGE SECTION MAP (PASSO 9, item 6) — nomeia semanticamente cada seção real extraída via
// palavras-chave no heading (regex, documentado) — NUNCA força a estrutura-exemplo (HERO/
// PROBLEM/MECHANISM/...) se a página real for diferente. Seção sem heading OU sem keyword
// reconhecida vira UNRECOGNIZED_SECTION (nunca inventa um nome pra ela).
const SEMANTIC_KEYWORDS = [
  [/antes e depois/i, 'BEFORE_AFTER_PROOF'],
  [/acontece na sua cabe[çc]a/i, 'PAIN'],
  [/n[ãa]o [ée] falta de|mensagem certa/i, 'REFRAME_MECHANISM_INTRO'],
  [/passos simples|leva menos de/i, 'MECHANISM_STEPS'],
  [/empacotado|tudo o que/i, 'OFFER_STACK'],
  [/para quem serve/i, 'ICP_QUALIFICATION'],
  [/recapitulando|valor de tudo/i, 'VALUE_RECAP'],
  [/somente a verdade|quantas vendas/i, 'URGENCY_OBJECTION'],
  [/cheio de conversas paradas|vale dinheiro real/i, 'FINAL_CTA'],
  [/perguntas frequentes|faq/i, 'FAQ'],
];

function classifySection(section, allSections) {
  if (section.id === 'oferta' && section.price_mentions.some((p) => /67|8,63/.test(p))) return 'PRICE_OFFER';
  if (section.id === 'oferta') return 'VALUE_RECAP';
  // H1 é o sinal estrutural mais forte de HERO (independe de qual palavra o texto usa) — checado
  // antes de qualquer keyword de texto, pra nunca confundir uma seção de meio de página que
  // reusa palavras parecidas ("destravar", "quero") com a hero de verdade.
  if (section.heading_level === 'H1') return 'HERO';
  if (!section.heading_text) return section.cta_texts.length ? 'PRICE_OR_CTA_BLOCK' : 'UNRECOGNIZED_SECTION';

  for (const [regex, name] of SEMANTIC_KEYWORDS) {
    if (name && regex.test(section.heading_text)) return name;
  }
  // Heading curto, sem keyword reconhecida, mas com foto/bio ao redor (heurística de posição:
  // aparece depois do FAQ/oferta e antes do FINAL_CTA na maioria das LPs de infoproduto) — ainda
  // assim não afirmamos "AUTHORITY" sem sinal textual; se o heading for só um nome próprio curto
  // (2-3 palavras, sem verbo reconhecível), classificamos como AUTHORITY_CANDIDATE (hipótese, não fato).
  if (section.heading_text.split(' ').length <= 3 && !/\d/.test(section.heading_text)) {
    return 'AUTHORITY_CANDIDATE';
  }
  return 'UNRECOGNIZED_SECTION';
}

/**
 * Constrói o mapa de seções na ORDEM REAL da página (nunca reordena, nunca força a estrutura
 * conceitual do exemplo do PASSO 9 se a LP real for diferente).
 */
function buildSectionMap(parsedSections) {
  return parsedSections.map((s) => ({
    order: s.order,
    id: s.id,
    heading_text: s.heading_text,
    semantic_name: classifySection(s, parsedSections),
    has_cta: s.cta_texts.length > 0,
    cta_texts: s.cta_texts.map((c) => c.text),
    mentions_price: s.price_mentions.length > 0,
    mentions_guarantee: s.guarantee_mentioned,
  }));
}

module.exports = { buildSectionMap, classifySection, SEMANTIC_KEYWORDS };
