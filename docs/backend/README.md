# Backend — Tilo

Esta pasta contém a documentação técnica oficial de backend do Tilo: o servidor HTTP local e os módulos que ele usa.

## Stack

- Node.js 20 ou mais novo (`package.json`, campo `engines`).
- JavaScript em módulos ES (`.mjs`), usando só módulos nativos do Node: `http`, `fs`, `os`, `path`, `crypto`, `async_hooks`, `child_process`, `url`, `readline`.
- Nenhuma dependência npm: `package.json` não tem `dependencies` nem `devDependencies`.
- Claude Code (comando `claude`) instalado e logado na máquina, chamado como processo filho.
- Persistência em arquivos JSON/JSONL locais (não há banco de dados).
- Testes com o executor nativo `node --test`.

## Princípios

- O servidor escuta só em `127.0.0.1` (variável `TILO_BIND` pode mudar) e exige token em quase todas as rotas.
- Um único processo atende vários projetos; o projeto da requisição vem do caminho `/api/p/<id>/...` e fica disponível via `AsyncLocalStorage`.
- Os dados de cada projeto ficam em `dados/<id>/`, fora da pasta do projeto.
- Nenhum texto livre do usuário vai na linha de comando do `claude`: vai por entrada padrão (stdin).
- Tudo o que o Claude tenta executar passa pela política em `politica.mjs` e, se preciso, pela aprovação do dono na tela.
- Só a assinatura do Claude é usada: `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` são zeradas nos processos filhos.

## Documentos

- [architecture.md](architecture.md): arquivos, responsabilidades e fluxo de uma requisição.
- [api-conventions.md](api-conventions.md): todas as rotas, formato de resposta, limites e códigos de erro.
- [authentication.md](authentication.md): token, cookie, checagem de Host/Origin.
- [data-storage.md](data-storage.md): arquivos JSON e pastas que o servidor lê e grava.
- [ai-architecture.md](ai-architecture.md): como o `claude` é executado, aprovador MCP e conversas.
- [command-policy.md](command-policy.md): regras de fábrica, pacotes, comandos lembrados e política de escrita de arquivos.
- [error-handling.md](error-handling.md): como erros são tratados e devolvidos.
- [configuration.md](configuration.md): variáveis de ambiente, scripts de instalação e execução.
- [coding-standards.md](coding-standards.md): convenções do código, comandos de teste e validação.

Regras de produto relacionadas estão em [../business/](../business/README.md).
