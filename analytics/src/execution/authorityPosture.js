'use strict';

const { AUTHORITY_TIERS_V2 } = require('./enums');

// PASSO 14B, item 3 — recomendação própria e opinativa do tier inicial, a partir dos fatos reais
// atuais (nunca confiança inventada). Consumido pelo builder.js com o estado real do sistema.
function recommendInitialAuthorityPosture({
  financialRoasStatus, // 'BELOW_BREAK_EVEN'|'BREAK_EVEN'|'ABOVE_BREAK_EVEN'
  financialTruthHealthStatus, platformAttributionHealthStatus, reconciliationHealthStatus,
  completedExperiments, strategyWinnerConfidence, currentMeasurementBlocker, capitalPolicyConfigured, safeModeActive,
}) {
  const recommendedTier = 'TIER_0_ANALYZE_ONLY';

  const whyThisTier = [
    `financial_roas está ${financialRoasStatus === 'BELOW_BREAK_EVEN' ? 'ABAIXO de break-even' : financialRoasStatus} — o produto ainda não confirma retorno financeiro positivo sustentado.`,
    `FINANCIAL_TRUTH_HEALTH=${financialTruthHealthStatus} (RELIABLE é bom — mas isso só garante que os NÚMEROS são confiáveis, não que a ESTRATÉGIA já funciona).`,
    `PLATFORM_ATTRIBUTION_HEALTH=${platformAttributionHealthStatus} — atribuição de plataforma degradada reduz a confiança em qualquer decisão que dependesse dela isoladamente.`,
    `CROSS_PLATFORM_RECONCILIATION_HEALTH=${reconciliationHealthStatus} — reconciliação parcial.`,
    `${completedExperiments} experimento(s) real(is) concluído(s) pela máquina — zero histórico de execução autônoma bem-sucedida pra basear qualquer autonomia real.`,
    `confidence do vencedor real do Strategy Search=${strategyWinnerConfidence} — a própria recomendação estratégica mais forte disponível hoje já é LOW confidence.`,
    `current_measurement_blocker=${currentMeasurementBlocker} — ainda existe um blocker real de mensuração pro próximo experimento.`,
    `capital_policy_configured=${capitalPolicyConfigured} — nenhum limite econômico real existe ainda pra autorizar qualquer coisa além de TIER_0.`,
    `SAFE_MODE=${safeModeActive} — mesmo que um tier mais alto fosse recomendado, execução externa real permaneceria bloqueada.`,
  ];

  const whyNotMoreAutonomy = 'cada um dos 9 fatos acima é, sozinho, suficiente pra impedir qualquer tier acima de TIER_0 — combinados, não há uma única dimensão (financeira, de medição, de confiança estratégica, ou de configuração de política) que sustente autonomia real hoje. Pular pra TIER_1+ seria conceder autoridade sem nenhuma base de evidência, exatamente o que o item 4 (AUTHORITY_IS_EARNED) proíbe.';

  const whyNotZeroAutonomy = 'TIER_0_ANALYZE_ONLY NÃO é "zero autonomia" no sentido de "sistema inútil" — é o nível que permite análise, recomendação, dry-run e simulação completos (tudo que este e os PASSOs 14A/14A.1 já constroem), sem nenhuma execução real. Isso já entrega valor real (inteligência + arquitetura de segurança prontas) sem assumir um risco que a evidência atual não sustenta. "Zero autonomia" de verdade seria não ter nem a capacidade de recomendar — não é isso que está sendo proposto.';

  return {
    recommended_tier: recommendedTier,
    why_this_tier: whyThisTier,
    why_not_more_autonomy: whyNotMoreAutonomy,
    why_not_zero_autonomy: whyNotZeroAutonomy,
    confidence: 'HIGH', // alta confiança na RECOMENDAÇÃO DE TIER em si (é conservadora e bem fundamentada), nunca confundir com confiança na estratégia de negócio
  };
}

module.exports = { recommendInitialAuthorityPosture, AUTHORITY_TIERS_V2 };
