# Conversas com o Claude

Cobre as conversas do painel (tela "Conversar com Claude") e seus modos.

## 1. Objetivo

Permitir que o dono converse com o Claude sobre o projeto, usando a assinatura do Claude Code já logada, sem API paga. Implementação: `startJob` em `server.mjs`, tela em `assets/app.js`. Detalhes técnicos: [../backend/ai-architecture.md](../backend/ai-architecture.md).

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Título | Até 80 caracteres; padrão "Nova conversa"; ao enviar a 1ª mensagem, o título vira o início dela (até 60 caracteres), se ainda for o padrão; renomeável pelo ícone de lápis ao lado do título (ou clicando nele). |
| Encerrada | Opcional (`closed`). Conversa encerrada guarda o histórico, mostra o selo "Encerrada" e não aceita novas mensagens até ser reaberta. |
| Modelo | `fable` (Fable 5.1, o mais capaz; **exige créditos de uso, cobrados à parte da assinatura**: sem créditos a conversa mostra o erro "requires usage credits" do próprio Claude e nada é executado), `opus` (Opus 5.5), `sonnet` (Sonnet 5.5, padrão) ou `haiku` (Haiku 5.5, rápido e econômico). Escolhido no menu ao lado do modo, na linha do Enviar; vale na hora, mesmo com o Claude trabalhando. A resposta mostra a versão real usada. |
| Tom | Menu ao lado do modelo (embutido no Tilo, sem plugin; some se `TILO_CAVEMAN=off`): **Normal** (respostas completas, sem Caveman), **Enxuto** (`lite`, padrão do Tilo), **Curto** (`full`) e **Mínimo** (`ultra`). O menu mostra a frase: o Caveman mediu em média 65% menos tokens de resposta (de 22% a 87%); no Tilo ainda não há medida própria. Quanto mais curto o tom, menos tokens a resposta usa (Normal gasta mais; Mínimo economiza mais, mas fica mais seco de ler); o corte vale só para o texto das respostas, não para o contexto que o Claude lê do projeto. A lista do menu explica isso em cada opção. Gravado por conversa (`tom`). Vale a partir da próxima resposta, não na hora: o plugin só lê o tom quando o processo do Claude inicia (o que acontece a cada mensagem depois que ele terminou o que fazia). Em "Normal" numa conversa que já tinha tom curto, o Tilo também pede ao Claude para voltar ao tom explicativo. |
| Modo | Um menu só, na linha do Enviar (abre para cima, com ícone e explicação de cada opção, como as permissões do Claude Code): **Perguntar tudo** (cada edição e cada comando pedem aprovação), **Aceitar edições** (padrão; edita arquivos do projeto sem perguntar, comandos pedem aprovação), **Planejamento** (só lê e planeja), **Automático** (aprova sozinho edições e comandos comuns; produção e bloqueados continuam como estão; só vale até reiniciar o servidor) e **Somente leitura**. `Shift+Tab` na caixa de mensagem alterna; `/modo perguntar|editar|plan|auto|leitura` também. A troca vale na hora, mesmo com o Claude trabalhando. Arquivos de segredos continuam negados em todos os modos. Não existem mais as chaves "permitir editar", "permitir comandos" e o botão de aprovação automática. |
| Tempo de sessão | Selo no cabeçalho com o tempo desde a criação da conversa e, enquanto o Claude trabalha, "Claude trabalhando há ..." ao lado do Enviar. |
| Vínculo com pendência | Opcional (`itemId`); contexto de até 4000 caracteres enviado na primeira mensagem. Na conversa, uma faixa abaixo do título mostra a pendência vinculada (título e seção); clicar nela abre o item no painel de Pendências. |
| Mensagem | Até 20.000 caracteres. |
| Consumo | Tokens usados, no cabeçalho, na lista lateral e na tela Sessões (inclusive nas encerradas). Ver [consumo-de-tokens.md](consumo-de-tokens.md). |

## 3. Fluxos

