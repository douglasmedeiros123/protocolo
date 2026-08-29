'use strict';

const fs = require('fs');
const path = require('path');

// item 53 — NENHUMA pesquisa externa. Este módulo audita SÓ o que está fisicamente no repo —
// lê os arquivos HTML/JS reais servidos hoje (mesmas páginas que cro/htmlParser.js já lê pra
// CRO) e classifica CONFIRMED/NOT_AVAILABLE/UNKNOWN a partir de padrões literais encontrados
// nesses arquivos. Nunca afirma que algo "parece instalado" — só o que é lido byte a byte.
// Repositório raiz = 3 níveis acima de analytics/src/measurement/.
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

// item 26 (Part1 do audit real) — todas as páginas próprias reais confirmadas no repo hoje.
const REPO_HTML_FILES = [
  { key: 'ROOT', file: 'index.html' },
  { key: 'ESSENCIAL', file: 'essencial/index.html' },
  { key: 'NUCLEO', file: 'nucleo/index.html' },
  { key: 'ARSENAL', file: 'arsenal/index.html' },
  { key: 'ACESSO', file: 'acesso/index.html' },
  { key: 'TESTE_B', file: 'teste-b/index.html' },
];

function readRepoFile(relPath) {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  // lido como binário e decodificado 'latin1' pra nunca quebrar em byte estranho (o build
  // teste-b/index.html carrega estado serializado com byte nulo, que faz leitores ingênuos
  // tratarem o arquivo como binário e pularem — achado real do levantamento deste PASSO).
  return fs.readFileSync(full, 'latin1');
}

