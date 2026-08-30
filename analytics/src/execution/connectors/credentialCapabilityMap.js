'use strict';

const env = require('../../../config/env');

// PASSO 18.5, item 2 — auditoria real das integrações existentes (nunca presume acesso só
// porque existe código). Cada entrada é derivada de leitura direta do código real dos
// collectors (analytics/src/collectors/*.js), nunca inventada.
const CREDENTIAL_CAPABILITY_MAP = {
  META: {
    current_integration: 'analytics/src/collectors/meta.js — Graph API v20.0, endpoint /insights, level=ad.',
    auth_method: 'Bearer access_token (system user token) via querystring — nunca no corpo salvo.',
    current_read_capability: ['campaign_name/id', 'adset_name/id', 'ad_name/id', 'spend', 'impressions', 'clicks', 'cpm', 'ctr', 'actions', 'action_values'],
    current_write_capability: 'NENHUMA implementada no código atual — só leitura de insights existe hoje.',
    required_credentials: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
    api_limitations: 'Graph API não fornece atribuição confiável Meta->Hotmart por transação (nenhum ad_id/UTM chega na venda real) — já documentado em measurement/.',
    rate_limits: 'rate limit padrão da Graph API (não customizado neste projeto, sem throttling adicional implementado).',
    production_or_sandbox: 'PRODUCTION (ad_account_id real: act_837771300886167).',
    secret_storage_location: 'environment variable local (.env, gitignored) ou GitHub Actions Secret (automação diária existente).',
    operational_risk: 'BAIXO pra leitura (read-only, sem custo/mutação). Token com escopo ads_management (não usado hoje) elevaria o risco — recomendado manter escopo ads_read.',
  },
  HOTMART: {
    current_integration: 'analytics/src/collectors/hotmart.js — OAuth2 client_credentials + endpoint /payments/api/v1/sales/history.',
    auth_method: 'OAuth 2.0 client_credentials (Basic auth pra obter token, depois Bearer pro endpoint de vendas). Token de acesso é gerado em runtime, nunca persistido.',
    current_read_capability: ['transaction_id (purchase.transaction)', 'order_date_utc', 'product_name', 'status (APPROVED/COMPLETE/REFUNDED/CANCELLED/EXPIRED)', 'gross/net value', 'hotmart_fee', 'payment_method', 'buyer_name'],
    current_write_capability: 'NENHUMA implementada — collector é 100% leitura (sales/history).',
    required_credentials: ['HOTMART_CLIENT_ID', 'HOTMART_CLIENT_SECRET'],
    missing_from_current_code: ['endpoint de products/offers dedicado — nomes de produto vêm só do campo item.product.name dentro de cada transação real, nunca de um catálogo de ofertas separado.', 'subscriptions/recurring — NOT_AVAILABLE_VIA_API no código atual (nunca implementado).', 'chargebacks — NOT_AVAILABLE_VIA_API no código atual.'],
    api_limitations: 'consulta sem filtro de status não retorna REFUNDED/CANCELLED/EXPIRED — o collector já pede cada status separadamente (item 9 do código real) e deduplica por transaction_id.',
    rate_limits: 'não documentado/testado neste projeto ainda.',
    production_or_sandbox: 'PRODUCTION (vendas reais confirmadas ao longo da sessão).',
    secret_storage_location: 'environment variable local (.env, gitignored) ou GitHub Actions Secret.',
    operational_risk: 'BAIXO pra leitura. API pública da Hotmart não expõe endpoint de mutação de produto/preço/checkout pra parceiros externos — write real, se existir, provavelmente exige acesso ao painel, não API (não confirmado, ver item 6).',
  },
  CLARITY: {
    current_integration: 'analytics/src/collectors/clarity.js — Data Export API, project-live-insights.',
    auth_method: 'Bearer CLARITY_API_TOKEN.',
    current_read_capability: ['scroll_depth_avg_pct', 'engagement_active_time_s/total_time_s', 'dead_click_pct', 'rage_click_pct', 'sessions (total/distinct_users/bots)', 'browser/device breakdown'],
    current_write_capability: 'API do Clarity é só leitura por natureza — nenhuma mutação existe no produto.',
    required_credentials: ['CLARITY_API_TOKEN'],
    api_limitations: 'janela fixa de 1-3 dias a partir de AGORA — SEM parâmetro de data histórica (confirmado no código real e no README). Limite de 10 chamadas/dia/projeto.',
    rate_limits: '10 chamadas/dia/projeto (limite real documentado).',
    production_or_sandbox: 'PRODUCTION.',
    secret_storage_location: 'environment variable local (.env, gitignored).',
    operational_risk: 'BAIXO — só leitura possível por design da própria API.',
  },
  GITHUB: {
    current_integration: 'analytics/src/collectors/github.js — REST API /repos/{repo}/commits (histórico de mudanças de LP).',
    auth_method: 'token ANALYTICS_GITHUB_TOKEN (Bearer/token scheme), nomeado separadamente do IG_TOKEN do autopost pra nunca confundir os dois sistemas.',
    current_read_capability: ['commit sha/date/message/author, filtrado por ruído de autopost'],
    current_write_capability: 'este agente de dados nunca escreve no GitHub — a escrita real (commit/push) acontece via git CLI direto nesta sessão, fora deste collector.',
    required_credentials: ['ANALYTICS_GITHUB_TOKEN', 'GITHUB_REPO'],
    api_limitations: 'rate limit padrão da API REST do GitHub (5000 req/h autenticado).',
    rate_limits: '5000 requisições/hora (padrão GitHub REST autenticado).',
    production_or_sandbox: 'PRODUCTION (repositório real douglasmedeiros123/protocolo).',
    secret_storage_location: 'environment variable local (.env, gitignored) — nunca o mesmo token usado pelo git remote desta sessão (que já vem embutido na URL do remote, gerenciado fora deste projeto).',
    operational_risk: 'BAIXO se escopo for só "repo:read". Write/workflow/secrets access nunca foram solicitados nem usados por este collector.',
  },
  VERCEL: {
    current_integration: 'NENHUMA integração de API existe no código — o deploy acontece via GitHub -> Vercel (integração nativa, confirmada real nesta sessão via commit status "Vercel" no GitHub).',
    auth_method: 'N/A — nenhum token Vercel usado; deploy é 100% via push no Git.',
    current_read_capability: 'nenhuma leitura direta via API Vercel — status de deploy é lido via GitHub commit status API (já coberto pelo GITHUB acima) ou verificação HTTP direta da URL de produção (já feito manualmente nas PASSOs anteriores).',
    current_write_capability: 'nenhuma — deploy é resultado de push, nunca uma chamada de API dedicada.',
    required_credentials: 'NENHUMA necessária hoje — mecanismo já funciona via Git (item 18 do PASSO 18.5: não adicionar token desnecessário).',
    api_limitations: 'N/A.',
    rate_limits: 'N/A.',
    production_or_sandbox: 'PRODUCTION (deploy real confirmado no PASSO 18).',
    secret_storage_location: 'N/A — nenhum secret Vercel necessário.',
    operational_risk: 'NENHUM — nenhuma credencial nova introduzida.',
  },
};

/** buildCredentialCapabilityMap() — combina o mapa estático real acima com env.status() real (o que está de fato configurado nesta sessão agora). */
function buildCredentialCapabilityMap() {
  const envStatus = env.status();
  return {
    META: { ...CREDENTIAL_CAPABILITY_MAP.META, missing_credentials: envStatus.meta.missing },
    HOTMART: { ...CREDENTIAL_CAPABILITY_MAP.HOTMART, missing_credentials: envStatus.hotmart.missing },
    CLARITY: { ...CREDENTIAL_CAPABILITY_MAP.CLARITY, missing_credentials: envStatus.clarity.missing },
    GITHUB: { ...CREDENTIAL_CAPABILITY_MAP.GITHUB, missing_credentials: envStatus.github.missing },
    VERCEL: { ...CREDENTIAL_CAPABILITY_MAP.VERCEL, missing_credentials: [] },
  };
}

module.exports = { CREDENTIAL_CAPABILITY_MAP, buildCredentialCapabilityMap };
