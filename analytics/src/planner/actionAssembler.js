'use strict';

const { getBestCreativeExperimentCandidate } = require('../decision/creativeIntegration');
const { getBestCroAction } = require('../decision/croIntegration');
const { getBestOfferCandidate } = require('../decision/offerIntegration');
const { minimumEvidenceFor } = require('../experiments/evidence');
const { buildAction, resolveDependencies, detectStrategicContradictions, finalizeActionStatuses, resetActionCounter } = require('./strategicActions');
const { evaluateActionTrackingEligibility } = require('./trackingBlockMatrix');

// PASSO 11.1, item 19-21 — measurement_capital de RUN_EXPERIMENT: reusa minimumEvidenceFor()
// (experiments/evidence.js, já existente) quando a categoria tem um `spend` mínimo REAL
// documentado (só MEDIA_BUYING hoje). Pra CREATIVE/CRO/OFFER/AOV, minimumEvidenceFor() já
// declara spend:null (o volume necessário depende das taxas reais do funil, não é um número
// fixo conhecido) — nunca inventamos um valor ali; measurement_capital fica NOT_ESTIMABLE.
function measurementCapitalForCategory(category) {
  try {
    const min = minimumEvidenceFor(category);
    return min.spend != null ? min.spend : 'NOT_ESTIMABLE';
  } catch {
    return 'NOT_ESTIMABLE';
  }
}

/**
 * assembleStrategicActions() — items 14/27-29/68 (PASSO 11) + tracking por escopo (PASSO 11.1,
 * items 4/7). Consome as integrações read-only já existentes — NUNCA lê registries de outro
 * domínio diretamente.
 */
function assembleStrategicActions({ productId, trackingScopes, capitalAvailable, croDir, creativeDir, offerDir }) {
  resetActionCounter();
  const raw = [];

  // CRO: técnicas (VALIDATE/FIX, custo ~0 nos 3 componentes — checagem de código/UI, não mídia)
  // + RUN_EXPERIMENT (mede via Hotmart/funil — measurement_capital NOT_ESTIMABLE, já que a
  // categoria CRO não tem spend mínimo fixo documentado).
  const croAction = getBestCroAction(croDir);
  for (const ta of croAction.actions) {
    if (ta.action_type === 'VALIDATE_TECHNICAL_ISSUE' || ta.action_type === 'FIX_TECHNICAL_ISSUE') {
      raw.push(buildAction({
        productId, sourceAgent: 'CRO', sourceCandidateId: ta.diagnostic_id,
        actionType: ta.action_type === 'FIX_TECHNICAL_ISSUE' ? 'FIX' : 'VALIDATE',
        objective: ta.description,
        expectedInformationGain: 'ALTO — custo ~R$0, resolve incerteza sobre um achado técnico real (item 14).',
        costModel: { analysisCost: 0, implementationCost: ta.estimated_cost_reais ?? 0, measurementCapital: 0 },
        successCondition: 'achado técnico confirmado/corrigido e validado.',
        failureCondition: 'achado técnico não confirmado ou correção não resolve o sintoma observado.',
      }));
    } else if (ta.action_type === 'RUN_EXPERIMENT') {
      raw.push(buildAction({
        productId, sourceAgent: 'CRO', sourceCandidateId: ta.candidate_id,
        actionType: 'RUN_EXPERIMENT', objective: `Rodar experimento CRO: ${ta.variable_changed || ta.candidate_id}.`,
        targetMetric: ta.target_metric, confidence: ta.confidence,
        costModel: { analysisCost: 0, implementationCost: 0, measurementCapital: measurementCapitalForCategory('CRO') },
        successCondition: ta.offer_brief ? ta.offer_brief.success_condition : null,
        failureCondition: ta.offer_brief ? ta.offer_brief.failure_condition : null,
        killCondition: ta.offer_brief ? ta.offer_brief.kill_condition : null,
      }));
    }
  }

  // CREATIVE: gerar/analisar o candidato é ~R$0 (computacional), mas VALIDAR performance real
  // exige mídia — measurement_capital nunca é silenciosamente 0 (item 19).
  const creativeCandidate = getBestCreativeExperimentCandidate(creativeDir);
  if (creativeCandidate) {
    raw.push(buildAction({
      productId, sourceAgent: 'CREATIVE', sourceCandidateId: creativeCandidate.candidate_id,
      actionType: 'RUN_EXPERIMENT', objective: `Testar candidato criativo: ${creativeCandidate.candidate_id}.`,
      targetMetric: creativeCandidate.target_metric ?? null, confidence: creativeCandidate.confidence ?? null,
      costModel: { analysisCost: 0, implementationCost: 0, measurementCapital: measurementCapitalForCategory('CREATIVE') },
    }));
  }

  // OFFER: mesma disciplina — análise/gerar candidato é barata, provar impacto real não é.
  const offerCandidate = getBestOfferCandidate(offerDir);
  if (offerCandidate) {
    raw.push(buildAction({
      productId, sourceAgent: 'OFFER', sourceCandidateId: offerCandidate.candidate_id,
      actionType: 'RUN_EXPERIMENT', objective: `Testar candidato de oferta: ${offerCandidate.variable_changed || offerCandidate.candidate_id}.`,
      targetMetric: offerCandidate.target_metric ?? null, confidence: offerCandidate.confidence ?? null,
      // item 21 — nunca afirmar economic impact zero/positivo só porque a análise é barata.
      expectedEconomicImpact: 'NOT_ESTIMABLE',
      costModel: { analysisCost: 0, implementationCost: 0, measurementCapital: measurementCapitalForCategory('OFFER') },
    }));
  }

  // PASSO 11.1, item 4/7 — elegibilidade de tracking calculada POR AÇÃO, nunca pro produto inteiro.
  for (const action of raw) {
    action.tracking_eligibility = evaluateActionTrackingEligibility(action, trackingScopes);
  }

  resolveDependencies(raw);
  const contradictions = detectStrategicContradictions(raw, { capitalAvailable });
  finalizeActionStatuses(raw, contradictions);

  return { actions: raw, contradictions };
}

module.exports = { assembleStrategicActions, measurementCapitalForCategory };
