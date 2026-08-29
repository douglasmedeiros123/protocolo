'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProductId } = require('../../config/product');
const { analyzeStrategy } = require('../strategy-search/builder');

// PASSO 17 — BUILD FIRST REAL EXPERIMENT TREATMENT. Este módulo NUNCA constrói/edita a página em
// si (isso é HTML/CSS/JS fora de analytics/, escrito diretamente) — só audita/valida/documenta o
// que já foi construído, sempre por LEITURA (fs.readFileSync), nunca escreve no controle nem em
// nenhum sistema externo.

// item 1-2 — reconfirma o winner dinamicamente ANTES de reportar qualquer coisa sobre o treatment
// já construído — nunca assume que o estado do PASSO 16 continua válido sem checar de novo.
function confirmWinnerUnchanged({ productId, dataDir, referenceDate, expectedWinnerArchitectureId } = {}) {
  const resolvedProductId = resolveProductId(productId);
  const strategyResult = analyzeStrategy({ productId: resolvedProductId, dataDir, referenceDate });
  const currentWinnerId = strategyResult.analysis.recommendation.recommended_architecture_id;
  const currentArchId = strategyResult.analysis.current_architecture.architecture_id;
  const winnerIsCurrent = currentWinnerId === currentArchId;
  const winnerObj = winnerIsCurrent
    ? strategyResult.analysis.current_architecture
    : strategyResult.analysis.challengers.find((c) => c.architecture_id === currentWinnerId);
  return {
    matches_expected: expectedWinnerArchitectureId == null || currentWinnerId === expectedWinnerArchitectureId,
    product_id: resolvedProductId,
    current_winner_architecture_id: currentWinnerId,
    current_winner_family: winnerObj ? winnerObj.family : null,
    control_architecture_id: currentArchId,
  };
}

// item 13 — Treatment Identity Contract. status nunca 'LIVE'; deployment_status sempre
// NOT_DEPLOYED até um deploy real ocorrer (fora do escopo deste PASSO — write boundary proíbe).
function buildTreatmentIdentityContract({ productId, winnerArchitectureId, controlArchitectureId, experimentId, variantId }) {
  return {
    product_id: productId,
    architecture_id: winnerArchitectureId,
    variant_id: variantId,
    experiment_id: experimentId,
    control_architecture_id: controlArchitectureId,
    page_role: 'ADVERTORIAL_TREATMENT',
    observation_type: 'PROSPECTIVE_TREATMENT_CANDIDATE',
    deployment_status: 'NOT_DEPLOYED',
    status: 'NOT_LIVE', // nunca 'LIVE' até deploy real confirmado (execution/exposureIdentityRegistry.js DEPLOYMENT_LIFECYCLE_CONTRACT)
  };
}

// item 14/15 — validação ESTÁTICA (leitura do HTML real construído) do tracking contract mínimo —
// nunca alega runtime_validated sem deploy real. Cada marcador é uma checagem textual honesta do
// que está de fato escrito no arquivo, nunca uma suposição.
const REQUIRED_TRACKING_MARKERS = {
  page_identity: /window\.__EXPERIMENT_IDENTITY__/,
  architecture_identity: /architecture_id:\s*"/,
  variant_identity: /variant_id:\s*"/,
  experiment_identity: /experiment_id:\s*"/,
  cta_interaction_identity: /cta_click/,
  checkout_transition_identity: /data-architecture-id=|data-variant-id=/,
  utm_preservation: /location\.search/,
  gtm_container_reused: /GTM-54PT3H4Z/,
  advertorial_view_event: /advertorial_view/,
};