- **Criar:** botão "Nova conversa" ou o ícone de conversa em uma pendência.
- **Enviar:** `Ctrl+Enter` ou botão. Atalhos de resposta: Explique, Passo a passo, Já está feito?, Recomende.
- **Enviar durante a execução:** a caixa e o botão Enviar ficam sempre disponíveis. Com o Claude trabalhando, a mensagem aparece como "na fila" (pontilhada) e o Claude a lê no próximo passo da tarefa, como no terminal; ao ser lida, vira mensagem normal na ordem real. Serve para perguntar o andamento, acrescentar instruções ou mudar a direção. Várias mensagens seguidas ficam na fila (até 20) e nenhuma se perde.
- **Comandos de texto:** `/plan` alterna o modo plan; `/plan <texto>` envia já em plan; `/model fable|opus|sonnet|haiku` (também `padrao`, `default`) troca o modelo; `/modo ...` troca o modo. Outro texto iniciado por `/` é recusado.
- **Parar:** botão Parar interrompe o que o Claude está fazendo agora (como Esc no terminal) e nega pedidos pendentes. A conversa continua: dá para mandar a próxima instrução.
- **Aba Atividade:** o chat tem duas abas, **Conversa** e **Atividade**. Os comandos e ferramentas do Claude (Bash, Edit, Write, Read...) não poluem a conversa: cada resposta mostra só uma linha-resumo (ex.: "6 ações · 1 com erro"), e a aba Atividade lista tudo em ordem de tempo, ao vivo, com ícone de status (rodando, ok, erro ou interrompida), o comando ou caminho, a hora e a duração; clicar numa ação mostra o comando completo (até 2.000 caracteres). A aba tem um contador de ações. **Só o comando e o status são guardados: a saída da ferramenta nunca é gravada** (pode conter segredos); o que importa fica no texto da conversa. A caixa de mensagem e os cartões de aprovação continuam visíveis nas duas abas.
- **Encerrar / Reabrir:** botão "Encerrar" no cabeçalho (com confirmação) cancela a resposta em andamento, desliga a aprovação automática e bloqueia o envio; "Reabrir conversa" volta ao normal. Na lista lateral, as encerradas ficam ao final e vêm **ocultas por padrão** (a opção "ocultar encerradas" aparece quando existe alguma e pode ser desmarcada; a conversa aberta continua visível).
- **Apagar:** remove a conversa, cancela o processo e desliga a aprovação automática dela.
- **Continuar sessão do terminal:** cria uma conversa nova com as últimas mensagens da sessão como contexto ([sessoes-terminal.md](sessoes-terminal.md)).
- **Aviso de falha:** se o `claude` falha, a resposta mostra o erro e a mensagem fica marcada como erro.

## Regras

- Cada conversa tem no máximo um processo do Claude por vez; mensagens novas entram na fila dele (nunca em paralelo). Mensagem que o Claude não chegou a ler (falha, encerramento, reinício) fica no histórico marcada "não chegou a ser lida pelo Claude", para reenviar.
- Mudar de modo ou de modelo vale na hora, sem reiniciar a conversa.
- A lista lateral mostra só as conversas do painel (as sessões do terminal ficam na tela Sessões, aba Terminal).
- **Perguntas do Claude:** quando o Claude faz perguntas com opções (típico do modo plan), o painel mostra, dentro do chat, um cartão com as opções selecionáveis (uma ou várias, conforme a pergunta) e sempre uma última opção "Outro", onde o dono escreve o que quer. "Dispensar" faz o Claude seguir com a melhor suposição.
- No modo plan, as opções de edição e comandos ficam desabilitadas.
- **Sair do modo plan:** quando o dono aprova o plano (pedido `ExitPlanMode`), o painel desliga o modo plan da conversa. As mensagens seguintes voltam a usar as opções de edição e comandos da conversa. Negar o plano mantém o modo plan. No modo plan as ferramentas de edição e comandos não são bloqueadas de vez (o próprio modo plan do Claude impede o uso), para que, aprovado o plano, a mesma execução já possa escrever.
- **Origem do pedido de aprovação:** o cartão de aprovação/pergunta/plano aparece só na conversa do pedido e some ao trocar de conversa; pedidos de outro projeto nunca aparecem. Se o pedido é de outra conversa, o Tilo **não troca de tela**: a conversa fica marcada "aguardando você" na lista lateral e um aviso diz qual é.
- **Botões de saída do plan:** com a conversa em plan, parada e com ao menos uma resposta, o painel mostra uma barra acima da caixa de texto: "Sair do planejamento e continuar" (desliga o plan e envia "Plano aprovado… Pode executar o plano agora.") e "Só sair do planejamento" (apenas desliga o plan).
- O Claude recebe sempre as instruções fixas: responder em português simples, conferir no código ou em `docs/` e seguir o `CLAUDE.md` do projeto.
- Conversas de documentação (`doc`) têm regras próprias ([documentacao-com-claude.md](documentacao-com-claude.md)).
