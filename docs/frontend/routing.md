# Rotas e navegação

Cobre as rotas do servidor que entregam páginas e as rotas por hash dentro do painel.

## Rotas de página (servidor)

| Caminho | Página |
|---|---|
| `/` | Seleção de projetos. |
| `/p/<id>` | Painel do projeto. |

Outros caminhos que não começam com `/api/`, `/assets/` ou `/logo/` respondem 404. Detalhes de autenticação: [../backend/authentication.md](../backend/authentication.md).

## Rotas por hash (painel)

`route()` usa `location.hash` (sem `#/`); padrão `visao`.

| Hash | Tela |
|---|---|
| `#/visao` | Visão geral (métricas, em andamento, sessões recentes, críticas, arquivos recentes, com link para `#/documentacao`). |
| `#/pendencias` | Pendências, com filtros. |
| `#/sessoes` | Sessões (abas Painel e Terminal). |
| `#/chat` | Conversar com Claude. |
| `#/documentacao` | Documentação do projeto: cobertura por área, explorador de arquivos (`docs/`, `planning/`, `pendencias/`) e geração com o Claude. `#/arquivos` (antiga tela "Docs e planejamentos") redireciona para cá. |
| `#/biblioteca` | Biblioteca de documentos. |
| `#/permissoes` | Permissões do Claude. |

Parâmetros de consulta no hash:

- `#/pendencias?prio=alta|media|baixa` e `?stat=aberto|andamento|feito|ignorado`: aplicam filtro e depois limpam a URL.
- `#/chat?s=<id>`: seleciona uma conversa (ou sessão do terminal) e limpa a URL.

Rota desconhecida mostra a visão geral. Trocar de hash chama `render()`.

## Navegação entre telas

- Botão "Projetos" no menu lateral leva para `/`.
- Cartões da visão geral navegam por `data-act="go"`.
- Busca global (campo do topo, `Ctrl+K` foca): filtra pendências por título e texto e leva para `#/pendencias`.
