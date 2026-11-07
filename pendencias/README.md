# Pendências

> **⚠ Não exclua este arquivo nem a pasta `pendencias/`.** Ele é a fonte de dados da **Tilo**: as telas de pendências e a visão geral deste projeto são montadas a partir dele. Para enxugar, apague só as linhas dos itens concluídos. **Mantenha o formato:** seções `## N. Título` e itens em tabela (`| 🔴/🟡/🟢 | **Título** | descrição | detalhes |`) ou em lista (`- 🔴 **Título** — descrição`).

Painel do dono do projeto (Tilo). Prioridade: 🔴 crítica · 🟡 importante · 🟢 pode esperar. Ao concluir, apague a linha.

## 1. Decidir (só você pode)

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|

## 2. Fazer na mão

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|

## 3. Conferir

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟡 | **Conferir o novo fluxo de conversa (fila, Parar, modos)** | A conversa agora mantém um processo do Claude vivo e aceita mensagens durante a execução (fila nativa), tem um seletor de modo ao lado do Enviar (Perguntar tudo, Aceitar edições, Planejamento, Automático, Somente leitura), mostra ferramentas ao vivo e o tempo de sessão, e cada pedido de aprovação só aparece na própria conversa. Os testes do interpretador de eventos passam, mas o roteiro completo com o Claude de verdade (várias mensagens durante um comando longo, Parar, modo leitura, duas conversas com aprovação pendente) ainda precisa ser conferido na tela. | Regras em `docs/business/conversas-claude.md` e `docs/backend/ai-architecture.md`. Reinicie o Tilo (botão de reiniciar) para carregar o código novo. |
| 🟡 | **Conferir modelos e menus do chat** | O modelo foi para a linha do Enviar (ao lado do modo), os dois viraram menus com ícone e explicação, e a lista agora tem quatro modelos com versão (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5). Todos os `select` do painel agora usam o mesmo combobox (`assets/combo.js`, padrão obrigatório; ver `docs/frontend/design-system.md`). Testado no navegador sem interface: abrir, escolher, Esc, teclado, posição na janela, filtros e seleção de modelo da Documentação. Opus, Sonnet e Haiku foram confirmados em chamada real (o chat mostra a versão certa). **Fable 5.1:** o id é aceito, mas a conta responde "requires usage credits" (erro 429), ou seja, exige créditos de uso fora da assinatura; o Tilo mostra o erro no chat e avisa na lista de modelos. Decida se quer manter o Fable na lista (só funciona com créditos, e o uso seria cobrado à parte). Falta também olhar o menu nas telas Biblioteca e nas janelas (diálogos). | Regras em `docs/business/conversas-claude.md`. Reinicie o Tilo para valer. |\n| 🟡 | **Conferir a aba Atividade do chat** | Os comandos e ferramentas do Claude saíram do meio da conversa e foram para a aba Atividade (ao lado de Conversa), com só uma linha-resumo no chat. O servidor foi testado com o Claude de verdade (comando completo, duração e status guardados; saída não guardada), mas a aparência da aba, o contador e a abertura dos detalhes ainda precisam ser vistos na tela. | Regras em `docs/business/conversas-claude.md`. Reinicie o Tilo para valer. |
| 🟡 | **Conferir o Caveman nas conversas do Tilo** | As conversas agora carregam o plugin Caveman (nível `lite`) com `--plugin-dir`. Os testes com o Claude de verdade passaram e o registro da sessão mostra a regra ativa, mas vale conferir na tela se o tom das respostas serve para você (ele convive com o pedido de "linguagem simples e explicativa"). Para mudar o nível ou desligar, use as variáveis do `docs/backend/configuration.md`. | Reinicie o Tilo para valer. Os hooks do plugin são código de terceiros e escrevem `~/.claude/.caveman-active`. |
| 🟡 | **Conferir o consumo de tokens na tela** | O consumo (por conversa e o cartão da Visão geral) foi feito sem eu poder abrir um transcript real do Claude Code; os testes usam dados de exemplo. Abra a Visão geral e uma conversa já usada: se os números aparecerem zerados ou estranhos, o formato do arquivo é diferente do esperado e o ajuste é pequeno (`consumo.mjs`). | Regras em `docs/business/consumo-de-tokens.md`. O limite real da assinatura só existe em claude.ai > Configurações > Uso (o cartão tem o botão). |
| 🟡 | **Abrir o Tilo e conferir as telas** | A documentação do front-end foi escrita lendo os arquivos, sem abrir o navegador. Vale passar pelas sete telas do painel (inclui a nova aba Documentação mesclada, o encerrar/renomear/título automático das conversas, o filtro "ocultar encerradas" já ligado por padrão e o novo botão "Excluir da lista" na seleção de projetos) e conferir se batem com `docs/frontend/` e `docs/business/`. | — |

## 4. Fila de desenvolvimento

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟡 | **Testes que faltam** | A política, a biblioteca e o cadastro de projetos têm testes. O servidor, o aprovador e as telas não têm; um erro ali só aparece usando. O `server.mjs` sobe o servidor ao ser carregado, então testá-lo pede separar as funções puras (leitor do README, verificação de host) em um arquivo próprio. | `server.mjs`, `aprovador-mcp.mjs` |
