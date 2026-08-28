'use strict';

const CREATIVE_FORMATS = ['STATIC', 'VIDEO', 'UGC', 'CAROUSEL', 'SCREENSHOT', 'NOTIFICATION', 'CHAT', 'TEXT', 'OTHER'];

function isValidCreativeFormat(value) {
  return CREATIVE_FORMATS.includes(value);
}

// Palavras-chave conservadoras extraídas do ad_name real (Meta) — NUNCA viram o campo
// `dna.format` diretamente (isso exigiria evidência de conteúdo real, não um chute a partir do
// rótulo). Ficam num campo separado (`format_hint`) com proveniência explícita, pra nunca serem
// confundidas com um dado verificado.
const NAME_KEYWORD_HINTS = [
  [/carrossel/i, 'CAROUSEL'],
  [/print/i, 'SCREENSHOT'],
  [/chat|whatsapp/i, 'CHAT'],
  [/notifica/i, 'NOTIFICATION'],
  [/video|vídeo/i, 'VIDEO'],
];

function inferFormatHintFromName(adName) {
  if (!adName) return { format_hint: null, source: 'no_name', confidence: 'none' };
  for (const [regex, format] of NAME_KEYWORD_HINTS) {
    if (regex.test(adName)) {
      return { format_hint: format, source: 'inferred_from_ad_name', confidence: 'low', note: `Palavra-chave no ad_name sugere ${format} — NÃO verificado contra o conteúdo real do criativo.` };
    }
  }
  return { format_hint: null, source: 'inferred_from_ad_name', confidence: 'none', note: 'Nenhuma palavra-chave reconhecida no ad_name.' };
}

module.exports = { CREATIVE_FORMATS, isValidCreativeFormat, inferFormatHintFromName };
