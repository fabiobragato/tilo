# Central de Projetos

Ferramenta local de trabalho do dono: escolha um projeto (tela de seleção estilo console) e trabalhe nas **pendências**, nas **sessões do Claude Code** e nas **conversas com o Claude**, com **aprovação de comandos na UI**. Sem dependências (Node 20+), só `127.0.0.1`.

## Primeiros passos
**Pré-requisitos (Windows):** Node 20+, Git for Windows (Git Bash) e Claude Code instalado e logado (a Central usa a assinatura, nunca API paga).

1. `git clone` este repositório e abra um terminal na pasta.
2. Confira o ambiente: `powershell -ExecutionPolicy Bypass -File scriptserificar.ps1` (acrescente `-TestarLogin` para provar que o login do Claude funciona). Ele diz exatamente o que falta.
3. Crie o atalho: `powershell -ExecutionPolicy Bypass -File scripts\instalar-atalho.ps1`. Aparece o ícone **Central de Projetos** na área de trabalho (ou use `iniciar.cmd` e abra http://localhost:4777/).
4. Clique no atalho. Na primeira vez a tela mostra só o tile **+**: clique nele (ou tecle `N`) e cadastre o projeto: nome, pasta (caminho completo de uma pasta que já existe), cor e, se quiser, **Criar estrutura base** (`pendencias/`, `docs/`, `planning/`, `CLAUDE.md`; nunca sobrescreve nada).
   **Projeto que já existe (com código)?** Aponte a pasta dele normalmente e marque **Montar a documentação do projeto com o Claude**: depois de adicionar, a Central abre a tela **Documentação** do projeto, onde você confirma o início (veja abaixo).
5. Abra o projeto: o painel mostra as pendências (uma de exemplo para apagar), as sessões do Claude Code e as conversas. Escreva suas pendências em `pendencias/README.md` do projeto e **não apague esse arquivo**: é a fonte de dados da Central.
6. Logo (opcional): no próprio formulário, escolha o **ícone** (quadrado, aparece no tile) e o **logo largo** (aparece no menu lateral do painel). PNG, JPG ou WEBP até 1,5 MB; SVG não é aceito. Sem imagem, o tile mostra as iniciais do projeto. Para trocar ou remover a imagem depois, selecione o projeto e tecle `E` (ou clique em **Editar**). Também dá para colocar arquivos em `logos/` e apontar `icone`/`logo` no `projetos.json`. Atalhos: `http://localhost:4777/#novo` abre o cadastro e `/#editar` edita o projeto selecionado.

**Problemas comuns:** `No suitable shell found` = o Claude Code não achou o Git Bash; defina `CLAUDE_CODE_GIT_BASH_PATH` (o `verificar.ps1` mostra o caminho) em `~\.claude\settings.json`, chave `env`, e reinicie. O `bash` do WSL em `System32` não serve.

## Documentação e catálogo de modelos
Menu **Documentação** (em cada projeto). O Claude lê o código e monta/atualiza `docs/` num padrão organizado por área: `docs/README.md` (índice, escopo e ordem de prioridade), uma pasta por área que o projeto realmente tem (`backend/`, `frontend/`, `business/`, `data-platform/`, `infra/`, `deploy/`, `security/`, cada uma com `README.md` e documentos temáticos), além de `planning/README.md`, `pendencias/README.md` e `CLAUDE.md`. As instruções que ele segue estão em `modelos/documentar.md` (edite para ajustar o padrão).
- **Criar o que falta** (projeto sem docs) ou **Conferir com o código e atualizar** (projeto com docs): o segundo monta um inventário de fatos do código (rotas, listas de valores, campos, variáveis, versões) e compara valor por valor com cada documento, corrigindo só o que diverge.
- Regras do padrão: `docs/` só descreve o que está implantado, no presente e confirmado no código; planos vão para `planning/`; o que só o dono decide ou confere (inclusive problemas encontrados) vai para `pendencias/README.md`; nada de segredos.
- **Segurança:** o Claude não tem terminal nessa conversa. Só pode escrever em `docs/`, `planning/`, `pendencias/` e `CLAUDE.md` (código, `.env`, chaves e qualquer lugar fora do projeto são bloqueados). Arquivo **novo** é criado direto; **alterar um arquivo existente** abre o modal de aprovação. Tudo fica no log de auditoria do projeto.
- A tela mostra a cobertura por área, os arquivos criados em tempo quase real e o link para a conversa com o resumo final. Modelo de IA padrão: Sonnet (Opus é mais caprichado e usa mais a assinatura; prefira um dos dois a Haiku em projetos reais). Costuma levar de 5 a 30 minutos.

### Catálogo de modelos reaproveitáveis por stack
Cada projeto documentado pode virar um **modelo** para outros projetos da mesma stack (ex.: API .NET + Angular, Python + Docker).
- **Stack identificada automaticamente** pelos arquivos do projeto (.NET, Angular, React, Vue, Node.js, Python, Java, Go, Rust, PHP, Ruby, Docker, PostgreSQL) e mostrada na tela.
- **Salvar no catálogo:** na tela Documentação, escolha as áreas técnicas (backend, frontend, infra, deploy, segurança, dados), confira a stack e dê um nome. A Central copia esses documentos para `catalogo/<modelo>/` (relatórios de auditoria ficam de fora). **Regras de negócio, planejamento e pendências nunca entram**: são específicos de cada produto.
- **Usar um modelo:** ao montar a documentação de outro projeto, marque os modelos desejados (os da mesma stack aparecem como *mesma stack* e vêm marcados em projetos sem docs). O Claude lê o modelo em modo somente leitura e aproveita a **estrutura, os temas e os padrões técnicos**, mas cada documento final descreve **o projeto novo**, confirmado no código: ele não copia nomes, regras nem fatos do projeto de origem.
- O catálogo é **local** (`catalogo/`, fora do git), porque contém a documentação dos seus projetos. Para compartilhar, copie a pasta de um modelo para o `catalogo/` de outra instalação.

## Usar
- **Atalho** *Central de Projetos* na área de trabalho (`scripts\instalar-atalho.ps1` cria). Sobe o servidor oculto (se preciso) e abre o navegador já autenticado. Manual: `iniciar.cmd` → http://localhost:4777/.
- **Seleção:** ← → navegam, `Enter` abre, `1`–`9` abrem direto, `E` edita o projeto selecionado (nome, descrição, cor, ícone e logo; a pasta não muda) e `N` cadastra projeto. O tile **+** (ou `N`) abre o formulário: nome, pasta, cor e, opcionalmente, cria a estrutura base (`pendencias/`, `docs/`, `planning/`, `CLAUDE.md`) sem sobrescrever nada.
- **Dentro do projeto:** botão **Projetos** no menu lateral volta à seleção.
- **Parar:** encerrar o processo `node server.mjs` (Gerenciador de Tarefas).

## Como funciona
- `projetos.json` (local, gitignored; modelo em `projetos.example.json`): lista de projetos com `id`, `nome`, `raiz`, `cor`, `descricao`, `icone`/`logo` (caminhos relativos a esta pasta, opcionais: sem ícone vira um cartão com as iniciais), `pendencias` e `pastasLegiveis`.
- Cada projeto tem dados próprios em `dados/<id>/` (`estado.json`, `chats.json`, `sessoes-meta.json`, `auditoria.jsonl`), **fora** da pasta do projeto. O `claude` roda com `cwd` na raiz do projeto, então usa o `CLAUDE.md` e `docs/` dele.
- Padrão de projeto esperado: `docs/` (fonte de verdade), `planning/` (planos ainda não fechados), `pendencias/README.md` (painel do dono, tabelas com 🔴🟡🟢) e `CLAUDE.md` (instruções para o Claude). **Projeto novo ou existente:** use *Criar estrutura base* para gerar esses arquivos vazios e/ou a tela Documentação para o Claude escrevê-los a partir do código.
- Rotas: `/` seleção · `/p/<id>` painel · `/api/p/<id>/...` API do projeto · `/api/projetos` lista/cadastra · `/logo/<id>` ícone.

## Segurança
- Bind `127.0.0.1`, token em `.token` + cookie `SameSite=Strict`, checagem de Host/Origin. `ANTHROPIC_API_KEY` é zerada nos filhos (só assinatura, nunca API paga).
- **Comandos com aprovação:** no chat, ligue *permitir comandos (com aprovação)*. Cada comando abre um modal com [Negar] / [Aprovar] / [Aprovar todos da sessão]; sem resposta em 5 min = negado.
  - `aprovador-mcp.mjs` é o `--permission-prompt-tool` (MCP stdio); `politica.mjs` decide antes de perguntar: **nega** destrutivo (`rm -rf`, `docker compose down -v`, push forçado, `reset --hard`), segredos (`.env`, `.ssh`, `.token`, chaves), exfiltração (`curl -d @`, `| bash`, `iex`) e tentativa de falar com a própria Central; **libera** só leitura estrita (`git status/log/diff`, `ls`, `docker ps`…); **pergunta** o resto, com confirmação extra para produção (`ssh`, `migrate`, `deploy`, `git push`, rede externa).
  - **Permissões por projeto (sem programação):** o modal explica **em português** o que o comando faz (um resumo automático, com o comando exato logo abaixo) e mostra se ele só consulta, altera arquivos, usa a internet ou mexe em servidor. Botões: **Negar**, **Aprovar só desta vez**, **Aprovar e lembrar** (libera só aquele comando exato, neste projeto, daqui para frente) e o link **Aprovar tudo desta conversa**. O menu **Permissões do Claude** mostra tudo e permite rever: o que vem liberado de fábrica (só consulta: git status/log/diff, listar arquivos, logs, versões), pacotes opcionais que você liga (rodar testes; compilar), os comandos que você lembrou (com explicação e botão de remover), o que é sempre bloqueado e o que sempre pede atenção redobrada, e um campo **Testar um comando** que só simula. Cada projeto ainda pode acrescentar bloqueios e itens de atenção redobrada escrevendo um trecho de texto (ex.: “terraform destroy”).
  - Ordem de decisão: bloqueado (fábrica + projeto) > produção (fábrica + projeto) > comando lembrado > liberado de fábrica/pacotes > pergunta. Regras de fábrica nunca podem ser removidas, e **lembrar nunca vale para produção nem para comandos bloqueados**. Tudo fica em `projetos.json` (chave `politica`) e no log `dados/<id>/auditoria.jsonl`.
  - "Aprovar tudo desta conversa" vale só para comandos comuns daquela conversa (some ao desligar, apagar a conversa ou reiniciar); produção sempre pede.
  - `claude-settings.json`: `deny` para segredos e para esta pasta (o Claude não altera a política). O `claude` roda com `--setting-sources project`.
  - O Claude Code libera sozinho uma lista interna de comandos de leitura (`node --version`, `git status`); esses não passam pela UI, mas respeitam o `deny` de segredos.
  - `dados/<id>/auditoria.jsonl` registra cada pedido, risco, decisão e quem decidiu.
- Testes da política: `node --test politica.test.mjs`.
