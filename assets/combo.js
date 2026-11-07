'use strict';
// Combobox padrão do Tilo. TODO seletor do projeto usa este menu (botão + lista com título e, se houver, explicação por opção).
//  - Em formulários e filtros: escreva um `<select class="sel">` comum. Este arquivo o esconde e desenha o menu no lugar, mantendo o
//    <select> no DOM (então `.value`, `data-chg` e o evento `change` continuam funcionando). Explicação da opção: `<option data-d="...">`
//    ou "Título — explicação" no texto. Nunca deixe um <select> nativo visível.
//  - Em telas com lógica própria (modo e modelo do chat): `Combo.montar(div.dd, { tipo, itens, atual, titulo })`; a escolha chega pelo
//    evento `combo:escolher` (detail: { tipo, v }).
// Regras de uso e aparência: docs/frontend/design-system.md.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const menuDe = (dd) => dd.querySelector('.dd-menu');
  const btnDe = (dd) => dd.querySelector('.dd-btn');

  function fechar(exceto) {
    document.querySelectorAll('.dd-menu:not([hidden])').forEach((m) => {
      if (m === exceto) return;
      m.hidden = true; m.closest('.dd')?.querySelector('.dd-btn')?.setAttribute('aria-expanded', 'false');
    });
  }
  function posicionar(dd) { // a lista é `fixed`: não é cortada por cartões nem por janelas; abre para o lado que tem mais espaço
    const btn = btnDe(dd), m = menuDe(dd);
    m.style.visibility = 'hidden'; m.hidden = false; m.style.maxHeight = '';
    const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth, abaixo = innerHeight - r.bottom - 12, acima = r.top - 12;
    const cima = dd.dataset.abrir === 'cima' ? acima >= Math.min(h, 220) || acima > abaixo : abaixo < Math.min(h, 220) && acima > abaixo;
    const espaco = cima ? acima : abaixo;
    m.style.maxHeight = Math.max(160, Math.min(espaco, 380)) + 'px';
    const hh = Math.min(h, parseFloat(m.style.maxHeight));
    m.style.top = Math.max(8, cima ? r.top - hh - 8 : r.bottom + 8) + 'px';
    m.style.left = Math.min(Math.max(8, dd.classList.contains('dd-dir') ? r.right - w : r.left), Math.max(8, innerWidth - w - 8)) + 'px';
    m.style.minWidth = Math.max(r.width, 200) + 'px';
    m.style.visibility = '';
  }
  function alternar(dd) {
    const m = menuDe(dd), abrir = m.hidden;
    fechar(m);
    if (!abrir) { m.hidden = true; btnDe(dd).setAttribute('aria-expanded', 'false'); return; }
    posicionar(dd); btnDe(dd).setAttribute('aria-expanded', 'true');
    (m.querySelector('.dd-op.on') || m.querySelector('.dd-op'))?.focus({ preventScroll: true });
  }

  // desenha botão + lista dentro de `dd`. itens: [{ v, t, d?, i?, off? }]
  function montar(dd, { tipo = '', itens, atual, titulo = '', dica = '', abrir = '', dir = false, desabilitado = false }) {
    const aberta = menuDe(dd); if (aberta && !aberta.hidden) return; // com a lista aberta não redesenha (a escolha fecha e depois redesenha)
    const sig = JSON.stringify([tipo, itens, atual, titulo, desabilitado]);
    if (dd.dataset.sig === sig) return; dd.dataset.sig = sig;
    dd.dataset.tipo = tipo; if (abrir) dd.dataset.abrir = abrir; dd.classList.toggle('dd-dir', !!dir);
    const cur = itens.find((x) => x.v === atual) || itens[0] || { t: '', i: '' };
    dd.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" ${titulo ? `aria-label="${esc(titulo)}"` : ''} ${dica ? `title="${esc(dica)}"` : ''} ${desabilitado ? 'disabled' : ''}>${cur.i ? `<i class="pi ${cur.i} dd-ico"></i>` : ''}<span class="dd-val">${esc(cur.t)}</span><i class="pi pi-angle-down dd-car"></i></button>
      <div class="dd-menu" role="listbox" hidden>${titulo ? `<div class="dd-hd">${esc(titulo)}</div>` : ''}${itens.map((x) => `<button type="button" role="option" class="dd-op ${x.v === atual ? 'on' : ''}" aria-selected="${x.v === atual}" data-v="${esc(x.v)}" ${x.off ? 'disabled' : ''}>${x.i ? `<i class="pi ${x.i} dd-ico"></i>` : ''}<span><b>${esc(x.t)}</b>${x.d ? `<em>${esc(x.d)}</em>` : ''}</span>${x.v === atual ? '<i class="pi pi-check dd-ck"></i>' : ''}</button>`).join('')}</div>`;
  }

  // <select class="sel"> -> menu padrão (o select fica escondido e continua sendo a fonte do valor)
  function itensDoSelect(sel) {
    return [...sel.options].map((o) => { const [t, ...resto] = o.textContent.split(' — '); return { v: o.value, t: t.trim(), d: o.dataset.d || resto.join(' — ').trim(), off: o.disabled }; });
  }
  function desenharSelect(sel) {
    const dd = sel._dd; if (!dd) return;
    montar(dd, { tipo: 'sel', itens: itensDoSelect(sel), atual: sel.value, titulo: sel.getAttribute('aria-label') || sel.title || '', desabilitado: sel.disabled });
  }
  function melhorar() {
    document.querySelectorAll('select.sel').forEach((sel) => {
      if (!sel._dd) {
        const dd = document.createElement('div');
        dd.className = 'dd dd-campo' + (sel.classList.contains('sm') ? ' sm' : '');
        dd._sel = sel; sel._dd = dd; sel.classList.add('dd-nativo'); sel.after(dd);
      }
      desenharSelect(sel);
    });
  }
  let agendado = false;
  new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; melhorar(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', melhorar);

  function escolher(op) {
    const dd = op.closest('.dd'), v = op.dataset.v;
    fechar();
    if (dd._sel) { // select de formulário: grava o valor e avisa como um select nativo avisaria
      if (dd._sel.value !== v) { dd._sel.value = v; dd._sel.dispatchEvent(new Event('change', { bubbles: true })); }
      dd.dataset.sig = ''; desenharSelect(dd._sel);
    } else dd.dispatchEvent(new CustomEvent('combo:escolher', { bubbles: true, detail: { tipo: dd.dataset.tipo, v } }));
    btnDe(dd)?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const op = e.target.closest?.('.dd-op'), btn = e.target.closest?.('.dd-btn');
    if (op) { e.preventDefault(); if (!op.disabled) escolher(op); return; }
    if (btn) { e.preventDefault(); alternar(btn.closest('.dd')); return; }
    fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const aberto = document.querySelector('.dd-menu:not([hidden])'); if (aberto) { e.stopPropagation(); const b = aberto.closest('.dd').querySelector('.dd-btn'); fechar(); b.focus(); } return; }
    const dd = e.target.closest?.('.dd'); if (!dd || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const m = menuDe(dd), ops = [...m.querySelectorAll('.dd-op:not([disabled])')];
    if (m.hidden) { alternar(dd); return; }
    const i = ops.indexOf(document.activeElement);
    ops[e.key === 'Home' ? 0 : e.key === 'End' ? ops.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length]?.focus();
  }, true);
  window.addEventListener('resize', () => fechar());
  document.addEventListener('scroll', (e) => { if (!e.target.closest?.('.dd-menu')) fechar(); }, true);

  window.Combo = { montar, fechar, melhorar };
})();
