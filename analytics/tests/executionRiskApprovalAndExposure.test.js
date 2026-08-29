'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyRiskLevel } = require('../src/execution/riskLevel');
const { requestHumanApproval, resolveApproval, isApprovalExpired, checkApprovalStillValid, resetApprovalCounter } = require('../src/execution/humanApproval');
const { buildArchitectureLiveEntry, resetEntryCounter, queryArchitectureLiveOnDate, isRegistrySufficientForAggregateComparison } = require('../src/execution/exposureIdentityRegistry');
const { proposeAndDryRunNextAction } = require('../src/execution/builder');
const { runDryRun } = require('../src/execution/dryRunEngine');
const { buildActionContract, resetActionCounter } = require('../src/execution/actionContract');
const { loadCapitalSafetyConfig } = require('../src/execution/capitalSafety');

// 15. Unknown capital != zero risk.
test('15: capital_at_risk=null (UNKNOWN) eleva o risco, nunca é tratado como zero risco', () => {
  const withUnknown = classifyRiskLevel({ capitalAtRisk: null, reversibility: 'REVERSIBLE', measurementCapitalGateState: 'READY_FOR_CAPITAL', confidence: 'HIGH', anomalySeverity: 'NORMAL', subjectType: 'AD' });
  const withZero = classifyRiskLevel({ capitalAtRisk: 0, reversibility: 'REVERSIBLE', measurementCapitalGateState: 'READY_FOR_CAPITAL', confidence: 'HIGH', anomalySeverity: 'NORMAL', subjectType: 'AD' });
  assert.ok(withUnknown.score > withZero.score);
});

// 16. Irreversible action eleva risk.
test('16: reversibility=IRREVERSIBLE eleva o score de risco em relação a REVERSIBLE, tudo o mais igual', () => {
  const reversible = classifyRiskLevel({ capitalAtRisk: 100, reversibility: 'REVERSIBLE', measurementCapitalGateState: 'READY_FOR_CAPITAL', confidence: 'HIGH', anomalySeverity: 'NORMAL', subjectType: 'AD' });
  const irreversible = classifyRiskLevel({ capitalAtRisk: 100, reversibility: 'IRREVERSIBLE', measurementCapitalGateState: 'READY_FOR_CAPITAL', confidence: 'HIGH', anomalySeverity: 'NORMAL', subjectType: 'AD' });
  assert.ok(irreversible.score > reversible.score);
});

// 18. Human approval expira.
test('18: aprovação vencida (nowIso após expires_at) fica EXPIRED, nunca é tratada como PENDING/APPROVED indefinidamente', () => {
  resetApprovalCounter();
  const approval = requestHumanApproval({ actionId: 'ACTION-1', reason: 'risco alto', riskLevel: 'HIGH', expiresInMs: 1000 });
  const future = new Date(Date.parse(approval.requested_at) + 5000).toISOString();
  assert.equal(isApprovalExpired(approval, future), true);
  const resolved = resolveApproval(approval, { approvedBy: 'human', decision: 'APPROVED', nowIso: future });
  assert.equal(resolved.status, 'EXPIRED');
});

// 19. Approved action ainda respeita Circuit Breaker.
test('19: uma aprovação humana válida (não expirada, status=APPROVED) não é suficiente sozinha — checkApprovalStillValid não avalia circuit breaker, então o dry run tem que consultá-lo separadamente', () => {
  resetApprovalCounter();
  const approval = requestHumanApproval({ actionId: 'ACTION-2', reason: 'r', riskLevel: 'HIGH' });
  const approved = resolveApproval(approval, { approvedBy: 'human', decision: 'APPROVED' });
  const check = checkApprovalStillValid({ approval: approved });
  assert.equal(check.valid, true);
  // mesmo com aprovação válida, o dry run real ainda avalia GLOBAL_FREEZE_POLICY via circuit breaker — nunca pula essa checagem.
  resetActionCounter();
  const action = buildActionContract({ actionType: 'ADJUST_BUDGET', subjectType: 'CAMPAIGN', subjectId: 'C', sourceAgent: 'S', requestedChange: 'r', currentState: {}, targetState: {}, capitalRequired: 10, reversibility: 'REVERSIBLE' });
  const result = runDryRun({ action, measurementSignals: { financial_truth_health: { status: 'BLOCKED' }, capital_gate: { state: 'BLOCKED_BY_MEASUREMENT' }, anomalies: [] }, capitalSafetyConfig: loadCapitalSafetyConfig(), circuitBreakerSignals: { financialTruthBlocked: true } });
  assert.equal(result.policy_result.final_result, 'DENY');
  assert.equal(result.circuit_breaker_action, 'GLOBAL_FREEZE');
});

