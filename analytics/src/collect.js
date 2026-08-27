#!/usr/bin/env node
'use strict';

const path = require('path');
const { dateRange, todayBRT, isValidDateStr } = require('./utils/dates');
const { writeJson, readJson } = require('./utils/fs');
const { redactDeep } = require('./utils/redact');
const { canonicalize } = require('./utils/canonical');

const { collectMeta } = require('./collectors/meta');
const { collectHotmart } = require('./collectors/hotmart');
const { collectClarity } = require('./collectors/clarity');
const { collectGithub } = require('./collectors/github');

const { normalizeMeta } = require('./normalizers/meta');
const { normalizeHotmart } = require('./normalizers/hotmart');
const { normalizeClarity, normalizeClarityFailure } = require('./normalizers/clarity');
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

async function safeCollect(label, fn, ...args) {
  try {
    const raw = await fn(...args);
    return { label, raw, error: null };
  } catch (err) {
    return { label, raw: null, error: err.message };
  }
}

// ============================================================
// CLARITY — behavior snapshot, independente da data-alvo do negócio (ver collectors/clarity.js).
// Sempre representa "agora" (o momento da coleta), nunca é atribuído a um dia específico do
// passado. Armazenado à parte em data/clarity/{hoje-BRT}.json — reexecutar no mesmo dia
// sobrescreve o arquivo de hoje (mesma idempotência dos outros dados), nunca cria um arquivo
// por execução.
// ============================================================
async function collectClarityBehaviorSnapshot() {
  const result = await safeCollect('clarity', collectClarity);
  const todayStr = todayBRT();
  const filePath = path.join(DATA_DIR, 'clarity', `${todayStr}.json`);

  let normalized;
  if (result.raw) {
    normalized = normalizeClarity(result.raw);
  } else {
    // Diferencia "sabemos que não temos" de um zero silencioso — o motivo do erro vai junto.
    normalized = normalizeClarityFailure(result.error, 'error');
  }

  writeJson(filePath, canonicalize(normalized));
  return { collected_today: todayStr, file: path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/'), status: normalized.source_status };
}

async function collectOneDay(dateStr, clarityPointer) {
  const [metaRes, hotmartRes, githubRes] = await Promise.all([
    safeCollect('meta', collectMeta, dateStr),
    safeCollect('hotmart', collectHotmart, dateStr),
    safeCollect('github', collectGithub, dateStr),
  ]);

  const sourcesUnavailable = [];
  for (const r of [metaRes, hotmartRes, githubRes]) {
    if (r.error) sourcesUnavailable.push({ source: r.label, reason: r.error });
  }

  // RAW — canonicalize() só reordena chaves pra estabilizar diff, não muda valor/estrutura.
  for (const r of [metaRes, hotmartRes, githubRes]) {
    if (r.raw) writeJson(path.join(DATA_DIR, 'raw', r.label, `${dateStr}.json`), canonicalize(redactDeep(r.raw)));
  }

  const meta = metaRes.raw ? normalizeMeta(metaRes.raw) : null;
  const hotmart = hotmartRes.raw ? normalizeHotmart(hotmartRes.raw) : null;
  const github = githubRes.raw ? normalizeGithub(githubRes.raw) : null;

  for (const [label, norm] of [['meta', meta], ['hotmart', hotmart], ['github', github]]) {
    if (norm) writeJson(path.join(DATA_DIR, 'normalized', label, `${dateStr}.json`), norm);
  }

  let metrics = { funnel: null, economics: null };
  if (meta && hotmart) {
    metrics = {
      funnel: computeFunnelMetrics(meta.totals),
      economics: computeEconomicsMetrics(meta.totals, hotmart.totals),
    };
  }

  const prevDate = new Date(Date.parse(dateStr + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const previousDaySnapshot = readJson(path.join(DATA_DIR, 'daily', `${prevDate}.json`));

  const trackingFlags = runDataQualityChecks({
    meta, hotmart, github,
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

  // Regra: flags de data quality (mesmo críticos, ex: venda fantasma) NUNCA bloqueiam o
  // armazenamento — são justamente o tipo de coisa que precisa ficar registrada no histórico.
  // O que bloqueia é falha de API/schema (ver validate.js). Aqui só resumimos pra um consumidor
  // futuro (ex: um Decision Engine) poder checar `has_critical_flags` sem precisar re-varrer o
  // array toda vez — nenhuma decisão de bloqueio é tomada aqui, só o resumo é preparado.
  const criticalFlags = trackingFlags.filter((f) => f.severity === 'critical');

  const dailySnapshot = {
    date: dateStr,
    generated_at: new Date().toISOString(),
    sources: { meta: !!meta, hotmart: !!hotmart, github: !!github },
    meta,
    hotmart,
    github,
    // Clarity não é um dado "deste dia" — é um ponteiro pro snapshot de comportamento mais
    // recente (coletado "agora", na mesma execução deste job). Nunca fingimos que representa
    // o dia-alvo do negócio. Ver analytics/data/clarity/{data}.json para o dado de verdade.
    clarity: {
      status: 'separate_behavior_snapshot',
      latest_snapshot: clarityPointer ? clarityPointer.file : null,
    },
    metrics,
    tracking_flags: trackingFlags,
    has_critical_flags: criticalFlags.length > 0,
    critical_flag_codes: criticalFlags.map((f) => f.code),
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

  // Coletado uma vez por execução (independente de quantos dias de negócio estão sendo
  // processados no --from/--to) — representa "agora", não cada um dos dias do backfill.
  const clarityPointer = await collectClarityBehaviorSnapshot();
  process.stdout.write(`Clarity (behavior snapshot, agora): ${clarityPointer.status} -> ${clarityPointer.file}\n`);

  const results = [];
  for (const d of dates) {
    process.stdout.write(`Coletando ${d}...\n`);
    const result = await collectOneDay(d, clarityPointer);
    results.push(result);
    const critical = result.dailySnapshot.tracking_flags.filter((f) => f.severity === 'critical');
    process.stdout.write(
      `  ok — fontes: ${Object.entries(result.dailySnapshot.sources).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nenhuma'}` +
      ` | flags: ${result.dailySnapshot.tracking_flags.length} (${critical.length} críticas)\n`
    );
  }
  return { results, clarityPointer };
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Erro fatal:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { main, collectOneDay, collectClarityBehaviorSnapshot, parseArgs };
