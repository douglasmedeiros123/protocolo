'use strict';

// CREATIVE DNA (PASSO 8, item 3) — estrutura os elementos de conteúdo de um criativo. NUNCA
// inventa valor: todo campo sem evidência real fica `null` (o item pede UNKNOWN/null — usamos
// `null` uniformemente, é o "unknown" do sistema em todo o projeto, ver canonicalize()). Hoje o
// Data Agent só coleta MÉTRICAS de desempenho (Meta Ads) — não coleta o texto/imagem do
// criativo — então, pra ativos reais descobertos automaticamente, praticamente todo campo de
// DNA fica null exceto `dominant_message` (o próprio ad_name, um fato literal, não inferido).
const DNA_FIELDS = [
  'hook', 'angle', 'pain', 'desire', 'awareness_level', 'mechanism', 'promise', 'proof',
  'objection', 'cta', 'visual_style', 'format', 'layout', 'text_density', 'first_frame',
  'dominant_message', 'emotional_driver',
];

// Exemplos documentados de emotional_driver (item 3) — não é uma lista exaustiva/obrigatória,
// só o vocabulário sugerido; qualquer string é aceita, mas preferir esses valores mantém os
// dados comparáveis entre criativos.
const EMOTIONAL_DRIVER_EXAMPLES = ['fear', 'curiosity', 'loss_aversion', 'relief', 'urgency', 'identification', 'status', 'desire', 'proof'];

function emptyCreativeDNA() {
  const dna = {};
  for (const f of DNA_FIELDS) dna[f] = null;
  return dna;
}

/** Mescla overrides EXPLICITAMENTE informados sobre o DNA vazio — nunca preenche o que não veio. */
function buildCreativeDNA(overrides = {}) {
  const dna = emptyCreativeDNA();
  for (const f of DNA_FIELDS) {
    if (overrides[f] !== undefined) dna[f] = overrides[f];
  }
  return dna;
}

module.exports = { DNA_FIELDS, EMOTIONAL_DRIVER_EXAMPLES, emptyCreativeDNA, buildCreativeDNA };
