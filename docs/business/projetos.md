# Projetos

Cobre o cadastro e a edição de projetos no Tilo.

## 1. Objetivo

Permitir que o dono registre as pastas dos seus projetos e abra o painel de cada um. Implementação: `projetos.mjs`, `assets/inicio.js`.

## 2. Propriedades conceituais

| Propriedade | Regra |
|---|---|
| Nome | 1 a 60 caracteres. |
| Pasta | Caminho completo de uma pasta que já existe; não pode ser a raiz do disco; não pode repetir uma pasta já cadastrada. |
| Descrição | Opcional, até 140 caracteres. |
| Cor | `#rrggbb`; padrão `#5b5cf0`. |
| Ícone e logo largo | Opcionais; PNG, JPG ou WEBP até 1,5 MB cada; SVG é recusado; o tipo é conferido pelo conteúdo do arquivo. |
| Identificador | Gerado do nome (minúsculas, sem acentos, hífens, até 40 caracteres); se já existir, ganha `-2`, `-3`... |

## 3. Fluxos

- **Cadastrar:** tela de seleção, tile "+" ou tecla `N`. Opções: "Criar estrutura base se faltar" (marcada por padrão) e "Montar a documentação do projeto com o Claude".
- **Estrutura base:** cria, sem sobrescrever nada que exista, `pendencias/README.md`, `docs/README.md`, `planning/README.md` e `CLAUDE.md`, com textos iniciais curtos.
- **Montar a documentação:** depois de cadastrar, abre a tela Documentação do projeto; o início da execução ainda precisa ser confirmado ali ([documentacao-com-claude.md](documentacao-com-claude.md)).
- **Editar:** tecla `E` ou botão "Editar projeto". Muda nome, descrição, cor e imagens; a pasta não muda. Dá para remover o ícone ou o logo (volta ao cartão com as iniciais).
- **Imagem ausente:** o tile e o menu mostram um cartão SVG com as iniciais do nome sobre a cor do projeto.
- **Dados do projeto:** ficam em `dados/<id>/`, fora da pasta do projeto ([../backend/data-storage.md](../backend/data-storage.md)).

## Regras

- **Tirar da lista:** botão "Tirar da lista" na tela de seleção (com confirmação) ou `POST /api/projetos/remover`. Só retira o projeto de `projetos.json`: a pasta do projeto, `dados/<id>/` (conversas, auditoria) e `logos/` não são apagados.
- O Tilo só funciona no Windows (decisão do dono); macOS e Linux estão fora do escopo.
- A pasta cadastrada é onde o `claude` roda (diretório de trabalho).
- Arquivos do projeto liberados para visualização no painel: pastas listadas em `pastasLegiveis` (padrão `docs`, `planning`, `pendencias`, `apps`, `infra`); nunca arquivos `.env`.
- Cada projeto tem as próprias permissões de comandos ([permissoes-do-projeto.md](permissoes-do-projeto.md)).
