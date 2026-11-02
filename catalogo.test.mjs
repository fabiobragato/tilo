// node --test catalogo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectarStack, salvar, listar, excluir, pastaDoModelo } from './catalogo.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'central-cat-'));
const grava = (raiz, rel, txt = 'x') => { const f = path.join(raiz, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };

test('detecta a stack pelos arquivos do projeto', () => {
  const r = tmp();
  grava(r, 'apps/backend/Api/Api.csproj', '<Project/>');
  grava(r, 'apps/frontend/package.json', '{"dependencies":{"@angular/core":"^20"}}');
  grava(r, 'infra/docker/docker-compose.yml', 'services:\n  db:\n    image: postgres:16');
  grava(r, 'node_modules/x/package.json', '{"dependencies":{"react":"1"}}'); // ruído é ignorado
  assert.deepEqual(detectarStack(r).sort(), ['angular', 'docker', 'dotnet', 'node', 'postgres']);
  assert.deepEqual(detectarStack(tmp()), []);
});

test('detecta Python, React e Go', () => {
  const r = tmp(); grava(r, 'requirements.txt'); grava(r, 'web/package.json', '{"dependencies":{"react":"18"}}'); grava(r, 'svc/go.mod');
  assert.deepEqual(detectarStack(r).sort(), ['go', 'node', 'python', 'react']);
});

test('salvar copia só a documentação técnica das áreas escolhidas', () => {
  const proj = tmp(), cat = tmp();
  grava(proj, 'docs/backend/README.md', '# Backend'); grava(proj, 'docs/backend/architecture.md', '# Arq');
  grava(proj, 'docs/security/README.md', '# Sec'); grava(proj, 'docs/security/audit-2026-10.md', 'achados do projeto');
  grava(proj, 'docs/business/clientes.md', 'regra de negócio'); grava(proj, 'docs/backend/diagrama.png', 'bin');
  const m = salvar({ raizProjeto: proj, nomeProjeto: 'Meu App', nome: 'API .NET + Angular', descricao: 'base', areas: ['backend', 'security'], stack: ['dotnet', 'angular', 'inexistente'] }, cat);
  assert.equal(m.id, 'api-net-angular');
  assert.deepEqual(m.stack, ['dotnet', 'angular']);
  assert.equal(m.arquivos, 3); // README+architecture+security/README; sem audit, sem png
  assert.ok(fs.existsSync(path.join(cat, m.id, 'backend', 'architecture.md')));
  assert.ok(!fs.existsSync(path.join(cat, m.id, 'security', 'audit-2026-10.md')));
  assert.ok(!fs.existsSync(path.join(cat, m.id, 'business')));
  assert.equal(listar(cat)[0].origem, 'Meu App');
  assert.equal(pastaDoModelo(m.id, cat), path.join(cat, m.id));
});

test('salvar recusa negócio, área inválida e pedidos vazios', () => {
  const proj = tmp(), cat = tmp(); grava(proj, 'docs/backend/README.md');
  const base = { raizProjeto: proj, nomeProjeto: 'X', nome: 'Modelo bom', areas: ['backend'] };
  assert.throws(() => salvar({ ...base, areas: ['business'] }, cat), /específicas de cada produto/);
  assert.throws(() => salvar({ ...base, areas: ['../etc'] }, cat), /não pode entrar/);
  assert.throws(() => salvar({ ...base, areas: [] }, cat), /pelo menos uma área/);
  assert.throws(() => salvar({ ...base, nome: 'ab' }, cat), /dê um nome/);
  assert.throws(() => salvar({ ...base, areas: ['frontend'] }, cat), /não há documentos/);
  assert.equal(listar(cat).length, 0);
});

test('nomes repetidos ganham sufixo; excluir é seguro', () => {
  const proj = tmp(), cat = tmp(); grava(proj, 'docs/backend/README.md');
  const a = salvar({ raizProjeto: proj, nome: 'Modelo', areas: ['backend'] }, cat), b = salvar({ raizProjeto: proj, nome: 'Modelo', areas: ['backend'] }, cat);
  assert.deepEqual([a.id, b.id], ['modelo', 'modelo-2']);
  assert.throws(() => excluir('../..', cat), /inválido/);
  assert.throws(() => excluir('nao-existe', cat), /não encontrado/);
  excluir('modelo', cat);
  assert.deepEqual(listar(cat).map((e) => e.id), ['modelo-2']);
  assert.equal(pastaDoModelo('modelo', cat), null);
});
