'use strict';

// PASSO 17 — BUILD FIRST REAL EXPERIMENT TREATMENT. Os 40 testes obrigatórios do item 29,
// numerados na mesma ordem do pedido. Lê o treatment/controle reais do disco (advertorial-
// comprehension/index.html, teste-b/index.html) — nunca inventa conteúdo, nunca faz deploy,
// nunca gasta capital.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const {
  confirmWinnerUnchanged, buildTreatmentIdentityContract, auditTrackingContractImplementation,
  auditControlIntegrity, HALT_ROLLBACK_PLAN, buildDeploymentPlan, REQUIRED_TRACKING_MARKERS,
} = require('../src/orchestrator/firstExperimentTreatmentBuild');
const { classifyBehavioralVsEconomicOutcome } = require('../src/orchestrator/experimentDecisionSemantics');
const { buildFirstExperimentReadiness } = require('../src/orchestrator/firstExperimentReadiness');
const { loadExposureRegistry } = require('../src/execution/registry');
const { SAFE_MODE } = require('../src/execution/safeMode');
const { SHADOW_MODE } = require('../src/orchestrator/shadowMode');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TREATMENT_PATH = path.join(REPO_ROOT, 'advertorial-comprehension', 'index.html');
const CONTROL_PATH = path.join(REPO_ROOT, 'teste-b', 'index.html');
const treatmentHtml = fs.readFileSync(TREATMENT_PATH, 'utf8');
const controlHtml = fs.readFileSync(CONTROL_PATH, 'utf8');

function gitDiffStat(relPath) {
  try { return execSync(`git diff --stat -- "${relPath}"`, { cwd: REPO_ROOT }).toString(); } catch { return ''; }
}

// 1. Winner consumed dynamically.
test('1: real — confirmWinnerUnchanged() deriva o vencedor real do Strategy Search, nunca hardcoded', () => {
  const r = confirmWinnerUnchanged({});
  assert.equal(r.current_winner_architecture_id, 'ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE');
  assert.equal(r.matches_expected, true);
});

// 2. Treatment identity unique.
test('2: buildTreatmentIdentityContract() produz architecture_id/variant_id/experiment_id/product_id todos preenchidos e não-nulos', () => {
  const id = buildTreatmentIdentityContract({ productId: 'protocolo_resposta_garantida', winnerArchitectureId: 'ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE', controlArchitectureId: 'ARCH-CURRENT', experimentId: 'MVA-protocolo_resposta_garantida-002', variantId: 'VARIANT-ADVERTORIAL-COMPREHENSION-01' });
  assert.ok(id.architecture_id && id.variant_id && id.experiment_id && id.product_id);
});

// 3. Treatment != control.
test('3: architecture_id do treatment é sempre diferente do control_architecture_id', () => {
  const id = buildTreatmentIdentityContract({ productId: 'p', winnerArchitectureId: 'ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE', controlArchitectureId: 'ARCH-CURRENT', experimentId: 'E', variantId: 'V' });
  assert.notEqual(id.architecture_id, id.control_architecture_id);
});

// 4. Control unchanged.
test('4: real — git diff de teste-b/ está vazio (controle nunca modificado neste PASSO)', () => {
  assert.equal(gitDiffStat('teste-b/').trim(), '');
});

// 5. Price unchanged unless explicitly justified.
test('5: real — treatment e controle mostram exatamente o mesmo preço real (R$ 67,00 / 9x de R$ 8,63)', () => {
  assert.match(treatmentHtml, /R\$ ?67,00/);
  assert.match(controlHtml, /R\$ ?67,00/);
  assert.match(treatmentHtml, /8,63/);
  assert.match(controlHtml, /8,63/);
});

// 6. Checkout unchanged unless explicitly justified.
test('6: real — treatment e controle apontam pro MESMO link de checkout Hotmart', () => {
  const ctrlMatch = controlHtml.match(/https:\/\/pay\.hotmart\.com\/[A-Za-z0-9?=&]+/);
  const treatMatch = treatmentHtml.match(/https:\/\/pay\.hotmart\.com\/[A-Za-z0-9?=&]+/);
  assert.ok(ctrlMatch && treatMatch);
  assert.equal(treatMatch[0], ctrlMatch[0]);
});

// 7. Product unchanged.
test('7: real — treatment referencia o mesmo produto real (Cartilha Anti-Vácuo) do controle', () => {
  assert.match(treatmentHtml, /Cartilha Anti-Vácuo/);
  assert.match(controlHtml, /Cartilha Anti-Vácuo/);
});

