#!/usr/bin/env node
'use strict';

const path = require('path');
const { dateRange, todayBRT, isValidDateStr } = require('./utils/dates');
const { writeJson, readJson, exists } = require('./utils/fs');
const { redactDeep } = require('./utils/redact');
const { canonicalize } = require('./utils/canonical');

const { collectMeta } = require('./collectors/meta');
const { collectHotmart } = require('./collectors/hotmart');
const { collectClarity } = require('./collectors/clarity');
const { collectGithub } = require('./collectors/github');

const { normalizeMeta } = require('./normalizers/meta');
const { normalizeHotmart } = require('./normalizers/hotmart');
const { normalizeClarity } = require('./normalizers/clarity');
const { normalizeGithub } = require('./normalizers/github');

const { computeFunnelMetrics } = require('./metrics/funnel');
const { computeEconomicsMetrics } = require('./metrics/economics');
const { runDataQualityChecks } = require('./metrics/dataQuality');

const DATA_DIR = path.join(__dirname, '..', 'data');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
  }
  return args;
}

/** Roda um collector, nunca deixa uma fonte derrubar as outras. Retorna { raw, error }. */
async function safeCollect(label, fn, ...args) {
  try {
    const raw = await fn(...args);
    return { label, raw, error: null };
  } catch (err) {
    return { label, raw: null, error: err.message };
  }
}

async function collectOneDay(dateStr) {
  const [metaRes, hotmartRes, clarityRes, githubRes] = await Promise.all([
    safeCollect('meta', collectMeta, dateStr),
    safeCollect('hotmart', collectHotmart, dateStr),
    safeCollect('clarity', collectClarity, dateStr),
    safeCollect('github', collectGithub, dateStr),
  ]);

  const sourcesUnavailable = [];
  for (const r of [metaRes, hotmartRes, clarityRes, githubRes]) {
    if (r.error) sourcesUnavailable.push({ source: r.label, reason: r.error });
  }

  // RAW — salva exatamente o que a API devolveu (com redação defensiva), uma camada por fonte.
  // canonicalize() só reordena chaves pra estabilizar diff — não muda nenhum valor/estrutura.
  for (const r of [metaRes, hotmartRes, clarityRes, githubRes]) {
    if (r.raw) writeJson(path.join(DATA_DIR, 'raw', r.label, `${dateStr}.json`), canonicalize(redactDeep(r.raw)));
  }

  // NORMALIZED
  const meta = metaRes.raw ? normalizeMeta(metaRes.raw) : null;
  const hotmart = hotmartRes.raw ? normalizeHotmart(hotmartRes.raw) : null;
  const clarity = clarityRes.raw ? normalizeClarity(clarityRes.raw) : null;
  const github = githubRes.raw ? normalizeGithub(githubRes.raw) : null;

  for (const [label, norm] of [['meta', meta], ['hotmart', hotmart], ['clarity', clarity], ['github', github]]) {
    if (norm) writeJson(path.join(DATA_DIR, 'normalized', label, `${dateStr}.json`), norm);
  }

  // METRICS — só computáveis se meta e hotmart existirem para o dia
  let metrics = { funnel: null, economics: null };
  if (meta && hotmart) {
    metrics = {
      funnel: computeFunnelMetrics(meta.totals),
      economics: computeEconomicsMetrics(meta.totals, hotmart.totals),
    };
  }

  // Dia anterior (para o check de mudança brusca) — lê o snapshot diário já persistido, se existir.
  const prevDate = new Date(Date.parse(dateStr + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const previousDaySnapshot = readJson(path.join(DATA_DIR, 'daily', `${prevDate}.json`));

  const trackingFlags = runDataQualityChecks({
    meta, hotmart, clarity, github,
    economics: metrics.economics,
    previousDaySnapshot,
  });

  for (const s of sourcesUnavailable) {
    trackingFlags.push({
      code: 'SOURCE_UNAVAILABLE',
      severity: 'info',
      message: `Fonte "${s.source}" não pôde ser coletada: ${s.reason}`,
      details: { source: s.source },
    });
  }

  const dailySnapshot = {
    date: dateStr,
    generated_at: new Date().toISOString(),
    sources: { meta: !!meta, hotmart: !!hotmart, clarity: !!clarity, github: !!github },
    meta,
    hotmart,
    clarity,
    github,
    metrics,
    tracking_flags: trackingFlags,
  };

  writeJson(path.join(DATA_DIR, 'daily', `${dateStr}.json`), dailySnapshot);

  return { dateStr, dailySnapshot, sourcesUnavailable };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let dates;
  if (args.date) {
    if (!isValidDateStr(args.date)) throw new Error(`--date inválida: ${args.date} (use YYYY-MM-DD)`);
    dates = [args.date];
  } else if (args.from && args.to) {
    dates = dateRange(args.from, args.to);
  } else {
    dates = [todayBRT()];
  }

  const results = [];
  for (const d of dates) {
    process.stdout.write(`Coletando ${d}...\n`);
    const result = await collectOneDay(d);
    results.push(result);
    const critical = result.dailySnapshot.tracking_flags.filter((f) => f.severity === 'critical');
    process.stdout.write(
      `  ok — fontes: ${Object.entries(result.dailySnapshot.sources).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nenhuma'}` +
      ` | flags: ${result.dailySnapshot.tracking_flags.length} (${critical.length} críticas)\n`
    );
  }
  return results;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { main, collectOneDay, parseArgs };
