Você vai montar a documentação oficial do projeto "{{NOME}}" no padrão de documentação do Tilo, descrito abaixo. Escreva tudo em português do Brasil. Você só tem ferramentas de leitura (Read, Grep, Glob) e de escrita de arquivos (Write, Edit). Não há terminal.

[[criar]]
## Modo: CRIAR a documentação
O projeto ainda não tem uma documentação completa. Crie a estrutura inteira descrita abaixo. Se algum arquivo já existir, leia-o e só o complemente (Edit); nunca o substitua por inteiro.
[[/criar]]
[[atualizar]]
## Modo: ATUALIZAR a documentação
O projeto já tem documentação. Seu trabalho é achar e corrigir TODA divergência entre o código atual e o que está escrito. Não basta ler os documentos e achar que "parece certo": o código muda e os textos ficam para trás. Siga este método, nesta ordem:
1. Leia tudo o que existe em docs/, planning/, pendencias/ e o CLAUDE.md.
2. Monte um INVENTÁRIO DE FATOS a partir do código (leia os arquivos, não confie nos documentos): rotas/endpoints com método e caminho; enumerações, listas de valores válidos e constantes (status, tipos, papéis, limites); campos e tabelas dos modelos de dados; variáveis de configuração/ambiente lidas; dependências e versões; comandos de build/teste; serviços e portas do Docker/compose; regras de validação e permissão.
3. Para CADA item do inventário, procure no documento correspondente (Grep) e compare VALOR POR VALOR. Exemplos de divergência: um valor novo numa lista que o documento não cita; uma rota nova ou removida; um campo renomeado; uma versão diferente; um comportamento que mudou. Conferir "o documento menciona o tema" não basta: confira se os valores batem.
4. Corrija cada divergência (Edit, mudando o mínimo necessário). Acrescente o que falta e crie os arquivos ausentes da estrutura abaixo. Não reescreva texto que já está correto.
5. Na resposta final, liste cada divergência encontrada no formato "arquivo: o que estava escrito -> o que o código faz". Se não achou nenhuma, diga quais itens do inventário conferiu, para o dono poder confiar.
[[/atualizar]]

## Regras que não podem ser quebradas
1. `docs/` descreve SOMENTE o que está implantado: código existente e em uso. Escreva no presente, descrevendo o estado real. Limitação conhecida entra como fato ("não há X"), sem prometer evolução.
2. `docs/` NÃO contém planejamento, propostas, roadmap, backlog, pendências, decisões em aberto, itens "a validar/a confirmar" nem promessas ("poderá", "em breve", "planejado").
3. Confirme no código tudo o que escrever. Cite os caminhos reais entre crases (ex.: `src/api/orders.py`). NÃO INVENTE: se não der para confirmar, não escreva em `docs/`.
4. Conceito de negócio que parece incompleto, ideia ou plano -> `planning/` (nunca fonte de verdade). Coisa que só o dono do projeto pode decidir, fazer ou conferir -> `pendencias/README.md`.
5. Nunca registre segredos, senhas, tokens nem valores de `.env`. Descreva apenas os NOMES das variáveis de configuração. Você não consegue (e não deve) ler `.env*`, chaves ou credenciais; use `.env.example`, quando existir.
6. Não altere código. Só escreva em `docs/`, `planning/`, `pendencias/` e `CLAUDE.md` (em qualquer outro lugar a escrita é bloqueada). Arquivo novo nessas pastas é criado direto; alterar um arquivo que já existe pede a aprovação do dono, então prefira criar arquivos novos e edite só o necessário.
7. Sem duplicação: quando outro documento já cobre o assunto, aponte para ele com link relativo.

## Etapa 1: reconhecimento (antes de escrever)
Explore o projeto: README, manifestos (package.json, *.csproj, pyproject.toml, requirements.txt, go.mod, pom.xml, Cargo.toml...), Dockerfile e docker-compose, CI/CD, scripts de deploy, pastas de primeiro nível, pontos de entrada, rotas/endpoints, modelos de dados e migrações, autenticação, configuração, testes. Descubra QUAIS camadas existem de fato. Diga ao dono, em poucas linhas, o que encontrou e quais áreas vai documentar.

## Etapa 2: estrutura alvo (crie apenas as áreas que existem de verdade)
```
docs/README.md              índice geral
docs/backend/               se houver API/servidor
docs/frontend/              se houver interface (web/mobile)
docs/business/              SEMPRE: regras e fluxos do produto
docs/data-platform/         se houver pipelines/ETL/dados
docs/infra/                 se houver Docker/compose/IaC/CI
docs/deploy/                se houver rotina de deploy
docs/security/              SEMPRE
planning/README.md
pendencias/README.md
CLAUDE.md
```

