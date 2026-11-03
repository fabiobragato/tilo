# Integração com a API

Cobre como o cliente chama o backend. As rotas estão em [../backend/api-conventions.md](../backend/api-conventions.md).

## Função `api(path, body)`

- No painel (`assets/app.js`): reescreve `/api/...` para `/api/p/<id>/...`, com o id lido de `location.pathname` (`/p/<id>`). Sem `body`, usa `GET`; com `body`, `POST` com `Content-Type: application/json`.
- Na seleção (`assets/inicio.js`): chama `/api/projetos` e `/api/projetos/editar` sem prefixo.
- Em resposta não ok, lança `Error` com o campo `erro` do JSON (ou o texto do status). Quem chama mostra a mensagem em um aviso (`toast`).
- Não há cabeçalho de token no cliente: a autenticação é o cookie `tilo_t`, enviado pelo navegador.

## Chamadas principais por tela

| Tela | Chamadas |
|---|---|
| Pendências | `GET /api/pendencias`, `POST /api/estado`, `POST /api/remover` |
| Sessões | `GET /api/sessoes`, `GET /api/sessao`, `POST /api/sessoes/meta` |
| Chat | `GET /api/chats`, `POST /api/chat/novo`, `config`, `enviar`, `cancelar`, `apagar`; `GET /api/chat/stream`; `POST /api/aprovacao/decidir`, `/api/aprovacao/sessao` |
| Documentação (explorador de arquivos) | `GET /api/arquivos`, `GET /api/file` |
| Documentação | `GET /api/documentacao`, `POST /api/documentacao/iniciar` |
| Biblioteca | `GET /api/biblioteca`, `/doc`, `/rascunhos`, `/rascunho`; `POST /api/biblioteca/publicar`, `remover`, `anexar`, `generalizar`, `rascunho/aceitar`, `rascunho/descartar` |
| Permissões | `GET /api/permissoes`; `POST /api/permissoes/pacote`, `lembrar` (via aprovação), `esquecer`, `regra`, `regra/remover`, `testar` |

A busca da biblioteca espera 250 ms depois da última tecla antes de consultar.
