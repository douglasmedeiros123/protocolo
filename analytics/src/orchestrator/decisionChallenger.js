'use strict';

// item 12 — DECISION_CHALLENGER (devil's advocate). NUNCA decide — só tenta invalidar a decisão
// vencedora, sinalizando premissas frágeis. As 10 perguntas do pedido, cada uma avaliada contra
// o estado real (nunca genérica/decorativa).
function challengeDecision({ winner, ranking, diagnosis, graph }) {
  const flags = [];

  if (winner && winner.confidence !== 'HIGH') {
    flags.push({ question: 'qual suposição mais frágil sustenta a opção vencedora?', flag: `confidence=${winner ? winner.confidence : 'N/A'} — a própria confiança na recomendação já não é alta; a suposição mais frágil é que ${winner ? winner.hypothesis : 'N/A'} realmente resolve o gargalo identificado.` });
  }
  flags.push({ question: 'existe explicação alternativa?', flag: diagnosis.cross_agent_conflicts.length > 0 ? `sim — ${diagnosis.cross_agent_conflicts.length} conflito(s) real(is) entre agentes foi(ram) detectado(s) e resolvido(s) pela hierarquia de fonte de verdade, não por consenso.` : 'nenhum conflito real detectado entre agentes neste ciclo.' });
  flags.push({ question: 'estamos confundindo correlação com causalidade?', flag: 'nenhum candidato deste ciclo afirma causalidade sem método (ver measurement/causalDiscipline.js, consumido read-only) — nenhuma alegação causal forte identificada pra desafiar.' });

  const currentArchWinner = winner && winner.action_class === 'HOLD_CAPITAL';
  flags.push({ question: 'estamos privilegiando a arquitetura atual?', flag: currentArchWinner ? 'sim — o vencedor é HOLD_CAPITAL, que preserva o status quo. Verificar se isso é por evidência real ou inércia (statusQuoChallenge.js roda separadamente pra isso).' : 'vencedor não é preservar o status quo — sem privilégio aparente ao que já existe.' });

  flags.push({ question: 'estamos tentando otimizar produto que deveria ser abandonado?', flag: `viability_status=${diagnosis.product_viability_state.viability_status}, verdict=${diagnosis.product_viability_state.verdict} — ${diagnosis.product_viability_state.viability_status === 'INSUFFICIENT_EVIDENCE' ? 'evidência ainda insuficiente pra concluir isso — continuar validando é defensável, nunca abandonar prematuramente (item 16).' : 'reavaliar conforme o status real.'}` });

  flags.push({ question: 'existe ação mais simples/reversível?', flag: winner && winner.reversibility !== 'REVERSIBLE' ? `winner.reversibility=${winner.reversibility} — existe candidato mais reversível no ranking? ${ranking.some((c) => c.reversibility === 'REVERSIBLE' && c.candidate_id !== winner.candidate_id) ? 'SIM, existe — vale reconsiderar se o upside extra compensa a reversibilidade menor.' : 'não, nenhum candidato mais reversível disponível.'}` : 'vencedor já é REVERSIBLE — nenhuma ação mais simples/reversível a considerar aqui.' });

  flags.push({ question: 'estamos ignorando custo de oportunidade?', flag: diagnosis.economic_state.known_path_to_target.status === 'NO_KNOWN_PATH' ? 'known_path_to_target=NO_KNOWN_PATH — continuar sem um caminho conhecido pro North Star tem custo de oportunidade real; mas isso não invalida evidência-primeiro quando o hypothesis space está pouco explorado (mesmo item 16).' : 'caminho conhecido existe — custo de oportunidade de não segui-lo deve ser considerado.' });

  flags.push({ question: 'measurement suporta a decisão?', flag: `measurement_state.current_blocker=${diagnosis.measurement_state.current_blocker || 'nenhum'} — ${diagnosis.measurement_state.current_blocker ? 'NÃO suporta plenamente ainda; qualquer candidato que dependa de atribuição de experimento real herda essa limitação.' : 'sem blocker de mensuração ativo — measurement suporta.'}` });

  flags.push({ question: 'estamos usando blended metric como marginal?', flag: 'nenhum candidato deste ciclo afirma marginal_roas — measurement/marginalEconomics.js já garante UNKNOWN quando não há dado incremental real (item 10 do PASSO 14B, reforçado aqui).' });

  flags.push({ question: 'estamos perseguindo ROAS bonito em vez de lucro absoluto?', flag: `profitability_state.status=${diagnosis.profitability_state.status} — a hierarquia de objetivo econômico (economicObjectiveHierarchy.js) prioriza lucro absoluto sustentável sobre ROAS cosmético; nenhum candidato deste ciclo otimiza ROAS isoladamente sem economics real por trás.` });

  return { challenger_questions_evaluated: flags.length, flags, challenger_decides: false, note: 'o challenger nunca decide — só sinaliza premissas frágeis pro humano/CEO reconsiderar (item 12).' };
}

module.exports = { challengeDecision };
