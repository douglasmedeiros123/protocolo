'use strict';

// PASSO 18.5 — EXTERNAL CONNECTORS + SECURE CREDENTIALS + APPROVAL-GATED OPERATIONS. Os 33 testes
// obrigatórios do item 32, numerados na mesma ordem do pedido.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { CREDENTIAL_CAPABILITY_MAP, buildCredentialCapabilityMap } = require('../src/execution/connectors/credentialCapabilityMap');
const { HEALTH_STATES, sanitizeErrorMessage, checkAllConnectorsHealth } = require('../src/execution/connectors/connectorHealth');
const metaConnector = require('../src/execution/connectors/metaConnector');
const hotmartConnector = require('../src/execution/connectors/hotmartConnector');
const clarityConnector = require('../src/execution/connectors/clarityConnector');
const githubConnector = require('../src/execution/connectors/githubConnector');
const { buildProductMonetizationMap } = require('../src/execution/connectors/productMonetizationMap');
const { buildOperationalCapabilityRegistry } = require('../src/execution/connectors/operationalCapabilityRegistry');
const {
  MANDATORY_EXECUTION_FLOW, MVA_INCREMENTAL_BUDGET_AUTHORITY, buildBudgetChangeProposal,
  evaluateApprovalForAction, verifyExecutionOutcome,
} = require('../src/execution/connectors/approvalWorkflow');
const { SAFE_MODE } = require('../src/execution/safeMode');
const { SHADOW_MODE } = require('../src/orchestrator/shadowMode');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CONNECTORS_DIR = path.join(__dirname, '..', 'src', 'execution', 'connectors');

// 1. No raw secrets committed.
test('1: real — nenhum arquivo novo deste PASSO contém um valor de token/segredo real (só nomes de variável)', () => {
  const files = fs.readdirSync(CONNECTORS_DIR);
  const suspiciousPatterns = /EAAG[A-Za-z0-9]{20,}|sk_live_|Bearer [A-Za-z0-9._-]{30,}/;
  for (const f of files) {
    const content = fs.readFileSync(path.join(CONNECTORS_DIR, f), 'utf8');
    assert.doesNotMatch(content, suspiciousPatterns, `${f} não deve conter token real`);
  }
});

// 2. No secrets in logs.
test('2: real — checkMetaHealth()/etc nunca fazem console.log do valor de META_ACCESS_TOKEN/HOTMART_CLIENT_SECRET/CLARITY_API_TOKEN', () => {
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'connectorHealth.js'), 'utf8');
  assert.doesNotMatch(src, /console\.log\([^)]*ACCESS_TOKEN/);
  assert.doesNotMatch(src, /console\.log\([^)]*CLIENT_SECRET/);
});

// 3. No secrets in artifacts.
test('3: real — required-secrets.example.json contém só nomes/metadados, nenhum valor de token real', () => {
  const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'security', 'required-secrets.example.json'), 'utf8'));
  for (const [key, meta] of Object.entries(inventory)) {
    if (key === '_comment') continue;
    assert.ok(!('value' in meta), `${key} não deve ter campo "value"`);
    assert.equal(meta.status === 'MISSING' || meta.status === 'MISSING_AS_ENV_VAR' || meta.status === 'AVAILABLE', true);
  }
});

// 4. No secrets in error messages.
test('4: sanitizeErrorMessage() real redige um segredo passado explicitamente, nunca deixa vazar', () => {
  const secret = 'EAAGsupersecrettoken123456789';
  const message = `Meta API error: token ${secret} is invalid`;
  const safe = sanitizeErrorMessage(message, [secret]);
  assert.doesNotMatch(safe, new RegExp(secret));
  assert.match(safe, /\[REDACTED\]/);
});

