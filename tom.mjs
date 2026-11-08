// Tom das respostas do Claude nas conversas do Tilo (menu "Tom"): normal, lite, full ou ultra.
// Embutido no projeto: o texto vai no --append-system-prompt, sem plugin, sem hooks e sem arquivos fora do Tilo.
//
// Baseado nas regras do plugin Caveman (https://github.com/JuliusBrussee/caveman), licença MIT.
// Copyright (c) 2026 Julius Brussee. Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files, to deal in the Software without restriction, subject to the inclusion of
// this copyright notice and the MIT permission notice (ver LICENSE do projeto original). Texto adaptado ao português e ao Tilo.

// Importante: o texto segue como argumento de linha de comando (shell no Windows): sem aspas duplas, sem % e só com caracteres do português.
export const TONS = ['normal', 'lite', 'full', 'ultra'];

const NORMAL = 'Tom das respostas: normal. Responda com frases completas e explicativas. Esta regra substitui qualquer instrução anterior da conversa para responder de forma curta, telegráfica ou no modo caveman.';

const BASE = (nome) => `Tom das respostas: ${nome}. Vale em TODA resposta, sem voltar ao tom longo com o passar da conversa, e substitui qualquer instrução anterior de estilo. Corte só a enrolação; o conteúdo técnico fica inteiro. `
  + 'Corte: cumprimentos e agradecimentos, interjeições como claro! e com certeza, introdução que repete a pergunta, hesitação (talvez, provavelmente) quando não há dúvida real, narração do que vai fazer com ferramentas, resumo final que repete o que já disse, tabelas e emojis decorativos, e logs de erro longos (cite só a linha decisiva). '
  + 'Mantenha exatos: código, comandos, caminhos, nomes de API e de função, mensagens de erro e termos técnicos. Responda no idioma do usuário. '
  + 'Escreva em texto normal e completo nestes casos: avisos de segurança, ações irreversíveis, sequências de passos em que a ordem pode ser mal entendida, e quando o usuário pedir esclarecimento ou repetir a pergunta; depois volte ao tom. Código, commits e PRs: texto normal. ';

const NIVEIS = {
  lite: BASE('enxuto') + 'Mantenha artigos e frases completas, só mais enxutas e profissionais, ainda em linguagem simples.',
  full: BASE('curto') + 'Pode omitir artigos e usar fragmentos, com sinônimos curtos (usar, não utilizar). Padrão: [coisa] [ação] [motivo]. [próximo passo].',
  ultra: BASE('mínimo') + 'Abrevie palavras da prosa (BD, config, req, res, impl), tire conjunções, use -> para causa e consequência e uma palavra só quando bastar. Nunca abrevie símbolos de código, nomes de função ou de API, nem mensagens de erro.',
};

export function instrucaoTom(tom) { return NIVEIS[tom] || NORMAL; }
