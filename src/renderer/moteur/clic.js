// Clic hors des lignes du texte (comme Word et LibreOffice) : un clic dans une marge de la page, à côté
// de la page, sous le texte, dans l'intervalle entre deux pages ou dans un en-tête place le curseur à
// l'endroit du texte le plus proche, et le curseur clignote. Maj+clic étend la sélection jusque-là ;
// en glissant depuis la marge, la sélection suit la souris.
(function () {
  const M = window.FTMoteur;
  const PMS = window.PM.state;
  const view = () => M.view;
  const ws = document.getElementById('workspace');
  const page = document.getElementById('page');
  // Éléments qui gardent leur propre clic.
  const OWN = 'button, input, select, textarea, a, label, dialog, [contenteditable="true"]:not(.ProseMirror), .ft-toolbar, .ft-pop, '
    + '#doc-tags, #doc-name, #block-handle, #cm-layer, #minibar, #empty-state, .pg-hf.editing, .ft-num-list';

  const usable = () => {
    const v = view();
    return v && v.editable && !page.hidden && !page.classList.contains('pg-hf-editing')
      && !document.getElementById('app').classList.contains('reading-mode');
  };

  // Position du texte la plus proche du point (x, y) : la ligne à cette hauteur, ou la plus proche
  // au-dessus ou au-dessous ; dans la ligne, le caractère le plus proche de x.
  function nearest(x, y) {
    const v = view();
    const mount = v.dom;
    const box = mount.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const cx = Math.min(Math.max(x, box.left + 2), box.right - 2);
    const onLine = (yy) => {
      const r = v.posAtCoords({ left: cx, top: yy });
      if (!r) return null;
      let c;
      try { c = v.coordsAtPos(r.pos); } catch { return null; }
      return c.top - 2 <= yy && yy <= c.bottom + 2 ? r.pos : null;
    };
    const top = box.top + 1;
    const bottom = box.bottom - 1;
    const y0 = Math.min(Math.max(y, top), bottom);
    for (let d = 0; d <= 1200; d += 4) {
      for (const yy of d ? [y0 - d, y0 + d] : [y0]) {
        if (yy < top || yy > bottom) continue;
        const pos = onLine(yy);
        if (pos !== null) return pos;
      }
    }
    const r = v.posAtCoords({ left: cx, top: y0 });
    return r ? r.pos : null;
  }

  function selection(anchor, head) {
    const doc = view().state.doc;
    if (anchor === head) return PMS.Selection.near(doc.resolve(head));
    return PMS.TextSelection.between(doc.resolve(anchor), doc.resolve(head));
  }

  function place(anchor, head) {
    const v = view();
    const sel = selection(anchor, head);
    if (!v.hasFocus()) v.focus();
    v.dispatch(v.state.tr.setSelection(sel).setMeta('pointer', true));
  }

  // ----- Clic hors de la zone du texte -----

  let drag = null;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !usable()) return;
    const t = e.target;
    if (!t || !t.closest || !(t === ws || t.closest('#page'))) return;
    const v = view();
    if (v.dom.contains(t) || t.closest(OWN)) return;
    // (Barre de défilement de l'espace de travail.)
    if (t === ws && (e.offsetX > ws.clientWidth || e.offsetY > ws.clientHeight)) return;
    const pos = nearest(e.clientX, e.clientY);
    if (pos === null) return;
    e.preventDefault();
    const anchor = e.shiftKey ? v.state.selection.anchor : pos;
    place(anchor, pos);
    if (e.detail >= 3) {
      // Triple clic dans la marge : le paragraphe entier.
      const $p = v.state.doc.resolve(v.state.selection.head);
      if ($p.parent.isTextblock) place($p.start(), $p.end());
      return;
    }
    drag = { anchor };
  });
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (!(e.buttons & 1)) { drag = null; return; }
    const pos = nearest(e.clientX, e.clientY);
    if (pos !== null) place(drag.anchor, pos);
  });
  document.addEventListener('mouseup', () => { drag = null; });

  // ----- Clic dans la zone du texte, entre deux pages ou dans une marge de page (mode avancé) -----
  // Le navigateur y pose le curseur sur la page suivante ; il va sur la ligne la plus proche.

  let down = null;
  document.addEventListener('mousedown', (e) => {
    down = null;
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.detail > 1 || !usable()) return;
    const v = view();
    const t = e.target;
    if (t === v.dom || (t.closest && t.closest('.ft-pg-gap') && v.dom.contains(t))) down = { x: e.clientX, y: e.clientY, doc: v.state.doc };
  }, true);
  document.addEventListener('mouseup', (e) => {
    const d = down;
    down = null;
    // (Pas au double clic : il ajoute des lignes jusqu'à l'endroit cliqué.)
    if (!d || e.button !== 0 || e.detail > 1 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    setTimeout(() => {
      const v = view();
      if (!usable() || v.state.doc !== d.doc || !v.state.selection.empty) return;
      let c;
      try { c = v.coordsAtPos(v.state.selection.head); } catch { return; }
      if (c.top - 2 <= d.y && d.y <= c.bottom + 2) return;
      const pos = nearest(d.x, d.y);
      if (pos === null || pos === v.state.selection.head) return;
      const n = v.coordsAtPos(pos);
      const gap = (r) => (d.y < r.top ? r.top - d.y : d.y > r.bottom ? d.y - r.bottom : 0);
      if (gap(n) < gap(c)) place(pos, pos);
    }, 0);
  });
})();
