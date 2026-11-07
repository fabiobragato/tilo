# Pendências

Cobre como o Tilo transforma `pendencias/README.md` em lista de pendências e como elas são acompanhadas e concluídas.

## 1. Objetivo

O painel do dono: decisões, tarefas e conferências do projeto, lidas de um arquivo Markdown que o dono (ou o Claude) edita. Implementação: `parse()` em `server.mjs`, tela em `assets/app.js`.

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Fonte de dados | `pendencias/README.md` da raiz do projeto (ou o caminho do campo `pendencias` do projeto). Se não existir, o painel abre vazio. |
| Seção | Linha `## N. Título`. Outros `##` encerram a seção atual. `### Título` agrupa itens dentro da seção. |
| Item em tabela | Linha de tabela cuja primeira célula é 🔴, 🟡 ou 🟢 e que tem pelo menos 3 células: título (segunda), descrição (terceira) e detalhes (quarta, ignorada se for `—`). |
| Item em lista | `- 🔴 **Título** — descrição`. Sem negrito, o título é o início do texto (80 caracteres). |
| Prioridade | 🔴 alta (Crítica), 🟡 média (Importante), 🟢 baixa (Pode esperar). |
| Identificador | 10 primeiros caracteres do SHA-1 do texto "título da seção", uma barra vertical e "título do item"; duplicados ganham número no fim. |
| Referências | Caminhos entre crases terminando em `.md`, `.cs`, `.ts`, `.py`, `.yml`, `.yaml`, `.json`, `.sql`, `.ps1` ou `.conf` viram botões que abrem o arquivo. |
| Estado | `aberto` (padrão), `andamento`, `feito`, `ignorado`; guardado em `dados/<id>/estado.json`, com nota opcional de até 2000 caracteres. |

## 3. Fluxos

- **Acompanhar:** a tela Pendências filtra por seção, prioridade, status (padrão: ativos = abertos e em andamento) e texto; a Visão geral mostra contagens e as cinco críticas abertas.
- **Em andamento automático:** uma pendência `aberto` conta como "em andamento" (Visão geral, "Trabalhando agora", filtros e selo "automático") enquanto houver uma conversa do painel vinculada a ela que **não foi encerrada**. Encerrar a conversa tira a pendência desse estado. É calculado na tela; não grava em `estado.json`. Feito e ignorado nunca entram.
- **Mudar estado:** seletor em cada item.
- **Concluir:** marcar "Feito" e depois remover. Remover apaga a linha do `pendencias/README.md`, depois de confirmar com o dono e de conferir que a linha ainda tem o mesmo conteúdo (senão pede para recarregar).
- **Conversar sobre um item:** abre (ou retoma) uma conversa vinculada ao item, com seção, prioridade e linha como contexto ([conversas-claude.md](conversas-claude.md)).
- **Atualização:** a tela recarrega sozinha quando o arquivo muda.

## Regras

- O arquivo `pendencias/README.md` não deve ser apagado: é a fonte de dados do Tilo.
- O estado do item não altera o arquivo; só remover altera.
- Renomear o título de um item (ou da seção) muda o seu identificador e zera o estado guardado.
