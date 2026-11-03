# Tratamento de erros

Cobre como o backend trata e devolve falhas.

## Servidor HTTP

- `core()` em `server.mjs` envolve tudo em `try/catch`. Exceção não tratada → `500` com `{ "erro": "<mensagem>" }` (ou encerra a resposta se os cabeçalhos já foram enviados).
- Erros de validação dos módulos (`projetos.mjs`, `catalogo.mjs`, `politica.mjs`) são `Error` com mensagem em português; as rotas os capturam e respondem `400` com `{ "erro": mensagem }`. Em rotas de leitura da biblioteca, o erro vira `404`.
- Corpo grande demais ou JSON inválido: `readBody` rejeita e a resposta é `500` com a mensagem do erro.
- Códigos usados: ver [api-conventions.md](api-conventions.md).

## Arquivos locais

- `readJson` devolve o valor padrão se o arquivo não existe ou está inválido; `parse()` devolve lista vazia se `pendencias/README.md` não existe (o painel abre vazio).
- A gravação da auditoria ignora falhas (`try/catch` vazio).

## Execução do `claude`

- Falha ao iniciar o processo (`error`) ou saída com código ≠ 0: a resposta da conversa recebe `[erro ao iniciar claude: ...]` ou `[claude saiu com código N]`, seguida da saída de erro, e a mensagem fica marcada com `erro: true`. A conversa só é marcada como iniciada (`started`) quando termina com sucesso.
- Ao terminar, pedidos de aprovação pendentes são negados ("Conversa encerrada.").

## Aprovações

- Sem resposta em 5 minutos: negado (`timeout`).
- No `aprovador-mcp.mjs`, qualquer falha (token ilegível, servidor fora do ar, resposta não ok, 6 minutos sem resposta) devolve `deny` com a mensagem do motivo.
- Política: configuração de permissões inválida nunca derruba a avaliação (`cfgSegura` e `compilar` usam configuração vazia).

## Mensagens

Todas as mensagens de erro para o usuário estão em português e dizem o que fazer quando possível.
