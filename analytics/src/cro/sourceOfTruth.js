'use strict';

const fs = require('fs');
const path = require('path');
const { TICKET } = require('../../config/product');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

/**
 * SOURCE OF TRUTH DA LP (PASSO 9, item 7) — descobre qual página está EFETIVAMENTE sendo
 * servida pro tráfego pago, lendo vercel.json real (NUNCA modificado, só lido). A regra
 * determinística: a PRIMEIRA rota com `has: [{type:'host', ...}]` que casa com um domínio real
 * é a fonte de verdade; tudo mais cai no fallback `filesystem` (serviria o index.html da raiz,
 * NÃO a página usada pelos anúncios). Cruza o preço real extraído da LP com
 * config/product.js TICKET pra confirmar (não assumir) que é a página do produto certo.
 */
function resolveLandingPageSourceOfTruth() {
  const vercelConfigPath = path.join(REPO_ROOT, 'vercel.json');
  if (!fs.existsSync(vercelConfigPath)) {
    return { found: false, reason: 'vercel.json não encontrado na raiz do repositório — não é possível determinar a fonte de verdade por roteamento.' };
  }
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
  const hostRoute = (vercelConfig.routes || []).find((r) => Array.isArray(r.has) && r.has.some((h) => h.type === 'host'));

  if (!hostRoute) {
    return {
      found: true,
      considered_path: 'index.html',
      landing_page_file: path.join(REPO_ROOT, 'index.html'),
      reason: 'vercel.json não tem regra de host explícita — tudo cai no fallback "filesystem", que serve o index.html da raiz.',
      vercel_json_path: 'vercel.json',
    };
  }

  const hostRule = hostRoute.has.find((h) => h.type === 'host');
  const dest = hostRoute.dest || '';
  const destDir = dest.replace(/\/\$\d+.*$/, '').replace(/^\//, '').replace(/\/$/, '');
  const landingPageFile = path.join(REPO_ROOT, destDir, 'index.html');
  const relativePath = path.join(destDir, 'index.html').replace(/\\/g, '/');

  let priceCrossCheck = { checked: false };
  if (fs.existsSync(landingPageFile)) {
    const html = fs.readFileSync(landingPageFile, 'utf8');
    const priceMatch = html.match(/R\$\s*(\d+(?:[.,]\d{2})?)\s*(?:à vista|a vista)/i);
    const priceFound = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
    priceCrossCheck = {
      checked: true,
      price_found_in_lp: priceFound,
      product_ticket_config: TICKET,
      matches_config_product: priceFound != null && Math.abs(priceFound - TICKET) < 0.01,
    };
  }

  return {
    found: true,
    considered_path: relativePath,
    landing_page_file: landingPageFile,
    domain_matched: hostRule.value,
    vercel_json_path: 'vercel.json',
    price_cross_check: priceCrossCheck,
    reason: `vercel.json roteia explicitamente o host "${hostRule.value}" para "${dest}" (regra de host, não fallback filesystem)` +
      (priceCrossCheck.checked
        ? `; o preço real encontrado na página (R$${priceCrossCheck.price_found_in_lp}) ${priceCrossCheck.matches_config_product ? 'BATE' : 'NÃO bate'} com config/product.js TICKET (R$${TICKET}), ${priceCrossCheck.matches_config_product ? 'confirmando' : 'colocando em dúvida'} que esta é a página do produto atual.`
        : ' (arquivo não encontrado localmente para cruzar o preço).'),
    fallback_note: 'Qualquer host diferente de "' + hostRule.value + '" cai no fallback "filesystem" (serviria o index.html da raiz do repo) — não é a página usada pelo tráfego pago deste produto.',
  };
}

module.exports = { resolveLandingPageSourceOfTruth, REPO_ROOT };