// 21. architecture_live_registry registra exposição por período.
test('21: buildArchitectureLiveEntry() registra architecture_id/live_from/live_until/environment reais — consultável por data', () => {
  resetEntryCounter();
  const entry = buildArchitectureLiveEntry({ architectureId: 'ARCH-CURRENT', liveFrom: '2026-08-01T00:00:00.000Z', liveUntil: null, environment: 'production', deploymentReference: 'commit:abc123', recordedBy: 'human_operator' });
  assert.equal(entry.status, 'ACTIVE');
  const query = queryArchitectureLiveOnDate([entry], '2026-08-15T00:00:00.000Z');
  assert.equal(query.found, true);
  assert.equal(query.entry.architecture_id, 'ARCH-CURRENT');
});

// 22. Registro temporal permite futura aggregate comparison.
test('22: registro completo (sem gaps) no intervalo pedido habilita isRegistrySufficientForAggregateComparison=true', () => {
  resetEntryCounter();
  const entry = buildArchitectureLiveEntry({ architectureId: 'ARCH-CURRENT', liveFrom: '2026-08-01T00:00:00.000Z', liveUntil: null, environment: 'production', deploymentReference: 'commit:abc123', recordedBy: 'human_operator' });
  const dates = ['2026-08-05', '2026-08-10', '2026-08-15'];
  const result = isRegistrySufficientForAggregateComparison([entry], dates.map((d) => `${d}T12:00:00.000Z`));
  assert.equal(result.sufficient, true);
  assert.equal(result.covered_days, 3);
});

test('22b: registro com gap real (data fora de qualquer entrada) reporta sufficient=false com os gaps explícitos', () => {
  resetEntryCounter();
  const entry = buildArchitectureLiveEntry({ architectureId: 'ARCH-CURRENT', liveFrom: '2026-08-10T00:00:00.000Z', liveUntil: null, environment: 'production', deploymentReference: 'commit:abc123', recordedBy: 'human_operator' });
  const result = isRegistrySufficientForAggregateComparison([entry], ['2026-08-05T12:00:00.000Z', '2026-08-15T12:00:00.000Z']);
  assert.equal(result.sufficient, false);
  assert.equal(result.gaps.length, 1);
});

// 24. Determinism.
test('24: proposeAndDryRunNextAction() é determinístico entre execuções (exceto timestamps/action_id sequencial)', () => {
  const a = proposeAndDryRunNextAction({});
  const b = proposeAndDryRunNextAction({});
  const strip = (r) => ({
    proposed: r.proposed,
    action_type: r.action?.action_type,
    subject_type: r.action?.subject_type,
    requested_change: r.action?.requested_change,
    reversibility: r.action?.reversibility,
    policy_final_result: r.dry_run?.policy_result?.final_result,
    policy_decisive_policies: r.dry_run?.policy_result?.decisive_policies,
    risk_level: r.dry_run?.risk_level,
    affected_scope: r.dry_run?.affected_scope,
    measurement_readiness: r.dry_run?.measurement_readiness,
    circuit_breaker_state: r.dry_run?.circuit_breaker_state,
    would_execute_externally: r.would_execute_externally,
  });
  assert.deepEqual(strip(a), strip(b));
});

// 25. Write boundary — coberto também no relatório via git status; aqui confirmamos que o
// registry só escreve dentro de analytics/data/execution/.
test('25: registry.js do execution só aponta pra analytics/data/execution/ (write boundary)', () => {
  const { DEFAULT_DIR } = require('../src/execution/registry');
  assert.ok(DEFAULT_DIR.replace(/\\/g, '/').endsWith('analytics/data/execution'));
});
