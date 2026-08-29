'use strict';

// PASSO 14A — limites explícitos. Princípio central: LLM_RECOMMENDATION != EXECUTION_AUTHORITY.
const OWNERSHIP_BOUNDARIES = {
  EXECUTION_VS_MEASUREMENT: {
    measurement_owns: ['auditar tracking real, financial_truth_health, capital_gate, anomaly findings, execution_safety_signal'],
    execution_owns: ['consumir esses sinais read-only (measurementHandoff.js) pra decidir política de execução — nunca recalcula measurement'],
    boundary_rule: 'Read-only sobre analyzeMeasurement() — nunca altera measurement/*.',
  },
  EXECUTION_VS_STRATEGY_SEARCH_PLANNER_DECISION: {
    strategy_owns: ['qual arquitetura/ação testar (recomendação estratégica)'],
    execution_owns: ['transformar a recomendação em Action Proposal e decidir SE/COMO ela pode ser executada com segurança — nunca decide O QUE testar'],
    boundary_rule: 'Read-only sobre analyzeStrategy()/analyzePlan()/decision builder — nunca registra em experiments/registry.js, nunca altera outro domínio.',
  },
  ORCHESTRATOR_VS_POLICY_ENGINE: {
    orchestrator_role: 'propõe Action Contracts a partir de recomendações de outros agents — nunca decide sozinho se pode executar.',
    policy_engine_role: 'única autoridade sobre ALLOW/DENY/REQUIRE_HUMAN_APPROVAL/DEFER/ALLOW_DRY_RUN_ONLY — regras rígidas, nunca julgamento livre de LLM.',
    boundary_rule: 'LLM_RECOMMENDATION != EXECUTION_AUTHORITY (princípio central do PASSO 14A) — o Orchestrator nunca sobrescreve o resultado da Policy Engine.',
  },
  POLICY_ENGINE_VS_CIRCUIT_BREAKER: {
    policy_engine_role: 'avalia uma Action Contract específica contra as 11 categorias de política.',
    circuit_breaker_role: 'monitora sinais operacionais agregados (frequência, anomalia crítica, fonte financeira) e pode BLOCK_EXECUTION/FREEZE_SCOPE/GLOBAL_FREEZE independente do resultado da Policy Engine pra uma ação específica.',
    boundary_rule: 'Circuit Breaker sempre tem a palavra final sobre execução — mesmo uma Action com policy_result=ALLOW e aprovação humana concedida respeita o estado atual do Circuit Breaker no momento da execução (item 14A.20).',
  },
  EXECUTION_LAYER_VS_EXTERNAL_CONNECTOR: {
    execution_layer_role: 'valida/simula/orquestra — nunca fala diretamente com uma API externa.',
    external_connector_role: 'única camada que teria permissão de mutação real — NÃO IMPLEMENTADA NESTE PASSO (item 14A.10: só a interface abstrata existe, execute() permanece stubbed/bloqueado em SAFE_MODE).',
    boundary_rule: 'Nenhum código deste PASSO alcança uma chamada de API mutável real — confirmado por safeMode.js/executionAdapters.js.',
  },
  FUTURE_ARCHITECTURE_CONTRACT: {
    architecture: 'CEO/ORCHESTRATOR -> POLICY ENGINE -> EXECUTION LAYER -> EXTERNAL CONNECTOR, com CIRCUIT BREAKER fora da autoridade da LLM.',
    rule: 'Circuit Breaker/runtime guardrails ficam fora da autoridade da LLM — implementados aqui como motor lógico determinístico, nunca como julgamento de modelo.',
  },
};

