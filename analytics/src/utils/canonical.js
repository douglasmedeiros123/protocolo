'use strict';

/**
 * Reordena recursivamente as chaves de todo objeto em ordem alfabética, sem alterar nenhum
 * valor, chave ou estrutura — só a ORDEM de serialização. Necessário porque a API da Hotmart
 * (confirmado empiricamente) devolve o mesmo objeto com ordem de chave diferente em chamadas
 * distintas para o mesmo dado; sem isso, duas coletas idênticas geram JSON textualmente
 * diferente e o workflow acharia que "mudou" quando não mudou nada de verdade.
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

module.exports = { canonicalize };
