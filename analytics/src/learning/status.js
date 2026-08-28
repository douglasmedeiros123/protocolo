'use strict';

// Estados de HIPÓTESE (agregado de todos os experimentos que testaram a mesma chave canônica).
// Regra matemática, documentada — nunca opinião de IA:
//
//   CONTRADICTED : successes >= 1 E failures >= 1 (evidência real em direções opostas)
//   INVALIDATED  : failures >= 2 E successes == 0 (falhou repetidamente, nunca teve sucesso)
//   STRONG       : successes >= 3 E failures == 0 E confidence >= 75
//   SUPPORTED    : successes >= 2 E failures == 0 E confidence >= 50
//   PROVISIONAL  : qualquer outro caso com times_tested >= 1 (1ª observação, ou sucesso único
//                  ainda sem repetição suficiente pra virar SUPPORTED)
//
// A ordem de verificação importa: CONTRADICTED e INVALIDATED são checados ANTES de
// SUPPORTED/STRONG porque evidência negativa nunca deve ser mascarada por uma leitura otimista.
function classifyHypothesisStatus({ successes, failures, confidence }) {
  if (successes >= 1 && failures >= 1) {
    return { status: 'CONTRADICTED', reason: `${successes} sucesso(s) e ${failures} falha(s) — evidência real em direções opostas.` };
  }
  if (failures >= 2 && successes === 0) {
    return { status: 'INVALIDATED', reason: `${failures} falhas, nenhum sucesso — hipótese refutada repetidamente.` };
  }
  if (successes >= 3 && failures === 0 && confidence >= 75) {
    return { status: 'STRONG', reason: `${successes} sucessos consistentes, confidence ${confidence.toFixed(1)} >= 75.` };
  }
  if (successes >= 2 && failures === 0 && confidence >= 50) {
    return { status: 'SUPPORTED', reason: `${successes} sucessos consistentes, confidence ${confidence.toFixed(1)} >= 50.` };
  }
  return { status: 'PROVISIONAL', reason: 'Evidência ainda insuficiente pra classificar como SUPPORTED/STRONG/INVALIDATED.' };
}

module.exports = { classifyHypothesisStatus };
