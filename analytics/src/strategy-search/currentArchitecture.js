'use strict';

const { resolveOfferSourceOfTruth } = require('../offer/sourceOfTruth');
const { resolveLandingPageSourceOfTruth } = require('../cro/sourceOfTruth');
const { PATTERN_LIBRARY } = require('./patternLibrary');

// item 16 — arquitetura ATUAL reconstruída do repo/dados reais, nunca hardcoded. Upsell/downsell/
// bundle/lifecycle NUNCA entram como ACTIVE se não existem em transação real (mesma disciplina
// do Offer Agent, PASSO 10, item 8).
function buildCurrentArchitectureStages({ sourceOfTruth, lpSourceOfTruth }) {
  const stages = [];
  let order = 0;

  stages.push({ stage_id: 'STAGE-AD', order: ++order, type: 'AD', status: 'ACTIVE', source: 'Meta Ads real (analytics/data/creatives/assets.json) — anúncios ativos hoje.' });

  stages.push({
    stage_id: 'STAGE-SALES-PAGE', order: ++order, type: 'SALES_PAGE', status: lpSourceOfTruth.found ? 'ACTIVE' : 'UNKNOWN',
    source: lpSourceOfTruth.found ? `${lpSourceOfTruth.landing_page_file} — confirmado via vercel.json host rule (${lpSourceOfTruth.domain_matched}).` : 'não confirmado — cro/sourceOfTruth.js não encontrou a LP real.',
  });

  stages.push({ stage_id: 'STAGE-CHECKOUT', order: ++order, type: 'CHECKOUT', status: 'ACTIVE', source: `Hotmart real — produto principal "${sourceOfTruth.main_product.name}" (R$${sourceOfTruth.main_product.confirmed_price}), ${sourceOfTruth.main_product.transactions_found} transações no período.` });

  sourceOfTruth.confirmed_active_bumps.forEach((b, i) => {
    stages.push({ stage_id: `STAGE-ORDER-BUMP-${i + 1}`, order: ++order, type: 'ORDER_BUMP', status: 'ACTIVE', source: `Hotmart real — "${b.product_name}", ${b.transactions_found} transações no período.` });
  });

  // item 16 — bundle/upsell/downsell/lifecycle: PLANNED (não ACTIVE), citando a mesma nota do Offer.
  stages.push({ stage_id: 'STAGE-BUNDLE-PLANNED', order: null, type: 'BUNDLE', status: 'PLANNED', source: sourceOfTruth.planned_architecture_note });
  stages.push({ stage_id: 'STAGE-UPSELL-PLANNED', order: null, type: 'UPSELL', status: 'PLANNED', source: sourceOfTruth.planned_architecture_note });
  stages.push({ stage_id: 'STAGE-DOWNSELL-PLANNED', order: null, type: 'DOWNSELL', status: 'PLANNED', source: sourceOfTruth.planned_architecture_note });

  return stages;
}

// item 16 — páginas estáticas existentes no repo mas SEM transação real confirmada na janela
// medida (arsenal/essencial/nucleo) — existem como arquivo, mas nunca promovidas a ACTIVE sem
// evidência real de transação. acesso/privacidade são páginas de suporte (thank-you/legal), não
// estágios de monetização.
function buildUnconfirmedPages() {
  return [
    { path: '/essencial', file: 'essencial/index.html', hypothesized_role: 'DOWNSELL', status: 'EXISTS_NO_CONFIRMED_TRAFFIC', reason: 'arquivo existe no repo; nenhuma transação real com este product_name na janela medida; não referenciado em vercel.json.' },
    { path: '/nucleo', file: 'nucleo/index.html', hypothesized_role: 'DOWNSELL', status: 'EXISTS_NO_CONFIRMED_TRAFFIC', reason: 'mesma situação — arquivo existe, sem transação real confirmada.' },
    { path: '/arsenal', file: 'arsenal/index.html', hypothesized_role: 'UPSELL', status: 'EXISTS_NO_CONFIRMED_TRAFFIC', reason: 'mesma situação — arquivo existe, sem transação real confirmada na janela medida.' },
    { path: '/acesso', file: 'acesso/index.html', hypothesized_role: 'THANK_YOU', status: 'EXISTS_UNCONFIRMED_WIRING', reason: 'página de acesso pós-compra existe; não há confirmação de que o redirect real do Hotmart aponta pra ela.' },
  ];
}

/**
 * classifyCurrentFamily() — item 10/16. Compara a sequência real de estágios ACTIVE contra a
 * biblioteca de padrões (patternLibrary.js) por sobreposição — nunca assume a família, deriva.
 */
function classifyCurrentFamily(activeStageTypes) {
  let best = null;
  let bestScore = -1;
  for (const [family, pattern] of Object.entries(PATTERN_LIBRARY)) {
    if (!pattern.typical_stages.length) continue;
    const overlap = pattern.typical_stages.filter((s) => activeStageTypes.includes(s)).length;
    const score = overlap / pattern.typical_stages.length;
    if (score > bestScore) { bestScore = score; best = family; }
  }
  return { family: best, match_score: Math.round(bestScore * 10000) / 10000, reason: `melhor sobreposição estrutural entre os estágios ACTIVE reais (${activeStageTypes.join(' → ')}) e o padrão típico de ${best}.` };
}

/**
 * buildCurrentArchitecture() — orquestra a reconstrução real (item 16), nunca duplica os agents
 * (item 19) — só consulta source of truth já existente (Offer/CRO).
 */
function buildCurrentArchitecture({ productId, dates }) {
  const sourceOfTruth = resolveOfferSourceOfTruth(dates, productId);
  const lpSourceOfTruth = resolveLandingPageSourceOfTruth();
  const stages = buildCurrentArchitectureStages({ sourceOfTruth, lpSourceOfTruth });
  const activeStageTypes = stages.filter((s) => s.status === 'ACTIVE').map((s) => s.type);
  const classification = classifyCurrentFamily(activeStageTypes);
  const unconfirmedPages = buildUnconfirmedPages();

  return {
    architecture_id: 'ARCH-CURRENT',
    product_id: productId,
    version: 1,
    name: 'Arquitetura atual real',
    family: classification.family,
    family_classification: classification,
    status: 'CURRENT',
    stages,
    unconfirmed_pages: unconfirmedPages,
    source_of_truth: { offer: sourceOfTruth, landing_page: lpSourceOfTruth },
    note: 'CURRENT_ARCHITECTURE — nunca DEFAULT_CORRECT_ARCHITECTURE (item central do PASSO 12).',
  };
}

module.exports = { buildCurrentArchitecture, buildCurrentArchitectureStages, classifyCurrentFamily, buildUnconfirmedPages };
