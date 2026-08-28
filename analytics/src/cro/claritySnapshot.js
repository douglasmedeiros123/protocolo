'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/fs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'clarity');

/**
 * CLARITY (PASSO 9, item 10) — lê SOMENTE o snapshot já persistido (nunca chama a API). O
 * snapshot é sempre "agora" (ver collect.js: Clarity não representa um dia-alvo do negócio,
 * representa o comportamento mais recente capturado na execução) — rotulado explicitamente
 * como CURRENT_BEHAVIOR_SNAPSHOT, NUNCA atribuído a uma data histórica de negócio. Se a última
 * coleta falhou (ex: limite diário da API excedido), isso é reportado tal como é — nunca
 * mascarado como "sem dado" genérico nem substituído por um valor antigo silenciosamente.
 */
function loadCurrentBehaviorSnapshot(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) {
    return { type: 'CURRENT_BEHAVIOR_SNAPSHOT', status: 'UNAVAILABLE', reason: 'Diretório analytics/data/clarity/ não existe.' };
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    return { type: 'CURRENT_BEHAVIOR_SNAPSHOT', status: 'UNAVAILABLE', reason: 'Nenhum snapshot do Clarity persistido ainda.' };
  }
  const latestFile = files[files.length - 1];
  const snapshot = readJson(path.join(dir, latestFile));

  if (!snapshot || snapshot.source_status !== 'success') {
    return {
      type: 'CURRENT_BEHAVIOR_SNAPSHOT',
      status: 'UNAVAILABLE',
      snapshot_file: latestFile,
      collected_at: snapshot?.collected_at || null,
      reason: snapshot?.reason || 'Última coleta do Clarity não teve sucesso (source_status != success).',
    };
  }

  return {
    type: 'CURRENT_BEHAVIOR_SNAPSHOT',
    status: 'AVAILABLE',
    snapshot_file: latestFile,
    collected_at: snapshot.collected_at,
    behavior: snapshot.behavior,
    device: snapshot.device,
    browser: snapshot.browser,
    sessions: snapshot.sessions,
    note: 'Este snapshot representa o comportamento capturado NO MOMENTO da coleta — NÃO é uma métrica histórica de um período de negócio específico. Nunca cruzar com uma janela de datas do Profit/Experiment Engine como se fosse a mesma coisa.',
  };
}

module.exports = { loadCurrentBehaviorSnapshot, DEFAULT_DIR };
