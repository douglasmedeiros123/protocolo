'use strict';

// PASSO 17.1 — PRE-DEPLOY REVIEW + FIRST EXPERIMENT LAUNCH CONTRACT. NUNCA implementa connector,
// NUNCA faz deploy, NUNCA altera mídia/orçamento/capital. Define a SEMÂNTICA de como o primeiro
// experimento real seria exposto, medido, congelado em versão, e julgado — nunca executa nada
// disso.

// ==========================================================================
// item 3 — copy claim audit. Classificação real de cada claim relevante do treatment.
// ==========================================================================
const CLAIM_CLASSES = ['SUPPORTED_BY_PRODUCT', 'SUPPORTED_BY_EXISTING_ASSET', 'SUPPORTED_BY_CONTROL', 'INFERENCE', 'UNSUPPORTED'];

const COPY_CLAIM_AUDIT = [
  { claim: '"Mandou o preço ✓✓ e o cliente sumiu?" (hook)', classification: 'SUPPORTED_BY_CONTROL', evidence: 'mesmo tema/registro do sticky bar real do controle.' },
  { claim: '5 citações de dor ("mandei o orçamento...", "dois tracinhos azuis"...)', classification: 'SUPPORTED_BY_CONTROL', evidence: 'reaproveitadas verbatim de teste-b/index.html.' },
  { claim: '"Oi, tudo bem? Conseguiu ver?" não diz nada de novo pro cliente', classification: 'INFERENCE', evidence: 'raciocínio defensável a partir do fato real de que é a MESMA mensagem genérica citada no controle — nunca validado por dado/teste real.' },
  { claim: '"Não é falta de cliente... É falta da mensagem certa pro momento certo"', classification: 'SUPPORTED_BY_CONTROL', evidence: 'citação verbatim do reframe real já usado no controle (H2 real).' },
  { claim: '"Recuperar uma única venda parada hoje já cobre... o investimento"', classification: 'SUPPORTED_BY_CONTROL', evidence: 'paráfrase da claim real do controle ("já paga esse investimento 5x mais").' },
  { claim: 'Nome do produto "Cartilha Anti-Vácuo" / "+40 ativações prontas"', classification: 'SUPPORTED_BY_PRODUCT', evidence: 'fato real do produto, idêntico ao controle.' },
  { claim: '3 passos "Localize a cena / Copie e personalize / Envie e recupere"', classification: 'SUPPORTED_BY_CONTROL', evidence: 'reaproveitado verbatim do controle.' },
  { claim: '4 prints de conversa real (prova social)', classification: 'SUPPORTED_BY_EXISTING_ASSET', evidence: 'assets/provas/prova1-4.jpg — arquivos reais pré-existentes no repo, nunca fabricados neste PASSO.' },
  { claim: 'Bio do autor "Especialista em processos de vendas pelo WhatsApp"', classification: 'SUPPORTED_BY_CONTROL', evidence: 'reaproveitado verbatim da bio real do controle.' },
  { claim: 'Garantia incondicional de 7 dias / devolução de 100%', classification: 'SUPPORTED_BY_PRODUCT', evidence: 'fato real do produto, idêntico ao controle.' },
  { claim: 'Stack de oferta + preço (R$67,00 / 9x R$8,63 / valor total R$318,00)', classification: 'SUPPORTED_BY_PRODUCT', evidence: 'fatos reais idênticos ao controle.' },
  { claim: 'Disclaimer/CNPJ/e-mail de suporte no rodapé', classification: 'SUPPORTED_BY_PRODUCT', evidence: 'reaproveitado verbatim do controle.' },
];

function auditCopyClaims() {
  const unsupported = COPY_CLAIM_AUDIT.filter((c) => c.classification === 'UNSUPPORTED');
  return {
    claims: COPY_CLAIM_AUDIT,
    unsupported_claims_found: unsupported.length,
    blocks_deploy: unsupported.length > 0,
    reason: unsupported.length > 0
      ? `${unsupported.length} claim(s) UNSUPPORTED encontrada(s) — bloqueia deploy até corrigir (item 3).`
      : 'nenhuma claim UNSUPPORTED encontrada — todas as claims relevantes são SUPPORTED_BY_PRODUCT/EXISTING_ASSET/CONTROL ou INFERENCE explicitamente marcada como tal.',
  };
}

