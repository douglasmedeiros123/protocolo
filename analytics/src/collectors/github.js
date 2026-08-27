'use strict';

const env = require('../../config/env');
const { brtDayBounds } = require('../utils/dates');

// Commits do autopost do Instagram (assets/estado publicados automaticamente 4x/dia) não são
// mudanças de landing page — são ruído para este propósito e sempre foram filtrados manualmente
// nesta sessão. Mantém o mesmo filtro aqui em vez de reinventar.
const NOISE_PATTERN = /autopost|migra calendario|stage (carousel|test)/i;

async function collectGithub(dateStr) {
  const { ANALYTICS_GITHUB_TOKEN, GITHUB_REPO } = env.get('github');
  const { startMs, endMs } = brtDayBounds(dateStr);

  const url = new URL(`https://api.github.com/repos/${GITHUB_REPO}/commits`);
  url.searchParams.set('since', new Date(startMs).toISOString());
  url.searchParams.set('until', new Date(endMs).toISOString());
  url.searchParams.set('per_page', '100');

  const res = await fetch(url, { headers: { Authorization: `token ${ANALYTICS_GITHUB_TOKEN}` } });
  const json = await res.json();
  if (json.message && !Array.isArray(json)) {
    throw new Error(`GitHub API error: ${json.message}`);
  }

  const commits = json
    .filter((c) => !NOISE_PATTERN.test(c.commit.message))
    .map((c) => ({
      sha: c.sha,
      date: c.commit.author.date,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
    }));

  return {
    source: 'github',
    date: dateStr,
    fetched_at: new Date().toISOString(),
    repo: GITHUB_REPO,
    commits,
  };
}

module.exports = { collectGithub };
