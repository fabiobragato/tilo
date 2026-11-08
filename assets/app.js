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
function dur(ms) { // 45 s · 12 min · 2 h 05 min · 3 d 4 h
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60); if (m < 60) return m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
const age = (ms) => { const a = Date.now() - ms; return a < 120000 ? 'live' : a < 900000 ? 'recent' : ''; };
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); }

// Modal estilizado (#cdlg) no lugar de confirm()/prompt() nativos. Esc, clique fora e Cancelar cancelam.
function dialogoSimples({ titulo, texto = '', detalhe = '', ok = 'Confirmar', perigo = false, icone, campo = null }) {
  const dlg = $('#cdlg');
  if (dlg.open) { const antigo = dlg.onclose; dlg.close(); antigo?.(); } // cancela o anterior
  return new Promise((resolve) => {
    let resultado = campo ? null : false;
    dlg.classList.toggle('prod', !!perigo);
    dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi ${icone || (perigo ? 'pi-exclamation-triangle' : campo ? 'pi-pencil' : 'pi-question-circle')}"></i></span><div class="att"><b id="cdlg-t">${esc(titulo)}</b></div></div>
      <div class="abd">${texto ? `<p class="ctexto">${esc(texto)}</p>` : ''}${detalhe ? `<p class="cdetalhe">${esc(detalhe)}</p>` : ''}${campo ? `<input class="input" id="cdlg-campo" type="text" maxlength="200" aria-label="${esc(campo.rotulo || titulo)}" value="${esc(campo.valor || '')}">` : ''}</div>
      <div class="aft"><span class="sp"></span><button type="button" class="btn" data-c="no">Cancelar</button><button type="button" class="btn primary" data-c="ok">${esc(ok)}</button></div>`;
    const campoEl = $('#cdlg-campo', dlg);
    const confirma = () => { resultado = campo ? campoEl.value : true; dlg.close(); };
    dlg.onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { if (b.dataset.c === 'ok') confirma(); else dlg.close(); } else if (e.target === dlg) dlg.close(); };
    if (campoEl) campoEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirma(); } };
    dlg.onclose = () => { if (dlg.open) return; dlg.onclick = dlg.onclose = null; resolve(resultado); }; // open: evento atrasado de um diálogo anterior
    dlg.showModal();
    (campoEl || $(perigo ? '[data-c="no"]' : '[data-c="ok"]', dlg)).focus();
    campoEl?.select();
  });
}
const confirmar = (o) => dialogoSimples(o);
const pedirTexto = (o) => dialogoSimples({ ...o, campo: { valor: o.valor, rotulo: o.rotulo } });
const PROJ = (location.pathname.match(/^\/p\/([a-z0-9-]+)/) || [])[1] || '';
const BASE_TITLE = document.title;
async function api(path, body) {
  const r = await fetch(path.replace(/^\/api\//, `/api/p/${PROJ}/`), { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.statusText);
  return r.json();
}

// ---------- estado ----------
// Modelos do Claude (a chave é gravada na conversa; o servidor traduz para o id completo em MODEL_IDS de server.mjs). Para atualizar uma versão, troque aqui e lá.
const MODELOS = {
  fable: { nome: 'Fable', versao: '5.1', desc: 'O mais capaz. Exige créditos de uso (cobrados à parte da assinatura)' },
  opus: { nome: 'Opus', versao: '5.5', desc: 'Raciocínio profundo, usa mais limite' },
  sonnet: { nome: 'Sonnet', versao: '5.5', desc: 'Equilibrado, o melhor para o dia a dia' },
  haiku: { nome: 'Haiku', versao: '5.5', desc: 'Rápido e econômico, para tarefas simples' },
};
const MODELS = Object.fromEntries(Object.entries(MODELOS).map(([k, m]) => [k, `${m.nome} ${m.versao}`]));
const optsModelo = (sel) => Object.entries(MODELOS).map(([k, m]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${m.nome} ${m.versao}${k === DEFAULT_MODEL ? ' (padrão)' : ''} — ${m.desc}</option>`).join('');
const DEFAULT_MODEL = 'sonnet';
const mname = (m) => { const r = String(m || '').match(/claude-([a-z]+)-(\d+)-(\d+)/); if (r) return `${r[1][0].toUpperCase()}${r[1].slice(1)} ${r[2]}.${r[3]}`; /* id real informado pelo Claude */ const k = Object.keys(MODELS).find((x) => String(m || '').includes(x)); return k ? MODELS[k] : m ? String(m) : MODELS[DEFAULT_MODEL]; };
const PRIO = { alta: { e: 'Crítica', i: 'pi-exclamation-triangle', t: 'danger' }, media: { e: 'Importante', i: 'pi-flag', t: 'warning' }, baixa: { e: 'Pode esperar', i: 'pi-clock', t: 'success' } };
const STATUS = { aberto: ['Aberto', 'neutral', 'pi-circle'], andamento: ['Em andamento', 'primary', 'pi-play-circle'], feito: ['Feito', 'success', 'pi-check-circle'], ignorado: ['Ignorado', 'neutral', 'pi-eye-slash'] };
// Modos da conversa (um seletor só, como no Claude Code): [rótulo, explicação]. A ordem é a do Shift+Tab.
const MODOS = {
  perguntar: ['Perguntar tudo', 'Cada edição de arquivo e cada comando pedem a sua aprovação.'],
  editar: ['Aceitar edições', 'Edita arquivos do projeto sem perguntar; comandos pedem aprovação.'],
  plan: ['Planejamento', 'O Claude só lê e planeja; não altera arquivos nem roda comandos.'],
  auto: ['Automático', 'Aprova sozinho edições e comandos comuns. Produção e comandos bloqueados continuam como estão.'],
  leitura: ['Somente leitura', 'O Claude só lê: não edita arquivos nem roda comandos.'],
};
const S = {
  sections: [], state: { items: {} }, chats: [], term: [], files: [],
  sel: null, // { kind:'chat'|'term', id }
  tx: {}, // transcripts do terminal
  avisados: new Set(), // planos pendentes de outras conversas que já abriram a conversa uma vez
  page: { pend: 1, sess: 1, arq: 1 }, size: { pend: 10, sess: 6, arq: 12 },
  f: { sec: 0, prio: '', stat: 'ativos', q: '', sessTab: 'painel', hid: false, area: '', hideEnc: true },
  draft: {}, anexo: {}, collapsed: ls.get('tilo.sidebar-collapsed', '0') === '1',
};
const st = (id) => S.state.items[id] || { status: 'aberto' };
const items = () => S.sections.flatMap((s) => s.items);
const itemById = (id) => items().find((i) => i.id === id);
// "Em andamento" é automático: além do status marcado à mão, vale a pendência "aberta" que tem uma conversa do painel vinculada e NÃO encerrada.
// Encerrar a conversa tira a pendência de "em andamento". Pendência feita/ignorada nunca entra.
const autoAndamento = (i) => st(i.id).status === 'aberto' && S.chats.some((c) => c.itemId === i.id && !c.closed);
const stEf = (i) => (autoAndamento(i) ? 'andamento' : st(i.id).status);
const isOpen = (i) => ['aberto', 'andamento'].includes(stEf(i));
const route = () => { const r = (location.hash.replace(/^#\//, '') || 'visao').split('?')[0]; return r === 'arquivos' ? 'documentacao' : r; }; // #/arquivos foi mesclada em Documentação

// ---------- componentes ----------
const badge = (txt, tone = 'neutral', icon = '') => `<span class="badge tone-${tone}">${icon ? `<i class="pi ${icon}"></i>` : ''}${esc(txt)}</span>`;
// ---------- consumo de tokens (estimativa local, lida dos transcripts do Claude Code) ----------
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' mi' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' mil' : String(n));
const usoNovo = (u) => (u ? u.entrada + u.saida + u.cacheCriacao : 0);
const usoBadge = (u) => (usoNovo(u) ? badge(fmtTok(usoNovo(u)) + ' tokens', 'neutral', 'pi-database') : '');
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
  ['chat', 'Conversar com Claude', 'pi-sparkles'],
  ['alteracoes', 'Alterações', 'pi-sitemap'],
  ['sessoes', 'Sessões', 'pi-history'],
  ['documentacao', 'Documentação', 'pi-book'],
  ['biblioteca', 'Biblioteca de documentos', 'pi-bookmark'],
  ['permissoes', 'Permissões do Claude', 'pi-shield'],
];
function navCount(id) {
  const open = items().filter(isOpen), liveN = S.chats.filter((c) => c.running).length + S.term.filter((x) => !x.oculto && Date.now() - x.mtime < 120000).length;
  if (id === 'pendencias') { const n = open.filter((i) => i.prio === 'alta').length; return n ? `<span class="nav-count danger" title="Críticas abertas">${n}</span>` : `<span class="nav-count">${open.length}</span>`; }
  if (id === 'alteracoes' && altTotal()) return `<span class="nav-count" title="Arquivos não commitados + commits não enviados">${altTotal()}</span>`;
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
// Estimativa local: soma dos tokens das conversas do painel e das sessões do terminal (todos os projetos cadastrados) neste computador.
// O percentual real da assinatura só existe no claude.ai (Configurações > Uso).
function cardConsumo() {
  const c = S.consumo;
  if (!c) return '';
  const bloco = (rot, icone, u) => `<div class="cons-n"><strong>${fmtTok(usoNovo(u))}</strong><span><i class="pi ${icone}"></i> ${rot}</span></div>`;
  return `<section class="card cons"><div class="cons-top"><div class="ico tone-primary"><i class="pi pi-chart-bar"></i></div>
    <div class="cons-t"><h3>Consumo deste projeto</h3><p>Tokens usados no Claude, só neste projeto e neste computador.</p></div>
    ${bloco('Hoje', 'pi-calendar', c.hoje)}${bloco('Últimos 7 dias', 'pi-calendar-plus', c.semana)}
    <a class="btn primary" href="https://claude.ai/settings/usage" target="_blank" rel="noopener noreferrer"><i class="pi pi-external-link"></i> Ver limite no claude.ai</a></div></section>`;
}
function viewVisao() {
  const open = items().filter(isOpen), by = (p) => open.filter((i) => i.prio === p).length;
  const doing = items().filter((i) => stEf(i) === 'andamento');
  // conversas abertas (não encerradas) também contam como "trabalhando agora"; as ligadas a uma pendência em andamento já aparecem pela pendência
  const abertas = S.chats.filter((c) => !c.closed && !c.gen && !doing.some((i) => i.id === c.itemId)).sort((a, b) => b.updated - a.updated);
  const crit = open.filter((i) => i.prio === 'alta' && stEf(i) !== 'andamento').slice(0, 5);
  const act = recentSessions().slice(0, 5);
  const liveN = act.filter((a) => a.running || Date.now() - a.t < 120000).length;
  const metric = (n, label, icon, tone, go) => `<div class="card metric" data-act="go" data-to="${go}"><div class="ico tone-${tone}"><i class="pi ${icon}"></i></div><div><strong>${n}</strong><span>${label}</span></div></div>`;
  return `<div class="page-head"><div><h1 class="page-title">Visão geral</h1><p class="page-sub">O que falta decidir, fazer e conferir — e o que está em andamento agora.</p></div></div>
  ${cardConsumo()}
  <div class="grid g5" style="margin-bottom:16px">
    ${metric(by('alta'), 'Críticas abertas', 'pi-exclamation-triangle', 'danger', 'pendencias?prio=alta')}
    ${metric(by('media'), 'Importantes', 'pi-flag', 'warning', 'pendencias?prio=media')}
    ${metric(by('baixa'), 'Podem esperar', 'pi-clock', 'success', 'pendencias?prio=baixa')}
    ${metric(doing.length, 'Em andamento', 'pi-play-circle', 'primary', 'pendencias?stat=andamento')}
    ${metric(liveN, 'Sessões ativas agora', 'pi-bolt', 'info', 'sessoes')}
  </div>
  <div class="grid g2">
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-play-circle"></i></div><h3>Trabalhando agora</h3><a href="#/pendencias?stat=andamento">Ver todas</a></div><div class="card-body">
      ${(doing.length || abertas.length) ? doing.slice(0, 5).map((i) => `<div class="row-line" data-act="open-item" data-id="${i.id}"><span class="badge tone-${PRIO[i.prio].t}"><i class="pi ${PRIO[i.prio].i}"></i></span><div class="rl-t trunc">${esc(i.title)}</div><span class="rl-s">${esc(short(i.section.replace(/\(.*\)/, ''), 22))}</span></div>`).join('')
        + abertas.slice(0, 5).map((c) => `<div class="row-line" data-act="open-sess" data-kind="chat" data-id="${c.id}"><span class="dot ${c.running ? 'live' : age(c.updated)}"></span><div class="rl-t trunc">${esc(c.title)}</div>${c.plan ? badge('Plan', 'primary') : ''}<span class="rl-s">conversa · ${c.running ? 'trabalhando' : ago(c.updated)}</span></div>`).join('')
        : empty('pi-play-circle', 'Nada em andamento. Uma pendência entra aqui sozinha quando você abre uma conversa sobre ela; conversas abertas sem pendência também aparecem.')}
    </div></section>
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-history"></i></div><h3>Sessões recentes</h3><a href="#/sessoes">Ver todas</a></div><div class="card-body">
      ${act.length ? act.map((a) => `<div class="row-line" data-act="open-sess" data-kind="${a.kind}" data-id="${a.id}"><span class="dot ${a.running ? 'live' : age(a.t)}"></span><div class="rl-t trunc">${esc(a.title)}</div>${a.plan ? badge('Plan', 'primary') : ''}<span class="rl-s">${a.kind === 'chat' ? 'painel' : 'terminal'} · ${ago(a.t)}</span></div>`).join('') : empty('pi-history', 'Sem sessões recentes.')}
    </div></section>
    <section class="card"><div class="card-head"><div class="ico tone-danger"><i class="pi pi-exclamation-triangle"></i></div><h3>Próximas ações críticas</h3><a href="#/pendencias?prio=alta">Ver todas</a></div><div class="card-body">
      ${crit.length ? crit.map((i) => `<div class="row-line" data-act="open-item" data-id="${i.id}"><div class="rl-t trunc">${esc(i.title)}</div><span class="rl-s">${esc(short(i.section.replace(/\(.*\)/, ''), 22))}</span></div>`).join('') : empty('pi-check-circle', 'Nenhuma crítica aberta 🎉')}
    </div></section>
    ${cardAlteracoes()}
    <section class="card"><div class="card-head"><div class="ico"><i class="pi pi-folder-open"></i></div><h3>Documentos alterados recentemente</h3><a href="#/documentacao">Ver todos</a></div><div class="card-body">
      ${S.files.slice(0, 6).map((f) => `<div class="row-line" data-act="file" data-p="${esc(f.path)}"><i class="pi pi-file" style="color:var(--faint)"></i><div class="rl-t trunc">${esc(f.path)}</div><span class="rl-s">${ago(f.mtime)}</span></div>`).join('') || empty('pi-folder-open', 'Sem arquivos.')}
    </div></section>
  </div>`;
}
// Resumo do git na Visão geral: usa os dados que a aba Alterações já mantém (S.alt), sem rota nova.
function cardAlteracoes() {
  const g = S.alt.dados, rec = S.alt.hist.recentes || [];
  const cab = `<div class="card-head"><div class="ico"><i class="pi pi-sitemap"></i></div><h3>Alterações</h3><a href="#/alteracoes">Ver todas</a></div>`;
  if (!g) return `<section class="card">${cab}<div class="card-body">${empty('pi-sitemap', S.alt.erro ? 'Não consegui ler o git: ' + esc(S.alt.erro) : 'Carregando…')}</div></section>`;
  if (!g.repo) return `<section class="card">${cab}<div class="card-body">${empty('pi-sitemap', 'Este projeto não usa git.')}</div></section>`;
  const sem = g.arquivos.length, env = g.naoEnviados.length;
  const linhas = rec.slice(0, 5).map((c) => `<div class="row-line" data-act="go" data-to="alteracoes"><code>${esc(c.curto)}</code><div class="rl-t trunc">${esc(c.assunto)}</div>${c.conversas.length ? altChip(c.conversas[0]) : ''}<span class="rl-s">${c.enviado === false ? 'não enviado · ' : ''}${ago(c.quando)}</span></div>`).join('');
  return `<section class="card">${cab}<div class="card-body">
    <div class="alt-resumo">${badge(g.branch || 'sem branch', 'primary', 'pi-sitemap')}${sem ? badge(`${sem} sem commit`, 'warning', 'pi-pencil') : badge('tudo commitado', 'success', 'pi-check')}${g.semRemoto ? '' : env ? badge(`${env} sem push`, 'warning', 'pi-upload') : badge('tudo no GitHub', 'success', 'pi-check')}</div>
    ${linhas || empty('pi-history', 'Nenhum commit ainda.')}</div></section>`;
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
    const sts = stEf(i);
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
    ${f.q ? `<button class="btn sm" data-act="clearq" title="Limpa a busca e mostra todas as pendências"><i class="pi pi-times"></i> Busca: ${esc(short(f.q, 24))}</button>` : ''}
    <span class="sp"></span><span class="muted small">${filtered.length} item(ns)</span>
  </div>
  <section class="card">${rows || empty('pi-check-circle', 'Nada por aqui com esses filtros 🎉')}</section>${pager('pend', pg)}`;
}
function itemRow(i) {
  const e = { ...st(i.id), status: stEf(i) }, auto = autoAndamento(i), linked = S.chats.filter((c) => c.itemId === i.id).length + S.term.filter((x) => x.itemId === i.id && !x.oculto).length;
  return `<div class="item ${i.prio} ${e.status} ${S.focus === i.id ? 'foco' : ''}" data-id="${i.id}">
    <div class="it-main"><div class="it-title">${esc(i.title)}</div>
      <p class="it-desc">${inline(esc(i.desc))}</p>${i.how && !(i.refs.length && i.how.replace(/`/g, '').trim().split(/\s+/)[0] === i.refs[0]) ? `<p class="it-how">${inline(esc(i.how))}</p>` : ''}
      <div class="it-meta">${prioBadge(i.prio)}${statusBadge(e.status)}${auto ? badge('automático', 'neutral', 'pi-bolt') : ''}${linked ? badge(`${linked} conversa(s)`, 'info', 'pi-comments') : ''}${i.refs.map((p) => `<button class="ref" data-act="file" data-p="${esc(p)}"><i class="pi pi-file"></i>${esc(short(p, 44))}</button>`).join('')}</div></div>
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
    <button class="btn primary" data-act="new-chat" title="Abre uma conversa nova com o Claude neste projeto"><i class="pi pi-plus"></i> Nova conversa</button></div>
  <div class="toolbar"><div class="seg">
    <button data-act="stab" data-t="painel" class="${f.sessTab === 'painel' ? 'on' : ''}"><i class="pi pi-sparkles"></i> Painel <span class="n">${S.chats.length}</span></button>
    <button data-act="stab" data-t="term" class="${f.sessTab === 'term' ? 'on' : ''}"><i class="pi pi-desktop"></i> Terminal <span class="n">${S.term.filter((x) => !x.oculto).length}</span></button></div>
    <span class="sp"></span>${f.sessTab === 'term' ? `<label class="switch"><input type="checkbox" data-chg="hid" ${f.hid ? 'checked' : ''}> mostrar ocultas</label>` : ''}</div>
  <section class="card">${body}</section>${pager('sess', pg, [6, 10, 20])}`;
}
const closedBadge = () => badge('Encerrada', 'neutral', 'pi-check-circle');
function sessHead(title, t, running, plan, model, itemId, closed, uso) {
  const it = itemId && itemById(itemId);
  return `<div class="sess-top"><span class="dot ${running ? 'live' : age(t)}"></span><b>${esc(title)}</b>${closed ? closedBadge() : ''}${plan ? planBadge() : ''}${modelBadge(model)}${usoBadge(uso)}${badge(running ? 'respondendo…' : ago(t), running ? 'success' : 'neutral', 'pi-clock')}${it ? badge(short(it.title, 30), 'primary', 'pi-link') : ''}</div>`;
}
function chatSessRow(c) {
  const rev = [...c.messages].reverse(), q = rev.find((m) => m.role === 'user')?.text, a = rev.find((m) => m.role === 'assistant')?.text;
  return `<div class="sess">${sessHead(c.title, c.updated, c.running, c.plan, c.model, c.itemId, c.closed, c.uso)}
    ${q ? `<p class="q"><b>Você:</b> ${esc(q)}</p>` : ''}${a ? `<p class="q"><b>Claude:</b> ${esc(a)}</p>` : ''}
    <div class="acts"><button class="btn sm primary" data-act="open-sess" title="Abre esta conversa no painel" data-kind="chat" data-id="${c.id}"><i class="pi pi-comments"></i> Abrir conversa</button>${iconBtn('del-chat', 'pi-trash', 'Apagar conversa', `data-id="${c.id}"`, 'danger')}</div></div>`;
}
function linkSelect(x) {
  return `<select class="sel sm" data-chg="link" data-id="${x.id}" aria-label="Vincular a uma pendência"><option value="">Sem vínculo</option>${items().filter((i) => st(i.id).status !== 'feito').map((i) => `<option value="${i.id}" ${x.itemId === i.id ? 'selected' : ''}>${esc(short(i.title, 48))}</option>`).join('')}</select>`;
}
function termSessRow(x) {
  const title = x.apelido || x.title || x.primeiro || x.id.slice(0, 8);
  return `<div class="sess" style="${x.oculto ? 'opacity:.55' : ''}">${sessHead(title, x.mtime, false, x.mode === 'plan', x.model, x.itemId, false, x.uso)}
    ${x.ultimo ? `<p class="q"><b>Você:</b> ${esc(x.ultimo)}</p>` : ''}${x.resposta ? `<p class="q"><b>Claude:</b> ${esc(x.resposta)}</p>` : ''}
    <div class="acts"><button class="btn sm primary" data-act="open-sess" title="Abre esta conversa no painel" data-kind="term" data-id="${x.id}"><i class="pi pi-eye"></i> Ver conversa</button>${linkSelect(x)}
      ${iconBtn('rename', 'pi-pencil', 'Dar apelido', `data-id="${x.id}"`)}${iconBtn('resume', 'pi-copy', 'Copiar “claude --resume” para retomar no terminal', `data-id="${x.id}"`)}${iconBtn('hide', x.oculto ? 'pi-eye' : 'pi-eye-slash', x.oculto ? 'Mostrar' : 'Ocultar', `data-id="${x.id}"`)}</div></div>`;
}

// ---------- arquivos ----------
// explorador de arquivos (seção da aba Documentação); redesenhado à parte para não perder o estado do restante da tela
function renderArq() {
  const root = $('#arq-root'); if (!root) return;
  const area = (p) => p.split('/')[0];
  const f = S.f, list = S.files.filter((x) => !f.area || area(x.path) === f.area);
  const pg = paginate(list, 'arq');
  const AREA = { docs: ['Docs', 'success'], planning: ['Planning', 'warning'], pendencias: ['Pendências', 'primary'] };
  root.innerHTML = `<div class="page-head"><div><h2 class="page-title" style="font-size:18px">Arquivos</h2><p class="page-sub"><b>docs/</b> = só o que está implantado · <b>planning/</b> = planos para LLMs · <b>pendencias/</b> = este painel.</p></div></div>
  <div class="toolbar"><div class="seg">${[['', 'Todos'], ['docs', 'Docs'], ['planning', 'Planning'], ['pendencias', 'Pendências']].map(([v, l]) => `<button data-act="area" data-v="${v}" class="${f.area === v ? 'on' : ''}">${l}</button>`).join('')}</div><span class="sp"></span><span class="muted small">${list.length} arquivo(s) · mais recentes primeiro</span></div>
  <section class="card tbl-wrap"><table class="tbl"><thead><tr><th>Arquivo</th><th>Área</th><th style="text-align:right">Modificado</th></tr></thead><tbody>
    ${pg.rows.map((x) => { const a = AREA[area(x.path)] || [area(x.path), 'neutral']; return `<tr class="clk" data-act="file" data-p="${esc(x.path)}"><td class="path" title="${esc(x.path)}"><i class="pi pi-file" style="color:var(--faint);margin-right:8px"></i>${esc(x.path)}</td><td>${badge(a[0], a[1])}</td><td class="num">${ago(x.mtime)}</td></tr>`; }).join('')}
  </tbody></table>${pg.total ? '' : empty('pi-folder-open', 'Nenhum arquivo.')}</section>${pager('arq', pg, [12, 25, 50])}`;
}

// ---------- chat ----------
const curChat = () => (S.sel?.kind === 'chat' ? S.chats.find((c) => c.id === S.sel.id) : null);
const curTerm = () => (S.sel?.kind === 'term' ? S.term.find((x) => x.id === S.sel.id) : null);
function viewChat() {
  return `<div class="page-head"><div><h1 class="page-title">Conversar com Claude</h1><div class="chat-git" id="chat-git"></div></div>
    <button class="btn primary" data-act="new-chat" title="Abre uma conversa nova com o Claude neste projeto"><i class="pi pi-plus"></i> Nova conversa</button></div>
  <div class="chat-layout">
    <aside class="card chat-list"><div class="hd">Conversas</div><div class="bd" id="cl-body"></div></aside>
    <section class="card chat-main">
      <div class="chat-head" id="chat-head"></div><div id="chat-ctx"></div>
      <div class="chat-tabs" id="chat-tabs" hidden></div>
      <div class="chat-log" id="chat-log"></div><div class="chat-log" id="chat-act" hidden></div>
      <div class="plan-card" id="plan-card" hidden></div>
      <div class="plan-card ap-card adlg" id="ap-card" hidden></div>
      <div class="composer" id="composer">
        <div class="note" id="planbar" hidden style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px">A conversa ainda está em <b>modo planejamento</b> (o Claude só lê e planeja).</span>
          <button class="btn primary sm" data-act="plan-continuar" title="Desliga o modo plan e manda o Claude executar o plano"><i class="pi pi-play"></i> Sair do planejamento e continuar</button>
          <button class="btn sm" data-act="plan-sair" title="Só desliga o modo plan; você escreve a próxima mensagem"><i class="pi pi-sign-out"></i> Só sair do planejamento</button></div>
        <div class="quick" id="quick">${[['Explique', 'Explique essa pendência em linguagem simples: o que é, por que importa e o que acontece se eu não fizer.'], ['Passo a passo', 'Me dê o passo a passo para eu fazer isso, com comandos exatos quando houver.'], ['Já está feito?', 'Confira no código e em docs/ se isso já está resolvido. Diga com evidência (arquivo e linha).'], ['Recomende', 'Dê uma recomendação clara com prós e contras, para eu decidir.']].map(([l, p]) => `<button class="chipbtn" data-act="quick" data-p="${esc(p)}" title="${esc(p)}">${l}</button>`).join('')}</div>
        <div class="anexo-chip" id="anexo-chip" hidden></div>
        <textarea id="msg" placeholder="Pergunte algo… ou use /plan, /model opus (Ctrl+Enter envia)"></textarea>
        <div class="bar"><div class="runinfo"><span class="hint" id="hint"></span><span class="runstate" id="runstate" hidden></span></div>
          <div class="sendrow"><input type="file" id="anexo-in" accept=".md,.markdown,text/markdown" hidden><button class="btn" id="anexar" data-act="anexar" title="Anexa um plano em .md (até 300 mil caracteres) à próxima mensagem. O Claude lê o conteúdo; o histórico guarda só o nome."><i class="pi pi-paperclip"></i> Plano .md</button><div class="dd" id="dd-tom"></div><div class="dd" id="dd-modelo"></div><div class="dd" id="dd-modo"></div>
            <button class="btn danger" id="stop" data-act="stop" hidden title="Interrompe o que o Claude está fazendo agora (como Esc no terminal). A conversa continua."><i class="pi pi-stop-circle"></i> Parar</button><button class="btn primary" id="send" data-act="send" title="Enviar (Ctrl+Enter). Com o Claude trabalhando, a mensagem entra na fila e ele a lê no próximo passo."><i class="pi pi-send"></i> Enviar</button></div></div>
      </div>
      <div class="composer" id="closed-bar" hidden><span class="muted small">Esta conversa foi encerrada. O histórico fica guardado; reabra para continuar conversando.</span>
        <div><button class="btn primary" data-act="close-chat" title="Reabre a conversa para voltar a enviar mensagens" data-v="0"><i class="pi pi-replay"></i> Reabrir conversa</button></div></div>
      <div class="composer" id="ro" hidden><span class="muted small">Histórico somente leitura da sessão do terminal. O painel não consegue continuar a mesma sessão (ela pertence ao seu terminal).</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="continue-term" title="Cria uma conversa nova no painel, levando o final desta sessão como contexto"><i class="pi pi-sparkles"></i> Continuar no painel</button><button class="btn" data-act="resume" title="Copia o comando para retomar esta sessão no terminal" data-id="${S.sel?.id || ''}"><i class="pi pi-copy"></i> Copiar claude --resume</button></div></div>
    </section></div>`;
}
// Branch do projeto no topo do chat: trocar de branch e dar pull (juntar uma branch remota, ex.: origin/develop, na atual).
function renderChatGit() {
  const root = $('#chat-git'); if (!root) return;
  if (root.contains(document.activeElement) && document.activeElement.closest('.dd-menu')) return; // não fecha o menu aberto
  const A = S.alt, g = A.dados;
  if (!g) { root.innerHTML = A.erro ? `<span class="muted small">${esc(A.erro)}</span>` : ''; return; }
  if (!g.repo) { root.innerHTML = '<span class="muted small"><i class="pi pi-info-circle"></i> Projeto sem git: não há branch para mostrar.</span>'; return; }
  root.innerHTML = gitBarHtml(g);
}
// Barra de git (chat e aba Alterações): branch, Nova branch, Commitar (abre o modal com os arquivos) e Pull.
function gitBarHtml(g) {
  const dis = S.alt.busy ? 'disabled' : '', n = g.arquivos.length;
  return `${g.branches.length ? `<label class="alt-branch" title="Branch atual. Escolha outra para trocar; as alterações não commitadas acompanham você, se não houver conflito."><i class="pi pi-sitemap"></i>
      <select class="sel sm" data-chg="alt-branch" aria-label="Branch atual" ${dis}>${g.branches.map((b) => `<option value="${esc(b)}" ${b === g.branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`
    : badge(g.branch || 'sem branch', 'primary', 'pi-sitemap')}
    ${g.branches.length ? `<span class="sep"></span><button class="btn sm" data-act="chat-nova-branch" ${dis} title="Cria uma branch nova a partir das suas alterações locais (branch atual) ou de outra branch, e já troca para ela."><i class="pi pi-plus"></i> Nova branch</button>` : ''}
    ${g.branches.length ? `<button class="btn sm" data-act="commit-modal" ${dis} title="${n ? 'Escolhe os arquivos alterados, escreve a mensagem e cria o commit' : 'Não há alterações para commitar'}"><i class="pi pi-check-circle"></i> Commitar${n ? ` <span class="badge tone-primary">${n}</span>` : ''}</button>` : ''}
    ${g.semRemoto ? '' : `<button class="btn sm" data-act="alt-push" ${dis || (g.naoEnviados.length ? '' : 'disabled')} title="${g.naoEnviados.length ? `Push: envia ${g.naoEnviados.length} commit${g.naoEnviados.length === 1 ? '' : 's'} desta branch para o GitHub (nunca forçado)` : 'Push: não há commits esperando envio'}"><i class="pi pi-upload"></i> Push${g.naoEnviados.length ? ` <span class="badge tone-warning">${g.naoEnviados.length}</span>` : ''}</button>`}
    ${g.semRemoto ? '' : `<button class="btn sm" data-act="alt-pull" ${dis} title="Pull: baixa as novidades do GitHub e junta uma branch remota (por exemplo origin/develop) na branch atual. Se der conflito, o Tilo desfaz e nada muda."><i class="pi pi-download"></i> Pull${g.atras ? ` <span class="badge tone-warning">${g.atras}</span>` : ''}</button>`}`;
}
// Modal de commit: lista os arquivos alterados (marcar, ver mudanças), mensagem e conversas ligadas. Usa o mesmo estado da aba Alterações (S.alt).
function abrirCommitModal() {
  const dlg = $('#cdlg'), A = S.alt;
  if (!A.dados?.repo) return;
  if (dlg.open) { const antigo = dlg.onclose; dlg.close(); antigo?.(); }
  A.modal = true; dlg.classList.remove('prod'); dlg.classList.add('cm');
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  dlg.onclose = () => { if (dlg.open) return; A.modal = false; dlg.classList.remove('cm'); dlg.onclick = dlg.onclose = null; };
  renderCommitModal(true); dlg.showModal();
}
function renderCommitModal(forcar) {
  const A = S.alt, dlg = $('#cdlg'), g = A.dados;
  if (!A.modal || !dlg.open && !forcar) return;
  if (!g?.repo) { dlg.close(); return; }
  if (!forcar && dlg.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // não atrapalha quem está digitando
  const lista0 = dlg.querySelector('.cm-lista'), rolagem = lista0 ? lista0.scrollTop : 0;
  const nSel = A.sel.size, conv = altConversasDoCommit(), outras = S.chats.filter((c) => !c.gen && !conv.some((x) => x.id === c.id));
  const arqs = g.arquivos.map((a) => {
    const tom = a.rotulo === 'novo' ? 'success' : a.rotulo === 'apagado' || a.rotulo === 'conflito' ? 'danger' : 'info', aberto = A.abertos.has(a.caminho), df = A.diffs[a.caminho];
    return `<li class="alt-file"><div class="alt-row">
      <input type="checkbox" class="sw" data-chg="alt-sel" data-p="${esc(a.caminho)}" ${A.sel.has(a.caminho) ? 'checked' : ''} ${a.sensivel ? 'disabled' : ''} title="${a.sensivel ? 'Parece conter segredos: o Tilo não commita este arquivo' : 'Incluir este arquivo no commit'}" aria-label="Incluir ${esc(a.caminho)} no commit">
      ${badge(a.rotulo, tom)}<code class="alt-path">${esc(a.caminho)}</code>${a.antigo ? `<span class="muted small">(era ${esc(a.antigo)})</span>` : ''}
      <span class="alt-conv">${a.conversas.map((c) => c.titulo == null ? '' : `<span class="alt-chip off" title="Editado na conversa “${esc(c.titulo)}”"><i class="pi pi-comment"></i> ${esc(short(c.titulo, 24))}</span>`).join('')}
      ${a.sensivel ? '' : `<button class="btn sm" data-act="alt-diff" data-p="${esc(a.caminho)}" title="${aberto ? 'Esconde' : 'Mostra'} o que mudou neste arquivo"><i class="pi ${aberto ? 'pi-chevron-up' : 'pi-eye'}"></i> ${aberto ? 'Esconder' : 'Ver mudanças'}</button>`}</span></div>
      ${aberto ? `<pre class="alt-diff">${df ? (df.erro ? esc(df.erro) : altDiffHtml(df.diff) + (df.cortado ? '\n<span class="hunk">… diff cortado (arquivo grande)</span>' : '')) : 'Carregando…'}</pre>` : ''}</li>`;
  }).join('');
  const msg = dlg.querySelector('#alt-msg-m');
  dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-check-circle"></i></span><div class="att"><b>Commitar em ${esc(g.branch)}</b></div></div>
    <div class="abd">${g.arquivos.length ? `<div class="cm-topo"><span class="muted small">${nSel} de ${g.arquivos.length} arquivo${g.arquivos.length === 1 ? '' : 's'} marcado${nSel === 1 ? '' : 's'}</span>
        <button class="btn sm" data-act="cm-marcar" data-v="1">Marcar todos</button><button class="btn sm" data-act="cm-marcar" data-v="0">Desmarcar</button></div>
      <ul class="alt-list cm-lista">${arqs}</ul>
      <div class="cdlg-campos"><label for="alt-msg-m">Mensagem do commit</label><textarea id="alt-msg-m" class="inp alt-msg" rows="3" maxlength="4000" placeholder="Descreva o que mudou" data-alt="msg">${esc(msg ? msg.value : A.msg)}</textarea></div>
      <div class="alt-vinc"><span class="muted small">Conversas ligadas:</span>${conv.length ? conv.map((c) => `<label class="alt-chk"><input type="checkbox" data-chg="alt-conv" data-id="${c.id}" ${c.marcada ? 'checked' : ''}> ${esc(short(c.titulo, 30))}</label>`).join('') : '<span class="muted small">nenhuma</span>'}
        ${outras.length ? `<select class="sel sm" data-chg="alt-addchat" aria-label="Ligar outra conversa"><option value="">Ligar outra conversa…</option>${outras.map((c) => `<option value="${c.id}">${esc(short(c.title, 40))}</option>`).join('')}</select>` : ''}</div>`
      : '<div class="muted small">Nada para commitar: tudo o que foi alterado já está num commit.</div>'}</div>
    <div class="aft"><span class="muted small">Cria um commit local; nada vai ao GitHub.</span><span class="sp"></span><button type="button" class="btn" data-act="cm-fechar">Fechar</button>
      ${g.arquivos.length ? `<button type="button" class="btn primary" data-act="alt-commit" data-modal="1" ${A.busy || !nSel ? 'disabled' : ''} title="Cria um commit só com os arquivos marcados"><i class="pi pi-check"></i> Commitar ${nSel} arquivo${nSel === 1 ? '' : 's'}</button>` : ''}</div>`;
  const nova = dlg.querySelector('.cm-lista'); if (nova) nova.scrollTop = rolagem;
}
// Nova branch: nome + ponto de partida (alterações locais = branch atual, ou outra branch local/remota).
async function pedirNovaBranch(g) {
  const dlg = $('#cdlg');
  if (dlg.open) { const antigo = dlg.onclose; dlg.close(); antigo?.(); }
  const outras = [...g.branches.filter((b) => b !== g.branch), ...(g.remotas || [])];
  return new Promise((resolve) => {
    let r = null;
    dlg.classList.remove('prod');
    dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-sitemap"></i></span><div class="att"><b>Nova branch</b></div></div>
      <div class="abd"><div class="cdlg-campos"><label for="cdlg-nome">Nome da branch</label><input class="input" id="cdlg-nome" type="text" maxlength="100" value="feature-" autocomplete="off">
        <label for="cdlg-base">Partir de</label>
        <select class="sel" id="cdlg-base" aria-label="Ponto de partida"><option value="" data-d="Leva as alterações não commitadas junto">${esc(g.branch)} · alterações locais (atual)</option>${outras.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></div>
        <p class="cdetalhe">Partindo de outra branch, as alterações não commitadas acompanham você se não houver conflito.</p></div>
      <div class="aft"><span class="sp"></span><button type="button" class="btn" data-c="no">Cancelar</button><button type="button" class="btn primary" data-c="ok">Criar e trocar</button></div>`;
    const ok = () => { const nome = $('#cdlg-nome', dlg).value.trim(); if (!nome) return; r = { nome, base: $('#cdlg-base', dlg).value }; dlg.close(); };
    dlg.onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { if (b.dataset.c === 'ok') ok(); else dlg.close(); } else if (e.target === dlg && !e.target.closest('.dd-menu')) dlg.close(); };
    $('#cdlg-nome', dlg).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    dlg.onclose = () => { if (dlg.open) return; dlg.onclick = dlg.onclose = null; resolve(r); };
    dlg.showModal(); const c = $('#cdlg-nome', dlg); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
  });
}
async function chatNovaBranch() {
  const g = S.alt.dados; if (!g?.repo) return;
  const r = await pedirNovaBranch(g); if (r) await altBranch('criar', r.nome, r.base);
}
// Escolha da branch remota para o pull (menu padrão: <select class="sel">, transformado pelo combo.js).
async function pedirPull(g) {
  const dlg = $('#cdlg');
  if (dlg.open) { const antigo = dlg.onclose; dlg.close(); antigo?.(); }
  const ops = g.remotas || [], padrao = g.upstream && ops.includes(g.upstream) ? g.upstream : (ops.find((r) => /\/develop$/.test(r)) || ops[0] || '');
  return new Promise((resolve) => {
    let r = null;
    dlg.classList.remove('prod');
    dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-download"></i></span><div class="att"><b>Pull na branch ${esc(g.branch)}</b></div></div>
      <div class="abd"><p class="ctexto">Baixa o GitHub e junta a branch escolhida na <b>${esc(g.branch)}</b> (git fetch + merge). Use, por exemplo, para trazer a <b>develop</b> com o trabalho dos outros. Se houver conflito, o merge é desfeito e nada muda.</p>
      ${ops.length ? `<select class="sel" id="cdlg-pull" aria-label="Branch do GitHub para juntar">${ops.map((o) => `<option value="${esc(o)}" ${o === padrao ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : '<p class="cdetalhe">Nenhuma branch remota conhecida ainda.</p>'}</div>
      <div class="aft"><span class="sp"></span><button type="button" class="btn" data-c="no">Cancelar</button><button type="button" class="btn primary" data-c="ok" ${ops.length ? '' : 'disabled'}>Fazer pull</button></div>`;
    dlg.onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { if (b.dataset.c === 'ok') { r = $('#cdlg-pull', dlg)?.value || null; dlg.close(); } else dlg.close(); } else if (e.target === dlg && !e.target.closest('.dd-menu')) dlg.close(); };
    dlg.onclose = () => { if (dlg.open) return; dlg.onclick = dlg.onclose = null; resolve(r); };
    dlg.showModal();
  });
}
async function altPull() {
  const A = S.alt, g = A.dados; if (!g?.repo) return;
  const remota = await pedirPull(g); if (!remota) return;
  A.busy = true; renderChatGit();
  try { const r = await api('/api/alteracoes/pull', { remota }); toast(r.atualizou ? `Pull de ${r.remota}: ${r.commits} commit${r.commits === 1 ? '' : 's'} trazido${r.commits === 1 ? '' : 's'}` : `Já está em dia com ${r.remota}`); }
  catch (x) { toast(x.message); }
  A.busy = false; await loadAlteracoes(true);
}
function updateChat() {
  if (route() !== 'chat' || !$('#cl-body')) return;
  renderChatGit();
  // lista lateral
  const nEnc = S.chats.filter((c) => c.closed).length;
  const painel = [...S.chats].sort((a, b) => !!a.closed - !!b.closed) // encerradas ao final (sort estável preserva a ordem por data)
    .filter((c) => !(S.f.hideEnc && c.closed && !(S.sel?.kind === 'chat' && S.sel.id === c.id)))
    .map((c) => `<div class="cl-item ${S.sel?.kind === 'chat' && S.sel.id === c.id ? 'on' : ''} ${c.pendentes ? 'aguarda' : ''}" ${c.closed ? 'style="opacity:.6"' : ''} data-act="open-sess" data-kind="chat" data-id="${c.id}"><span class="dot ${c.running ? 'live' : age(c.updated)}" style="margin-top:5px"></span><div class="trunc" style="flex:1"><div class="t trunc">${esc(c.title)}</div><div class="s">${c.closed ? 'encerrada · ' : ''}${c.pendentes ? '<b class="aguarda">aguardando você</b> · ' : ''}${mname(c.model)}${c.plan ? ' · plan' : ''}${usoNovo(c.uso) ? ` · ${fmtTok(usoNovo(c.uso))} tokens` : ''} · ${ago(c.updated)}</div></div></div>`).join('');
  // As sessões do terminal não aparecem mais aqui (continuam na tela Sessões, aba Terminal).
  $('#cl-body').innerHTML = `${nEnc ? `<label class="switch small" style="padding:4px 8px"><input type="checkbox" data-chg="hideenc" ${S.f.hideEnc ? 'checked' : ''}> ocultar encerradas (${nEnc})</label>` : ''}${painel || '<div class="empty small">Sem conversas</div>'}`;

  const c = curChat(), t = curTerm(), ro = !!t;
  if (!c) { $('#chat-tabs').hidden = true; $('#chat-act').hidden = true; $('#chat-log').hidden = false; } // sessão do terminal / nada selecionado: sem abas
  for (const id of ['plan-card', 'ap-card']) { // um cartão de aprovação nunca fica visível numa conversa que não é a dele (some já ao trocar)
    const b = $('#' + id); if (b && b.dataset.chat && b.dataset.chat !== c?.id) { b.hidden = true; b.innerHTML = ''; b.dataset.id = ''; b.dataset.chat = ''; }
  }
  if (S.aprovChat !== (c?.id || '')) { S.aprovChat = c?.id || ''; if (S.aprov) queueMicrotask(() => renderApprovals(S.aprov)); } // mostra já os pedidos da conversa aberta
  $('#composer').hidden = ro || !c || !!c.closed; $('#ro').hidden = !ro; $('#closed-bar').hidden = !c?.closed;
  if (!c && !t) {
    $('#chat-head').innerHTML = '<div class="ttl muted">Nenhuma conversa selecionada</div>'; $('#chat-ctx').innerHTML = '';
    $('#chat-log').innerHTML = empty('pi-sparkles', 'Escolha uma conversa ao lado, crie uma nova ou clique no ícone de conversa numa pendência.'); return;
  }
  if (t) { // transcript somente leitura
    const title = t.apelido || t.title || t.primeiro || t.id.slice(0, 8), it = t.itemId && itemById(t.itemId);
    $('#chat-head').innerHTML = `<div class="ttl trunc">${esc(title)}</div>${badge('Terminal', 'neutral', 'pi-desktop')}${modelBadge(t.model)}${t.mode === 'plan' ? planBadge() : ''}${badge(ago(t.mtime), 'neutral', 'pi-clock')}`;
    $('#chat-ctx').innerHTML = ctxPend(it);
    const tr = S.tx[t.id];
    $('#chat-log').innerHTML = !tr ? '<div class="note">Carregando histórico…</div>' : tr.error ? `<div class="note">${esc(tr.error)}</div>` : '<div class="note">Últimas mensagens da sessão — somente leitura</div>' + tr.messages.map((m) => bubble(m, true)).join('');
    if (tr?.messages) $('#chat-log').scrollTop = 1e9; return;
  }
  const it = c.itemId && itemById(c.itemId);
  $('#chat-head').innerHTML = `<div class="ttl-grp"><div class="ttl trunc" title="Clique para renomear" data-act="rename-chat" style="cursor:text">${esc(c.title)}</div>${iconBtn('rename-chat', 'pi-pencil', 'Renomear conversa')}${c.closed ? closedBadge() : ''}${usoBadge(c.uso)}<span class="badge tone-neutral" data-sess="${c.created}" title="Tempo desde que a conversa foi criada"><i class="pi pi-stopwatch"></i>sessão ${dur(Date.now() - c.created)}</span></div>
    ${c.closed ? '' : `<button class="btn sm" data-act="close-chat" data-v="1" title="Encerrar: guarda o histórico e bloqueia novas mensagens (dá para reabrir)"><i class="pi pi-check-circle"></i> Encerrar</button>`}
    ${iconBtn('del-chat', 'pi-trash', 'Apagar conversa', `data-id="${c.id}"`, 'danger')}`;
  $('#chat-ctx').innerHTML = ctxPend(it);
  // O estado de execução do agente NÃO bloqueia a entrada: a caixa e o Enviar ficam sempre disponíveis (a mensagem entra na fila do Claude Code).
  $('#stop').hidden = !c.running;
  pintarDD(c);
  const rs = $('#runstate'); rs.hidden = !c.running; rs.dataset.desde = c.desde || '';
  rs.innerHTML = c.running ? (c.ocupado ? '<i class="pi pi-spin pi-spinner"></i> Claude trabalhando há <span class="rt"></span> — você pode continuar escrevendo' : `<i class="pi pi-clock"></i> ${c.segundoPlano ? 'aguardando tarefa em segundo plano' : 'finalizando'} · <span class="rt"></span>`) : '';
  tickTempo();
  { const pb = $('#planbar'); pb.style.display = c.plan && !c.running && c.messages.some((m) => m.role === 'assistant') ? 'flex' : 'none'; pb.hidden = false; }
  { // abas Conversa | Atividade (o contador conta as ações do chat)
    const t = $('#chat-tabs'); if (t && !t.dataset.ok) { t.dataset.ok = '1'; t.innerHTML = `<button type="button" data-act="aba" data-v="conversa"><i class="pi pi-comments"></i> Conversa</button><button type="button" data-act="aba" data-v="atividade"><i class="pi pi-bolt"></i> Atividade <span class="n" id="tab-n" hidden></span></button>`; }
    if (S.vivoChat !== c.id) { S.vivoChat = c.id; (S.vivo ||= {})[c.id] = (S.vivo[c.id] || []); }
    $('#chat-tabs').hidden = false; aplicarAba(); pintarAtividade(c);
  }
  const key = JSON.stringify([c.id, c.messages.length, c.running, c.ocupado, c.segundoPlano, (c.fila || []).map((f) => f.id), c.modo, c.model, c.closed, c.doc]);
  if (S.chatKey === key) return; S.chatKey = key;
  const ta = $('#msg'); if (ta.dataset.cid !== c.id) { ta.value = S.draft[c.id] || ''; ta.dataset.cid = c.id; }
  pintarAnexo();
  const log = $('#chat-log'), perto = log.scrollHeight - log.scrollTop - log.clientHeight < 80 || log.dataset.cid !== c.id; // só rola sozinho se o dono já estava no fim
  log.dataset.cid = c.id;
  const aguardando = new Set((c.fila || []).map((f) => f.id)), pendentes = (c.fila || []).filter((f) => !f.persistido);
  log.innerHTML = `<div class="note">${c.doc ? '📄 Modo documentação: o Claude só lê o projeto e cria arquivos em docs/, planning/, pendencias/ e CLAUDE.md. Alterar arquivo existente pede sua aprovação.' : esc(MODOS[c.modo]?.[1] || '')} · modelo ${mname(c.model)}</div>` +
    c.messages.map((m) => bubble(m, false, aguardando.has(m.mid))).join('') +
    (c.running ? `<div class="msg a" id="live"><div class="av"><i class="pi pi-sparkles"></i></div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>` : '') +
    pendentes.map((f) => `<div class="msg u pend"><div class="av">EU</div><div class="bubble">${esc(f.text)}<div class="meta"><i class="pi pi-clock"></i> na fila — o Claude lê no próximo passo</div></div></div>`).join('');
  if (c.running) pollStream(c.id);
  if (perto) log.scrollTop = 1e9;
}
function tickTempo() { // relógios do chat: tempo de sessão (cabeçalho) e há quanto tempo o Claude está trabalhando
  document.querySelectorAll('[data-sess]').forEach((e) => { e.lastChild.textContent = 'sessão ' + dur(Date.now() - Number(e.dataset.sess)); });
  const rs = $('#runstate'), rt = rs && $('.rt', rs); if (rt && rs.dataset.desde) rt.textContent = dur(Date.now() - Number(rs.dataset.desde));
}
setInterval(tickTempo, 1000);
// Faixa da pendência vinculada à conversa: clicar leva ao item no painel de pendências.
const ctxPend = (it) => it ? `<button type="button" class="ctx ctx-link" data-act="open-item" data-id="${esc(it.id)}" title="Abrir esta pendência no painel de Pendências"><i class="pi pi-link"></i><span class="ctx-tx"><em>Pendência vinculada · seção ${esc(it.section)}</em><b>${esc(it.title)}</b></span><i class="pi pi-arrow-right ctx-go"></i></button>` : '';
// ---- Menus de seleção (modo e modelo) na linha do Enviar: botão + lista com ícone, título e explicação de cada opção ----
const ICONE_MODO = { perguntar: 'pi-question-circle', editar: 'pi-pencil', plan: 'pi-list-check', auto: 'pi-bolt', leitura: 'pi-eye' };
// Tom das respostas (regras embutidas em tom.mjs, baseadas no Caveman): a chave é gravada na conversa; vale a partir da próxima resposta (o servidor manda o tom ao iniciar o processo do Claude). As chaves devem ser as de TONS em tom.mjs.
const TONS = {
  normal: ['Normal', 'Respostas completas e explicativas. Sem corte de tokens: é o que mais gasta.', 'pi-align-left'],
  lite: ['Enxuto', 'Corta enrolação e mantém frases claras. Corta poucos tokens na resposta. Padrão do Tilo.', 'pi-align-center'],
  full: ['Curto', 'Frases telegráficas, só o essencial. Corta mais tokens que o Enxuto.', 'pi-align-justify'],
  ultra: ['Mínimo', 'O mais comprimido possível, com abreviações. É o que mais economiza tokens, mas fica mais seco de ler.', 'pi-minus'],
};
const ddItens = (tipo) => (tipo === 'modo'
  ? Object.entries(MODOS).map(([k, v]) => ({ v: k, t: v[0], d: v[1], i: ICONE_MODO[k] }))
  : tipo === 'tom'
  ? Object.entries(TONS).map(([k, v]) => ({ v: k, t: v[0], d: v[1], i: v[2] }))
  : Object.entries(MODELOS).map(([k, m]) => ({ v: k, t: `${m.nome} ${m.versao}`, d: m.desc + (k === DEFAULT_MODEL ? ' · padrão' : ''), i: 'pi-microchip-ai' })));
// O comportamento do menu (abrir, teclado, posição) vive em assets/combo.js (padrão do projeto); aqui só os dados do chat.
function pintarDD(c) {
  const TIT = { modo: 'Modo da conversa', modelo: 'Modelo', tom: 'Tom das respostas · o Caveman mediu em média 65% menos tokens de resposta (de 22% a 87%)' };
  const DICA = { modo: 'Modo da conversa (Shift+Tab alterna). Vale na hora, mesmo com o Claude trabalhando.', modelo: 'Modelo (/model). Vale na hora.', tom: 'Tom das respostas. Vale a partir da próxima resposta.' };
  for (const [tipo, atual] of [['tom', c.tom], ['modelo', c.model], ['modo', c.modo]]) {
    const box = $('#dd-' + tipo); if (!box) continue;
    box.hidden = (tipo === 'modo' && !!c.doc) || (tipo === 'tom' && !c.tomDisponivel); // documentação tem modo fixo; com TILO_CAVEMAN=off o tom fica fixo em normal e o menu some
    box.className = 'dd dd-chat' + (tipo === 'modo' ? ' modo-' + atual : '');
    Combo.montar(box, { tipo, itens: ddItens(tipo), atual, titulo: TIT[tipo], abrir: 'cima', dir: true, dica: DICA[tipo] });
  }
}
document.addEventListener('combo:escolher', async (e) => { // escolha nos menus do chat (modo e modelo)
  const { tipo, v } = e.detail;
  if (tipo === 'modo') { await cfg({ modo: v }); toast('Modo: ' + MODOS[v][0]); }
  else if (tipo === 'modelo') { await cfg({ model: v }); toast('Modelo: ' + MODELS[v]); }
  else if (tipo === 'tom') { await cfg({ tom: v }); toast('Tom: ' + TONS[v][0] + ' (a partir da próxima resposta)'); }
  $('#msg')?.focus();
});

// ---- Atividade: comandos e ferramentas do Claude ficam numa aba própria (só comando e status; a SAÍDA nunca é guardada) ----
const ICONE_ACAO = { rodando: 'pi-spin pi-spinner', ok: 'pi-check-circle', erro: 'pi-times-circle', interrompida: 'pi-stop-circle' };
const acoesDe = (c) => [...c.messages.flatMap((m) => (m.role === 'assistant' ? m.tools || [] : [])), ...((S.vivo?.[c.id]) || [])];
function resumoAcoes(tools, vivo) { // uma linha discreta no chat; clicar abre a aba Atividade
  if (!tools?.length) return '';
  const n = (e) => tools.filter((t) => t.estado === e).length, rod = n('rodando'), err = n('erro'), int = n('interrompida');
  const ultima = vivo && tools.at(-1);
  const partes = [`${tools.length} ${tools.length === 1 ? 'ação' : 'ações'}`, rod ? `${rod} em andamento` : '', err ? `${err} com erro` : '', int ? `${int} interrompida${int > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="act-sum ${err ? 'erro' : ''}" data-act="aba" data-v="atividade" title="Ver a atividade completa"><i class="pi ${rod ? 'pi-spin pi-spinner' : err ? 'pi-exclamation-triangle' : 'pi-bolt'}"></i> ${partes}${ultima ? ` — <span>${esc(ultima.nome)} ${esc(short(ultima.resumo || '', 60))}</span>` : ''}<i class="pi pi-angle-right"></i></button>`;
}
const horaDe = (ms) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
const duracaoAcao = (ms) => (ms == null ? '' : ms < 1000 ? '<1 s' : dur(ms));
function pintarAtividade(c) { // lista em ordem de tempo; só redesenha se algo mudou (preserva os itens abertos)
  const box = $('#chat-act'); if (!box || !c) return;
  const acoes = acoesDe(c), sig = c.id + JSON.stringify(acoes.map((a) => [a.ini, a.estado, a.ms]));
  const tab = $('#tab-n'); if (tab) { tab.textContent = acoes.length || ''; tab.hidden = !acoes.length; }
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  const abertos = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.i)), perto = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || box.dataset.cid !== c.id;
  box.dataset.cid = c.id;
  box.innerHTML = acoes.length ? `<div class="note">Comandos e ferramentas que o Claude usou nesta conversa (só o comando e o resultado; a saída não é guardada).</div>` + acoes.map((a, i) => `<details class="act ${a.estado}" data-i="${i}" ${abertos.has(String(i)) ? 'open' : ''}><summary><i class="pi ${ICONE_ACAO[a.estado] || 'pi-circle'}"></i><b>${esc(a.nome)}</b><span class="ar">${esc(short(a.resumo || '', 90))}</span><span class="at">${horaDe(a.ini)}${a.ms != null ? ' · ' + duracaoAcao(a.ms) : ''}</span></summary><pre class="acode">${esc(a.detalhe || a.resumo || '(sem detalhe)')}</pre></details>`).join('')
    : empty('pi-bolt', 'Nenhuma ação ainda. Quando o Claude rodar comandos ou ler e editar arquivos, eles aparecem aqui.');
  if (perto) box.scrollTop = 1e9;
}
function aplicarAba() { // Conversa | Atividade: a caixa de mensagem e os cartões de aprovação ficam sempre visíveis
  const at = S.aba === 'atividade';
  $('#chat-log').hidden = at; $('#chat-act').hidden = !at;
  document.querySelectorAll('#chat-tabs [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (at ? 'atividade' : 'conversa')));
}
function bubble(m, ro, aguardando) {
  const u = m.role === 'user';
  if (!u && !m.text && m.tools?.length) return `<div class="act-line">${resumoAcoes(m.tools)}</div>`; // resposta só com ações: sem bolha vazia
  const estado = u && m.naoLida ? '<div class="meta err"><i class="pi pi-exclamation-triangle"></i> não chegou a ser lida pelo Claude — envie de novo</div>' : u && aguardando ? '<div class="meta"><i class="pi pi-clock"></i> enviada, ainda não lida</div>' : '';
  return `<div class="msg ${u ? 'u' : 'a'} ${m.erro || m.naoLida ? 'erro' : ''}"><div class="av">${u ? 'EU' : '<i class="pi pi-sparkles"></i>'}</div><div class="bubble">${u ? esc(m.text) + (m.anexo ? `<div class="meta"><i class="pi pi-paperclip"></i> ${esc(m.anexo.nome)} · ${Number(m.anexo.chars).toLocaleString('pt-BR')} caracteres</div>` : '') + estado : (m.text ? md(m.text) : '') + (m.tools?.length ? `<div class="act-wrap">${resumoAcoes(m.tools)}</div>` : '')}${!u ? `<div class="meta">${mname(m.modeloId || m.model)}${m.plan ? ' · plan' : ''}${m.interrompido ? ' · interrompida' : ''}</div>` : ''}</div></div>`;
}
// Plano do Claude (modo plan): card dentro do chat, com o plano completo e botões Sim/Não. Não usa o modal.
function renderPlano(planos) {
  const box = $('#plan-card'), a = planos.find((p) => S.sel?.kind === 'chat' && S.sel.id === p.chatId && route() === 'chat');
  if (!a) {
    if (box) { box.hidden = true; box.innerHTML = ''; box.dataset.id = ''; box.dataset.chat = ''; }
    avisarOutras(planos); // plano de outra conversa: só avisa (não troca a conversa que você está lendo)
    return;
  }
  if (!box) return;
  if (box.dataset.id === a.id && !box.hidden) return;
  box.dataset.id = a.id; box.dataset.chat = a.chatId; box.hidden = false;
  box.innerHTML = `<div class="pc-hd"><i class="pi pi-list-check"></i><b>O Claude terminou o plano. Posso executar?</b></div>
    <div class="pc-bd md">${a.plano ? md(a.plano) : '<em>(o Claude não enviou o texto do plano)</em>'}</div>
    <div class="pc-ft">
      <button class="btn pc-op" data-act="plano-nao" data-id="${a.id}"><i class="pi pi-replay"></i><span><b>Continuar planejando</b><em>Não aprovar; peça ajustes ao plano</em></span></button>
      <button class="btn pc-op" data-act="plano-instrucao" data-id="${a.id}"><i class="pi pi-pencil"></i><span><b>Sair do planejamento e escrever uma instrução</b><em>Não executa agora; você diz ao agente o que fazer</em></span></button>
      <button class="btn primary pc-op" data-act="plano-sim" data-id="${a.id}"><i class="pi pi-play"></i><span><b>Sair do planejamento e executar o plano</b><em>O agente começa a implementar</em></span></button></div>`;
  box.scrollIntoView({ block: 'nearest' });
}
// Cada pedido pertence a UMA conversa e só aparece nela. Pedido de outra conversa não aparece aqui nem muda a tela: a lista lateral
// marca "aguardando você" e um aviso (uma vez) diz de qual conversa é; o dono abre a conversa quando quiser.
function avisarOutras(lista) {
  const p = lista.find((x) => !S.avisados.has(x.id) && !(S.sel?.kind === 'chat' && S.sel.id === x.chatId && route() === 'chat'));
  if (!p) return;
  S.avisados.add(p.id);
  toast(`“${short(p.chat || 'Conversa', 30)}” está aguardando você${p.tipo === 'plano' ? ' (plano)' : p.tipo === 'pergunta' ? ' (pergunta)' : ' (aprovação)'}`);
}
function renderApprovals(todos) {
  S.aprov = todos; // guardado para redesenhar na hora ao trocar de conversa
  const dela = (a) => S.sel?.kind === 'chat' && S.sel.id === a.chatId && route() === 'chat';
  renderPlano(todos.filter((a) => a.tipo === 'plano'));
  const list = todos.filter((a) => a.tipo !== 'plano' && a.tool !== 'ExitPlanMode'); // defesa: plano nunca vira modal genérico
  document.title = (todos.length ? `(${todos.length}) Aprovação pendente · ` : '') + BASE_TITLE;
  const noChat = list.filter(dela);
  avisarOutras(list);
  desenharAprov($('#ap-card'), noChat);
  const marca = new Set(todos.map((a) => a.chatId)); // lista lateral: quais conversas aguardam
  document.querySelectorAll('.cl-item[data-kind="chat"]').forEach((e) => { e.classList.toggle('aguarda', marca.has(e.dataset.id)); });
}
// Desenha o primeiro pedido de `lista` no cartão do chat. Não redesenha o mesmo pedido, para não perder o que o dono marcou.
function desenharAprov(box, lista) {
  if (!box) return;
  const dlg = box, n = lista.length;
  if (!n) { box.hidden = true; box.innerHTML = ''; box.dataset.id = ''; box.dataset.chat = ''; return; }
  const a = lista[0], prod = a.risco === 'producao', ex = a.explicacao || { resumo: a.resumo, passos: [], nivel: 'desconhecido' };
  dlg.dataset.chat = a.chatId;
  if (dlg.dataset.id === a.id && !dlg.hidden) { const c = box.querySelector('.acount'); if (c) c.textContent = n > 1 ? `1 de ${n} pedidos` : ''; return; }
  dlg.dataset.id = a.id;
  const abrir = () => { dlg.hidden = false; dlg.scrollIntoView({ block: 'nearest' }); };
  const base = 'plan-card ap-card adlg', origem = '';
  if (a.tipo === 'pergunta') { // perguntas do Claude (modo plan): opções selecionáveis + sempre "Outro"
    dlg.className = base; dlg._perguntas = a.perguntas;
    dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-question-circle"></i></span>
        <div class="att"><b id="adlg-t">O Claude precisa de uma decisão sua</b><span class="asub">Escolha uma opção ou escreva a sua.<span id="adlg-n" class="acount">${n > 1 ? `1 de ${n} pedidos` : ''}</span></span></div></div>${origem}
      <div class="abd aperg">${a.perguntas.map((q, i) => `<fieldset class="aq" data-q="${i}"><legend>${q.header ? `<span class="chip">${esc(q.header)}</span> ` : ''}${esc(q.question)}</legend>
        ${q.options.map((o) => `<label class="aopt"><input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="aq${i}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b>${o.description ? `<em>${esc(o.description)}</em>` : ''}</span></label>`).join('')}
        <label class="aopt"><input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="aq${i}" value="" data-outro="1"><span><b>Outro</b><em>Escreva o que você quer</em></span></label>
        <input type="text" class="aoutro" data-outro-txt="${i}" maxlength="1000" placeholder="Escreva aqui o que você quer…" aria-label="Outro: escreva o que você quer" hidden></fieldset>`).join('')}</div>
      <div class="aft"><button class="btn" data-act="negar" data-id="${a.id}" title="O Claude segue com a melhor suposição"><i class="pi pi-times"></i> Dispensar perguntas</button><span class="sp"></span>
        <button class="btn primary" data-act="responder" title="Envia suas respostas e o Claude segue com elas" data-id="${a.id}"><i class="pi pi-send"></i> Enviar respostas</button></div>`;
    dlg.onchange = (e) => { const f = e.target.closest('.aq'); if (!f) return; const o = f.querySelector('[data-outro]'), t = f.querySelector('.aoutro'); t.hidden = !o.checked; if (o.checked) t.focus(); };
    abrir();
    return;
  }
  dlg.onchange = null;
  dlg.className = base + (prod ? ' prod' : '');
  dlg.innerHTML = `<div class="ahd"><span class="aic"><i class="pi ${prod ? 'pi-exclamation-triangle' : 'pi-shield'}"></i></span>
      <div class="att"><b id="adlg-t">${prod ? 'Atenção: este comando mexe com produção ou internet' : 'O Claude quer fazer isto'}</b>
      <span class="asub">${esc(a.motivo || '')}<span id="adlg-n" class="acount">${n > 1 ? `1 de ${n} pedidos` : ''}</span></span></div></div>${origem}
    <div class="abd">
      <div class="aexp">${chipNivel(ex.nivel)}<p>${esc(ex.resumo)}</p>${ex.passos.length > 1 ? `<ol>${ex.passos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>
      <div class="aexact"><span>Comando exato que será executado <em>(a explicação acima é um resumo automático)</em></span><pre class="acode">${esc(a.resumo)}</pre></div>
      ${prod ? `<label class="aconf"><input type="checkbox" id="aprov-ok"> Entendi o que este comando faz e quero que ele rode.</label>` : ''}</div>
    <div class="aft"><button class="btn danger" data-act="negar" title="Não executa este pedido: o Claude é avisado e segue sem ele" data-id="${a.id}"><i class="pi pi-times"></i> Negar</button><span class="sp"></span>
      ${!prod && a.lembravel ? `<button class="btn" data-act="aprovar-lembrar" data-id="${a.id}" title="Libera só este comando exato, daqui para frente, neste projeto. Você revê em Permissões."><i class="pi pi-bookmark"></i> Aprovar e lembrar</button>` : ''}
      <button class="btn primary" data-act="aprovar" title="Libera só este pedido; o próximo volta a perguntar" data-id="${a.id}" ${prod ? 'disabled' : ''}><i class="pi pi-check"></i> Aprovar só desta vez</button></div>
    ${prod ? '' : `<div class="afoot"><button class="link" data-act="aprovar-sessao" data-id="${a.id}" title="Libera os próximos comandos comuns desta conversa. Produção e comandos bloqueados continuam como estão.">Aprovar tudo desta conversa</button><span>·</span><span>“Lembrar” fica salvo no projeto (veja em <b>Permissões</b>).</span></div>`}`;
  abrir();
}
function fecharAprov(box) { box.hidden = true; box.innerHTML = ''; box.dataset.id = ''; }
let polling = null;
function pollStream(id) {
  if (polling === id) return; polling = id;
  (async () => {
    while (polling === id) {
      try {
        const s = await api('/api/chat/stream?id=' + id);
        const live = $('#live .bubble'), log = $('#chat-log');
        if (live && S.sel?.id === id) {
          const perto = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
          live.innerHTML = (s.text ? md(s.text) : '') + (s.tools?.length ? `<div class="act-wrap">${resumoAcoes(s.tools, true)}</div>` : '') + (s.text || s.tools?.length ? '' : '<span class="typing"><i></i><i></i><i></i></span>');
          if (perto) log.scrollTop = 1e9;
        }
        if (S.sel?.id === id) { (S.vivo ||= {})[id] = s.tools || []; pintarAtividade(curChat()); } // aba Atividade ao vivo
        if (s.done) { polling = null; S.chatKey = null; await loadChats(); updateChat(); return; }
        if (S.vistoRev?.[id] !== s.rev) { // mensagem gravada/consumida ou fila mudou: atualiza o histórico sem esperar o ciclo de 4 s
          (S.vistoRev ||= {})[id] = s.rev; await loadChats(); S.chatKey = null; updateChat();
        }
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
const ALIAS = { fable: 'fable', sonnet: 'sonnet', opus: 'opus', haiku: 'haiku', padrao: 'sonnet', 'padrão': 'sonnet', default: 'sonnet', '': 'sonnet' };
async function send(textArg) {
  // Nunca bloqueia por "o Claude está trabalhando": a mensagem entra na fila nativa do Claude Code (ver docs/business/conversas-claude.md).
  const c = curChat(); const ta = $('#msg'); let text = (textArg ?? ta.value).trim(); const anexo = textArg === undefined ? S.anexo[c?.id] : null; if (!c || (!text && !anexo)) return;
  let m;
  if (!anexo && (m = text.match(/^\/modo(?:\s+(\S*))?$/i))) {
    const v = (m[1] || '').toLowerCase(), k = { plan: 'plan', planejamento: 'plan', perguntar: 'perguntar', ask: 'perguntar', editar: 'editar', normal: 'editar', auto: 'auto', automatico: 'auto', 'automático': 'auto', leitura: 'leitura' }[v];
    if (!k) { toast('Modos: perguntar, editar, plan, auto, leitura'); return; }
    ta.value = ''; S.draft[c.id] = ''; hint(); await cfg({ modo: k }); toast('Modo: ' + MODOS[k][0]); return;
  }
  if (!anexo && (m = text.match(/^\/model(?:\s+(\S*))?$/i))) {
    const v = (m[1] || '').toLowerCase();
    if (!(v in ALIAS)) { toast('Modelos: fable, opus, sonnet (padrão), haiku'); return; }
    ta.value = ''; S.draft[c.id] = ''; hint(); await cfg({ model: ALIAS[v] }); toast('Modelo: ' + MODELS[ALIAS[v]]); return;
  }
  if (!anexo && (m = text.match(/^\/plan(?:\s+([\s\S]+))?$/i))) {
    if (!m[1]) { ta.value = ''; S.draft[c.id] = ''; hint(); await cfg({ plan: !c.plan }); toast(curChat().plan ? 'Plan ligado' : 'Plan desligado'); return; }
    await cfg({ plan: true }); text = m[1].trim();
  } else if (!anexo && text.startsWith('/')) { toast('Comandos disponíveis: /plan, /model e /modo'); return; }
  ta.value = ''; S.draft[c.id] = ''; hint();
  const mid = crypto.randomUUID(); // o servidor ignora o mesmo id repetido (reenvio de rede) e assim nada é duplicado
  if (anexo) { delete S.anexo[c.id]; pintarAnexo(); }
  try { Object.assign(c, await api('/api/chat/enviar', { id: c.id, text, mid, ...(anexo ? { anexo } : {}) })); S.chatKey = null; updateChat(); await loadChats(); }
  catch (x) { if (!ta.value) { ta.value = text; S.draft[c.id] = text; } if (anexo && !S.anexo[c.id]) { S.anexo[c.id] = anexo; pintarAnexo(); } toast(x.message); } // falhou: devolve o texto à caixa, nada se perde
}
// Plano .md anexado à próxima mensagem (por conversa). O arquivo é lido no navegador; o servidor valida nome e tamanho.
const ANEXO_MAX = 300_000;
function pintarAnexo() {
  const box = $('#anexo-chip'), c = curChat(); if (!box) return;
  const a = c && S.anexo[c.id]; box.hidden = !a;
  box.innerHTML = a ? `<i class="pi pi-file"></i><b>${esc(a.nome)}</b><span class="muted small">${a.texto.length.toLocaleString('pt-BR')} caracteres</span><button type="button" class="btn sm" data-act="anexo-rm" title="Remove o plano anexado"><i class="pi pi-times"></i></button>` : '';
}
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'anexo-in') return;
  const f = e.target.files[0], c = curChat(); e.target.value = ''; if (!f || !c) return;
  if (!/\.(md|markdown)$/i.test(f.name)) { toast('Anexe um arquivo .md'); return; }
  if (f.size > ANEXO_MAX * 3) { toast('Arquivo grande demais (máx. 300 mil caracteres)'); return; }
  const texto = await f.text();
  if (!texto.trim()) { toast('O arquivo está vazio'); return; }
  if (texto.length > ANEXO_MAX) { toast('O plano passa de 300 mil caracteres'); return; }
  S.anexo[c.id] = { nome: f.name, texto }; pintarAnexo(); $('#msg')?.focus();
});
function hint() {
  const v = $('#msg')?.value || '', h = $('#hint'); if (!h) return;
  h.textContent = /^\/mo[dD]/i.test(v) ? '/modo perguntar · editar · plan · auto · leitura' : /^\/m/i.test(v) ? '/model fable · opus · sonnet · haiku' : /^\/p/i.test(v) ? '/plan alterna o modo plan · /plan <texto> envia já em plan' : v.startsWith('/') ? 'Comandos: /plan  /model  /modo' : '';
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
  if (r === 'documentacao') { if (!v.querySelector('.doc-page')) { v.innerHTML = '<div class="doc-page" id="doc-root"><div class="note">Carregando…</div></div>'; loadDocumentacao(); } else renderArq(); return; }
  if (r === 'biblioteca') { if (!v.querySelector('.bib-page')) { v.innerHTML = '<div class="bib-page" id="bib-root"><div class="note">Carregando…</div></div>'; loadBiblioteca(); } return; }
  if (r === 'alteracoes') { if (!v.querySelector('.alt-page')) { v.innerHTML = '<div class="alt-page" id="alt-root"></div>'; renderAlteracoes(); loadAlteracoes(true); } return; }
  if (r === 'permissoes') { if (!v.querySelector('.perm-page')) { v.innerHTML = '<div class="perm-page" id="perm-root"><div class="note">Carregando…</div></div>'; loadPermissoes(); } return; }
  v.innerHTML = r === 'pendencias' ? viewPend() : r === 'sessoes' ? viewSess() : viewVisao();
  if (S.focus && r === 'pendencias') document.querySelector(`[data-id="${S.focus}"].item`)?.scrollIntoView({ block: 'center' });
}
window.addEventListener('hashchange', () => { S.focus = null; render(); });

// ---------- eventos ----------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset, act = d.act;
  try {
    switch (act) {
      case 'go': location.hash = '#/' + d.to; break;
      case 'alt-diff': await altDiff(d.p); break;
      case 'alt-commit': await altCommit(!!d.modal); break;
      case 'commit-modal': abrirCommitModal(); break;
      case 'cm-fechar': $('#cdlg').close(); break;
      case 'cm-marcar': { const A = S.alt; A.sel.clear(); if (d.v === '1') for (const a of A.dados?.arquivos || []) if (!a.sensivel) A.sel.add(a.caminho); renderAlteracoes(); break; }
      case 'alt-push': await altPush(); break;
      case 'alt-hist-abrir': await altCommitAbrir(d.sha); break;
      case 'alt-hist-diff': await altCommitDiff(d.sha, d.p); break;
      case 'alt-hist-pag': await loadHistorico(false, Number(d.p)); break;
      case 'alt-pull': await altPull(); break;
      case 'chat-nova-branch': await chatNovaBranch(); break;
      case 'alt-recarregar': await loadAlteracoes(true); toast('Atualizado'); break;
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
      case 'del-chat': if (await confirmar({ titulo: 'Apagar esta conversa?', texto: 'O histórico dela será removido e não dá para desfazer.', ok: 'Apagar', perigo: true })) { await api('/api/chat/apagar', { id: d.id || curChat()?.id }); if (S.sel?.id === (d.id || S.sel?.id)) S.sel = null; await loadChats(); render(); } break;
      case 'rename-chat': { const c = curChat(); const v = c && await pedirTexto({ titulo: 'Renomear conversa', rotulo: 'Nome da conversa', valor: c.title, ok: 'Salvar' }); if (v?.trim()) cfg({ title: v.trim() }); break; }
      case 'close-chat': {
        const c = curChat(); if (!c) break;
        if (d.v === '1' && !(await confirmar({ titulo: 'Encerrar esta conversa?', texto: 'O histórico fica guardado, mas não dá mais para enviar mensagens. Você pode reabrir depois.', ok: 'Encerrar', icone: 'pi-check-circle' }))) break;
        await cfg({ closed: d.v === '1' }); toast(d.v === '1' ? 'Conversa encerrada' : 'Conversa reaberta'); break;
      }
      case 'aba': S.aba = d.v === 'atividade' ? 'atividade' : 'conversa'; aplicarAba(); pintarAtividade(curChat()); if (S.aba === 'conversa') { const l = $('#chat-log'); l.scrollTop = 1e9; } break;
      case 'plan': cfg({ plan: !curChat().plan }); break;
      case 'plan-sair': await cfg({ plan: false }); toast('Modo planejamento desligado'); break;
      case 'plan-continuar': {
        const c = curChat(); if (!c || c.running) break;
        await cfg({ plan: false });
        await send('Plano aprovado. O modo planejamento foi desligado. Pode executar o plano agora.');
        break;
      }
      case 'anexar': $('#anexo-in')?.click(); break;
      case 'anexo-rm': { const c = curChat(); if (c) { delete S.anexo[c.id]; pintarAnexo(); } break; }
      case 'send': send(); break;
      case 'aprovar': case 'negar': case 'aprovar-sessao': case 'aprovar-lembrar': {
        const box = el.closest('.adlg'); box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await api('/api/aprovacao/decidir', { id: d.id, permitir: act !== 'negar', sessao: act === 'aprovar-sessao', lembrar: act === 'aprovar-lembrar' }); if (act === 'aprovar-sessao') toast('Comandos comuns aprovados até o fim desta conversa. Produção continua pedindo.'); if (act === 'aprovar-lembrar') toast('Aprovado e lembrado. Você pode rever em Permissões.'); }
        catch (x) { toast(x.message); }
        fecharAprov(box); loadChats();
        break;
      }
      case 'plano-sim': case 'plano-nao': case 'plano-instrucao': {
        $('#plan-card').querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await api('/api/aprovacao/decidir', { id: d.id, permitir: act === 'plano-sim', sairPlano: act === 'plano-instrucao' }); }
        catch (x) { toast(x.message); }
        $('#plan-card').hidden = true; $('#plan-card').innerHTML = ''; $('#plan-card').dataset.id = '';
        S.chatKey = null; await loadChats();
        if (act === 'plano-instrucao') { toast('Saiu do planejamento. Escreva a instrução para o agente.'); setTimeout(() => $('#msg')?.focus(), 50); }
        break;
      }
      case 'responder': {
        const respostas = {}; let falta = false;
        const box = el.closest('.adlg');
        box.querySelectorAll('.aq').forEach((f) => {
          const vals = [];
          f.querySelectorAll('input[type=radio],input[type=checkbox]').forEach((i) => { if (!i.checked) return; const v = i.dataset.outro ? f.querySelector('.aoutro').value.trim() : i.value; if (v) vals.push(v); });
          respostas[f.dataset.q] = vals.join(', '); if (!vals.length) falta = true;
        });
        if (falta) { toast('Responda todas as perguntas (em “Outro”, escreva o texto).'); break; }
        const porTexto = Object.fromEntries((box._perguntas || []).map((p, i) => [p.question, respostas[i]]));
        box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await api('/api/aprovacao/decidir', { id: d.id, permitir: true, respostas: porTexto }); }
        catch (x) { toast(x.message); }
        fecharAprov(box); loadChats();
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
      case 'bib-area': S.bib.area = d.a || ''; renderBiblioteca(); break;
      case 'bib-ver': {
        try { const x = await api('/api/biblioteca/doc?id=' + encodeURIComponent(d.id)); $('#dt').textContent = `${x.areaNome} · ${x.titulo}`; $('#dc').innerHTML = md(x.conteudo); $('#dlg').showModal(); } catch (e) { toast(e.message); }
        break;
      }
      case 'bib-limpar': S.bib.sel.clear(); renderBiblioteca(); break;
      case 'bib-anexar': abrirAnexar(); break;
      case 'bib-anexar-ok': {
        const modo = document.querySelector('input[name="bib-modo"]:checked')?.value || 'adaptar', ids = [...S.bib.sel];
        el.disabled = true;
        try {
          const r = await api('/api/biblioteca/anexar', { ids, modo, modelo: $('#bib-modelo')?.value || 'sonnet' });
          if (modo === 'adaptar') { $('#bdlg').close(); S.bib.sel.clear(); toast('O Claude começou a adaptar. Acompanhe por aqui.'); location.hash = `#/chat?s=${r.id}`; break; }
          S.bib.sel.clear();
          $('#bdlg').innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-check-circle"></i></span><div class="att"><b id="bdlg-t">Documentos anexados</b><span class="asub">Cópias criadas em docs/ do projeto.</span></div></div>
            <div class="abd"><ul class="perm-list">${r.criados.map((x) => `<li><b>docs/${esc(x)}</b><span class="muted small">novo</span></li>`).join('')}${r.renomeados.map((x) => `<li><b>docs/${esc(x.para)}</b><span class="muted small">${x.ja ? 'já existia (nada foi alterado)' : `já havia docs/${esc(x.de)}; a cópia ganhou outro nome`}</span></li>`).join('')}</ul>
            <p class="muted small">Cada cópia começa com um aviso de que veio de outro projeto. Revise e ajuste (ou use “Copiar e adaptar com o Claude”) antes de tratá-la como a documentação deste projeto.</p></div>
            <div class="aft"><span class="sp"></span><button class="btn" data-act="bib-fechar" title="Fecha esta janela sem alterar nada">Fechar</button><a class="btn primary" href="#/documentacao" data-act="bib-fechar"><i class="pi pi-book"></i> Ver a documentação</a></div>`;
          loadBiblioteca(true); // atualiza "meus documentos" (as cópias novas já existem em docs/)
        } catch (x) { toast(x.message); el.disabled = false; }
        break;
      }
      case 'bib-fechar': $('#bdlg').close(); break;
      case 'gen-abrir': abrirGeneralizar(d.todos === '1'); break;
      case 'gen-ok': {
        const modelo = $('#bib-modelo')?.value || 'sonnet';
        const corpo = d.fonte === 'publicar' ? { arquivos: [...document.querySelectorAll('.pub-doc:checked')].map((x) => x.value), modelo } : { ids: JSON.parse(d.ids || '[]'), modelo };
        el.disabled = true;
        try { await api('/api/biblioteca/generalizar', corpo); $('#bdlg').close(); S.bib.sel.clear(); toast('O Claude começou. Os rascunhos aparecem no topo da biblioteca.'); await loadBiblioteca(); window.scrollTo({ top: 0 }); }
        catch (x) { toast(x.message); el.disabled = false; }
        break;
      }
      case 'rasc-ver': case 'rasc-orig': {
        try { const x = await api(`/api/biblioteca/rascunho?lote=${d.lote}&item=${encodeURIComponent(d.item)}${act === 'rasc-orig' ? '&original=1' : ''}`); $('#dt').textContent = `${act === 'rasc-orig' ? 'Original' : 'Rascunho generalizado'} · ${x.titulo}`; $('#dc').innerHTML = md(x.conteudo); $('#dlg').showModal(); } catch (x) { toast(x.message); }
        break;
      }
      case 'rasc-ok': { try { await api('/api/biblioteca/rascunho/aceitar', { lote: d.lote, itens: [d.item] }); toast('Aceito: já está na biblioteca.'); await loadBiblioteca(); } catch (x) { toast(x.message); } break; }
      case 'rasc-no': { try { await api('/api/biblioteca/rascunho/descartar', { lote: d.lote, itens: [d.item] }); await loadBiblioteca(); } catch (x) { toast(x.message); } break; }
      case 'rasc-ok-todos': { if (await confirmar({ titulo: `Aceitar ${d.n} rascunhos?`, texto: 'Eles substituem as versões atuais na biblioteca.', ok: 'Aceitar todos' })) { try { const r = await api('/api/biblioteca/rascunho/aceitar', { lote: d.lote, itens: 'todos' }); toast(`${r.aceitos.length} documentos atualizados na biblioteca.`); await loadBiblioteca(); } catch (x) { toast(x.message); } } break; }
      case 'rasc-no-todos': { if (await confirmar({ titulo: 'Descartar todos os rascunhos deste lote?', texto: 'Se o Claude ainda estiver trabalhando, os que faltam não serão aproveitados.', ok: 'Descartar', perigo: true })) { try { await api('/api/biblioteca/rascunho/descartar', { lote: d.lote, itens: 'todos' }); await loadBiblioteca(); } catch (x) { toast(x.message); } } break; }
      case 'bib-pub': abrirPublicar(); break;
      case 'bib-pub-ok': {
        const arquivos = [...document.querySelectorAll('.pub-doc:checked')].map((x) => x.value);
        el.disabled = true;
        try { const r = await api('/api/biblioteca/publicar', { arquivos }); $('#bdlg').close(); toast(`${r.publicados} documento${r.publicados === 1 ? '' : 's'} publicado${r.publicados === 1 ? '' : 's'} na biblioteca.`); await loadBiblioteca(); }
        catch (x) { toast(x.message); el.disabled = false; }
        break;
      }
      case 'bib-doc-del': { if (await confirmar({ titulo: 'Remover da biblioteca?', detalhe: d.nome, texto: 'O documento original no projeto de origem não é afetado.', ok: 'Remover', perigo: true })) { try { await api('/api/biblioteca/remover', { id: d.id }); S.bib.sel.delete(d.id); toast('Documento removido da biblioteca.'); await loadBiblioteca(); } catch (x) { toast(x.message); } } break; }
      case 'bib-col-del': { if (await confirmar({ titulo: 'Remover da biblioteca?', detalhe: d.nome, texto: 'Os projetos que já usaram esses documentos não mudam.', ok: 'Remover', perigo: true })) { try { await api('/api/biblioteca/remover', { colecao: d.id }); toast('Removido da biblioteca.'); await loadBiblioteca(); } catch (x) { toast(x.message); } } break; }
      case 'perm-pacote': { try { await api('/api/permissoes/pacote', { id: d.id, ligado: el.checked }); toast(el.checked ? 'Pacote ligado.' : 'Pacote desligado.'); } catch (x) { toast(x.message); } await loadPermissoes(); break; }
      case 'perm-esquecer': { const c = S.perm.lembrados[Number(d.i)]?.comando; if (c && await confirmar({ titulo: 'Remover esta permissão?', texto: 'Da próxima vez o Claude vai perguntar de novo.', ok: 'Remover', perigo: true })) { await api('/api/permissoes/esquecer', { comando: c }); toast('Permissão removida.'); await loadPermissoes(); } break; }
      case 'perm-add': {
        const texto = $(`#perm-${d.tipo}-texto`).value.trim(), motivo = $(`#perm-${d.tipo}-motivo`).value.trim();
        if (!texto) { toast('Escreva o texto a procurar nos comandos.'); break; }
        try { await api('/api/permissoes/regra', { tipo: d.tipo, texto, motivo }); S.perm.erro = ''; toast('Regra adicionada.'); } catch (x) { S.perm.erro = x.message; }
        await loadPermissoes(); break;
      }
      case 'perm-del': { const r = S.perm[d.tipo === 'producao' ? 'producao' : 'bloqueios'][Number(d.i)]; if (r && await confirmar({ titulo: 'Remover esta regra?', detalhe: `Comandos que contenham “${r.texto}”`, ok: 'Remover', perigo: true })) { await api('/api/permissoes/regra/remover', { tipo: d.tipo, texto: r.texto }); await loadPermissoes(); } break; }
      case 'perm-test': {
        const c = $('#perm-cmd').value.trim(); if (!c) break;
        try { S.perm.teste = { cmd: c, ...(await api('/api/permissoes/testar', { comando: c })) }; } catch (x) { S.perm.teste = { cmd: c, erro: x.message }; }
        renderPermissoes(); $('#perm-cmd').focus(); break;
      }
      case 'stop': api('/api/chat/cancelar', { id: curChat().id }); break;
      case 'quick': { const ta = $('#msg'); if (ta) send(d.p); break; }
      case 'status': break;
      case 'remove': {
        const i = itemById(d.id); if (!(await confirmar({ titulo: 'Apagar esta linha do pendencias/README.md?', detalhe: i.title, texto: 'Isso não dá para desfazer pelo Tilo.', ok: 'Apagar', perigo: true }))) break;
        await api('/api/remover', { line: i.line, raw: i.raw }); await loadPend(); render(); toast('Removido do README'); break;
      }
      case 'rename': { const x = S.term.find((s) => s.id === d.id); const v = await pedirTexto({ titulo: 'Apelido da sessão', rotulo: 'Apelido', valor: x.apelido || x.title || '', ok: 'Salvar' }); if (v !== null) { await api('/api/sessoes/meta', { id: d.id, apelido: v }); await loadSess(); render(); } break; }
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
document.addEventListener('input', (e) => { // busca da biblioteca (com atraso curto para não consultar a cada tecla)
  if (e.target.id !== 'bib-q' || !S.bib) return;
  clearTimeout(S.bibT); S.bibT = setTimeout(() => { S.bib.q = e.target.value; loadBiblioteca(true); }, 250);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.classList?.contains('bib-sel') && S.bib) { if (t.checked) S.bib.sel.add(t.value); else S.bib.sel.delete(t.value); renderBiblioteca(); return; }
  if (t.id === 'bib-col' && S.bib) { S.bib.col = t.value; renderBiblioteca(); return; }
  if (t.name === 'bib-modo') { const m = $('#bib-modelo-box'); if (m) m.hidden = t.value !== 'adaptar'; return; }
  if (t.classList?.contains('pub-area')) { document.querySelectorAll(`.pub-doc[data-area="${t.value}"]`).forEach((x) => { x.checked = t.checked; }); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'perm-cmd') { e.preventDefault(); document.querySelector('[data-act="perm-test"]').click(); } });
async function loadDocumentacao(silencioso) {
  try { const g = await api('/api/documentacao'); S.doc = { ...g, modelo: $('#doc-modelo')?.value || S.doc?.modelo || 'sonnet' }; }
  catch (x) { if (!silencioso) { const r = $('#doc-root'); if (r) r.innerHTML = `<div class="note">Não consegui carregar: ${esc(x.message)}</div>`; } return; }
  renderDocumentacao();
  // atualiza sozinho só enquanto a documentação está sendo gerada
  if (S.docTimer && !S.doc.job?.rodando) { clearInterval(S.docTimer); S.docTimer = null; }
  if (!S.docTimer && S.doc.job?.rodando) S.docTimer = setInterval(() => { if (route() !== 'documentacao') { clearInterval(S.docTimer); S.docTimer = null; return; } loadDocumentacao(true); }, 4000);
}
function renderDocumentacao() {
  const root = $('#doc-root'); if (!root || !S.doc) return;
  const D = S.doc, rodando = D.job?.rodando, vazio = D.total === 0;
  const ok = (b) => `<i class="pi ${b ? 'pi-check-circle doc-ok' : 'pi-circle doc-no'}"></i>`;
  root.innerHTML = `<div class="page-head"><div><h1 class="page-title">Documentação do projeto</h1>
    <p class="page-sub">O Claude lê o código e escreve a documentação oficial (<b>docs/</b>), organizada por área. Só cria as áreas que o projeto realmente tem.</p></div></div>
  ${rodando ? `<div class="card doc-run"><div class="card-head"><span class="ico"><i class="pi pi-spin pi-spinner"></i></span><h3>Documentação em andamento</h3><a class="link" href="#/chat?s=${D.job.chatId}">Ver a conversa</a></div><div class="card-body"><p class="muted small">Pode levar vários minutos. Os arquivos novos aparecem abaixo. Você pode sair desta tela: ela continua.</p></div></div>` : D.job ? `<div class="card"><div class="card-head"><span class="ico"><i class="pi pi-history"></i></span><h3>Última execução</h3><a class="link" href="#/chat?s=${D.job.chatId}">Ver a conversa e o resumo</a></div></div>` : ''}
  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-th-large"></i></span><h3>Como está hoje</h3><span class="muted small">${D.total} documento${D.total === 1 ? '' : 's'} em docs/</span></div><div class="card-body">
    <div class="doc-grid">${D.areas.map((a) => `<div class="doc-area ${a.arquivos ? 'on' : ''}">${ok(a.arquivos)}<b>${esc(a.nome)}</b><span class="muted small">${a.arquivos ? `${a.arquivos} documento${a.arquivos === 1 ? '' : 's'}` : 'ainda não existe'}</span></div>`).join('')}</div>
    <ul class="doc-geral"><li>${ok(D.geral.docsReadme)} <b>docs/README.md</b> índice geral</li><li>${ok(D.geral.claudeMd)} <b>CLAUDE.md</b> instruções para o Claude trabalhar no projeto</li><li>${ok(D.geral.planning)} <b>planning/</b> planos ainda não fechados</li><li>${ok(D.geral.pendencias)} <b>pendencias/</b> o seu painel (é daqui que o Tilo lê as pendências)</li></ul></div></div>
  <div id="arq-root"></div>
  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-sparkles"></i></span><h3>${vazio ? 'Montar a documentação' : 'Montar ou atualizar'}</h3></div><div class="card-body">
    <p class="small">${vazio ? 'O Claude lê o projeto, escreve os documentos em português e confere cada afirmação no código.' : '<b>Criar o que falta</b> escreve só o que ainda não existe. <b>Conferir com o código</b> compara cada documento com o código e corrige o que está desatualizado.'} O que ele não conseguir confirmar vai para <b>pendencias/</b>.</p>
    <details class="doc-det"><summary>O que ele pode e não pode fazer</summary><ul class="doc-bul">
      <li><b>Não mexe no código</b>, não usa terminal e não lê senhas (.env, chaves). Só escreve em <code>docs/</code>, <code>planning/</code>, <code>pendencias/</code> e <code>CLAUDE.md</code>.</li>
      <li><b>Arquivos novos</b> são criados direto. Para <b>alterar um arquivo que já existe</b>, ele pede a sua aprovação.</li>
      <li><b>Tempo e uso:</b> de 5 a 30 minutos, conforme o tamanho do projeto, usando a sua assinatura do Claude.</li></ul></details>
    <div class="doc-acoes"><label>Modelo de IA <select id="doc-modelo" class="sel sm">${optsModelo(D.modelo || DEFAULT_MODEL)}</select></label>
      <span class="sp"></span>
      <button class="btn ${vazio ? 'primary' : ''}" data-act="doc-iniciar" title="O Claude lê o projeto e trabalha na pasta docs/; você acompanha na conversa que abre" data-modo="criar" ${rodando ? 'disabled' : ''}><i class="pi pi-plus"></i> ${vazio ? 'Montar a documentação' : 'Criar o que falta'}</button>
      ${vazio ? '' : `<button class="btn primary" data-act="doc-iniciar" title="O Claude lê o projeto e trabalha na pasta docs/; você acompanha na conversa que abre" data-modo="atualizar" ${rodando ? 'disabled' : ''}><i class="pi pi-refresh"></i> Conferir com o código e atualizar</button>`}</div></div></div>
  <a class="card doc-lib" href="#/biblioteca"><span class="ico"><i class="pi pi-bookmark"></i></span><div><b>Quer um ponto de partida?</b><span class="muted small">Na <b>Biblioteca de documentos</b> você busca documentos prontos por área (backend, frontend, infra, segurança...), vê o conteúdo e anexa a este projeto.</span></div><i class="pi pi-angle-right"></i></a>`;
  renderArq();
}

// ---------- Biblioteca de documentos ----------
async function loadBiblioteca(soLista) {
  const q = S.bib?.q || '';
  try { const [g, r] = await Promise.all([api('/api/biblioteca?q=' + encodeURIComponent(q)), api('/api/biblioteca/rascunhos')]); S.bib = { ...g, lotes: r.lotes, q, area: S.bib?.area || '', col: S.bib?.col || '', sel: S.bib?.sel || new Set() }; }
  catch (x) { const r = $('#bib-root'); if (r && !soLista) r.innerHTML = `<div class="note">Não consegui carregar: ${esc(x.message)}</div>`; return; }
  for (const id of [...S.bib.sel]) if (!S.bib.docs.some((d) => d.id === id) && !q) S.bib.sel.delete(id); // some da biblioteca -> sai da seleção
  renderBiblioteca(!soLista);
  const rodando = S.bib.lotes.some((l) => l.rodando);
  if (S.bibTimer && !rodando) { clearInterval(S.bibTimer); S.bibTimer = null; }
  if (!S.bibTimer && rodando) S.bibTimer = setInterval(() => { if (route() !== 'biblioteca') { clearInterval(S.bibTimer); S.bibTimer = null; return; } loadBiblioteca(true); }, 5000);
}
function renderBiblioteca(forcar) {
  const root = $('#bib-root'); if (!root || !S.bib) return;
  const B = S.bib;
  const visiveis = B.docs.filter((d) => (!B.area || d.area === B.area) && (!B.col || d.colecao === B.col));
  const totalGeral = B.areas.reduce((n, a) => n + a.total, 0);
  if (forcar || !$('#bib-list')) {
    root.innerHTML = `<div class="page-head"><div><h1 class="page-title">Biblioteca de documentos</h1>
      <p class="page-sub">Documentos técnicos prontos, vindos dos seus outros projetos. Busque por área ou assunto, veja o conteúdo e <b>anexe a este projeto</b>.</p></div>
      <button class="btn" data-act="bib-pub" title="Envia para a biblioteca os documentos de docs/ deste projeto"><i class="pi pi-upload"></i> Publicar documentos deste projeto</button></div>
    <div class="card bib-tools"><div class="card-body">
      <div class="bib-search"><i class="pi pi-search"></i><input id="bib-q" class="inp" placeholder="Buscar por assunto (ex.: autenticação, rotas, docker, segurança)" value="${esc(B.q)}" autocomplete="off" aria-label="Buscar documentos"></div>
      <div class="bib-chips" id="bib-chips"></div>
      ${B.colecoes.length > 1 ? `<label class="bib-col">Projeto de origem <select id="bib-col" class="sel sm"><option value="">Todos</option>${B.colecoes.map((c) => `<option value="${esc(c.id)}" ${B.col === c.id ? 'selected' : ''}>${esc(c.nome)} (${c.total})</option>`).join('')}</select></label>` : ''}
    </div></div>
    <div id="bib-rasc"></div>
    <div id="bib-list"></div>
    <div class="bib-bar" id="bib-bar" hidden></div>
    <div id="bib-cols"></div>`;
  }
  $('#bib-rasc').innerHTML = (B.lotes || []).map((l) => `<div class="card bib-lote"><div class="card-head"><span class="ico"><i class="pi ${l.rodando ? 'pi-spin pi-spinner' : 'pi-file-edit'}"></i></span><h3>${esc(l.titulo)}</h3><span class="muted small">${l.itens.length} de ${l.total} pronto${l.itens.length === 1 ? '' : 's'}${l.rodando ? ' · o Claude está escrevendo…' : ''}</span></div><div class="card-body">
    <p class="muted small">${l.rodando ? 'Pode levar vários minutos. Os rascunhos aparecem aqui conforme ficam prontos. <b>Nada entra na biblioteca sem a sua aceitação.</b>' : l.itens.length ? 'Revise cada rascunho. <b>Aceitar</b> grava na biblioteca e substitui a versão atual, quando houver. Use <b>Ver original</b> para comparar.' : 'Terminou sem gerar rascunhos: o Claude pode ter considerado os documentos específicos demais. Veja a conversa para o motivo.'}</p>
    ${l.itens.map((i) => `<div class="bib-rasc"><div class="bib-meta"><div class="top"><b>${esc(i.titulo)}</b><span class="lv lv-ok">${esc(i.areaNome)}</span></div><span class="muted small">título anterior: ${esc(i.tituloOriginal)}</span>${i.resumo ? `<p>${esc(i.resumo)}</p>` : ''}</div>
      <div class="bib-rasc-btns"><button class="btn sm" data-act="rasc-ver" title="Mostra o texto generalizado pelo Claude" data-lote="${l.id}" data-item="${esc(i.item)}"><i class="pi pi-eye"></i> Ver rascunho</button><button class="btn sm" data-act="rasc-orig" title="Mostra o documento como está hoje na biblioteca" data-lote="${l.id}" data-item="${esc(i.item)}">Ver original</button><button class="btn sm primary" data-act="rasc-ok" title="Coloca este rascunho na biblioteca no lugar da versão atual" data-lote="${l.id}" data-item="${esc(i.item)}"><i class="pi pi-check"></i> Aceitar rascunho</button><button class="btn sm" data-act="rasc-no" title="Joga fora este rascunho; a biblioteca não muda" data-lote="${l.id}" data-item="${esc(i.item)}">Descartar rascunho</button></div></div>`).join('')}
    <div class="bib-lote-acoes">${l.chatId ? `<a class="link" href="#/chat?s=${l.chatId}">Ver a conversa</a>` : ''}<span class="sp"></span>${l.itens.length > 1 ? `<button class="btn sm primary" data-act="rasc-ok-todos" title="Coloca todos os rascunhos do lote na biblioteca, no lugar das versões atuais" data-lote="${l.id}" data-n="${l.itens.length}"><i class="pi pi-check-circle"></i> Aceitar todos (${l.itens.length})</button>` : ''}<button class="btn sm" data-act="rasc-no-todos" title="Joga fora os rascunhos do lote; a biblioteca não muda" data-lote="${l.id}">${l.rodando ? 'Cancelar e descartar' : 'Descartar o lote'}</button></div></div></div>`).join('');
  $('#bib-chips').innerHTML = `<button class="chipbtn ${B.area ? '' : 'on'}" data-act="bib-area" data-a="">Todas as áreas <span>${B.q ? B.docs.length : totalGeral}</span></button>` +
    B.areas.filter((a) => a.total).map((a) => `<button class="chipbtn ${B.area === a.id ? 'on' : ''}" data-act="bib-area" data-a="${a.id}">${esc(a.nome)} <span>${B.docs.filter((d) => d.area === a.id).length}</span></button>`).join('');
  $('#bib-list').innerHTML = !totalGeral
    ? `<div class="card"><div class="card-body bib-vazio"><i class="pi pi-bookmark"></i><b>A biblioteca ainda está vazia</b><span class="muted">Publique a documentação técnica deste (ou de outro) projeto para reaproveitá-la em projetos novos ou já existentes.</span><button class="btn primary" data-act="bib-pub" title="Envia para a biblioteca os documentos de docs/ deste projeto"><i class="pi pi-upload"></i> Publicar documentos deste projeto</button></div></div>`
    : visiveis.length ? visiveis.map((d) => `<label class="bib-doc ${B.sel.has(d.id) ? 'on' : ''}"><input type="checkbox" class="bib-sel" value="${esc(d.id)}" ${B.sel.has(d.id) ? 'checked' : ''}>
        <div class="bib-meta"><div class="top"><b>${esc(d.titulo)}</b><span class="lv lv-ok">${esc(d.areaNome)}</span></div>${d.resumo ? `<p>${esc(d.resumo)}</p>` : ''}<span class="muted small">${esc(d.colecaoNome)} · ${esc(d.arquivo)} · ${Math.max(1, Math.round(d.bytes / 1024))} KB</span></div>
        <button type="button" class="btn sm" data-act="bib-ver" title="Mostra o texto do documento sem anexar" data-id="${esc(d.id)}"><i class="pi pi-eye"></i> Ver documento</button></label>`).join('')
    : `<div class="card"><div class="card-body bib-vazio"><i class="pi pi-search"></i><b>Nada encontrado</b><span class="muted">Tente outras palavras ou outra área.</span></div></div>`;
  const n = B.sel.size, bar = $('#bib-bar');
  bar.hidden = !n;
  bar.innerHTML = n ? `<b>${n} documento${n === 1 ? '' : 's'} selecionado${n === 1 ? '' : 's'}</b><span class="sp"></span><button class="btn" data-act="bib-limpar" title="Tira a marca de todos os documentos escolhidos"><i class="pi pi-minus-circle"></i> Desmarcar tudo</button><button class="btn" data-act="gen-abrir" title="O Claude reescreve os documentos escolhidos sem o que é específico do produto; você revisa antes de entrarem na biblioteca"><i class="pi pi-sparkles"></i> Generalizar com o Claude</button><button class="btn primary" data-act="bib-anexar" title="Traz os documentos marcados para a pasta docs/ deste projeto"><i class="pi pi-paperclip"></i> Anexar ao projeto</button>` : '';
  $('#bib-cols').innerHTML = B.colecoes.length ? `<details class="doc-det bib-gerir"><summary>Gerenciar o que foi publicado</summary><div class="bib-gerir-topo"><button class="btn sm" data-act="gen-abrir" data-todos="1"><i class="pi pi-sparkles"></i> Generalizar toda a biblioteca com o Claude</button></div>${B.colecoes.map((c) => `<div class="bib-col-bloco"><div class="bib-col-cab"><b>${esc(c.nome)}</b><span class="muted small">${c.total} documento${c.total === 1 ? '' : 's'}${c.publicadoEm ? ` · publicado em ${quando(c.publicadoEm)}` : ''}</span><span class="sp"></span><button class="btn sm" data-act="bib-col-del" title="Remove da biblioteca todos os documentos desta origem; projetos que já usaram não mudam" data-id="${esc(c.id)}" data-nome="${esc(c.nome)}"><i class="pi pi-trash"></i> Remover tudo desta origem</button></div>
    <ul class="perm-list">${B.docs.filter((d) => d.colecao === c.id).map((d) => `<li class="bib-linha"><span><b>${esc(d.titulo)}</b> <span class="muted small">${esc(d.areaNome)} · ${esc(d.arquivo)}</span></span><button class="btn sm" data-act="bib-doc-del" title="Remove só da biblioteca; o original no projeto de origem não é afetado" data-id="${esc(d.id)}" data-nome="${esc(d.titulo)}"><i class="pi pi-times"></i> Remover da biblioteca</button></li>`).join('')}</ul></div>`).join('')}</details>` : '';
}
function abrirAnexar() {
  const B = S.bib, sel = B.docs.filter((d) => B.sel.has(d.id)), nome = B.projeto?.nome || 'o projeto';
  if (!sel.length) return;
  $('#bdlg').innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-paperclip"></i></span><div class="att"><b id="bdlg-t">Anexar ${sel.length} documento${sel.length === 1 ? '' : 's'} a ${esc(nome)}</b><span class="asub">Eles vão para a pasta <code>docs/</code> do projeto.</span></div></div>
    <div class="abd"><ul class="bib-resumo">${sel.slice(0, 6).map((d) => `<li><b>${esc(d.titulo)}</b> <span class="muted small">${esc(d.areaNome)} · ${esc(d.colecaoNome)}</span></li>`).join('')}${sel.length > 6 ? `<li class="muted small">e mais ${sel.length - 6}…</li>` : ''}</ul>
      <label class="bib-opt"><input type="radio" name="bib-modo" value="adaptar" checked><span><b>Copiar e adaptar com o Claude <em>(recomendado)</em></b><span class="muted small">O Claude usa os documentos como base e escreve versões que descrevem <b>este projeto</b>, conferidas no código. Leva alguns minutos e usa a sua assinatura.</span></span></label>
      <label class="bib-opt"><input type="radio" name="bib-modo" value="copiar"><span><b>Só copiar</b><span class="muted small">Cria cópias exatas em <code>docs/</code>, na hora, com um aviso no topo. Podem citar nomes e regras do outro projeto: revise. Se já existir um documento com o mesmo nome, ele <b>não é substituído</b>: a cópia ganha o nome da origem.</span></span></label>
      <div id="bib-modelo-box"><label class="bib-mod">Modelo de IA <select id="bib-modelo" class="sel sm">${optsModelo(DEFAULT_MODEL)}</select></label></div></div>
    <div class="aft"><span class="sp"></span><button class="btn" data-act="bib-fechar" title="Fecha esta janela sem alterar nada">Cancelar</button><button class="btn primary" data-act="bib-anexar-ok" title="Anexa os documentos marcados do jeito escolhido acima"><i class="pi pi-check"></i> Anexar documentos</button></div>`;
  $('#bdlg').showModal();
}
function abrirGeneralizar(todos) {
  const B = S.bib, ids = todos ? B.docs.map((d) => d.id) : [...B.sel];
  if (!ids.length) return;
  $('#bdlg').innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-sparkles"></i></span><div class="att"><b id="bdlg-t">Generalizar ${ids.length} documento${ids.length === 1 ? '' : 's'} com o Claude</b><span class="asub">${todos ? 'Todos os documentos da biblioteca.' : 'Os documentos que você marcou.'}</span></div></div>
    <div class="abd"><ul class="doc-bul"><li>O Claude <b>reescreve cada documento sem o que é específico do seu produto</b> (nomes, domínio de negócio, módulos, serviços próprios) e mantém o que é padrão técnico reaproveitável.</li>
      <li>Cada um ganha um <b>título que diz o escopo</b> (por exemplo, “Autenticação e autorização em backends .NET multi-tenant por empresa”) e um parágrafo inicial dizendo a que tipo de projeto serve.</li>
      <li>O resultado vira <b>rascunho</b>: você vê, compara com o original e só então aceita. Nada entra na biblioteca sozinho.</li>
      <li>Leva de alguns minutos a algumas dezenas de minutos, conforme a quantidade, e usa a sua assinatura do Claude.</li></ul>
      <label class="bib-mod">Modelo de IA <select id="bib-modelo" class="sel sm">${optsModelo(DEFAULT_MODEL)}</select></label></div>
    <div class="aft"><span class="sp"></span><button class="btn" data-act="bib-fechar" title="Fecha esta janela sem alterar nada">Cancelar</button><button class="btn primary" data-act="gen-ok" title="O Claude reescreve os documentos sem o que é do produto; os rascunhos aparecem no topo da biblioteca para você revisar" data-fonte="biblioteca" data-ids="${esc(JSON.stringify(ids))}"><i class="pi pi-sparkles"></i> Começar</button></div>`;
  $('#bdlg').showModal();
}
function abrirPublicar() {
  const B = S.bib, meus = B.meus || [], nome = B.projeto?.nome || 'este projeto';
  $('#bdlg').innerHTML = `<div class="ahd"><span class="aic"><i class="pi pi-upload"></i></span><div class="att"><b id="bdlg-t">Publicar documentos de ${esc(nome)}</b><span class="asub">Ficam na biblioteca para reaproveitar em outros projetos.</span></div></div>
    <div class="abd">${meus.length ? `<div class="pub-aviso"><b>Marque só o que serve para qualquer projeto.</b> Deixe de fora documentos sobre funcionalidades ou serviços específicos do seu produto (por exemplo: automação do blog, assistente de IA, tutoriais, deploy do seu servidor). Use <b>ver</b> para conferir o conteúdo. Regras de negócio, planejamento e pendências nunca entram.<br><b>Recomendado: generalizar com o Claude.</b> Ele reescreve cada documento sem o que é do seu produto, com um título que diz para que tipo de projeto serve, e você revisa antes de entrar na biblioteca. <em>Publicar como está</em> copia o documento original.</div>
      <div class="pub-lista">${meus.map((a) => `<div class="pub-area-bloco"><label class="pub-ah"><input type="checkbox" class="pub-area" value="${a.area}"> <b>${esc(a.nome)}</b> <span class="muted small">${a.arquivos.length} documento${a.arquivos.length === 1 ? '' : 's'}${a.area === 'data-platform' ? ' (costuma ser específico do produto)' : ''} · marcar todos</span></label>
        ${a.arquivos.map((f) => `<label class="pub-item"><input type="checkbox" class="pub-doc" data-area="${a.area}" value="${esc(a.area + '/' + f.rel)}"> ${esc(f.titulo)} <span class="muted small">${esc(f.rel)}</span><button type="button" class="link" data-act="file" data-p="${esc('docs/' + a.area + '/' + f.rel)}">ver</button></label>`).join('')}</div>`).join('')}</div>`
      : '<p class="muted">Este projeto ainda não tem documentação técnica em <code>docs/</code> (backend, frontend, infra, deploy, segurança ou dados). Monte-a na aba Documentação primeiro.</p>'}</div>
    <div class="aft">${meus.length ? '<label class="bib-mod">Modelo de IA <select id="bib-modelo" class="sel sm">' + optsModelo(DEFAULT_MODEL) + '</select></label>' : ''}<span class="sp"></span><button class="btn" data-act="bib-fechar" title="Fecha esta janela sem alterar nada">Cancelar</button>${meus.length ? '<button class="btn" data-act="bib-pub-ok" title="Publica os documentos marcados na biblioteca sem reescrever"><i class="pi pi-upload"></i> Publicar como está</button><button class="btn primary" data-act="gen-ok" title="O Claude reescreve os documentos sem o que é do produto; os rascunhos aparecem no topo da biblioteca para você revisar" data-fonte="publicar"><i class="pi pi-sparkles"></i> Generalizar com o Claude</button>' : ''}</div>`;
  $('#bdlg').showModal();
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
    ${itens.length ? `<ul class="perm-list">${itens.map((r, i) => `<li><b>Comandos que contenham “${esc(r.texto)}”</b><span class="muted">${esc(r.motivo)}</span><button class="btn sm" data-act="perm-del" title="Apaga esta regra da lista" data-tipo="${tipo}" data-i="${i}"><i class="pi pi-trash"></i> Remover regra</button></li>`).join('')}</ul>` : ''}
    <div class="perm-add"><input class="inp" id="perm-${tipo}-texto" placeholder="${ph}" maxlength="80" aria-label="Texto a procurar"><input class="inp" id="perm-${tipo}-motivo" placeholder="Motivo (opcional)" maxlength="120" aria-label="Motivo"><button class="btn sm" data-act="perm-add" title="Cria a regra: comandos que contenham este texto passam a seguir esta lista" data-tipo="${tipo}"><i class="pi pi-plus"></i> Adicionar regra</button></div></div>`;
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
    ${P.lembrados.length ? `<ul class="perm-list">${P.lembrados.map((l, i) => `<li><span class="top">${chipNivel(l.nivel)}<b>${esc(l.resumo)}</b></span>${l.passos.length > 1 ? `<ol class="muted small">${l.passos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}<code>${esc(l.comando)}</code><span class="muted small">Liberado em ${quando(l.quando)}</span><button class="btn sm" data-act="perm-esquecer" title="Apaga esta permissão; da próxima vez o Claude pergunta de novo" data-i="${i}"><i class="pi pi-times"></i> Remover permissão</button></li>`).join('')}</ul>` : '<div class="muted small">Nada ainda. Eles vão aparecendo aqui conforme você aprova.</div>'}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-ban"></i></span><h3>Nunca permitido</h3><span class="lv lv-bad">Bloqueado</span></div><div class="card-body">
    <p class="muted small">O Claude não consegue rodar isso, nem pedindo. Vale para todos os projetos e não dá para desligar.</p><details class="perm-fab"><summary>Ver tudo o que está bloqueado (${P.fabrica.negar.length})</summary>${lista(P.fabrica.negar, '')}</details>
    ${regra('bloqueios', 'Bloqueios só deste projeto', 'Bloqueia qualquer comando que contenha o texto escrito.', P.bloqueios, 'Ex.: terraform destroy')}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-exclamation-triangle"></i></span><h3>Sempre pede atenção redobrada (produção)</h3></div><div class="card-body">
    <p class="muted small">Aparece em vermelho e exige uma confirmação extra a cada vez. Nunca pode ser liberado de vez.</p><details class="perm-fab"><summary>Ver tudo o que pede atenção redobrada (${P.fabrica.producao.length})</summary>${lista(P.fabrica.producao, '')}</details>
    ${regra('producao', 'Mais itens só deste projeto', 'Trata como produção qualquer comando que contenha o texto escrito.', P.producao, 'Ex.: kubectl')}</div></div>

  <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-play"></i></span><h3>Testar um comando <span class="muted small">(só simula, não executa nada)</span></h3></div><div class="card-body">
    <div class="perm-testrow"><input id="perm-cmd" class="inp" placeholder="Cole aqui um comando para ver o que aconteceria" value="${esc(t?.cmd || '')}" autocomplete="off"><button class="btn" data-act="perm-test" title="Mostra o que o Tilo faria com este comando (liberar, perguntar ou bloquear), sem executá-lo"><i class="pi pi-search"></i> Testar comando</button></div>${res}</div></div>`;
}
// ---------- alterações (git visual) ----------
// S.alt: dados (resposta de /api/alteracoes), sel (arquivos marcados para o commit), vistos (arquivos já apresentados; os novos entram marcados),
// fora (conversas desmarcadas), extra (conversas vinculadas à mão), msg (mensagem do commit), abertos/diffs (diffs expandidos), busy.
// S.alt.hist: histórico de commits (commits, mais, chave = head+não enviados para saber quando recarregar, abertos = commits expandidos, arqs/diffs por commit).
S.alt = { hist: { commits: [], pagina: 1, total: 0, carregando: false, chave: '', abertos: new Set(), arqs: {}, diffs: {}, erro: '' }, dados: null, sel: new Set(), vistos: new Set(), fora: new Set(), extra: new Set(), msg: '', abertos: new Set(), diffs: {}, busy: false, sig: '', erro: '' };
const altTotal = () => (S.alt.dados?.repo ? S.alt.dados.arquivos.length + S.alt.dados.naoEnviados.length : 0);
async function loadAlteracoes(forcar) {
  try {
    const g = await api('/api/alteracoes'), A = S.alt;
    const sig = JSON.stringify(g);
    if (!forcar && sig === A.sig) return;
    A.sig = sig; A.dados = g; A.erro = '';
    if (g.repo) {
      const atuais = new Set(g.arquivos.map((a) => a.caminho));
      for (const a of g.arquivos) if (!A.vistos.has(a.caminho)) { A.vistos.add(a.caminho); if (!a.sensivel) A.sel.add(a.caminho); }
      for (const c of [...A.sel]) if (!atuais.has(c)) A.sel.delete(c);
      for (const c of Object.keys(A.diffs)) if (!atuais.has(c)) { delete A.diffs[c]; A.abertos.delete(c); }
    }
    if (g.repo) { const chave = g.head + ':' + g.branch + ':' + g.naoEnviados.length; if (A.hist.chave !== chave) { A.hist.chave = chave; loadHistorico(true); } }
  } catch (x) { S.alt.dados = null; S.alt.erro = x.message; }
  renderNav();
  if (route() === 'alteracoes' && !document.activeElement?.closest?.('#alt-root textarea')) renderAlteracoes();
  else if (route() === 'visao') render();
  else if (route() === 'chat') renderChatGit();
  if (route() !== 'alteracoes') renderCommitModal();
}
const altConversasDoCommit = () => { // conversas que entram no commit: as que editaram os arquivos marcados + as vinculadas à mão, menos as desmarcadas
  const A = S.alt, m = new Map();
  for (const a of A.dados?.arquivos || []) if (A.sel.has(a.caminho)) for (const c of a.conversas) m.set(c.id, c.titulo);
  for (const id of A.extra) { const c = S.chats.find((x) => x.id === id); if (c) m.set(id, c.title); }
  return [...m].map(([id, titulo]) => ({ id, titulo, marcada: !A.fora.has(id) }));
};
const altChip = (c) => c.titulo == null ? `<span class="alt-chip off" title="Esta conversa foi apagada"><i class="pi pi-comment"></i> conversa apagada</span>`
  : `<button class="alt-chip" data-act="open-sess" data-kind="chat" data-id="${c.id}" title="Abrir a conversa “${esc(c.titulo)}”"><i class="pi pi-comment"></i> ${esc(short(c.titulo, 34))}</button>`;
function altDiffHtml(texto) {
  return texto.split('\n').map((l) => `<span class="${l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}">${esc(l) || ' '}</span>`).join('');
}
function renderAlteracoes() {
  renderCommitModal(); // o modal de commit (aberto em qualquer tela) acompanha o mesmo estado
  const root = $('#alt-root'); if (!root) return;
  const A = S.alt, g = A.dados;
  const cab = (sub) => `<div class="page-head"><div><h1 class="page-title">Alterações</h1><p class="page-sub">${sub}</p></div></div>`;
  if (!g) { root.innerHTML = cab('Veja o que mudou no projeto e de qual conversa veio cada mudança.') + `<div class="note">${A.erro ? `Não consegui carregar: ${esc(A.erro)}` : 'Carregando…'}</div>`; return; }
  if (!g.repo) { root.innerHTML = cab('Veja o que mudou no projeto e de qual conversa veio cada mudança.') + empty('pi-sitemap', 'A pasta deste projeto não é um repositório git, então não há alterações para mostrar.'); return; }
  const ult = g.naoEnviados.length;
  const remoto = g.semRemoto ? badge('sem GitHub configurado', 'warning', 'pi-exclamation-triangle') : g.upstream ? badge('acompanha ' + g.upstream, 'neutral', 'pi-github') : badge('branch ainda não enviada', 'warning', 'pi-exclamation-triangle');
  const arqs = g.arquivos.map((a) => {
    const tom = a.rotulo === 'novo' ? 'success' : a.rotulo === 'apagado' ? 'danger' : a.rotulo === 'conflito' ? 'danger' : 'info';
    const aberto = A.abertos.has(a.caminho), df = A.diffs[a.caminho];
    return `<li class="alt-file"><div class="alt-row">
      <input type="checkbox" class="sw" data-chg="alt-sel" data-p="${esc(a.caminho)}" ${A.sel.has(a.caminho) ? 'checked' : ''} ${a.sensivel ? 'disabled' : ''} title="${a.sensivel ? 'Parece conter segredos: o Tilo não commita este arquivo' : 'Incluir este arquivo no commit'}" aria-label="Incluir ${esc(a.caminho)} no commit">
      ${badge(a.rotulo, tom)}<code class="alt-path">${esc(a.caminho)}</code>${a.antigo ? `<span class="muted small">(era ${esc(a.antigo)})</span>` : ''}
      <span class="alt-conv">${a.conversas.length ? a.conversas.map(altChip).join('') : '<span class="muted small" title="Nenhuma conversa do Tilo editou este arquivo (ou a mudança veio de um comando ou de fora do Tilo)">sem conversa vinculada</span>'}</span>
      ${a.sensivel ? '' : `<button class="btn sm" data-act="alt-diff" data-p="${esc(a.caminho)}" title="${aberto ? 'Esconde' : 'Mostra'} o que mudou neste arquivo"><i class="pi ${aberto ? 'pi-chevron-up' : 'pi-eye'}"></i> ${aberto ? 'Esconder' : 'Ver mudanças'}</button>`}</div>
      ${aberto ? `<pre class="alt-diff">${df ? (df.erro ? esc(df.erro) : altDiffHtml(df.diff) + (df.cortado ? '\n<span class="hunk">… diff cortado (arquivo grande)</span>' : '')) : 'Carregando…'}</pre>` : ''}</li>`;
  }).join('');
  const conv = altConversasDoCommit(), nSel = A.sel.size;
  const outras = S.chats.filter((c) => !c.gen && !conv.some((x) => x.id === c.id));
  const form = g.arquivos.length ? `<div class="alt-form">
      <label class="muted small" for="alt-msg">Mensagem do commit</label>
      <textarea id="alt-msg" class="inp alt-msg" rows="3" maxlength="4000" placeholder="Descreva o que mudou" data-alt="msg">${esc(A.msg)}</textarea>
      <div class="alt-vinc"><span class="muted small">Conversas ligadas a este commit:</span>
        ${conv.length ? conv.map((c) => `<label class="alt-chk"><input type="checkbox" data-chg="alt-conv" data-id="${c.id}" ${c.marcada ? 'checked' : ''}> ${esc(short(c.titulo, 34))}</label>`).join('') : '<span class="muted small">nenhuma</span>'}
        ${outras.length ? `<select class="sel sm" data-chg="alt-addchat" aria-label="Ligar outra conversa"><option value="">Ligar outra conversa…</option>${outras.map((c) => `<option value="${c.id}">${esc(short(c.title, 40))}</option>`).join('')}</select>` : ''}</div>
      <p class="muted small">As conversas marcadas ficam gravadas na mensagem do commit (linha “Tilo-Chat”), para você saber depois de onde veio a mudança.</p>
      <div class="alt-actions"><button class="btn primary" data-act="alt-commit" ${A.busy || !nSel ? 'disabled' : ''} title="Cria um commit só com os arquivos marcados"><i class="pi pi-check"></i> Commitar ${nSel} arquivo${nSel === 1 ? '' : 's'}</button></div></div>` : '';
  const commits = g.naoEnviados.map((c) => `<li class="alt-commit"><div class="alt-row"><code>${esc(c.curto)}</code><b>${esc(c.assunto)}</b><span class="muted small">${esc(c.autor)} · há ${ago(c.quando)}</span>
      <span class="alt-conv">${c.conversas.length ? c.conversas.map(altChip).join('') : '<span class="muted small" title="Este commit não tem a linha Tilo-Chat (foi feito fora do Tilo ou antes deste recurso)">sem conversa vinculada</span>'}</span></div></li>`).join('');
  const aviso = g.semRemoto ? 'Este repositório não tem um remoto (GitHub) configurado.' : g.atras ? `O GitHub tem ${g.atras} commit${g.atras === 1 ? '' : 's'} que você ainda não baixou.` : g.semUpstream ? 'Esta branch ainda não existe no GitHub; o envio vai criá-la.' : '';
  root.innerHTML = `${cab('O que mudou no projeto e ainda não está no GitHub — e de qual conversa veio cada mudança.')}
    <div class="alt-top"><div class="chat-git">${gitBarHtml(g)}</div>${remoto}${g.relativa ? `<span class="muted small">pasta do projeto: ${esc(g.relativa)}</span>` : ''}
      <button class="btn sm" data-act="alt-recarregar" title="Lê o estado do git de novo"><i class="pi pi-refresh"></i> Atualizar</button></div>
    <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-pencil"></i></span><h3>Ainda não commitado</h3><span class="muted small">${g.arquivos.length}</span></div><div class="card-body">
      ${g.arquivos.length ? `<p class="muted small">Marque os arquivos que entram no próximo commit. “Sem conversa vinculada” quer dizer que nenhuma conversa do Tilo editou o arquivo diretamente (mudanças feitas por comando ou fora do Tilo não são atribuídas).</p><ul class="alt-list">${arqs}</ul>${form}` : '<div class="muted small">Nada para commitar: tudo o que foi alterado já está num commit.</div>'}</div></div>
    <div class="card"><div class="card-head"><span class="ico"><i class="pi pi-upload"></i></span><h3>Commitado, mas não enviado ao GitHub</h3><span class="muted small">${ult}</span></div><div class="card-body">
      ${aviso ? `<p class="muted small">${esc(aviso)}</p>` : ''}
      ${ult ? `<ul class="alt-list">${commits}</ul>` : '<div class="muted small">Nenhum commit esperando envio.</div>'}
      ${ult && !g.semRemoto ? `<div class="alt-actions"><button class="btn primary" data-act="alt-push" ${A.busy ? 'disabled' : ''} title="Envia os commits para o GitHub (git push, nunca forçado)"><i class="pi pi-upload"></i> Enviar ${ult} commit${ult === 1 ? '' : 's'} ao GitHub</button></div>` : ''}</div></div>
    ${altHistoricoHtml()}`;
}
const HIST_POR_PAGINA = 10;
async function loadHistorico(reiniciar, pagina) {
  const H = S.alt.hist;
  if (H.carregando) return;
  H.carregando = true; H.erro = '';
  if (reiniciar) H.pagina = 1; else if (pagina) H.pagina = pagina;
  try {
    let r = await api(`/api/alteracoes/historico?limite=${HIST_POR_PAGINA}&pular=${(H.pagina - 1) * HIST_POR_PAGINA}`);
    const ultima = Math.max(1, Math.ceil((r.total || 0) / HIST_POR_PAGINA));
    if (H.pagina > ultima) { H.pagina = ultima; r = await api(`/api/alteracoes/historico?limite=${HIST_POR_PAGINA}&pular=${(H.pagina - 1) * HIST_POR_PAGINA}`); }
    H.commits = r.commits || []; H.total = r.total || 0;
    if (H.pagina === 1) H.recentes = H.commits; // a Visão geral mostra os mais novos
    H.abertos.clear(); H.arqs = {}; H.diffs = {};
  } catch (x) { H.erro = x.message; }
  H.carregando = false;
  if (route() === 'alteracoes') renderAlteracoes(); else if (route() === 'visao') render();
}
function altPaginador() { // mesmo visual do paginador das outras telas, mas a página vem do servidor
  const H = S.alt.hist, paginas = Math.max(1, Math.ceil(H.total / HIST_POR_PAGINA)), p = H.pagina;
  if (H.total <= HIST_POR_PAGINA) return '';
  const nums = [];
  for (let n = 1; n <= paginas; n++) if (n === 1 || n === paginas || Math.abs(n - p) <= 1) nums.push(n);
  let btns = '', ult = 0;
  for (const n of nums) { if (n - ult > 1) btns += '<span class="dots">…</span>'; btns += `<button class="pg ${n === p ? 'on' : ''}" data-act="alt-hist-pag" data-p="${n}" ${H.carregando ? 'disabled' : ''}>${n}</button>`; ult = n; }
  const de = (p - 1) * HIST_POR_PAGINA + 1;
  return `<div class="pager"><span>${de}–${Math.min(de + HIST_POR_PAGINA - 1, H.total)} de ${H.total}</span><div class="pages">
    <button class="pg" data-act="alt-hist-pag" data-p="${p - 1}" ${p === 1 || H.carregando ? 'disabled' : ''} aria-label="Anterior"><i class="pi pi-angle-left"></i></button>${btns}
    <button class="pg" data-act="alt-hist-pag" data-p="${p + 1}" ${p === paginas || H.carregando ? 'disabled' : ''} aria-label="Próxima"><i class="pi pi-angle-right"></i></button></div></div>`;
}
async function altCommitAbrir(sha) {
  const H = S.alt.hist;
  if (H.abertos.has(sha)) { H.abertos.delete(sha); renderAlteracoes(); return; }
  H.abertos.add(sha); renderAlteracoes();
  if (!H.arqs[sha]) { try { H.arqs[sha] = await api('/api/alteracoes/commit-arquivos?sha=' + sha); } catch (x) { H.arqs[sha] = { erro: x.message, arquivos: [] }; } renderAlteracoes(); }
}
async function altCommitDiff(sha, caminho) {
  const H = S.alt.hist, k = sha + '|' + caminho;
  if (H.diffs[k]) { delete H.diffs[k]; renderAlteracoes(); return; }
  H.diffs[k] = { carregando: true }; renderAlteracoes();
  try { H.diffs[k] = await api('/api/alteracoes/commit-diff?sha=' + sha + '&arquivo=' + encodeURIComponent(caminho)); } catch (x) { H.diffs[k] = { erro: x.message }; }
  renderAlteracoes();
}
function altHistoricoHtml() {
  const H = S.alt.hist;
  const lista = H.commits.map((c) => {
    const aberto = H.abertos.has(c.sha), ar = H.arqs[c.sha];
    const arqs = !aberto ? '' : !ar ? '<div class="muted small">Carregando…</div>' : ar.erro ? `<div class="muted small">${esc(ar.erro)}</div>` : `<ul class="alt-arqs">${ar.arquivos.map((a) => {
      const k = c.sha + '|' + a.caminho, d = H.diffs[k];
      return `<li><div class="alt-row">${badge(a.rotulo, a.rotulo === 'novo' ? 'success' : a.rotulo === 'apagado' ? 'danger' : 'info')}<code class="alt-path">${esc(a.caminho)}</code>${a.antigo ? `<span class="muted small">(era ${esc(a.antigo)})</span>` : ''}
        ${a.sensivel ? '' : `<button class="btn sm" data-act="alt-hist-diff" data-sha="${c.sha}" data-p="${esc(a.caminho)}" title="${d ? 'Esconde' : 'Mostra'} o que mudou neste arquivo neste commit"><i class="pi ${d ? 'pi-chevron-up' : 'pi-eye'}"></i> ${d ? 'Esconder' : 'Ver mudanças'}</button>`}</div>
        ${d ? `<pre class="alt-diff">${d.carregando ? 'Carregando…' : d.erro ? esc(d.erro) : altDiffHtml(d.diff) + (d.cortado ? '<span class="hunk">… diff cortado (arquivo grande)</span>' : '')}</pre>` : ''}</li>`;
    }).join('')}</ul>`;
    const env = c.enviado === null ? '' : c.enviado ? badge('no GitHub', 'success', 'pi-check') : badge('não enviado', 'warning', 'pi-upload');
    return `<li class="alt-commit"><div class="alt-row"><code>${esc(c.curto)}</code><b>${esc(c.assunto)}</b>${env}<span class="muted small">${esc(c.autor)} · ${new Date(c.quando).toLocaleDateString('pt-BR')} (há ${ago(c.quando)})</span>
      <span class="alt-conv">${c.conversas.length ? c.conversas.map(altChip).join('') : '<span class="muted small" title="Este commit não tem a linha Tilo-Chat (foi feito fora do Tilo ou antes deste recurso)">sem conversa vinculada</span>'}
      <button class="btn sm" data-act="alt-hist-abrir" data-sha="${c.sha}" title="${aberto ? 'Esconde' : 'Mostra'} os arquivos deste commit"><i class="pi ${aberto ? 'pi-chevron-up' : 'pi-folder-open'}"></i> ${aberto ? 'Esconder' : 'Arquivos'}</button></span></div>${arqs}</li>`;
  }).join('');
  return `<div class="card"><div class="card-head"><span class="ico"><i class="pi pi-history"></i></span><h3>Histórico</h3><span class="muted small">${H.total}</span></div><div class="card-body">
    <p class="muted small">Os commits da branch atual, do mais novo ao mais antigo (10 por página), com a conversa de cada um e se já está no GitHub.</p>
    ${H.erro ? `<div class="muted small">${esc(H.erro)}</div>` : ''}
    ${H.commits.length ? `<ul class="alt-list">${lista}</ul>` : H.carregando ? '<div class="muted small">Carregando…</div>' : '<div class="muted small">Nenhum commit ainda.</div>'}
    ${altPaginador()}</div></div>`;
}
async function altDiff(caminho) {
  const A = S.alt;
  if (A.abertos.has(caminho)) { A.abertos.delete(caminho); renderAlteracoes(); return; }
  A.abertos.add(caminho); renderAlteracoes();
  try { A.diffs[caminho] = await api('/api/alteracoes/diff?arquivo=' + encodeURIComponent(caminho)); } catch (x) { A.diffs[caminho] = { erro: x.message }; }
  renderAlteracoes();
}
async function altCommit(doModal) {
  const A = S.alt, msg = A.msg.trim(), arquivos = [...A.sel];
  if (!arquivos.length) return toast('Marque pelo menos um arquivo');
  if (!msg) return toast('Escreva a mensagem do commit');
  const chats = altConversasDoCommit().filter((c) => c.marcada).map((c) => c.id);
  if (!doModal && !(await confirmar({ titulo: `Commitar ${arquivos.length} arquivo${arquivos.length === 1 ? '' : 's'}?`, texto: 'Cria um commit local com os arquivos marcados. Nada vai para o GitHub ainda.', ok: 'Commitar', icone: 'pi-check' }))) return;
  A.busy = true; renderAlteracoes();
  let ok = false;
  try { const r = await api('/api/alteracoes/commit', { arquivos, mensagem: msg, chats }); A.msg = ''; A.fora.clear(); A.extra.clear(); ok = true; toast('Commit ' + r.sha + ' criado'); }
  catch (x) { toast(x.message); }
  A.busy = false; if (ok && doModal && A.modal) $('#cdlg').close();
  await loadAlteracoes(true);
}
async function altBranch(acao, nome, base = '') {
  const A = S.alt;
  A.busy = true; renderAlteracoes(); renderChatGit();
  try { const r = await api('/api/alteracoes/branch', { acao, nome, base }); toast(acao === 'criar' ? `Branch ${r.branch} criada` : r.mudou ? `Agora em ${r.branch}` : 'Já está nesta branch'); }
  catch (x) { toast(x.message); }
  A.busy = false; await loadAlteracoes(true);
}
async function altPush() {
  const A = S.alt, n = A.dados?.naoEnviados.length || 0;
  if (!(await confirmar({ titulo: `Enviar ${n} commit${n === 1 ? '' : 's'} ao GitHub?`, texto: 'Isso publica os commits no repositório remoto (git push). É uma ação de produção e fica registrada na auditoria.', ok: 'Enviar', perigo: true, icone: 'pi-upload' }))) return;
  A.busy = true; renderAlteracoes(); renderChatGit();
  try { const r = await api('/api/alteracoes/push', {}); toast(`${r.enviados} commit${r.enviados === 1 ? '' : 's'} enviado${r.enviados === 1 ? '' : 's'}`); }
  catch (x) { toast(x.message); }
  A.busy = false; await loadAlteracoes(true);
}
document.addEventListener('input', (e) => { if (e.target.dataset?.alt === 'msg') S.alt.msg = e.target.value; });
setInterval(() => { if (!document.hidden && !S.alt.busy) loadAlteracoes(); }, 8000);

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-chg]'); if (!el) return;
  const d = el.dataset;
  try {
    switch (d.chg) {
      case 'alt-branch': if (el.value !== S.alt.dados?.branch) await altBranch('trocar', el.value); break;
      case 'alt-sel': el.checked ? S.alt.sel.add(d.p) : S.alt.sel.delete(d.p); renderAlteracoes(); break;
      case 'alt-conv': el.checked ? S.alt.fora.delete(d.id) : S.alt.fora.add(d.id); break;
      case 'alt-addchat': if (el.value) { S.alt.extra.add(el.value); S.alt.fora.delete(el.value); renderAlteracoes(); } break;
      case 'size': S.size[d.key] = Number(el.value); S.page[d.key] = 1; render(); break;
      case 'fprio': S.f.prio = el.value; S.page.pend = 1; render(); break;
      case 'fstat': S.f.stat = el.value; S.page.pend = 1; render(); break;
      case 'hid': S.f.hid = el.checked; S.page.sess = 1; render(); break;
      case 'hideenc': S.f.hideEnc = el.checked; updateChat(); break;
      case 'status': await api('/api/estado', { id: d.id, status: el.value, nota: st(d.id).nota || '' }); await loadPend(); render(); break;
      case 'link': await api('/api/sessoes/meta', { id: d.id, itemId: el.value }); await loadSess(); render(); break;
    }
  } catch (x) { toast(x.message); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'msg') { const c = curChat(); if (c) S.draft[c.id] = e.target.value; hint(); }
});
document.addEventListener('change', (e) => { if (e.target.id === 'edit') cfg({ edit: e.target.checked }); if (e.target.id === 'exec') cfg({ exec: e.target.checked }); if (e.target.id === 'aprov-ok') { const b = e.target.closest('.adlg')?.querySelector('[data-act="aprovar"]'); if (b) b.disabled = !e.target.checked; } });
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'msg' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  if (e.target.id === 'msg' && e.key === 'Tab' && e.shiftKey) { // Shift+Tab alterna o modo, como no terminal
    e.preventDefault(); const c = curChat(); if (!c || c.doc) return;
    const ks = Object.keys(MODOS); cfg({ modo: ks[(ks.indexOf(c.modo) + 1) % ks.length] }).then(() => toast('Modo: ' + MODOS[curChat()?.modo]?.[0]));
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#gsearch').focus(); }
  if (e.key === 'Escape') $('#gsearch').blur();
});
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); S.f.q = $('#gsearch').value.trim(); S.f.stat = S.f.q ? '' : 'ativos'; S.f.sec = 0; S.page.pend = 1; if (route() !== 'pendencias') location.hash = '#/pendencias'; else render(); });
$('#gsearch').addEventListener('input', (e) => { if (!e.target.value && S.f.q) { S.f.q = ''; S.f.stat = 'ativos'; render(); } });
$('#toggle').addEventListener('click', () => { S.collapsed = !S.collapsed; ls.set('tilo.sidebar-collapsed', S.collapsed ? '1' : '0'); renderNav(); });
$('#dx').addEventListener('click', () => $('#dlg').close());
$('#reload').addEventListener('click', () => refresh(true));
$('#restart').addEventListener('click', async () => {
  const rodando = (S.chats || []).filter((c) => c.running).length;
  if (!(await confirmar({ titulo: 'Reiniciar o servidor?', texto: `O Tilo fica fora do ar por alguns segundos e a página recarrega sozinha. Aprovações pendentes são negadas.${rodando ? ` ${rodando === 1 ? 'Há 1 conversa' : `Há ${rodando} conversas`} do Claude respondendo agora; ${rodando === 1 ? 'ela será interrompida' : 'elas serão interrompidas'}.` : ''}`, ok: 'Reiniciar', perigo: true }))) return;
  try { await api('/api/reiniciar', {}); } catch (x) { toast(x.message); return; }
  toast('Reiniciando o servidor…');
  for (let i = 0; i < 40; i++) { // espera o servidor voltar (até ~20 s) e recarrega
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(location.pathname, { cache: 'no-store' })).ok) return location.reload(); } catch {}
  }
  toast('O servidor não voltou a tempo. Veja tilo.err.log ou abra pelo atalho.');
});
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
    const [p, s, c, f, cons] = await Promise.all([api('/api/pendencias'), api('/api/sessoes'), api('/api/chats'), api('/api/arquivos'), api('/api/consumo').catch(() => null)]);
    const next = {
      pend: JSON.stringify([p.sections.map((x) => x.items.map((i) => i.id + i.raw)), p.state]),
      sess: JSON.stringify(s.terminal.map((x) => [x.id, x.mtime, x.apelido, x.itemId, x.oculto, usoNovo(x.uso)])),
      chats: JSON.stringify(c.chats.map((x) => [x.id, x.updated, x.running, x.title, x.model, x.plan, x.modo, x.ocupado, (x.fila || []).length, x.pendentes, x.closed, x.messages.length, usoNovo(x.uso)])),
      cons: JSON.stringify(cons ? [cons.hoje, cons.semana] : null),
      files: JSON.stringify(f.files.map((x) => x.path + x.mtime)),
    };
    const changed = force || Object.keys(next).some((k) => sigs[k] !== next[k]);
    S.sections = p.sections; S.state = p.state; S.term = s.terminal; S.chats = c.chats; S.files = f.files; S.consumo = cons;
    if (S.sel?.kind === 'chat' && !S.chats.find((x) => x.id === S.sel.id)) S.sel = null;
    if (S.sel?.kind === 'term') { const t = S.term.find((x) => x.id === S.sel.id); if (t && S.tx[t.id] && S.tx[t.id].mtime !== t.mtime) { delete S.tx[t.id]; openTerm(t.id); } else if (t && S.tx[t.id]) S.tx[t.id].mtime = t.mtime; }
    if (lastDocs && v.sig !== lastDocs) toast('Docs/planning/pendências mudaram em disco — atualizado');
    lastDocs = v.sig;
    if (changed) { sigs = next; if (document.activeElement?.id !== 'msg' || route() === 'chat') render(); }
    $('#synctxt').textContent = 'sincronizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (force) toast('Atualizado');
  } catch (x) { $('#synctxt').textContent = 'sem conexão'; }
}
// Pedidos de aprovação de QUALQUER conversa/tela: consulta global (antes só a conversa aberta era consultada)
let apBusy = false;
async function pollAprovacoes() { if (apBusy) return; apBusy = true; try { renderApprovals((await api('/api/aprovacoes')).pendentes || []); } catch (e) { console.error('pollAprovacoes:', e); } apBusy = false; }
setInterval(pollAprovacoes, 1500);
setInterval(refresh, 4000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (route() !== 'chat' && !document.querySelector('dialog[open]')) render(); }, 60000); // mantém “há X min” fresco
loadAlteracoes(true); // alimenta o contador do menu e o resumo da Visão geral sem esperar o ciclo de 8 s
refresh(true).then(() => { if (route() === 'chat' && !S.sel && S.chats[0]) { S.sel = { kind: 'chat', id: S.chats[0].id }; render(); } });