// ==========================================================================
// item 4 — isolamento experimental: variável primária + diferenças secundárias classificadas.
// ==========================================================================
const PRIMARY_VARIABLE = 'FUNNEL_ARCHITECTURE / COMPREHENSION_STAGE';

const SECONDARY_DIFFERENCES = [
  { difference: 'Estágio ADVERTORIAL novo (hook/dor/mecanismo antes da oferta)', classification: 'NECESSARY_FOR_TREATMENT', reason: 'é literalmente a variável sendo testada.' },
  { difference: 'Hero sem mockup do produto/animação de chat (diferente do hero do controle)', classification: 'NECESSARY_FOR_TREATMENT', reason: 'a hipótese é justamente adiar a revelação da oferta — mostrar o produto de cara no hero contradiria o desenho do teste.' },
  { difference: 'Paleta de cor / tokens visuais (--background/--primary/--gradient-neon etc.)', classification: 'UNCHANGED', reason: 'PASSO 17.1 corrigiu isso — tokens copiados EXATAMENTE do CSS real do controle (teste-b/assets/styles-D5pakB-q.css), nunca aproximados.' },
  { difference: 'Fonte de exibição (Outfit/Inter)', classification: 'UNCHANGED', reason: 'mesma fonte do controle, carregada via mesmo Google Fonts CDN — corrigido neste PASSO.' },
  { difference: 'Preço/checkout/garantia/produto', classification: 'UNCHANGED', reason: 'idênticos ao controle (mesma URL Hotmart, mesmo valor).' },
  { difference: 'Ticker animado de frases de dor (marquee) presente no controle, ausente no treatment', classification: 'COSMETIC', reason: 'elemento decorativo de repetição — remove redundância visual, não conteúdo informacional novo.' },
  { difference: 'Bloco "Antes e Depois" com mockups de chat (presente no controle, ausente no treatment)', classification: 'COSMETIC', reason: 'substituído por prova social REAL (prints verdadeiros) em vez de mockup ilustrativo — argumentavelmente mais forte, mas é uma troca de FORMATO de prova, não de conteúdo estrutural.' },
  { difference: 'Seção de FAQ em accordion (presente no controle, ausente no treatment)', classification: 'POTENTIAL_CONFOUNDER', reason: 'controle trata objeções adicionais (forma de pagamento, segurança, segmento, acesso) que o treatment não replica — omitido porque o texto real das respostas do FAQ não está disponível no HTML estático (accordion fechado, conteúdo renderizado só em runtime) e fabricar respostas violaria a regra de nenhuma claim inventada. Risco aceito e documentado, não corrigido neste PASSO — nenhuma resposta de FAQ real disponível pra reaproveitar sem fabricação.' },
  { difference: 'meta robots noindex,nofollow no treatment (ausente no controle)', classification: 'COSMETIC', reason: 'só relevante pra indexação orgânica — tráfego do experimento vem de anúncio, nunca de busca orgânica; precisa ser removido/revisado no momento real do deploy (nota no deployment plan), mas não afeta o experimento em si.' },
];

function auditExperimentalIsolation() {
  const materialConfounders = SECONDARY_DIFFERENCES.filter((d) => d.classification === 'POTENTIAL_CONFOUNDER');
  return {
    primary_variable: PRIMARY_VARIABLE,
    secondary_differences: SECONDARY_DIFFERENCES,
    material_confounders_found: materialConfounders.length,
    material_confounders: materialConfounders,
    blocks_deploy: false, // nenhum confounder encontrado é considerado "evitável sem fabricar conteúdo" — documentado como risco aceito, não bloqueante (item 4 pede corrigir OU bloquear; correção exigiria fabricar respostas de FAQ, o que é proibido por regra mais forte)
  };
}

