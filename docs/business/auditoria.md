# Auditoria

Cobre o registro das decisões e ações sensíveis de cada projeto.

## 1. Objetivo

Deixar rastro de cada pedido do Claude, de quem decidiu e do que mudou nas permissões e na biblioteca.

## 2. Propriedades conceituais

Arquivo `dados/<id>/auditoria.jsonl`, uma linha JSON por evento, sempre com `ts` (data/hora ISO).

| Campo | Conteúdo |
|---|---|
| `chat` | Id da conversa, ou `-` quando não há. |
| `tool` | Ferramenta (`Bash`, `PowerShell`, `Write`, `Edit`...) ou `biblioteca`. |
| `resumo` | Comando ou descrição (até 4000 caracteres). |
| `risco` | `normal` ou `producao`. |
| `decisao` | `allow`, `deny`, `lembrado`, `revogado`, `publicado`, `removido`, `anexado` ou `iniciado`. |
| `quem` | `dono`, `dono (sessão)`, `dono (lembrou)`, `política`, `sessão`, `sistema` ou `timeout`. |
| `motivo` | Razão da decisão. |

## 3. O que é registrado

- Todo pedido do Claude decidido pela política (liberado ou bloqueado) e todo pedido decidido pelo dono, pelo modo da conversa (`quem: "modo"`, ex.: edição liberada em Aceitar edições ou negada em Somente leitura), por aprovação automática da conversa, por cancelamento ou por falta de resposta.
- Comandos lembrados e revogados; aprovação automática da conversa desligada; trocas de modo da conversa (`decisao: "modo"`).
- Biblioteca: publicar, remover, anexar (cópia), iniciar generalização e aceitar rascunhos.

## Regras

- O arquivo fica fora da pasta do projeto e é ignorado pelo git.
- Se a gravação falhar, a ação segue, mas o servidor registra um aviso no log (uma vez por projeto).
- Passando de ~5 MB, o arquivo é renomeado para `auditoria-<data>.jsonl` e um novo é iniciado.
- Não há tela para consulta; o arquivo é lido diretamente.
