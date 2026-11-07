# Documentação com o Claude

Cobre a tela "Documentação": o Claude lê o código e monta ou atualiza `docs/` do projeto.

## 1. Objetivo

Gerar e manter a documentação oficial do projeto num padrão por área, a partir do código. As instruções seguidas estão em `modelos/documentar.md`.

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Áreas acompanhadas | `backend`, `frontend`, `business` (Regras de negócio), `data-platform`, `infra`, `deploy`, `security`; a tela conta os `.md` de cada uma em `docs/<área>/`. |
| Arquivos gerais | `docs/README.md`, `CLAUDE.md`, `planning/README.md`, `pendencias/README.md` (a tela diz se existem). |
| Modos | **Criar o que falta** (`criar`) e **Conferir com o código e atualizar** (`atualizar`, só aparece se já há documentos em `docs/`). |
| Modelo de IA | `sonnet` (padrão), `fable`, `opus` ou `haiku` (a lista mostra a versão de cada um). |

## 3. Fluxo

1. O dono escolhe o modo e o modelo e inicia; o servidor cria uma conversa de documentação e abre a tela de conversa.
2. O Claude trabalha sem terminal, só com leitura (`Read`, `Grep`, `Glob`) e escrita (`Write`, `Edit`).
3. A tela Documentação se atualiza a cada 4 segundos enquanto roda, mostrando contagem por área e a lista de arquivos; fica o link para a conversa com o resumo final.

## Regras

- Escrita permitida apenas em `docs/`, `planning/`, `pendencias/` (qualquer subpasta) e `CLAUDE.md`. Código, segredos e qualquer lugar fora do projeto são bloqueados.
- Arquivo novo é criado direto; alterar arquivo existente abre a janela de aprovação.
- Só uma tarefa de documentação (documentar, adaptar ou generalizar) roda por projeto de cada vez; outra tentativa recebe erro 409.
- O que o Claude não consegue confirmar vai para `pendencias/README.md`, não para `docs/`.
- Tudo é registrado na auditoria do projeto ([auditoria.md](auditoria.md)).
- A mesma tela Documentação tem a seção "Arquivos" (antiga tela "Docs e planejamentos", agora mesclada): lista os `.md` de `docs/`, `planning/` e `pendencias/` (até 500, mais recentes primeiro), com filtro por área e paginação, e abre cada um.