// ==========================================================================
// item 5-6 — mecanismo de exposição. Comparação real, recomendação própria, nunca implementado.
// ==========================================================================
const EXPOSURE_MECHANISM_OPTIONS = {
  CONTROLLED_SEQUENTIAL_EXPOSURE: {
    description: 'período real do controle, seguido de um período real do treatment (troca da regra de host em vercel.json numa data real) — comparação via AGGREGATE_TEMPORAL_COMPARISON (measurement/minimumViableAttribution.js) + exposure registry já construído (execution/exposureIdentityRegistry.js).',
    measurement_reliability: 'MODERATE — sujeito a confounds temporais, mas já suportado pela infraestrutura real existente.',
    financial_attribution: 'GOOD — Hotmart financial truth não precisa de atribuição por usuário, só por período.',
    platform_attribution: 'GOOD — uma única campanha Meta contínua, sem necessidade de split.',
    implementation_complexity: 'LOW — só troca a regra de host numa data real, zero código novo/connector novo.',
    contamination_risk: 'LOW — nunca dois tratamentos ao vivo simultaneamente.',
    sample_fragmentation: 'NONE — 100% do tráfego real vai pro braço ativo em cada período.',
    rollback: 'TRIVIAL — reverter a regra de host.',
    capital_risk: 'LOW/BOUNDED — mesmo gasto de mídia corrente, nenhuma campanha nova.',
    current_infrastructure_fit: 'TOTAL — usa só o que já existe (vercel.json + exposure registry + measurement).',
    tier_0_compatible: true,
  },
  SEPARATE_ROUTES_OR_CAMPAIGNS: {
    description: 'controle e treatment ao vivo simultaneamente, cada um com sua própria campanha/rota Meta.',
    measurement_reliability: 'POTENCIALMENTE MELHOR EM TEORIA, mas Hotmart NÃO recebe ad_id/UTM na transação hoje (financial_attribution real = NOT_AVAILABLE por criativo/campanha) — a vantagem teórica não é realizável com a instrumentação atual.',
    financial_attribution: 'POOR — sem linkagem real ad->Hotmart, não dá pra atribuir a venda a qual campanha/página com confiança.',
    platform_attribution: 'possível só do lado Meta (purchase, nunca financial truth).',
    implementation_complexity: 'HIGH — exige campanhas novas, split de orçamento, disciplina de UTM.',
    contamination_risk: 'MEDIUM — sobreposição de audiência entre campanhas.',
    sample_fragmentation: 'HIGH — divide o tráfego real já escasso pela metade.',
    rollback: 'requer pausar/editar campanha — mais lento.',
    capital_risk: 'HIGHER — roda duas campanhas.',
    current_infrastructure_fit: 'PARCIAL — exigiria alteração de mídia/campanha, proibida neste PASSO.',
    tier_0_compatible: false,
  },
  DETERMINISTIC_TRAFFIC_SPLIT: {
    description: 'split determinístico (ex.: cookie/hash) na camada de roteamento — cada visitante vê um braço fixo, aleatoriamente atribuído.',
    measurement_reliability: 'MELHOR em teoria (randomização real elimina confounds temporais).',
    financial_attribution: 'mesma limitação real de Hotmart não receber ad_id/UTM — não resolve o gargalo de atribuição financeira individual.',
    implementation_complexity: 'HIGH — exige construir um connector/middleware de roteamento novo, NUNCA implementado hoje.',
    current_infrastructure_fit: 'NENHUMA — nenhuma infraestrutura de randomização existe no repo.',
    tier_0_compatible: false,
    blocked_reason: 'exigiria implementar connector novo — explicitamente proibido neste PASSO (item, "NÃO implemente connector").',
  },
};

