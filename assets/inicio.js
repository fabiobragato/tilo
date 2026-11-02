'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { projetos: [], sel: 0 };

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || r.statusText);
  return j;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 3200); }

function clock() { $('#clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
clock(); setInterval(clock, 15000);

const total = () => S.projetos.length + 1; // +1 = tile "novo projeto"
function render() {
  const rail = $('#rail');
  rail.innerHTML = S.projetos.map((p, i) => `<button class="tile ${i === S.sel ? 'on' : ''}" role="option" data-i="${i}" aria-label="${esc(p.nome)}" style="--c:${esc(p.cor)}"><img src="${esc(p.logo)}" alt=""></button>`).join('')
    + `<button class="tile add ${S.sel === S.projetos.length ? 'on' : ''}" role="option" data-i="${S.projetos.length}" aria-label="Novo projeto"><i class="pi pi-plus"></i></button>`;
  const p = S.projetos[S.sel];
  $('#info').innerHTML = p ? `<h1>${esc(p.nome)}</h1><p>${esc(p.descricao || 'Abrir pendências, sessões e conversas')}</p>` : '<h1>Novo projeto</h1><p>Adicione outro projeto à Central</p>';
  rail.querySelector('.tile.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}
function abrir(i) {
  if (i >= S.projetos.length) return novo();
  location.href = `/p/${S.projetos[i].id}`;
}
function mover(d) { S.sel = (S.sel + d + total()) % total(); render(); }

$('#rail').addEventListener('click', (e) => { const t = e.target.closest('.tile'); if (!t) return; S.sel = Number(t.dataset.i); abrir(S.sel); });
$('#rail').addEventListener('mouseover', (e) => { const t = e.target.closest('.tile'); if (!t || Number(t.dataset.i) === S.sel) return; S.sel = Number(t.dataset.i); render(); });
document.addEventListener('keydown', (e) => {
  if ($('#novo').open) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); abrir(S.sel); }
  else if (e.key.toLowerCase() === 'n') { e.preventDefault(); novo(); }
  else if (/^[1-9]$/.test(e.key) && S.projetos[Number(e.key) - 1]) abrir(Number(e.key) - 1);
});

// ---------- novo projeto ----------
const IMG = { icone: '', logo: '' }; // data URLs escolhidas no formulário
const MAX_IMG = 1_500_000;
function limparImagens() {
  IMG.icone = IMG.logo = '';
  for (const k of ['icone', 'logo']) { $(`#p-${k}`).innerHTML = '<i class="pi pi-image"></i>'; $(`#d-${k} .t`).textContent = 'Escolher imagem'; }
}
function lerImagem(k) {
  const f = $(`#n-${k}`).files[0];
  if (!f) { IMG[k] = ''; $(`#p-${k}`).innerHTML = '<i class="pi pi-image"></i>'; $(`#d-${k} .t`).textContent = 'Escolher imagem'; return; }
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { $('#n-err').textContent = 'Use uma imagem PNG, JPG ou WEBP.'; $('#n-err').hidden = false; $(`#n-${k}`).value = ''; return; }
  if (f.size > MAX_IMG) { $('#n-err').textContent = 'A imagem passa de 1,5 MB. Escolha uma menor.'; $('#n-err').hidden = false; $(`#n-${k}`).value = ''; return; }
  $('#n-err').hidden = true;
  const r = new FileReader();
  r.onload = () => { IMG[k] = String(r.result); $(`#p-${k}`).innerHTML = `<img alt="" src="${IMG[k]}">`; $(`#d-${k} .t`).textContent = f.name; };
  r.readAsDataURL(f);
}
$('#n-icone').addEventListener('change', () => lerImagem('icone'));
$('#n-logo').addEventListener('change', () => lerImagem('logo'));
function novo() { $('#novo-form').reset(); limparImagens(); $('#n-err').hidden = true; $('#novo').showModal(); $('#n-nome').focus(); }
$('#n-cancel').addEventListener('click', () => $('#novo').close());
$('#novo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = $('#n-ok'); ok.disabled = true; $('#n-err').hidden = true;
  try {
    const r = await api('/api/projetos', { nome: $('#n-nome').value, raiz: $('#n-raiz').value.trim(), cor: $('#n-cor').value, estruturaBase: $('#n-base').checked, icone: IMG.icone, logo: IMG.logo });
    $('#novo').close();
    await carregar();
    S.sel = Math.max(0, S.projetos.findIndex((p) => p.id === r.id)); render();
    toast(r.criado.length ? `Projeto adicionado. Criado: ${r.criado.join(', ')}` : 'Projeto adicionado.');
  } catch (x) { $('#n-err').textContent = x.message; $('#n-err').hidden = false; }
  ok.disabled = false;
});

async function carregar() { S.projetos = (await api('/api/projetos')).projetos; if (S.sel > S.projetos.length) S.sel = 0; render(); }
if (location.hash === '#novo') carregar().then(novo).catch(() => {}); // atalho: /#novo abre o cadastro
else carregar().catch((x) => { $('#info').innerHTML = `<p class="empty">Não consegui carregar os projetos: ${esc(x.message)}</p>`; });
