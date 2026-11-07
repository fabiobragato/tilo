# Padrões de código do frontend

Cobre as convenções de `assets/app.js` e `assets/inicio.js`, a segurança do HTML gerado e os testes.

## Convenções

- JavaScript em modo estrito (`'use strict'`), sem módulos: cada página tem um script único.
- Funções curtas e nomes em português (`viewPend`, `loadBiblioteca`, `abrirAnexar`).
- Eventos por delegação em `document`, com atributos `data-act` (clique) e `data-chg` (mudança).
- HTML é montado com template strings; dados sempre passam por `esc()` (troca `& < > " '`).
- `md()` é um renderizador mínimo (títulos, listas, tabelas, blocos de código, `code` e negrito): escapa tudo, não gera links nem aceita HTML.
- Seletores: sempre `<select class="sel">`, que o `assets/combo.js` transforma no combobox padrão (nunca um select nativo visível nem outro estilo de menu); ver [design-system.md](design-system.md). Cada página carrega `combo.js` antes do próprio script.
- Mensagens ao usuário em português, por `toast()`.
- Ações destrutivas pedem confirmação com o modal `await confirmar({ titulo, texto, detalhe, ok, perigo })` (apagar conversa, remover linha do README, remover da biblioteca, remover regra/permissão, aceitar/descartar lotes). Para pedir um texto use `await pedirTexto({ titulo, valor, ok })` (devolve `null` se cancelar). É proibido usar `confirm()`, `prompt()` e `alert()` nativos.
- Acessibilidade: `aria-label` em botões de ícone, diálogos com `aria-labelledby`, região de aviso `role="status"`.

## Segurança do HTML

- Nenhum script inline: `<script src=... nonce="__NONCE__">`.
- `CSP`: `default-src 'self'; script-src 'self' 'nonce-...'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'`.

## Testes

Não há testes da interface em si, nem lint ou build. O `padroes.test.mjs` (parte do `npm test`) só guarda os padrões de código da interface: todo `<select>` com `class="sel"` e `combo.js` carregado antes do script de cada página.