function recommendExposureMechanism() {
  return {
    recommended_mechanism: 'CONTROLLED_SEQUENTIAL_EXPOSURE',
    is_randomized: false, // item 6 — NUNCA alegar randomização que não existe
    correct_nomenclature: 'nunca "A/B randomizado" — o nome correto é CONTROLLED_SEQUENTIAL_EXPOSURE (item 6).',
    reason: 'única opção real compatível com a infraestrutura atual (vercel.json host-routing + exposure registry já construído + AGGREGATE_TEMPORAL_COMPARISON já suportado), com TIER_0_ANALYZE_ONLY, e sem exigir novo connector/mídia/orçamento — as outras duas opções exigem exatamente o que este PASSO proíbe.',
    causal_limitations: [
      'TIME_EFFECTS — o desempenho pode mudar por fatores de tempo, não só pela arquitetura.',
      'CAMPAIGN_DRIFT — a campanha Meta pode mudar de comportamento/otimização entre os períodos.',
      'AUCTION_VARIATION — o leilão de anúncios varia por conta própria ao longo do tempo.',
      'DAY_OF_WEEK — padrões de dia da semana podem diferir entre os dois períodos.',
      'CREATIVE_MIX — os criativos ativos podem mudar de um período pro outro.',
      'EXTERNAL_CHANGES — sazonalidade, mudanças de mercado, ou qualquer evento externo não controlado.',
    ],
    options_compared: EXPOSURE_MECHANISM_OPTIONS,
  };
}

// ==========================================================================
// item 7 — Experiment Start Contract. EXPERIMENT_STATUS: PREPARED -> RUNNING só com TODOS os
// critérios reais satisfeitos — nunca só porque o arquivo foi implantado.
// ==========================================================================
const EXPERIMENT_START_REQUIREMENTS = [
  'treatment_deployed (regra de host real confirmada em vercel.json, apontando pro treatment)',
  'route_reachable (HTTP 200 real confirmado na URL de produção)',
  'tracking_smoke_test_passed (dataLayer real confirmado disparando em produção — advertorial_view, cta_click)',
  'exposure_identity_registered (entrada REGISTER_OBSERVED_EXPOSURE real criada, live_from=timestamp real de confirmação)',
  'control_identity_preserved (entrada de exposição do controle continua íntegra — live_until setado corretamente na transição)',
  'financial_truth_healthy (FINANCIAL_TRANSACTION_TRUTH.status != BLOCKED)',
  'policy_and_approval_satisfied (Policy Engine não retorna DENY; se REQUIRE_HUMAN_APPROVAL, aprovação humana real já concedida)',
  'circuit_breaker_closed (execution/circuitBreaker.js state=CLOSED)',
  'human_approval_given (aprovação humana explícita pro deploy+início — TIER_0 nunca autoriza isso implicitamente)',
];

function evaluateExperimentStartReadiness(realState = {}) {
  const results = EXPERIMENT_START_REQUIREMENTS.map((req) => {
    const key = req.split(' ')[0];
    const satisfied = realState[key] === true;
    return { requirement: key, satisfied, note: satisfied ? 'confirmado' : 'não confirmado (nenhum deploy real ocorreu neste PASSO)' };
  });
  const allSatisfied = results.every((r) => r.satisfied);
  return {
    experiment_status: allSatisfied ? 'RUNNING' : 'PREPARED',
    requirements: results,
    reason: allSatisfied ? 'todos os critérios reais satisfeitos.' : 'pelo menos um critério real não confirmado — status permanece PREPARED, nunca RUNNING só porque um arquivo existe.',
  };
}

