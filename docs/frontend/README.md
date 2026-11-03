# Frontend — Tilo

Esta pasta contém a documentação técnica oficial de frontend do Tilo: as duas páginas web servidas pelo backend local.

## Stack

- HTML, CSS e JavaScript puros no navegador, sem framework, sem bundler e sem etapa de build.
- Duas páginas: `inicio.html` (seleção de projetos, script `assets/inicio.js`, estilo `assets/inicio.css`) e `index.html` (painel do projeto, script `assets/app.js`, estilo `assets/app.css`).
- Ícones: PrimeIcons (`assets/primeicons.css`, fontes em `assets/fonts/`, licença em `assets/PRIMEICONS-LICENSE`).
- Imagem da marca: `assets/tilo-icon.svg`.
- Nenhuma biblioteca npm no cliente.

## Princípios

- Os arquivos de `assets/` são servidos pelo backend e exigem o cookie do Tilo.
- O JavaScript é carregado com `nonce` por página (política `script-src 'self' 'nonce-...'`); não há scripts inline.
- Todo texto vindo de dados é escapado (`esc`) antes de ir para o HTML; o renderizador de Markdown é mínimo e não aceita HTML cru nem links.
- Estado da tela fica em um objeto global `S`; a tela é redesenhada a partir dele.
- O painel atualiza sozinho: consulta o backend a cada 4 segundos.
- Interface em português do Brasil.

## Documentos

- [architecture.md](architecture.md): páginas, arquivos e ciclo de renderização.
- [routing.md](routing.md): rotas do servidor e rotas por hash do painel.
- [state-management.md](state-management.md): o objeto de estado e a sincronização.
- [api-integration.md](api-integration.md): como o cliente chama a API.
- [design-system.md](design-system.md): cores, componentes e layout.
- [coding-standards.md](coding-standards.md): convenções, segurança de HTML e testes.

Autenticação do acesso: [../backend/authentication.md](../backend/authentication.md).
