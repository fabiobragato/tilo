'use strict';
// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

function inline(t) { // t já escapado
  return t.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}
function md(src) { // markdown mínimo e seguro (sem links, sem HTML cru)
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '', i = 0, para = [];
  const flush = () => { if (para.length) { html += '<p>' + para.map((l) => inline(esc(l))).join('<br>') + '</p>'; para = []; } };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush(); const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; html += '<pre class="cb">' + esc(buf.join('\n')) + '</pre>'; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flush(); const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(esc(c.trim())));
      const body = rows.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r) || !/-{2,}/.test(r));
      html += '<table>' + body.map((r, k) => '<tr>' + cells(r).map((c) => (k ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('') + '</table>'; continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { flush(); html += `<h${m[1].length}>${inline(esc(m[2]))}</h${m[1].length}>`; i++; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      flush(); const ord = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      html += `<${ord ? 'ol' : 'ul'}>` + items.map((x) => `<li>${inline(esc(x))}</li>`).join('') + `</${ord ? 'ol' : 'ul'}>`; continue;
    }
    if (!l.trim()) { flush(); i++; continue; }
    para.push(l); i++;
  }
  flush(); return html;
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
}
const age = (ms) => { const a = Date.now() - ms; return a < 120000 ? 'live' : a < 900000 ? 'recent' : ''; };
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); }
const PROJ = (location.pathname.match(/^\/p\/([a-z0-9-]+)/) || [])[1] || '';
const BASE_TITLE = document.title;
async function api(path, body) {
  const r = await fetch(path.replace(/^\/api\//, `/api/p/${PROJ}/`), { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.statusText);
  return r.json();
}

// ---------- estado ----------
const MODELS = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
const DEFAULT_MODEL = 'sonnet';
const mname = (m) => { const k = Object.keys(MODELS).find((x) => String(m || '').includes(x)); return k ? MODELS[k] : m ? String(m) : MODELS[DEFAULT_MODEL]; };
const PRIO = { alta: { e: 'Crítica', i: 'pi-exclamation-triangle', t: 'danger' }, media: { e: 'Importante', i: 'pi-flag', t: 'warning' }, baixa: { e: 'Pode esperar', i: 'pi-clock', t: 'success' } };
const STATUS = { aberto: ['Aberto', 'neutral', 'pi-circle'], andamento: ['Em andamento', 'primary', 'pi-play-circle'], feito: ['Feito', 'success', 'pi-check-circle'], ignorado: ['Ignorado', 'neutral', 'pi-eye-slash'] };
const S = {
  sections: [], state: { items: {} }, chats: [], term: [], files: [],
  sel: null, // { kind:'chat'|'term', id }
  tx: {}, // transcripts do terminal
  page: { pend: 1, sess: 1, arq: 1 }, size: { pend: 10, sess: 6, arq: 12 },
  f: { sec: 0, prio: '', stat: 'ativos', q: '', sessTab: 'painel', hid: false, area: '' },
  draft: {}, collapsed: ls.get('central.sidebar-collapsed', '0') === '1',
};
const st = (id) => S.state.items[id] || { status: 'aberto' };
const items = () => S.sections.flatMap((s) => s.items);
const itemById = (id) => items().find((i) => i.id === id);
const isOpen = (i) => ['aberto', 'andamento'].includes(st(i.id).status);
const route = () => (location.hash.replace(/^#\//, '') || 'visao').split('?')[0];

// ---------- componentes ----------
const badge = (txt, tone = 'neutral', icon = '') => `<span class="badge tone-${tone}">${icon ? `<i class="pi ${icon}"></i>` : ''}${esc(txt)}</span>`;
const prioBadge = (p) => badge(PRIO[p].e, PRIO[p].t, PRIO[p].i);
const statusBadge = (s) => badge(STATUS[s][0], STATUS[s][1], STATUS[s][2]);
const modelBadge = (m) => badge(mname(m), 'info', 'pi-microchip-ai');
const planBadge = () => badge('Plan', 'primary', 'pi-list-check');
const empty = (icon, txt) => `<div class="empty"><i class="pi ${icon}"></i><span>${txt}</span></div>`;
const iconBtn = (act, icon, title, data = '', cls = '') => `<button class="icon-btn ${cls}" data-act="${act}" ${data} title="${esc(title)}" aria-label="${esc(title)}"><i class="pi ${icon}"></i></button>`;

function paginate(arr, key) {
  const size = S.size[key], pages = Math.max(1, Math.ceil(arr.length / size));
  S.page[key] = Math.min(Math.max(1, S.page[key]), pages);
  const p = S.page[key], from = (p - 1) * size;
  return { rows: arr.slice(from, from + size), total: arr.length, pages, p, from, size };
}
function pager(key, pg, sizes = [6, 10, 20, 50]) {
  if (pg.total === 0) return '';
  const nums = [];
  for (let n = 1; n <= pg.pages; n++) if (n === 1 || n === pg.pages || Math.abs(n - pg.p) <= 1) nums.push(n);
  let btns = '', last = 0;
  for (const n of nums) {
    if (n - last > 1) btns += '<span class="dots">…</span>';
    btns += `<button class="pg ${n === pg.p ? 'on' : ''}" data-act="page" data-key="${key}" data-p="${n}">${n}</button>`; last = n;
  }
  return `<div class="pager"><span>${pg.from + 1}–${Math.min(pg.from + pg.size, pg.total)} de ${pg.total}</span>
    <div class="pages"><button class="pg" data-act="page" data-key="${key}" data-p="${pg.p - 1}" ${pg.p === 1 ? 'disabled' : ''} aria-label="Anterior"><i class="pi pi-angle-left"></i></button>${btns}<button class="pg" data-act="page" data-key="${key}" data-p="${pg.p + 1}" ${pg.p === pg.pages ? 'disabled' : ''} aria-label="Próxima"><i class="pi pi-angle-right"></i></button></div>
    <label>Por página <select class="sel sm" data-chg="size" data-key="${key}">${sizes.map((n) => `<option ${n === pg.size ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
}

// ---------- shell ----------
const NAV = [
  ['visao', 'Visão geral', 'pi-th-large'],
  ['pendencias', 'Pendências', 'pi-list-check'],
  ['sessoes', 'Sessões', 'pi-history'],
  ['chat', 'Conversar com Claude', 'pi-sparkles'],
  ['arquivos', 'Docs e planejamentos', 'pi-folder-open'],
  ['politica', 'Política de comandos', 'pi-shield'],
];
function navCount(id) {
  const open = items().filter(isOpen), liveN = S.chats.filter((c) => c.running).length + S.term.filter((x) => !x.oculto && Date.now() - x.mtime < 120000).length;
  if (id === 'pendencias') { const n = open.filter((i) => i.prio === 'alta').length; return n ? `<span class="nav-count danger" title="Críticas abertas">${n}</span>` : `<span class="nav-count">${open.length}</span>`; }
  if (id === 'sessoes' && liveN) return `<span class="nav-count live" title="Ativas agora">${liveN}</span>`;
  return '';
}
function renderNav() {
  const r = route();
  $('#nav').innerHTML = NAV.map(([id, label, icon]) => `<a class="nav-item ${r === id ? 'active' : ''}" href="#/${id}" data-label="${esc(label)}" aria-label="${esc(label)}"><i class="pi ${icon}"></i><span class="lbl">${esc(label)}</span>${navCount(id)}</a>`).join('');
  $('#sidebar').classList.toggle('collapsed', S.collapsed);
  const t = $('#toggle'); t.firstElementChild.className = 'pi ' + (S.collapsed ? 'pi-angle-double-right' : 'pi-angle-double-left');
  t.dataset.label = S.collapsed ? 'Expandir menu' : 'Recolher menu'; t.setAttribute('aria-label', t.dataset.label);
}

// ---------- visão geral ----------
function viewVisao() {
  const open = items().filter(isOpen), by = (p) => open.filter((i) => i.prio === p).length;
  const doing = items().filter((i) => st(i.id).status === 'andamento');
  const crit = open.filter((i) => i.prio === 'alta' && st(i.id).status !== 'andamento').slice(0, 5);
  const act = recentSessions().slice(0, 5);
  const liveN = act.filter((a) => a.running || Date.now() - a.t < 120000).length;
  const metric = (n, label, icon, tone, go) => `<div class="card metric" data-act="go" data-to="${go}"><div class="ico tone-${tone}"><i class="pi ${icon}"></i></div><div><strong>${n}</strong><span>${label}</span></div></div>`;
  return `<div class="page-head"><div><h1 class="page-title">Visão geral</h1><p class="page-sub">O que falta decidir, fazer e conferir — e o que está em andamento agora.</p></div></div>
  <div class="grid g5" style="margin-bottom:16px">
    ${metric(by('alta'), 'Críticas abertas', 'pi-exclamation-triangle', 'danger', 'pendencias?prio=alta')}
    ${metric(by('media'), 'Importantes', 'pi-flag', 'warning', 'pendencias?prio=media')}
    ${metric(by('baixa'), 'Podem esperar', 'pi-clock', 'success', 'pendencias?prio=baixa')}
    ${metric(doing.length, 'Em andamento', 'pi-play-circle', 'primary', 'pendencias?stat=andamento')}
    ${metric(liveN, 'Sessões ativas agora', 'pi-bolt', 'info', 'sessoes')}
  </div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-play-circle"></i></div><h3>Trabalhando agora</h3><a href="#/pendencias?stat=andamento">Ver todas</a></div><div class="card-body">
      ${doing.length ? doing.slice(0, 5).map((i) => `<div class="row-line" data-act="open-item" data-id="${i.id}"><span class="badge tone-${PRIO[i.prio].t}"><i class="pi ${PRIO[i.prio].i}"></i></span><div class="rl-t trunc">${esc(i.title)}</div><span class="rl-s">${esc(short(i.section.replace(/\(.*\)/, ''), 22))}</span></div>`).join('') : empty('pi-play-circle', 'Nada em andamento. Marque uma pendência como “Em andamento”.')}
    </div></section>
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-history"></i></div><h3>Sessões recentes</h3><a href="#/sessoes">Ver todas</a></div><div class="card-body">
      ${act.length ? act.map((a) => `<div class="row-line" data-act="open-sess" data-kind="${a.kind}" data-id="${a.id}"><span class="dot ${a.running ? 'live' : age(a.t)}"></span><div class="rl-t trunc">${esc(a.title)}</div>${a.plan ? badge('Plan', 'primary') : ''}<span class="rl-s">${a.kind === 'chat' ? 'painel' : 'terminal'} · ${ago(a.t)}</span></div>`).join('') : empty('pi-history', 'Sem sessões recentes.')}
    </div></section>
    <section class="card"><div class="card-head"><div class="ico tone-danger"><i class="pi pi-exclamation-triangle"></i></div><h3>Próximas ações críticas</h3><a href="#/pendencias?prio=alta">Ver todas</a></div><div class="card-body">
      ${crit.length ? crit.map((i) => `<div class="row-line" data-act="open-item" data-id="${i.id}"><div class="rl-t trunc">${esc(i.title)}</div><span class="rl-s">${esc(short(i.section.replace(/\(.*\)/, ''), 22))}</span></div>`).join('') : empty('pi-check-circle', 'Nenhuma crítica aberta 🎉')}
    </div></section>
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-folder-open"></i></div><h3>Alterados recentemente</h3><a href="#/arquivos">Ver todos</a></div><div class="card-body">
      ${S.files.slice(0, 6).map((f) => `<div class="row-line" data-act="file" data-p="${esc(f.path)}"><i class="pi pi-file" style="color:var(--faint)"></i><div class="rl-t trunc">${esc(f.path)}</div><span class="rl-s">${ago(f.mtime)}</span></div>`).join('') || empty('pi-folder-open', 'Sem arquivos.')}
    </div></section>
  </div>`;
}
function recentSessions() {
  return [
    ...S.chats.map((c) => ({ kind: 'chat', id: c.id, title: c.title, t: c.updated, running: c.running, plan: c.plan })),
    ...S.term.filter((x) => !x.oculto).map((x) => ({ kind: 'term', id: x.id, title: x.apelido || x.title || x.primeiro || x.id.slice(0, 8), t: x.mtime, plan: x.mode === 'plan' })),
  ].sort((a, b) => b.t - a.t);
}

// ---------- pendências ----------
function viewPend() {
  const f = S.f, all = items();
  const secs = S.sections.filter((s) => s.items.length);
  const filtered = all.filter((i) => {
    const sts = st(i.id).status;
    if (f.sec && S.sections.find((s) => s.n === f.sec)?.items.indexOf(i) < 0) return false;
    if (f.prio && i.prio !== f.prio) return false;
    if (f.stat === 'ativos' ? !['aberto', 'andamento'].includes(sts) : f.stat && sts !== f.stat) return false;
    return !f.q || (i.title + ' ' + i.desc + ' ' + i.how).toLowerCase().includes(f.q.toLowerCase());
  });
  const pg = paginate(filtered, 'pend');
  let lastGroup = null, lastSec = null, rows = '';
  for (const i of pg.rows) {
    if (i.section !== lastSec) { lastSec = i.section; lastGroup = null; rows += `<div class="list-sep">${esc(i.section)}</div>`; }
    if (i.group && i.group !== lastGroup) { lastGroup = i.group; rows += `<div class="list-sep" style="background:#fff;color:var(--muted)">${esc(i.group)}</div>`; }
    rows += itemRow(i);
  }
  const cnt = (n) => all.filter((i) => i.section === S.sections.find((s) => s.n === n)?.title && isOpen(i)).length;
  return `<div class="page-head"><div><h1 class="page-title">Pendências</h1><p class="page-sub">Tudo o que depende de você. Concluído = marcar “Feito” e remover do README.</p></div></div>
  <div class="toolbar"><div class="seg">
    <button data-act="sec" data-n="0" class="${!f.sec ? 'on' : ''}">Todas <span class="n">${all.filter(isOpen).length}</span></button>
    ${secs.map((s) => `<button data-act="sec" data-n="${s.n}" class="${f.sec === s.n ? 'on' : ''}">${esc(s.title.replace(/\(.*\)/, '').trim())} <span class="n">${cnt(s.n)}</span></button>`).join('')}
  </div></div>
  <div class="toolbar">
    <select class="sel" data-chg="fprio" aria-label="Prioridade"><option value="">Todas as prioridades</option>${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${f.prio === k ? 'selected' : ''}>${v.e}</option>`).join('')}</select>
    <select class="sel" data-chg="fstat" aria-label="Status">${[['ativos', 'Ativos'], ['', 'Todos'], ['aberto', 'Abertos'], ['andamento', 'Em andamento'], ['feito', 'Feitos'], ['ignorado', 'Ignorados']].map(([v, l]) => `<option value="${v}" ${f.stat === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${f.q ? `<button class="btn sm" data-act="clearq"><i class="pi pi-times"></i> Busca: ${esc(short(f.q, 24))}</button>` : ''}
    <span class="sp"></span><span class="muted small">${filtered.length} item(ns)</span>
  </div>
  <section class="card">${rows || empty('pi-check-circle', 'Nada por aqui com esses filtros 🎉')}</section>${pager('pend', pg)}`;
}
function itemRow(i) {
  const e = st(i.id), linked = S.chats.filter((c) => c.itemId === i.id).length + S.term.filter((x) => x.itemId === i.id && !x.oculto).length;
  return `<div class="item ${i.prio} ${e.status} ${S.focus === i.id ? 'foco' : ''}" data-id="${i.id}">
    <div class="it-main"><div class="it-title">${esc(i.title)}</div>
      <p class="it-desc">${inline(esc(i.desc))}</p>${i.how && !(i.refs.length && i.how.replace(/`/g, '').trim().split(/\s+/)[0] === i.refs[0]) ? `<p class="it-how">${inline(esc(i.how))}</p>` : ''}
      <div class="it-meta">${prioBadge(i.prio)}${statusBadge(e.status)}${linked ? badge(`${linked} conversa(s)`, 'info', 'pi-comments') : ''}${i.refs.map((p) => `<button class="ref" data-act="file" data-p="${esc(p)}"><i class="pi pi-file"></i>${esc(short(p, 44))}</button>`).join('')}</div></div>
    <div class="it-act">
      <select class="sel sm" data-chg="status" data-id="${i.id}" aria-label="Status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      ${iconBtn('chat-item', 'pi-comments', 'Conversar com o Claude sobre isso', `data-id="${i.id}"`)}
      ${e.status === 'feito' ? iconBtn('remove', 'pi-trash', 'Remover do README (concluído)', `data-id="${i.id}"`, 'danger') : ''}
    </div></div>`;
}

// ---------- sessões ----------
function viewSess() {
  const f = S.f, term = S.term.filter((x) => f.hid || !x.oculto);
  const list = f.sessTab === 'painel' ? S.chats : term;
  const pg = paginate(list, 'sess');
  const body = pg.rows.map((x) => (f.sessTab === 'painel' ? chatSessRow(x) : termSessRow(x))).join('') ||
    empty('pi-history', f.sessTab === 'painel' ? 'Nenhuma conversa. Use o ícone de conversa numa pendência.' : 'Nenhuma sessão do terminal nos últimos 7 dias.');
  return `<div class="page-head"><div><h1 class="page-title">Sessões</h1><p class="page-sub">Conversas do painel e sessões do Claude Code no terminal deste projeto (últimos 7 dias).</p></div>
    <button class="btn primary" data-act="new-chat"><i class="pi pi-plus"></i> Nova conversa</button></div>
  <div class="toolbar"><div class="seg">
    <button data-act="stab" data-t="painel" class="${f.sessTab === 'painel' ? 'on' : ''}"><i class="pi pi-sparkles"></i> Painel <span class="n">${S.chats.length}</span></button>
    <button data-act="stab" data-t="term" class="${f.sessTab === 'term' ? 'on' : ''}"><i class="pi pi-desktop"></i> Terminal <span class="n">${S.term.filter((x) => !x.oculto).length}</span></button></div>
    <span class="sp"></span>${f.sessTab === 'term' ? `<label class="switch"><input type="checkbox" data-chg="hid" ${f.hid ? 'checked' : ''}> mostrar ocultas</label>` : ''}</div>
  <section class="card">${body}</section>${pager('sess', pg, [6, 10, 20])}`;
}
function sessHead(title, t, running, plan, model, itemId) {
  const it = itemId && itemById(itemId);
  return `<div class="sess-top"><span class="dot ${running ? 'live' : age(t)}"></span><b>${esc(title)}</b>${plan ? planBadge() : ''}${modelBadge(model)}${badge(running ? 'respondendo…' : ago(t), running ? 'success' : 'neutral', 'pi-clock')}${it ? badge(short(it.title, 30), 'primary', 'pi-link') : ''}</div>`;
}
function chatSessRow(c) {
  const rev = [...c.messages].reverse(), q = rev.find((m) => m.role === 'user')?.text, a = rev.find((m) => m.role === 'assistant')?.text;
  return `<div class="sess">${sessHead(c.title, c.updated, c.running, c.plan, c.model, c.itemId)}
    ${q ? `<p class="q"><b>Você:</b> ${esc(q)}</p>` : ''}${a ? `<p class="q"><b>Claude:</b> ${esc(a)}</p>` : ''}
    <div class="acts"><button class="btn sm primary" data-act="open-sess" data-kind="chat" data-id="${c.id}"><i class="pi pi-comments"></i> Abrir</button>${iconBtn('del-chat', 'pi-trash', 'Apagar conversa', `data-id="${c.id}"`, 'danger')}</div></div>`;
}
function linkSelect(x) {
  return `<select class="sel sm" data-chg="link" data-id="${x.id}" aria-label="Vincular a uma pendência"><option value="">Sem vínculo</option>${items().filter((i) => st(i.id).status !== 'feito').map((i) => `<option value="${i.id}" ${x.itemId === i.id ? 'selected' : ''}>${esc(short(i.title, 48))}</option>`).join('')}</select>`;
}
function termSessRow(x) {
  const title = x.apelido || x.title || x.primeiro || x.id.slice(0, 8);
  return `<div class="sess" style="${x.oculto ? 'opacity:.55' : ''}">${sessHead(title, x.mtime, false, x.mode === 'plan', x.model, x.itemId)}
    ${x.ultimo ? `<p class="q"><b>Você:</b> ${esc(x.ultimo)}</p>` : ''}${x.resposta ? `<p class="q"><b>Claude:</b> ${esc(x.resposta)}</p>` : ''}
    <div class="acts"><button class="btn sm primary" data-act="open-sess" data-kind="term" data-id="${x.id}"><i class="pi pi-eye"></i> Ver conversa</button>${linkSelect(x)}
      ${iconBtn('rename', 'pi-pencil', 'Dar apelido', `data-id="${x.id}"`)}${iconBtn('resume', 'pi-copy', 'Copiar “claude --resume” para retomar no terminal', `data-id="${x.id}"`)}${iconBtn('hide', x.oculto ? 'pi-eye' : 'pi-eye-slash', x.oculto ? 'Mostrar' : 'Ocultar', `data-id="${x.id}"`)}</div></div>`;
}

// ---------- arquivos ----------
function viewArq() {
  const area = (p) => p.split('/')[0];
  const f = S.f, list = S.files.filter((x) => !f.area || area(x.path) === f.area);
  const pg = paginate(list, 'arq');
  const AREA = { docs: ['Docs', 'success'], planning: ['Planning', 'warning'], pendencias: ['Pendências', 'primary'] };
  return `<div class="page-head"><div><h1 class="page-title">Docs e planejamentos</h1><p class="page-sub"><b>docs/</b> = só o que está implantado · <b>planning/</b> = planos para LLMs · <b>pendencias/</b> = este painel.</p></div></div>
  <div class="toolbar"><div class="seg">${[['', 'Todos'], ['docs', 'Docs'], ['planning', 'Planning'], ['pendencias', 'Pendências']].map(([v, l]) => `<button data-act="area" data-v="${v}" class="${f.area === v ? 'on' : ''}">${l}</button>`).join('')}</div><span class="sp"></span><span class="muted small">${list.length} arquivo(s) · mais recentes primeiro</span></div>
  <section class="card tbl-wrap"><table class="tbl"><thead><tr><th>Arquivo</th><th>Área</th><th style="text-align:right">Modificado</th></tr></thead><tbody>
    ${pg.rows.map((x) => { const a = AREA[area(x.path)] || [area(x.path), 'neutral']; return `<tr class="clk" data-act="file" data-p="${esc(x.path)}"><td class="path" title="${esc(x.path)}"><i class="pi pi-file" style="color:var(--faint);margin-right:8px"></i>${esc(x.path)}</td><td>${badge(a[0], a[1])}</td><td class="num">${ago(x.mtime)}</td></tr>`; }).join('')}
  </tbody></table>${pg.total ? '' : empty('pi-folder-open', 'Nenhum arquivo.')}</section>${pager('arq', pg, [12, 25, 50])}`;
}

// ---------- chat ----------
const curChat = () => (S.sel?.kind === 'chat' ? S.chats.find((c) => c.id === S.sel.id) : null);
const curTerm = () => (S.sel?.kind === 'term' ? S.term.find((x) => x.id === S.sel.id) : null);
function viewChat() {
  return `<div class="page-head"><div><h1 class="page-title">Conversar com Claude</h1><p class="page-sub">Usa a sua assinatura do Claude. Comandos: <code>/plan</code> e <code>/model sonnet|opus|haiku</code>.</p></div>
    <button class="btn primary" data-act="new-chat"><i class="pi pi-plus"></i> Nova conversa</button></div>
  <div class="chat-layout">
    <aside class="card chat-list"><div class="hd">Conversas</div><div class="bd" id="cl-body"></div></aside>
    <section class="card chat-main">
      <div class="chat-head" id="chat-head"></div><div id="chat-ctx"></div>
      <div class="chat-log" id="chat-log"></div>
      <div class="composer" id="composer">
        <div class="quick" id="quick">${[['Explique', 'Explique essa pendência em linguagem simples: o que é, por que importa e o que acontece se eu não fizer.'], ['Passo a passo', 'Me dê o passo a passo para eu fazer isso, com comandos exatos quando houver.'], ['Já está feito?', 'Confira no código e em docs/ se isso já está resolvido. Diga com evidência (arquivo e linha).'], ['Recomende', 'Dê uma recomendação clara com prós e contras, para eu decidir.']].map(([l, p]) => `<button class="chipbtn" data-act="quick" data-p="${esc(p)}">${l}</button>`).join('')}</div>
        <textarea id="msg" placeholder="Pergunte algo… ou use /plan, /model opus (Ctrl+Enter envia)"></textarea>
        <div class="bar"><div style="display:flex;gap:14px;align-items:center"><label class="switch"><input type="checkbox" id="edit"> permitir editar arquivos</label><label class="switch" title="O Claude pede e você aprova cada comando aqui, na tela"><input type="checkbox" id="exec"> permitir comandos (com aprovação)</label><span class="hint" id="hint"></span></div>
          <div style="display:flex;gap:8px"><button class="btn danger" id="stop" data-act="stop" hidden><i class="pi pi-stop-circle"></i> Parar</button><button class="btn primary" id="send" data-act="send"><i class="pi pi-send"></i> Enviar</button></div></div>
      </div>
      <div class="composer" id="ro" hidden><span class="muted small">Histórico somente leitura da sessão do terminal. O painel não consegue continuar a mesma sessão (ela pertence ao seu terminal).</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="continue-term"><i class="pi pi-sparkles"></i> Continuar no painel</button><button class="btn" data-act="resume" data-id="${S.sel?.id || ''}"><i class="pi pi-copy"></i> Copiar claude --resume</button></div></div>
    </section></div>`;
}
function updateChat() {
  if (route() !== 'chat' || !$('#cl-body')) return;
  // lista lateral
  const painel = S.chats.map((c) => `<div class="cl-item ${S.sel?.kind === 'chat' && S.sel.id === c.id ? 'on' : ''}" data-act="open-sess" data-kind="chat" data-id="${c.id}"><span class="dot ${c.running ? 'live' : age(c.updated)}" style="margin-top:5px"></span><div class="trunc" style="flex:1"><div class="t trunc">${esc(c.title)}</div><div class="s">${mname(c.model)}${c.plan ? ' · plan' : ''} · ${ago(c.updated)}</div></div></div>`).join('');
  const term = S.term.filter((x) => !x.oculto).slice(0, 8).map((x) => `<div class="cl-item ${S.sel?.kind === 'term' && S.sel.id === x.id ? 'on' : ''}" data-act="open-sess" data-kind="term" data-id="${x.id}"><span class="dot ${age(x.mtime)}" style="margin-top:5px"></span><div class="trunc" style="flex:1"><div class="t trunc">${esc(x.apelido || x.title || x.primeiro || x.id.slice(0, 8))}</div><div class="s">terminal · ${mname(x.model)}${x.mode === 'plan' ? ' · plan' : ''} · ${ago(x.mtime)}</div></div></div>`).join('');
  $('#cl-body').innerHTML = `<div class="list-sep" style="margin:-8px -8px 4px">Painel</div>${painel || '<div class="empty small">Sem conversas</div>'}<div class="list-sep" style="margin:8px -8px 4px">Terminal (recentes)</div>${term || '<div class="empty small">Sem sessões</div>'}`;

  const c = curChat(), t = curTerm(), ro = !!t;
  $('#composer').hidden = ro || !c; $('#ro').hidden = !ro;
  if (!c && !t) {
    $('#chat-head').innerHTML = '<div class="ttl muted">Nenhuma conversa selecionada</div>'; $('#chat-ctx').innerHTML = '';
    $('#chat-log').innerHTML = empty('pi-sparkles', 'Escolha uma conversa ao lado, crie uma nova ou clique no ícone de conversa numa pendência.'); return;
  }
  if (t) { // transcript somente leitura
    const title = t.apelido || t.title || t.primeiro || t.id.slice(0, 8), it = t.itemId && itemById(t.itemId);
    $('#chat-head').innerHTML = `<div class="ttl trunc">${esc(title)}</div>${badge('Terminal', 'neutral', 'pi-desktop')}${modelBadge(t.model)}${t.mode === 'plan' ? planBadge() : ''}${badge(ago(t.mtime), 'neutral', 'pi-clock')}`;
    $('#chat-ctx').innerHTML = it ? `<div class="ctx"><i class="pi pi-link"></i><div><b>${esc(it.title)}</b></div></div>` : '';
    const tr = S.tx[t.id];
    $('#chat-log').innerHTML = !tr ? '<div class="note">Carregando histórico…</div>' : tr.error ? `<div class="note">${esc(tr.error)}</div>` : '<div class="note">Últimas mensagens da sessão — somente leitura</div>' + tr.messages.map((m) => bubble(m, true)).join('');
    if (tr?.messages) $('#chat-log').scrollTop = 1e9; return;
  }
  const it = c.itemId && itemById(c.itemId);
  $('#chat-head').innerHTML = `<div class="ttl trunc" title="Clique para renomear" data-act="rename-chat" style="cursor:text">${esc(c.title)}</div>
    <select class="sel sm" data-chg="model" title="Modelo (/model)" aria-label="Modelo">${Object.entries(MODELS).map(([k, v]) => `<option value="${k}" ${c.model === k ? 'selected' : ''}>${v}${k === DEFAULT_MODEL ? ' (padrão)' : ''}</option>`).join('')}</select>
    <button class="btn sm ${c.plan ? 'primary' : ''}" data-act="plan" title="/plan — o Claude só lê e planeja, não altera arquivos"><i class="pi pi-list-check"></i> Plan ${c.plan ? 'ligado' : 'desligado'}</button>
    ${c.autoAprovar ? `<button class="btn sm" data-act="revogar-sessao" data-id="${c.id}" title="Voltar a pedir aprovação para cada comando"><i class="pi pi-lock-open"></i> Aprovação automática ligada · desligar</button>` : ''}
    ${iconBtn('del-chat', 'pi-trash', 'Apagar conversa', `data-id="${c.id}"`, 'danger')}`;
  $('#chat-ctx').innerHTML = it ? `<div class="ctx"><i class="pi pi-link"></i><div><b>${esc(it.title)}</b><div class="muted">${esc(it.section)}</div></div></div>` : '';
  $('#edit').checked = c.edit && !c.plan; $('#edit').disabled = c.plan; $('#exec').checked = !!c.exec && !c.plan; $('#exec').disabled = c.plan;
  $('#stop').hidden = !c.running; $('#send').disabled = c.running;
  const key = JSON.stringify([c.id, c.messages.length, c.running, c.plan, c.edit, c.exec, c.autoAprovar, c.model]);
  if (S.chatKey === key) return; S.chatKey = key;
  const ta = $('#msg'); if (ta.dataset.cid !== c.id) { ta.value = S.draft[c.id] || ''; ta.dataset.cid = c.id; }
  $('#chat-log').innerHTML = `<div class="note">${c.plan ? 'Modo plan: o Claude só lê e planeja, não altera arquivos.' : [c.edit && '⚠ Edição de arquivos liberada.', c.exec && '⚠ Comandos liberados: cada um precisa da sua aprovação.'].filter(Boolean).join(' ') || 'Somente leitura'} · modelo ${mname(c.model)}</div>` +
    c.messages.map((m) => bubble(m)).join('') + (c.running ? '<div class="msg a" id="live"><div class="av"><i class="pi pi-sparkles"></i></div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>' : '');
  if (c.running) pollStream(c.id);
  $('#chat-log').scrollTop = 1e9;
}
function bubble(m, ro) {
  const u = m.role === 'user';
  return `<div class="msg ${u ? 'u' : 'a'} ${m.erro ? 'erro' : ''}"><div class="av">${u ? 'EU' : '<i class="pi pi-sparkles"></i>'}</div><div class="bubble">${u ? esc(m.text) : md(m.text)}${!u ? `<div class="meta">${mname(m.model)}${m.plan ? ' · plan' : ''}</div>` : ''}</div></div>`;
}
function renderApprovals(list) {
  const dlg = $('#adlg'), n = list.length;
  document.title = (n ? `(${n}) Aprovação pendente · ` : '') + BASE_TITLE;
  if (!n) { if (dlg.open) dlg.close(); dlg.dataset.id = ''; return; }
  const a = list[0], prod = a.risco === 'producao';
  if (dlg.dataset.id === a.id && dlg.open) { const c = $('#adlg-n'); if (c) c.textContent = n > 1 ? `1 de ${n} pedidos` : ''; return; }
  dlg.dataset.id = a.id;
  dlg.className = 'adlg' + (prod ? ' prod' : '');
  dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi ${prod ? 'pi-exclamation-triangle' : 'pi-shield'}"></i></span>
      <div class="att"><b id="adlg-t">${prod ? 'Comando que afeta produção ou rede externa' : 'O Claude quer executar um comando'}</b>
      <span class="asub">${esc(a.tool)}${prod ? ' · ' + esc(a.motivo) : ''}<span id="adlg-n" class="acount">${n > 1 ? `1 de ${n} pedidos` : ''}</span></span></div></div>
    <div class="abd"><pre class="acode">${esc(a.resumo)}</pre>
      ${prod ? `<label class="aconf"><input type="checkbox" id="aprov-ok"> Li o comando e entendo que ele pode afetar produção ou enviar dados para fora.</label>` : '<p class="ahint">Confira o comando acima antes de aprovar. Nada roda sem o seu clique.</p>'}</div>
    <div class="aft"><button class="btn danger" data-act="negar" data-id="${a.id}"><i class="pi pi-times"></i> Negar</button><span class="sp"></span>
      ${prod ? '' : `<button class="btn" data-act="aprovar-sessao" data-id="${a.id}" title="Libera os próximos comandos comuns desta conversa. Produção, rede externa e comandos bloqueados continuam pedindo/negando."><i class="pi pi-check-circle"></i> Aprovar todos da sessão</button>`}
      <button class="btn primary" data-act="aprovar" data-id="${a.id}" ${prod ? 'disabled' : ''}><i class="pi pi-check"></i> Aprovar</button></div>`;
  if (!dlg.open) dlg.showModal();
}
let polling = null;
function pollStream(id) {
  if (polling === id) return; polling = id;
  (async () => {
    while (polling === id) {
      try {
        const s = await api('/api/chat/stream?id=' + id);
        const live = $('#live .bubble');
        if (live && S.sel?.id === id) { live.innerHTML = s.text ? md(s.text) : '<span class="typing"><i></i><i></i><i></i></span>'; $('#chat-log').scrollTop = 1e9; }
        renderApprovals(s.pendentes || []);
        if (s.done) { polling = null; S.chatKey = null; renderApprovals([]); await loadChats(); return; }
      } catch {}
      await new Promise((r) => setTimeout(r, 700));
    }
  })();
}
async function openTerm(id) {
  S.sel = { kind: 'term', id }; S.chatKey = null;
  if (!S.tx[id]) { try { S.tx[id] = await api('/api/sessao?id=' + id); S.tx[id].mtime = S.term.find((x) => x.id === id)?.mtime; } catch (e) { S.tx[id] = { error: e.message }; } }
  updateChat();
}
async function newChat(extra = {}) {
  const c = await api('/api/chat/novo', extra);
  await loadChats(); S.sel = { kind: 'chat', id: c.id }; S.chatKey = null; location.hash = '#/chat'; render(); setTimeout(() => $('#msg')?.focus(), 50);
}
async function cfg(patch) {
  const c = curChat(); if (!c) return;
  Object.assign(c, await api('/api/chat/config', { id: c.id, ...patch })); S.chatKey = null; updateChat(); renderNav();
}
const ALIAS = { sonnet: 'sonnet', opus: 'opus', haiku: 'haiku', padrao: 'sonnet', 'padrão': 'sonnet', default: 'sonnet', '': 'sonnet' };
async function send(textArg) {
  const c = curChat(); const ta = $('#msg'); let text = (textArg ?? ta.value).trim(); if (!c || !text || c.running) return;
  let m;
  if ((m = text.match(/^\/model(?:\s+(\S*))?$/i))) {
    const v = (m[1] || '').toLowerCase();
    if (!(v in ALIAS)) { toast('Modelos: sonnet (padrão), opus, haiku'); return; }
    ta.value = ''; S.draft[c.id] = ''; hint(); await cfg({ model: ALIAS[v] }); toast('Modelo: ' + MODELS[ALIAS[v]]); return;
  }
  if ((m = text.match(/^\/plan(?:\s+([\s\S]+))?$/i))) {
    if (!m[1]) { ta.value = ''; S.draft[c.id] = ''; hint(); await cfg({ plan: !c.plan }); toast(curChat().plan ? 'Plan ligado' : 'Plan desligado'); return; }
    await cfg({ plan: true }); text = m[1].trim();
  } else if (text.startsWith('/')) { toast('Comandos disponíveis: /plan e /model'); return; }
  ta.value = ''; S.draft[c.id] = ''; hint();
  try { Object.assign(c, await api('/api/chat/enviar', { id: c.id, text })); S.chatKey = null; updateChat(); await loadChats(); } catch (x) { toast(x.message); }
}
function hint() {
  const v = $('#msg')?.value || '', h = $('#hint'); if (!h) return;
  h.textContent = /^\/m/i.test(v) ? '/model sonnet · opus · haiku' : /^\/p/i.test(v) ? '/plan alterna o modo plan · /plan <texto> envia já em plan' : v.startsWith('/') ? 'Comandos: /plan  /model' : '';
}

// ---------- roteamento / render ----------
function render() {
  renderNav();
  const r = route(), v = $('#view');
  const q = new URLSearchParams((location.hash.split('?')[1]) || '');
  if (q.size && r === 'pendencias') { if (q.get('prio') !== null) S.f.prio = q.get('prio'); if (q.get('stat') !== null) S.f.stat = q.get('stat'); S.f.sec = 0; S.page.pend = 1; history.replaceState(null, '', '#/pendencias'); }
  if (r === 'chat' && q.get('s')) { const id = q.get('s'); S.sel = S.chats.find((c) => c.id === id) ? { kind: 'chat', id } : { kind: 'term', id }; S.chatKey = null; history.replaceState(null, '', '#/chat'); }
  if (r === 'chat') { if (!v.querySelector('.chat-layout')) { v.innerHTML = viewChat(); S.chatKey = null; } if (!S.sel && (S.chats[0])) S.sel = { kind: 'chat', id: S.chats[0].id }; updateChat(); if (S.sel?.kind === 'term' && !S.tx[S.sel.id]) openTerm(S.sel.id); return; }
  if (r === 'politica') { if (!v.querySelector('.pol-page')) { v.innerHTML = '<div class="pol-page" id="pol-root"><div class="note">Carregando…</div></div>'; loadPolitica(); } return; }
  v.innerHTML = r === 'pendencias' ? viewPend() : r === 'sessoes' ? viewSess() : r === 'arquivos' ? viewArq() : viewVisao();
  if (S.focus && r === 'pendencias') document.querySelector(`[data-id="${S.focus}"].item`)?.scrollIntoView({ block: 'center' });
}
window.addEventListener('hashchange', () => { S.focus = null; render(); });

// ---------- eventos ----------
$('#adlg').addEventListener('cancel', (e) => e.preventDefault()); // Esc não fecha: exige Negar/Aprovar
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset, act = d.act;
  try {
    switch (act) {
      case 'go': location.hash = '#/' + d.to; break;
      case 'page': S.page[d.key] = Number(d.p); render(); window.scrollTo({ top: 0 }); break;
      case 'sec': S.f.sec = Number(d.n); S.page.pend = 1; render(); break;
      case 'clearq': S.f.q = ''; $('#gsearch').value = ''; S.page.pend = 1; render(); break;
      case 'stab': S.f.sessTab = d.t; S.page.sess = 1; render(); break;
      case 'area': S.f.area = d.v; S.page.arq = 1; render(); break;
      case 'file': openFile(d.p); break;
      case 'open-item': S.f = { ...S.f, sec: 0, prio: '', stat: '', q: '' }; S.focus = d.id; { const all = items(); S.page.pend = Math.floor(all.findIndex((i) => i.id === d.id) / S.size.pend) + 1; } location.hash = '#/pendencias'; render(); break;
      case 'open-sess': S.sel = { kind: d.kind, id: d.id }; S.chatKey = null; if (route() !== 'chat') location.hash = '#/chat'; else render(); if (d.kind === 'term') openTerm(d.id); break;
      case 'chat-item': {
        const i = itemById(d.id), ex = S.chats.find((c) => c.itemId === i.id);
        if (ex) { S.sel = { kind: 'chat', id: ex.id }; S.chatKey = null; location.hash = '#/chat'; render(); }
        else await newChat({ title: short(i.title, 40), itemId: i.id, contexto: `Seção "${i.section}", prioridade ${i.prio}:\n${i.raw}` });
        break;
      }
      case 'new-chat': await newChat(); break;
      case 'del-chat': if (confirm('Apagar esta conversa?')) { await api('/api/chat/apagar', { id: d.id || curChat()?.id }); if (S.sel?.id === (d.id || S.sel?.id)) S.sel = null; await loadChats(); render(); } break;
      case 'rename-chat': { const c = curChat(); const v = c && prompt('Nome da conversa:', c.title); if (v) cfg({ title: v }); break; }
      case 'plan': cfg({ plan: !curChat().plan }); break;
      case 'send': send(); break;
      case 'aprovar': case 'negar': case 'aprovar-sessao': {
        $('#adlg').querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await api('/api/aprovacao/decidir', { id: d.id, permitir: act !== 'negar', sessao: act === 'aprovar-sessao' }); if (act === 'aprovar-sessao') toast('Comandos comuns aprovados até o fim desta sessão. Produção continua pedindo.'); }
        catch (x) { toast(x.message); }
        $('#adlg').close(); $('#adlg').dataset.id = ''; loadChats();
        break;
      }
      case 'revogar-sessao': await api('/api/aprovacao/sessao', { id: d.id }); toast('Aprovação automática desligada.'); await loadChats(); S.chatKey = null; updateChat(); break;
      case 'pol-add': { const sec = d.sec; S.pol.projeto[sec].push({ padrao: '', motivo: '' }); renderPolitica(); document.querySelector(`.pol-rows[data-sec="${sec}"] .pol-row:last-child input`)?.focus(); break; }
      case 'pol-del': S.pol.projeto[d.sec].splice(Number(d.i), 1); S.pol.sujo = true; renderPolitica(); break;
      case 'pol-save': {
        const p = S.pol.projeto, limpa = (l) => l.filter((r) => r.padrao.trim());
        try { S.pol.projeto = (await api('/api/politica', { negar: limpa(p.negar), producao: limpa(p.producao), permitir: limpa(p.permitir) })).projeto; S.pol.sujo = false; S.pol.erro = ''; toast('Política salva. Vale já para os próximos comandos.'); }
        catch (x) { S.pol.erro = x.message; }
        renderPolitica(); break;
      }
      case 'pol-test': {
        const c = $('#pol-cmd').value.trim(); if (!c) break;
        try { S.pol.teste = { cmd: c, ...(await api('/api/politica/testar', { comando: c })) }; } catch (x) { S.pol.teste = { cmd: c, erro: x.message }; }
        renderPolitica(); $('#pol-cmd').focus(); break;
      }
      case 'stop': api('/api/chat/cancelar', { id: curChat().id }); break;
      case 'quick': { const ta = $('#msg'); if (ta) send(d.p); break; }
      case 'status': break;
      case 'remove': {
        const i = itemById(d.id); if (!confirm('Apagar esta linha de pendencias/README.md?\n\n' + i.title)) break;
        await api('/api/remover', { line: i.line, raw: i.raw }); await loadPend(); render(); toast('Removido do README'); break;
      }
      case 'rename': { const x = S.term.find((s) => s.id === d.id); const v = prompt('Apelido da sessão:', x.apelido || x.title || ''); if (v !== null) { await api('/api/sessoes/meta', { id: d.id, apelido: v }); await loadSess(); render(); } break; }
      case 'hide': { const x = S.term.find((s) => s.id === d.id); await api('/api/sessoes/meta', { id: d.id, oculto: !x.oculto }); await loadSess(); render(); break; }
      case 'resume': await navigator.clipboard.writeText(`claude --resume ${d.id || S.sel?.id}`); toast('Comando copiado'); break;
      case 'continue-term': {
        const t = curTerm(), tr = S.tx[t.id]?.messages || [];
        const ctx = `Continuação de uma sessão do terminal (id ${t.id}, título "${t.title || t.primeiro || ''}"). Últimas mensagens:\n` + tr.slice(-8).map((m) => `${m.role === 'user' ? 'Dono' : 'Claude'}: ${short(m.text, 700)}`).join('\n');
        await newChat({ title: short('Cont.: ' + (t.apelido || t.title || t.primeiro || 'terminal'), 40), itemId: t.itemId || '', contexto: ctx }); break;
      }
    }
  } catch (x) { toast(x.message); }
});
document.addEventListener('input', (e) => { // edição das regras de política (os campos guardam o texto em S.pol)
  const el = e.target.closest('[data-pol]'); if (!el || !S.pol) return;
  S.pol.projeto[el.dataset.sec][Number(el.dataset.i)][el.dataset.pol] = el.value; S.pol.sujo = true;
  const b = $('#pol-save'); if (b) b.disabled = false;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'pol-cmd') { e.preventDefault(); document.querySelector('[data-act="pol-test"]').click(); } });