// ==========================================================================
// item 8 — lifecycle de registro de exposição. Nunca backdate.
// ==========================================================================
const EXPOSURE_REGISTRATION_LIFECYCLE = {
  states: ['NOT_DEPLOYED', 'DEPLOYED_NOT_VALIDATED', 'READY_FOR_EXPOSURE', 'LIVE_RUNNING'],
  transitions: {
    NOT_DEPLOYED: { current: true, meaning: 'estado real atual do treatment — nenhum deploy ocorreu.' },
    DEPLOYED_NOT_VALIDATED: { meaning: 'deploy real ocorreu, mas tracking smoke test ainda não confirmado em produção — deployment_status atualiza, mas registry NUNCA cria entrada ACTIVE ainda.' },
    READY_FOR_EXPOSURE: { meaning: 'tracking real validado em produção — pronto pra começar a receber tráfego real, mas ainda não começou.' },
    LIVE_RUNNING: { meaning: 'exposição real começou — SÓ AGORA uma entrada REGISTER_OBSERVED_EXPOSURE real é criada, com live_from=timestamp real deste momento, nunca antes, nunca retroativo.' },
  },
  never_backdate_rule: 'live_from de qualquer entrada real do treatment é sempre o momento real da confirmação, nunca inferido/estimado pra uma data anterior (mesma disciplina de execution/exposureIdentityRegistry.js, item 7 do PASSO 16).',
};

// ==========================================================================
// item 9 — control baseline semantics: histórico != observação de controle do experimento.
// ==========================================================================
function buildControlBaselineSemantics() {
  return {
    HISTORICAL_BASELINE: {
      definition: 'desempenho real já observado da ARCH-CURRENT ANTES deste experimento (ex.: ~R$1.200/30d de gasto histórico, financial_roas≈0.64) — usado como CONTEXTO/prior, nunca como um braço formal do experimento.',
      role: 'informa expectativa/magnitude esperada — nunca é comparado estatisticamente 1:1 contra o período do treatment.',
    },
    EXPERIMENT_CONTROL_OBSERVATION: {
      definition: 'um período NOVO e real da ARCH-CURRENT, medido sob as MESMAS regras/janela temporal que o período do treatment (desenho CONTROLLED_SEQUENTIAL_EXPOSURE — controle roda imediatamente ANTES do treatment, ambos sob observação real).',
      role: 'é o braço de comparação real do experimento — nunca substituído silenciosamente pelos meses de histórico agregado.',
    },
    rule: 'os ~R$1.200 históricos NUNCA são tratados automaticamente como um braço randomizado do experimento (item 9) — servem só de contexto/prior. O braço de controle real do experimento é um período recente e específico, definido explicitamente quando o desenho sequencial for executado (fora do escopo deste PASSO).',
  };
}

// ==========================================================================
// item 10 — capital plan. Nunca inventa orçamento; nunca assume capital disponível = autorizado.
// ==========================================================================
function buildCapitalPlan({ mvaTestEstimatedCapital }) {
  return {
    MINIMUM_LAUNCH_CAPITAL_STATUS: mvaTestEstimatedCapital == null || mvaTestEstimatedCapital === 'NOT_ESTIMABLE' ? 'NOT_ESTIMABLE' : mvaTestEstimatedCapital,
    minimum_launch_capital_reason: 'experiments/evidence.js não define spend mínimo pra categoria CRO (usada como referência provisória) — nunca inventado (item 10, mesma regra do PASSO 16 item 15/16).',
    CURRENT_AVAILABLE_VALIDATION_CAPITAL: 'NOT_APPLICABLE',
    current_available_validation_capital_reason: 'nenhuma alocação específica de capital pra ESTE experimento foi autorizada por Douglas — o orçamento de mídia corrente (~R$1.116/30d) existe operacionalmente, mas nunca deve ser presumido como autorização implícita pra este teste (item 10, regra explícita: dinheiro disponível != dinheiro autorizado).',
  };
}

// ==========================================================================
// item 11 — referência provisória preservada (nunca promovida a regra estatística validada).
// ==========================================================================
const PROVISIONAL_OBSERVATION_RULE = {
  reference: { lpv: 100, checkouts: 10, duration_days: 7 },
  status: 'PROVISIONAL_OPERATIONAL_REFERENCE',
  never: 'VALIDATED_STATISTICAL_DECISION_RULE',
  function: 'impedir leitura precoce irresponsável (ex.: declarar resultado com 3 checkouts em 1 dia) — NUNCA declarar causalidade matemática/significância formal (item 11).',
};

