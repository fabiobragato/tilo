# Convenções da API

Cobre as rotas HTTP de `server.mjs`, o formato das respostas, os limites e os códigos de erro.

## Convenções gerais

- Rotas de projeto ficam sob `/api/p/<id>/...`; `<id>` segue `[a-z0-9-]+`. Dentro do código, o prefixo é reescrito para `/api/...`.
- `GET` para leitura; `POST` com `Content-Type: application/json` para todo o resto. Outro método responde 405; outro tipo de conteúdo responde 415.
- Corpo máximo: 200.000 bytes. Em `/api/projetos` e `/api/projetos/editar`: 4.500.000 bytes (imagens).
- Respostas são JSON. Erros têm o formato `{ "erro": "mensagem em português" }`.
- Todas as respostas levam `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e `Content-Security-Policy` (ver [../security/owasp-top10.md](../security/owasp-top10.md)).
- Autenticação: ver [authentication.md](authentication.md).

## Páginas e arquivos estáticos

| Método | Caminho | O que devolve |
|---|---|---|
| GET | `/` | Tela de seleção (`inicio.html`). Com `?t=<token>`, grava o cookie e redireciona para `/`. |
| GET | `/p/<id>` | Painel do projeto (`index.html`, com nome, cor, id e nonce substituídos). Com `?t=`, grava o cookie e redireciona. |
| GET | `/logo/<id>` | Ícone do projeto; com `?tipo=largo`, o logo largo. Sem imagem, um SVG com as iniciais. |
| GET | `/assets/<arquivo>` | Estáticos de `assets/` (`.css`, `.js`, `.png`, `.svg`, `.woff2`, `.woff`, `.ttf`). Exige token. |

## Rotas globais (sem projeto)

| Método | Caminho | Função |
|---|---|---|
| GET | `/api/projetos` | Lista os projetos (`id`, `nome`, `descricao`, `cor`, `logo`, `logoLargo`, `temIcone`, `temLogo`). |
| POST | `/api/projetos` | Cadastra projeto: `nome`, `raiz`, `cor`, `descricao`, `estruturaBase`, `icone`, `logo`. Devolve `{ id, criado }`. |
| POST | `/api/projetos/remover` | Tira o projeto (`id`) da lista. Não apaga a pasta do projeto nem `dados/<id>/`. |
| POST | `/api/projetos/editar` | Edita `nome`, `cor`, `descricao`, `icone`, `logo`, `removerIcone`, `removerLogo` de um projeto (`id`). |

## Rotas de projeto — GET

| Caminho | Função |
|---|---|
| `/api/pendencias` | Seções e itens lidos de `pendencias/README.md` + estado por item. |
| `/api/versao` | `sig`: hash dos caminhos e datas de `docs/`, `planning/`, `pendencias/`. |
| `/api/arquivos` | Até 500 arquivos `.md` de `docs/`, `planning/`, `pendencias/`, mais recentes primeiro. |
| `/api/file?p=<caminho>` | Conteúdo de um arquivo do projeto (ver restrições abaixo). |
| `/api/sessoes` | Sessões do terminal (Claude Code) dos últimos 7 dias, até 40; cada uma com `uso`. |
| `/api/sessao?id=<uuid>` | Últimas 60 mensagens de uma sessão do terminal. |
| `/api/chats` | Conversas do painel, mais recentes primeiro. Cada uma traz `uso` (tokens lidos do transcript do Claude Code; `null` se não houver). |
| `/api/consumo` | Estimativa de tokens de hoje e dos últimos 7 dias (`hoje`, `semana`, `porDia`) somando os transcripts de todos os projetos cadastrados. Ver [../business/consumo-de-tokens.md](../business/consumo-de-tokens.md). |
| `/api/chat/stream?id=<uuid>` | Estado ao vivo da execução: `text` (texto do turno em curso, com streaming), `tools` (ações do turno em curso: `nome`, `resumo`, `detalhe`, `ini`, `ms`, `estado`), `fila` (mensagens enviadas e ainda não lidas), `ocupado`, `bg` (tarefas em segundo plano), `rev` (sobe quando o histórico ou a fila mudam), `done` e `pendentes` (aprovações da conversa). |
| `/api/aprovacoes` | Aprovações pendentes das conversas **deste projeto** (nunca de outro; mais antigas primeiro). Cada uma traz `chatId`, `chat` (título) e `projeto`. A tela consulta a cada 1,5 s e mostra cada pedido só na conversa dona dele. |
| `/api/documentacao` | Cobertura por área, arquivos recentes e última execução de documentação. |
| `/api/biblioteca?q=` | Áreas, coleções, documentos (com busca), documentos publicáveis deste projeto. |
| `/api/biblioteca/doc?id=` | Conteúdo de um documento da biblioteca. |
| `/api/biblioteca/rascunhos` | Lotes de rascunhos de generalização deste projeto. |
| `/api/biblioteca/rascunho?lote=&item=&original=1` | Conteúdo de um rascunho (ou do original). |
| `/api/permissoes` | Regras de fábrica, pacotes, comandos lembrados, bloqueios e itens de produção do projeto. |
| `/api/alteracoes` | Git visual: branch, remoto, arquivos não commitados (cada um com as conversas que o editaram) e commits não enviados (com a conversa do trailer `Tilo-Chat`). `{ repo: false }` se a pasta não for git. Ver [../business/alteracoes.md](../business/alteracoes.md). |
| `/api/alteracoes/historico?limite=&pular=` | Commits da branch atual (até 100 por página, padrão 20), com `enviado` (algum remoto já tem; `null` sem remoto), `mais`, `total` (commits da branch) e a conversa do trailer `Tilo-Chat`. |
| `/api/alteracoes/commit-arquivos?sha=` | Arquivos de um commit (`caminho`, `antigo`, `rotulo`, `sensivel`). 400 se o commit não existir. |
| `/api/alteracoes/commit-diff?sha=&arquivo=` | Diff de um arquivo dentro do commit. Mesmas recusas e limite do diff de arquivo alterado. |
| `/api/alteracoes/diff?arquivo=` | Diff de um arquivo alterado. Recusa arquivos fora do status e segredos (`.env`, `.ssh`, `.pem`, `id_*`, `.token`); corta em 500.000 caracteres. |

Restrições de `/api/file`: o primeiro segmento do caminho precisa estar em `pastasLegiveis` do projeto (padrão: `docs`, `planning`, `pendencias`, `apps`, `infra`); caminhos com `.env` são recusados (403); arquivo inexistente ou maior que 500.000 bytes responde 404.

## Rotas de projeto — POST

| Caminho | Corpo principal | Função |
|---|---|---|
| `/api/estado` | `id`, `status`, `nota` | Grava o estado de um item. `status`: `aberto`, `andamento`, `feito`, `ignorado`. `nota` até 2000 caracteres. |
| `/api/remover` | `line`, `raw` | Apaga a linha da pendência no README, se o conteúdo ainda for o mesmo (senão 409). |
| `/api/sessoes/meta` | `id`, `apelido`, `itemId`, `oculto` | Apelido (80), vínculo com pendência (12) e ocultar sessão do terminal. |
| `/api/chat/novo` | `title`, `itemId`, `contexto`, `model`, `plan`, `modo` | Cria conversa; `modo` é `perguntar`, `editar` (padrão) ou `leitura`. |
| `/api/chat/config` | `id`, `model`, `tom`, `plan`, `modo`, `title`, `closed` | Altera a conversa. `tom`: `normal`, `lite`, `full` ou `ultra` (400 se inválido); vale no próximo processo do Claude. `/api/chat/novo` também aceita `tom`. `modo`: `perguntar`, `editar`, `plan`, `auto` ou `leitura` (400 em conversa de documentação). Modo e modelo valem na hora, mesmo com a execução em andamento. `closed: true` encerra (mata o processo, nega pedidos pendentes e guarda no histórico, marcadas, as mensagens que o Claude não leu); `false` reabre. |
| `/api/chat/enviar` | `id`, `text`, `mid`, `anexo` (opcional: `{nome, texto}`, `.md` até 300.000 caracteres; 400 se não for `.md` ou estiver vazio, 413 se passar do limite; corpo da requisição aceita até 1 MB nesta rota) | Envia mensagem (até 20.000 caracteres). **Aceita mesmo com o Claude trabalhando**: a mensagem vai para a fila do Claude Code e entra no histórico quando ele a lê. `mid` (uuid gerado pela tela) evita duplicar o mesmo envio. 409 se a conversa está encerrada ou se já há 20 mensagens na fila. Se o título ainda é "Nova conversa", vira o início da 1ª mensagem (até 60 caracteres). |
| `/api/chat/cancelar` | `id` | Botão Parar: nega pedidos pendentes e interrompe o passo em curso (igual ao Esc do terminal); a conversa continua aceitando mensagens. Se o Claude não parar em 10 s, o processo é encerrado. Resposta: `resultado` = `interrompido`, `encerrado` ou `nada em execução`. |
| `/api/chat/apagar` | `id` | Apaga a conversa. |
| `/api/reiniciar` | (vazio) | Responde `{ ok }`, nega aprovações pendentes, encerra as conversas em andamento e reinicia o servidor (processo auxiliar sobe `server.mjs` de novo após ~1,5 s, com os logs `tilo.log` e `tilo.err.log`). Registra na auditoria. |
| `/api/aprovacao/pedir` | `chatId`, `tool_name`, `input` | Chamada do `aprovador-mcp.mjs`; fica aberta até haver decisão. |
| `/api/aprovacao/decidir` | `id`, `permitir`, `sessao`, `lembrar` | Decisão do dono sobre um pedido. |
| `/api/aprovacao/sessao` | `id` | Desliga "aprovar tudo desta conversa". |
| `/api/permissoes/pacote` | `id`, `ligado` | Liga/desliga pacote opcional. |
| `/api/permissoes/lembrar` | `comando` | Guarda um comando comum como permitido. Recusa bloqueados e de produção. |
| `/api/permissoes/esquecer` | `comando` | Remove comando lembrado. |
| `/api/permissoes/regra` | `tipo`, `texto`, `motivo` | Acrescenta bloqueio (`tipo` ≠ `producao`) ou item de produção. |
| `/api/permissoes/regra/remover` | `tipo`, `texto` | Remove a regra. |
| `/api/permissoes/testar` | `tool`, `comando` | Simula a política sem executar. |
| `/api/alteracoes/commit` | `arquivos`, `mensagem`, `chats` | Commita só os arquivos escolhidos (`git commit --only`) e acrescenta a linha `Tilo-Chat: <id>` por conversa existente. Recusa segredos e arquivos fora do status. Registra na auditoria. |
| `/api/alteracoes/pull` | `remota` (ex.: `origin/develop`; vazio = upstream da branch atual) | `git fetch --prune` + `git merge --no-edit <remota>` na branch atual. A remota precisa existir no remoto após o fetch. Em conflito, `merge --abort` e erro 400. 409 se o Claude estiver trabalhando no projeto. Registra na auditoria. `GET /api/alteracoes` ganhou `remotas` (branches remotas conhecidas). |
| `/api/alteracoes/branch` | `acao` (`trocar` ou `criar`), `nome`, `base` (opcional, só em `criar`: branch local ou remota de partida; vazio = ponto atual) | Troca para uma branch local existente ou cria uma nova a partir do ponto atual (`git switch` / `git switch -c`). Nome validado (letras, números, `.`, `_`, `-`, `/`; sem `..`; `check-ref-format`). 409 se o Claude estiver trabalhando no projeto. Registra na auditoria. |
| `/api/alteracoes/push` | (vazio) | Envia os commits ao remoto, sem forçar. Sem upstream, cria o vínculo com `origin`. Registra na auditoria como produção. |
| `/api/documentacao/iniciar` | `modo` (`criar` ou `atualizar`), `modelo` | Inicia a conversa de documentação. |
| `/api/biblioteca/publicar` | `arquivos` | Copia documentos de `docs/` para a biblioteca. |
| `/api/biblioteca/remover` | `id` ou `colecao` | Remove um documento ou uma coleção. |
| `/api/biblioteca/anexar` | `ids`, `modo` (`adaptar` ou cópia), `modelo` | Anexa documentos ao projeto (até 40). |
| `/api/biblioteca/generalizar` | `ids` ou `arquivos`, `modelo` | Inicia a generalização (até 60 documentos). |
| `/api/biblioteca/rascunho/aceitar` | `lote`, `itens` | Grava rascunhos na biblioteca. |
| `/api/biblioteca/rascunho/descartar` | `lote`, `itens` | Descarta rascunhos. |

## Códigos de resposta usados

| Código | Quando |
|---|---|
| 200 | Sucesso. |
| 302 | Redirecionamento após gravar o cookie. |
| 400 | Validação (nome inválido, id inválido, comando bloqueado ao lembrar etc.). |
| 401 | API ou estático sem token válido. |
| 403 | Host/Origin não permitido; página sem token; caminho de arquivo não permitido. |
| 404 | Projeto, rota, conversa ou arquivo inexistente. |
| 405 / 415 | Método ou tipo de conteúdo não aceito. |
| 409 | Conversa encerrada; fila cheia; já existe trabalho de documentação em andamento; README mudou; pedido de aprovação sem conversa em execução. |
| 500 | Erro interno (ou modelo de prompt ausente em `modelos/`). |

O cliente do painel (`assets/app.js`) reescreve `/api/...` para `/api/p/<id>/...`; ver [../frontend/api-integration.md](../frontend/api-integration.md).
