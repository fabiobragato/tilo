# Segredos e configuração

Cobre os nomes de variáveis e arquivos sensíveis, onde são lidos e como renovar o token. Nenhum valor é registrado aqui.

## Arquivos sensíveis do Tilo

| Arquivo | Conteúdo | Proteção |
|---|---|---|
| `.token` | Token de acesso ao servidor. | Ignorado pelo git; leitura pelo Claude negada (`gerarSettings`) e comandos que citam `.token` são bloqueados. |
| `projetos.json` | Pastas dos projetos e permissões. | Ignorado pelo git; leitura e escrita pelo Claude negadas. |
| `dados/` | Conversas, estado e auditoria. | Ignorado pelo git. |
| `catalogo/` | Biblioteca de documentos. | Ignorada pelo git. |
| `tilo.log`, `tilo.err.log` | Saída do servidor (inclui o link de primeiro acesso com o token quando o servidor imprime). | Ignorados pelo git (`*.log`). |

## Variáveis de configuração

Lista completa e onde cada uma é lida: [../backend/configuration.md](../backend/configuration.md). Nenhuma delas guarda segredo do Tilo; `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` são zeradas nos processos filhos. Não há `.env` nem `.env.example`.

## Rotação do token

O token é lido de `.token` na partida. Para trocá-lo: encerrar o servidor, apagar `.token` e iniciar de novo (o servidor gera outro). Os navegadores precisam abrir o link com `?t=<token novo>` uma vez para receber o cookie novo.

## Cookie

`tilo_t`: `HttpOnly`, `SameSite=Strict`, `Path=/`, 1 ano.

## Regras

- Não gravar tokens, senhas ou valores de `.env` em `docs/`, `planning/` ou `pendencias/`.
- O Claude não lê `.env*`, `.ssh`, chaves, `.token` nem `projetos.json` do Tilo.

Verificação geral: [owasp-top10.md](owasp-top10.md).
