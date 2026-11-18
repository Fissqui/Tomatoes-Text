// Signets (bouton « Signets » de la barre d'insertion, Édition > « Signets… », Ctrl+Maj+G).
// Un signet marque une ligne du texte (paragraphe, titre, ligne de liste ou case de tableau) : attributs
// data-bm (identifiant) et data-bm-name (nom) sur cet élément, gardés dans le document. Un petit
// drapeau le montre dans la marge (dessiné à part, hors du texte), et le panneau « Signets » les liste
// dans l'ordre du texte pour y sauter d'un clic.
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  const page = $('page');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const panel = $('bm-panel');
  const listBox = $('bm-list');
  const layer = document.createElement('div');
  layer.id = 'bm-layer';
  page.appendChild(layer);

  const UNITS = 'p, h1, h2, h3, h4, h5, h6, li, td, th';
  const OUTSIDE = '.ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-footnotes, .ft-endnotes, .ft-biblio, .ft-caption';
  const FLAG = '<svg viewBox="0 0 16 16"><path d="M4 1.8h8v12.4l-4-3.2-4 3.2z"/></svg>';

  let showFlags = true;
  let onChange = () => {};
  let lastUnit = null;
  let timer = null;

  const showMenu = (...args) => window.FTSidebar.showMenu(...args);
  const changed = () => editor.dispatchEvent(new Event('input'));
  const checkpoint = () => { if (window.FTHistory) window.FTHistory.commit(); };
  const newId = () => 'bm' + Math.random().toString(36).slice(2, 9);
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  // La ligne du texte qui contient ce nœud, si elle peut recevoir un signet.
  function unitOf(node) {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const unit = el && el.closest(UNITS);
    if (!unit || unit === editor || !editor.contains(unit) || unit.closest(OUTSIDE)) return null;
    return unit;
  }

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const unit = unitOf(sel.anchorNode);
    if (unit) lastUnit = unit;
  });

  const marks = () => [...editor.querySelectorAll('[data-bm]')].filter((el) => !el.closest(OUTSIDE));
  const nameOf = (el) => el.dataset.bmName || 'Signet';
  // L'élément du signet au moment du clic (l'affichage du texte a pu être refait depuis).
  const current = (el) => {
    const id = el.dataset.bm;
    return (editor.contains(el) ? el : id && marks().find((x) => x.dataset.bm === id)) || el;
  };

  // Entrée au milieu d'une ligne marquée : le navigateur copie le signet sur la nouvelle ligne.
  // On n'en garde qu'un, sur la première ligne qui a du texte.
  function tidy() {
    const byId = new Map();
    for (const el of marks()) {
      if (!byId.has(el.dataset.bm)) byId.set(el.dataset.bm, []);
      byId.get(el.dataset.bm).push(el);
    }
    for (const list of byId.values()) {
      if (list.length < 2) continue;
      const keep = list.find((el) => textOf(el)) || list[0];
      for (const el of list) if (el !== keep) { delete el.dataset.bm; delete el.dataset.bmName; }
    }
  }

  // ----- Drapeaux dans la marge -----

  function paint() {
    layer.textContent = '';
    if (!showFlags || page.hidden) return;
    const pr = page.getBoundingClientRect();
    const er = editor.getBoundingClientRect();
    const z = page.currentCSSZoom || 1; // zoom de la page (zoom.js)
    for (const el of marks()) {
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const cs = getComputedStyle(el);
      const lh = cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.25 : parseFloat(cs.lineHeight);
      const flag = document.createElement('button');
      flag.type = 'button';
      flag.className = 'bm-flag';
      flag.innerHTML = FLAG;
      flag.title = 'Signet « ' + nameOf(el) + ' » (clic : renommer ou supprimer)';
      flag.style.left = ((er.left - pr.left) / z - 26) + 'px';
      flag.style.top = ((r.top - pr.top) / z + parseFloat(cs.paddingTop || 0) + Math.max(0, (lh - 16) / 2)) + 'px';
      flag.addEventListener('mousedown', (e) => e.preventDefault());
      flag.addEventListener('click', (e) => showMenu(e.clientX, e.clientY, flagMenu(current(el))));
      layer.appendChild(flag);
    }
  }

  function refresh() {
    clearTimeout(timer);
    timer = null;
    if (G) G.regen(tidy); else tidy();
    paint();
    if (!panel.hidden) render();
  }
  function refreshNow() {
    tidy();
    paint();
    if (!panel.hidden) render();
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };

  editor.addEventListener('input', later);
  document.addEventListener('ft-paginated', later);
  window.addEventListener('resize', () => { later(); if (!panel.hidden) placePanel(); });
  new ResizeObserver(later).observe(page);
  const watch = new MutationObserver(later);
  watch.observe(editor, { subtree: true, attributes: true, attributeFilter: ['data-bm', 'data-bm-name'] });

  // ----- Ajouter, renommer, supprimer -----

  // Nom proposé : le texte du titre, ou le début de la ligne.
  function suggestion(unit) {
    const text = textOf(unit);
    return clip(text, /^H[1-6]$/.test(unit.tagName) ? 60 : 40);
  }

  // Geste sur le texte : une étape d'annulation. Moteur : l'élément est retrouvé par sa position si
  // l'affichage a été refait pendant la fenêtre.
  function change(el, at, fn) {
    if (G) {
      if (!editor.contains(el)) el = G.domAt(at);
      if (!el || !editor.contains(el)) return;
      G.edit(() => fn(el));
      refresh();
      return;
    }
    if (!editor.contains(el)) return;
    checkpoint();
    fn(el);
    changed();
    refresh();
  }
  const where = (el) => (G ? G.posOf(el) : null);

  async function add(unit = null) {
    unit = unit || unitOf((window.getSelection() || {}).anchorNode) || (lastUnit && editor.contains(lastUnit) ? lastUnit : null);
    if (!unit) {
      window.FTApp.ask('Placez d’abord le curseur sur la ligne à marquer, puis ajoutez le signet.', '', { okLabel: 'OK', input: false });
      return;
    }
    if (unit.dataset.bm) return rename(unit);
    const at = where(unit);
    const name = await window.FTApp.ask('Nom du signet :', suggestion(unit), { okLabel: 'Ajouter' });
    if (name === null) return;
    change(unit, at, (el) => {
      el.dataset.bm = newId();
      el.dataset.bmName = name.trim() || suggestion(el) || 'Signet';
    });
  }

  async function rename(el) {
    const at = where(el);
    const name = await window.FTApp.ask('Nom du signet :', nameOf(el), { okLabel: 'Renommer' });
    if (name === null || !name.trim()) return;
    change(el, at, (x) => { x.dataset.bmName = name.trim(); });
  }

  function remove(el) {
    change(el, where(el), (x) => {
      delete x.dataset.bm;
      delete x.dataset.bmName;
    });
  }

  function flagMenu(el) {
    return [
      { text: 'Aller au signet', action: () => jump(el) },
      { text: 'Renommer le signet…', action: () => rename(el) },
      { text: 'Supprimer le signet', danger: true, action: () => remove(el) },
      '-',
      { text: 'Voir tous les signets', action: open }
    ];
  }

  // Clic droit dans le texte : les signets de la ligne cliquée.
  function menuItems(target) {
    const unit = unitOf(target);
    if (!unit) return [];
    if (!unit.dataset.bm) return [];
    return [
      { text: 'Renommer le signet…', action: () => rename(unit) },
      { text: 'Supprimer le signet', action: () => remove(unit) }
    ];
  }

  // ----- Aller à un signet -----

  function glow(el) {
    const pr = page.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const z = page.currentCSSZoom || 1;
    const g = document.createElement('div');
    g.className = 'bm-glow';
    g.style.left = ((r.left - pr.left) / z - 6) + 'px';
    g.style.top = ((r.top - pr.top) / z - 3) + 'px';
    g.style.width = (r.width / z + 12) + 'px';
    g.style.height = (r.height / z + 6) + 'px';
    page.appendChild(g);
    setTimeout(() => g.remove(), 1500);
  }

  function jump(el) {
    if (!editor.contains(el)) return;
    lastUnit = el;
    if (G) {
      G.show(el);
      el.scrollIntoView({ block: 'center' });
      G.caret(el);
      G.flash(el);
      return;
    }
    el.scrollIntoView({ block: 'center' });
    editor.focus({ preventScroll: true });
    if (window.FTStructure && window.FTStructure.placeCaret) window.FTStructure.placeCaret(el);
    lastUnit = el;
    // Le défilement peut être doux : on attend qu'il soit fini pour éclairer la ligne.
    setTimeout(() => glow(el), 60);
  }

  // ----- Panneau « Signets » -----

  function placePanel() {
    const box = $('workspace').getBoundingClientRect();
    panel.style.top = box.top + 8 + 'px';
    panel.style.right = Math.max(8, window.innerWidth - box.right + 22) + 'px';
    panel.style.maxHeight = Math.max(200, box.height - 16) + 'px';
  }

  function render() {
    const list = marks();
    $('bm-count').textContent = list.length ? String(list.length) : '';
    listBox.textContent = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'bm-empty';
      empty.textContent = 'Aucun signet dans ce document. Placez le curseur sur une ligne, puis « Ajouter un signet ici ».';
      listBox.appendChild(empty);
      return;
    }
    const paged = window.FTPages && window.FTPages.isPaged && window.FTPages.isPaged();
    for (const el of list) {
      const row = document.createElement('div');
      row.className = 'bm-item';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'bm-go';
      go.title = 'Aller à ce signet';
      const name = document.createElement('span');
      name.className = 'bm-name';
      name.innerHTML = FLAG;
      name.append(nameOf(el));
      const where = document.createElement('span');
      where.className = 'bm-where';
      const text = textOf(el);
      where.textContent = text && text !== nameOf(el) ? clip(text, 70) : (/^H[1-6]$/.test(el.tagName) ? 'Titre' : '');
      const pageNo = paged && window.FTPages.pageNumberOf ? window.FTPages.pageNumberOf(el) : null;
      if (pageNo) {
        const p = document.createElement('span');
        p.className = 'bm-page';
        p.textContent = 'p. ' + pageNo;
        name.append(p);
      }
      go.append(name);
      if (where.textContent) go.append(where);
      go.addEventListener('click', () => jump(current(el)));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'bm-act';
      edit.title = 'Renommer';
      edit.innerHTML = '<svg viewBox="0 0 16 16"><path d="M2.5 13.5l.8-3 7.4-7.4 2.2 2.2-7.4 7.4z"/></svg>';
      edit.addEventListener('click', () => rename(current(el)));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bm-act';
      del.title = 'Supprimer le signet (le texte reste)';
      del.textContent = '✕';
      del.addEventListener('click', () => remove(current(el)));
      row.append(go, edit, del);
      listBox.appendChild(row);
    }
  }

  function open() {
    if (page.hidden) return;
    $('track-panel').hidden = true;
    placePanel();
    render();
    panel.hidden = false;
  }

  function close() { panel.hidden = true; }

  $('bm-close').addEventListener('click', close);
  $('bm-add').addEventListener('mousedown', (e) => e.preventDefault());
  $('bm-add').addEventListener('click', () => add());
  $('bm-show').addEventListener('change', () => {
    showFlags = $('bm-show').checked;
    paint();
    onChange(showFlags);
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('bookmarks-btn').addEventListener('click', () => (panel.hidden ? open() : close()));

  window.FTBookmarks = {
    // Moteur 2.0 : signets du nouveau moteur. Les drapeaux ne sont dessinés que pour les lignes
    // affichées : refaits après un défilement.
    useEngine(mount, api) {
      editor.removeEventListener('input', later);
      watch.disconnect();
      editor = mount;
      G = api;
      api.add(refreshNow);
      $('workspace').addEventListener('scroll', later, { passive: true });
    },
    init(saved, fn) {
      showFlags = saved !== false;
      $('bm-show').checked = showFlags;
      onChange = fn;
    },
    // Après l'ouverture d'un document (ou le retour à une version).
    load() {
      lastUnit = null;
      refresh();
    },
    hide() { close(); layer.textContent = ''; },
    refresh,
    open,
    toggle: () => (panel.hidden ? open() : close()),
    add,
    menuItems,
    list: () => marks().map((el) => ({ id: el.dataset.bm, name: nameOf(el), el }))
  };
})();
