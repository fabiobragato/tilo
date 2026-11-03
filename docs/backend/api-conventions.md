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
| POST | `/api/projetos/editar` | Edita `nome`, `cor`, `descricao`, `icone`, `logo`, `removerIcone`, `removerLogo` de um projeto (`id`). |

## Rotas de projeto — GET

| Caminho | Função |
|---|---|
| `/api/pendencias` | Seções e itens lidos de `pendencias/README.md` + estado por item. |
| `/api/versao` | `sig`: hash dos caminhos e datas de `docs/`, `planning/`, `pendencias/`. |
| `/api/arquivos` | Até 500 arquivos `.md` de `docs/`, `planning/`, `pendencias/`, mais recentes primeiro. |
| `/api/file?p=<caminho>` | Conteúdo de um arquivo do projeto (ver restrições abaixo). |
| `/api/sessoes` | Sessões do terminal (Claude Code) dos últimos 7 dias, até 40. |
| `/api/sessao?id=<uuid>` | Últimas 60 mensagens de uma sessão do terminal. |
| `/api/chats` | Conversas do painel, mais recentes primeiro. |
| `/api/chat/stream?id=<uuid>` | Texto acumulado da execução, se terminou e aprovações pendentes. |
| `/api/documentacao` | Cobertura por área, arquivos recentes e última execução de documentação. |
| `/api/biblioteca?q=` | Áreas, coleções, documentos (com busca), documentos publicáveis deste projeto. |
| `/api/biblioteca/doc?id=` | Conteúdo de um documento da biblioteca. |
| `/api/biblioteca/rascunhos` | Lotes de rascunhos de generalização deste projeto. |
| `/api/biblioteca/rascunho?lote=&item=&original=1` | Conteúdo de um rascunho (ou do original). |
| `/api/permissoes` | Regras de fábrica, pacotes, comandos lembrados, bloqueios e itens de produção do projeto. |

Restrições de `/api/file`: o primeiro segmento do caminho precisa estar em `pastasLegiveis` do projeto (padrão: `docs`, `planning`, `pendencias`, `apps`, `infra`); caminhos com `.env` são recusados (403); arquivo inexistente ou maior que 500.000 bytes responde 404.

## Rotas de projeto — POST

| Caminho | Corpo principal | Função |
|---|---|---|
| `/api/estado` | `id`, `status`, `nota` | Grava o estado de um item. `status`: `aberto`, `andamento`, `feito`, `ignorado`. `nota` até 2000 caracteres. |
| `/api/remover` | `line`, `raw` | Apaga a linha da pendência no README, se o conteúdo ainda for o mesmo (senão 409). |
| `/api/sessoes/meta` | `id`, `apelido`, `itemId`, `oculto` | Apelido (80), vínculo com pendência (12) e ocultar sessão do terminal. |
| `/api/chat/novo` | `title`, `itemId`, `contexto`, `model`, `plan` | Cria conversa com `edit` e `exec` ligados (alteráveis depois em `/api/chat/config`). |
| `/api/chat/config` | `id`, `model`, `plan`, `edit`, `exec`, `title`, `closed` | Altera a conversa. `closed: true` encerra (cancela a resposta em andamento e as aprovações pendentes); `false` reabre. |
| `/api/chat/enviar` | `id`, `text` | Envia mensagem (até 20.000 caracteres) e inicia o `claude`. 409 se já está respondendo ou se a conversa está encerrada. Se o título ainda é "Nova conversa", vira o início da 1ª mensagem (até 60 caracteres). |
| `/api/chat/cancelar` | `id` | Nega pedidos pendentes e encerra o processo. |
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
| 409 | Conversa já respondendo; já existe trabalho de documentação em andamento; README mudou; pedido de aprovação sem conversa em execução. |
| 500 | Erro interno (ou modelo de prompt ausente em `modelos/`). |

O cliente do painel (`assets/app.js`) reescreve `/api/...` para `/api/p/<id>/...`; ver [../frontend/api-integration.md](../frontend/api-integration.md).
