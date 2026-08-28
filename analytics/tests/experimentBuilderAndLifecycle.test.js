'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildHypothesis } = require('../src/experiments/hypothesis');
const { buildDraftExperiment, closeExperiment } = require('../src/experiments/builder');
const { saveExperiment, loadExperiment, loadAllExperiments } = require('../src/experiments/registry');

function fixtureWindow(overrides = {}) {
  return {
    period: { days_requested: 30 },
    current_financials: {
      cpa_financeiro: 109.79, aov_liquido: 65.11, roas_financeiro: 0.593,
      numero_compradores_reais: 11, gasto_meta: 1207.72, order_bump_attach_rate: 0.273,
      ...overrides.financials,
    },
    profit_status: { status: 'LOSS', reason: 'x' },
    gaps: {
      cpa_path: { reduction_needed_percent: 0.7 },
      aov_path: { increase_needed_percent: 2.37 },
    },
  };
}

// capital_cycle (PASSO 5.1) — nunca o capital_status histórico do Profit Engine.
const capitalCycle = { status: 'CONFIGURED', cycle_budget: 1000, cycle_spent: 0, cycle_committed: 0, cycle_available: 500 };
const dailyRates = { spend_per_day: 40, compras_per_day: 0.37 };

function baseInput(overrides = {}) {
  return {
    category: 'CREATIVE',
    change: 'testarmos X', expectedImprovement: 'Y melhore', reason: 'Z é real',
    targetMetric: 'cpa_financeiro', secondaryMetrics: ['ctr'],
    expectedEffect: { cpaChangePct: -0.15, aovChangePct: 0 },
    budgetLimit: 280,
    dailyRates, existingIds: [],
    startCondition: 'a', stopCondition: 'b', successCondition: 'c', failureCondition: 'd',
    evidenceFlags: { has_specific_measured_metric: true },
    ...overrides,
  };
}

test('hipótese: formato fixo "Se X, esperamos Y porque Z" é montado corretamente', () => {
  const h = buildHypothesis({ change: 'reduzirmos a fricção mobile', expectedImprovement: 'a LPV→Checkout aumente', reason: '71% do tráfego é in-app com baixo engajamento' });
  assert.equal(h.statement, 'Se reduzirmos a fricção mobile, esperamos que a LPV→Checkout aumente porque 71% do tráfego é in-app com baixo engajamento.');
});

test('hipótese incompleta (falta X, Y ou Z) lança erro, não aceita frase solta', () => {
  assert.throws(() => buildHypothesis({ change: 'algo', expectedImprovement: '', reason: 'algo' }));
  assert.throws(() => buildHypothesis({}));
});

test('experimento com baseline completo: todos os campos preenchidos com dado real', () => {
  const exp = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  assert.equal(exp.baseline.cpa_financeiro, 109.79);
  assert.equal(exp.baseline.profit_status, 'LOSS');
});

test('experimento SEM BASELINE (período sem vendas — CPA/AOV null): não quebra, baseline fica com null explícito, não inventa número', () => {
  const window = fixtureWindow({ financials: { cpa_financeiro: null, aov_liquido: null, roas_financeiro: 0, numero_compradores_reais: 0, gasto_meta: 500, order_bump_attach_rate: null } });
  const exp = buildDraftExperiment(baseInput(), window, capitalCycle);
  assert.equal(exp.baseline.cpa_financeiro, null);
  assert.equal(exp.baseline.aov_liquido, null);
  assert.equal(exp.status, 'DRAFT'); // continua criável como DRAFT mesmo sem baseline numérico
});

test('experimento aponta o caminho certo (CPA vs AOV) conforme o target_metric', () => {
  const cpaExp = buildDraftExperiment(baseInput({ targetMetric: 'cpa_financeiro' }), fixtureWindow(), capitalCycle);
  assert.equal(cpaExp.attacks_path, 'CPA');
  const aovExp = buildDraftExperiment(baseInput({ targetMetric: 'aov_liquido' }), fixtureWindow(), capitalCycle);
  assert.equal(aovExp.attacks_path, 'AOV');
});

test('experimento nunca sugere budget_limit acima do capital configurado — budget_check reprova', () => {
  const exp = buildDraftExperiment(baseInput({ budgetLimit: 800 }), fixtureWindow(), capitalCycle); // 800 > 500 restante
  assert.equal(exp.budget_check.valid, false);
});

