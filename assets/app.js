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
  ['documentacao', 'Documentação', 'pi-book'],
  ['permissoes', 'Permissões do Claude', 'pi-shield'],
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
  $('#chat-log').innerHTML = `<div class="note">${c.plan ? 'Modo plan: o Claude só lê e planeja, não altera arquivos.' : [c.doc && '📄 Modo documentação: o Claude só lê o projeto e cria arquivos em docs/, planning/, pendencias/ e CLAUDE.md. Alterar arquivo existente pede sua aprovação.', c.edit && '⚠ Edição de arquivos liberada.', c.exec && '⚠ Comandos liberados: cada um precisa da sua aprovação.'].filter(Boolean).join(' ') || 'Somente leitura'} · modelo ${mname(c.model)}</div>` +
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
  const a = list[0], prod = a.risco === 'producao', ex = a.explicacao || { resumo: a.resumo, passos: [], nivel: 'desconhecido' };
  if (dlg.dataset.id === a.id && dlg.open) { const c = $('#adlg-n'); if (c) c.textContent = n > 1 ? `1 de ${n} pedidos` : ''; return; }
  dlg.dataset.id = a.id;
  dlg.className = 'adlg' + (prod ? ' prod' : '');
  dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi ${prod ? 'pi-exclamation-triangle' : 'pi-shield'}"></i></span>
      <div class="att"><b id="adlg-t">${prod ? 'Atenção: este comando mexe com produção ou internet' : 'O Claude quer fazer isto'}</b>
      <span class="asub">${esc(a.motivo || '')}<span id="adlg-n" class="acount">${n > 1 ? `1 de ${n} pedidos` : ''}</span></span></div></div>
    <div class="abd">
      <div class="aexp">${chipNivel(ex.nivel)}<p>${esc(ex.resumo)}</p>${ex.passos.length > 1 ? `<ol>${ex.passos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>
      <div class="aexact"><span>Comando exato que será executado <em>(a explicação acima é um resumo automático)</em></span><pre class="acode">${esc(a.resumo)}</pre></div>
      ${prod ? `<label class="aconf"><input type="checkbox" id="aprov-ok"> Entendi o que este comando faz e quero que ele rode.</label>` : ''}</div>
    <div class="aft"><button class="btn danger" data-act="negar" data-id="${a.id}"><i class="pi pi-times"></i> Negar</button><span class="sp"></span>
      ${!prod && a.lembravel ? `<button class="btn" data-act="aprovar-lembrar" data-id="${a.id}" title="Libera só este comando exato, daqui para frente, neste projeto. Você revê em Permissões."><i class="pi pi-bookmark"></i> Aprovar e lembrar</button>` : ''}
      <button class="btn primary" data-act="aprovar" data-id="${a.id}" ${prod ? 'disabled' : ''}><i class="pi pi-check"></i> Aprovar só desta vez</button></div>
    ${prod ? '' : `<div class="afoot"><button class="link" data-act="aprovar-sessao" data-id="${a.id}" title="Libera os próximos comandos comuns desta conversa. Produção e comandos bloqueados continuam como estão.">Aprovar tudo desta conversa</button><span>·</span><span>“Lembrar” fica salvo no projeto (veja em <b>Permissões</b>).</span></div>`}`;
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
  if (r !== 'documentacao' && S.docTimer) { clearInterval(S.docTimer); S.docTimer = null; }
  if (r === 'documentacao') { if (!v.querySelector('.doc-page')) { v.innerHTML = '<div class="doc-page" id="doc-root"><div class="note">Carregando…</div></div>'; loadDocumentacao(); } return; }
  if (r === 'permissoes') { if (!v.querySelector('.perm-page')) { v.innerHTML = '<div class="perm-page" id="perm-root"><div class="note">Carregando…</div></div>'; loadPermissoes(); } return; }
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
      case 'aprovar': case 'negar': case 'aprovar-sessao': case 'aprovar-lembrar': {
        $('#adlg').querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await api('/api/aprovacao/decidir', { id: d.id, permitir: act !== 'negar', sessao: act === 'aprovar-sessao', lembrar: act === 'aprovar-lembrar' }); if (act === 'aprovar-sessao') toast('Comandos comuns aprovados até o fim desta conversa. Produção continua pedindo.'); if (act === 'aprovar-lembrar') toast('Aprovado e lembrado. Você pode rever em Permissões.'); }
        catch (x) { toast(x.message); }
        $('#adlg').close(); $('#adlg').dataset.id = ''; loadChats();
        break;
      }
      case 'revogar-sessao': await api('/api/aprovacao/sessao', { id: d.id }); toast('Aprovação automática desligada.'); await loadChats(); S.chatKey = null; updateChat(); break;
      case 'doc-iniciar': {
        const modelo = $('#doc-modelo')?.value || 'sonnet';
        el.disabled = true;
        try { const c = await api('/api/documentacao/iniciar', { modo: d.modo, modelo }); toast('Documentação iniciada. Acompanhe por aqui.'); location.hash = `#/chat?s=${c.id}`; }
        catch (x) { toast(x.message); el.disabled = false; }
        break;
      }
      case 'perm-pacote': { try { await api('/api/permissoes/pacote', { id: d.id, ligado: el.checked }); toast(el.checked ? 'Pacote ligado.' : 'Pacote desligado.'); } catch (x) { toast(x.message); } await loadPermissoes(); break; }
      case 'perm-esquecer': { const c = S.perm.lembrados[Number(d.i)]?.comando; if (c && confirm('Remover esta permissão? Da próxima vez o Claude vai perguntar de novo.')) { await api('/api/permissoes/esquecer', { comando: c }); toast('Permissão removida.'); await loadPermissoes(); } break; }
      case 'perm-add': {
        const texto = $(`#perm-${d.tipo}-texto`).value.trim(), motivo = $(`#perm-${d.tipo}-motivo`).value.trim();
        if (!texto) { toast('Escreva o texto a procurar nos comandos.'); break; }
        try { await api('/api/permissoes/regra', { tipo: d.tipo, texto, motivo }); S.perm.erro = ''; toast('Regra adicionada.'); } catch (x) { S.perm.erro = x.message; }
        await loadPermissoes(); break;
      }
      case 'perm-del': { const r = S.perm[d.tipo === 'producao' ? 'producao' : 'bloqueios'][Number(d.i)]; if (r) { await api('/api/permissoes/regra/remover', { tipo: d.tipo, texto: r.texto }); await loadPermissoes(); } break; }
      case 'perm-test': {
        const c = $('#perm-cmd').value.trim(); if (!c) break;
        try { S.perm.teste = { cmd: c, ...(await api('/api/permissoes/testar', { comando: c })) }; } catch (x) { S.perm.teste = { cmd: c, erro: x.message }; }
        renderPermissoes(); $('#perm-cmd').focus(); break;
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
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'perm-cmd') { e.preventDefault(); document.querySelector('[data-act="perm-test"]').click(); } });
async function loadDocumentacao(silencioso) {
  try { const g = await api('/api/documentacao'); S.doc = { ...g, modelo: S.doc?.modelo || 'sonnet' }; }
  catch (x) { if (!silencioso) { const r = $('#doc-root'); if (r) r.innerHTML = `<div class="note">Não consegui carregar: ${esc(x.message)}</div>`; } return; }
  renderDocumentacao();
  if (!S.docTimer) S.docTimer = setInterval(() => { if (route() !== 'documentacao') { clearInterval(S.docTimer); S.docTimer = null; return; } loadDocumentacao(true); }, 4000);
}
function renderDocumentacao() {
  const root = $('#doc-root'); if (!root || !S.doc) return;
  const D = S.doc, rodando = D.job?.rodando;
  const sel = $('#doc-modelo'); if (sel) D.modelo = sel.value;
  const ok = (b) => `<i class="pi ${b ? 'pi-check-circle doc-ok' : 'pi-circle doc-no'}"></i>`;
  const vazio = D.total === 0;
  root.innerHTML = `<div class="page-head"><div><h1 class="page-title">Documentação do projeto</h1>
    <p class="page-sub">O Claude lê o código do projeto e monta a documentação oficial (<b>docs/</b>), no mesmo padrão do Datadubis: backend, frontend, regras de negócio, dados, infraestrutura, deploy e segurança, só com as áreas que o projeto realmente tem.</p></div></div>
  ${rodando ? `<div class="card doc-run"><div class="card-head"><span class="ico"><i class="pi pi-spin pi-spinner"></i></span><h3>Documentação em andamento</h3><a class="link" href="#/chat?s=${D.job.chatId}">Ver a conversa</a></div><div class="card-body"><p class="muted small">Pode levar vários minutos. Os arquivos novos aparecem abaixo conforme são criados. Você pode sair desta tela: ela continua.</p></div></div>` : D.job ? `<div class="card"><div class="card-head"><span class="ico"><i class="pi pi-history"></i></span><h3>Última execução</h3><a class="link" href="#/chat?s=${D.job.chatId}">Ver a conversa e o resumo</a></div></div>` : ''}
  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-th-large"></i></span><h3>Como está hoje</h3><span class="muted small">${D.total} documento${D.total === 1 ? '' : 's'} em docs/</span></div><div class="card-body">
    <div class="doc-grid">${D.areas.map((a) => `<div class="doc-area ${a.arquivos ? 'on' : ''}">${ok(a.arquivos)}<b>${esc(a.nome)}</b><span class="muted small">${a.arquivos ? `${a.arquivos} documento${a.arquivos === 1 ? '' : 's'}` : 'ainda não existe'}</span></div>`).join('')}</div>
    <ul class="doc-geral"><li>${ok(D.geral.docsReadme)} <b>docs/README.md</b> índice geral</li><li>${ok(D.geral.claudeMd)} <b>CLAUDE.md</b> instruções para o Claude trabalhar no projeto</li><li>${ok(D.geral.planning)} <b>planning/</b> planos ainda não fechados</li><li>${ok(D.geral.pendencias)} <b>pendencias/</b> o seu painel (é daqui que a Central lê as pendências)</li></ul>
    ${D.pastas.length ? `<p class="muted small">Pastas encontradas no projeto: ${D.pastas.map((p) => `<code>${esc(p)}</code>`).join(' ')}</p>` : '<p class="muted small">A pasta do projeto ainda está vazia. Quando houver código, volte aqui.</p>'}</div></div>
  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-sparkles"></i></span><h3>${vazio ? 'Montar a documentação' : 'Montar ou atualizar'}</h3></div><div class="card-body">
    <ul class="doc-bul"><li><b>O que ele faz:</b> lê o projeto, escreve os documentos em português e confere cada afirmação no código. O que não conseguir confirmar vai para <b>pendencias/</b>, nunca para docs/.</li>
      <li><b>O que ele não faz:</b> não mexe no código, não usa terminal e não lê senhas (.env, chaves). Só escreve em <code>docs/</code>, <code>planning/</code>, <code>pendencias/</code> e <code>CLAUDE.md</code>.</li>
      <li><b>Segurança:</b> arquivos <b>novos</b> são criados direto. Se precisar alterar um arquivo que já existe, ele pede a sua aprovação antes.</li>
      <li><b>Tempo e uso:</b> costuma levar de 5 a 30 minutos, conforme o tamanho do projeto, e usa a sua assinatura do Claude.</li></ul>
    <div class="doc-acoes"><label>Modelo <select id="doc-modelo" class="sel sm"><option value="sonnet" ${D.modelo === 'sonnet' ? 'selected' : ''}>Sonnet (padrão, mais rápido)</option><option value="opus" ${D.modelo === 'opus' ? 'selected' : ''}>Opus (mais caprichado, usa mais)</option><option value="haiku" ${D.modelo === 'haiku' ? 'selected' : ''}>Haiku (rápido e simples)</option></select></label>
      <span class="sp"></span>
      <button class="btn ${vazio ? 'primary' : ''}" data-act="doc-iniciar" data-modo="criar" ${rodando ? 'disabled' : ''}><i class="pi pi-plus"></i> ${vazio ? 'Montar a documentação' : 'Criar o que falta'}</button>
      ${vazio ? '' : `<button class="btn primary" data-act="doc-iniciar" data-modo="atualizar" ${rodando ? 'disabled' : ''}><i class="pi pi-refresh"></i> Conferir com o código e atualizar</button>`}</div></div></div>
  ${D.recentes.length ? `<div class="card"><div class="card-head"><span class="ico"><i class="pi pi-file"></i></span><h3>Arquivos mexidos recentemente</h3></div><div class="card-body"><ul class="doc-rec">${D.recentes.map((f) => `<li><a class="link" data-act="file" data-p="${esc(f.path)}">${esc(f.path)}</a><span class="muted small">${ago(f.mtime)}</span></li>`).join('')}</ul></div></div>` : ''}`;
}
const NIVEL = { leitura: ['Só consulta', 'lv-ok'], altera: ['Altera arquivos', 'lv-warn'], rede: ['Usa a internet', 'lv-warn'], servidor: ['Mexe em servidor/produção', 'lv-bad'], desconhecido: ['Não reconhecido', 'lv-warn'] };
const chipNivel = (n) => { const [t, c] = NIVEL[n] || NIVEL.desconhecido; return `<span class="lv ${c}">${t}</span>`; };
const quando = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; } };
async function loadPermissoes() {
  try { const g = await api('/api/permissoes'); S.perm = { ...g, erro: S.perm?.erro || '', teste: S.perm?.teste || null }; }
  catch (x) { S.perm = null; const r = $('#perm-root'); if (r) r.innerHTML = `<div class="note">Não consegui carregar: ${esc(x.message)}</div>`; return; }
  renderPermissoes();
}
function renderPermissoes() {
  const root = $('#perm-root'); if (!root || !S.perm) return;
  const P = S.perm, t = P.teste;
  const lista = (itens, vazio) => itens.length ? `<ul class="perm-list">${itens.map((x) => `<li><b>${esc(x.titulo)}</b><span class="muted">${esc(x.descricao)}</span></li>`).join('')}</ul>` : `<div class="muted small">${vazio}</div>`;
  const res = !t ? '' : t.erro ? `<div class="perm-res bad">${esc(t.erro)}</div>` : (() => {
    const [cls, txt] = t.acao === 'negar' ? ['bad', 'Bloqueado: o Claude não consegue rodar'] : t.acao === 'permitir' ? ['ok', 'Liberado: roda sem perguntar'] : t.risco === 'producao' ? ['bad', 'Pede sua aprovação (com atenção redobrada: produção)'] : ['warn', 'Pede sua aprovação'];
    return `<div class="perm-res ${cls}"><b>${txt}</b><span>${esc(t.motivo)} · ${t.origem === 'projeto' ? 'regra deste projeto' : 'regra de fábrica'}</span><span class="what">${chipNivel(t.explicacao.nivel)} ${esc(t.explicacao.resumo)}</span></div>`;
  })();
  const regra = (tipo, titulo, ajuda, itens, ph) => `<div class="perm-sub"><h4>${titulo}</h4><p class="muted small">${ajuda}</p>
    ${itens.length ? `<ul class="perm-list">${itens.map((r, i) => `<li><b>Comandos que contenham “${esc(r.texto)}”</b><span class="muted">${esc(r.motivo)}</span><button class="btn sm" data-act="perm-del" data-tipo="${tipo}" data-i="${i}"><i class="pi pi-trash"></i> Remover</button></li>`).join('')}</ul>` : ''}
    <div class="perm-add"><input class="inp" id="perm-${tipo}-texto" placeholder="${ph}" maxlength="80" aria-label="Texto a procurar"><input class="inp" id="perm-${tipo}-motivo" placeholder="Motivo (opcional)" maxlength="120" aria-label="Motivo"><button class="btn sm" data-act="perm-add" data-tipo="${tipo}"><i class="pi pi-plus"></i> Adicionar</button></div></div>`;
  root.innerHTML = `<div class="page-head"><div><h1 class="page-title">Permissões do Claude</h1>
    <p class="page-sub">Aqui você controla o que o Claude pode fazer <b>sozinho</b> neste projeto. Tudo que não está liberado, ele <b>pergunta antes</b> (aparece um aviso na tela). Dica: quando o aviso aparecer, clique em <b>Aprovar e lembrar</b> e o comando entra na lista abaixo.</p></div></div>
  ${P.erro ? `<div class="perm-res bad">${esc(P.erro)}</div>` : ''}

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-check-circle"></i></span><h3>Liberado de fábrica</h3><span class="lv lv-ok">Só consulta</span></div><div class="card-body">
    <p class="muted small">Estes comandos só consultam informações, não alteram nada. O Claude roda sem perguntar.</p><details class="perm-fab"><summary>Ver tudo o que está liberado (${P.fabrica.permitir.length})</summary>${lista(P.fabrica.permitir, '')}</details></div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-box"></i></span><h3>Pacotes opcionais</h3></div><div class="card-body">
    <p class="muted small">Ligue se quiser que o Claude faça isso sem perguntar. Vêm desligados porque executam o código do projeto.</p>
    ${P.pacotes.map((k) => `<label class="perm-pack"><input type="checkbox" class="sw" data-act="perm-pacote" data-id="${k.id}" ${k.ligado ? 'checked' : ''}><span><b>${esc(k.titulo)}</b><span class="muted">${esc(k.descricao)}</span><span class="muted small">Exemplos: ${k.exemplos.map(esc).join(' · ')}</span></span></label>`).join('')}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-bookmark"></i></span><h3>Comandos que você liberou</h3><span class="muted small">${P.lembrados.length}</span></div><div class="card-body">
    <p class="muted small">Quando o Claude pedir um comando novo, use <b>Aprovar e lembrar</b>. Só este comando exato fica liberado. Remova quando quiser.</p>
    ${P.lembrados.length ? `<ul class="perm-list">${P.lembrados.map((l, i) => `<li><span class="top">${chipNivel(l.nivel)}<b>${esc(l.resumo)}</b></span>${l.passos.length > 1 ? `<ol class="muted small">${l.passos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}<code>${esc(l.comando)}</code><span class="muted small">Liberado em ${quando(l.quando)}</span><button class="btn sm" data-act="perm-esquecer" data-i="${i}"><i class="pi pi-times"></i> Remover permissão</button></li>`).join('')}</ul>` : '<div class="muted small">Nada ainda. Eles vão aparecendo aqui conforme você aprova.</div>'}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-ban"></i></span><h3>Nunca permitido</h3><span class="lv lv-bad">Bloqueado</span></div><div class="card-body">
    <p class="muted small">O Claude não consegue rodar isso, nem pedindo. Vale para todos os projetos e não dá para desligar.</p><details class="perm-fab"><summary>Ver tudo o que está bloqueado (${P.fabrica.negar.length})</summary>${lista(P.fabrica.negar, '')}</details>
    ${regra('bloqueios', 'Bloqueios só deste projeto', 'Bloqueia qualquer comando que contenha o texto escrito.', P.bloqueios, 'Ex.: terraform destroy')}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-exclamation-triangle"></i></span><h3>Sempre pede atenção redobrada (produção)</h3></div><div class="card-body">
    <p class="muted small">Aparece em vermelho e exige uma confirmação extra a cada vez. Nunca pode ser liberado de vez.</p><details class="perm-fab"><summary>Ver tudo o que pede atenção redobrada (${P.fabrica.producao.length})</summary>${lista(P.fabrica.producao, '')}</details>
    ${regra('producao', 'Mais itens só deste projeto', 'Trata como produção qualquer comando que contenha o texto escrito.', P.producao, 'Ex.: kubectl')}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-play"></i></span><h3>Testar um comando <span class="muted small">(só simula, não executa nada)</span></h3></div><div class="card-body">
    <div class="perm-testrow"><input id="perm-cmd" class="inp" placeholder="Cole aqui um comando para ver o que aconteceria" value="${esc(t?.cmd || '')}" autocomplete="off"><button class="btn" data-act="perm-test"><i class="pi pi-search"></i> Testar</button></div>${res}</div></div>`;
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
