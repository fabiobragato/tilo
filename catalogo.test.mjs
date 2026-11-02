// node --test catalogo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolverId, docsDoProjeto, publicar, listarColecoes, listarDocs, lerDoc, removerDoc, removerColecao, copiarParaProjeto, pastasDeLeitura } from './catalogo.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'central-cat-'));
const grava = (raiz, rel, txt = 'x') => { const f = path.join(raiz, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };
const projeto = () => {
  const p = tmp();
  grava(p, 'docs/backend/README.md', '# Backend\n\nA API usa Minimal APIs e EF Core.');
  grava(p, 'docs/backend/architecture.md', '# Arquitetura do backend\n\nMonólito modular.');
  grava(p, 'docs/frontend/routing.md', '# Rotas\n\nRotas com lazy loading.');
  grava(p, 'docs/security/README.md', '# Segurança');
  grava(p, 'docs/security/audit-2026-10.md', '# Auditoria\nachados');
  grava(p, 'docs/business/clientes.md', '# Clientes\nregra de negócio');
  grava(p, 'docs/backend/diagrama.png', 'bin');
  return p;
};

test('lista os documentos publicáveis por área, sem negócio nem auditoria', () => {
  const a = docsDoProjeto(projeto());
  assert.deepEqual(a.map((x) => x.area), ['backend', 'frontend', 'security']);
  assert.deepEqual(a[0].arquivos.map((x) => x.rel), ['README.md', 'architecture.md']);
  assert.equal(a[0].arquivos[1].titulo, 'Arquitetura do backend');
  assert.equal(a[2].arquivos.length, 1); // sem audit
});

test('publicar, listar e buscar', () => {
  const p = projeto(), cat = tmp();
  const r = publicar({ raizProjeto: p, colecao: 'meu-app', nome: 'Meu App', arquivos: ['backend/README.md', 'backend/architecture.md', 'frontend/routing.md'] }, cat);
  assert.equal(r.publicados, 3);
  assert.deepEqual(listarColecoes(cat).map((c) => [c.id, c.nome, c.total]), [['meu-app', 'Meu App', 3]]);
  const todos = listarDocs(cat);
  assert.equal(todos.length, 3);
  const arq = todos.find((d) => d.arquivo === 'architecture.md');
  assert.deepEqual([arq.id, arq.area, arq.areaNome, arq.titulo, arq.colecaoNome], ['meu-app/backend/architecture.md', 'backend', 'Backend', 'Arquitetura do backend', 'Meu App']);
  assert.match(todos.find((d) => d.arquivo === 'README.md').resumo, /Minimal APIs/);
  assert.deepEqual(listarDocs(cat, { q: 'lazy' }).map((d) => d.arquivo), ['routing.md']);          // busca no conteúdo
  assert.deepEqual(listarDocs(cat, { q: 'frontend' }).map((d) => d.arquivo), ['routing.md']);       // e no nome da área
  assert.deepEqual(listarDocs(cat, { q: 'minimal apis' }).map((d) => d.arquivo), ['README.md']);    // todas as palavras
  assert.equal(listarDocs(cat, { q: 'nada disso' }).length, 0);
  assert.match(lerDoc('meu-app/backend/README.md', cat).conteudo, /EF Core/);
});

test('publicar recusa o que não é documentação técnica e caminhos perigosos', () => {
  const p = projeto(), cat = tmp(), base = { raizProjeto: p, colecao: 'x', nome: 'X' };
  for (const a of ['business/clientes.md', 'security/audit-2026-10.md', '../fora.md', 'backend/../../x.md', 'backend/diagrama.png', 'backend/nao-existe.md', 'backend'])
    assert.throws(() => publicar({ ...base, arquivos: [a] }, cat), /.+/, a);
  assert.throws(() => publicar({ ...base, arquivos: [] }, cat), /pelo menos um/);
  assert.throws(() => publicar({ ...base, colecao: '../x', arquivos: ['backend/README.md'] }, cat), /inválido/);
  assert.equal(listarColecoes(cat).length, 0);
});

test('republicar sobrescreve os mesmos arquivos e mantém os demais', () => {
  const p = projeto(), cat = tmp();
  publicar({ raizProjeto: p, colecao: 'app', nome: 'App', arquivos: ['backend/README.md', 'frontend/routing.md'] }, cat);
  grava(p, 'docs/backend/README.md', '# Backend v2');
  publicar({ raizProjeto: p, colecao: 'app', nome: 'App', arquivos: ['backend/README.md'] }, cat);
  assert.equal(lerDoc('app/backend/README.md', cat).titulo, 'Backend v2');
  assert.equal(listarDocs(cat).length, 2);
});

test('ids de documento são validados contra caminhos fora do catálogo', () => {
  const cat = tmp();
  for (const id of ['', 'a', 'a/b', '../etc/passwd', 'x/backend/../../../segredo.md', 'x/business/a.md', 'x/backend/a.txt', 'X/backend/a.md', 'x/backend//a.md', 'x/backend/.oculto.md'])
    assert.equal(resolverId(id, cat), null, id);
  assert.notEqual(resolverId('x/backend/sub/a.md', cat), null);
  assert.throws(() => lerDoc('../x/backend/a.md', cat), /inválido/);
});

test('anexar ao projeto copia com aviso e nunca sobrescreve', () => {
  const origem = projeto(), cat = tmp(), destino = tmp();
  publicar({ raizProjeto: origem, colecao: 'app-a', nome: 'App A', arquivos: ['backend/README.md', 'backend/architecture.md', 'frontend/routing.md'] }, cat);
  grava(destino, 'docs/backend/README.md', '# O MEU README (não pode ser sobrescrito)');
  const r = copiarParaProjeto({ raiz: destino, ids: ['app-a/backend/README.md', 'app-a/backend/architecture.md', 'app-a/frontend/routing.md'] }, cat);
  assert.deepEqual(r.criados.sort(), ['backend/architecture.md', 'frontend/routing.md']);
  assert.deepEqual(r.renomeados, [{ de: 'backend/README.md', para: 'backend/README-app-a.md' }]);
  assert.equal(fs.readFileSync(path.join(destino, 'docs/backend/README.md'), 'utf8'), '# O MEU README (não pode ser sobrescrito)');
  const novo = fs.readFileSync(path.join(destino, 'docs/backend/architecture.md'), 'utf8');
  assert.match(novo, /Documento de referência copiado da biblioteca \(origem: App A\)/);
  assert.match(novo, /Monólito modular/);
  // repetir não destrói nada: o renomeado também já existe
  const r2 = copiarParaProjeto({ raiz: destino, ids: ['app-a/backend/README.md'] }, cat);
  assert.deepEqual([r2.criados.length, r2.renomeados[0].ja], [0, true]);
  assert.throws(() => copiarParaProjeto({ raiz: destino, ids: ['app-a/backend/../../../x.md'] }, cat), /não encontrado/);
});

test('remover documento e coleção; pastas de leitura', () => {
  const p = projeto(), cat = tmp();
  publicar({ raizProjeto: p, colecao: 'app', nome: 'App', arquivos: ['backend/README.md', 'backend/architecture.md', 'frontend/routing.md'] }, cat);
  assert.deepEqual(pastasDeLeitura(['app/backend/README.md', 'app/backend/architecture.md', 'app/frontend/routing.md', 'lixo'], cat).map((d) => path.relative(cat, d).split(path.sep).join('/')).sort(), ['app/backend', 'app/frontend']);
  removerDoc('app/frontend/routing.md', cat);
  assert.equal(listarDocs(cat).length, 2);
  assert.throws(() => removerDoc('app/frontend/routing.md', cat), /não encontrado/);
  assert.throws(() => removerColecao('../..', cat), /inválida/);
  removerColecao('app', cat);
  assert.equal(listarColecoes(cat).length, 0);
});
