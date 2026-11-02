// Central de Projetos: servidor local, sem dependências. Um seletor de projetos (estilo console) + o painel de cada projeto
// (pendências, sessões do Claude Code, conversas com aprovação de comandos). Escuta só em 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { avaliar } from './politica.mjs';
import * as projetos from './projetos.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const als = new AsyncLocalStorage(); // projeto da requisição em curso
const P = () => als.getStore(); // { ROOT, README, STATE, CHATS, META, AUDIT, READABLE_DIRS, TERM_DIR, ... }
const HOST = process.env.CENTRAL_BIND || '127.0.0.1';
const ORIGIN_HOSTS = ['127.0.0.1', 'localhost'];
const PORT = Number(process.env.CENTRAL_PORT || 4777);
const PUBLIC_PORT = Number(process.env.CENTRAL_PUBLIC_PORT || PORT);
const TOKEN_FILE = path.join(HERE, '.token'); // persistente (gitignored): o cookie continua valendo após reiniciar
const TOKEN = (() => {
  try { const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); if (/^[0-9a-f]{48}$/.test(t)) return t; } catch {}
  const t = crypto.randomBytes(24).toString('hex');
  try { fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 }); } catch {}
  return t;
})();
const MAX_BODY = 200_000;
const MODELS = ['sonnet', 'opus', 'haiku'];
const DEFAULT_MODEL = 'sonnet'; // padrão do painel (explícito, sempre enviado ao claude)