// 8. Architecture stage is primary treatment difference.
test('8: real — treatment contém conteúdo de compreensão (estágio WHY_CURRENT_APPROACH_FAILS) ausente no controle, preservando o resto do stack de oferta', () => {
  assert.match(treatmentHtml, /Não é falta de cliente/); // mesmo reframe real do controle, reaproveitado (continuidade)
  assert.doesNotMatch(controlHtml, /não diz nada de novo pro cliente/); // análise de POR QUE a mensagem genérica falha é exclusiva do treatment — o controle nunca explica isso, só reframa
  assert.match(treatmentHtml, /não diz nada de novo pro cliente/);
  assert.match(treatmentHtml, /Cartilha Imprimível em PDF/); // stack de oferta preservado
});

// 9. Historical evidence used only as prior.
test('9: treatment não afirma prova causal a partir de histórico — nenhuma frase de "comprovado estatisticamente" ou equivalente', () => {
  assert.doesNotMatch(treatmentHtml, /comprovad[ao] estatisticamente|prova científica|estudo comprova/i);
});

// 10. No invented social proof.
test('10: treatment só referencia os 4 prints reais pré-existentes (assets/prova1-4.jpg), nenhum depoimento textual novo foi escrito', () => {
  for (let i = 1; i <= 4; i++) assert.match(treatmentHtml, new RegExp(`assets/prova${i}\\.jpg`));
  assert.doesNotMatch(treatmentHtml, /disse:\s*"|avaliação de \d+ estrelas|⭐⭐⭐⭐⭐/);
});

// 11. No invented claims.
test('11: treatment não contém estatística de resultado inventada (ex.: "aumenta X%", "Y clientes recuperados") fora das falas reais dentro dos prints', () => {
  assert.doesNotMatch(treatmentHtml, /aumenta(m)? (a )?conversão em \d+%/i);
  assert.doesNotMatch(treatmentHtml, /\d+\.?\d* mil (clientes|alunos|vendas)/i);
});

// 12. No fake scarcity.
test('12: treatment não contém urgência/escassez fabricada (contagem regressiva, "restam X vagas")', () => {
  assert.doesNotMatch(treatmentHtml, /restam \d+ vagas|últimas \d+ unidades|oferta expira em \d+/i);
});

// 13. Mobile-first contract.
test('13: real — viewport meta presente e pelo menos uma media query mobile-first (min-width) no CSS', () => {
  assert.match(treatmentHtml, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(treatmentHtml, /@media \(min-width:/);
});

// 14. CTA exists.
test('14: real — exatamente um CTA primário identificável (id="cta-primary") existe no treatment', () => {
  const matches = treatmentHtml.match(/id="cta-primary"/g) || [];
  assert.equal(matches.length, 1);
});

// 15. CTA target valid locally.
test('15: real — o href do CTA primário é uma URL real do Hotmart (mesma do controle), nunca um placeholder', () => {
  const hrefMatch = treatmentHtml.match(/id="cta-primary"[^>]*href="([^"]+)"/) || treatmentHtml.match(/href="([^"]+)"[^>]*id="cta-primary"/);
  assert.ok(hrefMatch);
  assert.match(hrefMatch[1], /^https:\/\/pay\.hotmart\.com\//);
});

// 16. Tracking identities present.
test('16: real — auditTrackingContractImplementation() confirma todos os marcadores obrigatórios implementados no código', () => {
  const audit = auditTrackingContractImplementation({ treatmentHtmlAbsolutePath: TREATMENT_PATH });
  assert.equal(audit.treatment_exists_as_real_page, true);
  for (const key of Object.keys(REQUIRED_TRACKING_MARKERS)) {
    assert.equal(audit.requirements[key].implemented_in_code, true, `esperado implemented_in_code=true pra ${key}`);
  }
});

// 17. Experiment identity present.
test('17: real — window.__EXPERIMENT_IDENTITY__.experiment_id está presente e é o mva_test_id real (nunca inventado)', () => {
  assert.match(treatmentHtml, /experiment_id:\s*"MVA-protocolo_resposta_garantida-002"/);
});

// 18. UTM preservation mechanism.
test('18: real — mecanismo de preservação de UTM (location.search repassado pro CTA) está implementado', () => {
  assert.match(treatmentHtml, /location\.search/);
  assert.match(treatmentHtml, /cta\.href/);
});

// 19. Runtime tracking not falsely validated.
test('19: real — TODOS os requisitos de tracking têm runtime_validated=false (nenhum deploy real ocorreu)', () => {
  const audit = auditTrackingContractImplementation({ treatmentHtmlAbsolutePath: TREATMENT_PATH });
  for (const key of Object.keys(REQUIRED_TRACKING_MARKERS)) {
    assert.equal(audit.requirements[key].runtime_validated, false);
  }
});

// 20. Hotmart remains financial truth.
test('20: nenhum código novo deste PASSO redefine FINANCIAL_TRANSACTION_TRUTH — measurement/sourceOfTruth.js nunca importado/alterado por firstExperimentTreatmentBuild.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'orchestrator', 'firstExperimentTreatmentBuild.js'), 'utf8');
  assert.doesNotMatch(src, /measurement\/sourceOfTruth/);
});

// 21. Meta signal cannot become financial truth.
test('21: treatment nunca trata evento de dataLayer/GTM como venda financeira — nenhuma chamada de "purchase"/"revenue" no dataLayer do treatment', () => {
  assert.doesNotMatch(treatmentHtml, /dataLayer\.push\(\{\s*event:\s*"purchase"/);
});

// 22. Treatment not marked LIVE.
test('22: identity.status é sempre "NOT_LIVE", nunca "LIVE"', () => {
  const id = buildTreatmentIdentityContract({ productId: 'p', winnerArchitectureId: 'A', controlArchitectureId: 'C', experimentId: 'E', variantId: 'V' });
  assert.equal(id.status, 'NOT_LIVE');
  assert.notEqual(id.status, 'LIVE');
});

// 23. Exposure not registered as live before deploy.
test('23: real — o registry de exposição real (execution/registry.js) não contém nenhuma entrada ACTIVE pro architecture_id do treatment', () => {
  const registry = loadExposureRegistry();
  const treatmentEntries = registry.filter((e) => e.architecture_id === 'ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE' && e.status === 'ACTIVE');
  assert.equal(treatmentEntries.length, 0);
});

// 24. Provisional rule remains provisional.
test('24: real — decision_rule_status do readiness continua NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION após o build do treatment', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.decision_rule_status, 'NEEDS_ARCHITECTURE_EXPERIMENT_CALIBRATION');
});

// 25. Behavioral metric cannot alone declare economic winner.
test('25: classifyBehavioralVsEconomicOutcome(IMPROVED, DETERIORATED) continua nunca sendo WINNER, mesmo após o treatment construído', () => {
  const r = classifyBehavioralVsEconomicOutcome({ behavioralDirection: 'IMPROVED', economicDirection: 'DETERIORATED' });
  assert.notEqual(r.classification, 'WINNER');
});

// 26. Halt prepared.
test('26: HALT_ROLLBACK_PLAN.halt.status === PREPARED, nunca EXECUTED', () => {
  assert.equal(HALT_ROLLBACK_PLAN.halt.status, 'PREPARED');
});

// 27. Rollback prepared.
test('27: HALT_ROLLBACK_PLAN.rollback.status === PREPARED, nunca EXECUTED', () => {
  assert.equal(HALT_ROLLBACK_PLAN.rollback.status, 'PREPARED');
});

// 28. Halt != rollback.
test('28: halt e rollback têm métodos/distinção explicitamente diferentes, nunca confundidos', () => {
  assert.notEqual(HALT_ROLLBACK_PLAN.halt.method, HALT_ROLLBACK_PLAN.rollback.method);
  assert.ok(HALT_ROLLBACK_PLAN.distinction.length > 0);
});

// 29. No external mutation.
test('29: treatment nunca contém fetch/XHR/axios pra endpoint mutável — só o script GTM (idêntico ao controle) e o link estático do CTA', () => {
  assert.doesNotMatch(treatmentHtml, /fetch\(|XMLHttpRequest|axios\./);
});

// 30. No deploy.
test('30: real — git diff de vercel.json está vazio (nenhuma regra de roteamento real foi alterada)', () => {
  assert.equal(gitDiffStat('vercel.json').trim(), '');
});

// 31. No media mutation.
test('31: real — nenhum arquivo de creative/registry ou dado de campanha Meta foi alterado neste PASSO', () => {
  const status = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  assert.doesNotMatch(status, /analytics\/data\/creatives\//);
  assert.doesNotMatch(status, /analytics\/src\/creative\//);
});

// 32. No budget mutation.
test('32: real — nenhum arquivo de capital/budget de execution/ foi alterado neste PASSO', () => {
  const status = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  assert.doesNotMatch(status, /execution\/capitalBuckets\.js|execution\/budgetEscalationPolicy\.js|execution\/authorityTiers\.js/);
});

// 33. SAFE_MODE.
test('33: SAFE_MODE continua true após PASSO 17', () => {
  assert.equal(SAFE_MODE, true);
});

// 34. SHADOW_MODE.
test('34: SHADOW_MODE continua true após PASSO 17', () => {
  assert.equal(SHADOW_MODE, true);
});

// 35. Determinism.
test('35: real — confirmWinnerUnchanged()/auditTrackingContractImplementation() são determinísticos entre execuções', () => {
  const a1 = confirmWinnerUnchanged({});
  const a2 = confirmWinnerUnchanged({});
  assert.deepEqual(a1, a2);
  const t1 = auditTrackingContractImplementation({ treatmentHtmlAbsolutePath: TREATMENT_PATH });
  const t2 = auditTrackingContractImplementation({ treatmentHtmlAbsolutePath: TREATMENT_PATH });
  assert.deepEqual(t1, t2);
});

// 36. Control integrity.
test('36: real — auditControlIntegrity() confirma git_diff_empty_for_control=true e o arquivo real existe', () => {
  const audit = auditControlIntegrity({ controlHtmlAbsolutePath: CONTROL_PATH, gitDiffStatOutput: gitDiffStat('teste-b/') });
  assert.equal(audit.control_file_exists, true);
  assert.equal(audit.git_diff_empty_for_control, true);
});

// 37. Responsive/basic accessibility.
test('37: real — imagens têm alt text, sem overflow horizontal óbvio (unidades relativas/max-width:100% em img)', () => {
  const imgs = treatmentHtml.match(/<img[^>]*>/g) || [];
  assert.ok(imgs.length > 0);
  for (const img of imgs) assert.match(img, /alt="/);
  assert.match(treatmentHtml, /img\{max-width:100%/);
});

// 38. No duplicate critical IDs.
test('38: real — nenhum atributo id="..." literal se repete no treatment (data-architecture-id/data-variant-id não contam como id)', () => {
  const ids = [...treatmentHtml.matchAll(/(?<!data-\w*-)(?<!data-)\bid="([^"]+)"/g)].map((m) => m[1]);
  const strictIds = [...treatmentHtml.matchAll(/[^-]\bid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = strictIds.filter((id, i) => strictIds.indexOf(id) !== i);
  assert.deepEqual([...new Set(dupes)], []);
});

// 39. Existing tests remain green (smoke import check — a suíte completa real roda separadamente via npm test).
test('39: smoke — módulos do PASSO 16/16.1 continuam importáveis sem erro após o build do treatment', () => {
  assert.doesNotThrow(() => require('../src/orchestrator/exposureIdentityOperationalization'));
  assert.doesNotThrow(() => require('../src/orchestrator/experimentDecisionSemantics'));
  assert.doesNotThrow(() => require('../src/orchestrator/firstExperimentReadiness'));
});

// extra (item 28) — readiness review recalcula dinamicamente, nunca força estado.
test('extra28a: real — buildFirstExperimentReadiness({treatmentBuildAudit}) real avança pra READY_FOR_DEPLOYMENT após o build (nunca READY_FOR_EXECUTION, nenhum deploy ocorreu)', () => {
  const audit = auditTrackingContractImplementation({ treatmentHtmlAbsolutePath: TREATMENT_PATH });
  const readiness = buildFirstExperimentReadiness({ treatmentBuildAudit: audit });
  assert.equal(readiness.readiness, 'READY_FOR_DEPLOYMENT');
  assert.notEqual(readiness.readiness, 'READY_FOR_EXECUTION');
  assert.equal(readiness.readiness_subdimensions.IMPLEMENTATION_READINESS, 'DONE');
  assert.equal(readiness.readiness_subdimensions.DEPLOYMENT_READINESS, 'NOT_STARTED');
});

test('extra28b: real — sem treatmentBuildAudit, buildFirstExperimentReadiness() preserva o comportamento conservador original do PASSO 16 (nenhuma regressão)', () => {
  const readiness = buildFirstExperimentReadiness({});
  assert.equal(readiness.readiness, 'READY_FOR_IMPLEMENTATION');
  assert.equal(readiness.implementation_requirements.treatment_exists_as_real_page, false);
});

// 40. Write boundary.
test('40: real — git status só mostra arquivos dentro do write boundary permitido (advertorial-comprehension/, analytics/src/orchestrator/, analytics/tests/, analytics/data/orchestrator/)', () => {
  const status = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  const lines = status.split('\n').map((l) => l.trim()).filter(Boolean);
  const allowedPrefixes = ['advertorial-comprehension/', 'analytics/src/orchestrator/', 'analytics/tests/', 'analytics/data/orchestrator/'];
  for (const line of lines) {
    const filePath = line.replace(/^\?\?\s+|^[AM]+\s+/, '');
    assert.ok(allowedPrefixes.some((p) => filePath.startsWith(p)), `arquivo fora do write boundary: ${filePath}`);
  }
});
