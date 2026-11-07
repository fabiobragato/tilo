# Sistema de design

Cobre cores, tipografia, componentes e responsividade dos estilos em `assets/app.css` (painel) e `assets/inicio.css` (seleção).

## Painel (`assets/app.css`)

- Variáveis CSS em `:root`: `--accent` (substituída pela cor do projeto; padrão `#5b5cf0`), `--primary`, `--primary-strong`, `--primary-soft`, `--primary-border`, `--accent-ring`, `--accent-glow`, `--accent-wash`, `--accent-focus` (todas derivadas de `--accent` com `color-mix`, então hover, foco, sombras e fundos suaves seguem a cor do projeto; não use cores roxas fixas no `app.css`), `--text`, `--muted`, `--faint`, `--border`, `--border-soft`, `--surface`, e tons `--success`, `--warning`, `--danger`, `--info` (cada um com versão `-soft`).
- Fonte: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Fundo `#f5f7fb`.
- Layout: menu lateral (`.sidebar`, recolhível) + área principal com barra superior e conteúdo.
- Componentes: `.card`, `.badge` (`tone-*`), `.btn` (`primary`, `danger`, `sm`), `.icon-btn`, `.seg` (botões segmentados), `.sel` (todo `<select>`; ver "Combobox padrão" abaixo), `.dd` (o menu de seleção padrão: `.dd-btn` e `.dd-menu`/`.dd-op`), `.chat-tabs` (abas Conversa/Atividade), `.act-sum`/`details.act` (resumo e lista de ações), `.switch`, `.pager`, `.item` (pendência, com cor por prioridade), `.sess`, `.msg`/`.bubble` (chat), `.adlg` (diálogo de aprovação; variante `.prod` para produção), `.cdlg` (confirmação simples, `#cdlg`, aberta por `confirmar()`/`pedirTexto()`; `perigo: true` usa a variante `.prod`), `.lv` (níveis `lv-ok`, `lv-warn`, `lv-bad`), `.perm-*`, `.bib-*`, `.doc-*`.
- Grades `.g5` (5 colunas) e `.g2` (2 colunas), reduzidas em larguras até 1280, 1000 e 640 px.
- Responsivo em 1280, 1000, 900, 760, 640 e 580 px; `prefers-reduced-motion` desliga animações.

## Combobox padrão (`assets/combo.js`) — padrão obrigatório do projeto

Todo seletor do Tilo usa o mesmo menu: um botão (ícone opcional, valor atual e seta) que abre uma lista com título e, se houver, uma explicação por opção, com a atual marcada por um check. Não existe `<select>` nativo visível nem outro estilo de menu.

- **Formulários e filtros:** escreva `<select class="sel">` (ou `sel sm` para o tamanho pequeno). O `combo.js` esconde o select (`.dd-nativo`) e desenha o menu logo depois dele, também nos elementos criados depois (observa o DOM). O `<select>` continua no DOM, então `.value`, `data-chg` e o evento `change` funcionam como sempre. Explicação por opção: atributo `data-d` na `<option>` ou o texto "Título — explicação"; `disabled` na opção a desativa; `aria-label` no select vira o título do menu.
- **Telas com lógica própria** (modo e modelo do chat): `Combo.montar(div.dd, { tipo, itens: [{ v, t, d, i }], atual, titulo, dica, abrir, dir })`; a escolha chega pelo evento `combo:escolher` (`detail.tipo`, `detail.v`).
- **Comportamento:** a lista é `position: fixed` (não é cortada por cartões nem por janelas), abre para o lado que tem mais espaço (`abrir: 'cima'` prefere cima) e limita a altura com rolagem. Fecha com Esc, clique fora, rolagem da página ou ao escolher. Teclado: seta para baixo/cima abre e navega, Home/End, Enter escolhe, Tab sai.
- **Aparência:** `.dd-btn` com altura 36 px (30 px em `sm`, 34 px na linha do Enviar), borda `#e3e8f1`, raio 10 px; lista com sombra e raio 14 px; opção escolhida com fundo `--primary-soft` e ícone em `--primary`. Variações de estado por classe no `.dd` (`modo-auto` âmbar, `modo-plan` azul, `modo-leitura` cinza).
- **Guarda:** `padroes.test.mjs` reprova `<select>` sem `class="sel"` e confere que as páginas carregam `combo.js` antes do script próprio.

## Seleção (`assets/inicio.css`)

- Fonte `"Segoe UI", system-ui, sans-serif`; fundo escuro em tela cheia; tiles dos projetos com cor própria (`--c`); formulário em `<dialog class="novo">`.
- Responsivo até 640 px; `prefers-reduced-motion` respeitado.

## Ícones

PrimeIcons (`pi pi-...`) em `assets/primeicons.css`; fontes `primeicons.ttf`, `.woff` e `.woff2` em `assets/fonts/`. O `@font-face` usa só esses três formatos. A versão do PrimeIcons incluída não está registrada nos arquivos (desconhecida).

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
