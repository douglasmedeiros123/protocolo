'use strict';

const { SCALE_LADDER_STAGES } = require('./enums');

// PASSO 14B, item 9 — escada de escala, critérios de entrada/saída por estágio. Consome North
// Star ROAS=3.0 (decision/northStar.js) como objetivo estratégico existente — mas
// ROAS3_TARGET != REQUIREMENT_FOR_EVERY_INTERMEDIATE_TEST: um MVA test em STAGE_0/1 nunca
// precisa bater ROAS 3.0 pra ser considerado bem-sucedido, só precisa gerar sinal interpretável.
const SCALE_LADDER_DEFINITIONS = {
  STAGE_0_VALIDATION: {
    entry_criteria: 'hipótese estrutural existe (Strategy Search gerou um candidato real), tracking mínimo pronto (capital_gate != BLOCKED_BY_MEASUREMENT).',
    exit_criteria: 'MVA test concluído com resultado (SUCCESS/FAILURE/INCONCLUSIVE) real — nunca por tempo decorrido sozinho.',
    capital_bucket: 'VALIDATION_CAPITAL',
    roas_requirement: 'NENHUM — item central: ROAS3_TARGET != REQUIREMENT_FOR_EVERY_INTERMEDIATE_TEST. Neste estágio, o critério é sinal interpretável, não ROAS absoluto.',
  },
  STAGE_1_SIGNAL_CONFIRMED: {
    entry_criteria: 'STAGE_0 concluído com SUCCESS — sinal direcional real existe.',
    exit_criteria: 'confirmação econômica com amostra suficiente (financial_roas real medido, sample_sufficient=true).',
    capital_bucket: 'VALIDATION_CAPITAL',
    roas_requirement: 'NENHUM valor absoluto exigido — só direção positiva consistente.',
  },
  STAGE_2_ECONOMIC_CONFIRMATION: {
    entry_criteria: 'STAGE_1 concluído — sinal confirmado com amostra suficiente.',
    exit_criteria: 'financial_roas >= 1.0 sustentado (break-even ou melhor) por período real, marginal_roas conhecido (não UNKNOWN).',
    capital_bucket: 'EXPLOITATION_CAPITAL (início)',
    roas_requirement: 'financial_roas >= 1.0 (break-even) — ainda não exige o North Star completo.',
  },
  STAGE_3_CONTROLLED_SCALE: {
    entry_criteria: 'STAGE_2 concluído — economicamente confirmado, marginal economics conhecida e positiva.',
    exit_criteria: 'financial_roas se aproxima do North Star (marcos 1.5/2.0, decision/northStar.js MILESTONES) de forma sustentada.',
    capital_bucket: 'EXPLOITATION_CAPITAL',
    roas_requirement: 'progride pelos marcos do North Star (1.0 -> 1.5 -> 2.0) — nunca pula direto pra 3.0.',
  },
  STAGE_4_AGGRESSIVE_SCALE: {
    entry_criteria: 'financial_roas >= North Star target (3.0) sustentado, marginal_roas positivo confirmado, authority tier promovido por evidência real (não por este estágio sozinho).',
    exit_criteria: 'NOT_APPLICABLE — estágio de operação contínua, sujeito a demoção se a economia deteriorar.',
    capital_bucket: 'EXPLOITATION_CAPITAL (máximo)',
    roas_requirement: 'financial_roas >= 3.0 (North Star completo) sustentado.',
  },
};

function classifyCurrentStage({ financialRoas, sampleSufficient, marginalRoasKnown, hasCompletedValidation, hasSignalConfirmed }) {
  if (!hasCompletedValidation) return { stage: 'STAGE_0_VALIDATION', reason: 'nenhuma validação estrutural concluída ainda.' };
  if (!hasSignalConfirmed) return { stage: 'STAGE_1_SIGNAL_CONFIRMED', reason: 'validação concluída, sinal ainda não confirmado com amostra suficiente.' };
  if (financialRoas == null || financialRoas < 1.0 || !sampleSufficient) return { stage: 'STAGE_1_SIGNAL_CONFIRMED', reason: 'sinal confirmado mas ainda sem break-even/amostra suficiente sustentados.' };
  if (!marginalRoasKnown) return { stage: 'STAGE_2_ECONOMIC_CONFIRMATION', reason: 'break-even real, mas marginal economics ainda UNKNOWN — não avança pra escala controlada sem isso.' };
  if (financialRoas < 3.0) return { stage: 'STAGE_3_CONTROLLED_SCALE', reason: `financial_roas=${financialRoas} entre break-even e o North Star (3.0) — escala controlada.` };
  return { stage: 'STAGE_4_AGGRESSIVE_SCALE', reason: `financial_roas=${financialRoas} >= North Star (3.0).` };
}

module.exports = { SCALE_LADDER_STAGES, SCALE_LADDER_DEFINITIONS, classifyCurrentStage };
