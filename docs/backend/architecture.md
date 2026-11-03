# Arquitetura do backend

Cobre os arquivos do servidor, o que cada um faz e como uma requisição é processada.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server.mjs` | Servidor HTTP, rotas, parser de `pendencias/README.md`, conversas com o Claude, leitura das sessões do terminal, fila de aprovações, auditoria. |
| `politica.mjs` | Funções puras: decide se um comando é negado, liberado ou perguntado; explica comandos em português; valida a configuração de permissões; avalia escrita de arquivos nas conversas de documentação. |
| `projetos.mjs` | Registro de projetos (`projetos.json`): cadastro, edição, estrutura base, imagens, permissões do projeto. |
| `catalogo.mjs` | Biblioteca de documentos (`catalogo/`): listar, buscar, publicar, anexar, remover e rascunhos de generalização. |
| `aprovador-mcp.mjs` | Servidor MCP (stdio) usado como `--permission-prompt-tool` do `claude`; repassa cada pedido ao servidor. |
| `claude-settings.json` | Lista `deny` base (segredos) usada nas configurações do `claude`. |
| `modelos/*.md` | Instruções (prompts) das tarefas de documentação: `documentar.md`, `adaptar.md`, `generalizar.md`. |
| `scripts/*.ps1`, `iniciar.cmd` | Verificação do ambiente, atalho e inicialização (ver [configuration.md](configuration.md)). |

## Fluxo de uma requisição

1. `http.createServer` em `server.mjs` recebe a requisição.
2. Se o caminho é `/api/p/<id>/<resto>`: confere Host e Origin, busca o projeto em `projetos.mjs` (404 se não existe), reescreve o caminho para `/api/<resto>` e executa `core()` dentro de `als.run(projeto, ...)`. O projeto fica acessível por `P()`.
3. Qualquer outro caminho vai direto para `core()` (sem projeto).
4. `core()` confere Host/Origin, serve páginas (`/`, `/p/<id>`), imagens (`/logo/<id>`), estáticos (`/assets/...`) e a API (`/api/...`).
5. Rotas `GET` são resolvidas por um `switch` de caminho; as demais exigem método `POST` e corpo JSON, e são resolvidas por outro `switch`.
6. Qualquer exceção não tratada vira resposta 500 com `{ "erro": "<mensagem>" }`.

## Objeto de projeto (`P()`)

Montado em `projetos.mjs` (`resolver`) a partir de `projetos.json`: `id`, `nome`, `descricao`, `cor`, `icone`, `logo`, `politica`, `ROOT` (pasta do projeto), `README` (pendências), `STATE`, `CHATS`, `META`, `AUDIT` (arquivos em `dados/<id>/`), `READABLE_DIRS` e `TERM_DIR` (transcripts do Claude Code do projeto).

## Processos filhos

- `claude` é iniciado com `spawn` e `shell: true` (no Windows o comando é um `.cmd`). Detalhes em [ai-architecture.md](ai-architecture.md).
- `aprovador-mcp.mjs` é iniciado pelo próprio `claude` (via `--mcp-config`) e chama de volta `POST /api/p/<id>/aprovacao/pedir`.

## Estado em memória

- `jobs`: execuções do `claude` em curso (saída acumulada, se terminou, processo).
- `approvals`: pedidos de aprovação pendentes (expiram em 5 minutos).
- `autoSessao`: conversas com "aprovar tudo desta conversa" ligado.
- `sessCache`: cache de leitura das sessões do terminal (por arquivo, chave `mtime:tamanho`).

Tudo isso se perde ao reiniciar o servidor.
