'use strict';

// ============================================================================================
// HANDOFF ESTRUTURAL PARA O PASSO 13 — MEASUREMENT & ATTRIBUTION INTELLIGENCE (NÃO IMPLEMENTAR
// AGORA).
//
// O Strategy Search fornece, pra qualquer produto/estado real reconstruído:
//   - recommendation (arquitetura recomendada + confidence + rationale)
//   - test_eligibility (READY/BLOCKED/NEEDS_TRACKING/NEEDS_IMPLEMENTATION/NEEDS_EVIDENCE/UNKNOWN)
//   - current_blocker (qual blocker resolver primeiro)
//   - remaining_blockers (o que ainda falta depois desse — nunca escondido, item 5)
//   - next_unlock (o próximo blocker que aparece assim que o atual for resolvido)
//   - tracking_readiness / evidence_gaps (com blocking_classification de cada um)
//
// O PASSO 13 (e qualquer Agent futuro) deve CONSUMIR o estado real reconstruído nesses campos —
// NUNCA um valor fixo documentado aqui. A recomendação, o blocker atual e os blockers restantes
// mudam conforme a evidência real muda (novo diagnóstico CRO/Offer/Creative, novo experimento
// concluído, etc.) — este comentário nunca deve ficar desatualizado porque a recomendação mudou
// (PASSO 12.3, item 6). O Measurement & Attribution Intelligence Agent continua sendo
// estruturalmente necessário sempre que TRACKING aparecer em current_blocker/remaining_blockers
// de qualquer arquitetura real — mas ele NUNCA deve ser tratado como suficiente sozinho pra
// liberar capital se também houver um BLOCKING_PREREQUISITE_EVIDENCE real (de mercado/cliente)
// na cadeia — essa seria responsabilidade de uma camada futura apropriada (Customer/Market
// Intelligence), não do Measurement Agent (item 7).
// ============================================================================================

// item 5 (PASSO 12.3) — ordem de resolução dos blockers: evidência-prerequisito primeiro (sem
// saber O QUE testar, tracking/implementação são prematuros), depois tracking (sem medir, testar
// não gera aprendizado), depois implementação (o componente em si ainda não existe). Documentado,
// nunca escolhido caso a caso.
const BLOCKER_ORDER = ['EVIDENCE', 'TRACKING', 'IMPLEMENTATION'];
const ELIGIBILITY_STATE_BY_BLOCKER = { EVIDENCE: 'NEEDS_EVIDENCE', TRACKING: 'NEEDS_TRACKING', IMPLEMENTATION: 'NEEDS_IMPLEMENTATION' };

/**
 * evaluateArchitectureTestEligibility() — item 84 (PASSO 12), recalibrado no PASSO 12.1 (item 1:
 * sem circularidade — EVIDENCE_OBJECTIVE nunca bloqueia a si mesmo) e no PASSO 12.3 (items 1-5:
 * só gaps com blocking_classification=BLOCKING_PREREQUISITE_EVIDENCE entram na cadeia; "seria
 * melhor saber" nunca bloqueia; retorna a cadeia INTEIRA de blockers, nunca só o primeiro —
 * current_blocker/remaining_blockers/next_unlock, nada escondido).
 */
function evaluateArchitectureTestEligibility({ trackingReadiness, isCurrent, evidenceGaps = [] }) {
  if (isCurrent) {
    return { eligibility: 'READY', current_blocker: null, remaining_blockers: [], next_unlock: null, blockers_detail: [], reason: 'já implementada e instrumentada — não exige nova elegibilidade de teste.' };
  }

  const blockingGaps = evidenceGaps.filter((g) => g.blocking === true);
  const blockersPresent = [];
  if (blockingGaps.length > 0) {
    blockersPresent.push({
      type: 'EVIDENCE',
      reason: `evidência prévia indispensável pra definir/interpretar o teste corretamente ainda não coletada: ${blockingGaps.map((g) => `${g.gap_type} (${g.blocking_rationale || g.reason})`).join('; ')}.`,
      gaps: blockingGaps,
    });
  }
  if (trackingReadiness !== 'READY') {
    blockersPresent.push({
      type: 'TRACKING',
      reason: trackingReadiness === 'NOT_READY'
        ? 'estágios novos sem instrumentação real confirmada hoje — sem tracking mínimo, o teste seria inconclusivo.'
        : 'parte dos estágios novos ainda sem instrumentação real — sem isso o teste geraria dado incompleto.',
    });
  }
  // implementação é sempre necessária pra uma arquitetura CANDIDATE real (o componente novo
  // ainda não existe) — item 5: nunca escondida, mesmo quando não é o blocker atual.
  blockersPresent.push({ type: 'IMPLEMENTATION', reason: 'o(s) componente(s) novo(s) desta arquitetura ainda não foram implementados de fato.' });

  const ordered = BLOCKER_ORDER.map((t) => blockersPresent.find((b) => b.type === t)).filter(Boolean);
  const [current, ...remaining] = ordered;

  return {
    eligibility: ELIGIBILITY_STATE_BY_BLOCKER[current.type],
    current_blocker: current.type,
    remaining_blockers: remaining.map((b) => b.type),
    next_unlock: remaining.length > 0 ? remaining[0].type : null,
    blockers_detail: ordered,
    reason: current.reason,
  };
}

// item 74 — só permite teste paralelo se capital/tracking/separação causal/capacidade
// operacional permitirem — NUNCA executa, só avalia elegibilidade.
function evaluateParallelTestEligibility({ candidateA, candidateB, capitalAvailable }) {
  if (!candidateA || !candidateB) return { eligible: false, reason: 'menos de 2 candidatos elegíveis pra paralelizar.' };
  const bothReady = candidateA.tracking_readiness === 'READY' && candidateB.tracking_readiness === 'READY';
  const causallySeparable = candidateA.family !== candidateB.family; // famílias diferentes -> menor risco de confundir causa
  const capitalKnown = capitalAvailable != null;
  const eligible = bothReady && causallySeparable && capitalKnown;
  return {
    eligible,
    reason: eligible
      ? 'ambos READY em tracking, famílias diferentes (separação causal plausível), capital configurado.'
      : `bloqueado — tracking_ready=${bothReady}, causal_separation=${causallySeparable}, capital_configurado=${capitalKnown}.`,
  };
}

module.exports = { evaluateArchitectureTestEligibility, evaluateParallelTestEligibility, BLOCKER_ORDER, ELIGIBILITY_STATE_BY_BLOCKER };
