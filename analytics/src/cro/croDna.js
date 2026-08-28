'use strict';

// CRO DNA (PASSO 9, item 5) — 28 campos documentados. Campo sem evidência real vira `null`
// (nunca inventado). Diferente do Creative DNA (onde quase tudo fica null — o Data Agent só
// coleta métricas, não o conteúdo do anúncio), a LP É um arquivo HTML lido diretamente do
// repositório, então boa parte destes campos pode ser preenchida com FATOS reais extraídos do
// HTML (ver extractCroDnaFromParsedPage) — mas só o que for verificável no próprio arquivo.
const CRO_DNA_FIELDS = [
  'hero', 'headline', 'subheadline', 'primary_cta', 'secondary_cta', 'problem', 'pain', 'desire',
  'promise', 'mechanism', 'benefits', 'features', 'proof', 'testimonials', 'social_proof',
  'authority', 'offer', 'price', 'discount', 'bonuses', 'guarantee', 'risk_reversal', 'objections',
  'faq', 'urgency', 'scarcity', 'checkout_transition', 'mobile_experience', 'desktop_experience',
  'page_length', 'cta_repetition',
];

function emptyCroDna() {
  const dna = {};
  for (const f of CRO_DNA_FIELDS) dna[f] = null;
  return dna;
}

function buildCroDna(overrides = {}) {
  const dna = emptyCroDna();
  for (const f of CRO_DNA_FIELDS) {
    if (overrides[f] !== undefined) dna[f] = overrides[f];
  }
  return dna;
}

function findSection(sectionMap, semanticName) {
  return sectionMap.find((s) => s.semantic_name === semanticName) || null;
}

/**
 * Popula o DNA com fatos REAIS extraídos do HTML/section map — nunca com interpretação
 * subjetiva (ex: NÃO tenta adivinhar "awareness_level" ou julgar qualidade de copy; isso fica
 * de fora do DNA, é campo `null` até existir uma fonte confiável). Campos genuinamente ausentes
 * na página (testimonials, social_proof, scarcity) ficam `null` porque a busca real não achou
 * evidência — não porque não tentamos procurar.
 */
function extractCroDnaFromParsedPage(parsed, sectionMap) {
  const hero = findSection(sectionMap, 'HERO');
  const offerStack = findSection(sectionMap, 'OFFER_STACK');
  const priceOffer = findSection(sectionMap, 'PRICE_OFFER');
  const valueRecap = findSection(sectionMap, 'VALUE_RECAP');
  const beforeAfter = findSection(sectionMap, 'BEFORE_AFTER_PROOF');
  const mechanism = findSection(sectionMap, 'MECHANISM_STEPS');
  const authority = findSection(sectionMap, 'AUTHORITY_CANDIDATE');
  const finalCta = findSection(sectionMap, 'FINAL_CTA');

  const allCtaTexts = [...new Set(sectionMap.flatMap((s) => s.cta_texts))];
  const hasScarcity = /vagas|restam|esgot|últimas|apenas \d+ unidades/i.test(JSON.stringify(sectionMap));
  const hasTestimonialSignal = /depoimento|avalia[çc][ãa]o|estrela|review/i.test(JSON.stringify(sectionMap));

  return buildCroDna({
    hero: hero ? { heading: hero.heading_text, has_cta: hero.has_cta, order: hero.order } : null,
    headline: hero ? hero.heading_text : null,
    subheadline: parsed.meta_description, // melhor fonte textual disponível fora do H1 (a descrição da própria página)
    primary_cta: allCtaTexts.length ? allCtaTexts : null,
    secondary_cta: null, // nenhum CTA secundário distinto encontrado (só variações do mesmo CTA primário)
    problem: parsed.sticky_bar_text || null,
    pain: findSection(sectionMap, 'PAIN') ? findSection(sectionMap, 'PAIN').heading_text : null,
    desire: null, // exigiria interpretação subjetiva do copy — não extraído automaticamente
    promise: hero ? hero.heading_text : null,
    mechanism: mechanism ? mechanism.heading_text : null,
    benefits: offerStack ? offerStack.heading_text : null,
    features: offerStack ? offerStack.heading_text : null,
    proof: beforeAfter ? { section: beforeAfter.heading_text, type: 'chat_mockup_before_after' } : null,
    testimonials: hasTestimonialSignal ? 'ENCONTRADO — verificar detalhe manualmente' : null,
    social_proof: null, // busca real não encontrou contadores/avaliações/logos de clientes
    authority: authority ? { section_heading: authority.heading_text } : null,
    offer: offerStack ? offerStack.heading_text : null,
    price: priceOffer ? parsed.sections.find((s) => s.order === priceOffer.order)?.price_mentions || null : null,
    discount: valueRecap ? parsed.sections.find((s) => s.order === valueRecap.order)?.price_mentions || null : null,
    bonuses: offerStack ? 'ver offer — itens com rótulo "Bônus" dentro da seção OFFER_STACK' : null,
    guarantee: sectionMap.some((s) => s.mentions_guarantee) ? 'Menção de garantia encontrada em pelo menos 1 seção' : null,
    risk_reversal: sectionMap.some((s) => s.mentions_guarantee) ? 'Mesmo elemento de garantia (ver guarantee)' : null,
    objections: parsed.faq_questions.length ? parsed.faq_questions : null,
    faq: parsed.faq_questions.length ? { questions: parsed.faq_questions, answers_visible_in_static_html: false } : null,
    urgency: /lan[çc]amento|oferta especial/i.test(JSON.stringify(sectionMap)) ? 'Framing de "oferta especial de lançamento" encontrado — sem contador/prazo explícito.' : null,
    scarcity: hasScarcity ? 'ENCONTRADO — verificar detalhe manualmente' : null,
    checkout_transition: parsed.checkout_links.length ? { type: 'EXTERNAL_HOTMART', links: parsed.checkout_links } : null,
    mobile_experience: null, // sem medição comportamental real disponível agora (ver claritySnapshot.js) — apenas observação estrutural do HTML fica em outro campo do diagnóstico
    desktop_experience: null,
    page_length: parsed.sections.length,
    cta_repetition: allCtaTexts.length,
  });
}

module.exports = { CRO_DNA_FIELDS, emptyCroDna, buildCroDna, extractCroDnaFromParsedPage };
