# Central de Projetos

Ferramenta local de trabalho do dono: escolha um projeto (tela de seleção estilo console) e trabalhe nas **pendências**, nas **sessões do Claude Code** e nas **conversas com o Claude**, com **aprovação de comandos na UI**. Sem dependências (Node 20+), só `127.0.0.1`.

## Usar
- **Atalho** *Central de Projetos* na área de trabalho (`scripts\instalar-atalho.ps1` cria). Sobe o servidor oculto (se preciso) e abre o navegador já autenticado. Manual: `iniciar.cmd` → http://localhost:4777/.
- **Seleção:** ← → navegam, `Enter` abre, `1`–`9` abrem direto, `N` cadastra projeto. O tile **+** (ou `N`) abre o formulário: nome, pasta, cor e, opcionalmente, cria a estrutura base (`pendencias/`, `docs/`, `planning/`, `CLAUDE.md`) sem sobrescrever nada.
- **Dentro do projeto:** botão **Projetos** no menu lateral volta à seleção.
- **Parar:** encerrar o processo `node server.mjs` (Gerenciador de Tarefas).

## Como funciona
- `projetos.json` (local, gitignored; modelo em `projetos.example.json`): lista de projetos com `id`, `nome`, `raiz`, `cor`, `descricao`, `icone`/`logo` (caminhos relativos a esta pasta, opcionais: sem ícone vira um cartão com as iniciais), `pendencias` e `pastasLegiveis`.
- Cada projeto tem dados próprios em `dados/<id>/` (`estado.json`, `chats.json`, `sessoes-meta.json`, `auditoria.jsonl`), **fora** da pasta do projeto. O `claude` roda com `cwd` na raiz do projeto, então usa o `CLAUDE.md` e `docs/` dele.
- Padrão de projeto esperado (o do Datadubis): `docs/` (fonte de verdade), `planning/` (não fechado), `pendencias/README.md` (tabelas com 🔴🟡🟢).
- Rotas: `/` seleção · `/p/<id>` painel · `/api/p/<id>/...` API do projeto · `/api/projetos` lista/cadastra · `/logo/<id>` ícone.

## Segurança
- Bind `127.0.0.1`, token em `.token` + cookie `SameSite=Strict`, checagem de Host/Origin. `ANTHROPIC_API_KEY` é zerada nos filhos (só assinatura, nunca API paga).
- **Comandos com aprovação:** no chat, ligue *permitir comandos (com aprovação)*. Cada comando abre um modal com [Negar] / [Aprovar] / [Aprovar todos da sessão]; sem resposta em 5 min = negado.
  - `aprovador-mcp.mjs` é o `--permission-prompt-tool` (MCP stdio); `politica.mjs` decide antes de perguntar: **nega** destrutivo (`rm -rf`, `docker compose down -v`, push forçado, `reset --hard`), segredos (`.env`, `.ssh`, `.token`, chaves), exfiltração (`curl -d @`, `| bash`, `iex`) e tentativa de falar com a própria Central; **libera** só leitura estrita (`git status/log/diff`, `ls`, `docker ps`…); **pergunta** o resto, com confirmação extra para produção (`ssh`, `migrate`, `deploy`, `git push`, rede externa).
  - "Aprovar todos da sessão" vale só para comandos comuns daquela conversa (some ao desligar, apagar a conversa ou reiniciar); produção sempre pede.
  - `claude-settings.json`: `deny` para segredos e para esta pasta (o Claude não altera a política). O `claude` roda com `--setting-sources project`.
  - O Claude Code libera sozinho uma lista interna de comandos de leitura (`node --version`, `git status`); esses não passam pela UI, mas respeitam o `deny` de segredos.
  - `dados/<id>/auditoria.jsonl` registra cada pedido, risco, decisão e quem decidiu.
- Testes da política: `node --test politica.test.mjs`.
