'use strict';

const env = require('../../config/env');

const EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

// O Clarity não é um "snapshot diário" — é uma janela corrente (últimos 1-3 dias a partir de
// AGORA, sem parâmetro de data histórica) com limite de 10 chamadas/dia/projeto. Por isso ele
// não faz mais parte do daily business snapshot (Meta/Hotmart/GitHub, que têm uma data-alvo
// real): é coletado separadamente, sempre representando "agora", nunca atribuído a um dia
// específico do passado. Ver analytics/README.md.
const WINDOW_DESCRIPTION = 'últimos 1 dia a partir do momento da coleta (janela corrente do Clarity, não um dia calendário fixo)';

async function collectClarity() {
  const { CLARITY_API_TOKEN } = env.get('clarity');
  const url = new URL(EXPORT_URL);
  url.searchParams.set('numOfDays', '1');

  const collected_at = new Date().toISOString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CLARITY_API_TOKEN}` } });
  const json = await res.json();
  if (json.error) throw new Error(`Clarity API error: ${JSON.stringify(json.error)}`);

  return {
    source: 'clarity',
    collected_at,
    window_supported_by_api: WINDOW_DESCRIPTION,
    source_status: 'available',
    metrics: json,
  };
}

module.exports = { collectClarity, WINDOW_DESCRIPTION };
