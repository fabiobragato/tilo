# Segurança — Tilo

Esta pasta contém a documentação técnica oficial de segurança do Tilo.

## Escopo

O Tilo roda no computador do dono, escuta em `127.0.0.1` e deixa o Claude ler arquivos do projeto e, com aprovação, propor comandos. A segurança cobre: acesso ao servidor local, controle do que o Claude executa, proteção de segredos e tratamento de entradas.

Não há containers, banco de dados, contas de usuário nem implantação em servidor.

## Documentos

- [owasp-top10.md](owasp-top10.md): as categorias A01–A10, onde o código as aplica e o status verificado.
- [secrets-and-config.md](secrets-and-config.md): nomes das variáveis e dos arquivos sensíveis, onde são lidos e como renovar o token.
- [secure-development-checklist.md](secure-development-checklist.md): checklist para alterações no código, com os comandos reais do projeto.

Não existe documento de endurecimento de containers porque o projeto não usa containers.

Aprovação de comandos: [../business/aprovacao-de-comandos.md](../business/aprovacao-de-comandos.md) e [../backend/command-policy.md](../backend/command-policy.md).

## Erros nas respostas HTTP

Regras (CodeQL `js/stack-trace-exposure`), implementadas em `erros.mjs` e testadas em `erros.test.mjs`:

- Nenhuma resposta HTTP devolve `e.message`, `e.stack` ou o texto cru de uma exceção. Toda rota passa por `mensagemSegura(e)`.
- Erro esperado (`Error` simples, em português, de validação ou regra de negócio, sem `code` de sistema) segue para a interface, com stack, caminhos locais, URLs com credencial e tokens removidos (`redigir`).
- Erro inesperado (`TypeError`, `SyntaxError`, erros de `fs`/rede com `code`, valores que não são `Error`) vira `Erro interno do Tilo. Detalhes foram registrados no log local.` (HTTP 500 ou o código que a rota já usava). O detalhe vai só para o log local (`registrarErro`), também redigido.
- A auditoria (`motivo` de falhas de git pull/push) e os avisos de log passam por `redigir`.
- Códigos HTTP, formato JSON `{ erro }`, autenticação e aprovação de comandos não mudaram.
- Ao criar rota nova, use `mensagemSegura(e)` no `catch`; o `erros.test.mjs` reprova `erro: e.message` direto.
