// node --test padroes.test.mjs
// Guarda dos padrões de interface (docs/frontend/design-system.md): todo seletor usa o combobox padrão de assets/combo.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ler = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
const FONTES = ['index.html', 'inicio.html', ...fs.readdirSync(path.join(HERE, 'assets')).filter((f) => f.endsWith('.js') && f !== 'combo.js').map((f) => 'assets/' + f)];

test('todo <select> tem class="sel" (o combobox padrão o transforma; nunca existe select nativo visível)', () => {
  const ruins = [];
  for (const f of FONTES) for (const m of ler(f).matchAll(/<select\b[^>]*>/g)) if (!/class="[^"]*\bsel\b/.test(m[0])) ruins.push(`${f}: ${m[0].slice(0, 80)}`);
  assert.deepEqual(ruins, [], 'use <select class="sel ...">; ver docs/frontend/design-system.md');
});

test('as duas páginas carregam combo.js antes do script da página', () => {
  for (const [html, js] of [['index.html', 'app.js'], ['inicio.html', 'inicio.js']]) {
    const t = ler(html), a = t.indexOf('/assets/combo.js'), b = t.indexOf('/assets/' + js);
    assert.ok(a >= 0 && b > a, `${html} deve carregar /assets/combo.js antes de /assets/${js}`);
  }
});

test('combo.js expõe o componente e esconde o select nativo', () => {
  const js = ler('assets/combo.js'), css = ler('assets/app.css');
  assert.match(js, /window\.Combo\s*=/);
  assert.match(js, /select\.sel/);
  assert.match(css, /\.dd-nativo\s*\{[^}]*display:none/);
});

test('modelos: o servidor e a tela listam os mesmos modelos', () => {
  const srv = ler('server.mjs').match(/const MODEL_IDS = \{([^}]*)\}/)?.[1] || '';
  const tela = ler('assets/app.js').match(/const MODELOS = \{([\s\S]*?)\n\};/)?.[1] || '';
  const chaves = (s) => [...s.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  const noServidor = [...srv.matchAll(/(\w+):\s*'claude-/g)].map((m) => m[1]).sort();
  assert.ok(noServidor.length >= 4);
  assert.deepEqual(chaves(tela), noServidor);
});
