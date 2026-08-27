'use strict';

// Defesa em profundidade: nada que passe por aqui deveria conter segredo (os collectors já
// evitam incluir token/authorization no que devolvem), mas isso garante que, se algum dia uma
// API ecoar de volta um header ou querystring com token, ele nunca chega a ser escrito em disco.

const SECRET_KEY_PATTERN = /token|secret|authorization|api[_-]?key|client[_-]?secret|password/i;
const SECRET_VALUE_PATTERNS = [
  /EAA[A-Za-z0-9]{20,}/g, // token de acesso Meta/Facebook
  /ghp_[A-Za-z0-9]{20,}/g, // GitHub personal access token
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT (Clarity, etc.)
];

function redactString(str) {
  let out = str;
  for (const re of SECRET_VALUE_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

/** Remove recursivamente chaves cujo nome parece segredo, e mascara valores que parecem token. */
function redactDeep(value) {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactDeep(v);
      }
    }
    return out;
  }
  return value;
}

module.exports = { redactDeep, redactString };