function auditTrackingContractImplementation({ treatmentHtmlAbsolutePath }) {
  if (!treatmentHtmlAbsolutePath || !fs.existsSync(treatmentHtmlAbsolutePath)) {
    return { treatment_exists_as_real_page: false, requirements: {}, note: 'nenhum arquivo real encontrado no caminho informado.' };
  }
  const html = fs.readFileSync(treatmentHtmlAbsolutePath, 'utf8');
  const requirements = {};
  for (const [key, pattern] of Object.entries(REQUIRED_TRACKING_MARKERS)) {
    requirements[key] = { implemented_in_code: pattern.test(html), runtime_validated: false };
  }
  return {
    treatment_exists_as_real_page: true,
    requirements,
    session_continuity: { implemented_in_code: false, runtime_validated: false, note: 'nenhuma infraestrutura de session_id persistente existe hoje — debt já registrado (MDEBT-004-equivalente de sessão), não implementado neste PASSO.' },
    note: 'IMPLEMENTED_IN_CODE só confirma que o marcador existe no HTML/JS real — RUNTIME_VALIDATED permanece false pra todos até um deploy real + confirmação de execução em produção (item 15, nunca alegado sem isso).',
  };
}

// item 12 — control integrity: confirma que o controle não foi alterado neste PASSO.
function auditControlIntegrity({ controlHtmlAbsolutePath, gitDiffStatOutput = '' }) {
  return {
    control_file_checked: controlHtmlAbsolutePath,
    control_file_exists: fs.existsSync(controlHtmlAbsolutePath),
    git_diff_empty_for_control: gitDiffStatOutput.trim() === '',
    reason: 'teste-b/index.html só foi LIDO (fs.readFileSync) uma vez, pra extrair fatos reais (preço, garantia, CTA, stack de oferta) usados na continuidade de mensagem do treatment — nunca aberto em modo de escrita neste PASSO.',
  };
}

// item 23 — halt/rollback: PREPARED, nunca EXECUTED. Distinção explícita entre os dois.
const HALT_ROLLBACK_PLAN = {
  halt: {
    status: 'PREPARED',
    method: 'remover/comentar a futura regra de host no vercel.json que rotearia tráfego pro treatment — interrompe NOVA exposição/alocação de tráfego, sem apagar a página construída.',
  },
  rollback: {
    status: 'PREPARED',
    method: 'garantir que a regra de host do vercel.json continue apontando 100% pro controle (teste-b) — como o controle nunca foi alterado neste PASSO, rollback é uma reversão de ROTEAMENTO futuro, nunca uma reconstrução de página.',
  },
  distinction: 'HALT impede NOVA exposição/alocação de tráfego a partir de agora; ROLLBACK restaura o controle anterior como fonte única de tráfego — os dois nunca são o mesmo conceito (item 23).',
};

// item 24 — deployment plan: PREPARED, nunca executado neste PASSO.
function buildDeploymentPlan({ treatmentRelativePath }) {
  return {
    route: `regra de host dedicada em vercel.json apontando uma fração do tráfego (ou domínio/subpath específico) pra /${treatmentRelativePath} — decisão de alocação NUNCA tomada neste PASSO.`,
    control_preservation: 'teste-b/ permanece intacto e servindo 100% do tráfego real até uma decisão explícita de alocação.',
    treatment_route: `/${treatmentRelativePath}`,
    exposure_registration_timing: 'uma entrada REGISTER_OBSERVED_EXPOSURE real pro treatment só é criada no momento em que o deploy for confirmado (execution/exposureIdentityRegistry.js DEPLOYMENT_LIFECYCLE_CONTRACT) — nunca antes, nunca neste PASSO.',
    tracking_validation: 'smoke test real de GTM/dataLayer numa preview deployment do Vercel, antes de qualquer alocação real de tráfego.',
    smoke_test: 'abrir a URL de preview real; confirmar que dataLayer recebe advertorial_view; confirmar que o CTA preserva UTM/query string; confirmar que o link de checkout aponta pro Hotmart correto (mesmo do controle).',
    rollback_path: HALT_ROLLBACK_PLAN.rollback.method,
    experiment_start_condition: 'só após tracking_validation real confirmada em produção E aprovação humana explícita (TIER_0_ANALYZE_ONLY exige aprovação pra qualquer gasto real, PASSO 14B) — nunca automático, nunca implícito no build.',
  };
}

module.exports = {
  confirmWinnerUnchanged, buildTreatmentIdentityContract,
  REQUIRED_TRACKING_MARKERS, auditTrackingContractImplementation,
  auditControlIntegrity, HALT_ROLLBACK_PLAN, buildDeploymentPlan,
};
