// Versao do publish.js feita pra rodar dentro do GitHub Actions.
// Diferenca principal: os arquivos ja estao commitados no repo (ig_autopost/assets/),
// entao nao precisa mais fazer upload/push na hora de publicar — so monta a URL
// raw.githubusercontent.com direto e manda pro Instagram. Muito mais rapido e
// sem limite de tamanho de request.
const fs = require('fs');
const path = require('path');

const IG_TOKEN = process.env.IG_TOKEN;
const IG_ID = process.env.IG_ID || "17841405622876405";
const REPO = process.env.REPO || "douglasmedeiros123/protocolo";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

if (!IG_TOKEN) {
  console.error("ERRO: variavel de ambiente IG_TOKEN nao definida");
  process.exit(1);
}

const ROOT = __dirname;
const STATE_FILE = path.join(ROOT, 'posted-state.json');
const CAPTIONS_FILE = path.join(ROOT, 'calendar-captions.json');
const LOG_FILE = path.join(ROOT, 'publish.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { video_followup: [], static: [], carousel: [], video_joelj: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function markPosted(slotName, idx) {
  const state = loadState();
  if (!state[slotName]) state[slotName] = [];
  if (!state[slotName].includes(idx)) state[slotName].push(idx);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function nextIdxFor(slotName) {
  const state = loadState();
  const posted = new Set(state[slotName] || []);
  let idx = 0;
  while (posted.has(idx)) idx++;
  return idx;
}

async function igPost(endpoint, params) {
  const url = new URL(`https://graph.facebook.com/v20.0/${endpoint}`);
  const body = new URLSearchParams({ ...params, access_token: IG_TOKEN });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (json.error) throw new Error(`${endpoint} -> ${JSON.stringify(json.error)}`);
  return json;
}

async function igGet(id, fields) {
  const url = `https://graph.facebook.com/v20.0/${id}?fields=${fields}&access_token=${IG_TOKEN}`;
  const res = await fetch(url);
  return res.json();
}

async function waitFinished(containerId, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    const status = await igGet(containerId, 'status_code,status');
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') throw new Error(`container error: ${JSON.stringify(status)}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('timeout esperando processamento do video');
}

async function publishImage(publicUrl, caption) {
  const container = await igPost(`${IG_ID}/media`, { image_url: publicUrl, caption });
  return igPost(`${IG_ID}/media_publish`, { creation_id: container.id });
}

async function publishCarousel(urls, caption) {
  const children = [];
  for (const u of urls) {
    const item = await igPost(`${IG_ID}/media`, { image_url: u, is_carousel_item: 'true' });
    children.push(item.id);
  }
  const container = await igPost(`${IG_ID}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  return igPost(`${IG_ID}/media_publish`, { creation_id: container.id });
}

async function publishVideo(publicUrl, caption) {
  const container = await igPost(`${IG_ID}/media`, { media_type: 'REELS', video_url: publicUrl, caption });
  await waitFinished(container.id);
  return igPost(`${IG_ID}/media_publish`, { creation_id: container.id });
}

async function run(slotName, idxOverride) {
  const captions = JSON.parse(fs.readFileSync(CAPTIONS_FILE, 'utf8'));
  const idx = idxOverride !== undefined ? idxOverride : nextIdxFor(slotName);
  log(`slot=${slotName} idx=${idx}`);

  if (idx >= captions.TOTAL_DAYS) { log('calendario de 27 dias ja concluido, nada a publicar'); return; }

  const daySlots = captions.days[String(idx)];
  const slot = daySlots ? daySlots[slotName] : undefined;
  if (!slot) { log(`sem conteudo para o slot ${slotName} no dia idx=${idx}`); return; }

  try {
    if (slot.type === 'image') {
      const finalUrl = `${RAW_BASE}/ig_autopost/assets/${slot.file}`;
      const result = await publishImage(finalUrl, slot.caption);
      markPosted(slotName, idx);
      log(`SUCESSO image: ${JSON.stringify(result)}`);
    } else if (slot.type === 'carousel') {
      const urls = slot.files.map(f => `${RAW_BASE}/ig_autopost/assets/carousel_${idx}/${f}`);
      const result = await publishCarousel(urls, slot.caption);
      markPosted(slotName, idx);
      log(`SUCESSO carousel: ${JSON.stringify(result)}`);
    } else if (slot.type === 'video') {
      const finalUrl = `${RAW_BASE}/ig_autopost/assets/${slot.file}`;
      const result = await publishVideo(finalUrl, slot.caption);
      markPosted(slotName, idx);
      log(`SUCESSO video: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    log(`ERRO no slot ${slotName} idx=${idx}: ${err.message}`);
    process.exitCode = 1;
  }
}

const slotArg = process.argv[2];
const idxArg = process.argv[3] !== undefined ? parseInt(process.argv[3], 10) : undefined;
if (!slotArg) {
  console.error('uso: node publish-gha.js <video_followup|static|carousel|video_joelj> [idx_manual]');
  process.exit(1);
}
run(slotArg, idxArg);
