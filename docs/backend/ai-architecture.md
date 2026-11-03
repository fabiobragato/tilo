# Integração com o Claude Code

Cobre como `server.mjs` executa o `claude`, como as conversas funcionam e como o aprovador MCP participa.

## Execução do `claude`

Função `startJob` em `server.mjs`. Para cada mensagem, um processo `claude` é iniciado com:

| Argumento | Valor |
|---|---|
| `-p --output-format text` | Modo não interativo, saída em texto. |
| `--allowedTools` | `Read,Grep,Glob`; acrescenta `Edit,Write` só se a conversa permite edição (`edit` ligado e `plan` desligado, e não é conversa de documentação). |
| `--disallowedTools` | `Edit,Write` quando a edição não está liberada (exceto em conversas de documentação); `Bash,PowerShell` quando comandos não estão liberados (`exec` desligado, ou `plan` ligado, ou conversa de documentação). |
| `--setting-sources project` | Só configurações do projeto. |
| `--settings` | `<tmp>/tilo-settings.json`, gerado na partida (ver abaixo). |
| `--mcp-config` + `--strict-mcp-config` | `<tmp>/tilo-mcp-<chat>.json`, que declara o servidor MCP `tilo` (`aprovador-mcp.mjs`). |
| `--permission-prompt-tool` | `mcp__tilo__approve`. |
| `--append-system-prompt` | Texto fixo `SYSTEM` de `server.mjs` (pede português simples e conferência no código e em `docs/`). |
| `--add-dir` | Pastas de leitura extra: documentos de referência da biblioteca ou documentos de origem da generalização. |
| `--permission-mode plan` | Quando a conversa está em modo plan (e não é de documentação). Ao aprovar um pedido `ExitPlanMode` em `/api/aprovacao/decidir`, o servidor grava `plan: false` na conversa; sem isso, cada mensagem nova (um processo `claude` novo) reabriria em plan. |
| `--model` | `sonnet`, `opus` ou `haiku` (padrão `sonnet`). |
| `--session-id` / `--resume` | O id da conversa; `--session-id` na primeira mensagem, `--resume` nas seguintes. |

- Diretório de trabalho: raiz do projeto; na generalização, a pasta de rascunhos do lote.
- A mensagem do usuário vai por stdin. Na primeira mensagem de uma conversa com `contexto`, o texto é precedido por "Pendência em foco: ...".
- Ambiente: `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` vazias.
- A saída padrão é acumulada em memória (`jobs`). O painel consulta `/api/chat/stream` a cada 700 ms. Ao terminar, a resposta é gravada em `chats.json`; se o `claude` sai com código diferente de zero, a mensagem leva o aviso `[claude saiu com código N]` e a saída de erro, com `erro: true`.
- Modelos válidos são validados contra a lista fixa `MODELS`.

## Configurações geradas (`gerarSettings`)

Na partida, o servidor lê `claude-settings.json` e acrescenta regras `deny` com o nome real da pasta do Tilo, gravando `<tmp>/tilo-settings.json`:

- Leitura negada: `.env*` (variações), `.ssh/**`, `.claude/**`, `*.pem`, `id_ed25519*`, `id_rsa*` (do arquivo base) e, na pasta do Tilo, `.token` e `projetos.json`.
- Edição/escrita negadas na pasta do Tilo: `assets/**`, `modelos/**`, `scripts/**` e os arquivos `server.mjs`, `aprovador-mcp.mjs`, `politica.mjs`, `catalogo.mjs`, `projetos.mjs`, `claude-settings.json`, `projetos.json`.
- Edição/escrita de `.env*` negada em qualquer pasta.

## Aprovador MCP (`aprovador-mcp.mjs`)

- Servidor MCP por stdio (JSON-RPC, uma mensagem por linha) com uma única ferramenta, `approve` (`tool_name`, `input`, `tool_use_id`).
- Variáveis recebidas do servidor: `TILO_CHAT_ID`, `TILO_PROJECT`, `TILO_PORT`.
- Chama `POST /api/p/<projeto>/aprovacao/pedir`; devolve `{ behavior: "allow", updatedInput }` ou `{ behavior: "deny", message }`. Qualquer falha nega.

## Decisão de cada pedido (`/api/aprovacao/pedir`)

1. Conversa precisa existir e estar em execução (senão 409).
1a. Se a ferramenta é `AskUserQuestion` (as perguntas com opções que o Claude faz, comuns no modo plan), não passa pela política: vira um pedido do tipo `pergunta` (`askPergunta`) que o painel mostra como perguntas selecionáveis. O dono responde por `/api/aprovacao/decidir` com `respostas` (pergunta → opção, várias separadas por vírgula, ou texto livre de "Outro"); o servidor devolve `updatedInput` com `answers`, e `aprovador-mcp.mjs` repassa ao Claude. "Dispensar" nega com a orientação de seguir com a melhor suposição. Mesmo prazo de 5 minutos.
2. Em conversa de documentação, `Write`, `Edit` e `MultiEdit` são avaliados por `avaliarArquivo`; demais ferramentas e conversas comuns por `avaliar` (ver [command-policy.md](command-policy.md)).
3. Ação `permitir` ou `negar` é decidida na hora e registrada na auditoria (`quem: "política"`).
4. Ação `perguntar`: se o risco é `normal` e a conversa tem "aprovar tudo desta conversa", libera (`quem: "sessão"`); senão cria um pedido pendente (`askApproval`) que espera o dono. Sem resposta em 5 minutos, nega (`quem: "timeout"`).
5. O pedido some se a conversa termina, é cancelada ou apagada (`denyAll`).

## Conversas de documentação

Conversas com `doc: true` são criadas por `/api/documentacao/iniciar` (prompt `modelos/documentar.md`, com os blocos `[[criar]]`/`[[atualizar]]`), `/api/biblioteca/anexar` com modo de adaptação (`modelos/adaptar.md`) e `/api/biblioteca/generalizar` (`modelos/generalizar.md`). Nelas o `claude` não tem terminal e só pode escrever onde `avaliarArquivo` permite. Só uma conversa de documentação roda por projeto de cada vez (409 caso contrário).

Regras de produto: [../business/conversas-claude.md](../business/conversas-claude.md), [../business/documentacao-com-claude.md](../business/documentacao-com-claude.md).
