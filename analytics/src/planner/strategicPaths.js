'use strict';

/**
 * aggregateCostModel() — PASSO 11.1, items 19-20. Soma analysis/implementation/measurement por
 * componente — nunca funde tudo num único "estimated_cost" que esconderia measurement_capital
 * desconhecido atrás de um total aparentemente inofensivo. Se QUALQUER ação do path tem um
 * componente NOT_ESTIMABLE, esse componente do agregado também fica NOT_ESTIMABLE (nunca 0).
 */
function aggregateCostModel(actions) {
  function sumField(field) {
    const values = actions.map((a) => a.cost_model[field]);
    if (values.some((v) => v === 'NOT_ESTIMABLE' || v == null)) return 'NOT_ESTIMABLE';
    return values.reduce((s, v) => s + v, 0);
  }
  const analysis = sumField('analysis_cost');
  const implementation = sumField('implementation_cost');
  const measurement = sumField('measurement_capital');
  const anyUnknown = [analysis, implementation, measurement].some((v) => v === 'NOT_ESTIMABLE');
  return {
    analysis_cost: analysis, implementation_cost: implementation, measurement_capital: measurement,
    total_known_cost: anyUnknown ? 'NOT_ESTIMABLE' : analysis + implementation + measurement,
  };
}

const PATH_LABELS = {
  CRO: 'CAPITAL EFFICIENT VALIDATION (CRO)',
  CREATIVE: 'CREATIVE IMPROVEMENT',
  OFFER: 'MONETIZATION (OFFER)',
  MEDIA_BUYING: 'MEDIA BUYING EFFICIENCY',
};

/**
 * buildStrategicPaths() — items 25/71. Gera 2-5 caminhos a partir dos candidatos/ações REAIS já
 * montados (actionAssembler.js) — nunca inventa uma ação que não exista no lote real. Um path por
 * source_agent com pelo menos 1 ação, ordenado pela sequência real de dependência.
 */
function buildStrategicPaths(actions) {
  const bySource = {};
  for (const a of actions) {
    if (!bySource[a.source_agent]) bySource[a.source_agent] = [];
    bySource[a.source_agent].push(a);
  }

  const paths = [];
  let pathIndex = 0;
  for (const [source, sourceActions] of Object.entries(bySource)) {
    pathIndex += 1;
    const ordered = [...sourceActions].sort((a, b) => (a.dependency_ids.length - b.dependency_ids.length) || ((a.rank ?? 0) - (b.rank ?? 0)));
    const costModel = aggregateCostModel(ordered);
    const hasFreeValidation = ordered.some((a) => a.action_type === 'VALIDATE' || a.action_type === 'FIX');
    paths.push({
      path_id: `PATH-${String.fromCharCode(64 + pathIndex)}`, // PATH-A, PATH-B...
      objective: PATH_LABELS[source] || `${source} — próximos passos reais`,
      source_agent: source,
      actions: ordered.map((a) => a.action_id),
      dependencies: [...new Set(ordered.flatMap((a) => a.dependency_ids))],
      cost_model: costModel, // item 20 — analysis/implementation/measurement separados, nunca um único número que esconde o desconhecido
      information_gain: hasFreeValidation ? 'ALTO — inclui validação/correção de custo ~R$0 antes de comprometer capital.' : 'MEDIUM — depende do resultado do experimento real.',
      economic_potential: 'NOT_ESTIMABLE', // nunca inventado (item 27/36) — item 21: preserva NOT_ESTIMABLE mesmo quando a análise em si é barata
      confidence: ordered.length ? (ordered.reduce((s, a) => s + (a.confidence ?? 0), 0) / ordered.filter((a) => a.confidence != null).length || null) : null,
      risk: ordered.some((a) => a.action_type === 'RUN_EXPERIMENT') ? 'MEDIUM' : 'LOW',
    });
  }

  return paths.slice(0, 5); // item 71 — no máximo 5, sem inventar além do que os dados reais sustentam
}

module.exports = { buildStrategicPaths, PATH_LABELS };
