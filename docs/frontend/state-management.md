# Estado e sincronização

Cobre o objeto de estado do painel e como ele se mantém igual ao disco.

## Objeto `S` (`assets/app.js`)

| Campo | Conteúdo |
|---|---|
| `sections`, `state` | Pendências e estado por item (de `/api/pendencias`). |
| `chats` | Conversas do painel. |
| `term` | Sessões do terminal. |
| `files` | Arquivos de `docs/`, `planning/`, `pendencias/`. |
| `sel` | Seleção do chat: `{ kind, id }`, com `kind` igual a `chat` ou `term`. |
| `tx` | Histórico das sessões do terminal já abertas. |
| `page`, `size` | Página atual e tamanho por página (`pend` 10, `sess` 6, `arq` 12 por padrão). |
| `f` | Filtros: seção, prioridade, status (padrão `ativos`), busca, aba de sessões, ocultas, área. |
| `draft` | Rascunho do texto digitado por conversa. |
| `collapsed` | Menu recolhido (persistido em `localStorage`). |
| `doc`, `bib`, `perm` | Dados das telas Documentação, Biblioteca (inclui seleção de documentos) e Permissões. |

## Sincronização

- `refresh()` roda a cada 4 segundos e quando a aba volta a ficar visível: consulta `/api/versao`, `/api/pendencias`, `/api/sessoes`, `/api/chats` e `/api/arquivos`, compara com a assinatura anterior e redesenha só se algo mudou.
- Se `/api/versao` muda, mostra o aviso "Docs/planning/pendências mudaram em disco — atualizado".
- Indicador no topo: "sincronizado hh:mm:ss" ou "sem conexão".
- Botão de atualizar força `refresh(true)`.
- Botão de reiniciar (ao lado do de atualizar) abre uma confirmação (`confirmar()`, avisa se há conversas do Claude respondendo), chama `/api/reiniciar`, espera o servidor voltar (até ~20 s) e recarrega a página.
- A cada 60 segundos, fora do chat e sem diálogo aberto, a tela é redesenhada (mantém "há X min" atual).
- Durante uma resposta do Claude, `pollStream` consulta `/api/chat/stream` a cada 700 ms; mostra o texto acumulado e os pedidos de aprovação.
- Documentação e Biblioteca atualizam sozinhas (4 s e 5 s) só enquanto há uma execução do Claude em andamento e a tela está aberta.

## Persistência no navegador

Somente `localStorage` com a chave `tilo.sidebar-collapsed`. O resto vive no servidor.
