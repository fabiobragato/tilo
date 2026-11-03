# Sistema de design

Cobre cores, tipografia, componentes e responsividade dos estilos em `assets/app.css` (painel) e `assets/inicio.css` (seleção).

## Painel (`assets/app.css`)

- Variáveis CSS em `:root`: `--accent` (substituída pela cor do projeto; padrão `#5b5cf0`), `--primary`, `--primary-strong`, `--primary-soft`, `--primary-border`, `--accent-ring`, `--accent-glow`, `--accent-wash`, `--accent-focus` (todas derivadas de `--accent` com `color-mix`, então hover, foco, sombras e fundos suaves seguem a cor do projeto; não use cores roxas fixas no `app.css`), `--text`, `--muted`, `--faint`, `--border`, `--border-soft`, `--surface`, e tons `--success`, `--warning`, `--danger`, `--info` (cada um com versão `-soft`).
- Fonte: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Fundo `#f5f7fb`.
- Layout: menu lateral (`.sidebar`, recolhível) + área principal com barra superior e conteúdo.
- Componentes: `.card`, `.badge` (`tone-*`), `.btn` (`primary`, `danger`, `sm`), `.icon-btn`, `.seg` (botões segmentados), `.sel` (select), `.switch`, `.pager`, `.item` (pendência, com cor por prioridade), `.sess`, `.msg`/`.bubble` (chat), `.adlg` (diálogo de aprovação; variante `.prod` para produção), `.cdlg` (confirmação simples, `#cdlg`, aberta por `confirmar()`/`pedirTexto()`; `perigo: true` usa a variante `.prod`), `.lv` (níveis `lv-ok`, `lv-warn`, `lv-bad`), `.perm-*`, `.bib-*`, `.doc-*`.
- Grades `.g5` (5 colunas) e `.g2` (2 colunas), reduzidas em larguras até 1280, 1000 e 640 px.
- Responsivo em 1280, 1000, 900, 760, 640 e 580 px; `prefers-reduced-motion` desliga animações.

## Seleção (`assets/inicio.css`)

- Fonte `"Segoe UI", system-ui, sans-serif`; fundo escuro em tela cheia; tiles dos projetos com cor própria (`--c`); formulário em `<dialog class="novo">`.
- Responsivo até 640 px; `prefers-reduced-motion` respeitado.

## Ícones

PrimeIcons (`pi pi-...`) em `assets/primeicons.css`; fontes `primeicons.ttf`, `.woff` e `.woff2` em `assets/fonts/`. O CSS também cita `.eot` e `.svg`, que não existem na pasta.

## Prioridades e status (cores e rótulos)

| Prioridade | Rótulo | Tom |
|---|---|---|
| `alta` (🔴) | Crítica | danger |
| `media` (🟡) | Importante | warning |
| `baixa` (🟢) | Pode esperar | success |

| Status | Rótulo |
|---|---|
| `aberto` | Aberto |
| `andamento` | Em andamento |
| `feito` | Feito |
| `ignorado` | Ignorado |

Em `Content-Security-Policy`, estilos inline são permitidos (`style-src 'self' 'unsafe-inline'`).
