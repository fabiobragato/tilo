# Integração com o Claude Code

Cobre como `server.mjs` executa o `claude`, como as conversas funcionam e como o aprovador MCP participa.

## Execução do `claude`

Função `startJob` em `server.mjs` (estado da conversa em `fluxo.mjs`). **Uma conversa usa um único processo `claude` enquanto houver trabalho**, no mesmo canal que o terminal usa (`stream-json` nos dois sentidos). Mensagens novas são escritas no stdin a qualquer momento: o próprio Claude Code as enfileira e as entrega entre dois passos da tarefa (testado: uma instrução enviada durante um comando de 20 s entrou na mesma resposta). O painel nunca abre dois processos para a mesma conversa.

| Argumento | Valor |
|---|---|
| `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --replay-user-messages` | Entrada e saída em eventos JSON, com texto parcial (streaming) e o eco de cada mensagem lida (é assim que se sabe que ela saiu da fila). |
| `--allowedTools` | Sempre `Read,Grep,Glob`. Editar e rodar comandos passam SEMPRE pelo aprovador, que decide pelo **modo atual** da conversa. |
| `--disallowedTools` | Só em conversa de documentação: `Bash,PowerShell`. |
| `--setting-sources project` | Só configurações do projeto. |
| `--settings` | `<tmp>/tilo-settings.json`, gerado na partida (ver abaixo). |
| `--mcp-config` + `--strict-mcp-config` | `<tmp>/tilo-mcp-<chat>.json`, que declara o servidor MCP `tilo` (`aprovador-mcp.mjs`). |
| `--permission-prompt-tool` | `mcp__tilo__approve`. |
| `--append-system-prompt` | Texto fixo `SYSTEM` de `server.mjs` + a regra de tom da conversa (`instrucaoTom` em `tom.mjs`); ver "Tom das respostas" abaixo. |
| `--add-dir` | Pastas de leitura extra (documentos de referência da biblioteca ou de origem da generalização). |
| `--permission-mode plan` | Quando a conversa nasce/reabre em plan. Com o processo vivo, a troca é feita por `set_permission_mode` (e o modelo por `set_model`), sem reiniciar. |
| `--model` | Id completo, escolhido pela chave da conversa em `MODEL_IDS` (`server.mjs`): `fable` = `claude-fable-5-1`, `opus` = `claude-opus-5-5`, `sonnet` = `claude-sonnet-5-5` (padrão), `haiku` = `claude-haiku-5-5`. A versão fica explícita; para atualizar, troque `MODEL_IDS` e `MODELOS` em `assets/app.js`. Cada resposta guarda `modeloId`, o modelo real informado pelo Claude no evento `init`, e a tela mostra essa versão. |
| `--session-id` / `--resume` | O id da conversa; `--session-id` na primeira execução, `--resume` nas seguintes. |

- Diretório de trabalho: raiz do projeto; na generalização, a pasta de rascunhos do lote. Nenhum texto do usuário vai em argumentos (vai pelo stdin).
- Ambiente: `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` vazias.

### Tom das respostas

Cada conversa tem um tom (`tom`: `normal`, `lite`, `full` ou `ultra`; menu "Tom" ao lado do modelo). As regras ficam em `tom.mjs`, **embutidas no projeto**: são adaptadas do plugin Caveman (MIT, © 2026 Julius Brussee; o aviso está no cabeçalho do arquivo) e entram no `--append-system-prompt` de cada processo do `claude`, inclusive nos `--resume`. Não há plugin, hooks de terceiros nem arquivos fora da pasta do Tilo, e o usuário não precisa instalar nada. O texto é argumento de linha de comando (shell no Windows), então não pode ter aspas duplas, `%`, quebra de linha nem seta unicode (o `padroes.test.mjs` confere).

- `lite` (padrão): mantém frases completas, corta enrolação. `full`: fragmentos, sem artigos. `ultra`: abreviações e setas. `normal`: respostas completas; numa conversa que já tinha tom curto, a regra pede explicitamente para voltar ao tom explicativo (o histórico retomado pode conter a regra anterior). Em `normal` numa conversa nova, nada é acrescentado.
- Código, comandos, caminhos e mensagens de erro continuam exatos; avisos de segurança, ações irreversíveis e passos em sequência saem em texto normal.
- Vale a partir do próximo processo do `claude` (não muda o processo vivo). `TILO_CAVEMAN_NIVEL` define o tom das conversas novas; `TILO_CAVEMAN=off` fixa `normal` e esconde o menu ([configuration.md](configuration.md)).
- Efeito medido pelo plugin de origem: em média 65% menos tokens de resposta (de 22% a 87%, conforme o tipo de pergunta). No Tilo ainda não há medida própria; um teste único com o `ultra` deu respostas com cerca de metade do tamanho do `normal`.


### Ciclo de vida e mensagens