test('experimento bem-sucedido (SUCCESS): fecha com actual_result, conclusion e learning completo', () => {
  const draft = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  const closed = closeExperiment(draft, {
    status: 'SUCCESS',
    actualResult: { cpa_financeiro: 85 },
    conclusion: 'CPA caiu de R$109,79 para R$85,00 (-22,6%), acima da meta de sucesso (-10%).',
    learningSummary: 'Concentrar mídia nos 2 criativos provados reduz CPA de verdade.',
    whatNotToRepeat: 'Não espalhar orçamento em variantes sem amostra.',
    nextTestSuggestion: 'Testar uma 3a variação só do criativo vencedor (05).',
    nextAction: 'Manter budget consolidado e abrir novo experimento CREATIVE-002.',
  });
  assert.equal(closed.status, 'SUCCESS');
  assert.ok(closed.conclusion.includes('CPA caiu'));
  assert.ok(closed.learning.what_not_to_repeat);
  assert.ok(closed.learning.next_test_suggestion);
});

test('experimento fracassado (FAILURE): mesma estrutura de memória, sem esconder o resultado ruim', () => {
  const draft = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  const closed = closeExperiment(draft, {
    status: 'FAILURE',
    actualResult: { cpa_financeiro: 130 },
    conclusion: 'CPA piorou (R$109,79 -> R$130,00), hipótese refutada pelos dados reais.',
    learningSummary: 'Concentrar em 2 criativos não bastou — o problema pode estar em outro lugar do funil.',
    whatNotToRepeat: 'Não assumir que criativo é o gargalo sem testar LP em paralelo.',
    nextTestSuggestion: 'Rodar o experimento CRO (LPV->Checkout) antes de tentar criativo de novo.',
    nextAction: 'Cancelar variações de criativo por ora, priorizar CRO.',
  });
  assert.equal(closed.status, 'FAILURE');
  assert.ok(closed.conclusion.includes('piorou'));
  assert.ok(closed.learning.what_not_to_repeat);
});

test('experimento inconclusivo (INCONCLUSIVE): amostra insuficiente é registrada honestamente, sem forçar SUCCESS/FAILURE', () => {
  const draft = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  const closed = closeExperiment(draft, {
    status: 'INCONCLUSIVE',
    actualResult: { checkouts: 3 }, // abaixo do minimum_evidence
    conclusion: 'Só 3 checkouts no período — abaixo do minimum_evidence (5). Não dá pra concluir nada.',
    learningSummary: 'Volume de tráfego insuficiente pro teste nesse período.',
    whatNotToRepeat: 'Não rodar teste de criativo em período de orçamento muito baixo.',
    nextTestSuggestion: 'Repetir o mesmo teste com orçamento maior ou período mais longo.',
    nextAction: 'Reagendar o experimento com budget_limit maior.',
  });
  assert.equal(closed.status, 'INCONCLUSIVE');
  assert.notEqual(closed.status, 'SUCCESS');
  assert.notEqual(closed.status, 'FAILURE');
});

test('closeExperiment com status inválido lança erro', () => {
  const draft = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  assert.throws(() => closeExperiment(draft, { status: 'RUNNING' })); // RUNNING não é um status de fechamento
});

test('persistência de learning: salva no registry e recupera exatamente como fechado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-registry-'));
  const draft = buildDraftExperiment(baseInput(), fixtureWindow(), capitalCycle);
  const closed = closeExperiment(draft, {
    status: 'SUCCESS', actualResult: { cpa_financeiro: 85 },
    conclusion: 'sucesso real', learningSummary: 'aprendizado real',
    whatNotToRepeat: 'não fazer X', nextTestSuggestion: 'tentar Y', nextAction: 'fazer Z',
  });
  saveExperiment(closed, dir);
  const reloaded = loadExperiment(closed.experiment_id, dir);
  assert.equal(reloaded.learning.summary, 'aprendizado real');
  assert.equal(reloaded.learning.what_not_to_repeat, 'não fazer X');
  assert.equal(reloaded.learning.next_test_suggestion, 'tentar Y');
  assert.equal(reloaded.conclusion, 'sucesso real');
});

test('loadAllExperiments: carrega todos os experimentos persistidos de um diretório', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-registry-'));
  const e1 = buildDraftExperiment(baseInput({ category: 'CREATIVE' }), fixtureWindow(), capitalCycle);
  const e2 = buildDraftExperiment(baseInput({ category: 'CRO', targetMetric: 'taxa_lpv_checkout' }), fixtureWindow(), capitalCycle);
  saveExperiment(e1, dir);
  saveExperiment(e2, dir);
  const all = loadAllExperiments(dir);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((e) => e.experiment_id).sort(), [e1.experiment_id, e2.experiment_id].sort());
});
