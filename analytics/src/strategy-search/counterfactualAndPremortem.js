'use strict';

/**
 * evaluateCounterfactual() — item 69 (PASSO 12), recalibrado no PASSO 12.1 item 12: a posição no
 * ranking NUNCA é a única razão citada — o basis sempre incorpora a economia real (ROAS/gap),
 * known_path_to_target e o diagnóstico estrutural, não só "venceu/perdeu o ranking". YES/NO
 * puros exigiriam experimento comparativo real concluído — sem isso o teto é sempre
 * PROBABLY_YES/PROBABLY_NO.
 */
function evaluateCounterfactual({ ranking, hasCompletedComparativeExperiment, knownPathToTarget, financialRoas, targetRoas, comparativeEvidence }) {
  const currentEntry = ranking.find((r) => r.is_current);
  if (!currentEntry) return { answer: 'UNKNOWN', basis: 'arquitetura atual não encontrada no ranking.' };

  const isTop = currentEntry.rank === 1;
  const tiedWithTop = ranking.filter((r) => r.rank === currentEntry.rank).length > 1;
  const economicsNote = financialRoas != null && targetRoas != null ? `ROAS financeiro real ${financialRoas} vs target ${targetRoas}` : 'economia real indisponível';
  const pathNote = knownPathToTarget ? `known_path_to_target=${knownPathToTarget.status}` : 'known_path_to_target não avaliado';

  if (tiedWithTop) {
    return { answer: 'UNKNOWN', basis: 'a arquitetura atual está em empate real (DECISION_TIE) com outra(s) — sem base defensável pra afirmar se a escolheríamos de novo.' };
  }
  if (isTop) {
    // item 12 — mesmo vencendo o ranking hoje, um gap econômico real não fechado (NO_KNOWN_PATH)
    // é considerado no basis, não só a posição — evita "PROBABLY_YES só porque venceu".
    const gapNote = knownPathToTarget && knownPathToTarget.status === 'NO_KNOWN_PATH'
      ? ` Mas ${economicsNote} e ${pathNote} — o gap econômico real não fechado mantém a resposta cautelosa mesmo vencendo hoje.`
      : ` ${economicsNote}, ${pathNote}.`;
    return {
      answer: hasCompletedComparativeExperiment ? 'YES' : 'PROBABLY_YES',
      basis: (hasCompletedComparativeExperiment
        ? 'venceu o ranking real E existe experimento concluído comparando contra alternativa — base forte.'
        : `venceu o ranking real dos fatores comparáveis hoje, mas sem experimento concluído comparando contra challenger nenhum ainda — resposta cai pra PROBABLY_YES.`) + gapNote,
    };
  }
  const winner = ranking.find((r) => r.rank === 1);
  return {
    answer: hasCompletedComparativeExperiment ? 'NO' : 'PROBABLY_NO',
    basis: (hasCompletedComparativeExperiment
      ? `perdeu o ranking real E existe experimento concluído confirmando ${winner.architecture_id} melhor.`
      : `perdeu o ranking real para ${winner.architecture_id} nos fatores comparáveis hoje — mas sem experimento concluído, resposta cai pra PROBABLY_NO.`)
      + ` Diagnóstico estrutural também aponta na mesma direção: ${economicsNote}, ${pathNote}${comparativeEvidence ? `, comparative_evidence=${comparativeEvidence}` : ''} — a decisão não se apoia só na posição do ranking.`,
  };
}

// item 70 — pré-mortem da arquitetura recomendada: modos de falha derivados de propriedades REAIS
// dela (distância, automação, tracking) — nunca genérico ("pode não funcionar").
function buildPreMortem(architecture) {
  const failureModes = [];
  const earlyWarningSignals = [];

  if (architecture.distance === 'HIGH' || architecture.distance === 'RADICAL') {
    failureModes.push('complexidade de implementação real (múltiplos componentes novos) pode consumir mais tempo do que o esperado, atrasando a coleta de evidência.');
    earlyWarningSignals.push('prazo de implementação já ultrapassou o dobro do estimado sem o teste começar a rodar.');
  }
  if (architecture.automation_fitness === 'LOW') {
    failureModes.push('dependência operacional humana pode não escalar ou criar gargalo de atendimento, distorcendo o resultado do teste.');
    earlyWarningSignals.push('tempo de resposta humano no estágio novo consistentemente alto, ou fila de atendimento acumulando.');
  }
  if (architecture.tracking_readiness === 'NOT_READY' || architecture.tracking_readiness === 'PARTIAL') {
    failureModes.push('medição incompleta pode gerar resultado inconclusivo mesmo que a hipótese estrutural esteja correta.');
    earlyWarningSignals.push('eventos esperados do tracking_contract_requirements não aparecendo nos dados coletados.');
  }
  if (architecture.reversibility === 'HARD_TO_REVERSE') {
    failureModes.push('se a hipótese estiver errada, reverter pra arquitetura atual tem custo real (não é uma simples desativação).');
    earlyWarningSignals.push('métrica primária degradando de forma consistente nos primeiros dias, antes mesmo da amostra mínima.');
  }
  if (failureModes.length === 0) {
    failureModes.push('a hipótese estrutural pode simplesmente estar errada — o mecanismo proposto não move a métrica primária mesmo implementado corretamente.');
    earlyWarningSignals.push('métrica primária estável/sem melhora desde o início da coleta.');
  }

  return { top_failure_modes: failureModes, early_warning_signals: earlyWarningSignals };
}

// item 71 — template de pós-mortem, preenchido quando um teste real falhar (não agora — nenhum
// teste foi executado). Nunca conclui invalidação de produto a partir de 1 teste de arquitetura.
function buildPostMortemTemplate(architecture) {
  return {
    architecture_id: architecture.architecture_id,
    status: 'TEMPLATE_NOT_YET_APPLICABLE',
    what_was_falsified: null,
    what_remains_unknown: null,
    what_should_not_be_concluded: `um teste de ${architecture.architecture_id} falhando NUNCA deve ser lido como "o produto é inviável" — só que esta hipótese estrutural específica, medida deste jeito, não confirmou o efeito esperado.`,
    reason: 'preenchido quando um teste real desta arquitetura concluir (SUCCESS/FAILURE/INCONCLUSIVE) — hoje é só o template reservado (item 71).',
  };
}

module.exports = { evaluateCounterfactual, buildPreMortem, buildPostMortemTemplate };
