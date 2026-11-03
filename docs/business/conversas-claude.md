# Conversas com o Claude

Cobre as conversas do painel (tela "Conversar com Claude") e seus modos.

## 1. Objetivo

Permitir que o dono converse com o Claude sobre o projeto, usando a assinatura do Claude Code já logada, sem API paga. Implementação: `startJob` em `server.mjs`, tela em `assets/app.js`. Detalhes técnicos: [../backend/ai-architecture.md](../backend/ai-architecture.md).

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Título | Até 80 caracteres; padrão "Nova conversa"; ao enviar a 1ª mensagem, o título vira o início dela (até 60 caracteres), se ainda for o padrão; renomeável pelo ícone de lápis ao lado do título (ou clicando nele). |
| Encerrada | Opcional (`closed`). Conversa encerrada guarda o histórico, mostra o selo "Encerrada" e não aceita novas mensagens até ser reaberta. |
| Modelo | `sonnet` (padrão), `opus` ou `haiku`. |
| Modo plan | O Claude só lê e planeja; edição e comandos ficam desligados. |
| Permitir editar arquivos | Ligado por padrão em conversas novas (decisão do dono; pode ser desligado a qualquer momento). Liberado, o Claude edita e grava arquivos do projeto sem pedir aprovação por arquivo (os arquivos de segredos continuam negados). |
| Permitir comandos | Ligado por padrão em conversas novas (decisão do dono; pode ser desligado a qualquer momento). Ligado, cada comando passa pela política e pode pedir aprovação ([aprovacao-de-comandos.md](aprovacao-de-comandos.md)). |
| Vínculo com pendência | Opcional (`itemId`); contexto de até 4000 caracteres enviado na primeira mensagem. |
| Mensagem | Até 20.000 caracteres. |

## 3. Fluxos

- **Criar:** botão "Nova conversa" ou o ícone de conversa em uma pendência.
- **Enviar:** `Ctrl+Enter` ou botão. Atalhos de resposta: Explique, Passo a passo, Já está feito?, Recomende.
- **Comandos de texto:** `/plan` alterna o modo plan; `/plan <texto>` envia já em plan; `/model sonnet|opus|haiku` (também `padrao`, `default`) troca o modelo. Outro texto iniciado por `/` é recusado.
- **Parar:** botão Parar cancela a resposta e nega pedidos pendentes.
- **Encerrar / Reabrir:** botão "Encerrar" no cabeçalho (com confirmação) cancela a resposta em andamento, desliga a aprovação automática e bloqueia o envio; "Reabrir conversa" volta ao normal. Na lista lateral, as encerradas ficam ao final e podem ser ocultadas.
- **Apagar:** remove a conversa, cancela o processo e desliga a aprovação automática dela.
- **Continuar sessão do terminal:** cria uma conversa nova com as últimas mensagens da sessão como contexto ([sessoes-terminal.md](sessoes-terminal.md)).
- **Aviso de falha:** se o `claude` falha, a resposta mostra o erro e a mensagem fica marcada como erro.

## Regras

- Só uma resposta por vez em cada conversa (nova mensagem durante a resposta é recusada).
- **Perguntas do Claude:** quando o Claude faz perguntas com opções (típico do modo plan), o painel abre uma janela com as opções selecionáveis (uma ou várias, conforme a pergunta) e sempre uma última opção "Outro", onde o dono escreve o que quer. "Dispensar" faz o Claude seguir com a melhor suposição.
- No modo plan, as opções de edição e comandos ficam desabilitadas.
- **Sair do modo plan:** quando o dono aprova o plano (pedido `ExitPlanMode`), o painel desliga o modo plan da conversa. As mensagens seguintes voltam a usar as opções de edição e comandos da conversa. Negar o plano mantém o modo plan.
- O Claude recebe sempre as instruções fixas: responder em português simples, conferir no código ou em `docs/` e seguir o `CLAUDE.md` do projeto.
- Conversas de documentação (`doc`) têm regras próprias ([documentacao-com-claude.md](documentacao-com-claude.md)).
