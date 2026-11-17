// Testes do cadastro de projetos. Usam uma pasta temporária (TILO_DADOS_BASE): nunca tocam em projetos.json, dados/ ou logos/ reais.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tilo-test-'));
process.env.TILO_DADOS_BASE = base;
const projetos = await import('./projetos.mjs'); // importado depois de definir a variável

const novaPasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tilo-proj-'));

test('adicionar valida nome e pasta', () => {
  assert.throws(() => projetos.adicionar({ nome: '', raiz: novaPasta() }), /nome inválido/);
  assert.throws(() => projetos.adicionar({ nome: 'X', raiz: 'relativo/pasta' }), /caminho completo/);
  assert.throws(() => projetos.adicionar({ nome: 'X', raiz: path.join(base, 'nao-existe') }), /não existe/);
  assert.throws(() => projetos.adicionar({ nome: 'X', raiz: novaPasta(), cor: 'vermelho' }), /cor inválida/);
});

test('adicionar, listar, editar e remover (sem apagar pasta nem dados)', () => {
  const raiz = novaPasta();
  const { id } = projetos.adicionar({ nome: 'Meu Projeto', raiz, estruturaBase: true });
  assert.equal(id, 'meu-projeto');
  assert.ok(fs.existsSync(path.join(raiz, 'pendencias', 'README.md')), 'estrutura base criada');
  assert.throws(() => projetos.adicionar({ nome: 'Outro', raiz }), /já está cadastrada/);
  assert.equal(projetos.obter(id).nome, 'Meu Projeto');

  projetos.editar({ id, nome: 'Renomeado', cor: '#112233' });
  assert.equal(projetos.obter(id).nome, 'Renomeado');
  assert.throws(() => projetos.editar({ id: 'nao-existe', nome: 'X' }), /não encontrado/);

  const dadosDir = path.join(base, 'dados', id);
  assert.ok(fs.existsSync(dadosDir));
  projetos.remover(id);
  assert.equal(projetos.obter(id), null);
  assert.ok(fs.existsSync(raiz), 'pasta do projeto permanece');
  assert.ok(fs.existsSync(path.join(raiz, 'CLAUDE.md')), 'arquivos do projeto permanecem');
  assert.ok(fs.existsSync(dadosDir), 'dados do Tilo permanecem');
  assert.throws(() => projetos.remover(id), /não encontrado/);
});

test('remover com apagarDados move dados/<id>/ e imagens para a lixeira, nunca toca a pasta do projeto', () => {
  const raiz = novaPasta();
  const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]).toString('base64');
  const { id } = projetos.adicionar({ nome: 'Apagar Tudo', raiz, estruturaBase: true, icone: png });
  const dadosDir = path.join(base, 'dados', id);
  projetos.obter(id); // garante dados/<id>/
  const img = path.join(base, 'logos', `${id}-icone.png`);
  assert.ok(fs.existsSync(dadosDir) && fs.existsSync(img));
  const lix = projetos.remover(id, { apagarDados: true }).lixeira;
  assert.ok(fs.existsSync(path.join(lix, 'projeto.json')) && fs.existsSync(path.join(lix, 'dados')) && fs.existsSync(path.join(lix, 'logos', path.basename(img))), 'tudo recuperável na lixeira');
  assert.ok(!fs.existsSync(dadosDir), 'dados saíram do lugar');
  assert.ok(!fs.existsSync(img), 'imagem saiu do lugar');
  assert.ok(fs.existsSync(path.join(raiz, 'CLAUDE.md')), 'pasta do projeto intacta');
});

test('remover com apagarPendencias apaga só pendencias/README.md', () => {
  const raiz = novaPasta();
  const { id } = projetos.adicionar({ nome: 'Sem Pendencias', raiz, estruturaBase: true });
  const lix = projetos.remover(id, { apagarPendencias: true }).lixeira;
  assert.ok(!fs.existsSync(path.join(raiz, 'pendencias')), 'README e pasta vazia apagados');
  assert.ok(fs.existsSync(path.join(lix, 'pendencias-README.md')), 'cópia na lixeira');
  assert.ok(fs.existsSync(path.join(raiz, 'CLAUDE.md')) && fs.existsSync(path.join(raiz, 'docs', 'README.md')), 'resto intacto');
  const raiz2 = novaPasta();
  const o = projetos.adicionar({ nome: 'Com Outro Arquivo', raiz: raiz2, estruturaBase: true });
  fs.writeFileSync(path.join(raiz2, 'pendencias', 'notas.md'), 'x');
  projetos.remover(o.id, { apagarPendencias: true });
  assert.ok(!fs.existsSync(path.join(raiz2, 'pendencias', 'README.md')));
  assert.ok(fs.existsSync(path.join(raiz2, 'pendencias', 'notas.md')), 'pasta com outros arquivos permanece');
});

test('imagem que não é PNG/JPG/WEBP é recusada', () => {
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');
  assert.throws(() => projetos.adicionar({ nome: 'Img', raiz: novaPasta(), icone: svg }), /PNG, JPG ou WEBP/);
  const falsa = 'data:image/png;base64,' + Buffer.from('nao e png de verdade').toString('base64');
  assert.throws(() => projetos.adicionar({ nome: 'Img', raiz: novaPasta(), icone: falsa }), /não é uma imagem/);
});

test.after(() => fs.rmSync(base, { recursive: true, force: true }));