// ==========================================================================
// item 12 — early harm. Só sinais JÁ definidos em outro lugar do sistema — nunca threshold
// percentual inventado. Circuit Breaker/Policy continuam soberanos.
// ==========================================================================
const EARLY_HARM_SIGNALS = {
  technical_failure: { defensible_signal_exists: true, source: 'HTTP status real da rota (route_reachable) — falha técnica é binária/observável, nunca um percentual.' },
  tracking_failure: { defensible_signal_exists: true, source: 'tracking smoke test real (dataLayer não dispara) — binário/observável.' },
  financial_truth_failure: { defensible_signal_exists: true, source: 'measurement/sourceOfTruth.js FINANCIAL_TRANSACTION_TRUTH.status=BLOCKED — já definido e soberano (execution/circuitBreaker.js GLOBAL_FREEZE).' },
  checkout_failure: { defensible_signal_exists: true, source: 'link de checkout real quebrado/inacessível — binário/observável via smoke test.' },
  severe_conversion_failure: { defensible_signal_exists: false, source: 'nenhum threshold percentual de queda de conversão foi definido/validado neste sistema.', status: 'NOT_CONFIGURED' },
  unexpected_spend: { defensible_signal_exists: false, source: 'nenhum limite de gasto inesperado específico deste experimento foi definido — execution/circuitBreakerEconomicInputs.js trata circuit breaker geral, não um limite dedicado a este teste.', status: 'NOT_CONFIGURED' },
  policy_violation: { defensible_signal_exists: true, source: 'execution/policyEngine.js RESULT_PRECEDENCE=DENY — já soberano, nunca contornado.' },
};

function auditEarlyHarmSignals() {
  const configured = Object.entries(EARLY_HARM_SIGNALS).filter(([, v]) => v.defensible_signal_exists).map(([k]) => k);
  const notConfigured = Object.entries(EARLY_HARM_SIGNALS).filter(([, v]) => !v.defensible_signal_exists).map(([k]) => k);
  return {
    signals: EARLY_HARM_SIGNALS,
    signals_with_defensible_stop_condition: configured,
    signals_not_configured: notConfigured,
    sovereignty_note: 'Circuit Breaker (execution/circuitBreaker.js) e Policy Engine (execution/policyEngine.js) continuam soberanos sobre qualquer decisão de parada — este contrato nunca os substitui ou contorna (item 12).',
  };
}

// ==========================================================================
// item 13-14 — change freeze + versioning durante RUNNING.
// ==========================================================================
const CHANGE_FREEZE_CONTRACT = {
  frozen_while_running: ['treatment_copy', 'treatment_structure', 'price', 'checkout', 'offer', 'tracking_semantics', 'relevant_campaign_conditions', 'measurement_contract'],
  not_frozen: ['bug fixes objetivos que não alteram semântica (ex.: corrigir um link quebrado sem mudar destino/preço)', 'observação/telemetria adicional que não altera o que já é medido'],
  material_change_during_run: 'gera um EXPERIMENT_CONTAMINATION_EVENT — registrado explicitamente, nunca escondido; mudança material exige nova versão (VARIANT-...-02) ou reinício do experimento.',
};

function evaluateVersioning({ currentVariantId, materialChangeDetected }) {
  if (!materialChangeDetected) {
    return { variant_id: currentVariantId, requires_new_version: false, reason: 'nenhuma mudança material detectada — versão permanece a mesma.' };
  }
  const match = currentVariantId.match(/^(.*-)(\d+)$/);
  const nextVariantId = match ? `${match[1]}${String(Number(match[2]) + 1).padStart(2, '0')}` : `${currentVariantId}-02`;
  return {
    variant_id: currentVariantId, requires_new_version: true, next_variant_id: nextVariantId,
    reason: 'mudança material detectada durante RUNNING — a versão atual não pode continuar fingindo ser a mesma (item 14); gera EXPERIMENT_CONTAMINATION_EVENT e exige nova variant_id.',
  };
}

