// Git do Tilo: lê o estado do repositório do projeto (o que não foi commitado, o que não foi enviado) e faz commit/push a pedido do dono.
// Só roda o executável `git` com argumentos fixos (execFile, sem shell); nada digitado pelo usuário vira comando. Sem dependências.
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const TRAILER = 'Tilo-Chat';
export const MAX_DIFF = 500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// arquivos que nunca têm o conteúdo exibido (mesma ideia de /api/file): segredos e chaves
const SENSIVEL = /(^|[\\/])(\.env[^\\/]*|\.token|\.ssh|id_[^\\/]*|[^\\/]*\.(pem|key|pfx|p12))([\\/]|$)/i;
export const ehSensivel = (caminho) => SENSIVEL.test(String(caminho || ''));

function git(cwd, args, { input, ok = [0], timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    const p = execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, windowsHide: true, timeout, maxBuffer: 20_000_000, encoding: 'utf8', env }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      if (err && err.code === 'ENOENT') return reject(new Error('O git não foi encontrado neste computador.'));
      if (err && !ok.includes(code)) return reject(new Error(primeiraLinha(stderr) || err.message));
      resolve({ out: stdout, err: stderr, code });
    });
    if (input !== undefined) p.stdin.end(input); else p.stdin?.end();
  });
}
const primeiraLinha = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^hint:/i.test(l)) || '';

// raiz do repositório que contém a pasta do projeto (o projeto pode ser uma subpasta); null se não for um repositório git
export async function raizGit(pasta) {
  try { return (await git(pasta, ['rev-parse', '--show-toplevel'])).out.trim() || null; }
  catch (e) { if (/não foi encontrado/.test(e.message)) throw e; return null; }
}

const ROTULOS = { M: 'modificado', A: 'novo', D: 'apagado', R: 'renomeado', C: 'copiado', T: 'modificado', U: 'conflito', '?': 'novo' };
// interpreta `git status --porcelain=v1 -z`
export function lerStatus(saida) {
  const partes = String(saida).split('\0'), arquivos = [];
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (!p || p.length < 4) continue;
    const x = p[0], y = p[1], caminho = p.slice(3);
    let antigo = '';
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') antigo = partes[++i] || '';
    const novo = x === '?' && y === '?';
    arquivos.push({ caminho, antigo, rotulo: ROTULOS[novo ? '?' : (y !== ' ' ? y : x)] || 'modificado', naoRastreado: novo, preparado: !novo && x !== ' ' && x !== '?' });
  }
  return arquivos;
}

// interpreta o log de commits (campos separados por \x1f, registros por \x1e)
export function lerLog(saida) {
  return String(saida).split('\x1e').map((r) => r.replace(/^\s+/, '')).filter(Boolean).map((r) => {
    const [sha, curto, assunto, autor, quando, trailers] = r.split('\x1f');
    const chats = String(trailers || '').split(/[,\n]/).map((t) => t.trim()).filter((t) => UUID.test(t));
    return { sha, curto, assunto, autor, quando: Number(quando) * 1000, chats };
  });
}

