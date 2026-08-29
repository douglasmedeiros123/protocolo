'use strict';

// PASSO 15.1, items 5-8 — auditoria semântica de ação. Blast radius deve refletir O QUE A AÇÃO
// MODIFICA, nunca o domínio que ela DESCREVE. REGISTER_OBSERVED_EXPOSURE (registrar internamente
// uma observação de estado que já existe) é uma ação COMPLETAMENTE diferente de CREATE_NEW_
// EXPOSURE (colocar arquitetura/variante live) — nunca tratadas como a mesma coisa.
const MUTATION_SCOPES = ['INTERNAL_STATE_WRITE', 'EXTERNAL_PLATFORM_WRITE', 'DEPLOYMENT_CHANGE', 'TRACKING_CHANGE', 'FINANCIAL_CHANGE', 'CAMPAIGN_CHANGE'];

// item 6-7 — tipos semânticos de ação específicos do CEO, distintos dos ACTION_TYPES genéricos
// de execution/enums.js (nunca modificado neste PASSO — write boundary).
const CEO_ACTION_SEMANTIC_TYPES = ['REGISTER_OBSERVED_EXPOSURE', 'CREATE_NEW_EXPOSURE', 'GENERIC_EXECUTABLE_ACTION'];

/**
 * classifyActionSemantics() — item 5-6. Deriva mutation_scope e semantic_type da NATUREZA REAL
 * do candidato (o que ele efetivamente escreve), nunca do domínio que ele descreve. Um candidato
 * que só registra uma observação sobre a arquitetura NUNCA herda blast radius de "mudar a
 * arquitetura" só por estar relacionado a ela.
 */
function classifyActionSemantics(candidate) {
  // registra observação de estado já existente (measurement debt MDEBT-007/EXPOSURE_IDENTITY é
  // exatamente isso: um registro interno, nunca um deploy real).
  const isRegisterObservedExposure = candidate.action_class === 'COLLECT_EVIDENCE'
    && candidate.measurement_requirements && candidate.measurement_requirements.includes('EXPOSURE_IDENTITY');
  if (isRegisterObservedExposure) {
    return {
      semantic_type: 'REGISTER_OBSERVED_EXPOSURE',
      mutation_scope: 'INTERNAL_STATE_WRITE',
      recommended_blast_radius_if_scope_respected: 'SINGLE_ASSET',
      reason: 'a ação só grava internamente uma observação de qual arquitetura já está live (fato que já existe no mundo real) — nunca cria/altera exposição real, deploy, tracking externo, campanha ou finanças. O blast radius deveria refletir isso (escrita interna, escopo mínimo), não o domínio "arquitetura" que ela descreve.',
    };
  }

  if (candidate.action_class === 'START_EXPERIMENT') {
    return {
      semantic_type: 'CREATE_NEW_EXPOSURE',
      mutation_scope: 'DEPLOYMENT_CHANGE',
      recommended_blast_radius_if_scope_respected: 'FUNNEL', // item 5 — aqui ACCOUNT/FUNNEL É defensável: implica colocar uma variante live de verdade.
      reason: 'iniciar um experimento real implica colocar uma arquitetura/variante nova live — mutation_scope=DEPLOYMENT_CHANGE, blast radius maior é genuinamente defensável aqui (diferente de um registro interno).',
    };
  }

  return {
    semantic_type: 'GENERIC_EXECUTABLE_ACTION',
    mutation_scope: 'INTERNAL_STATE_WRITE',
    recommended_blast_radius_if_scope_respected: 'SINGLE_ASSET',
    reason: 'nenhum padrão específico identificado — tratado como escrita interna mínima por padrão (nunca escala blast radius sem uma razão semântica real).',
  };
}

// item 8 — consistência semântica entre action_class (orientação do CEO) e semantic_type.
const SEMANTIC_TYPE_ALLOWED_ORIENTATIONS = {
  REGISTER_OBSERVED_EXPOSURE: ['COLLECT_EVIDENCE'],
  CREATE_NEW_EXPOSURE: ['EXECUTE', 'DO_NOT_EXECUTE'], // pode ser proposto pra EXECUTE, mas negado — nunca vira COLLECT_EVIDENCE disfarçado
  GENERIC_EXECUTABLE_ACTION: ['EXECUTE', 'DO_NOT_EXECUTE', 'HOLD_CAPITAL', 'COLLECT_EVIDENCE'],
};

function isOrientationConsistentWithSemanticType(semanticType, orientation) {
  const allowed = SEMANTIC_TYPE_ALLOWED_ORIENTATIONS[semanticType];
  return allowed ? allowed.includes(orientation) : false;
}

// item 7 — distinção futura entre autoridade de execução externa e autoridade de escrita
// operacional interna. Documentada, NÃO liberada automaticamente ainda — SHADOW_MODE continua
// bloqueando qualquer execução que a arquitetura determine proibida, independente disso.
const AUTHORITY_SEPARATION = {
  EXTERNAL_EXECUTION_AUTHORITY: 'autoridade pra mutações que afetam sistemas/plataformas externas reais (Meta/GTM/Hotmart/deploy) — hoje sempre bloqueada por SAFE_MODE/SHADOW_MODE, independente do tier.',
  INTERNAL_OPERATIONAL_WRITE_AUTHORITY: 'autoridade pra escritas internas seguras (ex.: decision/exposure registry) — conceitualmente MENOS restritiva que EXTERNAL_EXECUTION_AUTHORITY, mas NÃO liberada automaticamente neste PASSO. Continua passando pela mesma Policy Engine/Approval Policy/Circuit Breaker (item 19 do PASSO 15) — só a classificação semântica muda, nunca o gate em si.',
  note: 'preparação conceitual apenas (item 7) — nenhuma autoridade nova é concedida neste PASSO.',
};

module.exports = {
  MUTATION_SCOPES, CEO_ACTION_SEMANTIC_TYPES, classifyActionSemantics,
  SEMANTIC_TYPE_ALLOWED_ORIENTATIONS, isOrientationConsistentWithSemanticType, AUTHORITY_SEPARATION,
};
