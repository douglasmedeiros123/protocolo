'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { CRO_DNA_FIELDS, emptyCroDna, buildCroDna, extractCroDnaFromParsedPage } = require('../src/cro/croDna');
const { readAndParseLandingPage } = require('../src/cro/htmlParser');
const { buildSectionMap } = require('../src/cro/sectionMap');
const { resolveLandingPageSourceOfTruth } = require('../src/cro/sourceOfTruth');
const { analyzeCro } = require('../src/cro/builder');
const { saveLandingPages, loadLandingPages } = require('../src/cro/registry');
const { resolveAssetOrigin, ASSET_ORIGINS } = require('../src/learning/assetOrigin');
const { PRODUCT_ID } = require('../config/product');

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cro-registry-test-')); }

test('CRO DNA: 31 campos documentados (item 5 do PASSO 9), todos null por padrão (nunca inventa dado)', () => {
  const dna = emptyCroDna();
  assert.equal(CRO_DNA_FIELDS.length, 31);
  for (const f of CRO_DNA_FIELDS) assert.equal(dna[f], null);
});

test('CRO DNA: buildCroDna só preenche o que foi explicitamente informado', () => {
  const dna = buildCroDna({ price: ['R$ 67,00'] });
  assert.deepEqual(dna.price, ['R$ 67,00']);
  assert.equal(dna.testimonials, null);
});

test('CRO DNA: extração real a partir da LP real preenche headline/price/guarantee com fatos verificáveis', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const sectionMap = buildSectionMap(parsed.sections);
  const dna = extractCroDnaFromParsedPage(parsed, sectionMap);
  assert.match(dna.headline, /Cartilha Anti-Vácuo/);
  assert.ok(Array.isArray(dna.primary_cta) && dna.primary_cta.length > 0);
  assert.ok(dna.checkout_transition.links[0].includes('pay.hotmart.com'));
  assert.equal(dna.checkout_transition.type, 'EXTERNAL_HOTMART');
});

test('CRO DNA: testimonials e social_proof ficam null quando a busca real não encontra evidência (não força um valor)', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const sectionMap = buildSectionMap(parsed.sections);
  const dna = extractCroDnaFromParsedPage(parsed, sectionMap);
  assert.equal(dna.testimonials, null);
  assert.equal(dna.social_proof, null);
  assert.equal(dna.scarcity, null);
});

test('CRO DNA: desire e mobile/desktop_experience ficam null quando exigiriam interpretação subjetiva (não extraídos automaticamente)', () => {
  const sot = resolveLandingPageSourceOfTruth();
  const parsed = readAndParseLandingPage(sot.landing_page_file);
  const sectionMap = buildSectionMap(parsed.sections);
  const dna = extractCroDnaFromParsedPage(parsed, sectionMap);
  assert.equal(dna.desire, null);
  assert.equal(dna.mobile_experience, null);
  assert.equal(dna.desktop_experience, null);
});

test('product_id: análise resolve o product_id default quando não informado, propagado à LP registrada', () => {
  const result = analyzeCro({});
  assert.equal(result.product_id, PRODUCT_ID);
  assert.equal(result.landing_page.product_id, PRODUCT_ID);
});

test('LP registry: schema tem os campos pedidos (versioning/parent_version/asset_origin/experiment_id/sections/cro_dna/performance/diagnostics/hypotheses)', () => {
  const result = analyzeCro({});
  const lp = result.landing_page;
  for (const f of ['landing_page_id', 'product_id', 'version', 'status', 'path', 'created_at', 'updated_at', 'parent_version', 'asset_origin', 'experiment_id', 'sections', 'cro_dna', 'performance', 'diagnostics', 'hypotheses']) {
    assert.ok(f in lp, `campo ausente: ${f}`);
  }
});

test('versioning: LP atual é a baseline (version=1, parent_version=null) — nenhuma LP-V2 real criada', () => {
  const result = analyzeCro({});
  assert.equal(result.landing_page.version, 1);
  assert.equal(result.landing_page.parent_version, null);
  assert.equal(result.landing_page.status, 'BASELINE');
});

test('asset_origin: reusa o enum do Learning Engine, NUNCA inferido retroativamente pra MACHINE sem registro explícito', () => {
  const result = analyzeCro({});
  assert.ok(ASSET_ORIGINS.includes(result.landing_page.asset_origin));
  assert.equal(result.landing_page.asset_origin, 'UNKNOWN'); // nenhum registro explícito de origem existe hoje
  assert.equal(resolveAssetOrigin({ asset_origin: 'MACHINE' }), 'MACHINE'); // mas aceitaria se fosse informado
});

test('registry: saveLandingPages é idempotente — preserva created_at, não duplica arquivo', () => {
  const dir = makeTempDir();
  const result = analyzeCro({});
  const first = saveLandingPages([result.landing_page], dir);
  const filesAfterFirst = fs.readdirSync(dir);
  const second = saveLandingPages([result.landing_page], dir);
  const filesAfterSecond = fs.readdirSync(dir);
  assert.deepEqual(filesAfterFirst, filesAfterSecond);
  assert.equal(first[0].created_at, second[0].created_at);
});

test('registry: loadLandingPages funciona em diretório isolado, sem tocar dados reais', () => {
  const dir = makeTempDir();
  assert.deepEqual(loadLandingPages(dir), []);
});
