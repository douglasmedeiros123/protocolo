'use strict';

// DIAGNOSTIC TYPES (PASSO 9.1, item 3) — separa "isso é um defeito de código/markup" de "isso é
// uma teoria sobre por que a conversão está baixa". Um duplicate id="oferta" é um FATO
// verificável no HTML — nunca deve ser tratado com o mesmo peso epistêmico de uma hipótese de
// copy/comportamento.
const DIAGNOSTIC_TYPES = [
  'TECHNICAL_ISSUE', // defeito objetivo no código/markup (ex: id duplicado, link quebrado)
  'FUNCTIONAL_FRICTION', // o código funciona como projetado, mas pode gerar fricção real de uso
  'CONVERSION_HYPOTHESIS', // teoria sobre o que move uma métrica de conversão
  'BEHAVIORAL_HYPOTHESIS', // teoria sobre comportamento do usuário (scroll, tempo, engajamento)
  'MESSAGE_MATCH_HYPOTHESIS', // teoria sobre descompasso entre anúncio e LP
];

// PRE-EXPERIMENT VALIDATION (PASSO 9.1, item 6) — nem todo diagnóstico precisa de mídia paga
// pra ser investigado. Ordenado do mais barato pro mais caro.
const VALIDATION_METHODS = [
  'STATIC_CODE_CHECK', // ler o HTML/CSS/JS — custo ~R$0, imediato
  'FUNCTIONAL_TEST', // clicar/navegar manualmente num navegador real — custo ~R$0, minutos
  'BEHAVIORAL_DATA', // cruzar com dado comportamental já coletado (Clarity) — custo ~R$0, mas depende de dado existir
  'CONTROLLED_EXPERIMENT', // só se aprende rodando o experimento real com tráfego pago
];

function isValidDiagnosticType(value) { return DIAGNOSTIC_TYPES.includes(value); }
function isValidValidationMethod(value) { return VALIDATION_METHODS.includes(value); }

module.exports = { DIAGNOSTIC_TYPES, VALIDATION_METHODS, isValidDiagnosticType, isValidValidationMethod };
