#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJson } = require('./utils/fs');

/**
 * Decide se o snapshot é bom o bastante pra ser commitado. Extraído como função pura
 * (sem process.exit/console) pra ser testável sem precisar de arquivo em disco.
 *
 * Regra (item 3 da revisão): flag de DATA QUALITY nunca bloqueia (mesmo crítica, ex:
 * venda fantasma — é justamente o tipo de dado que precisa ficar registrado). O que bloqueia é
 * ausência de fonte obrigatória (Meta ou Hotmart) — isso sim indica que o snapshot é
 * estruturalmente incompleto, não um problema DE NEGÓCIO capturado corretamente.
 */
function shouldBlock(snapshot) {
  if (!snapshot) return { block: true, reason: 'snapshot ausente (arquivo não foi gerado)' };
  if (!snapshot.sources || typeof snapshot.sources !== 'object') {
    return { block: true, reason: 'snapshot sem campo "sources" — schema inesperado' };
  }
  if (!snapshot.sources.meta) return { block: true, reason: 'fonte obrigatória ausente: meta' };
  if (!snapshot.sources.hotmart) return { block: true, reason: 'fonte obrigatória ausente: hotmart' };
  return { block: false, reason: null };
}

/** Lê o clarity behavior snapshot referenciado pelo ponteiro do daily, se existir. */
function readClarityStatus(snapshot, repoRoot) {
  const pointer = snapshot && snapshot.clarity;
  if (!pointer || !pointer.latest_snapshot) return { label: 'sem snapshot ainda', detail: null };
  const filePath = path.join(repoRoot, pointer.latest_snapshot);
  const clarityDoc = readJson(filePath);
  if (!clarityDoc) return { label: 'arquivo referenciado não encontrado', detail: pointer.latest_snapshot };
  if (clarityDoc.source_status === 'available') return { label: 'available', detail: null };
  return { label: clarityDoc.source_status || 'desconhecido', detail: clarityDoc.reason || null };
}

function buildSummary(dateStr, snapshot, repoRoot) {
  const lines = [];
  lines.push('===== RESUMO DA COLETA =====');
  lines.push(`DATA PROCESSADA: ${dateStr}`);

  if (!snapshot) {
    lines.push('META: ERRO (snapshot ausente)');
    lines.push('HOTMART: ERRO (snapshot ausente)');
    lines.push('CLARITY: n/d');
    lines.push('GITHUB: ERRO (snapshot ausente)');
    lines.push('FLAGS CRÍTICOS: n/d');
    lines.push('=============================');
    return lines.join('\n');
  }

  lines.push(`META: ${snapshot.sources.meta ? 'OK' : 'ERRO'}`);
  lines.push(`HOTMART: ${snapshot.sources.hotmart ? 'OK' : 'ERRO'}`);

  const clarity = readClarityStatus(snapshot, repoRoot);
  lines.push(`CLARITY: ${clarity.label}${clarity.detail ? ` (${clarity.detail})` : ''}`);

  lines.push(`GITHUB: ${snapshot.sources.github ? 'OK' : 'ERRO'}`);

  const flags = snapshot.tracking_flags || [];
  const criticalFlags = flags.filter((f) => f.severity === 'critical');
  lines.push(`FLAGS CRÍTICOS: ${criticalFlags.length}`);
  for (const f of criticalFlags) lines.push(`  ::error::[${f.code}] ${f.message}`);
  const nonCritical = flags.filter((f) => f.severity !== 'critical');
  if (nonCritical.length) lines.push(`Outras flags (não críticas): ${nonCritical.map((f) => f.code).join(', ')}`);

  lines.push('=============================');
  return lines.join('\n');
}

function run(dateStr, repoRoot) {
  const dataDir = path.join(repoRoot, 'analytics', 'data');
  const snapshot = readJson(path.join(dataDir, 'daily', `${dateStr}.json`));

  console.log(buildSummary(dateStr, snapshot, repoRoot));

  const decision = shouldBlock(snapshot);
  if (decision.block) {
    console.error(`❌ FALHA: ${decision.reason}. Não commitando snapshot incompleto como se fosse válido.`);
    return 1;
  }
  console.log(`✅ Snapshot de ${dateStr} validado — Meta e Hotmart presentes. Prosseguindo.`);
  return 0;
}

if (require.main === module) {
  const dateStr = process.argv[2];
  if (!dateStr) {
    console.error('uso: node validate.js <YYYY-MM-DD>');
    process.exit(1);
  }
  process.exitCode = run(dateStr, path.join(__dirname, '..', '..'));
}

module.exports = { shouldBlock, readClarityStatus, buildSummary, run };
