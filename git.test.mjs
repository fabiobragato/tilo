import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { estado, diff, commitar, enviar, trocarBranch, criarBranch, nomeBranchValido, lerStatus, lerLog, montarMensagem, ehSensivel, vincularArquivos, gitDisponivel } from './git.mjs';

const temGit = await gitDisponivel();
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', windowsHide: true });
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `tilo-git-${n}-`));
function repo() {
  const dir = tmp('r');
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.email', 't@t.t'); sh(dir, 'config', 'user.name', 'Teste'); sh(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'um\n');
  sh(dir, 'add', '.'); sh(dir, 'commit', '-q', '-m', 'inicial');
  return dir;
}

test('lerStatus entende modificado, novo, apagado e renomeado', () => {
  const r = lerStatus(' M a.txt\0?? b.txt\0 D c.txt\0R  novo.txt\0velho.txt\0');
  assert.deepEqual(r.map((x) => [x.caminho, x.rotulo]), [['a.txt', 'modificado'], ['b.txt', 'novo'], ['c.txt', 'apagado'], ['novo.txt', 'renomeado']]);
  assert.equal(r[3].antigo, 'velho.txt');
  assert.equal(r[1].naoRastreado, true);
});

test('lerLog separa os campos e extrai só ids de conversa válidos', () => {
  const r = lerLog(`abc\x1fab\x1fassunto\x1fEu\x1f1700000000\x1f${ID1},lixo\x1e\nxyz\x1fxy\x1foutro\x1fEu\x1f1700000001\x1f\x1e`);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].chats, [ID1]);
  assert.deepEqual(r[1].chats, []);
  assert.equal(r[0].quando, 1700000000000);
});

test('montarMensagem acrescenta trailers e ignora ids inválidos ou trailer digitado à mão', () => {
  assert.equal(montarMensagem('Ajusta', [ID1, 'x', ID1]), `Ajusta\n\nTilo-Chat: ${ID1}\n`);
  assert.equal(montarMensagem('Ajusta\nTilo-Chat: falso'), 'Ajusta\n');
  assert.throws(() => montarMensagem('  '), /mensagem/);
});

test('ehSensivel recusa segredos', () => {
  for (const f of ['.env', 'cfg/.env.local', '.token', 'x/.ssh/id_rsa', 'chave.pem']) assert.equal(ehSensivel(f), true, f);
  for (const f of ['a.txt', 'docs/env.md', 'src/app.js']) assert.equal(ehSensivel(f), false, f);
});

test('vincularArquivos liga o arquivo às conversas que o editaram, a mais recente primeiro', () => {
  const raiz = path.resolve(os.tmpdir(), 'proj');
  const chats = [
    { id: ID1, title: 'A', messages: [{ tools: [{ nome: 'Edit', detalhe: path.join(raiz, 'a.txt'), ini: 10, estado: 'ok' }, { nome: 'Bash', detalhe: 'ls', ini: 11 }] }] },
    { id: ID2, title: 'B', messages: [{ tools: [{ nome: 'Write', detalhe: path.join(raiz, 'a.txt'), ini: 20, estado: 'ok' }, { nome: 'Edit', detalhe: path.join(raiz, 'b.txt'), ini: 21, estado: 'erro' }] }] },
  ];
  const r = vincularArquivos([{ caminho: 'a.txt' }, { caminho: 'b.txt' }], chats, raiz, ['Edit', 'Write']);
  assert.deepEqual(r[0].conversas.map((c) => c.id), [ID2, ID1]);
  assert.deepEqual(r[1].conversas, []); // edição com erro não conta
});

test('estado, diff e commit com trailer', { skip: !temGit }, async () => {
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'um\ndois\n');
  fs.writeFileSync(path.join(dir, 'novo.txt'), 'oi\n');
  fs.writeFileSync(path.join(dir, '.env'), 'SEGREDO=1\n');
  const e = await estado(dir);
  assert.equal(e.repo, true);
  assert.equal(e.branch, 'main');
  assert.equal(e.semRemoto, true);
  assert.deepEqual(e.arquivos.map((a) => a.caminho).sort(), ['.env', 'a.txt', 'novo.txt']);
  assert.match((await diff(dir, 'a.txt')).diff, /\+dois/);
  assert.match((await diff(dir, 'novo.txt')).diff, /\+oi/);
  await assert.rejects(diff(dir, '.env'), /segredos/);
  await assert.rejects(diff(dir, 'nao-existe.txt'), /não está entre/);
  await assert.rejects(commitar(dir, ['.env'], 'x'), /segurança/);
  await assert.rejects(commitar(dir, [], 'x'), /pelo menos um/);
  const r = await commitar(dir, ['a.txt'], 'Edita a', [ID1]);
  assert.equal(r.ok, true);
  assert.match(sh(dir, 'log', '-1', '--format=%B'), new RegExp(`Tilo-Chat: ${ID1}`));
  const depois = await estado(dir);
  assert.deepEqual(depois.arquivos.map((a) => a.caminho).sort(), ['.env', 'novo.txt']); // o resto ficou de fora
  await assert.rejects(enviar(dir), /remoto/);
});

test('commits não enviados, vínculo por trailer e push', { skip: !temGit }, async () => {
  const dir = repo();
  const remoto = tmp('bare');
  sh(remoto, 'init', '-q', '--bare', '-b', 'main');
  sh(dir, 'remote', 'add', 'origin', remoto);
  let e = await estado(dir);
  assert.equal(e.semUpstream, true);
  assert.equal(e.naoEnviados.length, 1); // o commit inicial ainda não foi enviado
  await enviar(dir);
  e = await estado(dir);
  assert.equal(e.upstream, 'origin/main');
  assert.equal(e.naoEnviados.length, 0);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  await commitar(dir, ['b.txt'], 'Cria b', [ID1, ID2]);
  e = await estado(dir);
  assert.equal(e.naoEnviados.length, 1);
  assert.deepEqual(e.naoEnviados[0].chats, [ID1, ID2]);
  assert.equal(e.naoEnviados[0].assunto, 'Cria b');
  assert.equal((await enviar(dir)).enviados, 1);
  assert.equal((await estado(dir)).naoEnviados.length, 0);
});

test('pasta que não é repositório', { skip: !temGit }, async () => {
  assert.deepEqual(await estado(tmp('vazio')), { repo: false });
});

test('listar, criar e trocar de branch (feature-*)', { skip: !temGit }, async () => {
  const dir = repo();
  assert.deepEqual((await estado(dir)).branches, ['main']);
  assert.deepEqual(await criarBranch(dir, 'feature-login'), { ok: true, branch: 'feature-login' });
  let e = await estado(dir);
  assert.equal(e.branch, 'feature-login');
  assert.deepEqual(e.branches, ['feature-login', 'main']);
  await assert.rejects(criarBranch(dir, 'feature-login'), /já existe/);
  for (const ruim of ['', '-x', 'a b', 'a..b', 'x.lock', 'a/', '--detach', 'a;rm']) await assert.rejects(criarBranch(dir, ruim), /inválido/, ruim);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'mudou\n'); // alteração não commitada acompanha a troca quando não há conflito
  assert.equal((await trocarBranch(dir, 'main')).mudou, true);
  e = await estado(dir);
  assert.equal(e.branch, 'main');
  assert.deepEqual(e.arquivos.map((a) => a.caminho), ['a.txt']);
  await assert.rejects(trocarBranch(dir, 'nao-existe'), /não existe/);
  assert.equal((await trocarBranch(dir, 'main')).mudou, false);
  assert.equal(await nomeBranchValido(dir, 'feature/ok-1.2'), 'feature/ok-1.2');
});
