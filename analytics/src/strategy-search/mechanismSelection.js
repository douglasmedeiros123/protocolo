'use strict';

// PASSO 12.2, item 4 — COMPREHENSION_NEED != VSL_AUTOMATICAMENTE. Vários mecanismos conceituais
// cobrem "aumentar compreensão" — a escolha entre eles é feita por fatores defensáveis
// (implementação, fit com assets reais, tracking), nunca hardcoded. Cada opção mapeia pra um
// STAGE_TYPE real (strategy-search/enums.js) — DEMONSTRATION/OTHER ficam fora por não terem
// stage type dedicado hoje.
const COMPREHENSION_MECHANISM_OPTIONS = {
  VSL: { stage_type: 'VSL', implementation_note: 'exige produção de vídeo real — maior custo de implementação se não houver asset de vídeo já existente.' },
  ADVERTORIAL: { stage_type: 'ADVERTORIAL', implementation_note: 'formato editorial/texto — menor complexidade de implementação, não exige produção de vídeo.' },
  QUIZ: { stage_type: 'QUIZ', implementation_note: 'exige lógica de interação/ramificação — complexidade técnica maior que texto estático.' },
  CONTENT: { stage_type: 'CONTENT', implementation_note: 'conteúdo educativo genérico antes da oferta — baixa complexidade, mas menos direcionado que VSL/advertorial.' },
};

/**
 * selectComprehensionMechanism() — item 4. NUNCA retorna VSL por padrão sem uma razão real —
 * exige um sinal real (existência confirmada de asset de vídeo, via Creative real) pra escolher
 * VSL especificamente. Sem esse sinal (ABSENT ou UNKNOWN — nunca invertido em "assume que sim"),
 * prefere o mecanismo de MENOR complexidade de implementação (ADVERTORIAL) — decisão documentada,
 * não uma preferência estética.
 */
function selectComprehensionMechanism({ videoFormatSignal } = {}) {
  if (videoFormatSignal === 'CONFIRMED') {
    return {
      family: 'VSL',
      stage_type: COMPREHENSION_MECHANISM_OPTIONS.VSL.stage_type,
      reason: 'existe(m) asset(s) de vídeo real(is) confirmado(s) (Creative Intelligence Agent) — reaproveitar o formato já disponível reduz custo de implementação e mantém fit com a arquitetura atual.',
    };
  }
  return {
    family: 'ADVERTORIAL',
    stage_type: COMPREHENSION_MECHANISM_OPTIONS.ADVERTORIAL.stage_type,
    reason: videoFormatSignal === 'ABSENT'
      ? 'nenhum asset de vídeo confirmado hoje — formato editorial/texto (ADVERTORIAL) cobre o mesmo mecanismo de compreensão com menor complexidade de implementação, sem exigir produção de vídeo do zero.'
      : 'sinal de formato de vídeo inconclusivo (nenhum asset criativo real confirma formato de vídeo hoje) — por padrão conservador, prefere o mecanismo de MENOR complexidade de implementação (ADVERTORIAL) até existir esse sinal real. VSL NUNCA é o padrão automático (item 4).',
  };
}

module.exports = { selectComprehensionMechanism, COMPREHENSION_MECHANISM_OPTIONS };
