'use strict';

const { FUTURE_HUMAN_APPROVAL_THRESHOLD_CRITERIA } = require('./enums');

// PASSO 14B, item 19, recalibrado (correção semântica final) — CURRENT_AUTHORITY_STATE !=
// PERMANENT_ECONOMIC_POLICY. AUTONOMOUS_EXECUTION_LIMIT=R$0 é real e defensável ENQUANTO o tier
// atual for TIER_0 (status=DEFENSIBLE_CURRENT_TIER_LIMIT — não uma política econômica
// permanente). HUMAN_APPROVAL_THRESHOLD não é R$0 "por política" — o próprio conceito ainda não
// se aplica, porque não existe execução autônoma real pra um humano aprovar em TIER_0
// (status=NOT_APPLICABLE_AT_TIER_0, nunca um valor numérico inventado agora).
function recommendInitialRealLimits({ financialRoasFinanceiro, cpaFinanceiro, completedExperiments, financialTruthHealthStatus, currentAuthorityTier = 'TIER_0_ANALYZE_ONLY' }) {
  const belowBreakEven = financialRoasFinanceiro != null && financialRoasFinanceiro < 1.0;
  const isTier0 = currentAuthorityTier === 'TIER_0_ANALYZE_ONLY';

  return [
    {
      category: 'HARD_SAFETY_LIMIT',
      recommendation: 'NOT_CONFIGURED',
      status: 'NOT_DEFENSIBLE_TO_SET',
      reason: 'um teto de segurança absoluto (max_loss_before_pause) depende de quanto capital o negócio pode perder sem ameaçar continuidade — isso é uma decisão de tolerância a risco pessoal/do negócio que nenhuma métrica operacional deste sistema mede. Recomendo que Douglas defina este número diretamente; o sistema não deveria inventá-lo.',
    },
    {
      category: 'AUTONOMOUS_LIMIT',
      recommendation: 0,
      status: 'DEFENSIBLE_CURRENT_TIER_LIMIT', // real, mas válido só ENQUANTO tier=TIER_0 — nunca representado como teto permanente
      reason: `financial_roas_financeiro real hoje = ${financialRoasFinanceiro} (${belowBreakEven ? 'abaixo de break-even' : 'em ou acima de break-even'}), ${completedExperiments} experimento(s) real(is) concluído(s) pela máquina. Com ROAS abaixo de 1.0 e zero histórico de execução confiável, R$0 é o limite autônomo real do tier atual (TIER_0) — não uma política econômica final, só o reflexo honesto do estado presente. Quando o tier mudar (nunca decidido pela LLM — authorityPromotionGate.js), este valor deve ser reavaliado, não herdado como teto permanente.`,
    },
    {
      category: 'HUMAN_APPROVAL_THRESHOLD',
      recommendation: isTier0 ? 'NOT_APPLICABLE' : 'NOT_CONFIGURED',
      status: isTier0 ? 'NOT_APPLICABLE_AT_TIER_0' : 'NOT_DEFENSIBLE_TO_SET',
      reason: isTier0
        ? 'em TIER_0_ANALYZE_ONLY não existe execução financeira autônoma nenhuma — o conceito de "acima de qual valor um humano precisa aprovar" pressupõe que ALGUM valor poderia ser executado sem aprovação, o que não é o caso aqui. Representar isso como R$0 sugeriria uma política econômica ("aprovar tudo acima de zero"), quando na verdade é a AUSÊNCIA do próprio mecanismo neste tier — nunca confundir os dois.'
        : 'tier atual não é TIER_0 — o conceito se aplica, mas nenhum valor real foi configurado ainda.',
      future_determination_criteria: isTier0 ? FUTURE_HUMAN_APPROVAL_THRESHOLD_CRITERIA : undefined,
      note: isTier0 ? 'quando a máquina subir de tier (promoção real, nunca decidida pela LLM), este threshold será determinado pelos critérios listados em future_determination_criteria — nunca inventado agora.' : undefined,
    },
    {
      category: 'EXPERIMENT_LOSS_LIMIT',
      recommendation: 'NOT_CONFIGURED',
      status: 'NOT_DEFENSIBLE_TO_SET',
      reason: `existe um dado real de referência (cpa_financeiro atual = R$${cpaFinanceiro?.toFixed?.(2) ?? cpaFinanceiro}), mas transformar isso num teto de perda por experimento exigiria uma escolha de multiplicador de risco (quantos CPAs de exposição são aceitáveis por teste) que é uma decisão de apetite a risco do Douglas, não algo derivável só do CPA. Recomendo usar R$${cpaFinanceiro?.toFixed?.(2) ?? cpaFinanceiro} (custo real de 1 transação hoje) como ponto de referência pra essa conversa, não como o limite em si.`,
    },
  ].map((item) => ({ ...item, financial_truth_health_status: financialTruthHealthStatus, evaluated_at_authority_tier: currentAuthorityTier }));
}

module.exports = { recommendInitialRealLimits, FUTURE_HUMAN_APPROVAL_THRESHOLD_CRITERIA };
