'use strict';

const { CAUSAL_METHODS } = require('./enums');

// item 25 — disciplina causal: BEFORE_AFTER != CAUSAL_PROOF, PLATFORM_REPORTED_LIFT != FINANCIAL_
// LIFT, CORRELATION != EXPERIMENT_RESULT. Testes multi-variável reduzem confiança causal.
const CAUSAL_CONFIDENCE_BY_METHOD = {
  BEFORE_AFTER: 'LOW', // confunde tendência de mercado/sazonalidade com efeito real
  CORRELATION: 'LOW',
  PLATFORM_REPORTED_LIFT: 'LOW', // é a própria plataforma medindo o próprio impacto — conflito de interesse estrutural
  CONTROLLED_EXPERIMENT: 'MEDIUM', // sem randomização real confirmada no sistema hoje, nunca HIGH por padrão
  UNKNOWN: 'NOT_ASSESSABLE',
};

/**
 * classifyCausalMethod() — item 25. Classifica CORRETAMENTE o método disponível quando não há
 * randomização/grupo de controle real — nunca infla a confiança da forma de medição disponível.
 */
function classifyCausalMethod({ hasRandomization, hasControlGroup, comparesBeforeAfter, isMultiVariable }) {
  let method;
  if (hasRandomization && hasControlGroup) method = 'CONTROLLED_EXPERIMENT';
  else if (comparesBeforeAfter) method = 'BEFORE_AFTER';
  else method = 'UNKNOWN';

  let confidence = CAUSAL_CONFIDENCE_BY_METHOD[method];
  if (isMultiVariable && confidence === 'MEDIUM') confidence = 'LOW'; // item 25 — múltiplas variáveis reduzem confiança causal, mesmo com controle

  return {
    method,
    causal_confidence: confidence,
    reason: method === 'UNKNOWN'
      ? 'sem randomização, grupo de controle nem comparação temporal explícita — método causal não identificável, nunca presumido.'
      : `classificado como ${method}${isMultiVariable ? ' (multi-variável — confiança causal reduzida, item 25)' : ''}.`,
  };
}

module.exports = { CAUSAL_METHODS, CAUSAL_CONFIDENCE_BY_METHOD, classifyCausalMethod };
