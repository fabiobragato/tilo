# Pendências

> **⚠ Não exclua este arquivo nem a pasta `pendencias/`.** Ele é a fonte de dados da **Tilo**: as telas de pendências e a visão geral deste projeto são montadas a partir dele. Para enxugar, apague só as linhas dos itens concluídos. **Mantenha o formato:** seções `## N. Título` e itens em tabela (`| 🔴/🟡/🟢 | **Título** | descrição | detalhes |`) ou em lista (`- 🔴 **Título** — descrição`).

Painel do dono do projeto (Tilo). Prioridade: 🔴 crítica · 🟡 importante · 🟢 pode esperar. Ao concluir, apague a linha.

## 1. Decidir (só você pode)

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟡 | **Guardar a documentação no git** | As pastas `docs/`, `planning/`, `pendencias/` e o arquivo `CLAUDE.md` aparecem como "não acompanhados" no git. Enquanto não forem salvos num commit, a documentação pode se perder. | Decidir se entram no repositório e fazer o commit. |
| 🟢 | **Funcionar fora do Windows** | Os scripts de atalho e verificação são só para Windows. Decida se macOS e Linux entram no escopo. | — |

## 2. Fazer na mão

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟢 | **Escrever errado no bloqueio de comandos** | A explicação mostrada na tela diz "Mexer na próprio Tilo" (falta concordância). | `politica.mjs` |

## 3. Conferir

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟡 | **Abrir o Tilo e conferir as telas** | A documentação do front-end foi escrita lendo os arquivos, sem abrir o navegador. Vale passar pelas sete telas do painel (inclui a nova aba Documentação mesclada e o encerrar/renomear/título automático das conversas) e conferir se batem com `docs/frontend/` e `docs/business/`. | — |
| 🟢 | **Versão do ícone PrimeIcons** | Os arquivos em `assets/` não dizem qual versão do PrimeIcons está incluída, então não dá para saber se está desatualizada. O CSS cita fontes `.eot` e `.svg` que não existem na pasta (o navegador usa as outras). | `assets/primeicons.css` |

## 4. Fila de desenvolvimento

| | Item | Por que importa | Mais detalhes |
|---|---|---|---|
| 🟡 | **Testes que faltam** | Só a política de comandos e a biblioteca têm testes. O servidor, o cadastro de projetos, o aprovador e as telas não têm; um erro ali só aparece usando. | `server.mjs`, `projetos.mjs`, `aprovador-mcp.mjs` |
| 🟡 | **Sem verificação automática** | Não há lint, build nem CI (verificação a cada alteração). A conferência depende de lembrar de rodar `npm test`. | `package.json` |
| 🟡 | **Proteção da pasta do Tilo incompleta** | Quando o próprio Tilo é cadastrado como projeto, o Claude fica impedido de editar só alguns arquivos (`server.mjs`, `politica.mjs`, `catalogo.mjs`, `projetos.mjs`, `aprovador-mcp.mjs`, `claude-settings.json`, `projetos.json` e as pastas `assets`, `modelos`, `scripts`). Ficam de fora `index.html`, `inicio.html`, `package.json`, `iniciar.cmd`, os arquivos de teste e as pastas `dados/` e `catalogo/`. | `server.mjs`, função `gerarSettings` |
| 🟢 | **Troca de porta enfraquece uma proteção** | A regra que impede o Claude de falar com o Tilo procura a porta 4777 escrita no código. Se a porta mudar (`TILO_PORT`), só o caminho de aprovação continua protegido. Além disso, o aprovador usa `TILO_PORT` e o servidor confere `TILO_PUBLIC_PORT`; se os dois forem diferentes, toda aprovação é negada. | `politica.mjs`, `aprovador-mcp.mjs`, `server.mjs` |
| 🟢 | **Atalhos em links simbólicos** | A leitura de arquivos pelo painel confere o caminho, mas não resolve atalhos (links simbólicos). Um atalho dentro de `docs/` que aponte para fora seria lido. Risco baixo (uso local, uma pessoa). | `server.mjs`, rota `/api/file` |
| 🟢 | **Token sem validade** | O acesso vale por 1 ano e o token também é aceito na barra de endereço. Não há tela para trocar; só apagando o arquivo `.token`. | `server.mjs` |
| 🟢 | **Falha na auditoria passa em silêncio** | Se o arquivo de auditoria não puder ser gravado, a ação segue e nada avisa. O arquivo também nunca é arquivado. | `server.mjs`, função `audit` |
| 🟢 | **Não dá para excluir um projeto** | Não existe botão nem rota para tirar um projeto da lista; só editando `projetos.json` à mão. | `projetos.mjs` |
| 🟢 | **Parâmetro sem uso no atalho** | `scripts/iniciar-tilo.ps1` aceita `-Projeto`, mas não faz nada com ele. | `scripts/iniciar-tilo.ps1` |