// ---------- parser do README ----------
const PRIO = { '🔴': 'alta', '🟡': 'media', '🟢': 'baixa' };
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
const paths = (s) => [...s.matchAll(/`([^`\s]+\.(?:md|cs|ts|py|yml|yaml|json|sql|ps1|conf))`/g)].map((m) => m[1]);

function parse() {
  const lines = fs.readFileSync(P().README, 'utf8').split(/\r?\n/);
  const sections = [];
  let sec = null;
  let group = '';
  const seen = new Map();
  const push = (i, prio, title, desc, how, raw) => {
    if (!sec) return;
    let id = crypto.createHash('sha1').update(sec.title + '|' + title).digest('hex').slice(0, 10);
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id += n;
    sec.items.push({ id, line: i, raw, prio, title, desc, how, group, refs: paths(raw), section: sec.title });
  };
  lines.forEach((line, i) => {
    let m = line.match(/^## (\d+)\.\s+(.*)/);
    if (m) { sec = { n: Number(m[1]), title: m[2].trim(), items: [] }; sections.push(sec); group = ''; return; }
    if (/^## /.test(line)) { sec = null; return; }
    if (!sec) return;
    m = line.match(/^### (.*)/);
    if (m) { group = m[1].trim(); return; }
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const prio = PRIO[cells[0]];
      if (!prio || cells.length < 3) return;
      push(i, prio, clean(cells[1]), cells[2], cells[3] && cells[3] !== '—' ? cells[3] : '', line);
      return;
    }
    m = line.match(/^- (🔴|🟡|🟢)\s+(.*)/);
    if (m) {
      const b = m[2].match(/^\*\*(.+?)\*\*\s*(?:[—:-]\s*)?(.*)/);
      if (b) push(i, PRIO[m[1]], clean(b[1]), b[2], '', line);
      else push(i, PRIO[m[1]], clean(m[2]).slice(0, 80) + (m[2].length > 80 ? '…' : ''), m[2], '', line);
    }
  });
  return sections;
}

// ---------- JSON local ----------
const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));

// ---------- docs / planning vivos ----------
const LIVE_DIRS = ['docs', 'planning', 'pendencias'];
function listDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.md')) out.push({ path: path.relative(P().ROOT, abs).split(path.sep).join('/'), mtime: Math.floor(fs.statSync(abs).mtimeMs) });
    }
  };
  for (const d of LIVE_DIRS) { try { walk(path.join(P().ROOT, d)); } catch {} }
  return out;
}

// ---------- sessões do terminal (leitura dos transcripts do Claude Code) ----------
const sessCache = new Map(); // arquivo -> {key, info}
function readSlice(fd, size, pos, len) {
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, pos);
  return buf.toString('utf8');
}
function jsonLines(txt, dropFirst, dropLast) {
  const ls = txt.split('\n');
  if (dropFirst) ls.shift();
  if (dropLast) ls.pop();
  const out = [];
  for (const l of ls) { if (l.startsWith('{')) { try { out.push(JSON.parse(l)); } catch {} } }
  return out;
}
function userText(content) {
  let t = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
  t = t.trim();
  if (!t) return '';
  const cmd = t.match(/<command-name>(.*?)<\/command-name>/s);
  if (cmd) {
    const args = (t.match(/<command-args>(.*?)<\/command-args>/s) || [, ''])[1].trim();
    return `${cmd[1].trim()} ${args}`.trim();
  }
  if (/^<(system-reminder|local-command|command-|bash-|task-notification)/.test(t) || /^Caveat:/.test(t) || /^This session is being continued/.test(t)) return '';
  return t.replace(/<\/?pasted_content[^>]*>/g, '').trim();
}
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function sessionInfo(file) {
  const st = fs.statSync(file);
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = sessCache.get(file);
  if (hit && hit.key === key) return hit.info;
  const fd = fs.openSync(file, 'r');
  let head = [], tail = [];
  try {
    const H = Math.min(st.size, 200_000), T = Math.min(st.size, 400_000);
    head = jsonLines(readSlice(fd, st.size, 0, H), false, st.size > H);
    tail = st.size > T ? jsonLines(readSlice(fd, st.size, st.size - T, T), true, false) : head;
  } finally { fs.closeSync(fd); }
  const info = { id: path.basename(file, '.jsonl'), mtime: Math.floor(st.mtimeMs), title: '', primeiro: '', ultimo: '', resposta: '', model: '', mode: '' };
  for (const e of [...head, ...tail]) if (e.type === 'ai-title' && e.aiTitle) info.title = e.aiTitle;
  for (const e of head) {
    if (e.type === 'user' && !e.isMeta) { const t = userText(e.message?.content); if (t) { info.primeiro = short(t, 160); break; } }
  }
  for (const e of tail) {
    if (e.type === 'permission-mode' && e.permissionMode) info.mode = e.permissionMode;
    if (e.type === 'user' && !e.isMeta) { const t = userText(e.message?.content); if (t) info.ultimo = short(t, 220); }
    if (e.type === 'assistant' && e.message) {
      if (e.message.model && !String(e.message.model).startsWith('<')) info.model = e.message.model;
      const t = (e.message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (t) info.resposta = short(t, 260);
    }
  }
  sessCache.set(file, { key, info });
  return info;
}
function transcript(id) { // histórico somente leitura de uma sessão do terminal
  const file = path.join(P().TERM_DIR, id + '.jsonl');
  if (!fs.existsSync(file) || fs.statSync(file).size > 60_000_000) return null;
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'user' && !e.isMeta) { const t = userText(e.message?.content); if (t) out.push({ role: 'user', text: short(t, 4000) }); }
    else if (e.type === 'assistant' && e.message) {
      const t = (e.message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (t) out.push({ role: 'assistant', text: short(t, 4000), model: e.message.model || '' });
    }
  }
  return out.slice(-60);
}
function terminalSessions() {
  let files = [];
  try { files = fs.readdirSync(P().TERM_DIR).filter((f) => f.endsWith('.jsonl')); } catch { return []; }
  const chatIds = new Set(Object.keys(readJson(P().CHATS, { chats: {} }).chats));
  const meta = readJson(P().META, {});
  const lim = Date.now() - 7 * 86400_000;
  const out = [];
  for (const f of files) {
    const abs = path.join(P().TERM_DIR, f);
    try {
      if (fs.statSync(abs).mtimeMs < lim || chatIds.has(path.basename(f, '.jsonl'))) continue;
      const i = sessionInfo(abs);
      out.push({ ...i, ...(meta[i.id] || {}) });
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

// ---------- conversas do painel (servidor é dono; sobrevivem a reload) ----------
const jobs = new Map(); // chatId -> { buf, done, child }
const SYSTEM = [
  'Você está ajudando o DONO do projeto a gerenciar as pendências dele (painel em pendencias/README.md), dentro da Central de Projetos.',
  'Responda em português, linguagem simples e explicativa, sem jargão desnecessário.',
  'Antes de afirmar algo sobre o sistema, confirme no código ou em docs/ (fonte de verdade). planning/ e pendencias/ não são fonte de verdade.',
  'Siga o CLAUDE.md do repositório. Se for pedido para concluir uma pendência, lembre de atualizar pendencias/README.md.',
].join(' ');
const SETTINGS_FILE = path.join(HERE, 'claude-settings.json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------- aprovações de comandos (o Claude pede; o dono decide na UI) ----------
const APPROVAL_TIMEOUT = 5 * 60_000;
const approvals = new Map(); // id -> { id, chatId, tool, resumo, risco, motivo, criado, resolve, timer }
function audit(proj, o) { try { fs.appendFileSync(proj.AUDIT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n'); } catch {} } // dados/<projeto>/auditoria.jsonl
const autoSessao = new Set(); // chats com "aprovar todos da sessão" (só em memória; some ao reiniciar o servidor). Produção e política 'negar' nunca entram.
const pendingOf = (chatId) => [...approvals.values()].filter((a) => a.chatId === chatId);
const approvalView = (a) => ({ id: a.id, tool: a.tool, resumo: a.resumo, risco: a.risco, motivo: a.motivo, criado: a.criado });
function settle(a, behavior, message, quem) {
  if (!approvals.delete(a.id)) return;
  clearTimeout(a.timer);
  audit(a.proj, { chat: a.chatId, tool: a.tool, resumo: a.resumo, risco: a.risco, decisao: behavior, quem, motivo: message || '' });
  a.resolve(behavior === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: message || 'Negado pelo dono.' });
}
function denyAll(chatId, message) { for (const a of pendingOf(chatId)) settle(a, 'deny', message, 'sistema'); }
function askApproval(chatId, tool, input, v, signal) {
  return new Promise((resolve) => {
    const a = { id: crypto.randomUUID(), proj: P(), chatId, tool, resumo: v.resumo.slice(0, 4000), risco: v.risco, motivo: v.motivo, criado: Date.now(), resolve };
    a.timer = setTimeout(() => settle(a, 'deny', 'Sem resposta em 5 minutos; negado.', 'timeout'), APPROVAL_TIMEOUT);
    approvals.set(a.id, a);
    signal?.addEventListener('abort', () => settle(a, 'deny', 'Pedido cancelado.', 'sistema'));
  });
}

const loadChats = () => readJson(P().CHATS, { chats: {} });
function saveChat(c) { const d = loadChats(); d.chats[c.id] = c; writeJson(P().CHATS, d); }
function chatView(c) { return { ...c, model: MODELS.includes(c.model) ? c.model : DEFAULT_MODEL, running: !!jobs.get(c.id) && !jobs.get(c.id).done, pendentes: pendingOf(c.id).length, autoAprovar: autoSessao.has(c.id) }; }

function startJob(chat, text) {
  const proj = P();
  const first = !chat.started;
  let prompt = text;
  if (first && chat.contexto) prompt = `Pendência em foco:\n${chat.contexto}\n\nPergunta do dono do projeto:\n${text}`;
  const canEdit = chat.edit && !chat.plan, canExec = chat.exec && !chat.plan;
  const tools = canEdit ? 'Read,Grep,Glob,Edit,Write' : 'Read,Grep,Glob';
  // Tudo que não está em --allowedTools cai no aprovador (UI + política). Ferramentas desligadas são bloqueadas de vez.
  const bloqueadas = [...(canEdit ? [] : ['Edit', 'Write']), ...(canExec ? [] : ['Bash', 'PowerShell'])];
  const mcpCfg = path.join(os.tmpdir(), `central-mcp-${chat.id}.json`);
  fs.writeFileSync(mcpCfg, JSON.stringify({ mcpServers: { central: { command: process.execPath, args: [path.join(HERE, 'aprovador-mcp.mjs')], env: { CENTRAL_CHAT_ID: chat.id, CENTRAL_PROJECT: proj.id, CENTRAL_PORT: String(PORT) } } } }));
  const args = ['-p', '--output-format', 'text', '--allowedTools', tools, '--setting-sources', 'project', '--settings', SETTINGS_FILE,
    '--mcp-config', mcpCfg, '--strict-mcp-config', '--permission-prompt-tool', 'mcp__central__approve', '--append-system-prompt', JSON.stringify(SYSTEM)];
  if (bloqueadas.length) args.push('--disallowedTools', bloqueadas.join(','));
  if (chat.plan) args.push('--permission-mode', 'plan');
  args.push('--model', MODELS.includes(chat.model) ? chat.model : DEFAULT_MODEL); // validado contra MODELS
  args.push(first ? '--session-id' : '--resume', chat.id);
  // shell:true porque no Windows `claude` é .cmd. Nenhum texto livre do usuário vai em args (vai por stdin).
  // Chaves de API vazias de propósito: nunca usar API paga, só a assinatura (login do Claude Code).
  const child = spawn('claude', args, { cwd: proj.ROOT, shell: true, windowsHide: true, env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' } });
  const job = { buf: '', done: false, child, err: '' };
  jobs.set(chat.id, job);
  child.stdout.on('data', (d) => { job.buf += d; });
  child.stderr.on('data', (d) => { job.err += d; });
  const finish = (code, msg) => als.run(proj, () => {
    if (job.done) return;
    job.done = true;
    denyAll(chat.id, 'Conversa encerrada.');
    try { fs.unlinkSync(mcpCfg); } catch {}
    if (code || msg) job.buf += `\n[${msg || `claude saiu com código ${code}`}]\n${job.err.trim()}`;
    const c = loadChats().chats[chat.id];
    if (c) {
      if (!code && !msg) c.started = true;
      c.messages.push({ role: 'assistant', text: job.buf.trim() || '(sem resposta)', ts: Date.now(), model: MODELS.includes(chat.model) ? chat.model : DEFAULT_MODEL, plan: !!chat.plan, erro: !!(code || msg) });
      c.updated = Date.now();
      saveChat(c);
    }
  });
  child.on('error', (e) => finish(1, `erro ao iniciar claude: ${e.message}`));
  child.on('close', (code) => finish(code));
  child.stdin.end(prompt);
}

// ---------- http util ----------
function send(res, code, body, type = 'application/json; charset=utf-8', nonce = '') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'self'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'`,
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('corpo grande demais')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const hostOk = (req) => ORIGIN_HOSTS.some((n) => (req.headers.host || '').toLowerCase() === `${n}:${PUBLIC_PORT}`);
const originOk = (req) => !req.headers.origin || ORIGIN_HOSTS.some((n) => req.headers.origin === `http://${n}:${PUBLIC_PORT}`);
function cookieToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)central_t=([0-9a-f]+)/);
  return m ? m[1] : null;
}
function tokenOk(req, url) {
  const t = req.headers['x-painel-token'] || url.searchParams.get('t') || cookieToken(req);
  if (typeof t !== 'string' || t.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}
const str = (v, n) => String(v ?? '').slice(0, n);

// ---------- rotas ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const m = url.pathname.match(/^\/api\/p\/([a-z0-9-]+)(\/.*)$/); // /api/p/<projeto>/x -> /api/x com o contexto do projeto
  if (!m) return core(req, res, url);
  if (!hostOk(req) || !originOk(req)) return send(res, 403, { erro: 'host/origin não permitido' });
  const proj = projetos.obter(m[1]);
  if (!proj) return send(res, 404, { erro: 'projeto não encontrado' });
  url.pathname = '/api' + m[2];
  return als.run(proj, () => core(req, res, url));
});
const MIME_ASSET = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const projetoView = (p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, cor: p.cor, logo: `/logo/${p.id}`, logoLargo: `/logo/${p.id}?tipo=largo` });
function pagina(res, arquivo, subs, nonce) {
  let html = fs.readFileSync(path.join(HERE, arquivo), 'utf8');
  for (const [k, v] of Object.entries(subs)) html = html.split(k).join(v);
  return send(res, 200, html, 'text/html; charset=utf-8', nonce);
}
async function core(req, res, url) {
  try {
    if (!hostOk(req) || !originOk(req)) return send(res, 403, { erro: 'host/origin não permitido' });

    const pm = url.pathname.match(/^\/p\/([a-z0-9-]+)\/?$/); // painel de um projeto
    if (req.method === 'GET' && pm) {
      if (!tokenOk(req, url)) return send(res, 403, 'Abra a Central pelo atalho (ou pelo link com token) uma vez; depois o cookie basta.', 'text/plain; charset=utf-8');
      if (url.searchParams.get('t')) { // atalho por projeto: grava o cookie e limpa o token da URL
        res.writeHead(302, { Location: url.pathname, 'Set-Cookie': `central_t=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      const proj = projetos.obter(pm[1]);
      if (!proj) return send(res, 404, { erro: 'projeto não encontrado' });
      const nonce = crypto.randomBytes(16).toString('base64');
      const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      return pagina(res, 'index.html', { __NONCE__: nonce, __PROJ__: proj.id, __NOME__: esc(proj.nome), __COR__: proj.cor }, nonce);
    }
    const lg = url.pathname.match(/^\/logo\/([a-z0-9-]+)$/);
    if (req.method === 'GET' && lg) {
      if (!tokenOk(req, url)) return send(res, 401, { erro: 'token inválido' });
      const proj = projetos.obter(lg[1]);
      if (!proj) return send(res, 404, { erro: 'projeto não encontrado' });
      const l = projetos.logoDe(proj, url.searchParams.get('tipo') === 'largo');
      return send(res, 200, l.body, l.type);
    }

    if (req.method === 'GET' && url.pathname === '/') {
      if (!tokenOk(req, url)) return send(res, 403, 'Abra a Central pelo atalho (ou pelo link com token) uma vez; depois o cookie basta.', 'text/plain; charset=utf-8');
      if (url.searchParams.get('t')) { // grava cookie (Strict, HttpOnly) e tira o token da URL
        res.writeHead(302, { Location: '/', 'Set-Cookie': `central_t=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      const nonce = crypto.randomBytes(16).toString('base64');
      return pagina(res, 'inicio.html', { __NONCE__: nonce }, nonce);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) { // estáticos (css/js/fontes/logos); exige cookie
      if (!tokenOk(req, url)) return send(res, 401, { erro: 'token inválido' });
      const base = path.join(HERE, 'assets');
      const abs = path.resolve(base, '.' + decodeURIComponent(url.pathname.slice('/assets'.length)));
      const type = MIME_ASSET[path.extname(abs)];
      if (!abs.startsWith(base + path.sep) || !type || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return send(res, 404, { erro: 'não encontrado' });
      return send(res, 200, fs.readFileSync(abs), type);
    }
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { erro: 'não encontrado' });
    if (!tokenOk(req, url)) return send(res, 401, { erro: 'token inválido' });

    if (req.method === 'GET') {
      switch (url.pathname) {
        case '/api/projetos': return send(res, 200, { projetos: projetos.listar().map(projetoView) });
        case '/api/pendencias': return send(res, 200, { sections: parse(), state: readJson(P().STATE, { items: {} }) });
        case '/api/versao': {
          const f = listDocs();
          const sig = crypto.createHash('sha1').update(f.map((x) => x.path + x.mtime).join('|')).digest('hex').slice(0, 12);
          return send(res, 200, { sig });
        }
        case '/api/arquivos': return send(res, 200, { files: listDocs().sort((a, b) => b.mtime - a.mtime).slice(0, 500) });
        case '/api/sessao': {
          const id = url.searchParams.get('id') || '';
          if (!UUID.test(id)) return send(res, 400, { erro: 'id' });
          const msgs = transcript(id);
          return msgs ? send(res, 200, { messages: msgs }) : send(res, 404, { erro: 'sessão não encontrada' });
        }
        case '/api/sessoes': return send(res, 200, { terminal: terminalSessions(), now: Date.now() });
        case '/api/chats': {
          const list = Object.values(loadChats().chats).sort((a, b) => b.updated - a.updated).map(chatView);
          return send(res, 200, { chats: list });
        }
        case '/api/chat/stream': {
          const id = url.searchParams.get('id') || '';
          const j = jobs.get(id);
          return send(res, 200, j ? { text: j.buf, done: j.done, pendentes: pendingOf(id).map(approvalView) } : { text: '', done: true, pendentes: [] });
        }
        case '/api/file': {
          const rel = url.searchParams.get('p') || '';
          const abs = path.resolve(P().ROOT, rel);
          const top = path.relative(P().ROOT, abs).split(path.sep)[0];
          if (!abs.startsWith(P().ROOT + path.sep) || !P().READABLE_DIRS.includes(top) || /(^|[\\/])\.env/.test(abs)) return send(res, 403, { erro: 'caminho não permitido' });
          if (!fs.existsSync(abs) || !fs.statSync(abs).isFile() || fs.statSync(abs).size > 500_000) return send(res, 404, { erro: 'arquivo não encontrado ou grande demais' });
          return send(res, 200, { path: rel, content: fs.readFileSync(abs, 'utf8') });
        }
        default: return send(res, 404, { erro: 'não encontrado' });
      }
    }
    if (req.method !== 'POST') return send(res, 405, { erro: 'método' });
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { erro: 'use JSON' });
    const body = await readBody(req);

    switch (url.pathname) {
      case '/api/projetos': { // cadastrar projeto (opcionalmente cria a estrutura base padrão Datadubis, sem sobrescrever nada)
        try { const r = projetos.adicionar({ nome: body.nome, raiz: body.raiz, cor: body.cor, estruturaBase: body.estruturaBase === true }); return send(res, 200, r); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/estado': {
        const { id, status, nota } = body;
        if (typeof id !== 'string' || !/^[0-9a-f]{10,12}$/.test(id)) return send(res, 400, { erro: 'id' });
        if (!['aberto', 'andamento', 'feito', 'ignorado'].includes(status)) return send(res, 400, { erro: 'status' });
        const s = readJson(P().STATE, { items: {} });
        s.items[id] = { status, nota: str(nota, 2000), em: new Date().toISOString() };
        writeJson(P().STATE, s);
        return send(res, 200, { ok: true });
      }
      case '/api/remover': { // concluído = apagar a linha do README; confere o conteúdo antes
        const { line, raw } = body;
        const lines = fs.readFileSync(P().README, 'utf8').split('\n');
        if (!Number.isInteger(line) || (lines[line] || '').replace(/\r$/, '') !== raw) return send(res, 409, { erro: 'o README mudou; recarregue' });
        lines.splice(line, 1);
        fs.writeFileSync(P().README, lines.join('\n'));
        return send(res, 200, { ok: true });
      }
      case '/api/sessoes/meta': { // apelido / vínculo com pendência / ocultar (sessões do terminal)
        const { id, apelido, itemId, oculto } = body;
        if (typeof id !== 'string' || !UUID.test(id)) return send(res, 400, { erro: 'id' });
        const m = readJson(P().META, {});
        m[id] = { ...(m[id] || {}), ...(apelido !== undefined && { apelido: str(apelido, 80) }), ...(itemId !== undefined && { itemId: str(itemId, 12) }), ...(oculto !== undefined && { oculto: !!oculto }) };
        writeJson(P().META, m);
        return send(res, 200, { ok: true });
      }
      case '/api/chat/novo': {
        const id = crypto.randomUUID();
        const c = {
          id, title: str(body.title, 80) || 'Nova conversa', itemId: str(body.itemId, 12), contexto: str(body.contexto, 4000),
          model: MODELS.includes(body.model) ? body.model : DEFAULT_MODEL, plan: !!body.plan, edit: false, exec: false, started: false,
          created: Date.now(), updated: Date.now(), messages: [],
        };
        saveChat(c);
        return send(res, 200, chatView(c));
      }
      case '/api/chat/config': { // /model, /plan, edição, título
        const c = loadChats().chats[body.id];
        if (!c) return send(res, 404, { erro: 'conversa' });
        if (body.model !== undefined) { if (!MODELS.includes(body.model)) return send(res, 400, { erro: 'modelo' }); c.model = body.model; }
        if (body.plan !== undefined) c.plan = !!body.plan;
        if (body.edit !== undefined) c.edit = !!body.edit;
        if (body.exec !== undefined) { c.exec = !!body.exec; if (!c.exec) autoSessao.delete(c.id); }
        if (body.title !== undefined) c.title = str(body.title, 80) || c.title;
        c.updated = Date.now();
        saveChat(c);
        return send(res, 200, chatView(c));
      }
      case '/api/chat/enviar': {
        const c = loadChats().chats[body.id];
        const text = str(body.text, 20_000).trim();
        if (!c || !text) return send(res, 400, { erro: 'conversa/texto' });
        if (jobs.get(c.id) && !jobs.get(c.id).done) return send(res, 409, { erro: 'esta conversa já está respondendo' });
        c.messages.push({ role: 'user', text, ts: Date.now(), model: MODELS.includes(c.model) ? c.model : DEFAULT_MODEL, plan: c.plan });
        c.updated = Date.now();
        saveChat(c);
        startJob(c, text);
        return send(res, 200, chatView(c));
      }
      case '/api/aprovacao/pedir': { // chamado pelo aprovador-mcp.mjs (processo filho do claude)
        const chatId = String(body.chatId || '');
        const job = jobs.get(chatId);
        if (!UUID.test(chatId) || !job || job.done || !loadChats().chats[chatId]) return send(res, 409, { erro: 'conversa não está em execução' });
        const tool = str(body.tool_name, 80), input = body.input && typeof body.input === 'object' ? body.input : {};
        const v = avaliar(tool, input);
        if (v.acao !== 'perguntar') {
          audit(P(), { chat: chatId, tool, resumo: v.resumo.slice(0, 4000), risco: v.risco, decisao: v.acao === 'permitir' ? 'allow' : 'deny', quem: 'política', motivo: v.motivo });
          return send(res, 200, v.acao === 'permitir' ? { behavior: 'allow' } : { behavior: 'deny', message: `Bloqueado pela política do painel: ${v.motivo}. Peça ao dono para rodar manualmente, se for legítimo.` });
        }
        if (v.risco === 'normal' && autoSessao.has(chatId)) {
          audit(P(), { chat: chatId, tool, resumo: v.resumo.slice(0, 4000), risco: v.risco, decisao: 'allow', quem: 'sessão', motivo: 'aprovar todos da sessão' });
          return send(res, 200, { behavior: 'allow' });
        }
        const ac = new AbortController();
        req.on('close', () => { if (!res.writableEnded) ac.abort(); });
        return send(res, 200, await askApproval(chatId, tool, input, v, ac.signal));
      }
      case '/api/aprovacao/decidir': {
        const a = approvals.get(String(body.id));
        if (!a) return send(res, 404, { erro: 'pedido não existe mais (expirou ou foi cancelado)' });
        const sessao = body.permitir === true && body.sessao === true && a.risco === 'normal'; // produção nunca vira automático
        if (sessao) autoSessao.add(a.chatId);
        settle(a, body.permitir === true ? 'allow' : 'deny', body.permitir === true ? '' : 'Negado pelo dono.', sessao ? 'dono (sessão)' : 'dono');
        if (sessao) for (const o of pendingOf(a.chatId)) if (o.risco === 'normal') settle(o, 'allow', '', 'sessão');
        return send(res, 200, { ok: true });
      }
      case '/api/aprovacao/sessao': { // revogar "aprovar todos da sessão"
        const id = String(body.id || '');
        if (!UUID.test(id)) return send(res, 400, { erro: 'id' });
        autoSessao.delete(id);
        audit(P(), { chat: id, decisao: 'revogado', quem: 'dono', motivo: 'aprovar todos da sessão desligado' });
        return send(res, 200, { ok: true });
      }
      case '/api/chat/cancelar': {
        const j = jobs.get(body.id);
        denyAll(String(body.id), 'Cancelado pelo dono.');
        if (j && !j.done) j.child.kill();
        return send(res, 200, { ok: true });
      }
      case '/api/chat/apagar': {
        const d = loadChats();
        if (!UUID.test(String(body.id))) return send(res, 400, { erro: 'id' });
        const j = jobs.get(body.id);
        denyAll(body.id, 'Conversa apagada.');
        autoSessao.delete(body.id);
        if (j && !j.done) j.child.kill();
        delete d.chats[body.id];
        jobs.delete(body.id);
        writeJson(P().CHATS, d);
        return send(res, 200, { ok: true });
      }
      default: return send(res, 404, { erro: 'não encontrado' });
    }
  } catch (e) {
    if (!res.headersSent) send(res, 500, { erro: String(e.message || e) });
    else res.end();
  }
}

server.listen(PORT, HOST, () => {
  console.log(`\nCentral de Projetos (somente local)\n  Primeiro acesso: http://localhost:${PUBLIC_PORT}/?t=${TOKEN}\n  Depois: http://localhost:${PUBLIC_PORT}/\n`);
  console.log('Ctrl+C para encerrar.');
});
