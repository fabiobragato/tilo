# Consumo de tokens

Cobre os tokens mostrados por conversa e o cartão de consumo estimado da Visão geral. Implementação: `consumo.mjs`, `usoDaConversa` e `/api/consumo` em `server.mjs`, `cardConsumo` em `assets/app.js`.

## 1. Objetivo

Deixar o dono ver quanto cada conversa consumiu (inclusive as encerradas) e quanto foi usado hoje e na semana, sem depender de API paga.

## 2. De onde vêm os números

- Os números vêm dos transcripts (`.jsonl`) que o próprio Claude Code grava (o Tilo não usa os eventos da execução para contar tokens) (mesma origem de [sessoes-terminal.md](sessoes-terminal.md)); o Tilo só lê.
- Cada resposta do Claude traz `message.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). A mesma resposta pode aparecer em várias linhas; conta-se uma vez por `message.id` (vale a última linha). Respostas sintéticas (`<synthetic>`) são ignoradas.
- O transcript de uma conversa do painel tem o id da conversa como nome. Conversas de generalização rodam em outra pasta e o servidor procura lá.
- Arquivos acima de 150 MB são ignorados. Os resultados ficam em cache por data e tamanho do arquivo.

## 3. O que é mostrado

| Onde | O quê |
|---|---|
| Cabeçalho da conversa, lista lateral e tela Sessões (painel e terminal) | Um selo com o total de tokens da conversa/sessão (sem detalhes). |
| Visão geral (cartão no topo) | Dois números do **projeto atual**: **Hoje** e **Últimos 7 dias** (hoje e os 6 anteriores, pelo dia local), e um botão que abre `https://claude.ai/settings/usage`. Sem gráfico nem detalhamento. |

## Regras

- **Total = entrada + saída + cache gravado.** O cache lido é repetido a cada mensagem e inflaria o número, por isso não entra.
- O cartão da Visão geral soma **só o projeto atual** (painel e terminal), não os outros projetos cadastrados, e é uma **estimativa local**: não inclui o uso no site/app do Claude nem em outros computadores, e não vira percentual do limite da assinatura (o limite não é publicado). O limite real só existe no claude.ai (Configurações > Uso).
- Todo rótulo do consumo leva um ícone PrimeIcons (`pi-*`), como os demais rótulos da interface.
- O Tilo não lê o limite da assinatura por nenhum meio não oficial (não toca em credenciais).
- Só leitura: nada é gravado em `chats.json`; o valor é calculado a cada consulta.