const POL_SEC = {
  negar: ['Bloquear sempre', 'pi-ban', 'O Claude nunca executa e nem chega a perguntar. Ex.: terraform\\s+destroy'],
  producao: ['Tratar como produção', 'pi-exclamation-triangle', 'Pede aprovação em vermelho, com confirmação extra. Ex.: \\bkubectl\\b'],
  permitir: ['Liberar sem perguntar', 'pi-check-circle', 'Só comando inteiro e de leitura: comece com ^ e termine com $. Ex.: ^npm run (test|lint)$'],
};
async function loadPolitica() {
  try { const g = await api('/api/politica'); S.pol = { padrao: g.padrao, projeto: g.projeto, sujo: false, erro: '', teste: null }; }
  catch (x) { S.pol = null; const r = $('#pol-root'); if (r) r.innerHTML = `<div class="note">Não consegui carregar: ${esc(x.message)}</div>`; return; }
  renderPolitica();
}
function renderPolitica() {
  const root = $('#pol-root'); if (!root || !S.pol) return;
  const P = S.pol, t = P.teste;
  const res = !t ? '' : t.erro ? `<div class="pol-res bad">${esc(t.erro)}</div>` : (() => {
    const [cls, txt] = t.acao === 'negar' ? ['bad', 'Bloqueado'] : t.acao === 'permitir' ? ['ok', 'Liberado sem perguntar'] : t.risco === 'producao' ? ['bad', 'Pede aprovação (PRODUÇÃO, confirmação extra)'] : ['warn', 'Pede aprovação'];
    return `<div class="pol-res ${cls}"><b>${txt}</b> · ${esc(t.motivo)} <span class="muted">(regra ${esc(t.origem)})</span><code>${esc(t.cmd)}</code></div>`;
  })();
  root.innerHTML = `<div class="page-head"><div><h1 class="page-title">Política de comandos</h1>
    <p class="page-sub">O que o Claude pode fazer neste projeto. As <b>regras padrão</b> valem para todos os projetos e não podem ser removidas; aqui você <b>acrescenta</b> regras só deste projeto. Ordem: bloquear &gt; produção &gt; liberar &gt; perguntar.</p></div>
    <button class="btn primary" id="pol-save" data-act="pol-save" ${P.sujo ? '' : 'disabled'}><i class="pi pi-save"></i> Salvar política</button></div>
  ${P.erro ? `<div class="pol-res bad">${esc(P.erro)}</div>` : ''}
  <div class="card pol-test"><div class="card-head"><span class="ico"><i class="pi pi-play"></i></span><h3>Testar um comando <span class="muted">(só simula, não executa nada)</span></h3></div>
    <div class="card-body"><div class="pol-testrow"><input id="pol-cmd" class="inp" placeholder="Ex.: npm run test   ou   terraform destroy" value="${esc(t?.cmd || '')}" autocomplete="off"><button class="btn" data-act="pol-test"><i class="pi pi-search"></i> Testar</button></div>${res}</div></div>
  ${['negar', 'producao', 'permitir'].map((sec) => {
    const [titulo, icone, dica] = POL_SEC[sec], rows = P.projeto[sec];
    return `<div class="card pol-card"><div class="card-head"><span class="ico"><i class="pi ${icone}"></i></span><h3>${titulo}</h3><span class="muted small">${rows.length} ${rows.length === 1 ? 'regra própria' : 'regras próprias'}</span></div><div class="card-body">
      <p class="muted small">${esc(dica)}</p>
      <div class="pol-rows" data-sec="${sec}">${rows.map((r, i) => `<div class="pol-row"><input class="inp mono" data-pol="padrao" data-sec="${sec}" data-i="${i}" value="${esc(r.padrao)}" placeholder="expressão regular" aria-label="Padrão"><input class="inp" data-pol="motivo" data-sec="${sec}" data-i="${i}" value="${esc(r.motivo)}" placeholder="motivo (aparece para você)" aria-label="Motivo"><button class="icon-btn danger" data-act="pol-del" data-sec="${sec}" data-i="${i}" title="Remover regra" aria-label="Remover regra"><i class="pi pi-trash"></i></button></div>`).join('') || '<div class="muted small">Nenhuma regra própria: valem só as regras padrão.</div>'}</div>
      <button class="btn sm" data-act="pol-add" data-sec="${sec}"><i class="pi pi-plus"></i> Adicionar regra</button>
      <details class="pol-def"><summary>Regras padrão (${P.padrao[sec].length}, sempre ativas)</summary><ul>${P.padrao[sec].map((r) => `<li><code>${esc(r.padrao)}</code> <span class="muted">${esc(r.motivo)}</span></li>`).join('')}</ul></details>
    </div></div>`;
  }).join('')}`;
}
document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-chg]'); if (!el) return;
  const d = el.dataset;
  try {
    switch (d.chg) {
      case 'size': S.size[d.key] = Number(el.value); S.page[d.key] = 1; render(); break;
      case 'fprio': S.f.prio = el.value; S.page.pend = 1; render(); break;
      case 'fstat': S.f.stat = el.value; S.page.pend = 1; render(); break;
      case 'hid': S.f.hid = el.checked; S.page.sess = 1; render(); break;
      case 'status': await api('/api/estado', { id: d.id, status: el.value, nota: st(d.id).nota || '' }); await loadPend(); render(); break;
      case 'link': await api('/api/sessoes/meta', { id: d.id, itemId: el.value }); await loadSess(); render(); break;
      case 'model': cfg({ model: el.value }); break;
    }
  } catch (x) { toast(x.message); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'msg') { const c = curChat(); if (c) S.draft[c.id] = e.target.value; hint(); }
});
document.addEventListener('change', (e) => { if (e.target.id === 'edit') cfg({ edit: e.target.checked }); if (e.target.id === 'exec') cfg({ exec: e.target.checked }); if (e.target.id === 'aprov-ok') { const b = $('#adlg [data-act="aprovar"]'); if (b) b.disabled = !e.target.checked; } });
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'msg' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gsearch').focus(); }
  if (e.key === 'Escape') $('#gsearch').blur();
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); S.f.q = $('#gsearch').value.trim(); S.f.stat = S.f.q ? '' : 'ativos'; S.f.sec = 0; S.page.pend = 1; if (route() !== 'pendencias') location.hash = '#/pendencias'; else render(); });
$('#gsearch').addEventListener('input', (e) => { if (!e.target.value && S.f.q) { S.f.q = ''; S.f.stat = 'ativos'; render(); } });
$('#toggle').addEventListener('click', () => { S.collapsed = !S.collapsed; ls.set('central.sidebar-collapsed', S.collapsed ? '1' : '0'); renderNav(); });
$('#dx').addEventListener('click', () => $('#dlg').close());
$('#reload').addEventListener('click', () => refresh(true));
async function openFile(p) {
  try { const f = await api('/api/file?p=' + encodeURIComponent(p)); $('#dt').textContent = f.path; $('#dc').innerHTML = md(f.content); $('#dlg').showModal(); } catch (x) { toast(x.message); }
}