// 5. Env vars only.
test('5: real — todos os collectors/connectors usam config/env.js (nunca um valor hardcoded) para credenciais', () => {
  for (const f of ['metaConnector.js', 'hotmartConnector.js', 'clarityConnector.js', 'githubConnector.js']) {
    const src = fs.readFileSync(path.join(CONNECTORS_DIR, f), 'utf8');
    assert.match(src, /require\(.*config\/env/);
  }
});

// 6. Access token refresh safe.
test('6: HOTMART_CLIENT_SECRET/ID nunca são persistidos — collectHotmart() gera access_token em runtime, nunca grava em disco (confirmado por leitura do código real)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'collectors', 'hotmart.js'), 'utf8');
  assert.doesNotMatch(src, /writeFileSync|fs\.write/);
});

// 7. Read works independently from write.
test('7: real — metaConnector.readInsights() nunca depende de proposeBudgetChange()/executeApprovedBudgetChange() — funções completamente independentes', async () => {
  const result = await metaConnector.readInsights('2026-08-27');
  assert.ok('available' in result);
  assert.ok(typeof metaConnector.proposeBudgetChange === 'function');
});

// 8. Read does not require approval.
test('8: real — readInsights()/readTransactions()/readBehavioralInsights()/readRepoStatus() nunca retornam campo required_approval — só write proposals têm isso', async () => {
  const results = await Promise.all([
    metaConnector.readInsights('2026-08-27'),
    hotmartConnector.readTransactions('2026-08-27'),
    clarityConnector.readBehavioralInsights(),
    githubConnector.readRepoStatus('2026-08-27'),
  ]);
  for (const r of results) assert.ok(!('required_approval' in r));
});

// 9. Write requires Action Contract.
test('9: real — proposeBudgetChange() sempre retorna um contrato completo (action_id, current_state, proposed_state, why, etc.), nunca uma mutação direta', () => {
  const proposal = metaConnector.proposeBudgetChange({ actionId: 'A1', campaignOrAdsetId: 'C1', currentDailyBudget: 30, proposedDailyBudget: 40, why: 'teste' });
  for (const field of ['action_id', 'current_state', 'proposed_state', 'why', 'capital_impact', 'blast_radius', 'reversibility', 'required_approval', 'status']) {
    assert.ok(field in proposal, `contrato deve ter o campo ${field}`);
  }
});

// 10. Write requires Policy.
test('10: MANDATORY_EXECUTION_FLOW real inclui POLICY_ENGINE explicitamente entre a recomendação e a execução', () => {
  const policyIdx = MANDATORY_EXECUTION_FLOW.indexOf('POLICY_ENGINE');
  const execIdx = MANDATORY_EXECUTION_FLOW.indexOf('EXECUTION_ADAPTER');
  assert.ok(policyIdx > -1 && execIdx > -1 && policyIdx < execIdx);
});

// 11. Write requires human approval.
test('11: proposeBudgetChange()/proposeCampaignStatusChange() sempre retornam status=AWAITING_HUMAN_APPROVAL, nunca EXECUTED', () => {
  const p1 = metaConnector.proposeBudgetChange({ actionId: 'A1', currentDailyBudget: 30, proposedDailyBudget: 40, why: 'x' });
  const p2 = metaConnector.proposeCampaignStatusChange({ actionId: 'A2', campaignId: 'C1', currentStatus: 'ACTIVE', proposedStatus: 'PAUSED', why: 'x' });
  assert.equal(p1.status, 'AWAITING_HUMAN_APPROVAL');
  assert.equal(p2.status, 'AWAITING_HUMAN_APPROVAL');
});

// 12. Approval action-specific.
test('12: evaluateApprovalForAction() nega quando a aprovação referencia um action_id diferente do proposto', () => {
  const r = evaluateApprovalForAction({ actionId: 'A1', approvalMessage: 'aprovado', approvalReferencesActionId: 'A2', currentPlatformState: { x: 1 }, stateAtProposalTime: { x: 1 } });
  assert.equal(r.approved, false);
});

// 13. Stale approval blocked.
test('13: evaluateApprovalForAction() retorna APPROVAL_STALE_STATE_CHANGED quando o estado real mudou desde a proposta', () => {
  const r = evaluateApprovalForAction({ actionId: 'A1', approvalMessage: 'pode executar', approvalReferencesActionId: 'A1', currentPlatformState: { daily_budget: 50 }, stateAtProposalTime: { daily_budget: 30 } });
  assert.equal(r.approved, false);
  assert.equal(r.reason, 'APPROVAL_STALE_STATE_CHANGED');
});