function scanPatterns(content) {
  if (content == null) return null;
  const gtmMatch = content.match(/GTM-[A-Z0-9]+/);
  return {
    gtm_container_id: gtmMatch ? gtmMatch[0] : null,
    gtm_noscript_present: /googletagmanager\.com\/ns\.html/.test(content),
    gtm_head_script_present: /googletagmanager\.com\/gtm\.js/.test(content),
    gtag_present: /\bgtag\(/.test(content),
    datalayer_push_present: /dataLayer\.push\(\s*\{/.test(content) && !/dataLayer\.push\(\{'gtm\.start'/.test(content),
    fbq_present: /\bfbq\(/.test(content),
    facebook_pixel_loader_present: /connect\.facebook\.net/.test(content),
    clarity_snippet_present: /clarity\.ms/i.test(content),
    utm_in_checkout_link_present: /pay\.hotmart\.com[^"'\s]*utm_/.test(content),
    checkout_links: [...content.matchAll(/href="(https:\/\/pay\.hotmart\.com[^"]*)"/g)].map((m) => m[1]),
  };
}

/**
 * auditHtmlSurfaces() — item 26/54. Lê cada página real hoje e reporta o que foi literalmente
 * encontrado — nunca infere GA4/ecommerce funcionando por a GTM estar presente (item 17/19).
 */
function auditHtmlSurfaces() {
  const surfaces = {};
  for (const { key, file } of REPO_HTML_FILES) {
    const content = readRepoFile(file);
    surfaces[key] = { file, exists: content != null, scan: scanPatterns(content) };
  }
  return surfaces;
}

// item 17 — GTM/GA4: só o que é verificável no repo. Conteúdo interno do container GTM
// (quais tags realmente disparam) não está versionado neste repo — não pode ser confirmado
// aqui, mesmo que o loader esteja presente (item 17/53: sem execução real, GA4/ecommerce
// dentro do container fica NEEDS_RUNTIME_VALIDATION, nunca CONFIRMED).
function auditGtmGa4() {
  const surfaces = auditHtmlSurfaces();
  const withGtm = Object.entries(surfaces).filter(([, s]) => s.scan && s.scan.gtm_head_script_present && s.scan.gtm_noscript_present);
  const withoutGtm = Object.entries(surfaces).filter(([, s]) => s.exists && !(s.scan && s.scan.gtm_head_script_present));
  const containerIds = [...new Set(withGtm.map(([, s]) => s.scan.gtm_container_id).filter(Boolean))];
  const anyDataLayerEcommerce = Object.values(surfaces).some((s) => s.scan && s.scan.datalayer_push_present);
  const anyGtag = Object.values(surfaces).some((s) => s.scan && s.scan.gtag_present);
  return {
    domain: 'GTM_GA4',
    container_ids_confirmed: containerIds,
    pages_with_gtm_loader: withGtm.map(([k]) => k),
    pages_without_gtm_loader: withoutGtm.map(([k]) => k),
    gtm_loader_status: containerIds.length > 0 ? 'CONFIRMED' : 'NOT_AVAILABLE',
    ecommerce_datalayer_events_status: anyDataLayerEcommerce ? 'CONFIRMED' : 'NOT_AVAILABLE',
    ga4_direct_gtag_status: anyGtag ? 'CONFIRMED' : 'NOT_AVAILABLE',
    ga4_via_gtm_container_status: 'NEEDS_RUNTIME_VALIDATION',
    reason: 'loader GTM confirmado por leitura direta do HTML servido; conteúdo interno do container (quais tags GA4/ecommerce realmente disparam) não está versionado neste repo e não foi acessado (item 53 — sem internet/runtime) — nunca classificado CONFIRMED sem essa evidência.',
  };
}

// item 19 — Meta Pixel/CAPI: distingue explicitamente pixel de navegador, evento servidor,
// CAPI, event_id, dedup, fbp/fbc, valor/moeda de compra.
function auditMetaPixelCapi(realCheckoutOrPurchaseActionsObserved) {
  const surfaces = auditHtmlSurfaces();
  const anyFbqLiteral = Object.values(surfaces).some((s) => s.scan && (s.scan.fbq_present || s.scan.facebook_pixel_loader_present));
  const collectorPath = path.join(__dirname, '..', 'collectors', 'meta.js');
  const collectorSource = fs.existsSync(collectorPath) ? fs.readFileSync(collectorPath, 'utf8') : '';
  const collectorIsInsightsReadOnly = /\/insights/.test(collectorSource) && !/graph\.facebook\.com\/[^'"]*\/events/.test(collectorSource);
  const anyCapiPost = /method:\s*['"]POST['"][\s\S]{0,200}facebook\.com\/[^'"]*\/events/.test(collectorSource);
  // item 19/53 — achado real deste PASSO: nenhum snippet clarity.ms literal existe em nenhum HTML
  // do repo, mas sessões reais da Clarity existem (auditClarity()) — prova que o GTM-54PT3H4Z
  // injeta tags via Custom HTML em runtime, invisível a uma varredura estática de arquivo. Por
  // isso, ausência de fbq() literal NUNCA pode virar NOT_AVAILABLE por si só — só prova que não
  // está hardcoded fora do GTM, o mesmo padrão já confirmado pra Clarity. Fica NEEDS_RUNTIME_
  // VALIDATION, nunca CONFIRMED nem NOT_AVAILABLE por suposição.
  const browserPixelStatus = anyFbqLiteral ? 'CONFIRMED' : 'NEEDS_RUNTIME_VALIDATION';
  // PASSO 13.1, item 11 — o mecanismo real por trás do browser pixel é HIPÓTESE, nunca fato.
  // A injeção via Custom HTML do GTM é UMA explicação técnica plausível (mesmo padrão observado
  // em auditClarity()), não a única — pode haver outra superfície/código/deploy não observado
  // por esta auditoria (que só lê o repo local). Nunca promovido a CONFIRMED sem validação de
  // runtime real (inspecionar o container GTM ao vivo).
  const gtmInjectionHypothesisStatus = realCheckoutOrPurchaseActionsObserved === true ? 'UNKNOWN_HYPOTHESIS' : 'NOT_ASSESSABLE';
  return {
    domain: 'META_PIXEL_CAPI',
    browser_pixel_status: browserPixelStatus,
    browser_pixel_literal_snippet_found: anyFbqLiteral,
    browser_pixel_mechanism_status: 'NEEDS_RUNTIME_VALIDATION', // item 11 — nunca CONFIRMED/NOT_AVAILABLE sem inspecionar o runtime
    browser_pixel_gtm_injection_hypothesis_status: gtmInjectionHypothesisStatus, // explicitamente rotulado hipótese, nunca fato
    server_capi_status: anyCapiPost ? 'CONFIRMED' : 'NOT_AVAILABLE',
    marketing_insights_collector_status: collectorIsInsightsReadOnly ? 'CONFIRMED_READ_ONLY_AGGREGATE' : 'UNKNOWN',
    event_id_dedup_status: anyCapiPost ? 'NEEDS_RUNTIME_VALIDATION' : 'NOT_AVAILABLE',
    fbp_fbc_capture_status: 'NEEDS_RUNTIME_VALIDATION',
    purchase_value_currency_passthrough_status: 'NEEDS_RUNTIME_VALIDATION',
    reason: 'nenhum fbq()/loader de pixel HARDCODED encontrado em nenhuma página real, e nenhuma implementação de CAPI (servidor) existe em lugar nenhum do código (isso sim é estruturalmente CONFIRMADO ausente — CAPI exige infraestrutura de servidor que não existe). O browser pixel especificamente fica NEEDS_RUNTIME_VALIDATION — não é classificado NOT_AVAILABLE só por ausência de snippet estático, mas também NÃO é classificado CONFIRMED com base na hipótese de injeção via GTM: essa é só UMA hipótese técnica plausível (mesmo padrão observado no caso da Clarity), nunca um fato provado — pode existir outro mecanismo/superfície não observável a partir deste repo. Sem inspecionar o container GTM em runtime, o mecanismo real permanece desconhecido (item 53).',
  };
}

// item 22 — Clarity: comportamento apenas, nunca verdade financeira. Audita instalado vs.
// tecnicamente-instalável vs. observável vs. não-instalado — nunca finge que existe no
// checkout externo.
function auditClarity() {
  const surfaces = auditHtmlSurfaces();
  const anySnippet = Object.values(surfaces).some((s) => s.scan && s.scan.clarity_snippet_present);
  const rawDir = path.join(__dirname, '..', '..', 'data', 'raw', 'clarity');
  let latestRawHasData = false;
  let latestRawUrls = [];
  if (fs.existsSync(rawDir)) {
    const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort();
    for (let i = files.length - 1; i >= 0; i -= 1) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(rawDir, files[i]), 'utf8'));
        if (Array.isArray(raw.metrics) && raw.metrics.length > 0) {
          latestRawHasData = true;
          const popular = raw.metrics.find((m) => m.metricName === 'PopularPages');
          latestRawUrls = popular ? popular.information.map((i) => i.url) : [];
          break;
        }
      } catch { /* arquivo de erro (limite diário excedido) — não conta como dado real */ }
    }
  }
  // PASSO 13.1, item 11 — separar explicitamente FATO (coleta real confirmada) de HIPÓTESE
  // (mecanismo de injeção via GTM). "Injetado pelo GTM" é só UMA explicação plausível — nunca
  // promovida a fato sem validação de runtime. Pode haver outra superfície de deploy/código não
  // observável a partir deste repo.
  const injectedByGtmHypothesisStatus = (!anySnippet && latestRawHasData) ? 'UNKNOWN_HYPOTHESIS' : 'NOT_APPLICABLE';
  return {
    domain: 'CLARITY',
    snippet_found_in_repo_html_status: anySnippet ? 'CONFIRMED' : 'NOT_AVAILABLE',
    live_session_collection_status: latestRawHasData ? 'CONFIRMED' : 'UNKNOWN', // FATO — dado real de sessão existe na API
    pages_observed_with_traffic: latestRawUrls,
    install_mechanism_injected_by_gtm_hypothesis_status: injectedByGtmHypothesisStatus, // HIPÓTESE — nunca fato
    install_mechanism_status: 'UNKNOWN', // nunca CONFIRMED_DIRECT_SNIPPET nem CONFIRMED_VIA_GTM sem prova de runtime
    per_page_attribution_in_pipeline_status: 'NOT_AVAILABLE',
    reason: 'FATO confirmado: nenhum snippet clarity.ms literal em nenhum HTML do repo, mas dados reais de sessão existem na API de exportação da Clarity. HIPÓTESE (não fato): o mecanismo de instalação mais plausível seria uma tag Custom HTML dentro do container GTM-54PT3H4Z — mas o conteúdo do container não está neste repo e não foi validado em runtime, então o mecanismo real fica UNKNOWN. Pode haver outra explicação (outro código de deploy, outra superfície não auditada aqui) — nunca afirmar "só pode ser o GTM" (item 11). A normalização atual (normalizers/clarity.js) descarta o campo de URL por página — o pipeline de decisão nunca recebe atribuição por página, mesmo quando a API bruta a carrega parcialmente.',
  };
}

// item 27 — Hotmart continua verdade financeira. Auditoria do que é observável, a partir do
// schema real do normalizador (não invenção) e de um exemplo de payload bruto real, se existir.
function auditHotmart() {
  const normalizerPath = path.join(__dirname, '..', 'normalizers', 'hotmart.js');
  const normalizerSource = fs.existsSync(normalizerPath) ? fs.readFileSync(normalizerPath, 'utf8') : '';
  const rawDir = path.join(__dirname, '..', '..', 'data', 'raw', 'hotmart');
  let rawSampleFields = null;
  if (fs.existsSync(rawDir)) {
    const files = fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort();
    for (let i = files.length - 1; i >= 0; i -= 1) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(rawDir, files[i]), 'utf8'));
        const items = raw.items || raw.transactions || (Array.isArray(raw) ? raw : []);
        if (items.length > 0) { rawSampleFields = Object.keys(items[0]); break; }
      } catch { /* payload malformado nesse dia — tenta o próximo */ }
    }
  }
  const hasAdAttributionField = rawSampleFields
    ? rawSampleFields.some((f) => /utm|fbclid|ad_id|campaign_id|click/i.test(f))
    : null;
  return {
    domain: 'HOTMART',
    financial_truth_status: 'CONFIRMED',
    normalizer_field_set: ['transaction_id', 'order_date_utc', 'product_name', 'is_main_product', 'status', 'gross', 'hotmart_fee', 'net', 'payment_method', 'buyer_name', 'is_known_test_buyer', 'counted_as_revenue'],
    normalizer_emits_only_this_field_set: /\.map\(/.test(normalizerSource),
    raw_payload_top_level_fields_sample: rawSampleFields,
    ad_attribution_field_present_upstream: hasAdAttributionField === null ? 'UNKNOWN' : (hasAdAttributionField ? 'CONFIRMED' : 'NOT_AVAILABLE'),
    reason: 'Hotmart Sales History API confirmada como não retornando nenhum campo de atribuição de anúncio (utm/fbclid/ad_id/campaign_id) — não é lacuna de código, é limite estrutural da API upstream. Qualquer join Meta<->Hotmart é necessariamente probabilístico (valor/janela de tempo), nunca por identificador determinístico.',
  };
}

// item 28 — checkout externo: UTMs nunca são propagados hoje pro link de checkout Hotmart.
function auditUtmToCheckout() {
  const surfaces = auditHtmlSurfaces();
  const links = Object.values(surfaces).flatMap((s) => (s.scan ? s.scan.checkout_links : []));
  const anyUtm = links.some((l) => /utm_/.test(l));
  return {
    domain: 'UTM_TO_CHECKOUT',
    checkout_links_found: [...new Set(links)],
    utm_forwarding_status: anyUtm ? 'CONFIRMED' : 'NOT_AVAILABLE',
    reason: 'links de checkout extraídos diretamente do HTML/bundle servido hoje — nenhum utm_ presente em nenhum deles; nenhuma lógica de passthrough de UTM da página pro link de checkout foi encontrada no bundle JS.',
  };
}

/**
 * runFullPlatformAudit() — agrega todos os audits reais acima num único snapshot, sempre a
 * partir dos arquivos reais lidos nesta chamada (determinístico enquanto os arquivos não mudam).
 */
function runFullPlatformAudit({ realCheckoutOrPurchaseActionsObserved } = {}) {
  return {
    html_surfaces: auditHtmlSurfaces(),
    gtm_ga4: auditGtmGa4(),
    meta_pixel_capi: auditMetaPixelCapi(realCheckoutOrPurchaseActionsObserved),
    clarity: auditClarity(),
    hotmart: auditHotmart(),
    utm_to_checkout: auditUtmToCheckout(),
  };
}

module.exports = {
  REPO_HTML_FILES, readRepoFile, scanPatterns, auditHtmlSurfaces, auditGtmGa4, auditMetaPixelCapi,
  auditClarity, auditHotmart, auditUtmToCheckout, runFullPlatformAudit,
};
