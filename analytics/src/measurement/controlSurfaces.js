'use strict';

// item 29-31 — classificação de superfície de controle por estágio real. Nunca presume controle
// sobre o checkout Hotmart (EXTERNAL, sempre) — nem sobre o conteúdo interno do container GTM
// (PARTIALLY_CONTROLLED: controlamos o loader, não o que está configurado dentro dele hoje).
const CONTROL_BY_STAGE_TYPE = {
  AD: 'EXTERNAL', // veiculação/algoritmo Meta não são nossos
  CONTENT: 'CONTROLLED', ADVERTORIAL: 'CONTROLLED', VSL: 'CONTROLLED', QUIZ: 'CONTROLLED',
  LEAD_CAPTURE: 'CONTROLLED', SALES_PAGE: 'CONTROLLED', PRODUCT_PAGE: 'CONTROLLED',
  CHECKOUT: 'EXTERNAL', // Hotmart hospeda e controla o checkout — nunca presumir controle (item 30)
  ORDER_BUMP: 'PARTIALLY_CONTROLLED', // oferta configurada por nós dentro da Hotmart, execução é da Hotmart
  BUNDLE: 'PARTIALLY_CONTROLLED', UPSELL: 'PARTIALLY_CONTROLLED', DOWNSELL: 'PARTIALLY_CONTROLLED',
  WHATSAPP: 'PARTIALLY_CONTROLLED', // mensagem é nossa, canal (WhatsApp/Meta) não é
  EMAIL: 'CONTROLLED', WEBINAR: 'PARTIALLY_CONTROLLED', APPLICATION: 'CONTROLLED',
  COMMUNITY: 'PARTIALLY_CONTROLLED', THANK_YOU: 'CONTROLLED', ACCESS: 'CONTROLLED',
  RETARGETING: 'EXTERNAL', OTHER: 'UNKNOWN',
};

function classifyControlSurface(stageType) {
  return CONTROL_BY_STAGE_TYPE[stageType] || 'UNKNOWN';
}

/**
 * buildControlSurfaces() — item 29-31. Pra cada estágio real (atual ou candidato), reporta a
 * classificação e se Clarity é tecnicamente instalável nele (CLARITY_CONTROLLABLE só faz
 * sentido em superfícies CONTROLLED — nunca em CHECKOUT externo).
 */
function buildControlSurfaces(stageTypes) {
  return stageTypes.map((t) => ({
    stage_type: t,
    control: classifyControlSurface(t),
    clarity_installable: classifyControlSurface(t) === 'CONTROLLED',
    note: t === 'CHECKOUT' ? 'Hotmart hospeda e controla o checkout — nunca instrumentável como superfície própria (item 30).' : null,
  }));
}

// GTM container: controlamos o LOADER (está nas nossas páginas), mas não o conteúdo interno das
// tags configuradas nele — não versionado neste repo, então PARTIALLY_CONTROLLED nunca CONTROLLED.
function classifyGtmContainerControl() {
  return { control: 'PARTIALLY_CONTROLLED', reason: 'loader do GTM-54PT3H4Z está nas páginas próprias (controlado), mas as tags configuradas dentro do container não estão versionadas neste repo — não auditável/editável a partir daqui (item 53: nenhuma edição de GTM neste PASSO de qualquer forma).' };
}

module.exports = { classifyControlSurface, buildControlSurfaces, classifyGtmContainerControl, CONTROL_BY_STAGE_TYPE };
