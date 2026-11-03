# Biblioteca de documentos

Cobre o acervo local de documentos técnicos reaproveitáveis entre projetos. Implementação: `catalogo.mjs`, tela em `assets/app.js`.

## 1. Objetivo

Reaproveitar documentação técnica de um projeto em outros, sem levar regras de negócio.

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Áreas | `backend` (Backend), `frontend` (Frontend), `infra` (Infraestrutura), `deploy` (Deploy), `security` (Segurança), `data-platform` (Plataforma de dados). |
| Coleção | Projeto de origem; pasta `catalogo/<coleção>/` com `manifest.json` (`nome`, `publicadoEm`, `atualizadoEm`). Coleção sem documentos não aparece. |
| Documento | `catalogo/<coleção>/<área>/<caminho>.md`; identificador `<coleção>/<área>/<caminho>.md`. |
| Nomes | Cada trecho do caminho começa com letra ou número e usa letras, números, `.`, `-`, `_` ou espaço (até 81 caracteres). |
| Busca | Palavras de 2 ou mais letras; todas precisam aparecer no título, nome do arquivo, nome da área ou conteúdo. Filtros por área e por projeto de origem. |
| Limites | 300 KB por arquivo, 3 MB por publicação, 400 documentos listados/publicados por vez. |
| Local | `catalogo/` é ignorado pelo git. |

## 3. Fluxos

- **Ver:** abre o documento inteiro.
- **Anexar a este projeto** (até 40 documentos):
  - *Copiar e adaptar com o Claude* (padrão): conversa de documentação com `modelos/adaptar.md`; o Claude lê os documentos como referência (somente leitura) e escreve versões deste projeto em `docs/<área>/`, sem copiar fatos da origem.
  - *Só copiar*: grava cópias em `docs/<área>/` com um aviso no topo; nunca sobrescreve — se o arquivo existe, grava com `-<coleção>` no nome; se esse também existe, não faz nada.
- **Publicar documentos deste projeto:** o dono marca documentos de `docs/<área>/` (nada vem marcado). Arquivos com `audit` no início do nome ou da pasta ficam de fora; `business/`, `planning/` e `pendencias/` nunca entram. Duas opções:
  - *Generalizar com o Claude* (até 60 documentos): o Claude reescreve cada documento sem o que é do produto, com título que diz o escopo, parágrafo inicial e seção final "Pontos para adaptar ao seu projeto" (`modelos/generalizar.md`). O resultado vira rascunho em `<tmp>/tilo-rascunhos/<lote>/`.
  - *Publicar como está*: copia o original; republicar sobrescreve os mesmos arquivos.
- **Rascunhos:** o dono vê o rascunho, compara com o original, e **Aceita** (grava na biblioteca, substituindo a versão atual) ou **Descarta**; há "Aceitar todos" e "Descartar o lote".
- **Generalizar o que já está na biblioteca:** pela seleção ou "Generalizar toda a biblioteca".
- **Gerenciar:** remover um documento ou tudo de uma origem. Projetos que já usaram os documentos não mudam.

## Regras

- Nada entra na biblioteca por conta do Claude: só por publicação explícita do dono ou por aceite de rascunho.
- Na generalização o Claude só grava `<área>/<arquivo>.md` na pasta do lote.
- Cada ação (publicar, remover, anexar, iniciar generalização, aceitar) é registrada na auditoria ([auditoria.md](auditoria.md)).
- Conversas de adaptação e generalização seguem as regras de [documentacao-com-claude.md](documentacao-com-claude.md).
