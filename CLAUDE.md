# Project Instructions — Tilo

Antes de implementar qualquer coisa, leia a documentação relevante em `docs/`. `docs/` é a fonte de verdade do projeto.

- Para tarefas de backend (servidor, rotas, política de comandos, integração com o Claude), leia/consulte `docs/backend/`.
- Para tarefas de frontend (`index.html`, `inicio.html`, `assets/`), leia/consulte `docs/frontend/`.
- Para regras e fluxos do produto, leia/consulte `docs/business/`.
- Para segurança (token, segredos, aprovação de comandos), leia/consulte `docs/security/`.
- `planning/` não é fonte de verdade: use só como contexto e não implemente a partir dele.
- `pendencias/` é o painel do dono (decisões, tarefas, fila de desenvolvimento); ao concluir ou criar uma pendência, atualize `pendencias/README.md`. Não exclua esse arquivo: o Tilo lê dele.
- **Padrão de interface (obrigatório):** todo seletor (combobox) usa o menu padrão de `assets/combo.js`. Em formulários e filtros, escreva `<select class="sel">` e o `combo.js` o transforma no menu (o `<select>` fica escondido e continua dando `.value` e o evento `change`); nunca deixe um `<select>` nativo visível nem crie outro estilo de menu. Telas com lógica própria usam `Combo.montar(...)`. Regras em `docs/frontend/design-system.md`; o `padroes.test.mjs` reprova `<select>` fora do padrão.
- Não invente padrões ou requisitos que contradigam a documentação.
- Reutilize a arquitetura e os padrões existentes.

## Antes de alterar código

1. Identifique os documentos relacionados em `docs/`.
2. Entenda a estrutura existente.
3. Implemente apenas o escopo solicitado.
4. Valide com os comandos do projeto: `npm test` (`node --test politica.test.mjs catalogo.test.mjs projetos.test.mjs consumo.test.mjs fluxo.test.mjs git.test.mjs padroes.test.mjs erros.test.mjs`) e, para o ambiente, `npm run verificar`. Não há lint nem build.
5. Se uma decisão arquitetural mudar, atualize a documentação em `docs/`.