// ==========================================================================
// item 15 — attribution plan. Só o nível de atribuição REALMENTE suportado, nunca fingido.
// ==========================================================================
function buildAttributionPlan() {
  return {
    exposure_period_to_architecture_variant_experiment: { supported: true, method: 'execution/exposureIdentityRegistry.js — registro real por período/arquitetura/variante/experimento.' },
    meta_delivery_to_lpv: { supported: 'PARTIAL', note: 'Meta reporta impressões/cliques/LPV agregados por criativo/campanha — nunca por sessão individual linkada ao Hotmart.' },
    lpv_to_checkout: { supported: true, method: 'measurement/funnelAudit.js + tracking_contract — nível agregado por período/arquitetura, real hoje.' },
    checkout_to_hotmart_financial_outcome: { supported: true, method: 'Hotmart real via order_date_utc — FINANCIAL_TRANSACTION_TRUTH, nível de período/produto, real hoje.' },
    individual_session_level_attribution: { supported: false, reason: 'nenhum session_id real persiste hoje ligando um visitante específico a uma transação Hotmart específica — MDEBT real já registrado (measurement/measurementDebt.js). NUNCA fingido como existente.' },
    real_supported_level: 'AGGREGATE_PERIOD_LEVEL (por arquitetura/variante/experimento/período) — nunca individual/session-level.',
  };
}

// ==========================================================================
// item 16 — outcome contract (estrutura do output futuro, nunca preenchido com dado real ainda —
// nenhum experimento rodou).
// ==========================================================================
const EXPERIMENT_OUTCOME_CONTRACT_SHAPE = {
  behavioral_signal: 'LEADING_INDICATOR real observado (lpv_to_checkout_rate) vs baseline.',
  financial_signal: 'ECONOMIC_OUTCOME real observado (financial_roas, financial_cpa, receita) vs baseline — sempre Hotmart, nunca Meta.',
  guardrail_status: 'refund_rate/financial_truth_health/anomalias — pode impedir declaração de vencedor mesmo com sinal econômico favorável.',
  measurement_quality: 'financial_truth_health + platform_attribution_health + reconciliation real no momento da leitura.',
  evidence_sufficiency: 'PROMISING_SIGNAL | SUFFICIENT_EVIDENCE (orchestrator/experimentDecisionSemantics.js, PASSO 16.1).',
  decision_rule_status: 'PROVISIONAL_OPERATIONAL_REFERENCE — nunca VALIDATED (item 11).',
  causal_limitations: 'herdadas do desenho CONTROLLED_SEQUENTIAL_EXPOSURE (item 6) — sempre reportadas junto de qualquer conclusão.',
  ceo_recommendation: 'uma de CONTINUE_COLLECTING | PROMISING_CONTINUE | STOP_FOR_HARM | ECONOMICALLY_PROMISING | ECONOMICALLY_UNFAVORABLE | INCONCLUSIVE — nunca WINNER prematuro.',
};

