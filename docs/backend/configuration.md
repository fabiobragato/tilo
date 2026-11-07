# Configuração, instalação e execução

Cobre as variáveis lidas pelo código, os scripts de ambiente e como o servidor é iniciado. Só nomes de variáveis são descritos; nenhum valor.

## Variáveis de ambiente lidas

| Variável | Onde é lida | Efeito |
|---|---|---|
| `TILO_PORT` | `server.mjs`, `aprovador-mcp.mjs`, `scripts/iniciar-tilo.ps1`, `scripts/verificar.ps1` | Porta do servidor (padrão 4777). |
| `TILO_DADOS_BASE` | `projetos.mjs` | Só para testes: pasta onde ficam `projetos.json`, `dados/` e `logos/` (padrão: pasta do Tilo). |
| `TILO_CAVEMAN` | `server.mjs` | `off` desliga o Caveman nas conversas (padrão: ligado se o plugin estiver instalado). |
| `TILO_CAVEMAN_NIVEL` | `server.mjs` | Nível do Caveman: `lite` (padrão), `full` ou `ultra`. Repassado ao plugin como `CAVEMAN_DEFAULT_MODE`. |
| `TILO_PUBLIC_PORT` | `server.mjs` | Porta aceita no cabeçalho Host/Origin (padrão = `TILO_PORT`). |
| `TILO_BIND` | `server.mjs` | Endereço de escuta (padrão `127.0.0.1`). |
| `CLAUDE_CONFIG_DIR` | `projetos.mjs` | Pasta de configuração do Claude Code (padrão `~/.claude`); de lá vêm os transcripts das sessões do terminal. |
| `CLAUDE_CODE_GIT_BASH_PATH` | `scripts/verificar.ps1` (lida pelo Claude Code) | Caminho do `bash.exe` do Git for Windows. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` | `server.mjs`, `scripts/iniciar-tilo.ps1`, `scripts/verificar.ps1` | Zeradas nos processos filhos; o `verificar.ps1` avisa se `ANTHROPIC_API_KEY` está definida. |
| `OS` | `scripts/verificar.ps1` | Detecta Windows. |
| `TILO_CHAT_ID`, `TILO_PROJECT` | `aprovador-mcp.mjs` | Definidas pelo servidor ao iniciar o `claude`; não são configuração do usuário. |

Não há arquivo `.env` nem `.env.example` no projeto.

## Pré-requisitos

Windows, Node 20+, Git for Windows (Git Bash) e Claude Code instalado e logado.

## Scripts

| Arquivo | O que faz |
|---|---|
| `scripts/verificar.ps1` (`npm run verificar`) | Confere Windows, Node ≥ 20, Git Bash, comando `claude` (e, com `-TestarLogin`, uma chamada mínima ao modelo `haiku`), porta livre (ou Tilo já rodando) e existência de `projetos.json`. Sai com código 1 se algo falta. |
| `scripts/instalar-atalho.ps1` | Gera `assets/tilo.ico` e cria o atalho `Tilo.lnk` na área de trabalho, que executa `scripts/iniciar-tilo.ps1` com janela oculta. |
| `scripts/iniciar-tilo.ps1` | Se a porta não responde, inicia `node server.mjs` oculto (saídas em `tilo.log` e `tilo.err.log`) e abre `http://localhost:<porta>/?t=<token>` no navegador. Aceita o parâmetro `-Projeto`, que o script não usa. |
| `iniciar.cmd` | Executa `node server.mjs` na pasta do Tilo, em janela visível. O servidor imprime o link de primeiro acesso com o token. |

`npm start` executa `node server.mjs`.

## Parada

Encerrar o processo `node server.mjs`. Não há rota nem comando de parada.

## Outros sistemas

Os scripts de atalho e verificação são PowerShell. O servidor usa `spawn('claude', { shell: true })`.
