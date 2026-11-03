# Sessões do terminal

Cobre a leitura das sessões do Claude Code que o dono rodou no terminal, dentro do projeto.

## 1. Objetivo

Mostrar no painel o histórico das sessões do terminal, vinculá-las a pendências e permitir continuá-las numa conversa do painel. Implementação: `terminalSessions`, `sessionInfo`, `transcript` em `server.mjs`.

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Origem | Arquivos `.jsonl` em `<pasta do Claude>/projects/<raiz do projeto com caracteres não alfanuméricos trocados por "-">/`. A pasta do Claude é `CLAUDE_CONFIG_DIR` ou `~/.claude`. |
| Janela | Sessões alteradas nos últimos 7 dias, no máximo 40, mais recentes primeiro. |
| Exclusão | Sessões que são conversas do painel não aparecem como sessão do terminal. |
| Dados mostrados | Título (gerado pelo Claude Code), primeira e última mensagem do usuário, última resposta, modelo, modo. |
| Metadados do dono | Apelido (até 80 caracteres), vínculo com pendência e "oculta", guardados em `dados/<id>/sessoes-meta.json`. |

## 3. Fluxos

- **Ver conversa:** histórico somente leitura das últimas 60 mensagens (cada texto cortado em 4000 caracteres). Sessões com mais de 60 MB não são abertas.
- **Continuar no painel:** cria conversa nova com as últimas 8 mensagens como contexto; a sessão do terminal em si não é retomada pelo painel.
- **Copiar `claude --resume <id>`:** para retomar a sessão no próprio terminal.
- **Ocultar / mostrar ocultas**, **apelido** e **vincular a pendência** na tela Sessões (aba Terminal).

## Regras

- O Tilo só lê esses arquivos; nunca os altera.
- Mensagens técnicas do sistema (lembretes, comandos locais, notificações) não aparecem no resumo.
- Na Visão geral, "Sessões ativas agora" conta conversas do painel respondendo e sessões do terminal alteradas há menos de 2 minutos.
