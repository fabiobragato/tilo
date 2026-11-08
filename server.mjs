// Tilo: servidor local, sem dependências. Um seletor de projetos (estilo console) + o painel de cada projeto
// (pendências, sessões do Claude Code, conversas com aprovação de comandos). Escuta só em 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { avaliar, avaliarArquivo, compilar, descrever, descreverFabrica, FERRAMENTAS_ARQUIVO, listarPacotes, validarConfig } from './politica.mjs';
import * as projetos from './projetos.mjs';
import * as catalogo from './catalogo.mjs';
import { consumoRecente, pastaDeTranscripts, usoDoArquivo } from './consumo.mjs';
import { Fluxo, linhaInterrupcao, linhaModelo, linhaModo, linhaUsuario } from './fluxo.mjs';
import { TONS, instrucaoTom } from './tom.mjs';
import * as gitx from './git.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const als = new AsyncLocalStorage(); // projeto da requisição em curso
const P = () => als.getStore(); // { ROOT, README, STATE, CHATS, META, AUDIT, READABLE_DIRS, TERM_DIR, ... }
const HOST = process.env.TILO_BIND || '127.0.0.1';
const ORIGIN_HOSTS = ['127.0.0.1', 'localhost'];
const PORT = Number(process.env.TILO_PORT || 4777);
const PUBLIC_PORT = Number(process.env.TILO_PUBLIC_PORT || PORT);
const TOKEN_FILE = path.join(HERE, '.token'); // persistente (gitignored): o cookie continua valendo após reiniciar
const TOKEN = (() => {
  try { const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); if (/^[0-9a-f]{48}$/.test(t)) return t; } catch {}
  const t = crypto.randomBytes(24).toString('hex');
  try { fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 }); } catch {}
  return t;
})();
const MAX_BODY = 200_000;
// Chave gravada na conversa -> id completo enviado ao claude (a versão fica explícita; para atualizar uma versão, troque só aqui e em MODELOS de assets/app.js).
const MODEL_IDS = { fable: 'claude-fable-5-1', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };
const MODELS = Object.keys(MODEL_IDS);
const DEFAULT_MODEL = 'sonnet'; // padrão do painel (explícito, sempre enviado ao claude)

