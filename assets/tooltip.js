'use strict';
// Dica (tooltip) padrão do Tilo. Troca a dica nativa do navegador (atributo `title`) por uma caixa escura com seta, no estilo do PrimeVue.
//  - Nada muda no HTML: continue escrevendo `title="..."`. Na primeira vez que o mouse (ou o foco do teclado) chega ao elemento, o texto passa
//    para `data-tip` (para a dica nativa não aparecer junto) e, se o elemento não tem texto nem `aria-label`, vira o `aria-label` (botão só com ícone).
//  - Aparece após um pequeno atraso, abaixo do elemento (acima se não couber), e some ao sair, clicar, rolar a página ou apertar Esc.
//  - Dentro de uma janela modal (<dialog>), a caixa é criada dentro dela para não ficar escondida atrás.
// Regras de uso e aparência: docs/frontend/design-system.md. Estilos em assets/tooltip.css.
(() => {
  if (window.Tip) return;
  const ATRASO = 350, GAP = 9, BORDA = 8;
  let tip = null, timer = 0, alvo = null;

  function criar() {
    tip = document.createElement('div');
    tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    tip.innerHTML = '<span class="tip-t"></span><i class="tip-seta"></i>';
    return tip;
  }
  // devolve o elemento com dica mais próximo, já convertendo title -> data-tip
  function achar(el) {
    const e = el?.closest?.('[title],[data-tip]');
    if (!e) return null;
    const t = e.getAttribute('title');
    if (t !== null) {
      e.removeAttribute('title');
      if (t.trim()) e.dataset.tip = t.trim();
      if (t.trim() && !e.getAttribute('aria-label') && !e.textContent.trim()) e.setAttribute('aria-label', t.trim());
    }
    return e.dataset.tip ? e : null;
  }
  function mostrar(e) {
    if (!e.isConnected) return;
    if (!tip) criar();
    const casa = e.closest('dialog[open]') || document.body;
    if (tip.parentNode !== casa) casa.appendChild(tip);
    tip.firstChild.textContent = e.dataset.tip;
    tip.hidden = false; tip.classList.remove('on'); tip.style.left = '0px'; tip.style.top = '0px';
    const r = e.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let abaixo = r.bottom + GAP + h <= vh - BORDA || r.top - GAP - h < BORDA;
    const x = Math.min(Math.max(BORDA, r.left + r.width / 2 - w / 2), vw - w - BORDA);
    const y = abaixo ? r.bottom + GAP : r.top - GAP - h;
    tip.style.left = Math.round(x) + 'px'; tip.style.top = Math.round(y) + 'px';
    tip.style.setProperty('--seta-x', Math.round(Math.min(Math.max(14, r.left + r.width / 2 - x), w - 14)) + 'px');
    tip.dataset.lado = abaixo ? 'abaixo' : 'acima';
    requestAnimationFrame(() => tip && tip.classList.add('on'));
    alvo = e;
  }
  function esconder() {
    clearTimeout(timer); timer = 0; alvo = null;
    if (tip) { tip.classList.remove('on'); tip.hidden = true; }
  }
  function agendar(e, ja) {
    clearTimeout(timer);
    if (ja) mostrar(e); else timer = setTimeout(() => mostrar(e), ATRASO);
  }

  document.addEventListener('mouseover', (ev) => {
    const e = achar(ev.target);
    if (!e) { if (alvo && !alvo.contains(ev.target)) esconder(); return; }
    if (e === alvo) return;
    esconder(); agendar(e, false);
  });
  document.addEventListener('mouseout', (ev) => {
    if (alvo && !alvo.contains(ev.relatedTarget)) esconder();
    else if (!alvo && timer && !ev.relatedTarget) esconder();
  });
  document.addEventListener('focusin', (ev) => { const e = achar(ev.target); if (e && e.matches(':focus-visible')) { esconder(); agendar(e, true); } });
  document.addEventListener('focusout', esconder);
  document.addEventListener('mousedown', esconder, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') esconder(); }, true);
  window.addEventListener('scroll', esconder, true);
  window.addEventListener('blur', esconder);
  window.Tip = { esconder };
})();