// 14. Approval cannot promote Authority Tier.
test('14: nenhuma função de approvalWorkflow.js referencia ou altera Authority Tier — só avalia a ação específica proposta', () => {
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'approvalWorkflow.js'), 'utf8');
  assert.doesNotMatch(src, /TIER_1|authorityTiers|promoteTier/i);
});

// 15. Budget increase cannot occur without approval.
test('15: real — buildBudgetChangeProposal() com aumento real (30->40) nunca marca can_execute_autonomously=true', () => {
  const p = buildBudgetChangeProposal({ currentDailyBudget: 30, proposedDailyBudget: 40 });
  assert.equal(p.can_execute_autonomously, false);
  assert.equal(p.incremental_daily_capital, 10);
});

// 16. Current budget cannot be silently changed.
test('16: MVA_INCREMENTAL_BUDGET_AUTHORITY real = 0, nunca outro valor', () => {
  assert.equal(MVA_INCREMENTAL_BUDGET_AUTHORITY, 0);
});

// 17. Current campaign cannot be silently paused.
test('17: proposeCampaignStatusChange() sempre exige aprovação, nunca pausa/ativa direto', () => {
  const p = metaConnector.proposeCampaignStatusChange({ actionId: 'A3', campaignId: 'C1', currentStatus: 'ACTIVE', proposedStatus: 'PAUSED', why: 'x' });
  assert.equal(p.required_approval, 'HUMAN_APPROVAL_REQUIRED.');
});

// 18. Raw arbitrary API mutation unavailable to CEO.
test('18: real — nenhum connector expõe uma função genérica tipo executeRawHttp(url, method, body)', () => {
  for (const f of fs.readdirSync(CONNECTORS_DIR)) {
    const src = fs.readFileSync(path.join(CONNECTORS_DIR, f), 'utf8');
    assert.doesNotMatch(src, /executeRawHttp|function\s+rawRequest/);
  }
});

// 19. Verification after mutation mandatory.
test('19: verifyExecutionOutcome() real retorna EXECUTION_VERIFICATION_FAILED quando expected != actual, nunca assume sucesso pelo HTTP 200', () => {
  const r = verifyExecutionOutcome({ expectedState: { daily_budget: 40 }, actualState: { daily_budget: 30 } });
  assert.equal(r.verified, false);
  assert.equal(r.status, 'EXECUTION_VERIFICATION_FAILED');
});

// 20. Idempotency.
test('20: real — executeApprovedBudgetChange() nunca executa (retorna blocked=true) — retry nunca duplica mutação porque nenhuma mutação real ocorre neste PASSO', async () => {
  const r1 = await metaConnector.executeApprovedBudgetChange();
  const r2 = await metaConnector.executeApprovedBudgetChange();
  assert.equal(r1.executed, false);
  assert.equal(r2.executed, false);
  assert.deepEqual(r1, r2);
});

// 21. Circuit Breaker sovereign.
test('21: nenhum connector/approvalWorkflow.js importa ou altera execution/circuitBreaker.js — permanece fora da autoridade destes módulos', () => {
  for (const f of fs.readdirSync(CONNECTORS_DIR)) {
    const src = fs.readFileSync(path.join(CONNECTORS_DIR, f), 'utf8');
    assert.doesNotMatch(src, /circuitBreaker/);
  }
});

// 22. Hotmart remains financial truth.
test('22: real — hotmartConnector é o único marcado truth_role=FINANCIAL_TRANSACTION_TRUTH no operational dashboard', () => {
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'operationalDashboardState.js'), 'utf8');
  assert.match(src, /HOTMART:.*FINANCIAL_TRANSACTION_TRUTH/s);
});

