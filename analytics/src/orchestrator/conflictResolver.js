'use strict';

const { CANDIDATE_RELATIONS } = require('./enums');

// item 8 — Conflict Resolver entre candidatos (distinto de sourceOfTruthHierarchy.js, que
// resolve conflito entre ALEGAÇÕES de agentes). Classifica a relação real entre cada par de
// candidatos — nunca assume independência por padrão.
function classifyRelation(a, b) {
  if (a.dependencies.includes(b.candidate_id)) return { relation: 'DEPENDS_ON', from: a.candidate_id, to: b.candidate_id, reason: `${a.candidate_id} lista ${b.candidate_id} como dependência real.` };
  if (b.dependencies.includes(a.candidate_id)) return { relation: 'ENABLES', from: a.candidate_id, to: b.candidate_id, reason: `${a.candidate_id} desbloqueia ${b.candidate_id} (${b.candidate_id} depende dele).` };

  if (a.action_class === 'HOLD_CAPITAL' && b.action_class !== 'HOLD_CAPITAL') {
    return { relation: 'CONFLICTS_WITH', from: a.candidate_id, to: b.candidate_id, reason: 'HOLD_CAPITAL e qualquer ação que gaste/comprometa capital são mutuamente exclusivos por definição neste ciclo.' };
  }
  if (b.action_class === 'HOLD_CAPITAL' && a.action_class !== 'HOLD_CAPITAL') {
    return { relation: 'CONFLICTS_WITH', from: a.candidate_id, to: b.candidate_id, reason: 'mesma razão, invertida.' };
  }

  if (a.action_class === 'COLLECT_EVIDENCE' && b.action_class === 'COLLECT_EVIDENCE' && a.capital_required === 0 && b.capital_required === 0) {
    return { relation: 'COMPLEMENTS', from: a.candidate_id, to: b.candidate_id, reason: 'ambos são coleta de evidência de custo zero, sem competir por capital — podem coexistir no mesmo ciclo.' };
  }

  return { relation: 'INDEPENDENT', from: a.candidate_id, to: b.candidate_id, reason: 'nenhuma dependência, conflito de recurso ou sobreposição identificada.' };
}

function buildConflictMatrix(candidates) {
  const relations = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      relations.push(classifyRelation(candidates[i], candidates[j]));
    }
  }
  const contradictory = relations.filter((r) => r.relation === 'CONFLICTS_WITH');
  return { relations, contradictory_pairs: contradictory, relation_types: CANDIDATE_RELATIONS };
}

module.exports = { classifyRelation, buildConflictMatrix, CANDIDATE_RELATIONS };
