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
