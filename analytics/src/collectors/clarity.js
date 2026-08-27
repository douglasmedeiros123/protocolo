'use strict';

const env = require('../../config/env');
const { todayBRT } = require('../utils/dates');

const EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

// LIMITAÇÕES REAIS DA API DO CLARITY (confirmadas nesta sessão, não documentação lida por cima):
//  1. Só devolve os últimos 1-3 dias a partir de HOJE — não existe parâmetro de data histórica.
//     numOfDays=1 == hoje; numOfDays=3 == os últimos 3 dias AGREGADOS (não d3 separado de d2/d1).
//  2. Limite de 10 chamadas/dia/projeto. Este collector faz só 1 chamada por execução
//     (sem breakdown por dimensão) para não gastar a cota à toa.
// Por isso: só coletamos Clarity quando a data pedida é HOJE (BRT). Para qualquer outra data,
// devolvemos available:false em vez de fingir que temos o dado — nunca atribua o agregado de
// "últimos 3 dias" a um dia específico do passado.

async function collectClarity(dateStr) {
  if (dateStr !== todayBRT()) {
    return {
      source: 'clarity',
      date: dateStr,
      fetched_at: new Date().toISOString(),
      available: false,
      reason: 'A API do Clarity só cobre os últimos 1-3 dias a partir de hoje — não dá pra buscar esta data retroativamente.',
      metrics: null,
    };
  }

  const { CLARITY_API_TOKEN } = env.get('clarity');
  const url = new URL(EXPORT_URL);
  url.searchParams.set('numOfDays', '1');

  const res = await fetch(url, { headers: { Authorization: `Bearer ${CLARITY_API_TOKEN}` } });
  const json = await res.json();
  if (json.error) throw new Error(`Clarity API error: ${JSON.stringify(json.error)}`);

  return {
    source: 'clarity',
    date: dateStr,
    fetched_at: new Date().toISOString(),
    available: true,
    numOfDays: 1,
    metrics: json,
  };
}

module.exports = { collectClarity };
