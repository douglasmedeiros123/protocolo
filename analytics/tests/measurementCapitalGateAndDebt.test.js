'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateMeasurementCapitalGate, CAPITAL_GATE_STATES } = require('../src/measurement/capitalGate');
const { buildTrackingContract, resetContractCounter, computeContractStatus } = require('../src/measurement/trackingContract');
const { buildMeasurementDebtRegistry, compareDebt } = require('../src/measurement/measurementDebt');
const { runFullPlatformAudit } = require('../src/measurement/platformAudit');
const { buildSourceOfTruthMatrix } = require('../src/measurement/sourceOfTruth');
const { standardWindows } = require('../src/profit/windows');
const { todayBRT } = require('../src/utils/dates');

const REAL_DATES = standardWindows(todayBRT()).last_30d.dates;
const platform = runFullPlatformAudit();

test('financial truth bloqueante (BLOCKING) sempre gera BLOCKED_BY_MEASUREMENT, independente do resto do contrato', () => {
  resetContractCounter();
  const contract = buildTrackingContract({ subjectType: 'CURRENT_ARCHITECTURE', subjectId: 'X', architectureId: 'X', stageTypes: ['CHECKOUT'], platform, financialTruthBlocking: true, productId: 'p' });
  const gate = evaluateMeasurementCapitalGate({ contract, financialTruthBlocking: true, reconciliationMatchRate: 1 });
  assert.equal(gate.state, 'BLOCKED_BY_MEASUREMENT');
  assert.ok(CAPITAL_GATE_STATES.includes(gate.state));
});

test('PASSO 13.1 (item 1): CHECKOUT_INITIATED tem proxy agregado real (Meta checkout diário) — nunca CAPITAL_BLOCKING sozinho, mesmo REQUIRED no nível de evento discreto', () => {
  // recalibração central do PASSO 13.1: PURCHASE/REFUND/CANCELLED/EXPIRED (mesmo estágio
  // CHECKOUT) já são VALIDATED via Hotmart — CHECKOUT_INITIATED vira DIAGNOSTIC_REQUIREMENT, não
  // entra em capital_blocking_requirements, e o gate (sem blockerGraph) fica READY_FOR_CAPITAL.
  resetContractCounter();
  const contract = buildTrackingContract({ subjectType: 'CANDIDATE_ARCHITECTURE', subjectId: 'Y', architectureId: 'Y', stageTypes: ['CHECKOUT'], platform, financialTruthBlocking: false, productId: 'p' });
  const checkoutInitiated = contract.required_events.find((e) => e.event === 'CHECKOUT_INITIATED');
  assert.equal(checkoutInitiated.requirement_class, 'DIAGNOSTIC_REQUIREMENT');
  assert.ok(!contract.capital_blocking_requirements.some((e) => e.event === 'CHECKOUT_INITIATED'));
  const gate = evaluateMeasurementCapitalGate({ contract, financialTruthBlocking: false, reconciliationMatchRate: 1 });
  assert.equal(gate.state, 'READY_FOR_CAPITAL');
});

test('estágio sem NENHUM evento capital-bloqueante mapeado (ex.: WHATSAPP isolado) não tem requisito bloqueante a checar — cai pra avaliação de reconciliação', () => {
  resetContractCounter();
  const contract = buildTrackingContract({ subjectType: 'CANDIDATE_ARCHITECTURE', subjectId: 'Z', architectureId: 'Z', stageTypes: ['WHATSAPP'], platform, financialTruthBlocking: false, productId: 'p' });
  assert.equal(contract.capital_blocking_requirements.length, 0);
  const gate = evaluateMeasurementCapitalGate({ contract, financialTruthBlocking: false, reconciliationMatchRate: 1 });
  assert.equal(gate.state, 'READY_FOR_CAPITAL'); // nada bloqueante presente e reconciliação real ok — nunca travado por omissão
});

test('TRACKING_CONTRACT_READY != EXPERIMENT_READY_FOR_CAPITAL: contrato com granularidade não-bloqueante faltando ainda pode ficar READY_FOR_CAPITAL se os requisitos bloqueantes estiverem validados', () => {
  const fakeContract = {
    capital_blocking_requirements: [{ event: 'PURCHASE', status: 'VALIDATED' }, { event: 'REFUND', status: 'VALIDATED' }],
    non_blocking_requirements: [{ event: 'SCROLL_DEPTH', status: 'REQUIRED' }],
  };
  const gate = evaluateMeasurementCapitalGate({ contract: fakeContract, financialTruthBlocking: false, reconciliationMatchRate: 0.95 });
  assert.equal(gate.state, 'READY_FOR_CAPITAL');
  assert.ok(gate.non_blocking_gaps.includes('SCROLL_DEPTH'));
});

test('match_rate de reconciliação baixo gera NEEDS_RECONCILIATION mesmo com eventos bloqueantes validados', () => {
  const fakeContract = { capital_blocking_requirements: [{ event: 'PURCHASE', status: 'VALIDATED' }], non_blocking_requirements: [] };
  const gate = evaluateMeasurementCapitalGate({ contract: fakeContract, financialTruthBlocking: false, reconciliationMatchRate: 0.4 });
  assert.equal(gate.state, 'NEEDS_RECONCILIATION');
});

test('computeContractStatus: nenhum evento implementado mas todos especificados = READY_FOR_IMPLEMENTATION', () => {
  assert.equal(computeContractStatus({ eventStatuses: ['REQUIRED', 'REQUIRED'], financialTruthBlocking: false }), 'READY_FOR_IMPLEMENTATION');
});

test('computeContractStatus: financialTruthBlocking sempre vence qualquer outro estado -> FAILED', () => {
  assert.equal(computeContractStatus({ eventStatuses: ['VALIDATED', 'VALIDATED'], financialTruthBlocking: true }), 'FAILED');
});

// ===== measurement debt =====

test('prioridade de dívida nunca é só contagem — ordem de fatores documentada (decision_impact -> capital_risk -> nº de escopos)', () => {
  const a = { debt_id: 'A', decision_impact: 'HIGH', capital_risk: 'LOW', affected_scopes: ['X'] };
  const b = { debt_id: 'B', decision_impact: 'HIGH', capital_risk: 'HIGH', affected_scopes: [] };
  assert.equal(compareDebt(a, b) > 0, true); // b (capital_risk maior) deve vir antes de a
});

test('real: registro de dívida real gerado a partir do audit real do repo, ranqueado deterministicamente', () => {
  const sourceOfTruth = buildSourceOfTruthMatrix({ dates: REAL_DATES });
  const debt = buildMeasurementDebtRegistry({ sourceOfTruth, platform, reconciliation: sourceOfTruth.reconciliation });
  assert.ok(debt.length > 0);
  for (let i = 1; i < debt.length; i++) assert.ok(compareDebt(debt[i - 1], debt[i]) <= 0);
  for (const item of debt) assert.equal(item.priority_rank, debt.indexOf(item) + 1);
});
