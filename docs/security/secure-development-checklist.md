# Checklist de desenvolvimento seguro

Cobre o que conferir antes de concluir uma alteração no código do Tilo.

## Antes de alterar

- [ ] Li os documentos relacionados em `docs/` ([../README.md](../README.md)).
- [ ] A mudança não enfraquece bloqueios, produção ou a política de escrita de arquivos ([../backend/command-policy.md](../backend/command-policy.md)).

## Rotas e entradas

- [ ] Rota nova exige token (fica depois da checagem em `core()`), valida o corpo e devolve `{ erro }` em português.
- [ ] Ids e caminhos recebidos são validados (expressão regular e conferência de prefixo com `path.resolve`).
- [ ] Texto livre do usuário não entra em argumentos de `spawn`; vai por stdin.
- [ ] Dado novo mostrado na tela passa por `esc()`; nenhum script inline.

## Segredos

- [ ] Nada de tokens, senhas ou valores de `.env` em código, `docs/`, `planning/` ou `pendencias/`.
- [ ] Arquivo local novo com dado do usuário está no `.gitignore`.

## Verificação

- [ ] `npm test` passa (`node --test politica.test.mjs catalogo.test.mjs projetos.test.mjs consumo.test.mjs fluxo.test.mjs padroes.test.mjs`).
- [ ] Mudança em `politica.mjs` ou `catalogo.mjs` tem teste correspondente.
- [ ] `npm run verificar` (PowerShell) não aponta falhas no ambiente.
- [ ] Servidor inicia com `npm start` e o painel abre sem erro.
- [ ] `docs/` atualizado se comportamento, rota, variável ou limite mudou; `pendencias/README.md` atualizado se uma pendência foi concluída ou criada.

O projeto não tem lint nem CI; a verificação é manual.
