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

- Todo pedido do Claude decidido pela política (liberado ou bloqueado) e todo pedido decidido pelo dono, por aprovação automática da conversa, por cancelamento ou por falta de resposta.
- Comandos lembrados e revogados; aprovação automática da conversa desligada.
- Biblioteca: publicar, remover, anexar (cópia), iniciar generalização e aceitar rascunhos.

## Regras

- O arquivo fica fora da pasta do projeto e é ignorado pelo git.
- Se a gravação falhar, a ação segue sem aviso.
- Não há rotação nem tela para consulta; o arquivo é lido diretamente.
