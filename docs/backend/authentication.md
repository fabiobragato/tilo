# Autenticação e proteção de acesso

Cobre o token do Tilo, o cookie, a checagem de Host/Origin e o bind de rede. Não há usuários nem papéis: o Tilo é de uso local por uma pessoa.

## Token

- Arquivo `.token` na pasta do Tilo (ignorado pelo git). Se não existir ou não tiver 48 caracteres hexadecimais, o servidor gera 24 bytes aleatórios (`crypto.randomBytes`) e grava o arquivo ao iniciar.
- O token é aceito, nesta ordem de leitura, no cabeçalho `X-Tilo-Token`, no parâmetro `?t=` da URL ou no cookie `tilo_t`.
- A comparação usa `crypto.timingSafeEqual`.

## Cookie

- Ao abrir `/` ou `/p/<id>` com `?t=<token>`, o servidor grava `tilo_t` com `HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` (1 ano) e redireciona para a URL sem o token.
- O cookie não tem o atributo `Secure` (o acesso é HTTP em loopback).

## Onde o token é exigido

| Recurso | Sem token |
|---|---|
| `/` e `/p/<id>` | 403 com texto pedindo para abrir pelo atalho. |
| `/logo/<id>`, `/assets/...`, `/api/...` | 401 `{ "erro": "token inválido" }`. |

Nenhuma rota é pública além da resposta de erro.

## Host e Origin

- `Host` precisa ser `127.0.0.1:<porta>` ou `localhost:<porta>`, onde a porta é `TILO_PUBLIC_PORT` (padrão: o valor de `TILO_PORT`, padrão 4777) **ou** `TILO_PORT` (o aprovador chama por ela). Senão 403.
- `Origin`, quando presente, precisa ser `http://127.0.0.1:<porta>` ou `http://localhost:<porta>`, com as mesmas portas.

## Validade do token (risco aceito)

O token é gerado uma vez em `.token` e o cookie vale 1 ano. O token também é aceito na barra de endereço (`?t=`). Não há tela para trocar: só apagando `.token` (decisão do dono: manter assim, pelo uso local de uma pessoa).

## Bind

- O servidor escuta em `TILO_BIND` (padrão `127.0.0.1`) na porta `TILO_PORT` (padrão 4777).

## Aprovador MCP

`aprovador-mcp.mjs` lê o `.token` do disco e chama `http://localhost:<TILO_PORT>/api/p/<projeto>/aprovacao/pedir` com o cabeçalho `X-Tilo-Token`. Qualquer falha (token, rede, resposta não ok, timeout de 6 minutos) vira "negar".

Autorização de comandos do Claude: ver [command-policy.md](command-policy.md). Verificação de segurança: [../security/owasp-top10.md](../security/owasp-top10.md).
