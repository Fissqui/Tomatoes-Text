// Tableaux du nouveau moteur : largeur des colonnes et hauteur des lignes à la souris (comme les
// versions 1.x). Le trait sous la souris reçoit une bande qui porte le curseur (une classe sur la zone
// d'écriture ferait recalculer l'apparence de tout le texte) ; le geste passe par le pont d'objets.js
// (une seule étape d'annulation). Double-clic sur un trait : colonnes égales, ou hauteur d'origine.
(function () {
  const M = window.FTMoteur;
  const { view } = M;
  const { TableMap } = PM.tables;
  const mount = view.dom;
  const O = () => window.FTObjets;
  const EDGE = 4; // distance au trait, en pixels, pour le saisir
  const MIN = 28; // largeur minimale d'une colonne

  // Case du moteur (élément td/th) : sa table, sa place dans la grille.
  function cellInfo(cell) {
    const table = cell.closest('table.ft-table');
    if (!table || !mount.contains(table)) return null;
    const tpos = O().posOf(table);
    const cpos = O().posOf(cell);
    if (tpos === null || cpos === null) return null;
    const node = view.state.doc.nodeAt(tpos);
    if (!node || node.type.name !== 'table') return null;
    const map = TableMap.get(node);
    let rect;
    try { rect = map.findCell(cpos - tpos - 1); } catch { return null; }
    return { table, tpos, node, map, rect };
  }

  // Trait de colonne ou de ligne sous la souris : { kind: 'col', index } (entre index et index + 1)
  // ou { kind: 'row', tr }.
  function edgeAt(e) {
    const cell = e.target.closest && e.target.closest('td, th');
    if (!cell || !mount.contains(cell) || cell.closest('.ft-pg-gap')) return null;
    const r = cell.getBoundingClientRect();
    const near = Math.abs(e.clientX - r.right) <= EDGE ? 'right' : Math.abs(e.clientX - r.left) <= EDGE ? 'left' : '';
    const nearRow = Math.abs(e.clientY - r.bottom) <= EDGE ? 'bottom' : Math.abs(e.clientY - r.top) <= EDGE ? 'top' : '';
    if (!near && !nearRow) return null;
    const info = cellInfo(cell);
    if (!info) return null;
    const { map, rect } = info;
    if (near === 'right' && rect.right < map.width) return { ...info, kind: 'col', index: rect.right - 1 };
    if (near === 'left' && rect.left > 0) return { ...info, kind: 'col', index: rect.left - 1 };
    const rows = rowsOf(info.table);
    if (nearRow === 'bottom') return rows[rect.bottom - 1] ? { ...info, kind: 'row', tr: rows[rect.bottom - 1] } : null;
    if (nearRow === 'top' && rect.top > 0) return rows[rect.top - 1] ? { ...info, kind: 'row', tr: rows[rect.top - 1] } : null;
    return null;
  }

  // Lignes du tableau (sans les en-têtes répétés ni les intercalaires de page).
  const rowsOf = (table) => [...table.querySelectorAll(':scope > tbody > tr')].filter((tr) => tr.pmViewDesc && tr.pmViewDesc.node);

  // Largeur affichée de chaque colonne (une case simple de la colonne la donne ; sinon, part égale de la
  // case fusionnée).
  function columnWidths({ node, map, tpos }) {
    const out = [];
    for (let c = 0; c < map.width; c++) {
      let w = 0;
      let shared = 0;
      for (let r = 0; r < map.height; r++) {
        const off = map.map[r * map.width + c];
        const cell = node.nodeAt(off);
        const dom = view.nodeDOM(tpos + 1 + off);
        if (!dom) continue;
        const span = cell.attrs.colspan || 1;
        if (span === 1) { w = dom.getBoundingClientRect().width; break; }
        if (!shared) shared = dom.getBoundingClientRect().width / span;
      }
      out.push(w || shared);
    }
    return out;
  }

  // ----- Bande du trait -----

  const zone = document.createElement('div');
  zone.className = 'ft-side-zone ft-grid-zone';
  zone.hidden = true;
  document.body.append(zone);
  let hit = null;
  function placeZone(edge) {
    hit = edge;
    zone.hidden = !edge;
    if (!edge) return;
    const t = edge.table.getBoundingClientRect();
    if (edge.kind === 'col') {
      const cells = columnCells(edge);
      const x = cells.length ? cells[0].getBoundingClientRect().right : t.left;
      Object.assign(zone.style, { left: x - EDGE + 'px', top: t.top + 'px', width: 2 * EDGE + 'px', height: t.height + 'px', cursor: 'col-resize' });
    } else {
      const r = edge.tr.getBoundingClientRect();
      Object.assign(zone.style, { left: t.left + 'px', top: r.bottom - EDGE + 'px', width: t.width + 'px', height: 2 * EDGE + 'px', cursor: 'row-resize' });
    }
    zone.title = edge.kind === 'col' ? 'Largeur des colonnes (double-clic : colonnes égales)' : 'Hauteur de la ligne (double-clic : hauteur d’origine)';
  }
  // Cases dont le bord droit est le trait de la colonne index (pour placer la bande).
  function columnCells({ node, map, tpos, index }) {
    const out = [];
    for (let r = 0; r < map.height; r++) {
      const off = map.map[r * map.width + index];
      const rect = map.findCell(off);
      if (rect.right !== index + 1) continue;
      const dom = view.nodeDOM(tpos + 1 + off);
      if (dom) out.push(dom);
    }
    return out;
  }

  // Le bord d'un tableau (largeur du tableau, layout.js) passe avant le trait d'une ligne qui y aboutit.
  const sideShown = () => [...document.querySelectorAll('.ft-side-zone:not(.ft-grid-zone)')].some((z) => !z.hidden);
  const SIDE = 5;
  function notSide(edge, e) {
    if (!edge) return null;
    const t = edge.table.getBoundingClientRect();
    return Math.abs(e.clientX - t.left) <= SIDE || Math.abs(e.clientX - t.right) <= SIDE ? null : edge;
  }
  mount.addEventListener('mousemove', (e) => {
    if (e.buttons || O().busy()) return;
    const edge = sideShown() ? null : notSide(edgeAt(e), e);
    if (edge || hit) placeZone(edge);
  });
  zone.addEventListener('mousemove', (e) => {
    if (e.buttons) return;
    // La bande est au-dessus des cases : on cherche le trait sous elle.
    zone.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    zone.style.pointerEvents = '';
    const edge = under && mount.contains(under) ? notSide(edgeAt({ target: under, clientX: e.clientX, clientY: e.clientY }), e) : null;
    placeZone(edge);
  });
  zone.addEventListener('mouseleave', (e) => { if (!e.buttons && !mount.contains(e.relatedTarget)) placeZone(null); });
  document.getElementById('workspace').addEventListener('scroll', () => { if (hit) placeZone(null); }, { passive: true });

  // ----- Geste -----

  zone.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hit) return;
    e.preventDefault();
    const edge = hit;
    placeZone(null);
    const start = { x: e.clientX, y: e.clientY };
    let move = null;
    // Le geste commence au premier mouvement (un simple clic ne change rien).
    function setup() {
      O().checkpoint();
      if (edge.kind === 'row') {
        const { tr } = edge;
        const zk = tr.currentCSSZoom || 1;
        const h0 = tr.getBoundingClientRect().height;
        return (ev) => { tr.style.height = Math.max(18, Math.round((h0 + ev.clientY - start.y) / zk)) + 'px'; };
      }
      const widths = columnWidths(edge);
      const table = edge.table;
      const total = table.getBoundingClientRect().width;
      const fixed = table.dataset.width !== 'auto';
      // Les largeurs actuelles deviennent des colonnes réglées (en % de la page, ou en pixels pour un
      // tableau ajusté au contenu).
      let group = table.querySelector(':scope > colgroup');
      if (!group || group.children.length !== widths.length) {
        if (group) group.remove();
        group = document.createElement('colgroup');
        for (let i = 0; i < widths.length; i++) group.appendChild(document.createElement('col'));
        table.prepend(group);
      }
      const cols = [...group.children];
      const zk = table.currentCSSZoom || 1;
      const unit = (w) => (fixed ? +((w / total) * 100).toFixed(3) + '%' : Math.round(w / zk) + 'px');
      cols.forEach((col, i) => { col.style.width = unit(widths[i]); });
      const { index } = edge;
      const pair = widths[index] + widths[index + 1];
      return (ev) => {
        const left = Math.max(MIN, Math.min(pair - MIN, widths[index] + ev.clientX - start.x));
        cols[index].style.width = unit(left);
        cols[index + 1].style.width = unit(pair - left);
      };
    }
    document.body.dataset.rz = edge.kind === 'col' ? 'e' : 's';
    document.body.classList.add('ft-resizing');
    let frame = 0;
    let last = e;
    const onMove = (ev) => {
      last = ev;
      if (!move) move = setup();
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; move(last); O().placeFrame(); });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frame) cancelAnimationFrame(frame);
      document.body.classList.remove('ft-resizing');
      delete document.body.dataset.rz;
      if (!move) return;
      move(last);
      O().changed();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Double-clic sur un trait : colonnes égales, ou hauteur d'origine de la ligne.
  mount.addEventListener('dblclick', (e) => {
    const edge = edgeAt(e);
    if (!edge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const tr = view.state.tr;
    if (edge.kind === 'col') {
      if (!edge.node.attrs.cols) return;
      tr.setNodeMarkup(edge.tpos, null, { ...edge.node.attrs, cols: null });
    } else {
      const pos = O().posOf(edge.tr);
      const row = pos === null ? null : view.state.doc.nodeAt(pos);
      if (!row || !/height/.test(row.attrs.a.style || '')) return;
      const a = { ...row.attrs.a, style: row.attrs.a.style.replace(/(^|;)\s*height:[^;]*;?/, '$1').trim() };
      if (!a.style) delete a.style;
      tr.setNodeMarkup(pos, null, { ...row.attrs, a });
    }
    view.dispatch(PM.history.closeHistory(tr));
    M.closeHistory();
  }, true);
})();