// ---------- dados ----------
async function loadPend() { const p = await api('/api/pendencias'); S.sections = p.sections; S.state = p.state; }
async function loadSess() { S.term = (await api('/api/sessoes')).terminal; }
async function loadChats() {
  S.chats = (await api('/api/chats')).chats;
  if (S.sel?.kind === 'chat' && !S.chats.find((c) => c.id === S.sel.id)) S.sel = null;
}
async function loadFiles() { S.files = (await api('/api/arquivos')).files; }
let sigs = {}, lastDocs = null;
async function refresh(force) {
  try {
    const v = await api('/api/versao');
    const [p, s, c, f] = await Promise.all([api('/api/pendencias'), api('/api/sessoes'), api('/api/chats'), api('/api/arquivos')]);
    const next = {
      pend: JSON.stringify([p.sections.map((x) => x.items.map((i) => i.id + i.raw)), p.state]),
      sess: JSON.stringify(s.terminal.map((x) => [x.id, x.mtime, x.apelido, x.itemId, x.oculto])),
      chats: JSON.stringify(c.chats.map((x) => [x.id, x.updated, x.running, x.title, x.model, x.plan, x.edit, x.messages.length])),
      files: JSON.stringify(f.files.map((x) => x.path + x.mtime)),
    };
    const changed = force || Object.keys(next).some((k) => sigs[k] !== next[k]);
    S.sections = p.sections; S.state = p.state; S.term = s.terminal; S.chats = c.chats; S.files = f.files;
    if (S.sel?.kind === 'chat' && !S.chats.find((x) => x.id === S.sel.id)) S.sel = null;
    if (S.sel?.kind === 'term') { const t = S.term.find((x) => x.id === S.sel.id); if (t && S.tx[t.id] && S.tx[t.id].mtime !== t.mtime) { delete S.tx[t.id]; openTerm(t.id); } else if (t && S.tx[t.id]) S.tx[t.id].mtime = t.mtime; }
    if (lastDocs && v.sig !== lastDocs) toast('Docs/planning/pendências mudaram em disco — atualizado');
    lastDocs = v.sig;
    if (changed) { sigs = next; if (document.activeElement?.id !== 'msg' || route() === 'chat') render(); }
    $('#synctxt').textContent = 'sincronizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (force) toast('Atualizado');
  } catch (x) { $('#synctxt').textContent = 'sem conexão'; }
}
setInterval(refresh, 4000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (route() !== 'chat' && !document.querySelector('dialog[open]')) render(); }, 60000); // mantém “há X min” fresco
refresh(true).then(() => { if (route() === 'chat' && !S.sel && S.chats[0]) { S.sel = { kind: 'chat', id: S.chats[0].id }; render(); } });
