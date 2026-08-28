'use strict';

// MESSAGE CLASSIFICATION (PASSO 8, item 4). MESSAGE_COMPONENTS são as PARTES estruturais do
// criativo; CLASSIFICATION_TAGS são o(s) ângulo(s) de mensagem que o criativo usa — um criativo
// pode ter várias tags, mas SEMPRE precisa de uma `primary` (a mais evidenciada). Sem DNA
// suficiente pra decidir, primary fica null — nunca escolhemos uma tag arbitrária.
const MESSAGE_COMPONENTS = ['HOOK', 'BODY', 'PROOF', 'CTA'];

const CLASSIFICATION_TAGS = [
  'pain_led', 'desire_led', 'mechanism_led', 'proof_led', 'objection_led',
  'curiosity_led', 'comparison_led', 'story_led',
];

/**
 * Deriva tags de classificação a partir do que o DNA já sabe (nunca inventa): cada campo
 * preenchido no DNA sugere uma tag correspondente. Com DNA vazio (caso comum pra ativos reais
 * ainda sem conteúdo textual coletado), retorna tags:[] e primary:null — honesto, não "chuta".
 */
function classifyCreativeMessage(dna = {}) {
  const tags = [];
  if (dna.pain) tags.push('pain_led');
  if (dna.desire) tags.push('desire_led');
  if (dna.mechanism) tags.push('mechanism_led');
  if (dna.proof) tags.push('proof_led');
  if (dna.objection) tags.push('objection_led');
  if (dna.hook && /curios/i.test(String(dna.hook))) tags.push('curiosity_led');

  return {
    tags,
    // primary = a primeira tag identificada, na ordem de prioridade documentada acima
    // (pain > desire > mechanism > proof > objection > curiosity) — critério determinístico,
    // não "qual parece mais forte" subjetivamente. null se nada foi identificado.
    primary: tags[0] || null,
  };
}

module.exports = { MESSAGE_COMPONENTS, CLASSIFICATION_TAGS, classifyCreativeMessage };
