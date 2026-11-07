# Aprovação de comandos

Cobre o que o Claude pode executar sozinho, o que pede a sua decisão e o que é bloqueado. Regras técnicas: [../backend/command-policy.md](../backend/command-policy.md).

## 1. Objetivo

Deixar o Claude propor comandos de terminal em uma conversa sem que nada perigoso rode sem o dono ver e decidir.

## 2. Propriedades conceituais

| Resultado | Significado |
|---|---|
| Bloqueado | Não roda, nem pedindo. Vale para todos os projetos e não pode ser removido. |
| Liberado | Roda sem perguntar: só consulta de fábrica, pacotes ligados no projeto e comandos lembrados. |
| Pergunta | Mostra um cartão de aprovação dentro do chat. |
| Produção | Pergunta com destaque em vermelho e exige marcar "Entendi o que este comando faz e quero que ele rode". |

Quando perguntar, o cartão mostra: motivo, nível (só consulta, altera arquivos, usa a internet, mexe em servidor/produção, não reconhecido), uma explicação em português com passos e o comando exato.

## 3. Fluxo de uma aprovação

1. O Claude pede para usar uma ferramenta; o pedido chega ao servidor pelo aprovador.
2. A política decide: bloqueia, libera ou pergunta (ordem: bloqueado > produção > lembrado > liberado > pergunta).
3. Se pergunta, a conversa mostra o cartão (acima da caixa de mensagem, como o do plano; sem janela modal), só na conversa do pedido. Se é de outra conversa, ela fica marcada "aguardando você" na lista lateral. O dono pode continuar escrevendo mensagens enquanto o cartão espera. Botões:
   - **Negar**
   - **Aprovar só desta vez**
   - **Aprovar e lembrar** (só para comandos comuns de terminal com até 4000 caracteres; guarda o comando exato no projeto)
   - **Aprovar tudo desta conversa** (só para risco normal; muda o modo da conversa para Automático)
4. Sem resposta em 5 minutos, o pedido é negado.

## Aprovação do plano (modo plan)

Quando o Claude termina um plano (ferramenta `ExitPlanMode`), o plano **completo** aparece como um cartão dentro do chat, acima da caixa de mensagem, com três botões descritos na própria tela (não só em dica). Não abre janela modal.

- **Sair do planejamento e executar o plano**: desliga o modo plan e o Claude segue para a execução (cada comando continua passando pela aprovação normal).
- **Sair do planejamento e escrever uma instrução**: desliga o modo plan, não executa nada e leva o cursor para a caixa de mensagem, para o dono dizer ao agente o que fazer.
- **Continuar planejando**: não aprova; a conversa segue em modo plan e o dono pede os ajustes.
- Nunca é aprovado automaticamente, nem por "Aprovar tudo desta conversa".
- Se o plano é de outra conversa, ela fica marcada "aguardando você" (o Tilo não troca de conversa sozinho).
- Sem resposta em 5 minutos, o plano é negado.

## Regras

- O modo da conversa (seletor ao lado do Enviar) define o que pergunta: em **Perguntar tudo** até edições pedem aprovação; em **Aceitar edições** só comandos; em **Automático** comandos comuns também passam (produção sempre pergunta); em **Somente leitura** nada de editar nem de rodar comandos (negado sem perguntar). O Automático some ao trocar de modo, apagar a conversa ou reiniciar o servidor.
- "Lembrar" nunca vale para comandos bloqueados nem de produção.
- Ferramentas que não são de terminal (por exemplo busca na internet) sempre perguntam.
- O cartão fica no chat até o dono decidir. Não existe janela modal para aprovações.
- Pedidos pendentes são negados quando a conversa termina, é parada ou é apagada.
- Cada pedido e cada decisão é registrado ([auditoria.md](auditoria.md)).
- Em conversas de documentação o Claude não tem terminal; a aprovação vale para alterar arquivos existentes ([documentacao-com-claude.md](documentacao-com-claude.md)).