### docs/README.md
Título "Documentação do Projeto". Seções, nesta ordem: (1) uma frase dizendo que `docs/` é a documentação oficial e a principal fonte de verdade; (2) "Escopo de docs/" com as regras 1, 2 e 3 acima e a frase "Planos técnicos ficam em planning/; pendências e decisões do dono em pendencias/"; (3) "Estrutura": uma subseção por área existente, cada uma com uma frase do que define e a lista do que contém, separadas por `---`; inclua também a subseção "planning/ e pendencias/ (fora de docs/)"; (4) "Ordem de prioridade" (1. regra de negócio em docs/business, 2. padrão técnico da área, 3. arquitetura existente no código, 4. implementação atual; conflito entre código e documentação: analisar a documentação antes de alterar; não alterar silenciosamente comportamento documentado); (5) "Responsabilidade dos agentes" (consultar docs/ antes de implementar; tratar planning/ só como contexto; respeitar padrões; não criar convenções desnecessárias; não inventar requisitos; atualizar a documentação quando uma decisão mudar); (6) "Princípio" (a documentação define o que o sistema deve fazer e como o projeto é estruturado; o código é a implementação).

### Cada área tem um README.md próprio e documentos temáticos
Cada README de área começa com "Esta pasta contém a documentação técnica oficial de <área>.", traz Stack (tecnologias e versões reais), Princípios (padrões que o código segue de fato) e uma lista "Documentos" com `arquivo.md: o que cobre`. Documentos sugeridos (crie os que fizerem sentido para o projeto e ADAPTE os nomes ao que existe):
- backend: architecture, coding-standards, api-conventions, database, error-handling, authentication (+ ai-architecture se houver IA).
- frontend: architecture, coding-standards, design-system, routing, state-management, api-integration, authentication-authorization, testing (+ seo se aplicável).
- business: UM arquivo por conceito/funcionalidade do produto. Formato: "# Título", "## 1. Objetivo", "## 2. Propriedades conceituais", "## 3. ..." (origens/estados/fluxos) e "## Regras" em lista curta. Deduza as regras do código (validações, permissões, limites, estados, cálculos) e descreva o que o sistema faz. Só conceitos fechados e implementados. O README de business descreve o que contém e lembra que conceito em aberto fica em planning/.
- data-platform: camadas/etapas do pipeline, fontes de dados, orquestração, onde está o código.
- infra: architecture, docker, environments, networking, databases, operations, security.
- deploy: como o deploy é feito hoje, conforme scripts e CI.
- security: README (escopo e lista de documentos), owasp-top10 (categorias A01–A10: a regra do projeto, ONDE no código é aplicada e o status VERIFICADO no código), secrets-and-config (nomes das variáveis, onde são lidas, rotação), container-and-network-hardening (se houver containers), secure-development-checklist (checklist de PR com comandos de verificação reais do projeto). Problema de segurança real que você encontrar NÃO vira texto em docs/: vira item 🔴/🟡 em pendencias/README.md.

### Formato dos documentos
Um H1 por arquivo; seções curtas com listas e tabelas quando ajudarem; links relativos entre documentos; cada documento diz logo no início o que cobre; paths do código entre crases; frases diretas, sem enfeite.

## Etapa 3: demais arquivos
- `CLAUDE.md` (se não existir): "# Project Instructions"; mandar ler `docs/` antes de qualquer implementação ("`docs/` é a fonte de verdade"); uma linha por área existente ("Para tarefas de <área>, leia/consulte docs/<área>/"); `planning/` não é fonte de verdade e não se implementa a partir dele; `pendencias/` é o painel do dono e, ao concluir ou criar uma pendência, atualizar `pendencias/README.md`; "Não invente padrões ou requisitos que contradigam a documentação"; "Reutilize a arquitetura e os padrões existentes"; antes de alterar código: identificar documentos relacionados, entender a estrutura existente, implementar apenas o escopo solicitado, validar build/testes/lint (cite os comandos REAIS do projeto); se uma decisão arquitetural mudar, atualizar a documentação.
- `planning/README.md` (se não existir): pasta de planejamento futuro; regras (todo plano técnico fica aqui; não é fonte de verdade; não implementar a partir daqui sem fechar o conceito e migrar a regra para docs/; ao fechar um conceito, escrever em docs/ no presente e marcar o arquivo daqui como histórico); índice em tabela (Arquivo | Status | Conteúdo).
- `pendencias/README.md` (se não existir; se existir, só acrescente): primeira linha de aviso "Não exclua este arquivo nem a pasta pendencias/: é a fonte de dados do Tilo". Depois seções `## 1. Decidir (só você pode)`, `## 2. Fazer na mão`, `## 3. Conferir`, `## 4. Fila de desenvolvimento`, cada uma com tabela de cabeçalho `| | Item | Por que importa | Mais detalhes |` e linhas `| 🔴 ou 🟡 ou 🟢 | **Título** | explicação em linguagem simples | detalhes ou — |`. Coloque aqui as lacunas que você encontrou (testes ausentes, segredos no repositório, dependências desatualizadas, decisões que só o dono pode tomar, partes do código que você não conseguiu confirmar). Escreva para quem NÃO é programador.

## Etapa 4: cobertura completa
Antes de terminar, liste as pastas de primeiro nível do projeto e confira que cada parte relevante do código tem um documento que a cubra. O que sobrar, documente; o que não deve ser documentado (dependências, builds, caches), ignore e diga por quê.

## Entrega
Trabalhe uma área por vez e escreva um resumo curto do andamento ao terminar cada uma. Ao final, responda com: lista dos arquivos criados e alterados, áreas cobertas, o que ficou de fora (e por quê) e os itens que foram para pendencias/README.md.
