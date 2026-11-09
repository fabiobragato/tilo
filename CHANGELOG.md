# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento semântico quando aplicável.

## [Não lançado]

### Alterado
- README: slogan "Tilo: Project Knowledge", seção "Como utilizar o Tilo" no início (instalação, licença gratuita, licença empresarial e patrocínio) e melhorias gerais de apresentação.
- Apoio voluntário pelo Buy Me a Coffee divulgado no README (não concede licença comercial).

## [0.1.0] - 2026-11-08 (pré-lançamento)

Primeira release, publicada como pré-lançamento (tag `v0.1.0`).

### Adicionado
- Painel local (`127.0.0.1`, só Node.js, sem dependências) que usa a assinatura do Claude Code do próprio usuário.
- Seleção e cadastro de projetos, com estrutura base (`pendencias/`, `docs/`, `planning/`, `CLAUDE.md`) e opção de atrelar projeto existente.
- Painel de pendências lido de `pendencias/README.md` do projeto, com visão geral.
- Conversas com o Claude no navegador: fila de mensagens, modos de permissão, escolha de modelo, anexo de `plano.md` e aba Atividade.
- Aprovação de comandos em português, com política em camadas que bloqueia o destrutivo, libera só leitura e pergunta o resto.
- Tom das respostas (Caveman embutido) com quatro níveis: Normal, Enxuto, Curto e Mínimo.
- Git visual: branch, nova branch, commit de arquivos escolhidos, push e pull, com vínculo entre cada mudança e a conversa de origem.
- Sessões do Claude Code rodadas no terminal, consumo de tokens por conversa e documentação gerada e conferida pelo Claude, com biblioteca de documentos reaproveitáveis.
- `npm run verificar` (checagem do ambiente) e script de atalho para Windows.
- Documentação oficial em `docs/` e CI com testes em Windows e Linux (Node 20 e 22).
- `COMMERCIAL-LICENSE.md`, `FREELANCER-PERMISSION.md`, `CONTRIBUTING.md` (DCO), `SECURITY.md`, `CHANGELOG.md`, templates de Issue/PR e `docs/business/licenciamento.md`.

### Alterado
- Licença trocada de MIT para PolyForm Noncommercial 1.0.0 (source-available), com licença comercial Business separada.

[Não lançado]: https://github.com/fabiobragato/tilo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fabiobragato/tilo/releases/tag/v0.1.0
