# Aprovação de comandos

Cobre o que o Claude pode executar sozinho, o que pede a sua decisão e o que é bloqueado. Regras técnicas: [../backend/command-policy.md](../backend/command-policy.md).

## 1. Objetivo

Deixar o Claude propor comandos de terminal em uma conversa sem que nada perigoso rode sem o dono ver e decidir.

## 2. Propriedades conceituais

| Resultado | Significado |
|---|---|
| Bloqueado | Não roda, nem pedindo. Vale para todos os projetos e não pode ser removido. |
| Liberado | Roda sem perguntar: só consulta de fábrica, pacotes ligados no projeto e comandos lembrados. |
| Pergunta | Abre uma janela de aprovação. |
| Produção | Pergunta com destaque em vermelho e exige marcar "Entendi o que este comando faz e quero que ele rode". |

Quando perguntar, a janela mostra: motivo, nível (só consulta, altera arquivos, usa a internet, mexe em servidor/produção, não reconhecido), uma explicação em português com passos e o comando exato.

## 3. Fluxo de uma aprovação

1. O Claude pede para usar uma ferramenta; o pedido chega ao servidor pelo aprovador.
2. A política decide: bloqueia, libera ou pergunta (ordem: bloqueado > produção > lembrado > liberado > pergunta).
3. Se pergunta, a tela abre a janela. Botões:
   - **Negar**
   - **Aprovar só desta vez**
   - **Aprovar e lembrar** (só para comandos comuns de terminal com até 4000 caracteres; guarda o comando exato no projeto)
   - **Aprovar tudo desta conversa** (só para risco normal)
4. Sem resposta em 5 minutos, o pedido é negado.

## Regras

- "Aprovar tudo desta conversa" vale só para comandos comuns daquela conversa; produção sempre pergunta. A opção some ao desligar "permitir comandos", apagar a conversa ou reiniciar o servidor, e pode ser desligada pelo botão na conversa.
- "Lembrar" nunca vale para comandos bloqueados nem de produção.
- Ferramentas que não são de terminal (por exemplo busca na internet) sempre perguntam.
- A janela de aprovação não fecha com `Esc`.
- Pedidos pendentes são negados quando a conversa termina, é parada ou é apagada.
- Cada pedido e cada decisão é registrado ([auditoria.md](auditoria.md)).
- Em conversas de documentação o Claude não tem terminal; a aprovação vale para alterar arquivos existentes ([documentacao-com-claude.md](documentacao-com-claude.md)).
