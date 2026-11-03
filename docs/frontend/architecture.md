# Arquitetura do frontend

Cobre as páginas, os arquivos e o ciclo de desenho da interface.

## Páginas

| Página | Arquivos | Servida em |
|---|---|---|
| Seleção de projetos | `inicio.html`, `assets/inicio.js`, `assets/inicio.css` | `/` |
| Painel do projeto | `index.html`, `assets/app.js`, `assets/app.css` | `/p/<id>` |

O backend substitui marcadores nas páginas ao servi-las: `__NONCE__` (todas), e em `index.html` também `__PROJ__` (id), `__NOME__` (nome escapado) e `__COR__` (cor do projeto, usada em `--accent`).

## Seleção (`assets/inicio.js`)

- Carrega `/api/projetos` e desenha uma fileira de tiles (ícone de cada projeto) mais o tile "+".
- Teclado: setas navegam, `Enter` abre, `1`–`9` abrem direto, `E` edita o selecionado, `N` cadastra.
- Formulário (`<dialog id="novo">`) serve para cadastrar e editar: nome, descrição, pasta (só no cadastro), cor, ícone e logo, "Criar estrutura base" e "Montar a documentação do projeto com o Claude". Imagens: PNG, JPG ou WEBP até 1,5 MB, conferidas no cliente e de novo no servidor.
- Atalhos de URL: `/#novo` abre o cadastro; `/#editar` edita o projeto selecionado.
- Relógio no topo atualizado a cada 15 segundos.
- Se o cadastro marcou a documentação, segue para `/p/<id>#/documentacao`.

## Painel (`assets/app.js`)

Seções do arquivo: utilidades (`esc`, `md`, `ago`, `toast`, `api`), estado (`S`), componentes (`badge`, `pager`...), menu (`NAV`), uma função de tela por página (`viewVisao`, `viewPend`, `viewSess`, `viewArq`, `viewChat`, documentação, biblioteca, permissões), roteamento (`render`), eventos (delegação em `document`) e carga de dados (`refresh`).

Ciclo de desenho:

1. `route()` lê o hash e `render()` escolhe a tela.
2. Telas simples (`visao`, `pendencias`, `sessoes`) são montadas como texto HTML e atribuídas a `#view`.
3. Telas com estado próprio (`chat`, `documentacao`, `biblioteca`, `permissoes`) montam um contêiner uma vez (`.chat-layout`, `.doc-page`, `.bib-page`, `.perm-page`) e se atualizam por funções (`updateChat`, `renderDocumentacao`, `renderBiblioteca`, `renderPermissoes`).
4. Cliques usam um único ouvinte em `document` que lê `data-act`; mudanças de campos usam `data-chg`.

## Diálogos

`<dialog>` nativos: `#dlg` (visualizador de arquivo/documento), `#bdlg` (biblioteca), `#adlg` (aprovação de comando; `Esc` não fecha, exige Negar/Aprovar), `#cdlg` (confirmações e pedidos de texto simples; `Esc`, clique fora ou Cancelar cancelam).

## Menu lateral

`NAV` define as telas: Visão geral, Pendências, Sessões, Conversar com Claude, Documentação (cobertura, explorador de arquivos e geração com o Claude; o explorador é desenhado à parte por `renderArq`), Biblioteca de documentos, Permissões do Claude. O menu pode ser recolhido; a escolha fica em `localStorage` (`tilo.sidebar-collapsed`).

Regras visíveis por tela: [../business/](../business/README.md).