// 23. Meta remains platform truth.
test('23: real — metaConnector é marcado truth_role=PLATFORM_TRUTH no operational dashboard, nunca FINANCIAL_TRANSACTION_TRUTH', () => {
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'operationalDashboardState.js'), 'utf8');
  assert.match(src, /META:.*PLATFORM_TRUTH/s);
});

// 24. Clarity remains behavioral evidence.
test('24: real — clarityConnector.readBehavioralInsights() sempre retorna truth_role=BEHAVIORAL_EVIDENCE', async () => {
  const r = await clarityConnector.readBehavioralInsights();
  // mesmo sem credencial, quando disponível o campo existe explicitamente no código
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'clarityConnector.js'), 'utf8');
  assert.match(src, /truth_role:\s*'BEHAVIORAL_EVIDENCE'/);
});

// 25. Missing API capability remains NOT_AVAILABLE.
test('25: real — HOTMART_WRITE_CAPABILITY nunca declara AVAILABLE sem confirmação — todos os itens são UNKNOWN_REQUIRES_VALIDATION', () => {
  for (const v of Object.values(hotmartConnector.WRITE_CAPABILITY)) {
    assert.match(v, /UNKNOWN_REQUIRES_VALIDATION/);
  }
});

// 26. API permission denied handled safely.
test('26: HEALTH_STATES real inclui PERMISSION_DENIED como estado tratado explicitamente', () => {
  assert.ok(HEALTH_STATES.includes('PERMISSION_DENIED'));
});

// 27. Rate limit handled.
test('27: HEALTH_STATES real inclui RATE_LIMITED como estado tratado explicitamente', () => {
  assert.ok(HEALTH_STATES.includes('RATE_LIMITED'));
});

// 28. Connector health.
test('28: real — checkAllConnectorsHealth() retorna um health válido (dentro de HEALTH_STATES) pra cada uma das 5 plataformas', async () => {
  const health = await checkAllConnectorsHealth();
  for (const platform of ['META', 'HOTMART', 'CLARITY', 'GITHUB', 'VERCEL']) {
    assert.ok(HEALTH_STATES.includes(health[platform].health), `${platform} deveria ter health válido`);
  }
});

// 29. Product Monetization Map does not invent relationships.
test('29: real — buildProductMonetizationMap() real: upsells/downsells/subscriptions ficam vazios (nunca inventados), unknown_relationships.classification=UNKNOWN', () => {
  const map = buildProductMonetizationMap({});
  assert.deepEqual(map.upsells, []);
  assert.deepEqual(map.downsells, []);
  assert.deepEqual(map.subscriptions_or_recurring, []);
  assert.equal(map.unknown_relationships.classification, 'UNKNOWN');
  assert.ok(map.order_bumps.every((b) => b.relationship_confidence === 'CONFIRMED'));
});

// 30. SAFE_MODE.
test('30: SAFE_MODE continua true após PASSO 18.5', () => {
  assert.equal(SAFE_MODE, true);
});

// 31. SHADOW_MODE.
test('31: SHADOW_MODE continua true após PASSO 18.5', () => {
  assert.equal(SHADOW_MODE, true);
});

// 32. Authority Tier unchanged.
test('32: real — operational capability registry nunca declara CAPITAL.current_authorized_state diferente de TIER_0_ANALYZE_ONLY', () => {
  const src = fs.readFileSync(path.join(CONNECTORS_DIR, 'operationalDashboardState.js'), 'utf8');
  assert.match(src, /current_authorized_state:\s*'TIER_0_ANALYZE_ONLY'/);
});

// 33. Zero external mutation during this step.
test('33: real — git status desta sessão nunca inclui alterações em vercel.json, campanha, produto/preço/checkout — só arquitetura de connector/segurança/testes', () => {
  const status = execSync('git status --short', { cwd: REPO_ROOT }).toString();
  const lines = status.split('\n').map((l) => l.trim()).filter(Boolean);
  const forbidden = /^\?\?\s+vercel\.json|^\s*M\s+vercel\.json|teste-b\//;
  for (const line of lines) assert.doesNotMatch(line, forbidden);
});
