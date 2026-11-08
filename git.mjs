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
  const branches = comCommit ? (await git(raiz, ['for-each-ref', '--sort=refname', '--format=%(refname:short)', 'refs/heads'])).out.split(/\r?\n/).filter(Boolean) : [];
  const head = comCommit ? (await git(raiz, ['rev-parse', 'HEAD'])).out.trim() : '';
  const remotas = remotos.length ? (await git(raiz, ['for-each-ref', '--sort=refname', '--format=%(refname:short)', 'refs/remotes'])).out.split(/\r?\n/).filter((r) => r && !/\/HEAD$/.test(r) && remotos.some((o) => r.startsWith(o + '/'))) : [];
  return { repo: true, head, raiz, relativa: path.relative(raiz, pasta).split(path.sep).join('/'), branch, branches, remotas, upstream: up, remotos, semRemoto, semUpstream, atras, arquivos, naoEnviados };
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

// Nome de branch aceito: letras, números, . _ - / (ex.: feature-login, feature/login); sem "..", sem começar com "-", e válido para o git.
export async function nomeBranchValido(raiz, nome) {
  const n = String(nome || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,99}$/.test(n) || n.includes('..') || n.endsWith('/') || n.endsWith('.') || n.endsWith('.lock')) throw new Error('Nome de branch inválido. Use letras, números, ponto, hífen, sublinhado ou barra (ex.: feature-login).');
  try { await git(raiz, ['check-ref-format', '--branch', n]); } catch { throw new Error('Nome de branch inválido para o git.'); }
  return n;
}

// Troca para uma branch local existente. O git recusa se houver alterações que conflitam; as demais acompanham você.
export async function trocarBranch(pasta, nome) {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  if (!e.branches.includes(String(nome))) throw new Error('Essa branch não existe neste repositório.');
  if (nome === e.branch) return { ok: true, branch: nome, mudou: false };
  await git(e.raiz, ['switch', '--', String(nome)]);
  return { ok: true, branch: nome, mudou: true };
}

// Cria uma branch nova a partir do ponto atual e já troca para ela. Alterações não commitadas vão junto.
// `base` (opcional): outra branch local ou remota (ex.: develop, origin/develop) para partir dela; vazio = ponto atual.
export async function criarBranch(pasta, nome, base = '') {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  if (!e.branches.length) throw new Error('Faça o primeiro commit antes de criar branches.');
  const n = await nomeBranchValido(e.raiz, nome);
  if (e.branches.includes(n)) throw new Error(`A branch “${n}” já existe.`);
  const b = String(base || '');
  if (b && !e.branches.includes(b) && !e.remotas.includes(b)) throw new Error('A branch de origem não existe neste repositório.');
  await git(e.raiz, b && b !== e.branch ? ['switch', '-c', n, '--no-track', b] : ['switch', '-c', n]);
  return { ok: true, branch: n };
}

