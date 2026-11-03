# OWASP Top 10 aplicado ao Tilo

Cobre, por categoria, a regra do projeto, onde o código a aplica e o status verificado na leitura do código. "Verificado" significa conferido no código; os testes automatizados cobrem só `politica.mjs` e `catalogo.mjs`.

| Categoria | Regra do projeto | Onde no código | Status |
|---|---|---|---|
| A01 Controle de acesso quebrado | Toda rota exige token; Host/Origin só de localhost; arquivos só de pastas liberadas; escrita do Claude só onde a política permite. | `server.mjs` (`tokenOk`, `hostOk`, `originOk`, rota `/api/file`, rota `/assets/`); `politica.mjs` (`avaliarArquivo`); `catalogo.mjs` (`resolverId`); `server.mjs` (`gerarSettings`). | Aplicado. |
| A02 Falhas criptográficas | Token aleatório de 24 bytes; comparação em tempo constante; cookie `HttpOnly` e `SameSite=Strict`. | `server.mjs` (`TOKEN`, `tokenOk`, cookie `tilo_t`). | Aplicado. O tráfego é HTTP em loopback; o cookie não tem `Secure`. |
| A03 Injeção | Texto do usuário vai por stdin, nunca na linha de comando; ids validados por expressão regular; saída HTML escapada; comandos do Claude passam pela política. | `server.mjs` (`startJob`); `projetos.mjs` (`ID`, `COR`); `catalogo.mjs` (`COL`, `SEG`, `LOTE`); `assets/app.js` (`esc`, `md`); `politica.mjs`. | Aplicado. `spawn('claude', { shell: true })` recebe só argumentos montados pelo servidor (modelo validado, id de conversa gerado por `crypto.randomUUID`, pastas de leitura). |
| A04 Design inseguro | Padrão é negar: comandos novos perguntam; bloqueios e produção não podem ser enfraquecidos; "lembrar" só para comandos comuns; aprovação expira em 5 minutos. | `politica.mjs` (`avaliar`); `server.mjs` (`askApproval`, `/api/permissoes/lembrar`). | Aplicado; coberto por `politica.test.mjs`. |
| A05 Configuração insegura | Bind em `127.0.0.1`; cabeçalhos `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`; `frame-ancestors 'none'`. | `server.mjs` (`send`, `HOST`). | Aplicado. A política permite estilos inline (`style-src 'unsafe-inline'`). `TILO_BIND` permite mudar o endereço. |
| A06 Componentes vulneráveis | Sem dependências npm; ícones PrimeIcons incluídos em `assets/` (licença MIT em `assets/PRIMEICONS-LICENSE`). | `package.json`; `assets/primeicons.css`. | Aplicado. A versão do PrimeIcons incluído não está registrada nos arquivos. |
| A07 Falhas de autenticação | Um único segredo (token) por instalação, fora do git; cookie dura 1 ano; o token também é aceito em `?t=`. | `server.mjs` (`TOKEN_FILE`, `cookieToken`, `tokenOk`). | Aplicado. Não há expiração nem rotação automática do token ([secrets-and-config.md](secrets-and-config.md)). |
| A08 Falhas de integridade de software e dados | Remoção de pendência confere o conteúdo da linha; gravações da biblioteca validam caminho; não há atualização automática; baixar e executar código por comando (curl ou wget enviando para sh, bash ou iex) é bloqueado. | `server.mjs` (`/api/remover`); `catalogo.mjs`; `politica.mjs` (`PADRAO.negar`). | Aplicado. Não há CI nem verificação de assinatura. |
| A09 Falhas de log e monitoramento | Toda decisão sobre comandos e ações da biblioteca é registrada com data, quem decidiu e motivo. | `server.mjs` (`audit`); `dados/<id>/auditoria.jsonl`. | Aplicado. Falha ao gravar é ignorada; sem rotação. |
| A10 SSRF | O servidor não faz requisições para endereços informados por usuário; o aprovador chama só o próprio servidor; ferramentas de internet do Claude (`WebFetch`, `WebSearch`, `curl`) perguntam ao dono. | `aprovador-mcp.mjs`; `politica.mjs` (`PADRAO.producao`, `avaliar`). | Aplicado. |

## Cabeçalho `Content-Security-Policy`

`default-src 'self'; script-src 'self' 'nonce-<por página>'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'`.

## Proteções específicas do Tilo

- `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` zeradas nos processos filhos.
- Arquivos de segredos (`.env*`, `.ssh`, chaves, `.token`) negados na leitura e escrita do Claude: pelas configurações do `claude` (`claude-settings.json` + regras geradas) e pela política de comandos.
- Imagens de projeto: SVG recusado; tipo conferido pelos primeiros bytes.
- Rascunhos de generalização numa pasta temporária isolada, com escrita limitada a `<área>/<arquivo>.md`.
