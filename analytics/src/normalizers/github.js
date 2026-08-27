'use strict';

function normalizeGithub(raw) {
  return {
    date: raw.date,
    lp_changes: raw.commits.map((c) => ({
      sha: c.sha,
      timestamp_utc: c.date,
      message: c.message,
      author: c.author,
    })),
  };
}

module.exports = { normalizeGithub };
