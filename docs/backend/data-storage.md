# Armazenamento de dados

Cobre os arquivos e pastas que o servidor lê e grava. O Tilo não usa banco de dados nem migrações.

## Visão geral

| Local | Conteúdo | Git |
|---|---|---|
| `projetos.json` | Lista de projetos e permissões de cada um. Modelo: `projetos.example.json`. | ignorado |
| `dados/<id>/estado.json` | Estado por item de pendência. | ignorado |
| `dados/<id>/chats.json` | Conversas do painel. | ignorado |
| `dados/<id>/sessoes-meta.json` | Apelido, vínculo e ocultação de sessões do terminal. | ignorado |
| `dados/<id>/auditoria.jsonl` | Log de auditoria (uma linha JSON por evento). | ignorado |
| `logos/<id>-icone.<ext>`, `logos/<id>-logo.<ext>` | Imagens do projeto (`png`, `jpg` ou `webp`). | ignorado |
| `catalogo/<coleção>/<área>/<arquivo>.md` e `catalogo/<coleção>/manifest.json` | Biblioteca de documentos. | ignorado |
| `.token` | Token de acesso. | ignorado |
| `tilo.log`, `tilo.err.log` | Saída do servidor iniciado pelo atalho. | ignorado |
| `assets/tilo.ico` | Ícone gerado por `scripts/instalar-atalho.ps1`. | ignorado |
| `<tmp>/tilo-rascunhos/<lote>/` | Rascunhos de generalização (pasta temporária do sistema). | fora do projeto |
| `<tmp>/tilo-settings.json`, `<tmp>/tilo-mcp-<chat>.json` | Configurações geradas para o `claude`. | fora do projeto |

`<tmp>` é `os.tmpdir()`. A lista de ignorados está em `.gitignore`.

## `projetos.json`

Objeto `{ "projetos": [ ... ] }`. Cada projeto:

| Campo | Regra |
|---|---|
| `id` | `^[a-z0-9][a-z0-9-]{0,39}$`; gerado a partir do nome (sem acentos, minúsculas, hífens); repetido ganha `-2`, `-3`... |
| `nome` | 1 a 60 caracteres. |
| `raiz` | Caminho absoluto de uma pasta existente; não pode ser a raiz do disco nem repetir outro projeto (sem diferenciar maiúsculas). |
| `cor` | `#rrggbb`; padrão `#5b5cf0`. |
| `descricao` | Até 140 caracteres. |
| `icone`, `logo` | Caminhos relativos à pasta do Tilo (`logos/...`); opcionais. |
| `pendencias` | Caminho do README de pendências relativo à raiz; padrão `pendencias/README.md`. |
| `pastasLegiveis` | Pastas liberadas para `/api/file`; padrão `docs`, `planning`, `pendencias`, `apps`, `infra`. |
| `politica` | `{ pacotes, lembrados, bloqueios, producao }` (ver [command-policy.md](command-policy.md)). |

Registros sem `id` válido ou sem `raiz` são ignorados. Se `projetos.json` não existe ou está inválido, a lista é vazia.

## `estado.json`

`{ "items": { "<idDoItem>": { "status", "nota", "em" } } }`. `status` ∈ `aberto`, `andamento`, `feito`, `ignorado`; `em` é a data ISO da última mudança. O id do item é derivado do título da seção e do título do item (ver [../business/pendencias.md](../business/pendencias.md)).

## `chats.json`

`{ "chats": { "<uuid>": conversa } }`. Campos da conversa: `id`, `title`, `itemId`, `contexto`, `model`, `plan`, `modo` (`perguntar`, `editar` ou `leitura`; conversas antigas com `edit`/`exec` são convertidas na leitura), `started`, `closed` (opcional; conversa encerrada), `created`, `updated`, `messages` e, nas conversas de documentação, `doc`, `gen`, `referencias`. Cada mensagem: `role`, `text`, `ts`, `model`, `plan` e, conforme o caso: `mid` (id da mensagem do dono), `tools` (ações usadas na resposta: `nome`, `resumo`, `detalhe` com o comando ou caminho completo até 2.000 caracteres, `ini`, `ms` de duração e `estado`: `ok`, `erro` ou `interrompida`; nunca a saída da ferramenta), `interrompido`, `erro`, `naoLida` (mensagem que o Claude nunca chegou a ler).

## `auditoria.jsonl`

Cada linha: `ts` (ISO) e os campos do evento (`chat`, `tool`, `resumo`, `risco`, `decisao`, `quem`, `motivo`). Falhas ao gravar são ignoradas. Ver [../business/auditoria.md](../business/auditoria.md).

## Escrita

`writeJson` grava o arquivo inteiro (`JSON.stringify` com indentação de 2 espaços), sem trava entre processos.