// ---------- parser do README ----------
const PRIO = { '🔴': 'alta', '🟡': 'media', '🟢': 'baixa' };
const clean = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();
const paths = (s) => [...s.matchAll(/`([^`\s]+\.(?:md|cs|ts|py|yml|yaml|json|sql|ps1|conf))`/g)].map((m) => m[1]);

function parse() {
  let texto; try { texto = fs.readFileSync(P().README, 'utf8'); } catch { return []; } // projeto sem pendencias/README.md ainda: painel abre vazio, não quebra
  const lines = texto.split(/\r?\n/);
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
// título sugerido a partir da 1ª mensagem: primeira linha não vazia, sem espaços repetidos, até 60 caracteres
const tituloDaMensagem = (t) => short(String(t).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) || '', 60);
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
      out.push({ ...i, uso: usoDoArquivo(abs)?.total || null, ...(meta[i.id] || {}) });
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

// ---------- conversas do painel (servidor é dono; sobrevivem a reload) ----------
const jobs = new Map(); // chatId -> { chatId, proj, child, fluxo, done, closing, depois, ... } (ver startJob)
const SYSTEM = [
  'Você está ajudando o DONO do projeto a gerenciar as pendências dele (painel em pendencias/README.md), dentro do Tilo.',
  'Responda em português, linguagem simples e explicativa, sem jargão desnecessário.',
  'Antes de afirmar algo sobre o sistema, confirme no código ou em docs/ (fonte de verdade). planning/ e pendencias/ não são fonte de verdade.',
  'Siga o CLAUDE.md do repositório. Se for pedido para concluir uma pendência, lembre de atualizar pendencias/README.md.',
].join(' ');
// Regras de proteção para os arquivos do próprio Tilo: geradas na partida com o nome REAL da pasta de instalação (não fixo),
// e só para os arquivos da ferramenta, para não bloquear um projeto do usuário que por acaso tenha o mesmo nome de pasta.
function gerarSettings() {
  const base = JSON.parse(fs.readFileSync(path.join(HERE, 'claude-settings.json'), 'utf8'));
  const pasta = path.basename(HERE);
  const arquivos = ['server.mjs', 'aprovador-mcp.mjs', 'politica.mjs', 'catalogo.mjs', 'projetos.mjs', 'fluxo.mjs', 'consumo.mjs', 'tom.mjs', 'git.mjs', 'claude-settings.json', 'projetos.json',
    'index.html', 'inicio.html', 'package.json', 'iniciar.cmd', 'politica.test.mjs', 'catalogo.test.mjs', 'projetos.test.mjs', 'fluxo.test.mjs', 'padroes.test.mjs', 'consumo.test.mjs', 'git.test.mjs', 'server.test.mjs'];
  base.permissions.deny.push(`Read(**/${pasta}/.token)`, `Read(**/${pasta}/projetos.json)`,
    ...['assets', 'modelos', 'scripts', 'dados', 'catalogo', 'logos'].flatMap((d) => [`Edit(**/${pasta}/${d}/**)`, `Write(**/${pasta}/${d}/**)`]),
    ...arquivos.flatMap((f) => [`Edit(**/${pasta}/${f})`, `Write(**/${pasta}/${f})`]));
  const f = path.join(os.tmpdir(), 'tilo-settings.json');
  fs.writeFileSync(f, JSON.stringify(base));
  return f;
}
const SETTINGS_FILE = gerarSettings();
// Tom das respostas (menu "Tom" ao lado do modelo): normal, lite, full ou ultra. As regras vivem em tom.mjs (embutidas no projeto, baseadas no Caveman, MIT)
// e vão no --append-system-prompt de cada processo do claude; nada é instalado nem carregado de fora. TILO_CAVEMAN=off fixa o tom normal e esconde o menu;
// TILO_CAVEMAN_NIVEL = lite (padrão) | full | ultra define o tom das conversas novas.
const TOM_LIGADO = String(process.env.TILO_CAVEMAN || '').toLowerCase() !== 'off';
const DEFAULT_TOM = (() => { const n = String(process.env.TILO_CAVEMAN_NIVEL || '').toLowerCase(); return TOM_LIGADO ? (TONS.includes(n) && n !== 'normal' ? n : 'lite') : 'normal'; })();
const tomDe = (c) => (TOM_LIGADO && TONS.includes(c.tom) ? c.tom : DEFAULT_TOM);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------- aprovações de comandos (o Claude pede; o dono decide na UI) ----------
const APPROVAL_TIMEOUT = 5 * 60_000;
const approvals = new Map(); // id -> { id, chatId, tool, resumo, risco, motivo, criado, resolve, timer }
const AUDIT_MAX = 5_000_000; // acima disso o arquivo é arquivado (auditoria-<data>.jsonl) e um novo é iniciado
const auditAvisado = new Set();
function audit(proj, o) { // dados/<projeto>/auditoria.jsonl
  try {
    try { if (fs.statSync(proj.AUDIT).size > AUDIT_MAX) fs.renameSync(proj.AUDIT, proj.AUDIT.replace(/\.jsonl$/, `-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    fs.appendFileSync(proj.AUDIT, JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n');
  } catch (e) {
    if (!auditAvisado.has(proj.id)) { auditAvisado.add(proj.id); console.error(`[tilo] AVISO: não foi possível gravar a auditoria de "${proj.id}" (${e.message}). A ação seguiu sem registro.`); }
  }
}
const autoSessao = new Set(); // chats em modo "automático" (só em memória; some ao reiniciar o servidor). Produção e política 'negar' nunca entram.
// Modos da conversa (um só seletor, como o Shift+Tab do terminal). Valem na hora, inclusive com o Claude trabalhando:
//  perguntar = toda edição e todo comando pedem aprovação · editar = edita arquivos do projeto sem perguntar, comandos pedem (padrão) ·
//  plan = só lê e planeja · auto = tudo comum sem perguntar (produção sempre pergunta; só em memória) · leitura = nada de editar nem rodar comandos.
const MODOS = ['perguntar', 'editar', 'plan', 'auto', 'leitura'];
const MODOS_BASE = ['perguntar', 'editar', 'leitura']; // o que fica gravado; plan e auto são estados por cima deles
const FERRAMENTAS_EDICAO = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
function modoBase(c) { // conversas antigas guardavam edit/exec
  if (MODOS_BASE.includes(c.modo)) return c.modo;
  if (c.edit === false) return c.exec === false ? 'leitura' : 'perguntar';
  return 'editar';
}
const modoEfetivo = (c) => (c.plan && !c.doc ? 'plan' : autoSessao.has(c.id) ? 'auto' : modoBase(c));
const dentroDe = (raiz, f) => { if (!f || typeof f !== 'string') return false; const r = path.relative(path.resolve(raiz), path.resolve(raiz, f)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const pendingOf = (chatId) => [...approvals.values()].filter((a) => a.chatId === chatId);
// 'chat' e 'projeto' dizem ao dono de QUAL conversa é o pedido (ele pode estar olhando outra tela/conversa quando o pedido chega)
function origemDe(a) { const c = readJson(a.proj.CHATS, { chats: {} }).chats[a.chatId]; return { chatId: a.chatId, chat: c?.title || 'Conversa', projeto: a.proj.nome || a.proj.id }; }
const approvalView = (a) => ({ ...origemDe(a), id: a.id, tool: a.tool, resumo: a.resumo, risco: a.risco, motivo: a.motivo, criado: a.criado, explicacao: a.explicacao, lembravel: a.lembravel, tipo: a.tipo, perguntas: a.perguntas, plano: a.plano });
function settle(a, behavior, message, quem, extra) {
  if (!approvals.delete(a.id)) return;
  clearTimeout(a.timer);
  audit(a.proj, { chat: a.chatId, tool: a.tool, resumo: a.resumo, risco: a.risco, decisao: behavior, quem, motivo: message || '' });
  a.resolve(behavior === 'allow' ? { behavior: 'allow', ...extra } : { behavior: 'deny', message: message || 'Negado pelo dono.' });
}
// Perguntas do Claude (ferramenta AskUserQuestion, comum no modo plan): o dono escolhe as opções na UI; as respostas voltam ao Claude em updatedInput.answers.
function normalizarPerguntas(input) {
  const qs = Array.isArray(input?.questions) ? input.questions.slice(0, 4) : [];
  return qs.map((q) => ({ question: str(q?.question, 500), header: str(q?.header, 40), multiSelect: q?.multiSelect === true,
    options: (Array.isArray(q?.options) ? q.options.slice(0, 6) : []).map((o) => ({ label: str(o?.label, 120), description: str(o?.description, 400) })).filter((o) => o.label) })).filter((q) => q.question);
}
function askPergunta(chatId, input, perguntas, signal) {
  return new Promise((resolve) => {
    const a = { id: crypto.randomUUID(), proj: P(), chatId, tool: 'AskUserQuestion', resumo: perguntas.map((q) => q.question).join(' | ').slice(0, 4000), risco: 'normal', motivo: 'O Claude fez uma pergunta',
      criado: Date.now(), resolve, tipo: 'pergunta', perguntas, input, lembravel: false };
    a.timer = setTimeout(() => settle(a, 'deny', 'Sem resposta em 5 minutos; siga com a melhor suposição e avise o dono.', 'timeout'), APPROVAL_TIMEOUT);
    approvals.set(a.id, a);
    signal?.addEventListener('abort', () => settle(a, 'deny', 'Pedido cancelado.', 'sistema'));
  });
}
// Plano do modo plan (ferramenta ExitPlanMode): a UI mostra o plano completo dentro do chat, com botões Sim/Não (não é o modal de comandos).
function askPlano(chatId, input, signal) {
  return new Promise((resolve) => {
    const plano = str(input?.plan, 60000);
    const a = { id: crypto.randomUUID(), proj: P(), chatId, tool: 'ExitPlanMode', resumo: plano.slice(0, 4000), risco: 'normal', motivo: 'O Claude terminou o plano e pede sua decisão',
      criado: Date.now(), resolve, tipo: 'plano', plano, input, lembravel: false };
    a.timer = setTimeout(() => settle(a, 'deny', 'Sem resposta em 5 minutos; o plano não foi aprovado.', 'timeout'), APPROVAL_TIMEOUT);
    approvals.set(a.id, a);
    signal?.addEventListener('abort', () => settle(a, 'deny', 'Pedido cancelado.', 'sistema'));
  });
}
function denyAll(chatId, message) { for (const a of pendingOf(chatId)) settle(a, 'deny', message, 'sistema'); }
function askApproval(chatId, tool, input, v, signal) {
  return new Promise((resolve) => {
    const comando = v.resumo.length <= 4000 && ['Bash', 'PowerShell'].includes(tool) ? v.resumo : '';
    const a = { id: crypto.randomUUID(), proj: P(), chatId, tool, resumo: v.resumo.slice(0, 4000), risco: v.risco, motivo: v.motivo, criado: Date.now(), resolve,
      explicacao: descrever(tool, input), comando, lembravel: v.risco === 'normal' && !!comando }; // 'lembravel': pode virar permissão permanente do projeto
    a.timer = setTimeout(() => settle(a, 'deny', 'Sem resposta em 5 minutos; negado.', 'timeout'), APPROVAL_TIMEOUT);
    approvals.set(a.id, a);
    signal?.addEventListener('abort', () => settle(a, 'deny', 'Pedido cancelado.', 'sistema'));
  });
}

const loadChats = () => readJson(P().CHATS, { chats: {} });
function saveChat(c) { const d = loadChats(); d.chats[c.id] = c; writeJson(P().CHATS, d); }
// tokens da conversa, lidos do transcript do Claude Code (generalização roda em outra pasta, então o transcript fica em outra pasta)
const usoDaConversa = (c) => usoDoArquivo(path.join(c.gen ? pastaDeTranscripts(c.gen.dir) : P().TERM_DIR, c.id + '.jsonl'))?.total || null;
function chatView(c) { return { ...c, uso: usoDaConversa(c), model: MODELS.includes(c.model) ? c.model : DEFAULT_MODEL, ...estadoDoJob(c.id), modo: modoEfetivo(c), pendentes: pendingOf(c.id).length, autoAprovar: autoSessao.has(c.id), tom: tomDe(c), tomDisponivel: TOM_LIGADO }; }

// Uma conversa = UM processo `claude` em modo stream-json enquanto houver trabalho (como o terminal): mensagens novas vão pelo
// stdin a qualquer momento e o próprio Claude Code as enfileira e entrega entre dois passos da tarefa. O painel nunca roda dois
// processos para a mesma conversa. Detalhes em docs/backend/ai-architecture.md.
const FILA_MAX = 20;
const IDLE_FILA_MS = 15_000; // o claude terminou o turno mas não leu uma mensagem da fila: assume que ela não será lida
const IDLE_BG_MS = 30 * 60_000; // limite de espera por tarefas em segundo plano depois que o claude ficou ocioso
const INTERROMPER_MS = 10_000; // se o claude não parar sozinho após o pedido de interrupção, o processo é encerrado
const midsVistos = new Map(); // chatId -> Set de ids de mensagem já aceitos (envio repetido não duplica)
const jobAtivo = (id) => { const j = jobs.get(id); return j && !j.done ? j : null; };
const jsonl = (o) => JSON.stringify(o) + '\n';
function matar(job) { job.morto = true; // no Windows `claude` roda dentro de um cmd.exe (shell:true): child.kill() deixaria o claude vivo; taskkill /T leva a árvore inteira
  try {
    if (process.platform === 'win32' && job.child.pid) spawn('taskkill', ['/pid', String(job.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    else job.child.kill();
  } catch {}
}
function gravarNoChat(proj, chatId, fn) { // aplica uma alteração ao chat salvo (lê e grava; o servidor é o dono do histórico)
  als.run(proj, () => { const c = loadChats().chats[chatId]; if (c) { fn(c); c.updated = Date.now(); saveChat(c); } });
}
function fecharJob(job) { // não há mais o que esperar: fecha o stdin e o claude encerra sozinho
  if (job.done || job.closing) return;
  job.closing = true; clearTimeout(job.tIdle);
  try { job.child.stdin.end(); } catch {}
}
function avaliarFechamento(job, apos = 0) { // chamado quando o claude fica ocioso: fecha se não há nada pendente
  clearTimeout(job.tIdle);
  if (job.done || job.closing || job.fluxo.ocupado) return;
  const f = job.fluxo;
  if (f.podeFechar()) { if (apos) job.tIdle = setTimeout(() => { if (!job.fluxo.ocupado) fecharJob(job); }, apos); else fecharJob(job); return; }
  job.tIdle = setTimeout(() => { if (!job.fluxo.ocupado) fecharJob(job); }, f.fila.length ? IDLE_FILA_MS : IDLE_BG_MS);
}
function interromper(job) { // Parar: o mesmo que Esc no terminal (a sessão continua e aceita novas instruções)
  denyAll(job.chatId, 'Cancelado pelo dono.');
  if (!job.fluxo.ocupado) { matar(job); return 'encerrado'; } // só esperava tarefa em segundo plano: encerra o processo
  try { job.child.stdin.write(linhaInterrupcao(crypto.randomUUID())); } catch {}
  clearTimeout(job.tInt);
  job.tInt = setTimeout(() => { if (!job.done && job.fluxo.ocupado) matar(job); }, INTERROMPER_MS); // não parou: encerra de vez
  return 'interrompido';
}
// Entrega uma mensagem do dono à conversa: se há processo vivo, vai direto pelo stdin (fila nativa do Claude Code);
// se o processo está fechando, espera ele terminar e abre outro (nunca dois ao mesmo tempo).
function entregar(chat, msg) {
  const j = jobAtivo(chat.id);
  if (!j) { startJob(chat, msg.text, { mid: msg.id, persistido: msg.persistido }); return; }
  if (j.closing) { j.depois.push(msg); return; }
  j.fluxo.enfileirar(msg);
  clearTimeout(j.tIdle);
  try { j.child.stdin.write(linhaUsuario(msg.text)); } catch {}
}
function salvarPerdidas(proj, chatId, perdidas) { // mensagens que o claude nunca leu: ficam no histórico marcadas, para o dono reenviar
  if (!perdidas.length) return;
  gravarNoChat(proj, chatId, (c) => { for (const m of perdidas) if (!m.persistido) c.messages.push({ role: 'user', text: m.text, ts: m.ts, mid: m.id, naoLida: true }); });
}

// Estado de execução do agente (running/ocupado/segundoPlano) é separado da disponibilidade do campo de mensagem: a caixa nunca é bloqueada por isso.
function estadoDoJob(id) {
  const j = jobAtivo(id);
  if (!j || j.proj.id !== P().id) return { running: false, desde: 0, ocupado: false, segundoPlano: 0, fila: [] };
  const f = j.fluxo;
  return { running: true, desde: j.inicio, ocupado: f.ocupado, segundoPlano: f.bg, fila: [...f.fila, ...j.depois].map((m) => ({ id: m.id, text: m.persistido ? '' : m.text, ts: m.ts, persistido: !!m.persistido })) };
}

function startJob(chat, text, { mid = crypto.randomUUID(), persistido = true } = {}) {
  const proj = P();
  const first = !chat.started, tom = tomDe(chat);
  let prompt = text;
  if (first && chat.contexto) prompt = `Pendência em foco:\n${chat.contexto}\n\nPergunta do dono do projeto:\n${text}`;
  const doc = !!chat.doc; // conversa de documentação: sem terminal; Write/Edit passam pela política de arquivos (avaliarArquivo)
  // Só leitura é liberada direto. Edição e comandos caem SEMPRE no aprovador, que decide pelo modo ATUAL da conversa
  // (/api/aprovacao/pedir -> modoEfetivo): trocar de modo no seletor vale na hora, mesmo no meio de uma tarefa.
  // No modo plan o próprio Claude (--permission-mode plan) só lê e planeja; aprovado o plano (ExitPlanMode), a mesma execução segue.
  const tools = 'Read,Grep,Glob';
  const bloqueadas = doc ? ['Bash', 'PowerShell'] : []; // conversa de documentação não tem terminal
  const mcpCfg = path.join(os.tmpdir(), `tilo-mcp-${chat.id}.json`);
  fs.writeFileSync(mcpCfg, JSON.stringify({ mcpServers: { tilo: { command: process.execPath, args: [path.join(HERE, 'aprovador-mcp.mjs')], env: { TILO_CHAT_ID: chat.id, TILO_PROJECT: proj.id, TILO_PORT: String(PORT) } } } }));
  // stream-json nos dois sentidos: o painel pode mandar mensagens durante a execução e recebe os eventos (texto parcial, ferramentas, fim de turno).
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--replay-user-messages',
    '--allowedTools', tools, '--setting-sources', 'project', '--settings', SETTINGS_FILE,
    '--mcp-config', mcpCfg, '--strict-mcp-config', '--permission-prompt-tool', 'mcp__tilo__approve', '--append-system-prompt', JSON.stringify(SYSTEM + (tom === 'normal' && first ? '' : ' ' + instrucaoTom(tom)))];
  if (bloqueadas.length) args.push('--disallowedTools', bloqueadas.join(','));
  const dirsRef = chat.gen ? chat.gen.leitura : catalogo.pastasDeLeitura(chat.referencias || []); // documentos da biblioteca: leitura liberada, escrita bloqueada (settings)
  if (dirsRef.length) args.push('--add-dir', ...dirsRef.map((d) => `"${d}"`));
  if (chat.plan && !doc) args.push('--permission-mode', 'plan');
  const modelo = MODELS.includes(chat.model) ? chat.model : DEFAULT_MODEL, emPlan = !!chat.plan;
  args.push('--model', MODEL_IDS[modelo]); // validado contra MODELS
  args.push(first ? '--session-id' : '--resume', chat.id);
  // shell:true porque no Windows `claude` é .cmd. Nenhum texto livre do usuário vai em args (vai por stdin).
  // Chaves de API vazias de propósito: nunca usar API paga, só a assinatura (login do Claude Code).
  const child = spawn('claude', args, { cwd: chat.gen ? chat.gen.dir : proj.ROOT, // generalização: pasta de rascunhos isolada; demais: raiz do projeto
    shell: true, windowsHide: true, env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' } });
  const fluxo = new Fluxo({
    onMensagem: (m) => gravarNoChat(proj, chat.id, (c) => {
      if (m.role === 'user') c.messages.push({ role: 'user', text: m.text, ts: m.ts, mid: m.id, model: modelo, plan: emPlan });
      else c.messages.push({ role: 'assistant', text: m.text || (m.tools?.length ? '' : '(sem resposta)'), ts: Date.now(), model: modelo, plan: emPlan, ...(m.modelo && { modeloId: m.modelo }), ...(m.tools?.length && { tools: m.tools }), ...(m.erro && { erro: true }), ...(m.interrompido && { interrompido: true }) });
      if (!c.started && fluxo.consumidas > 0) c.started = true; // a sessão já existe no disco: as próximas mensagens usam --resume
    }),
  });
  const job = { chatId: chat.id, proj, child, fluxo, inicio: Date.now(), done: false, closing: false, err: '', depois: [], tIdle: null, tInt: null };
  jobs.set(chat.id, job);
  fluxo.enfileirar({ id: mid, text: prompt, persistido });
  child.stdin.on('error', () => {}); // processo já saiu: o close trata o resto
  child.stdin.write(linhaUsuario(prompt));
  let linhas = '';
  child.stdout.on('data', (d) => {
    linhas += d;
    let i;
    while ((i = linhas.indexOf('\n')) >= 0) {
      const l = linhas.slice(0, i).trim(); linhas = linhas.slice(i + 1);
      if (!l.startsWith('{')) continue;
      let e; try { e = JSON.parse(l); } catch { continue; }
      const r = fluxo.evento(e);
      if (r === 'init') { clearTimeout(job.tIdle); clearTimeout(job.tInt); }
      else if (r === 'turno-fim') { clearTimeout(job.tInt); avaliarFechamento(job); }
      else if (r === 'bg') avaliarFechamento(job, 3000); // tarefa em 2º plano acabou: dá um instante para o aviso dela virar um turno
    }
  });
  child.stderr.on('data', (d) => { job.err = (job.err + d).slice(-4000); });
  const finish = (code, msg) => als.run(proj, () => {
    if (job.done) return;
    job.done = true; clearTimeout(job.tIdle); clearTimeout(job.tInt);
    denyAll(chat.id, 'Conversa encerrada.');
    if (chat.gen) { try { catalogo.atualizarLote(chat.gen.lote, { finalizado: true }); } catch {} }
    try { fs.unlinkSync(mcpCfg); } catch {}
    const falhou = !job.morto && !!(code || msg);
    const aviso = falhou && !fluxo.teveErro ? `[${msg || `claude saiu com código ${code}`}]${job.err.trim() ? '\n' + job.err.trim() : ''}` : '';
    const perdidas = fluxo.encerrar({ erro: falhou, aviso });
    if (!fluxo.emitiu) gravarNoChat(proj, chat.id, (c) => { c.messages.push({ role: 'assistant', text: '(sem resposta)', ts: Date.now(), model: modelo, plan: emPlan }); });
    if (!falhou && fluxo.consumidas > 0) gravarNoChat(proj, chat.id, (c) => { c.started = true; });
    if (job.depois.length) { // mensagens que chegaram enquanto o processo fechava: assumem uma nova execução, na ordem
      const [a, ...resto] = job.depois;
      const c = loadChats().chats[chat.id];
      if (c && !c.closed && !falhou) {
        salvarPerdidas(proj, chat.id, perdidas);
        startJob(c, a.text, { mid: a.id, persistido: false });
        for (const m of resto) entregar(c, m);
        return;
      }
      perdidas.push(...job.depois);
    }
    salvarPerdidas(proj, chat.id, perdidas);
  });
  child.on('error', (e) => finish(1, `erro ao iniciar claude: ${e.message}`));
  child.on('close', (code) => finish(code));
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
function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('corpo grande demais')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const PORTAS_OK = [...new Set([PUBLIC_PORT, PORT])]; // o aprovador chama pela porta real (TILO_PORT); o navegador, pela pública
const hostOk = (req) => ORIGIN_HOSTS.some((n) => PORTAS_OK.some((p) => (req.headers.host || '').toLowerCase() === `${n}:${p}`));
const originOk = (req) => !req.headers.origin || ORIGIN_HOSTS.some((n) => PORTAS_OK.some((p) => req.headers.origin === `http://${n}:${p}`));
function cookieToken(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)tilo_t=([0-9a-f]+)/);
  return m ? m[1] : null;
}
function tokenOk(req, url) {
  const t = req.headers['x-tilo-token'] || url.searchParams.get('t') || cookieToken(req);
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
const atualizarPoliticaDoProjeto = (fn) => projetos.atualizarPolitica(P().id, fn);
const cfgSegura = (cfg) => { try { return validarConfig(cfg); } catch { return validarConfig({}); } };
const MIME_ASSET = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const existe = (f) => { try { return !!f && fs.statSync(f).isFile(); } catch { return false; } };
const projetoView = (p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, cor: p.cor, logo: `/logo/${p.id}`, logoLargo: `/logo/${p.id}?tipo=largo`, temIcone: existe(p.icone), temLogo: existe(p.logo) });
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
      if (!tokenOk(req, url)) return send(res, 403, 'Abra o Tilo pelo atalho (ou pelo link com token) uma vez; depois o cookie basta.', 'text/plain; charset=utf-8');
      if (url.searchParams.get('t')) { // atalho por projeto: grava o cookie e limpa o token da URL
        res.writeHead(302, { Location: url.pathname, 'Set-Cookie': `tilo_t=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, 'Cache-Control': 'no-store' });
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
      if (!tokenOk(req, url)) return send(res, 403, 'Abra o Tilo pelo atalho (ou pelo link com token) uma vez; depois o cookie basta.', 'text/plain; charset=utf-8');
      if (url.searchParams.get('t')) { // grava cookie (Strict, HttpOnly) e tira o token da URL
        res.writeHead(302, { Location: '/', 'Set-Cookie': `tilo_t=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`, 'Cache-Control': 'no-store' });
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
        case '/api/documentacao': {
          const R = P().ROOT, AREAS = [['backend', 'Backend'], ['frontend', 'Frontend'], ['business', 'Regras de negócio'], ['data-platform', 'Plataforma de dados'], ['infra', 'Infraestrutura'], ['deploy', 'Deploy'], ['security', 'Segurança']];
          const contar = (dir) => { let n = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const a = path.join(d, e.name); if (e.isDirectory()) walk(a); else if (e.name.endsWith('.md')) n++; } }; try { walk(dir); } catch {} return n; };
          const tem = (...p) => fs.existsSync(path.join(R, ...p));
          const RUIDO = new Set(['node_modules', '.git', '.vs', '.idea', '.vscode', 'bin', 'obj', 'dist', 'build', 'out', '.angular', '__pycache__', '.venv', 'venv', 'coverage', '.next']);
          let pastas = []; try { pastas = fs.readdirSync(R, { withFileTypes: true }).filter((e) => e.isDirectory() && !RUIDO.has(e.name) && !e.name.startsWith('.')).map((e) => e.name).slice(0, 40); } catch {}
          const docChats = Object.values(loadChats().chats).filter((c) => c.doc).sort((a, b) => b.updated - a.updated);
          const job = docChats[0] ? { chatId: docChats[0].id, rodando: !!jobs.get(docChats[0].id) && !jobs.get(docChats[0].id).done, titulo: docChats[0].title } : null;
          return send(res, 200, {
            areas: AREAS.map(([id, nome]) => ({ id, nome, arquivos: contar(path.join(R, 'docs', id)) })),
            geral: { docsReadme: tem('docs', 'README.md'), claudeMd: tem('CLAUDE.md'), planning: tem('planning', 'README.md'), pendencias: tem('pendencias', 'README.md') },
            total: contar(path.join(R, 'docs')), pastas, recentes: listDocs().sort((a, b) => b.mtime - a.mtime).slice(0, 12), job,
          });
        }
        case '/api/biblioteca': {
          const todos = catalogo.listarDocs(), q = (url.searchParams.get('q') || '').trim();
          const docs = q ? catalogo.listarDocs(undefined, { q }) : todos;
          return send(res, 200, {
            areas: catalogo.AREAS_REAPROVEITAVEIS.map((id) => ({ id, nome: catalogo.AREAS[id], total: todos.filter((d) => d.area === id).length })),
            colecoes: catalogo.listarColecoes(), docs, meus: catalogo.docsDoProjeto(P().ROOT), projeto: { id: P().id, nome: P().nome },
          });
        }
        case '/api/biblioteca/rascunhos': {
          const chats = Object.values(loadChats().chats);
          const lotes = catalogo.listarLotes().filter((l) => l.projeto === P().id).map((l) => {
            const c = chats.find((x) => x.gen?.lote === l.id);
            return { ...l, chatId: c?.id || l.chatId, rodando: !!(c && jobs.get(c.id) && !jobs.get(c.id).done) };
          });
          return send(res, 200, { lotes });
        }
        case '/api/biblioteca/rascunho': { try { return send(res, 200, catalogo.lerRascunho(url.searchParams.get('lote') || '', url.searchParams.get('item') || '', { original: url.searchParams.get('original') === '1' })); } catch (e) { return send(res, 404, { erro: e.message }); } }
        case '/api/biblioteca/doc': { try { return send(res, 200, catalogo.lerDoc(url.searchParams.get('id') || '')); } catch (e) { return send(res, 404, { erro: e.message }); } }
        case '/api/permissoes': {
          const c = cfgSegura(P().politica);
          return send(res, 200, {
            fabrica: descreverFabrica(),
            pacotes: listarPacotes().map((p) => ({ ...p, ligado: c.pacotes.includes(p.id) })),
            lembrados: c.lembrados.map((l) => { const d = descrever('Bash', { command: l.comando }); return { comando: l.comando, quando: l.quando, resumo: d.resumo, passos: d.passos, nivel: d.nivel, rotulo: d.rotulo }; }),
            bloqueios: c.bloqueios, producao: c.producao,
          });
        }
        case '/api/alteracoes': { // git visual: o que não foi commitado, o que não foi enviado e a conversa de cada alteração
          try {
            const e = await gitx.estado(P().ROOT);
            if (!e.repo) return send(res, 200, { repo: false });
            const chats = Object.values(loadChats().chats).filter((c) => !c.gen);
            const titulos = new Map(chats.map((c) => [c.id, c.title || 'Conversa']));
            const desde = await gitx.ultimoCommitPorArquivo(e.raiz, e.arquivos.filter((a) => !a.naoRastreado).map((a) => a.caminho));
            return send(res, 200, {
              ...e,
              arquivos: gitx.vincularArquivos(e.arquivos, chats, e.raiz, FERRAMENTAS_EDICAO, desde).map((a) => ({ ...a, sensivel: gitx.ehSensivel(a.caminho) })),
              naoEnviados: e.naoEnviados.map((c) => ({ ...c, conversas: c.chats.map((id) => ({ id, titulo: titulos.get(id) || null })) })),
            });
          } catch (err) { return send(res, 500, { erro: err.message }); }
        }
        case '/api/alteracoes/historico': { // commits da branch atual, em páginas; cada um com a conversa do trailer Tilo-Chat e se já foi enviado
          try {
            const h = await gitx.historico(P().ROOT, { limite: url.searchParams.get('limite'), pular: url.searchParams.get('pular') });
            if (!h.repo) return send(res, 200, h);
            const titulos = new Map(Object.values(loadChats().chats).filter((c) => !c.gen).map((c) => [c.id, c.title || 'Conversa']));
            return send(res, 200, { ...h, commits: h.commits.map((c) => ({ ...c, conversas: c.chats.map((id) => ({ id, titulo: titulos.get(id) || null })) })) });
          } catch (err) { return send(res, 500, { erro: err.message }); }
        }
        case '/api/alteracoes/commit-arquivos': {
          try { return send(res, 200, await gitx.arquivosDoCommit(P().ROOT, url.searchParams.get('sha') || '')); }
          catch (err) { return send(res, 400, { erro: err.message }); }
        }
        case '/api/alteracoes/commit-diff': {
          try { return send(res, 200, await gitx.diffDoCommit(P().ROOT, url.searchParams.get('sha') || '', url.searchParams.get('arquivo') || '')); }
          catch (err) { return send(res, 400, { erro: err.message }); }
        }
        case '/api/alteracoes/diff': {
          try { return send(res, 200, await gitx.diff(P().ROOT, url.searchParams.get('arquivo') || '')); }
          catch (err) { return send(res, 400, { erro: err.message }); }
        }
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
        case '/api/consumo': { // estimativa local: tokens de hoje e dos últimos 7 dias SÓ do projeto atual (painel + terminal)
          const pastas = [P().TERM_DIR];
          for (const c of Object.values(readJson(P().CHATS, { chats: {} }).chats)) if (c.gen?.dir) pastas.push(pastaDeTranscripts(c.gen.dir));
          return send(res, 200, { ...consumoRecente(pastas), now: Date.now() });
        }
        case '/api/chats': {
          const list = Object.values(loadChats().chats).sort((a, b) => b.updated - a.updated).map(chatView);
          return send(res, 200, { chats: list });
        }
        case '/api/aprovacoes': return send(res, 200, { pendentes: [...approvals.values()].filter((a) => a.proj.id === P().id).sort((a, b) => a.criado - b.criado).map(approvalView) }); // de todas as conversas DESTE projeto (nunca de outro projeto)
        case '/api/chat/stream': {
          const id = url.searchParams.get('id') || '';
          const j = jobs.get(id);
          if (!j || j.proj.id !== P().id) return send(res, 200, { text: '', tools: [], fila: [], rev: 0, ocupado: false, bg: 0, done: true, pendentes: [] });
          return send(res, 200, { ...j.fluxo.vista(), fila: estadoDoJob(id).fila, done: j.done, pendentes: pendingOf(id).map(approvalView) });
        }
        case '/api/file': {
          const rel = url.searchParams.get('p') || '';
          const abs = path.resolve(P().ROOT, rel);
          const top = path.relative(P().ROOT, abs).split(path.sep)[0];
          if (!abs.startsWith(P().ROOT + path.sep) || !P().READABLE_DIRS.includes(top) || /(^|[\\/])\.env/.test(abs)) return send(res, 403, { erro: 'caminho não permitido' });
          if (!fs.existsSync(abs) || !fs.statSync(abs).isFile() || fs.statSync(abs).size > 500_000) return send(res, 404, { erro: 'arquivo não encontrado ou grande demais' });
          let real, raizReal; // resolve atalhos (links simbólicos): o destino também precisa estar dentro da pasta legível
          try { real = fs.realpathSync(abs); raizReal = fs.realpathSync(P().ROOT); } catch { return send(res, 404, { erro: 'arquivo não encontrado ou grande demais' }); }
          const topReal = path.relative(raizReal, real).split(path.sep)[0];
          if (!real.startsWith(raizReal + path.sep) || !P().READABLE_DIRS.includes(topReal)) return send(res, 403, { erro: 'caminho não permitido' });
          return send(res, 200, { path: rel, content: fs.readFileSync(real, 'utf8') });
        }
        default: return send(res, 404, { erro: 'não encontrado' });
      }
    }
    if (req.method !== 'POST') return send(res, 405, { erro: 'método' });
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { erro: 'use JSON' });
    const body = await readBody(req, (url.pathname === '/api/projetos' || url.pathname === '/api/projetos/editar') ? 4_500_000 : MAX_BODY); // cadastro de projeto aceita imagens (até 1,5 MB cada)

    switch (url.pathname) {
      case '/api/projetos': { // cadastrar projeto (opcionalmente cria a estrutura base do padrão de documentação, sem sobrescrever nada)
        try { const r = projetos.adicionar({ nome: body.nome, raiz: body.raiz, cor: body.cor, descricao: body.descricao, estruturaBase: body.estruturaBase === true, icone: body.icone, logo: body.logo }); return send(res, 200, r); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/projetos/remover': { // só tira da lista; pasta do projeto e dados/ ficam intactos
        try { return send(res, 200, projetos.remover(String(body.id || ''))); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/projetos/editar': {
        try { return send(res, 200, projetos.editar({ id: String(body.id || ''), nome: body.nome, cor: body.cor, descricao: body.descricao, icone: body.icone, logo: body.logo, removerIcone: body.removerIcone === true, removerLogo: body.removerLogo === true })); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/biblioteca/publicar': { // copia documentos técnicos deste projeto para a biblioteca (coleção = este projeto)
        try {
          const r = catalogo.publicar({ raizProjeto: P().ROOT, colecao: P().id, nome: P().nome, arquivos: body.arquivos });
          audit(P(), { chat: '-', tool: 'biblioteca', resumo: `publicou ${r.publicados} documento(s)`, risco: 'normal', decisao: 'publicado', quem: 'dono', motivo: 'documentos copiados para a biblioteca' });
          return send(res, 200, r);
        } catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/biblioteca/remover': {
        try {
          if (body.id) catalogo.removerDoc(String(body.id)); else catalogo.removerColecao(String(body.colecao || ''));
          audit(P(), { chat: '-', tool: 'biblioteca', resumo: String(body.id || body.colecao), risco: 'normal', decisao: 'removido', quem: 'dono', motivo: 'removido da biblioteca' });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/biblioteca/generalizar': { // o Claude reescreve os documentos sem o que é do produto; o dono revisa os rascunhos antes de entrarem na biblioteca
        const idsLib = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))], arqs = [...new Set((Array.isArray(body.arquivos) ? body.arquivos : []).map(String))];
        if (!idsLib.length && !arqs.length) return send(res, 400, { erro: 'escolha pelo menos um documento' });
        if (idsLib.length + arqs.length > 60) return send(res, 400, { erro: 'no máximo 60 documentos por vez' });
        if (Object.values(loadChats().chats).some((c) => c.doc && jobs.get(c.id) && !jobs.get(c.id).done)) return send(res, 409, { erro: 'já existe um trabalho do Claude em andamento neste projeto' });
        const fontes = [];
        const nomes = Object.fromEntries(catalogo.listarColecoes().map((c) => [c.id, c.nome]));
        for (const id of idsLib) { const r = catalogo.resolverId(id); if (!r || !fs.existsSync(r.abs)) return send(res, 400, { erro: `documento inválido: ${id}` }); fontes.push({ abs: r.abs, area: r.area, rel: r.rel, colecao: r.colecao, substitui: id, origem: nomes[r.colecao] || r.colecao }); }
        const meus = catalogo.docsDoProjeto(P().ROOT);
        for (const a of arqs) {
          const [area, ...resto] = a.split('/'), rel = resto.join('/'), grupo = meus.find((g) => g.area === area);
          if (!grupo || !grupo.arquivos.some((f) => f.rel === rel)) return send(res, 400, { erro: `documento inválido: ${a}` });
          fontes.push({ abs: path.join(P().ROOT, 'docs', area, ...rel.split('/')), area, rel, colecao: P().id, substitui: `${P().id}/${a}`, origem: P().nome });
        }
        let tpl; try { tpl = fs.readFileSync(path.join(HERE, 'modelos', 'generalizar.md'), 'utf8'); } catch { return send(res, 500, { erro: 'modelo de generalização não encontrado' }); }
        const lote = catalogo.criarLote({ projeto: P().id, titulo: `Generalizar ${fontes.length} documento${fontes.length === 1 ? '' : 's'}`, fontes, modo: arqs.length ? 'publicar' : 'biblioteca' });
        const lista = fontes.map((f) => `- “${f.area}/${f.rel}” (origem: ${f.origem}) — ler: ${f.abs} — gravar em: ${f.area}/${f.rel}`).join('\n');
        const prompt = tpl.split('{{LISTA_DOCS}}').join(lista);
        const modelo = MODELS.includes(body.modelo) ? body.modelo : DEFAULT_MODEL;
        const leitura = [...new Set(fontes.map((f) => path.dirname(f.abs)))];
        const c = { id: crypto.randomUUID(), title: 'Generalizar documentos para a biblioteca', itemId: '', contexto: '', model: modelo, plan: false, edit: false, exec: false, doc: true, gen: { lote: lote.id, dir: lote.pasta, leitura }, started: false, created: Date.now(), updated: Date.now(),
          messages: [{ role: 'user', text: `Generalizar ${fontes.length} documento${fontes.length === 1 ? '' : 's'} para a biblioteca (sem o que é específico do produto).`, ts: Date.now(), model: modelo, plan: false }] };
        saveChat(c);
        try { catalogo.atualizarLote(lote.id, { chatId: c.id }); } catch {}
        audit(P(), { chat: c.id, tool: 'biblioteca', resumo: `generalizar ${fontes.length} documento(s)`, risco: 'normal', decisao: 'iniciado', quem: 'dono', motivo: `lote ${lote.id}` });
        startJob(c, prompt);
        return send(res, 200, { ...chatView(c), lote: lote.id });
      }
      case '/api/biblioteca/rascunho/aceitar': {
        try {
          const r = catalogo.aceitarRascunhos(String(body.lote || ''), body.itens === 'todos' ? 'todos' : (Array.isArray(body.itens) ? body.itens.map(String) : []), { nomeColecao: P().nome });
          audit(P(), { chat: '-', tool: 'biblioteca', resumo: `aceitou ${r.aceitos.length} rascunho(s) generalizado(s)`, risco: 'normal', decisao: 'publicado', quem: 'dono', motivo: r.aceitos.join(', ').slice(0, 400) });
          return send(res, 200, r);
        } catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/biblioteca/rascunho/descartar': {
        try { return send(res, 200, catalogo.descartarRascunhos(String(body.lote || ''), body.itens === 'todos' ? 'todos' : (Array.isArray(body.itens) ? body.itens.map(String) : []))); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/biblioteca/anexar': { // biblioteca -> este projeto: copiar como está, ou o Claude adapta ao código
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 40);
        if (!ids.length) return send(res, 400, { erro: 'escolha pelo menos um documento' });
        if (ids.some((id) => !catalogo.resolverId(id))) return send(res, 400, { erro: 'documento inválido' });
        if (body.modo !== 'adaptar') {
          try {
            const r = catalogo.copiarParaProjeto({ raiz: P().ROOT, ids });
            audit(P(), { chat: '-', tool: 'biblioteca', resumo: `copiou ${r.criados.length + r.renomeados.length} documento(s) para docs/`, risco: 'normal', decisao: 'anexado', quem: 'dono', motivo: [...r.criados, ...r.renomeados.map((x) => x.para)].join(', ').slice(0, 400) });
            return send(res, 200, r);
          } catch (e) { return send(res, 400, { erro: e.message }); }
        }
        if (Object.values(loadChats().chats).some((c) => c.doc && jobs.get(c.id) && !jobs.get(c.id).done)) return send(res, 409, { erro: 'já existe uma documentação em andamento neste projeto' });
        const modelo = MODELS.includes(body.modelo) ? body.modelo : DEFAULT_MODEL;
        let tpl; try { tpl = fs.readFileSync(path.join(HERE, 'modelos', 'adaptar.md'), 'utf8'); } catch { return send(res, 500, { erro: 'modelo de adaptação não encontrado' }); }
        const docs = catalogo.listarDocs().filter((d) => ids.includes(d.id));
        const lista = ids.map((id) => { const r = catalogo.resolverId(id), d = docs.find((x) => x.id === id); return `- ${d ? `“${d.titulo}” (${d.areaNome}, origem: ${d.colecaoNome})` : id}: ${r.abs}`; }).join('\n');
        const prompt = tpl.split('{{NOME}}').join(P().nome).split('{{LISTA_DOCS}}').join(lista);
        const c = { id: crypto.randomUUID(), title: 'Adaptar documentos da biblioteca', itemId: '', contexto: '', model: modelo, plan: false, edit: false, exec: false, doc: true, referencias: ids, started: false, created: Date.now(), updated: Date.now(),
          messages: [{ role: 'user', text: `Adaptar ${ids.length} documento${ids.length === 1 ? '' : 's'} da biblioteca ao projeto ${P().nome}.`, ts: Date.now(), model: modelo, plan: false }] };
        saveChat(c);
        startJob(c, prompt);
        return send(res, 200, chatView(c));
      }
      case '/api/documentacao/iniciar': { // o Claude lê o projeto e monta/atualiza docs/ no padrão do Tilo (modelos/documentar.md)
        const modo = body.modo === 'atualizar' ? 'atualizar' : 'criar', modelo = MODELS.includes(body.modelo) ? body.modelo : DEFAULT_MODEL;
        if (Object.values(loadChats().chats).some((c) => c.doc && jobs.get(c.id) && !jobs.get(c.id).done)) return send(res, 409, { erro: 'já existe uma documentação em andamento neste projeto' });
        let tpl; try { tpl = fs.readFileSync(path.join(HERE, 'modelos', 'documentar.md'), 'utf8'); } catch { return send(res, 500, { erro: 'modelo de documentação não encontrado' }); }
        for (const m of ['criar', 'atualizar']) tpl = m === modo ? tpl.replace(`[[${m}]]`, '').replace(`[[/${m}]]`, '') : tpl.replace(new RegExp(`\\[\\[${m}\\]\\][\\s\\S]*?\\[\\[/${m}\\]\\]`), '');
        const prompt = tpl.split('{{NOME}}').join(P().nome);
        const titulo = modo === 'criar' ? 'Montar a documentação' : 'Atualizar a documentação';
        const c = { id: crypto.randomUUID(), title: titulo, itemId: '', contexto: '', model: modelo, plan: false, edit: false, exec: false, doc: true, started: false, created: Date.now(), updated: Date.now(),
          messages: [{ role: 'user', text: `${titulo} do projeto ${P().nome}.`, ts: Date.now(), model: modelo, plan: false }] };
        saveChat(c);
        startJob(c, prompt);
        return send(res, 200, chatView(c));
      }
      case '/api/permissoes/pacote': { // liga/desliga um pacote opcional (testes, build)
        try { atualizarPoliticaDoProjeto((c) => { const id = String(body.id); c.pacotes = c.pacotes.filter((x) => x !== id); if (body.ligado === true) c.pacotes.push(id); }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/permissoes/lembrar': { // só comandos comuns: produção e bloqueados nunca viram permissão permanente
        const comando = str(body.comando, 4001).trim();
        const v = avaliar('Bash', { command: comando }, compilar(P().politica));
        if (comando.length > 4000 || v.acao === 'negar' || v.risco === 'producao') return send(res, 400, { erro: v.acao === 'negar' ? `Este comando é bloqueado (${v.motivo}).` : 'Comandos de produção sempre pedem aprovação; não dá para lembrá-los.' });
        try { atualizarPoliticaDoProjeto((c) => { if (!c.lembrados.some((l) => l.comando === comando)) c.lembrados.push({ comando, quando: new Date().toISOString() }); }); audit(P(), { chat: '-', tool: 'Bash', resumo: comando, risco: 'normal', decisao: 'lembrado', quem: 'dono', motivo: 'permissão permanente do projeto' }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/permissoes/esquecer': {
        const comando = str(body.comando, 4001).trim();
        try { atualizarPoliticaDoProjeto((c) => { c.lembrados = c.lembrados.filter((l) => l.comando !== comando); }); audit(P(), { chat: '-', tool: 'Bash', resumo: comando, risco: 'normal', decisao: 'revogado', quem: 'dono', motivo: 'permissão permanente removida' }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/permissoes/regra': { // bloqueio ou cuidado extra por texto
        const tipo = body.tipo === 'producao' ? 'producao' : 'bloqueios';
        try { atualizarPoliticaDoProjeto((c) => { c[tipo].push({ texto: str(body.texto, 200), motivo: str(body.motivo, 200) }); }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/permissoes/regra/remover': {
        const tipo = body.tipo === 'producao' ? 'producao' : 'bloqueios';
        try { atualizarPoliticaDoProjeto((c) => { c[tipo] = c[tipo].filter((r) => r.texto !== String(body.texto)); }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { erro: e.message }); }
      }
      case '/api/permissoes/testar': { // simula um comando contra as permissões (não executa nada)
        const tool = body.tool === 'PowerShell' ? 'PowerShell' : 'Bash', comando = str(body.comando, 4000);
        const v = avaliar(tool, { command: comando }, compilar(P().politica));
        return send(res, 200, { acao: v.acao, risco: v.risco, motivo: v.motivo, origem: v.origem, explicacao: descrever(tool, { command: comando }) });
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
          model: MODELS.includes(body.model) ? body.model : DEFAULT_MODEL, tom: TONS.includes(body.tom) ? body.tom : DEFAULT_TOM, plan: !!body.plan, modo: MODOS_BASE.includes(body.modo) ? body.modo : 'editar', started: false,
          created: Date.now(), updated: Date.now(), messages: [],
        };
        saveChat(c);
        return send(res, 200, chatView(c));
      }
      case '/api/chat/config': { // /model, /plan, edição, título
        const c = loadChats().chats[body.id];
        if (!c) return send(res, 404, { erro: 'conversa' });
        const antes = { plan: !!c.plan, model: c.model };
        if (body.model !== undefined) { if (!MODELS.includes(body.model)) return send(res, 400, { erro: 'modelo' }); c.model = body.model; }
        if (body.tom !== undefined) { if (!TONS.includes(body.tom)) return send(res, 400, { erro: 'tom' }); c.tom = body.tom; } // vale no próximo processo do claude (o texto do tom vai no prompt de sistema ao iniciar)
        if (body.plan !== undefined) c.plan = !!body.plan; // atalho de /plan
        if (body.modo !== undefined) { // seletor único de modo
          if (!MODOS.includes(body.modo)) return send(res, 400, { erro: 'modo' });
          if (c.doc) return send(res, 400, { erro: 'conversas de documentação têm modo fixo' });
          if (body.modo === 'plan') { c.plan = true; autoSessao.delete(c.id); }
          else {
            c.plan = false;
            if (body.modo === 'auto') { c.modo = 'editar'; autoSessao.add(c.id); } else { c.modo = body.modo; autoSessao.delete(c.id); }
          }
          audit(P(), { chat: c.id, decisao: 'modo', quem: 'dono', motivo: `modo da conversa: ${body.modo}` });
        }
        { const j = jobAtivo(c.id); // a sessão em andamento muda de modo/modelo na hora (como Shift+Tab e /model no terminal)
          if (j && j.proj.id === P().id && !j.closing) {
            try {
              if (!!c.plan !== antes.plan && !c.doc) j.child.stdin.write(linhaModo(c.plan ? 'plan' : 'default', crypto.randomUUID()));
              if (c.model !== antes.model) j.child.stdin.write(linhaModelo(MODEL_IDS[c.model] || MODEL_IDS[DEFAULT_MODEL], crypto.randomUUID()));
            } catch {}
          } }
        if (body.title !== undefined) c.title = str(body.title, 80) || c.title;
        if (body.closed !== undefined) {
          c.closed = !!body.closed;
          if (c.closed) { // encerrar interrompe a resposta em andamento e as aprovações pendentes
            const j = jobAtivo(c.id);
            denyAll(c.id, 'Conversa encerrada.');
            autoSessao.delete(c.id);
            if (j) { // o que o Claude não chegou a ler fica no histórico, marcado (grava em `c`, que é salvo logo abaixo; gravar em arquivo seria sobrescrito)
              for (const m of [...j.fluxo.fila, ...j.depois]) if (!m.persistido) c.messages.push({ role: 'user', text: m.text, ts: m.ts, mid: m.id, naoLida: true });
              j.depois = []; j.fluxo.fila.length = 0; matar(j);
            }
          }
        }
        c.updated = Date.now();
        saveChat(c);
        return send(res, 200, chatView(c));
      }
      case '/api/chat/enviar': {
        const c = loadChats().chats[body.id];
        const text = str(body.text, 20_000).trim();
        if (!c || !text) return send(res, 400, { erro: 'conversa/texto' });
        if (c.closed) return send(res, 409, { erro: 'esta conversa está encerrada; reabra para continuar' });
        const mid = /^[0-9a-f-]{8,64}$/i.test(String(body.mid || '')) ? String(body.mid) : crypto.randomUUID();
        const vistos = midsVistos.get(c.id) || midsVistos.set(c.id, new Set()).get(c.id);
        if (vistos.has(mid)) return send(res, 200, chatView(c)); // reenvio do mesmo clique/rede: não duplica
        const j = jobAtivo(c.id);
        if (j && j.proj.id !== P().id) return send(res, 409, { erro: 'conversa pertence a outro projeto' });
        if (j && j.fluxo.fila.length + j.depois.length >= FILA_MAX) return send(res, 409, { erro: `já há ${FILA_MAX} mensagens na fila; aguarde o Claude ler algumas` });
        vistos.add(mid); if (vistos.size > 200) vistos.delete(vistos.values().next().value);
        // Com o Claude trabalhando, a mensagem vai para a fila nativa do Claude Code e só entra no histórico quando ele a lê (ordem real).
        if (j) { entregar(c, { id: mid, text, ts: Date.now(), persistido: false }); return send(res, 200, chatView(c)); }
        if (c.title === 'Nova conversa' && !c.messages.some((m) => m.role === 'user')) c.title = tituloDaMensagem(text) || c.title; // nome sugerido: início da 1ª mensagem
        c.messages.push({ role: 'user', text, ts: Date.now(), mid, model: MODELS.includes(c.model) ? c.model : DEFAULT_MODEL, plan: c.plan });
        c.updated = Date.now();
        saveChat(c);
        startJob(c, text, { mid, persistido: true });
        return send(res, 200, chatView(c));
      }
      case '/api/aprovacao/pedir': { // chamado pelo aprovador-mcp.mjs (processo filho do claude)
        const chatId = String(body.chatId || '');
        const job = jobs.get(chatId);
        if (!UUID.test(chatId) || !job || job.done || job.proj.id !== P().id || !loadChats().chats[chatId]) return send(res, 409, { erro: 'conversa não está em execução' });
        const tool = str(body.tool_name, 80), input = body.input && typeof body.input === 'object' ? body.input : {};
        if (tool === 'AskUserQuestion') {
          const perguntas = normalizarPerguntas(input);
          if (!perguntas.length) return send(res, 200, { behavior: 'deny', message: 'Pergunta inválida; siga com a melhor suposição e avise o dono.' });
          const ac = new AbortController();
          req.on('close', () => { if (!res.writableEnded) ac.abort(); });
          return send(res, 200, await askPergunta(chatId, input, perguntas, ac.signal));
        }
        if (tool === 'ExitPlanMode') {
          const ac = new AbortController();
          req.on('close', () => { if (!res.writableEnded) ac.abort(); });
          return send(res, 200, await askPlano(chatId, input, ac.signal));
        }
        { const c = loadChats().chats[chatId], modo = modoEfetivo(c); // o modo é lido AGORA: mudar no seletor vale já para o próximo pedido
          if (!c.doc && modo === 'leitura' && (FERRAMENTAS_EDICAO.includes(tool) || ['Bash', 'PowerShell'].includes(tool))) {
            audit(P(), { chat: chatId, tool, resumo: str(input.command || input.file_path, 4000), risco: 'normal', decisao: 'deny', quem: 'modo', motivo: 'conversa em modo somente leitura' });
            return send(res, 200, { behavior: 'deny', message: 'A conversa está em modo somente leitura. Não edite arquivos nem rode comandos; peça ao dono para trocar o modo, se necessário.' });
          }
          const alvo = input.file_path || input.notebook_path;
          if (!c.doc && ['editar', 'auto'].includes(modo) && FERRAMENTAS_EDICAO.includes(tool) && dentroDe(c.gen ? c.gen.dir : P().ROOT, alvo)) { // edição dentro do projeto liberada pelo modo (arquivos protegidos já são negados nas settings)
            audit(P(), { chat: chatId, tool, resumo: str(alvo, 4000), risco: 'normal', decisao: 'allow', quem: 'modo', motivo: `modo ${modo}` });
            return send(res, 200, { behavior: 'allow' });
          } }
        const v = loadChats().chats[chatId].doc && FERRAMENTAS_ARQUIVO.includes(tool)
          ? (loadChats().chats[chatId].gen ? avaliarArquivo(tool, input, { root: loadChats().chats[chatId].gen.dir, existe: fs.existsSync, modo: 'gen' }) : avaliarArquivo(tool, input, { root: P().ROOT, existe: fs.existsSync }))
          : avaliar(tool, input, compilar(P().politica));
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
        const paraExplicar = FERRAMENTAS_ARQUIVO.includes(tool) ? { ...input, file_path: v.resumo.split(' ').slice(1).join(' ') || input.file_path } : input; // mostra docs/x.md, não o caminho completo
        return send(res, 200, await askApproval(chatId, tool, paraExplicar, v, ac.signal));
      }
      case '/api/aprovacao/decidir': {
        const a = approvals.get(String(body.id));
        if (!a || a.proj.id !== P().id) return send(res, 404, { erro: 'pedido não existe mais (expirou ou foi cancelado)' });
        if (a.tipo === 'pergunta') { // resposta às perguntas do Claude: { pergunta: "opção" | "opção1, opção2" | "texto livre" }
          if (body.permitir !== true) return settle(a, 'deny', 'O dono dispensou a pergunta. Siga com a melhor suposição e avise o dono.', 'dono'), send(res, 200, { ok: true });
          const r = body.respostas && typeof body.respostas === 'object' ? body.respostas : {};
          const answers = {};
          for (const q of a.perguntas) { const t = str(r[q.question], 1000).trim(); if (!t) return send(res, 400, { erro: 'responda todas as perguntas' }); answers[q.question] = t; }
          settle(a, 'allow', '', 'dono', { updatedInput: { ...a.input, answers } });
          return send(res, 200, { ok: true });
        }
        const sessao = body.permitir === true && body.sessao === true && a.risco === 'normal'; // produção nunca vira automático
        const lembrar = body.permitir === true && body.lembrar === true && a.lembravel; // aprova e guarda o texto exato como permissão do projeto
        if (sessao) autoSessao.add(a.chatId);
        if (lembrar) { try { projetos.atualizarPolitica(a.proj.id, (c) => { if (!c.lembrados.some((l) => l.comando === a.comando)) c.lembrados.push({ comando: a.comando, quando: new Date().toISOString() }); }); } catch {} }
        const soSair = a.tipo === 'plano' && body.permitir !== true && body.sairPlano === true; // sai do planejamento sem executar: o dono vai escrever uma instrução
        settle(a, body.permitir === true ? 'allow' : 'deny', body.permitir === true ? '' : soSair ? 'O dono saiu do planejamento sem aprovar o plano e vai escrever uma instrução. Não execute nada; aguarde a próxima mensagem.' : 'O dono não aprovou o plano. Continue no planejamento e aguarde a próxima mensagem com os ajustes.', sessao ? 'dono (sessão)' : lembrar ? 'dono (lembrou)' : 'dono');
        if (sessao) for (const o of pendingOf(a.chatId)) if (o.risco === 'normal') settle(o, 'allow', '', 'sessão');
        if (a.tool === 'ExitPlanMode' && (body.permitir === true || soSair)) { // plano aprovado: desliga o modo plan, senão a próxima mensagem voltaria a abrir em plan
          const c = loadChats().chats[a.chatId];
          if (c && c.plan) { c.plan = false; c.updated = Date.now(); saveChat(c); }
        }
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
        const j = jobAtivo(String(body.id));
        if (!j || j.proj.id !== P().id) return send(res, 200, { ok: true, resultado: 'nada em execução' });
        return send(res, 200, { ok: true, resultado: interromper(j) }); // interrompe o passo em curso (Esc); a conversa continua aceitando mensagens
      }
      case '/api/chat/apagar': {
        const d = loadChats();
        if (!UUID.test(String(body.id))) return send(res, 400, { erro: 'id' });
        const j = jobAtivo(body.id);
        denyAll(body.id, 'Conversa apagada.');
        autoSessao.delete(body.id);
        if (j) { j.fluxo.fila.length = 0; j.depois = []; matar(j); }
        delete d.chats[body.id];
        jobs.delete(body.id); midsVistos.delete(body.id);
        writeJson(P().CHATS, d);
        return send(res, 200, { ok: true });
      }
      case '/api/alteracoes/commit': { // commita só os arquivos escolhidos; as conversas escolhidas entram na mensagem como trailer "Tilo-Chat"
        const arquivos = Array.isArray(body.arquivos) ? body.arquivos.slice(0, 500).map(String) : [];
        const chats = (Array.isArray(body.chats) ? body.chats.slice(0, 20).map(String) : []).filter((id) => UUID.test(id) && loadChats().chats[id]);
        try {
          const r = await gitx.commitar(P().ROOT, arquivos, str(body.mensagem, 4000), chats);
          audit(P(), { chat: chats[0] || '-', tool: 'git', resumo: `commit ${r.sha} (${r.arquivos} arquivo(s))`, risco: 'normal', decisao: 'liberado', quem: 'dono', motivo: 'botão Commitar da aba Alterações' });
          return send(res, 200, r);
        } catch (err) { return send(res, 400, { erro: err.message }); }
      }
      case '/api/alteracoes/branch': { // troca ou cria branch; não com o Claude trabalhando (os arquivos mudariam debaixo dele)
        if ([...jobs.values()].some((j) => !j.done && j.proj.id === P().id)) return send(res, 409, { erro: 'O Claude está trabalhando neste projeto. Espere terminar (ou pare a conversa) antes de trocar de branch.' });
        const criar = body.acao === 'criar';
        if (!criar && body.acao !== 'trocar') return send(res, 400, { erro: 'ação inválida' });
        try {
          const r = criar ? await gitx.criarBranch(P().ROOT, str(body.nome, 100), str(body.base, 200)) : await gitx.trocarBranch(P().ROOT, str(body.nome, 100));
          audit(P(), { chat: '-', tool: 'git', resumo: `${criar ? 'criou e trocou para' : 'trocou para'} a branch ${r.branch}`, risco: 'normal', decisao: 'liberado', quem: 'dono', motivo: 'seletor de branch da aba Alterações' });
          return send(res, 200, r);
        } catch (err) { return send(res, 400, { erro: err.message }); }
      }
      case '/api/alteracoes/pull': { // baixa e junta uma branch remota na branch atual; não com o Claude trabalhando (os arquivos mudariam debaixo dele)
        if ([...jobs.values()].some((j) => !j.done && j.proj.id === P().id)) return send(res, 409, { erro: 'O Claude está trabalhando neste projeto. Espere terminar (ou pare a conversa) antes de dar pull.' });
        try {
          const r = await gitx.puxar(P().ROOT, str(body.remota, 200));
          audit(P(), { chat: '-', tool: 'git', resumo: `pull de ${r.remota} (${r.commits} commit(s))`, risco: 'normal', decisao: 'liberado', quem: 'dono', motivo: 'botão Pull do chat' });
          return send(res, 200, r);
        } catch (err) {
          audit(P(), { chat: '-', tool: 'git', resumo: 'pull falhou', risco: 'normal', decisao: 'erro', quem: 'dono', motivo: String(err.message).slice(0, 300) });
          return send(res, 400, { erro: err.message });
        }
      }
      case '/api/alteracoes/push': { // envia os commits ao GitHub (nunca com --force); é ação de produção, a UI confirma antes
        try {
          const r = await gitx.enviar(P().ROOT);
          audit(P(), { chat: '-', tool: 'git', resumo: `push de ${r.enviados} commit(s)`, risco: 'producao', decisao: 'liberado', quem: 'dono', motivo: 'botão Enviar da aba Alterações' });
          return send(res, 200, r);
        } catch (err) {
          audit(P(), { chat: '-', tool: 'git', resumo: 'push falhou', risco: 'producao', decisao: 'erro', quem: 'dono', motivo: String(err.message).slice(0, 300) });
          return send(res, 400, { erro: err.message });
        }
      }
      case '/api/reiniciar': { // reinicia o próprio servidor: responde, encerra conversas em andamento e sobe um processo novo
        audit(P(), { chat: '-', tool: 'servidor', resumo: 'reiniciar o servidor', risco: 'normal', decisao: 'liberado', quem: 'dono', motivo: 'botão Reiniciar' });
        send(res, 200, { ok: true });
        res.on('finish', () => {
          for (const [id, j] of jobs) {
            if (j.done) continue;
            denyAll(id, 'Servidor reiniciando.');
            const f = j.fluxo; // o que o Claude já disse e o que ele não leu ficam no histórico, marcados
            salvarPerdidas(j.proj, id, [...f.fila.splice(0), ...j.depois.splice(0)]);
            gravarNoChat(j.proj, id, (c) => { const t = f.textoVivo.trim(); if (t) c.messages.push({ role: 'assistant', text: t + '\n\n[interrompido: servidor reiniciando]', ts: Date.now(), erro: true }); });
            matar(j);
          }
          // processo auxiliar separado: espera a porta liberar e sobe o servidor de novo (mesmos logs do atalho)
          const cod = `const fs=require('node:fs'),p=require('node:path'),d=${JSON.stringify(HERE)};setTimeout(()=>require('node:child_process').spawn(process.execPath,['server.mjs'],{cwd:d,detached:true,windowsHide:true,stdio:['ignore',fs.openSync(p.join(d,'tilo.log'),'w'),fs.openSync(p.join(d,'tilo.err.log'),'w')],env:{...process.env,ANTHROPIC_API_KEY:'',ANTHROPIC_AUTH_TOKEN:''}}).unref(),1500)`;
          spawn(process.execPath, ['-e', cod], { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
          setTimeout(() => process.exit(0), 100);
        });
        return;
      }
      default: return send(res, 404, { erro: 'não encontrado' });
    }
  } catch (e) {
    if (!res.headersSent) send(res, 500, { erro: String(e.message || e) });
    else res.end();
  }
}

server.listen(PORT, HOST, () => {
  console.log(`\nTilo (somente local)\n  Primeiro acesso: http://localhost:${PUBLIC_PORT}/?t=${TOKEN}\n  Depois: http://localhost:${PUBLIC_PORT}/\n`);
  console.log('Ctrl+C para encerrar.');
});
