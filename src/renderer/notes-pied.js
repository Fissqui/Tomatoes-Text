// Notes de bas de page au pied de leur page, à l'impression (export PDF en mode avancé, export livre) :
// tourne dans la page cachée que Chromium met en pages (main.js, livre.js), après la composition des
// paragraphes. Chromium ne sait pas poser une note au bas d'une page : le découpage est fait ici, comme à
// l'écran (moteur/decoupage.js), sur la page cachée affichée à la largeur du texte. Chaque fin de page
// devient un intercalaire (.np-gap) qui remplit le bas de la page et force la page suivante ; les notes
// de la page y sont posées, au bas, sous un filet. Une note trop longue continue en tête des notes de la
// page suivante. Le bloc des notes, à la fin du texte, n'est pas imprimé.
// run() peut être refait (export livre : pages blanches posées avant les chapitres) : le passage
// d'avant est d'abord défait.
(function () {
  const PX = 96 / 25.4;
  const SAFE = 2; // px laissés au bas de chaque page (arrondis de Chromium)
  const ed = () => document.getElementById('editor');
  let done = null; // passage fait : { box }

  const css = document.createElement('style');
  css.textContent = `
  html.np-on #editor *, html.np-on #editor { break-before: auto !important; break-after: auto !important; break-inside: auto !important; orphans: 1 !important; widows: 1 !important; }
  html.np-on #editor > .ft-footnotes { display: none !important; }
  html.np-on #editor .np-gap { display: block; position: relative; margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; text-indent: 0 !important; break-after: page !important; }
  html.np-on #editor .np-gap.np-end { break-after: auto !important; }
  html.np-on #editor tr.np-gap { display: table-row; }
  html.np-on #editor tr.np-gap > td { position: relative; padding: 0 !important; border: 0 !important; background: none !important; }
  #editor .np-notes { position: absolute; bottom: 0; font-size: 0.8em; line-height: 1.45; text-indent: 0; text-align: left; font-weight: normal; font-style: normal; text-transform: none; letter-spacing: normal; color: #1f1f1f; }
  #editor .np-notes::before { content: ''; position: absolute; left: 0; top: -0.5em; width: 30%; border-top: 0.75pt solid #777; }
  #editor .np-note { position: relative; padding-left: 1.8em; margin: 0; }
  #editor :is(.np-note > div, .np-clip) { margin: 0 !important; }
  #editor .np-note > .np-n { position: absolute; left: 0; width: 1.4em; text-align: right; }
  #editor .np-note > div > :is(p, div) { margin: 0; }
  #editor .np-clip { overflow: hidden; }
  #editor .np-split { margin-top: 0 !important; text-indent: 0 !important; }
  #editor .np-cut { margin-bottom: 0 !important; text-align-last: justify; }
  #editor .np-cut:not([style*="text-align"]):is(p) { text-align-last: auto; }
  `;
  document.head.append(css);

  // ----- Passage d'avant défait -----

  function undo() {
    const root = ed();
    for (const g of [...root.querySelectorAll('.np-gap, .np-head')]) g.remove();
    // Paragraphes coupés : la suite revient dans le premier morceau.
    for (const b of [...root.querySelectorAll('[data-np-split]')].reverse()) {
      const a = b.previousElementSibling;
      if (a && a.hasAttribute('data-np-cut')) {
        a.append(...b.childNodes);
        a.removeAttribute('data-np-cut');
        a.classList.remove('np-cut');
        b.remove();
        a.normalize();
      }
    }
    document.documentElement.classList.remove('np-on');
    done = null;
  }

  // ----- Notes -----

  // Lignes d'un élément : { top, bottom } (px, à l'écran).
  const range = document.createRange();
  function lines(el) {
    const rects = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let x = w.nextNode(); x; x = w.nextNode()) {
      let list;
      if (x.nodeType === 3) {
        if (!x.data.length) continue;
        range.selectNodeContents(x);
        list = range.getClientRects();
      } else if (x.tagName === 'IMG' || x.tagName === 'BR') list = [x.getBoundingClientRect()];
      else continue;
      for (const r of list) if (r.height > 0) rects.push({ top: r.top, bottom: r.bottom });
    }
    rects.sort((a, b) => a.top - b.top);
    const out = [];
    for (const r of rects) {
      const last = out[out.length - 1];
      if (last && r.top < last.bottom - 2) last.bottom = Math.max(last.bottom, r.bottom);
      else out.push({ ...r });
    }
    for (let i = 1; i < out.length; i++) out[i].top = (out[i - 1].bottom + out[i].top) / 2;
    return out;
  }

  // Une note imprimée : numéro, puis le texte de la note.
  function noteEl(li, n) {
    const d = document.createElement('div');
    d.className = 'np-note';
    const num = document.createElement('span');
    num.className = 'np-n';
    num.textContent = n + '.';
    const body = document.createElement('div');
    body.innerHTML = li.innerHTML;
    d.append(num, body);
    return d;
  }

  // ----- Coupures -----

  // Début de la ligne n° line d'un bloc de texte : un endroit avant lequel rien de la ligne ne se trouve
  // (remonté hors des éléments dont c'est le début : ligne composée…).
  function lineStartPoint(el, line) {
    const at = window.FTDecoupage.lineStart(el, line);
    if (!at) return null;
    let node = at.node;
    let offset = at.offset;
    if (offset < 0) { offset = [...node.parentNode.childNodes].indexOf(node); node = node.parentNode; }
    while (node !== el && offset === 0 && node.parentNode) {
      offset = [...node.parentNode.childNodes].indexOf(node);
      node = node.parentNode;
    }
    return { node, offset };
  }

  // Intercalaire avant le morceau qui ouvre une page : un élément de bloc (ou une ligne de tableau).
  function gapBefore(target) {
    let g;
    if (target.tagName === 'TR') {
      g = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 99;
      g.append(td);
    } else g = document.createElement('div');
    g.className = 'np-gap';
    g.setAttribute('aria-hidden', 'true');
    target.before(g);
    // (Même page nommée que ce qui précède : un changement ajouterait une page.)
    const prev = g.previousElementSibling;
    if (prev && g.parentElement === ed()) g.style.page = getComputedStyle(prev).page;
    return g;
  }

  // Paragraphe coupé avant sa ligne n° line : le reste passe dans une copie du paragraphe, après lui.
  function splitAt(el, line) {
    const p = lineStartPoint(el, line);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.node, p.offset);
    r.setEnd(el, el.childNodes.length);
    const rest = el.cloneNode(false);
    rest.removeAttribute('id');
    for (const a of [...rest.attributes]) if (a.name.startsWith('data-lv')) rest.removeAttribute(a.name);
    rest.append(r.extractContents());
    rest.setAttribute('data-np-split', '');
    rest.classList.add('np-split');
    if (el.tagName === 'LI') { rest.style.listStyleType = 'none'; rest.style.counterIncrement = 'list-item 0'; }
    el.setAttribute('data-np-cut', '');
    el.classList.add('np-cut');
    el.after(rest);
    return rest;
  }

  // o : { height (mm, hauteur de la zone de texte d'une page), keep (pages qui restent en place),
  // chapters (nouvelle page avant les titres de niveau 1, ou 1 et 2) }.
  function run(o = {}) {
    if (done) undo();
    const root = ed();
    const box = root.querySelector(':scope > .ft-footnotes');
    const lis = box ? [...box.querySelectorAll('li[data-fn]')] : [];
    if (!lis.length || !window.FTDecoupage) return { notes: 0 };
    const D = window.FTDecoupage;
    const H = o.height * PX;
    // Les blocs (sans le bloc des notes), mesurés avant toute coupure.
    document.documentElement.classList.add('np-on');
    // (En-tête répété d'un tableau : remis en tête du corps ; il est recopié à chaque coupure.)
    for (const t of root.querySelectorAll('table > thead')) {
      const body = t.tBodies[0];
      if (!body) continue;
      const pad = body.rows[0] && body.rows[0].style.display === 'none' ? body.rows[0] : null;
      if (pad) pad.remove();
      body.prepend(...t.rows);
      t.tHead.remove();
    }
    const blocks = [...root.children].filter((el) => el !== box && getComputedStyle(el).display !== 'none' && !/^(absolute|fixed)$/.test(getComputedStyle(el).position));
    const n = blocks.length;
    if (!n) { undo(); return { notes: 0 }; }
    const y0 = window.scrollY;
    const top = (el) => el.getBoundingClientRect().top + y0;
    const tops = blocks.map(top);
    const end = root.getBoundingClientRect().bottom + y0 - (parseFloat(getComputedStyle(root).paddingBottom) || 0);
    const meas = blocks.map((el) => D.measure(el, 1));
    // Notes : mesurées dans une couche à la largeur du texte (celle des notes posées).
    const cs = getComputedStyle(root);
    const ox = root.getBoundingClientRect().left + (parseFloat(cs.paddingLeft) || 0);
    const width = root.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const layer = document.createElement('div');
    layer.className = 'np-notes';
    layer.style.cssText = 'position:absolute;left:0;top:0;bottom:auto;visibility:hidden;width:' + width + 'px';
    root.append(layer);
    const notes = new Map();
    lis.forEach((li, k) => {
      const el = noteEl(li, k + 1);
      layer.append(el);
      notes.set(li.dataset.fn, { el, n: k + 1 });
    });
    for (const nt of notes.values()) {
      const r = nt.el.getBoundingClientRect();
      nt.h = r.height;
      nt.cuts = lines(nt.el).slice(1).map((l) => l.top - r.top).filter((y) => y > 1);
    }
    const sep = Math.round((parseFloat(getComputedStyle(layer).fontSize) || 12) * 1.8);
    layer.remove();
    // Règles de chaque bloc.
    const isCover = (el) => el.classList.contains('ft-cover');
    const keep = (i) => {
      const el = blocks[i];
      const prev = blocks[i - 1];
      if (!i) return false;
      if (isCover(prev) || el.classList.contains('lv-blanc') || prev.classList.contains('lv-blanc')) return true;
      if (el.classList.contains('lv-chap') && !el.classList.contains('lv-premier')) return true;
      if (o.keep && el.hasAttribute('data-pg-start')) return true;
      if (o.chapters && el.matches(o.chapters > 1 ? 'h1, h2' : 'h1') && !el.classList.contains('ft-title')) return true;
      return false;
    };
    const result = D.paginate({
      n,
      head: tops[0],
      slot: (i) => (i + 1 < n ? tops[i + 1] : end) - tops[i],
      meas: (i) => meas[i],
      keep,
      legend: (i) => blocks[i].matches('p.ft-legend') && i + 1 < n && blocks[i + 1].tagName === 'TABLE',
      withNext: (i) => /^H[1-6]$/.test(blocks[i].tagName),
      repeat: (i) => {
        const t = blocks[i];
        if (t.tagName !== 'TABLE' || !t.hasAttribute('data-header') || !t.hasAttribute('data-repeat') || !t.rows[0]) return 0;
        return t.rows[0].getBoundingClientRect().height;
      },
      region: (r) => ({ page: r, ct: r * H, cb: (r + 1) * H - SAFE, full: true }),
      note: (id) => notes.get(id) || null,
      sep
    });
    // Fins de page : avant un bloc (place ajoutée avant lui), ou dans un bloc (coupure). Dans l'ordre du
    // texte : { page (page qui finit), at (élément de bloc ou ligne de tableau qui ouvre la suivante, ou
    // { el, line } : ligne d'un paragraphe), head (ligne d'en-tête à recopier) }.
    const ends = [];
    let page = 0;
    for (let i = 0; i < n; i++) {
      while (page < result.pageOf[i]) ends.push({ page: page++, at: blocks[i] });
      for (const br of result.breaks.get(i) || []) {
        const u = meas[i].units[br.j];
        const at = u.kind === 'line' && u.line ? { el: u.at, line: u.line } : u.at;
        const head = u.kind === 'row' && br.target > br.gapTarget + D.EPS ? blocks[i].rows[0] : null;
        ends.push({ page: page++, at, head });
      }
    }
    // (Pages de suites de notes après la fin du texte.)
    while (page < result.last) ends.push({ page: page++, at: null });
    // Intercalaires posés de la fin vers le début (les lignes d'un paragraphe restent comptées comme mesurées).
    const gaps = new Array(ends.length);
    let tail = null; // (intercalaires des pages de suites de notes, à la fin, dans l'ordre)
    for (let k = ends.length - 1; k >= 0; k--) {
      const e = ends[k];
      let target = e.at;
      if (target && !(target instanceof Element)) target = splitAt(target.el, target.line);
      if (target && e.head && target.tagName === 'TR') {
        const copy = e.head.cloneNode(true);
        copy.classList.add('np-head');
        copy.removeAttribute('id');
        copy.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
        target.before(copy);
        target = copy;
      }
      if (target) gaps[k] = gapBefore(target);
      else {
        const g = document.createElement('div');
        g.className = 'np-gap';
        if (tail) tail.before(g); else root.append(g);
        tail = g;
        gaps[k] = g;
      }
    }
    const last = document.createElement('div');
    last.className = 'np-gap np-end';
    root.append(last);
    gaps.push(last);
    // Hauteurs, de haut en bas : chaque intercalaire remplit le bas de sa page (moins la marge de sûreté) ;
    // la page suivante commence juste après lui. Les notes de la page y sont posées.
    let start = 0;
    gaps.forEach((g, r) => {
      const cell = g.tagName === 'TR' ? g.firstChild : g;
      const gt = top(g);
      const h = Math.max(0, start + H - SAFE - gt);
      cell.style.height = h + 'px';
      const list = result.notes[r] || [];
      if (list.length) {
        const box2 = document.createElement('div');
        box2.className = 'np-notes';
        box2.style.left = (ox - cell.getBoundingClientRect().left) + 'px';
        box2.style.width = width + 'px';
        for (const p of list) {
          const nt = notes.get(p.id);
          if (!nt) continue;
          const el = noteEl(lis[nt.n - 1], nt.n);
          if (p.y0 > 0.5 || p.y1 < nt.h - 0.5) {
            // Partie d'une note coupée (sans numéro pour la suite).
            const clip = document.createElement('div');
            clip.className = 'np-clip';
            clip.style.height = (p.y1 - p.y0) + 'px';
            el.style.marginTop = -p.y0 + 'px';
            if (p.y0 > 0.5) el.firstChild.textContent = '';
            clip.append(el);
            box2.append(clip);
          } else box2.append(el);
        }
        cell.append(box2);
      }
      start = gt + h;
    });
    done = { box };
    return { notes: lis.length, pages: ends.length + 1 };
  }

  window.FTNotesPied = { run, undo };
})();
