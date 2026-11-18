// Volet de navigation (bouton de la barre d'outils, Affichage > « Volet de navigation », Ctrl+Maj+P).
// Colonne à gauche du texte, à droite de la gestion des Projets : la liste des titres du document,
// tenue à jour pendant l'écriture. Un clic sur un titre y mène ; le titre de la partie affichée est
// marqué ; les flèches replient les sous-parties. La largeur se règle en tirant le bord droit.
(function () {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  let editor = $('editor');
  const workspace = $('workspace');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const topOf = (el) => (G ? G.topOf(el) : el.getBoundingClientRect().top);
  const pane = $('navpane');
  const listBox = $('nav-list');
  const button = $('navpane-toggle');

  const MIN = 180;
  const MAX = 460;
  let state = { visible: false, width: 250 };
  let onChange = () => {};
  let items = [];               // [{ el, level, row }]
  const folded = new WeakSet(); // titres dont les sous-parties sont repliées
  let chosen = null;            // titre choisi d'un clic : marqué tant que l'on ne fait pas défiler

  const levelOf = (h) => (h.classList.contains('ft-title') ? 0 : Number(h.tagName[1]));
  const headings = () => [...editor.querySelectorAll('h1, h2, h3, h4, h5')]
    .filter((h) => !h.closest('.ft-toc, .ft-footnotes, .ft-endnotes, .ft-biblio') && h.textContent.trim());

  // ----- Liste des titres -----

  function render() {
    if (!state.visible) return;
    const hs = headings();
    listBox.textContent = '';
    items = [];
    if (!hs.length) {
      const empty = document.createElement('p');
      empty.className = 'nav-empty';
      empty.textContent = 'Aucun titre. Les titres du document (Titre 1 à Titre 5) s’affichent ici.';
      listBox.appendChild(empty);
      return;
    }
    const base = Math.min(...hs.map(levelOf));
    hs.forEach((h, i) => {
      const level = levelOf(h);
      const next = hs[i + 1];
      const parent = !!next && levelOf(next) > level;
      const row = document.createElement('div');
      row.className = 'nav-item';
      row.dataset.level = String(level);
      row.style.paddingLeft = 6 + (level - base) * 14 + 'px';
      row.title = h.textContent.trim();
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'nav-fold';
      arrow.tabIndex = -1;
      if (parent) {
        arrow.title = 'Replier ou déplier cette partie';
        arrow.innerHTML = '<svg viewBox="0 0 16 16"><path d="M6 4.5 9.5 8 6 11.5"/></svg>';
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          if (folded.has(h)) folded.delete(h); else folded.add(h);
          applyFolds();
        });
      } else arrow.disabled = true;
      const label = document.createElement('span');
      label.className = 'nav-label';
      label.textContent = h.textContent.trim();
      row.append(arrow, label);
      row.addEventListener('click', () => jump(h));
      listBox.appendChild(row);
      items.push({ el: h, level, row, parent });
    });
    applyFolds();
    markCurrent();
  }

  // Les lignes sous un titre replié sont masquées, jusqu'au titre suivant de même niveau ou plus haut.
  function applyFolds() {
    let hideBelow = Infinity;
    items.forEach((it) => {
      if (it.level <= hideBelow) hideBelow = Infinity;
      it.row.hidden = hideBelow !== Infinity;
      it.row.classList.toggle('folded', it.parent && folded.has(it.el));
      if (!it.row.hidden && it.parent && folded.has(it.el)) hideBelow = it.level;
    });
  }

  // Le titre de la partie affichée : le dernier titre passé en haut de la zone de texte.
  function markCurrent() {
    if (!state.visible || !items.length) return;
    const top = workspace.getBoundingClientRect().top + 90;
    let cur = items.find((it) => it.el === chosen);
    if (!cur) {
      cur = items[0];
      for (const it of items) {
        if (topOf(it.el) <= top) cur = it; else break;
      }
    }
    // Partie repliée : on marque le titre visible qui la contient.
    let i = items.indexOf(cur);
    while (i > 0 && items[i].row.hidden) i -= 1;
    items.forEach((it, k) => it.row.classList.toggle('current', k === i));
  }

  function jump(h) {
    if (!editor.contains(h)) return;
    const tab = $('tab-document');
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    chosen = h;
    if (G) {
      G.reveal(h, 40);
      G.caret(h);
      G.flash(h);
      markCurrent();
      return;
    }
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += h.getBoundingClientRect().top - box.top - 40;
    const r = document.createRange();
    r.selectNodeContents(h);
    r.collapse(true);
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    h.classList.remove('ft-toc-flash');
    void h.offsetWidth;
    h.classList.add('ft-toc-flash');
    setTimeout(() => h.classList.remove('ft-toc-flash'), 1300);
    chosen = h;
    markCurrent();
  }

  // ----- Mise à jour : le texte change (frappe, ouverture d'un document, annulation…) -----

  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(render, 250); };
  const watch = new MutationObserver(later);
  watch.observe(editor, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  let frame = 0;
  const free = () => { chosen = null; };
  workspace.addEventListener('wheel', free, { passive: true });
  workspace.addEventListener('mousedown', free);
  workspace.addEventListener('keydown', free);
  workspace.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; markCurrent(); });
  }, { passive: true });

  // ----- Affichage et largeur -----

  function show(on) {
    state.visible = !!on;
    app.classList.toggle('navpane-open', state.visible);
    pane.setAttribute('aria-hidden', String(!state.visible));
    if (button) button.classList.toggle('on', state.visible);
    if (state.visible) render();
  }

  function setWidth(w) {
    state.width = Math.round(Math.min(MAX, Math.max(MIN, Number(w) || 250)));
    pane.style.setProperty('--nav-w', state.width + 'px');
  }

  const grip = pane.querySelector('.nav-resize');
  grip.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = state.width;
    pane.classList.add('resizing');
    const move = (ev) => setWidth(w0 + ev.clientX - x0);
    const up = () => {
      pane.classList.remove('resizing');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      onChange({ ...state });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  grip.addEventListener('dblclick', () => { setWidth(250); onChange({ ...state }); });

  function toggle() {
    show(!state.visible);
    onChange({ ...state });
  }

  pane.querySelector('.nav-close').addEventListener('click', toggle);
  if (button) button.addEventListener('click', toggle);

  function init(saved, change) {
    onChange = change || (() => {});
    setWidth(saved && saved.width);
    show(!!(saved && saved.visible));
  }

  window.FTNav = {
    init,
    toggle,
    show,
    refresh: render,
    isVisible: () => state.visible,
    // Moteur 2.0 : titres du nouveau moteur, relus après chaque modification du texte.
    useEngine(mount, api) {
      watch.disconnect();
      editor = mount;
      G = api;
      window.FTMoteur.onUpdate((tr) => { if (tr.docChanged) later(); });
      window.FTMoteur.onLoad(later);
    }
  };
})();
