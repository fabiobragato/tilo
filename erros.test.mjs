import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mensagemSegura, redigir, ehErroEsperado, MSG_INTERNO } from './erros.mjs';

const silenciar = (fn) => { const o = console.error; console.error = () => {}; try { return fn(); } finally { console.error = o; } };

test('erro de validação passa com a mensagem em português', () => {
  assert.equal(mensagemSegura(new Error('Escreva a mensagem do commit.')), 'Escreva a mensagem do commit.');
});

test('erros internos viram mensagem genérica', () => {
  const fs_ = Object.assign(new Error("ENOENT: no such file, open 'C:\Users\fcarmo\segredo.json'"), { code: 'ENOENT', syscall: 'open' });
  for (const e of [fs_, new TypeError('x is undefined'), new SyntaxError('Unexpected token } in JSON at position 3'), 'texto solto']) {
    assert.equal(silenciar(() => mensagemSegura(e)), MSG_INTERNO);
  }
});

test('stack, caminhos e tokens são removidos de erros esperados', () => {
  const tok = 'a'.repeat(48);
  const e = new Error(`falhou em C:\\Users\\fcarmo\\proj\\x.js e /home/ana/app/y.js com token ${tok} em https://u:p4ss@github.com/a/b\n    at foo (C:\\x.js:1:1)`);
  const m = mensagemSegura(e);
  assert.ok(!/Users|home\/ana|\bat foo|p4ss/.test(m), m);
  assert.ok(!m.includes(tok));
});

test('ehErroEsperado rejeita erros com code de sistema', () => {
  assert.equal(ehErroEsperado(Object.assign(new Error('x'), { code: 'EACCES' })), false);
  assert.equal(ehErroEsperado(new Error('ok')), true);
});

test('redigir limita o tamanho', () => { assert.ok(redigir('a '.repeat(500)).length <= 301); });

test('server.mjs não devolve e.message/err.message/stack direto na resposta', () => {
  const src = fs.readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.ok(!/erro:\s*(?:String\()?\(?(?:e|err|error)\.(?:message|stack)/.test(src), 'resposta HTTP expõe message/stack');
  assert.ok(!/send\([^;]*\.stack/.test(src));
});
