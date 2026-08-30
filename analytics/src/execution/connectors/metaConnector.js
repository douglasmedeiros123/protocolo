'use strict';

const { collectMeta } = require('../../collectors/meta');
const env = require('../../../config/env');

// PASSO 18.5, item 9-10, 25 — adapters TIPADOS, nunca uma ferramenta genérica de HTTP arbitrário
// disponível ao CEO. READ é automático (sem aprovação — sem custo, sem mutação de estado).
// WRITE nunca executa aqui — só PROPÕE (item 10/24: LLM nunca segura autoridade bruta).

/** meta.readInsights() — item 9. READ_ONLY, nunca exige aprovação humana (sem custo/mutação). */
async function readInsights(dateStr) {
  const { ok } = env.status().meta;
  if (!ok) return { available: false, reason: 'CREDENTIAL_SETUP_REQUIRED', platform: 'META' };
  const raw = await collectMeta(dateStr);
  return { available: true, platform: 'META', date: dateStr, ad_account_id: raw.ad_account_id, rows: raw.rows, fetched_at: raw.fetched_at };
}

/**
 * meta.readCampaignStatus() — item 7/9. READ_ONLY (Graph API .../campaigns, fields=status,
 * effective_status,budget) — nunca muda estado, nunca exige aprovação. Complementa readInsights()
 * (que só traz insights de gasto/performance, nunca o status real ACTIVE/PAUSED da campanha).
 */
async function readCampaignStatus() {
  const { ok } = env.status().meta;
  if (!ok) return { available: false, reason: 'CREDENTIAL_SETUP_REQUIRED', platform: 'META' };
  const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID } = env.get('meta');
  const url = new URL(`https://graph.facebook.com/v20.0/${META_AD_ACCOUNT_ID}/campaigns`);
  url.searchParams.set('fields', 'name,status,effective_status,daily_budget,lifetime_budget');
  url.searchParams.set('access_token', META_ACCESS_TOKEN);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) return { available: false, platform: 'META', reason: 'API_ERROR', detail: json.error.message };
  return {
    available: true,
    platform: 'META',
    fetched_at: new Date().toISOString(),
    campaigns: (json.data || []).map((c) => ({ id: c.id, name: c.name, status: c.status, effective_status: c.effective_status, daily_budget: c.daily_budget || null, lifetime_budget: c.lifetime_budget || null })),
  };
}

// item 10 — cada ação proposta carrega o contrato completo exigido. NUNCA executa — sempre
// retorna status=AWAITING_HUMAN_APPROVAL, mesmo que a credencial usada tivesse permissão de
// escrita (capability != authority, item 24).
function proposeBudgetChange({ actionId, campaignOrAdsetId, currentDailyBudget, proposedDailyBudget, why, confidence = 'MEDIUM' }) {
  const incrementalDailyCapital = proposedDailyBudget - currentDailyBudget;
  return {
    action_id: actionId,
    platform: 'META',
    action_type: 'BUDGET_CHANGE',
    current_state: { daily_budget: currentDailyBudget },
    proposed_state: { daily_budget: proposedDailyBudget },
    why,
    expected_effect: incrementalDailyCapital > 0 ? 'possível aumento de volume de tráfego/exposição, nunca garantido.' : 'redução de gasto — nunca inventa um efeito positivo específico sem evidência.',
    capital_impact: { current_daily_budget: currentDailyBudget, proposed_daily_budget: proposedDailyBudget, incremental_daily_capital: incrementalDailyCapital },
    blast_radius: 'CAMPAIGN',
    reversibility: 'REVERSIBLE (mudança de orçamento pode ser revertida a qualquer momento via API/painel).',
    risk: incrementalDailyCapital > 0 ? 'gasto incremental real, sem garantia de retorno.' : 'LOW',
    confidence,
    halt: 'reverter proposed_state pro current_state via API (mesma chamada, valores invertidos).',
    rollback: 'idêntico ao halt — orçamento não tem estado histórico a "restaurar" além do valor anterior conhecido.',
    required_approval: 'HUMAN_APPROVAL_REQUIRED — MVA_INCREMENTAL_BUDGET_AUTHORITY=R$0 (item 14, PASSO 18.5).',
    status: 'AWAITING_HUMAN_APPROVAL',
  };
}

function proposeCampaignStatusChange({ actionId, campaignId, currentStatus, proposedStatus, why }) {
  return {
    action_id: actionId,
    platform: 'META',
    action_type: 'CAMPAIGN_STATUS_CHANGE',
    current_state: { status: currentStatus },
    proposed_state: { status: proposedStatus },
    why,
    capital_impact: 'NOT_ESTIMABLE — pausar/retomar não muda orçamento diário configurado, só se o gasto realmente ocorre.',
    blast_radius: 'CAMPAIGN',
    reversibility: 'REVERSIBLE (status pode ser revertido).',
    required_approval: 'HUMAN_APPROVAL_REQUIRED.',
    status: 'AWAITING_HUMAN_APPROVAL',
  };
}

// item 10/24 — NUNCA implementado neste PASSO. Existe só pra deixar explícito, no código, que
// mesmo com uma proposta aprovada, a execução real é um passo futuro e distinto, nunca disponível
// como chamada livre.
async function executeApprovedBudgetChange() {
  return { executed: false, blocked: true, reason: 'NOT_IMPLEMENTED_THIS_PASSO — execução real de mutação Meta está fora do escopo do PASSO 18.5 (só arquitetura de proposta/aprovação, nunca execução).' };
}

module.exports = { readInsights, readCampaignStatus, proposeBudgetChange, proposeCampaignStatusChange, executeApprovedBudgetChange };