// PASSO 14A fechamento, item 3 — architectural debt registrado explicitamente, NUNCA
// implementado agora. Cada item documenta uma limitação real e consciente desta arquitetura.
const ARCHITECTURAL_DEBT = {
  PERSISTENCE_LAYER: 'registry.js hoje é um protótipo file/Git-based (mesma convenção do resto do projeto). Runtime state concorrente (múltiplas Actions/Approvals/Circuit Breaker em paralelo) deverá migrar pra storage transacional real quando houver execução contínua/concorrente — não antes disso.',
  CAPITAL_POLICY_REAL_VALUES: 'todas as chaves de capitalSafety.js (todos os 4 perfis) permanecem NOT_CONFIGURED — nenhum valor econômico real foi inventado. A configuração real será decidida no PASSO 14B, nunca antes, nunca pela LLM.',
  ANOMALY_THRESHOLDS: 'os thresholds de severidade de anomalia (measurement/anomalyDetection.js) continuam heurísticos — devem evoluir considerando financial materiality, frequency, persistence, affected_decision, affected_scope e confidence, não só taxa de ocorrência (já registrado como debt no PASSO 13.1, reafirmado aqui).',
  ROLLBACK_REAL_VALIDATION: 'nenhum connector real existe ainda — quando um Execution Adapter mutável real for implementado (fora do escopo deste PASSO), rollback_status só pode virar ROLLBACK_SUPPORTED depois de provar restore + validation reais (rollbackVerification.js já está pronto pra isso, mas nunca é exercitado de verdade em SAFE_MODE).',
  EXECUTION_AUTHORITY_GROWTH: 'autonomia financeira (autonomous_execution_limit crescendo além de NOT_CONFIGURED) deve crescer por evidência histórica real (execuções bem-sucedidas, rollback validado, medição confiável) — nunca por decisão da própria LLM/Orchestrator elevando seu próprio limite (reforça selfModificationProtection.js).',
};

// PASSO 14B calibração final, item 5 — decisão arquitetural registrada: o sistema JÁ possui
// Data Agent/collectors (analytics/src/collectors/) responsáveis pela leitura das fontes
// externas existentes (Meta Insights, Hotmart, Clarity, GitHub) — o futuro Execution Layer NÃO
// deve duplicar essa coleta read-only só pra ter um connector próprio. executionAdapters.js
// (MediaExecutionAdapter/TrackingExecutionAdapter/etc.) devem ganhar implementação real só
// quando adicionarem uma CAPACIDADE DE EXECUÇÃO (escrita) que ainda não existe — nunca pra
// replicar uma leitura que os collectors já fazem. READ_PATH (collectors -> normalizers ->
// Measurement/Strategy Search) e WRITE_PATH (Action Contract -> Policy Engine -> Execution
// Adapter -> External Connector) permanecem arquiteturas separadas — melhora segurança
// (comprometer o write path nunca compromete a leitura) e responsabilidade (cada caminho tem um
// dono claro).
const READ_WRITE_PATH_SEPARATION = {
  read_path: 'collectors/*.js -> normalizers/*.js -> Measurement/Strategy Search/Decision/Planner — já existe, nunca duplicado pelo Execution Layer.',
  write_path: 'Action Contract -> Policy Engine -> Execution Adapter -> External Connector (não implementado ainda) — só ganha um connector real quando uma capacidade de ESCRITA genuinamente nova for necessária.',
  rule: 'Execution adapters existem pra adicionar capacidade de execução, nunca pra re-implementar leitura que os collectors já fazem. READ_PATH e WRITE_PATH permanecem deliberadamente separados.',
};

// item 6 — próximo passo recomendado, registrado explicitamente (não implementado neste PASSO).
const NEXT_RECOMMENDED_STEP = {
  step: 'PASSO_15_CEO_ORCHESTRATOR_V1_SHADOW_MODE',
  reason: 'já existem inteligência (Measurement/Strategy Search/Decision/Planner), Policy Engine, Approval Policy, Circuit Breaker e Execution simulation suficientes pra construir o loop de coordenação (CEO/Orchestrator) sem conceder autoridade financeira real. O CEO deve nascer em SHADOW_MODE: zero mutações externas, zero capital autônomo, recomendações completas, avaliação de política completa, simulação de dry-run completa — o mesmo princípio SAFE_MODE/DRY_RUN já estabelecido nos PASSOs 14A/14A.1/14B, aplicado agora à camada de coordenação, não só às camadas individuais.',
};

module.exports = { OWNERSHIP_BOUNDARIES, ARCHITECTURAL_DEBT, READ_WRITE_PATH_SEPARATION, NEXT_RECOMMENDED_STEP };