- **Estado de execução ≠ entrada disponível.** `/api/chat/enviar` aceita mensagem sempre (exceto conversa encerrada). Sem processo vivo: grava a mensagem e abre o processo. Com processo vivo: escreve no stdin e a mensagem fica em `fila`; ela só entra no histórico quando o Claude a lê (eco `isReplay`), depois do que ele já tinha dito, a mesma ordem do terminal. Mensagens iguais (`mid`) não duplicam. Máximo 20 na fila.
- Se a mensagem chega com o processo já fechando, espera em `depois` e abre o processo seguinte (nunca dois ao mesmo tempo).
- Cada turno termina em um evento `result`: a resposta (texto + ferramentas usadas) vira uma mensagem do histórico. Com a fila vazia, sem turno em curso e sem tarefa em segundo plano, o stdin é fechado e o processo termina. Fila que o Claude não leu em 15 s é dada como não lida; tarefas em segundo plano seguram o processo por até 30 min.
- **Parar** (`/api/chat/cancelar`) envia `control_request: interrupt` (o Esc do terminal): para o passo em curso e a sessão continua. Sem parada em 10 s, encerra o processo (no Windows, `taskkill /T`, porque o `claude` roda dentro de um `cmd.exe`).
- **Falhas:** se o processo sai com erro, o que já havia sido dito é gravado com o aviso e as mensagens nunca lidas entram no histórico marcadas `naoLida`. Encerrar, apagar e reiniciar o servidor fazem o mesmo. Depois de uma falha a próxima mensagem abre um processo novo com `--resume` (contexto preservado).
- Eventos de sub-agentes (`parent_tool_use_id`) não entram no texto principal.

### Modos (um seletor só)

`modoEfetivo` em `server.mjs`: `plan` (se `plan` ligado) > `auto` (se a conversa está em `autoSessao`, só memória) > `modo` gravado (`perguntar`, `editar` ou `leitura`; padrão `editar`). Como o aprovador lê o modo a cada pedido, trocar de modo vale na hora:

| Modo | Edição de arquivo | Comando |
|---|---|---|
| `perguntar` | pede aprovação | política + aprovação |
| `editar` (padrão) | liberada dentro da pasta do projeto (`quem: "modo"` na auditoria) | política + aprovação |
| `plan` | só planeja (próprio Claude) | só planeja |
| `auto` | liberada | comuns liberados; produção e bloqueados continuam como estão |
| `leitura` | negada | negado |

As regras `deny` das settings (segredos, arquivos do próprio Tilo) continuam valendo em todos os modos.

## Configurações geradas (`gerarSettings`)

Na partida, o servidor lê `claude-settings.json` e acrescenta regras `deny` com o nome real da pasta do Tilo, gravando `<tmp>/tilo-settings.json`:

- Leitura negada: `.env*` (variações), `.ssh/**`, `.claude/**`, `*.pem`, `id_ed25519*`, `id_rsa*` (do arquivo base) e, na pasta do Tilo, `.token` e `projetos.json`.
- Edição/escrita negadas na pasta do Tilo: `assets/**`, `modelos/**`, `scripts/**`, `dados/**`, `catalogo/**`, `logos/**` e os arquivos `server.mjs`, `aprovador-mcp.mjs`, `politica.mjs`, `catalogo.mjs`, `projetos.mjs`, `claude-settings.json`, `projetos.json`, `index.html`, `inicio.html`, `package.json`, `iniciar.cmd` e os arquivos `*.test.mjs`.
- Edição/escrita de `.env*` negada em qualquer pasta.

## Aprovador MCP (`aprovador-mcp.mjs`)

- Servidor MCP por stdio (JSON-RPC, uma mensagem por linha) com uma única ferramenta, `approve` (`tool_name`, `input`, `tool_use_id`).
- Variáveis recebidas do servidor: `TILO_CHAT_ID`, `TILO_PROJECT`, `TILO_PORT`.
- Chama `POST /api/p/<projeto>/aprovacao/pedir`; devolve `{ behavior: "allow", updatedInput }` ou `{ behavior: "deny", message }`. Qualquer falha nega.

## Decisão de cada pedido (`/api/aprovacao/pedir`)

1. Conversa precisa existir, ser do projeto da chamada e estar em execução (senão 409).
1a. Se a ferramenta é `AskUserQuestion` (as perguntas com opções que o Claude faz, comuns no modo plan), não passa pela política: vira um pedido do tipo `pergunta` (`askPergunta`) que o painel mostra como perguntas selecionáveis. O dono responde por `/api/aprovacao/decidir` com `respostas` (pergunta → opção, várias separadas por vírgula, ou texto livre de "Outro"); o servidor devolve `updatedInput` com `answers`, e `aprovador-mcp.mjs` repassa ao Claude. "Dispensar" nega com a orientação de seguir com a melhor suposição. Mesmo prazo de 5 minutos.
2. Em conversa de documentação, `Write`, `Edit` e `MultiEdit` são avaliados por `avaliarArquivo`; demais ferramentas e conversas comuns por `avaliar` (ver [command-policy.md](command-policy.md)).
3. Ação `permitir` ou `negar` é decidida na hora e registrada na auditoria (`quem: "política"`).
4. Ação `perguntar`: se o risco é `normal` e a conversa tem "aprovar tudo desta conversa", libera (`quem: "sessão"`); senão cria um pedido pendente (`askApproval`) que espera o dono. Sem resposta em 5 minutos, nega (`quem: "timeout"`).
5. O pedido some se a conversa termina, é cancelada ou apagada (`denyAll`).

## Conversas de documentação

Conversas com `doc: true` são criadas por `/api/documentacao/iniciar` (prompt `modelos/documentar.md`, com os blocos `[[criar]]`/`[[atualizar]]`), `/api/biblioteca/anexar` com modo de adaptação (`modelos/adaptar.md`) e `/api/biblioteca/generalizar` (`modelos/generalizar.md`). Nelas o `claude` não tem terminal e só pode escrever onde `avaliarArquivo` permite. Só uma conversa de documentação roda por projeto de cada vez (409 caso contrário).

Regras de produto: [../business/conversas-claude.md](../business/conversas-claude.md), [../business/documentacao-com-claude.md](../business/documentacao-com-claude.md).