async function upstream(raiz) {
  try { return (await git(raiz, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).out.trim() || null; } catch { return null; }
}
async function temCommit(raiz) { try { await git(raiz, ['rev-parse', '--verify', 'HEAD']); return true; } catch { return false; } }
const FORMATO_LOG = `%H%x1f%h%x1f%s%x1f%an%x1f%at%x1f%(trailers:key=${TRAILER},valueonly,separator=%x2c)%x1e`;

// Estado completo: branch, remoto, arquivos alterados e commits ainda não enviados.
export async function estado(pasta) {
  const raiz = await raizGit(pasta);
  if (!raiz) return { repo: false };
  const comCommit = await temCommit(raiz);
  const branch = comCommit ? (await git(raiz, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim() : (await git(raiz, ['symbolic-ref', '--short', 'HEAD'], { ok: [0, 128] })).out.trim();
  const arquivos = lerStatus((await git(raiz, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).out);
  const remotos = (await git(raiz, ['remote'])).out.split(/\r?\n/).filter(Boolean);
  const up = comCommit ? await upstream(raiz) : null;
  let naoEnviados = [], semRemoto = !remotos.length, semUpstream = false, atras = 0;
  if (comCommit && remotos.length) {
    if (up) {
      naoEnviados = lerLog((await git(raiz, ['log', `${up}..HEAD`, `--format=${FORMATO_LOG}`, '-n', '200'])).out);
      atras = Number((await git(raiz, ['rev-list', '--count', `HEAD..${up}`])).out.trim()) || 0;
    } else {
      semUpstream = true;
      naoEnviados = lerLog((await git(raiz, ['log', 'HEAD', '--not', '--remotes', `--format=${FORMATO_LOG}`, '-n', '200'])).out);
    }
  }
  return { repo: true, raiz, relativa: path.relative(raiz, pasta).split(path.sep).join('/'), branch, upstream: up, remotos, semRemoto, semUpstream, atras, arquivos, naoEnviados };
}

// Diff de um arquivo alterado (só arquivos que realmente aparecem no status; segredos são recusados).
export async function diff(pasta, caminho) {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  const a = e.arquivos.find((x) => x.caminho === caminho);
  if (!a) throw new Error('Esse arquivo não está entre as alterações.');
  if (ehSensivel(a.caminho)) throw new Error('O conteúdo deste arquivo não é exibido (pode ter segredos).');
  let texto;
  if (a.naoRastreado) {
    const nulo = os.platform() === 'win32' ? 'NUL' : '/dev/null';
    texto = (await git(e.raiz, ['diff', '--no-index', '--no-color', '--', nulo, a.caminho], { ok: [0, 1] })).out;
  } else if (await temCommit(e.raiz)) {
    texto = (await git(e.raiz, ['diff', 'HEAD', '--no-color', '--', a.caminho])).out;
  } else {
    texto = (await git(e.raiz, ['diff', '--cached', '--no-color', '--', a.caminho])).out;
  }
  const cortado = texto.length > MAX_DIFF;
  return { caminho: a.caminho, diff: cortado ? texto.slice(0, MAX_DIFF) : texto, cortado };
}

// Monta a mensagem com os vínculos (trailers) das conversas.
export function montarMensagem(mensagem, chatIds = []) {
  const limpa = String(mensagem || '').replace(/\r/g, '').split('\n').filter((l) => !new RegExp(`^${TRAILER}:`, 'i').test(l.trim())).join('\n').trim();
  if (!limpa) throw new Error('Escreva a mensagem do commit.');
  if (limpa.length > 4000) throw new Error('Mensagem longa demais (máximo 4000 caracteres).');
  const ids = [...new Set(chatIds.map(String))].filter((i) => UUID.test(i));
  return ids.length ? `${limpa}\n\n${ids.map((i) => `${TRAILER}: ${i}`).join('\n')}\n` : `${limpa}\n`;
}

// Commit só dos arquivos escolhidos (o que estiver preparado à parte fica de fora).
export async function commitar(pasta, caminhos, mensagem, chatIds = []) {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  if (!Array.isArray(caminhos) || !caminhos.length) throw new Error('Escolha pelo menos um arquivo.');
  const escolhidos = [];
  for (const c of new Set(caminhos.map(String))) {
    const a = e.arquivos.find((x) => x.caminho === c);
    if (!a) throw new Error(`Arquivo fora das alterações: ${c}`);
    if (ehSensivel(a.caminho) || (a.antigo && ehSensivel(a.antigo))) throw new Error(`Por segurança, ${c} não é commitado pelo Tilo (parece conter segredos).`);
    escolhidos.push(a.caminho); if (a.antigo) escolhidos.push(a.antigo);
  }
  const msg = montarMensagem(mensagem, chatIds);
  await git(e.raiz, ['add', '-A', '--', ...escolhidos]);
  await git(e.raiz, ['commit', '--only', '-F', '-', '--', ...escolhidos], { input: msg });
  const sha = (await git(e.raiz, ['rev-parse', '--short', 'HEAD'])).out.trim();
  return { ok: true, sha, arquivos: escolhidos.length };
}

// Envia ao GitHub (sem --force). Sem upstream, cria o vínculo com `origin`.
export async function enviar(pasta) {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  if (e.semRemoto) throw new Error('Este repositório não tem um remoto (GitHub) configurado.');
  if (!e.naoEnviados.length) throw new Error('Não há commits para enviar.');
  if (e.upstream) await git(e.raiz, ['push'], { timeout: 120_000 });
  else {
    const remoto = e.remotos.includes('origin') ? 'origin' : e.remotos[0];
    await git(e.raiz, ['push', '-u', remoto, 'HEAD'], { timeout: 120_000 });
  }
  return { ok: true, enviados: e.naoEnviados.length };
}

// Liga cada arquivo alterado às conversas que o editaram (Edit/Write registrados em chats.json).
// `chats`: lista de conversas; `raizGit`: raiz do repositório; `ferramentas`: nomes das ferramentas de edição.
export function vincularArquivos(arquivos, chats, raiz, ferramentas) {
  const chave = (f) => path.resolve(f).toLowerCase();
  const porArquivo = new Map();
  for (const c of chats) {
    for (const m of c.messages || []) {
      for (const t of m.tools || []) {
        if (!ferramentas.includes(t.nome) || t.estado === 'erro' || !t.detalhe || !path.isAbsolute(t.detalhe)) continue;
        const k = chave(t.detalhe);
        if (!porArquivo.has(k)) porArquivo.set(k, new Map());
        const mapa = porArquivo.get(k), ult = mapa.get(c.id);
        mapa.set(c.id, Math.max(ult || 0, t.ini || m.ts || 0));
      }
    }
  }
  const titulos = new Map(chats.map((c) => [c.id, c.title || 'Conversa']));
  return arquivos.map((a) => {
    const mapa = porArquivo.get(chave(path.join(raiz, a.caminho)));
    const conversas = mapa ? [...mapa].sort((x, y) => y[1] - x[1]).map(([id, quando]) => ({ id, titulo: titulos.get(id), quando })) : [];
    return { ...a, conversas };
  });
}

// uso em testes: existe o executável git?
export const gitDisponivel = () => git(os.tmpdir(), ['--version']).then(() => true, () => false);
