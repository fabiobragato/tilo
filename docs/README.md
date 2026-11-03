# Documentação do Projeto

Esta pasta `docs/` é a documentação oficial do Tilo e a principal fonte de verdade do projeto.

## Escopo de docs/

1. `docs/` descreve SOMENTE o que está implantado: código existente e em uso. Escreve no presente, descrevendo o estado real. Limitação conhecida entra como fato ("não há X"), sem prometer evolução.
2. `docs/` NÃO contém planejamento, propostas, roadmap, backlog, pendências, decisões em aberto, itens "a validar/a confirmar" nem promessas.
3. Tudo o que está aqui foi confirmado no código, com os caminhos reais entre crases. Se não dá para confirmar, não entra em `docs/`.

Planos técnicos ficam em planning/; pendências e decisões do dono em pendencias/.

## Estrutura

### backend/

Define o servidor local em Node.js: rotas, autenticação, armazenamento em arquivos, integração com o Claude Code e política de comandos.

- `README.md`, `architecture.md`, `api-conventions.md`, `authentication.md`, `data-storage.md`
- `ai-architecture.md`, `command-policy.md`, `error-handling.md`, `configuration.md`, `coding-standards.md`

---

### frontend/

Define as duas páginas web (seleção de projetos e painel) em JavaScript puro.

- `README.md`, `architecture.md`, `routing.md`, `state-management.md`
- `api-integration.md`, `design-system.md`, `coding-standards.md`

---

### business/

Define as regras e fluxos do produto: projetos, pendências, conversas, sessões, aprovação de comandos, permissões, documentação com o Claude, biblioteca e auditoria. Conceito ainda em aberto fica em `planning/`.

- `README.md`, `projetos.md`, `pendencias.md`, `conversas-claude.md`, `sessoes-terminal.md`
- `aprovacao-de-comandos.md`, `permissoes-do-projeto.md`, `documentacao-com-claude.md`
- `biblioteca-de-documentos.md`, `auditoria.md`

---

### security/

Define a proteção do acesso local, dos segredos e do que o Claude pode executar.

- `README.md`, `owasp-top10.md`, `secrets-and-config.md`, `secure-development-checklist.md`

---

### planning/ e pendencias/ (fora de docs/)

- `planning/`: propostas e planos ainda não fechados. Não é fonte de verdade.
- `pendencias/`: painel do dono (decisões, tarefas, conferências, fila de desenvolvimento). O Tilo lê `pendencias/README.md`.

Não existem áreas `infra/`, `deploy/` nem `data-platform/`: o projeto não tem Docker, CI, rotina de deploy nem pipeline de dados.

## Ordem de prioridade

1. Regra de negócio em `docs/business/`.
2. Padrão técnico da área (`docs/backend/`, `docs/frontend/`, `docs/security/`).
3. Arquitetura existente no código.
4. Implementação atual.

Se o código e a documentação divergem, analise a documentação antes de alterar. Não altere silenciosamente um comportamento documentado.

## Responsabilidade dos agentes

- Consultar `docs/` antes de implementar.
- Tratar `planning/` apenas como contexto.
- Respeitar os padrões existentes e não criar convenções desnecessárias.
- Não inventar requisitos.
- Atualizar a documentação quando uma decisão mudar.

## Princípio

A documentação define o que o sistema deve fazer e como o projeto é estruturado. O código é a implementação.
