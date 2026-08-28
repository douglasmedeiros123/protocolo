'use strict';

// UNLIMITED CAPITAL PRINCIPLE (PASSO 7, item 3) — mapeamento determinístico modo -> política.
// EXPANDABLE NUNCA significa gasto automático — só sinaliza que um futuro Scaling Agent PODERÁ
// aumentar investimento progressivamente enquanto a rentabilidade continuar válida. Nenhum
// teto fixo arbitrário é imposto aqui quando o ROI está comprovado e sustentável (SCALE); em
// RECOVERY/VALIDATION/DEFENSE o capital é protegido/limitado por padrão.
const CAPITAL_POLICY_BY_MODE = {
  RECOVERY: 'PROTECTED',
  VALIDATION: 'PROTECTED',
  DEFENSE: 'PROTECTED',
  GROWTH: 'CONTROLLED',
  SCALE: 'EXPANDABLE',
};

function resolveCapitalPolicy(decisionMode) {
  return CAPITAL_POLICY_BY_MODE[decisionMode] || 'PROTECTED'; // modo desconhecido = mais seguro por padrão
}

module.exports = { resolveCapitalPolicy, CAPITAL_POLICY_BY_MODE };
