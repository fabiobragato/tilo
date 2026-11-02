'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { projetos: [], sel: 0, v: Date.now(), editId: '' };

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
  rail.innerHTML = S.projetos.map((p, i) => `<button class="tile ${i === S.sel ? 'on' : ''}" role="option" data-i="${i}" aria-label="${esc(p.nome)}" style="--c:${esc(p.cor)}"><img src="${esc(p.logo)}?v=${S.v}" alt=""></button>`).join('')
    + `<button class="tile add ${S.sel === S.projetos.length ? 'on' : ''}" role="option" data-i="${S.projetos.length}" aria-label="Novo projeto"><i class="pi pi-plus"></i></button>`;
  const p = S.projetos[S.sel];
  $('#info').innerHTML = p ? `<h1>${esc(p.nome)}</h1><p>${esc(p.descricao || 'Abrir pendências, sessões e conversas')}</p><button class="b" id="edit-btn"><i class="pi pi-pencil"></i> Editar</button>` : '<h1>Novo projeto</h1><p>Adicione outro projeto ao Tilo</p>';
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
  else if (e.key.toLowerCase() === 'e' && S.projetos[S.sel]) { e.preventDefault(); editar(S.projetos[S.sel]); }
  else if (/^[1-9]$/.test(e.key) && S.projetos[Number(e.key) - 1]) abrir(Number(e.key) - 1);
});

// ---------- novo projeto ----------
const IMG = { icone: '', logo: '', rmIcone: false, rmLogo: false }; // data URLs escolhidas no formulário + remoções pedidas
const MAX_IMG = 1_500_000;
const K = (k) => k === 'icone' ? 'rmIcone' : 'rmLogo';
function limparImagens() {
  IMG.icone = IMG.logo = ''; IMG.rmIcone = IMG.rmLogo = false;
  for (const k of ['icone', 'logo']) { $(`#p-${k}`).innerHTML = '<i class="pi pi-image"></i>'; $(`#d-${k} .t`).textContent = 'Escolher imagem'; $(`#rm-${k}`).hidden = true; }
}
function mostrarImagem(k, src, nome) { $(`#p-${k}`).innerHTML = `<img alt="" src="${src}">`; $(`#d-${k} .t`).textContent = nome; $(`#rm-${k}`).hidden = false; IMG[K(k)] = false; }
function lerImagem(k) {
  const f = $(`#n-${k}`).files[0];
  if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { $('#n-err').textContent = 'Use uma imagem PNG, JPG ou WEBP.'; $('#n-err').hidden = false; $(`#n-${k}`).value = ''; return; }
  if (f.size > MAX_IMG) { $('#n-err').textContent = 'A imagem passa de 1,5 MB. Escolha uma menor.'; $('#n-err').hidden = false; $(`#n-${k}`).value = ''; return; }
  $('#n-err').hidden = true;
  const r = new FileReader();
  r.onload = () => { IMG[k] = String(r.result); mostrarImagem(k, IMG[k], f.name); };
  r.readAsDataURL(f);
}
$('#n-icone').addEventListener('change', () => lerImagem('icone'));
$('#n-logo').addEventListener('change', () => lerImagem('logo'));
for (const k of ['icone', 'logo']) $(`#rm-${k}`).addEventListener('click', () => { // remover = voltar ao cartão com iniciais
  IMG[k] = ''; $(`#n-${k}`).value = ''; $(`#p-${k}`).innerHTML = '<i class="pi pi-image"></i>'; $(`#d-${k} .t`).textContent = 'Escolher imagem'; $(`#rm-${k}`).hidden = true; IMG[K(k)] = !!S.editId;
});
function abrirForm(modoEdicao) {
  $('#novo').classList.toggle('edit', modoEdicao);
  $('#n-raiz').required = !modoEdicao;
  $('#novo-t').textContent = modoEdicao ? 'Editar projeto' : 'Novo projeto';
  $('.nic i').className = 'pi ' + (modoEdicao ? 'pi-pencil' : 'pi-plus');
  $('#novo-sub').textContent = modoEdicao ? 'Altera nome, descrição, cor e imagens. A pasta do projeto não muda.' : 'Projeto novo (pasta vazia) ou que já existe com código. Os dados dele ficam no Tilo, não dentro da pasta do projeto.';
  $('#n-ok-t').textContent = modoEdicao ? 'Salvar' : 'Adicionar';
  $('#n-err').hidden = true; $('#novo').showModal(); $('#n-nome').focus();
}
function novo() { S.editId = ''; $('#novo-form').reset(); limparImagens(); abrirForm(false); }
function editar(p) {
  S.editId = p.id; $('#novo-form').reset(); limparImagens();
  $('#n-nome').value = p.nome; $('#n-desc').value = p.descricao || ''; $('#n-cor').value = p.cor;
  if (p.temIcone) mostrarImagem('icone', `${p.logo}?v=${S.v}`, 'Imagem atual (escolha outra para trocar)');
  if (p.temLogo) mostrarImagem('logo', `${p.logoLargo}&v=${S.v}`, 'Imagem atual (escolha outra para trocar)');
  IMG.rmIcone = IMG.rmLogo = false;
  abrirForm(true);
}
$('#info').addEventListener('click', (e) => { if (e.target.closest('#edit-btn')) editar(S.projetos[S.sel]); });
$('#n-cancel').addEventListener('click', () => $('#novo').close());
$('#novo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = $('#n-ok'); ok.disabled = true; $('#n-err').hidden = true;
  try {
    const dados = { nome: $('#n-nome').value, descricao: $('#n-desc').value, cor: $('#n-cor').value, icone: IMG.icone, logo: IMG.logo };
    const r = S.editId
      ? await api('/api/projetos/editar', { id: S.editId, ...dados, removerIcone: IMG.rmIcone, removerLogo: IMG.rmLogo })
      : await api('/api/projetos', { ...dados, raiz: $('#n-raiz').value.trim(), estruturaBase: $('#n-base').checked });
    if (S.editId) r.id = S.editId, r.criado = [];
    S.v = Date.now();
    if (!S.editId && $('#n-doc').checked) { location.href = `/p/${r.id}#/documentacao`; return; } // projeto existente: segue para a tela de documentação
    $('#novo').close();
    await carregar();
    S.sel = Math.max(0, S.projetos.findIndex((p) => p.id === r.id)); render();
    toast(S.editId ? 'Projeto atualizado.' : r.criado.length ? `Projeto adicionado. Criado: ${r.criado.join(', ')}` : 'Projeto adicionado.');
  } catch (x) { $('#n-err').textContent = x.message; $('#n-err').hidden = false; }
  ok.disabled = false;
});

async function carregar() { S.projetos = (await api('/api/projetos')).projetos; if (S.sel > S.projetos.length) S.sel = 0; render(); }
if (location.hash === '#novo') carregar().then(novo).catch(() => {}); // atalhos: /#novo abre o cadastro, /#editar edita o projeto selecionado
else if (location.hash === '#editar') carregar().then(() => S.projetos[S.sel] && editar(S.projetos[S.sel])).catch(() => {});
else carregar().catch((x) => { $('#info').innerHTML = `<p class="empty">Não consegui carregar os projetos: ${esc(x.message)}</p>`; });
