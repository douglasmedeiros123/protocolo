'use strict';

const { classifyDeploymentEvidence } = require('../execution/exposureIdentityRegistry');

// PASSO 16, item 6-7 — identifica a arquitetura atual usando SOMENTE evidência real já
// disponível no repo (nunca web request, nunca consulta Vercel externa, nunca deploy). Consome
// currentArchitecture.source_of_truth.landing_page (já resolvido por strategy-search/
// currentArchitecture.js via cro/sourceOfTruth.js) — nunca chama resolveLandingPageSourceOfTruth()
// de novo aqui, pra não duplicar a mesma leitura/lógica em dois lugares.
function auditCurrentArchitectureEvidence({ currentArchitecture }) {
  const lpSourceOfTruth = currentArchitecture.source_of_truth.landing_page;

  // item 6 — evidência real disponível: regra de HOST no vercel.json (não fallback filesystem
  // genérico) + preço da LP batendo com config/product.js + transações reais Hotmart nesse preço
  // exato. Isso é mais forte que "só um commit existe", mas nunca uma confirmação de runtime
  // (nenhuma requisição HTTP foi feita).
  const hasHostRoutingRule = lpSourceOfTruth.found && lpSourceOfTruth.domain_matched != null;
  const hasPriceCrossCheck = lpSourceOfTruth.price_cross_check && lpSourceOfTruth.price_cross_check.matches_config_product === true;
  const hasRealTransactionsAtThisPrice = currentArchitecture.source_of_truth.offer.main_product.transactions_found > 0;

  const evidenceClassification = classifyDeploymentEvidence({
    hasConfirmedProductionDeployLog: false, // nunca disponível sem runtime/API real (item 6/53 herdado do PASSO 13)
    hasVercelDeployRecordLinkedToCommit: hasHostRoutingRule && hasPriceCrossCheck && hasRealTransactionsAtThisPrice,
    hasGitCommitOnly: hasHostRoutingRule && !(hasPriceCrossCheck && hasRealTransactionsAtThisPrice),
  });

  return {
    architecture_id: currentArchitecture.architecture_id,
    family: currentArchitecture.family,
    evidence_classification: evidenceClassification.class, // DEPLOYMENT_CONFIRMED|DEPLOYMENT_PROXY|REPO_CHANGE_ONLY|UNKNOWN
    evidence_classification_reason: evidenceClassification.reason,
    evidence_facts: {
      host_routing_rule: hasHostRoutingRule ? `vercel.json roteia ${lpSourceOfTruth.domain_matched} -> ${lpSourceOfTruth.considered_path} (regra de host explícita, não fallback filesystem).` : 'nenhuma regra de host encontrada.',
      price_cross_check: hasPriceCrossCheck ? `preço real na LP (R$${lpSourceOfTruth.price_cross_check.price_found_in_lp}) bate com config/product.js TICKET (R$${lpSourceOfTruth.price_cross_check.product_ticket_config}).` : 'preço não confirmado/não bate.',
      real_transactions: `${currentArchitecture.source_of_truth.offer.main_product.transactions_found} transação(ões) Hotmart real(is) confirmada(s) neste preço/produto no período avaliado.`,
    },
    evidence_source: 'cro/sourceOfTruth.js (vercel.json + LP estática) + strategy-search/currentArchitecture.js (Hotmart real) — leitura local apenas, nenhuma requisição externa.',
    // item 7 — live_from só é KNOWN se houver prova real de QUANDO a mudança entrou em produção
    // (nenhuma existe hoje — só sabemos que ESTÁ live agora, não desde quando exatamente).
    live_from_known: false,
    live_from_reason: 'nenhuma evidência real de QUANDO esta arquitetura entrou em produção está disponível (sem log de deploy, sem timestamp de publicação confiável) — live_from fica UNKNOWN, nunca inferido só pela existência de um commit (item 7/9 — REPO_CHANGE_ONLY != prova de produção).',
  };
}

module.exports = { auditCurrentArchitectureEvidence };
