'use strict';

const { POLICY_FUNCTIONS } = require('./policyCategories');
const { POLICY_RESULTS, POLICY_CATEGORIES } = require('./enums');

// item 14A.2 — precedência determinística, do mais restritivo pro menos restritivo. O resultado
// final da Policy Engine é sempre o mais restritivo entre todas as categorias avaliadas — nunca
// uma média, nunca escolhido por confiança da LLM (item 14A.2: "a LLM não pode sobrescrever
// Policy Engine").
const RESULT_PRECEDENCE = ['DENY', 'REQUIRE_HUMAN_APPROVAL', 'DEFER', 'ALLOW_DRY_RUN_ONLY', 'ALLOW'];

/**
 * evaluateActionWithPolicyEngine() — item 14A.2. Roda TODAS as categorias aplicáveis (mínimo das
 * 11 do item 14A.3), agrega pelo resultado mais restritivo, com rationale estruturado por
 * categoria — nunca esconde por que uma categoria específica decidiu o resultado final.
 */
function evaluateActionWithPolicyEngine({ action, context }) {
  const categoryResults = Object.entries(POLICY_FUNCTIONS).map(([category, fn]) => {
    try {
      return fn({ action, ...context });
    } catch (err) {
      return { category, result: 'DEFER', rationale: `erro ao avaliar política — nunca falha aberto: ${err.message}` };
    }
  });

  for (const r of categoryResults) {
    if (!POLICY_RESULTS.includes(r.result)) throw new Error(`categoria ${r.category} devolveu resultado inválido: ${r.result}`);
  }

  let finalResult = 'ALLOW';
  for (const precedent of RESULT_PRECEDENCE) {
    if (categoryResults.some((r) => r.result === precedent)) { finalResult = precedent; break; }
  }

  // PASSO 14A.1, item 5 — nunca esconder outros blockers só porque uma categoria já decidiu o
  // resultado final. decisive_policies = as que empataram no resultado mais restritivo (o "por
  // quê" da decisão final); all_blocking_or_deferring_policies = TODA categoria != ALLOW, mesmo
  // as que não decidiram o resultado final (ex.: MEASUREMENT_READINESS_POLICY aparece aqui
  // mesmo quando CAPITAL_LIMIT_POLICY já produziu o DEFER decisivo); non_decisive_warnings = as
  // que restam depois de tirar as decisivas — nunca confundir "X bloqueou" com "X é o único
  // problema".
  const decisivePolicies = categoryResults.filter((r) => r.result === finalResult);
  const allBlockingOrDeferring = categoryResults.filter((r) => r.result !== 'ALLOW');
  const nonDecisiveWarnings = allBlockingOrDeferring.filter((r) => r.result !== finalResult);

  return {
    final_result: finalResult,
    decisive_policies: decisivePolicies.map((r) => r.category),
    all_blocking_or_deferring_policies: allBlockingOrDeferring.map((r) => ({ category: r.category, result: r.result, rationale: r.rationale })),
    non_decisive_warnings: nonDecisiveWarnings.map((r) => ({ category: r.category, result: r.result, rationale: r.rationale })),
    category_results: categoryResults,
    llm_override_possible: false, // item 14A.2 — nunca sobrescrevível pela LLM, documentado explicitamente no output
    evaluated_at: new Date().toISOString(),
  };
}

module.exports = { evaluateActionWithPolicyEngine, RESULT_PRECEDENCE, POLICY_RESULTS, POLICY_CATEGORIES };