// ---------- histórico ----------
const SHA = /^[0-9a-f]{7,40}$/;
async function shaValido(raiz, sha) {
  if (!SHA.test(String(sha))) throw new Error('Commit inválido.');
  try { return (await git(raiz, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])).out.trim(); } catch { throw new Error('Esse commit não existe neste repositório.'); }
}
// `git show --name-status -z`: "M NUL caminho NUL" e, para renomeados, "R100 NUL antigo NUL novo NUL"
export function lerArquivosDoCommit(saida) {
  const t = String(saida).split(' ').filter((x, i, a) => !(i === a.length - 1 && x === '')), arquivos = [];
  for (let i = 0; i < t.length; i++) {
    const cod = t[i][0];
    if (cod === 'R' || cod === 'C') { arquivos.push({ caminho: t[i + 2], antigo: t[i + 1], rotulo: ROTULOS[cod] }); i += 2; }
    else { arquivos.push({ caminho: t[i + 1], antigo: '', rotulo: ROTULOS[cod] || 'modificado' }); i += 1; }
  }
  return arquivos.filter((a) => a.caminho);
}
// Commits da branch atual, do mais novo ao mais antigo, em páginas. `enviado`: algum remoto já tem o commit (null se não há remoto).
export async function historico(pasta, { limite = 20, pular = 0 } = {}) {
  const raiz = await raizGit(pasta);
  if (!raiz) return { repo: false };
  if (!(await temCommit(raiz))) return { repo: true, commits: [], mais: false, total: 0 };
  const n = Math.min(Math.max(Number(limite) || 20, 1), 100), sk = Math.max(Number(pular) || 0, 0);
  const lista = lerLog((await git(raiz, ['log', 'HEAD', `--format=${FORMATO_LOG}`, '-n', String(n + 1), '--skip', String(sk)])).out);
  const temRemoto = (await git(raiz, ['remote'])).out.trim().length > 0;
  const naoEnv = temRemoto ? new Set((await git(raiz, ['log', 'HEAD', '--not', '--remotes', '--format=%H'])).out.split(/\r?\n/).filter(Boolean)) : null;
  const commits = lista.slice(0, n).map((c) => ({ ...c, enviado: naoEnv ? !naoEnv.has(c.sha) : null }));
  const total = Number((await git(raiz, ['rev-list', '--count', 'HEAD'])).out.trim()) || 0;
  return { repo: true, commits, mais: lista.length > n, total };
}
// Arquivos de um commit.
export async function arquivosDoCommit(pasta, sha) {
  const raiz = await raizGit(pasta);
  if (!raiz) throw new Error('Esta pasta não é um repositório git.');
  const completo = await shaValido(raiz, sha);
  const arquivos = lerArquivosDoCommit((await git(raiz, ['show', '--name-status', '-z', '-M', '--format=', completo])).out);
  return { sha: completo, arquivos: arquivos.map((a) => ({ ...a, sensivel: ehSensivel(a.caminho) || ehSensivel(a.antigo) })) };
}
// Diff de um arquivo dentro de um commit (só arquivos que o commit realmente alterou; segredos recusados).
export async function diffDoCommit(pasta, sha, caminho) {
  const { sha: completo, arquivos } = await arquivosDoCommit(pasta, sha);
  const a = arquivos.find((x) => x.caminho === caminho);
  if (!a) throw new Error('Esse arquivo não faz parte do commit.');
  if (a.sensivel) throw new Error('O conteúdo deste arquivo não é exibido (pode ter segredos).');
  const raiz = await raizGit(pasta);
  const texto = (await git(raiz, ['show', '--no-color', '--format=', '-M', completo, '--', a.caminho])).out;
  const cortado = texto.length > MAX_DIFF;
  return { caminho: a.caminho, diff: cortado ? texto.slice(0, MAX_DIFF) : texto, cortado };
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

// Pull: baixa o remoto e junta (merge) a branch remota escolhida na branch atual (ex.: origin/develop). Nunca reescreve histórico.
// `remota` precisa ser uma branch remota conhecida (ex.: "origin/develop"). Em conflito, o merge é desfeito e nada muda.
export async function puxar(pasta, remota) {
  const e = await estado(pasta);
  if (!e.repo) throw new Error('Esta pasta não é um repositório git.');
  if (e.semRemoto) throw new Error('Este repositório não tem um remoto (GitHub) configurado.');
  if (!e.branches.length) throw new Error('Faça o primeiro commit antes de puxar.');
  const alvo = String(remota || e.upstream || '');
  const remoto = e.remotos.find((o) => alvo.startsWith(o + '/'));
  if (!remoto) throw new Error('Escolha de qual branch puxar.');
  await git(e.raiz, ['fetch', '--prune', remoto], { timeout: 120_000 });
  const depois = (await git(e.raiz, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'])).out.split(/\r?\n/);
  if (!depois.includes(alvo) || /\/HEAD$/.test(alvo)) throw new Error(`A branch ${alvo} não existe no GitHub.`);
  const antes = (await git(e.raiz, ['rev-parse', 'HEAD'])).out.trim();
  try { await git(e.raiz, ['merge', '--no-edit', alvo], { timeout: 120_000 }); }
  catch (err) {
    await git(e.raiz, ['merge', '--abort'], { ok: [0, 128] }).catch(() => {});
    throw new Error(`Não foi possível juntar ${alvo}: ${err.message} O merge foi desfeito e nada mudou. Resolva no terminal.`);
  }
  const novo = (await git(e.raiz, ['rev-parse', 'HEAD'])).out.trim();
  const commits = novo === antes ? 0 : Number((await git(e.raiz, ['rev-list', '--count', `${antes}..${novo}`])).out.trim()) || 0;
  return { ok: true, remota: alvo, atualizou: novo !== antes, commits };
}

// Instante (ms) do último commit que tocou cada arquivo rastreado; arquivos novos (nunca commitados) ficam de fora.
export async function ultimoCommitPorArquivo(raiz, caminhos) {
  const mapa = new Map();
  await Promise.all(caminhos.slice(0, 200).map(async (c) => {
    try { const t = Number((await git(raiz, ['log', '-1', '--format=%ct', '--', c])).out.trim()); if (t) mapa.set(c, t * 1000 + 999); } catch {}
  }));
  return mapa;
}

// Liga cada arquivo alterado às conversas que o editaram (Edit/Write registrados em chats.json).
// `chats`: lista de conversas; `raizGit`: raiz do repositório; `ferramentas`: nomes das ferramentas de edição.
// `desde` (opcional): Map caminho-relativo -> instante (ms) do último commit que tocou o arquivo; edições feitas antes disso já foram commitadas e não contam.
export function vincularArquivos(arquivos, chats, raiz, ferramentas, desde = new Map()) {
  const chave = (f) => path.resolve(f).toLowerCase();
  const limite = new Map(arquivos.filter((a) => desde.get(a.caminho)).map((a) => [chave(path.join(raiz, a.caminho)), desde.get(a.caminho)]));
  const porArquivo = new Map();
  for (const c of chats) {
    for (const m of c.messages || []) {
      for (const t of m.tools || []) {
        if (!ferramentas.includes(t.nome) || t.estado === 'erro' || !t.detalhe || !path.isAbsolute(t.detalhe)) continue;
        const k = chave(t.detalhe), quando = t.ini || m.ts || 0;
        if (quando && limite.has(k) && quando <= limite.get(k)) continue;
        if (!porArquivo.has(k)) porArquivo.set(k, new Map());
        const mapa = porArquivo.get(k), ult = mapa.get(c.id);
        mapa.set(c.id, Math.max(ult || 0, quando));
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