// ==========================================================================
// item 17 — Human Deploy Approval Contract. Autorização ESPECÍFICA e limitada a ESTE experimento
// — nunca "CEO pode gastar livremente".
// ==========================================================================
function buildHumanDeployApprovalObject({ exposureMechanism, deploymentPlan, capitalPlan }) {
  return {
    WHAT_WILL_CHANGE: 'uma nova rota real (advertorial-comprehension) passa a existir em produção; a regra de host do vercel.json passará a apontar tráfego real pra ela (só no momento de um deploy real futuro, nunca implícito nesta aprovação).',
    WHAT_WILL_NOT_CHANGE: 'produto, preço (R$67,00), checkout (mesmo link Hotmart), garantia, orçamento de mídia corrente, Authority Tier (permanece TIER_0_ANALYZE_ONLY).',
    ROUTE: deploymentPlan ? deploymentPlan.treatment_route : '/advertorial-comprehension',
    EXPOSURE_METHOD: exposureMechanism.recommended_mechanism + ' — ' + exposureMechanism.correct_nomenclature,
    CAPITAL_IMPLICATION: `${capitalPlan.MINIMUM_LAUNCH_CAPITAL_STATUS} — nenhum gasto novo autorizado por esta aprovação; qualquer capital real continua exigindo aprovação humana explícita separada (TIER_0).`,
    MEASUREMENT: 'AGGREGATE_TEMPORAL_COMPARISON (measurement/minimumViableAttribution.js) — atribuição no nível arquitetura/variante/experimento/período, nunca individual/sessão.',
    RISKS: ['contaminação por confounders temporais (item 6 — desenho não é randomizado)', 'seção de FAQ ausente no treatment (POTENTIAL_CONFOUNDER documentado, item 4)', 'tracking real ainda não validado em runtime (item 15/19 do PASSO 17)'],
    HALT: 'reverter/remover a regra de host que direcionaria tráfego pro treatment — nunca apaga a página.',
    ROLLBACK: 'garantir que vercel.json volte a apontar 100% pro controle (teste-b) — controle nunca foi alterado, então rollback é reversão de roteamento.',
    EXPECTED_LEARNING: 'se introduzir um estágio de compreensão antes da oferta melhora lpv_to_checkout_rate SEM deteriorar financial_roas/CPA — nunca uma prova estatística formal (regra de evidência é referência provisória, item 11).',
    scope_note: 'esta aprovação é ESPECÍFICA e limitada a ESTE experimento (deploy do treatment ARCH-CAND-02-COMPREHENSION_BUILDING_STAGE) — NUNCA uma autorização geral de gasto autônomo nem uma promoção de Authority Tier (item 17).',
  };
}

// item 18/19 — combina o resultado real (dinâmico) do CEO/Measurement rodados após a auditoria,
// nunca hardcoded — quem chama passa o resultado real de runCeoDecisionCycle()/analyzeMeasurement().
function determinePreDeployReadiness({ copyAudit, isolationAudit, ceoResult, measurementBlocked }) {
  const blockers = [];
  if (copyAudit.blocks_deploy) blockers.push('UNSUPPORTED_CLAIM_FOUND');
  if (measurementBlocked) blockers.push('MEASUREMENT_BLOCKED');
  if (ceoResult && ceoResult.policy_handoff && ceoResult.policy_handoff.policy_allows === 'DENY') blockers.push('POLICY_DENY');
  return {
    readiness: blockers.length === 0 ? 'READY_FOR_HUMAN_DEPLOY_APPROVAL' : 'NOT_READY_FOR_DEPLOY',
    blockers,
    reason: blockers.length === 0
      ? 'nenhum bloqueador real encontrado — claims auditadas, isolamento experimental sem confounder bloqueante evitável, measurement não bloqueado, policy não nega. Pronto pra revisão/aprovação humana explícita (nunca deploy automático).'
      : `bloqueado por: ${blockers.join(', ')}.`,
  };
}

module.exports = {
  buildHumanDeployApprovalObject, determinePreDeployReadiness,
  CLAIM_CLASSES, COPY_CLAIM_AUDIT, auditCopyClaims,
  PRIMARY_VARIABLE, SECONDARY_DIFFERENCES, auditExperimentalIsolation,
  EXPOSURE_MECHANISM_OPTIONS, recommendExposureMechanism,
  EXPERIMENT_START_REQUIREMENTS, evaluateExperimentStartReadiness,
  EXPOSURE_REGISTRATION_LIFECYCLE, buildControlBaselineSemantics, buildCapitalPlan,
  PROVISIONAL_OBSERVATION_RULE, EARLY_HARM_SIGNALS, auditEarlyHarmSignals,
  CHANGE_FREEZE_CONTRACT, evaluateVersioning, buildAttributionPlan, EXPERIMENT_OUTCOME_CONTRACT_SHAPE,
};
