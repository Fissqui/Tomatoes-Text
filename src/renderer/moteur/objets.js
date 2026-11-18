// Objets dans le nouveau moteur : images, schémas, tableaux, encadrés, lignes de séparation, formules…
// Sélection (cadre, poignée à gauche), touches (Suppr, Alt+flèches, flèches, Entrée, frappe après l'objet),
// déplacement entre les blocs, et pont avec les gestes des versions 1.x (layout.js : position,
// habillage, taille, légende, cadre ; diagram.js : schémas).
// Pont : pendant un geste, l'affichage est modifié directement (comme dans les versions 1.x), le moteur
// ne le relit pas et l'affichage partiel (visibles.js) ne bouge plus. À la fin du geste, les blocs touchés
// sont relus, l'affichage est remis dans son état d'avant, et le moteur applique la modification d'un
// coup : une seule étape d'annulation par geste.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const { Plugin, NodeSelection, TextSelection, Selection } = PM.state;
  const { Mapping } = PM.transform;
  // Chaque geste est une étape d'annulation à part (jamais fondue avec la frappe qui le précède).
  const step = (tr) => PM.history.closeHistory(tr);
  const N = schema.nodes;
  const mount = view.dom;
  const page = document.getElementById('page');
  const V = () => window.FTVisibles;
  const L = () => window.FTLayout;

  // Objet sélectionné : la sélection du navigateur reste « visible » pour le moteur (il ne pose pas sa classe
  // ProseMirror-hideselection sur toute la zone d'écriture) ; moteur.css la rend invisible sur l'objet seul.
  NodeSelection.prototype.visible = true;

  const OBJECTS = 'table.ft-table, blockquote.ft-callout, pre.ft-code, hr, div.ft-math, .ft-image, div.ft-toc, div.ft-lof, div.ft-index';
  const TEXT = 'p, h1, h2, h3, h4, h5, h6, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math):not([contenteditable="false"])';
  // Élément à sélectionner (ou où placer le curseur) une fois le geste appliqué : marque relue dans le modèle.
  const MARK = 'data-pm-target';
  const FAR = 'data-pm-far';

  const isZone = (el) => !!el && el.nodeType === 1 && el.parentNode === mount && el.classList.contains('ft-cols');
  const isContainer = (el) => el === mount || isZone(el);
  const isFree = (obj) => obj.dataset.wrap === 'devant' || obj.dataset.wrap === 'derriere';
  const isBeside = (obj) => obj.dataset.wrap === 'gauche' || obj.dataset.wrap === 'droite';
  const emptyPara = () => N.paragraph.create({ tag: 'p', a: {}, bare: false });

  // Bloc (ou bloc d'une zone en colonnes) qui contient ce nœud de l'affichage.
  function topBlock(node) {
    while (node && node.parentNode && !isContainer(node.parentNode)) node = node.parentNode;
    return node && node.parentNode && isContainer(node.parentNode) ? node : null;
  }
  const topLevel = (node) => {
    while (node && node.parentNode !== mount) node = node.parentNode;
    return node;
  };

  // Position dans le modèle de l'élément affiché d'un nœud (null si l'élément n'est plus celui du moteur).
  function posOf(el) {
    const d = el && el.pmViewDesc;
    if (!d || !d.node || d.dom !== el || !el.isConnected) return null;
    try { return d.posBefore; } catch { return null; }
  }

  // ----- Pont : gestes faits directement sur l'affichage -----

  let session = null;
  const afterFns = [];

  function begin() {
    if (session) return;
    view.domObserver.flush();
    view.domObserver.stop();
    if (V()) V().hold(true);
    const records = [];
    const mo = new MutationObserver((list) => { for (const r of list) records.push(r); });
    mo.observe(mount, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
    session = { mo, records, state: view.state, before: [...mount.children], focus: null, ending: false, caption: false, text: false };
  }

  // Outil des versions 1.x qui modifie le texte affiché (casse, formule, caractère…) : appliqué d'un coup,
  // une seule étape d'annulation ; la sélection laissée par l'outil dans le texte est reprise.
  function edit(fn) {
    if (session) return fn();
    begin();
    session.text = true;
    try {
      return fn();
    } finally {
      if (session) end();
    }
  }

  // Fin du geste : appliquée juste après (une sélection demandée dans la foulée est encore prise en compte).
  function changed() {
    if (!session || session.ending) return;
    session.ending = true;
    queueMicrotask(end);
  }

  function after(fn) {
    if (session) afterFns.push(fn);
    else fn();
  }

  function end() {
    const s = session;
    if (!s) return null;
    for (const r of s.mo.takeRecords()) s.records.push(r);
    let tr = null;
    try {
      if (s.records.length && view.state === s.state) {
        // La marque de l'élément à sélectionner est posée tant que les changements sont encore suivis
        // (elle sera retirée de l'affichage avec eux).
        const f = s.focus;
        if (f && f.el.isConnected && mount.contains(f.el) && f.el.nodeType === 1) {
          f.el.setAttribute(MARK, f.kind);
          for (const r of s.mo.takeRecords()) s.records.push(r);
        }
        tr = build(s, s.text && !f ? textPoints() : null);
      }
    } catch (err) {
      console.error(err);
      tr = null;
    }
    s.mo.disconnect();
    session = null;
    revert(s.records);
    view.domObserver.start();
    try {
      if (tr) {
        if (!s.focus && s.caption) keepClickedCaret(tr);
        // (Objet sélectionné refait : voir regen.)
        if (view.state.selection instanceof NodeSelection) window.getSelection().removeAllRanges();
        view.dispatch(step(tr).setMeta(OWN, true));
        // (La frappe qui suit forme une autre étape.)
        view.dispatch(step(view.state.tr).setMeta(OWN, true));
      } else if (s.focus && s.focus.kind === 'node') {
        const pos = posOf(s.focus.el);
        if (pos !== null) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta(OWN, true));
      }
    } finally {
      if (V()) V().hold(false);
    }
    if (s.focus && !s.caption) view.focus();
    placeFrame();
    const fns = afterFns.splice(0);
    for (const fn of fns) fn();
    return tr;
  }

  // Mesure qui modifie l'affichage un instant et le remet en l'état (layout.js) : le moteur ne la relit pas.
  function quiet(fn) {
    if (session) return fn();
    view.domObserver.flush();
    view.domObserver.stop();
    try {
      return fn();
    } finally {
      view.domObserver.start();
    }
  }

  // Contenu produit par le logiciel (plan, numéros des légendes, renvois…) : l'outil modifie l'affichage
  // comme dans les versions 1.x ; seuls les attributs des éléments touchés (et le HTML des objets fermés)
  // passent dans le moteur, hors annulation, sans marquer le document comme modifié.
  const QUIET = 'ftQuiet';
  let regenerating = false;
  function liveAttrs(el, node) {
    const c = el.cloneNode(true);
    c.classList.remove('ProseMirror-selectednode', 'selectedCell');
    if (c.getAttribute('class') === '') c.removeAttribute('class');
    if (node.type === N.raw_block || node.type === N.raw_inline) return { html: window.FTSchema.outer(c) };
    if (!node.attrs.a) return null;
    if (node.isLeaf) for (const name of ['draggable', 'contenteditable']) if (!(name in node.attrs.a)) c.removeAttribute(name);
    const cell = node.type === N.table_cell || node.type === N.table_header;
    const attrs = { ...node.attrs, a: window.FTSchema.bag(c, cell ? ['colspan', 'rowspan', 'data-colwidth'] : ['data-pm-bare', 'data-pm-nobr']) };
    if ('inner' in node.attrs) attrs.inner = c.innerHTML;
    return attrs;
  }
  const sameAttrs = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  function regen(fn) {
    if (session || regenerating) return fn();
    view.domObserver.flush();
    view.domObserver.stop();
    regenerating = true;
    const mo = new MutationObserver(() => {});
    mo.observe(mount, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
    let records = [];
    const owners = new Set();
    try {
      return fn();
    } finally {
      records = mo.takeRecords();
      mo.disconnect();
      // Élément du moteur le plus proche de chaque changement.
      for (const r of records) {
        let n = r.target.nodeType === 1 ? r.target : r.target.parentNode;
        while (n && n !== mount && !(n.pmViewDesc && n.pmViewDesc.dom === n && n.pmViewDesc.node)) n = n.parentNode;
        if (n && n !== mount) owners.add(n);
      }
      const updates = [];
      for (const el of owners) {
        if (!el.isConnected) continue;
        const d = el.pmViewDesc;
        let pos;
        try { pos = d.posBefore; } catch { continue; }
        const attrs = liveAttrs(el, d.node);
        if (attrs && !sameAttrs(attrs, d.node.attrs)) updates.push({ pos, attrs });
      }
      revert(records);
      regenerating = false;
      view.domObserver.start();
      if (updates.length) {
        const tr = view.state.tr;
        for (const u of updates) tr.setNodeMarkup(u.pos, null, u.attrs);
        // Objet sélectionné refait (plan cliqué…) : le curseur passe juste après. Sinon le navigateur
        // recalcule la sélection sur tout le texte quand l'élément est remplacé (près d'une minute sur
        // 300 pages).
        const sel = view.state.selection;
        if (sel instanceof NodeSelection && updates.some((u) => u.pos === sel.from)) {
          tr.setSelection(Selection.near(tr.doc.resolve(sel.from + sel.node.nodeSize)));
        }
        view.dispatch(tr.setMeta('addToHistory', false).setMeta(QUIET, true).setMeta(OWN, true));
      }
    }
  }

  // Geste abandonné : l'affichage revient à l'état du moteur.
  function cancel() {
    const s = session;
    if (!s) return;
    for (const r of s.mo.takeRecords()) s.records.push(r);
    s.mo.disconnect();
    session = null;
    revert(s.records);
    view.domObserver.start();
    if (V()) V().hold(false);
    afterFns.splice(0).forEach((fn) => fn());
  }

  // Remet l'affichage dans l'état d'avant le geste (changements défaits du dernier au premier).
  function revert(records) {
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (r.type === 'attributes') {
        if (r.oldValue === null) r.target.removeAttribute(r.attributeName);
        else r.target.setAttribute(r.attributeName, r.oldValue);
      } else if (r.type === 'characterData') {
        r.target.data = r.oldValue;
      } else {
        for (let k = r.addedNodes.length - 1; k >= 0; k--) {
          const n = r.addedNodes[k];
          if (n.parentNode === r.target) r.target.removeChild(n);
        }
        const next = r.nextSibling && r.nextSibling.parentNode === r.target ? r.nextSibling : null;
        for (const n of r.removedNodes) r.target.insertBefore(n, next);
      }
    }
  }

  const fromHtml = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstChild;
  };

  // HTML d'un bloc affiché, sans ce que le moteur ajoute pour l'affichage (intercalaires de page,
  // marques de sélection, attributs posés sur les objets fermés).
  function cleanHtml(el, points) {
    const copy = el.cloneNode(true);
    // Endroits de la sélection dans ce bloc : un caractère repère, retrouvé dans le modèle.
    // (Posés après la lecture parallèle de l'affichage et de la copie ci-dessous, qui suppose les mêmes
    // enfants des deux côtés.)
    let spots = [];
    if (points) {
      // (Endroits trouvés dans la copie avant d'y rien ajouter ; dans un même texte, le plus loin d'abord.)
      spots = points.filter((p) => p.top === el).map((p) => {
        let c = copy;
        const path = [];
        for (let n = p.node; n !== el; n = n.parentNode) path.unshift([...n.parentNode.childNodes].indexOf(n));
        for (const i of path) c = c.childNodes[i];
        return { c, offset: p.offset, ref: c.nodeType === 3 ? null : c.childNodes[p.offset] || null, char: p.char };
      }).sort((x, y) => y.offset - x.offset);
    }
    const drop = [];
    const swap = [];
    (function walk(a, b) {
      if (a.nodeType !== 1) return;
      const d = a.pmViewDesc;
      if ((d && d.dom === a && !d.node && d.widget) || a.classList.contains('ProseMirror-separator') || a.classList.contains('ft-pg-gap')) {
        drop.push(b);
        return;
      }
      b.classList.remove('ProseMirror-selectednode', 'selectedCell');
      if (b.getAttribute('class') === '') b.removeAttribute('class');
      if (d && d.node && d.dom === a) {
        const n = d.node;
        if (n.type === N.raw_block || n.type === N.raw_inline) {
          if (!rawTouched.has(a)) swap.push([b, n.attrs.html]);
          return;
        }
        if (n.attrs.nobr) b.setAttribute('data-pm-nobr', '');
        if (n.isLeaf && n.attrs.a) {
          for (const name of ['draggable', 'contenteditable']) if (!(name in n.attrs.a)) b.removeAttribute(name);
        }
      }
      for (let i = 0; i < a.childNodes.length; i++) walk(a.childNodes[i], b.childNodes[i]);
    })(el, copy);
    for (const p of spots) {
      if (p.c.nodeType === 3) p.c.insertData(Math.min(p.offset, p.c.length), p.char);
      else p.c.insertBefore(document.createTextNode(p.char), p.ref);
    }
    for (const b of drop) b.remove();
    let out = copy;
    for (const [b, html] of swap) {
      const fresh = fromHtml(html);
      if (b.hasAttribute(MARK)) fresh.setAttribute(MARK, b.getAttribute(MARK));
      if (b === copy) out = fresh;
      else b.replaceWith(fresh);
    }
    return out.outerHTML;
  }

  const descOf = (el) => {
    const d = el.pmViewDesc;
    return d && d.node && d.dom === el && d.parent === view.docView ? d : null;
  };

  // Modification du moteur qui correspond à l'affichage modifié : les blocs de premier niveau touchés
  // (ou ajoutés) sont relus ; les autres gardent leur nœud.
  // Sélection du navigateur dans la zone (laissée par un outil) : ses deux bouts.
  const ANCHOR = '\uE000';
  const HEAD = '\uE001';
  function textPoints() {
    const ds = window.getSelection();
    if (!ds.rangeCount || !mount.contains(ds.anchorNode) || !mount.contains(ds.focusNode)) return null;
    const pts = [{ node: ds.anchorNode, offset: ds.anchorOffset, char: ANCHOR }];
    if (!ds.isCollapsed) pts.push({ node: ds.focusNode, offset: ds.focusOffset, char: HEAD });
    for (const p of pts) {
      p.top = topLevel(p.node);
      if (!p.top || p.top === mount) return null;
    }
    return pts;
  }

  // Objets fermés modifiés pendant le geste (champ de la page de titre, renvoi changé…) : relus tels
  // qu'affichés ; les autres reprennent leur HTML du moteur.
  let rawTouched = new Set();
  function build(s, points) {
    rawTouched = new Set();
    for (const r of s.records) {
      let n = r.target.nodeType === 1 ? r.target : r.target.parentNode;
      while (n && n !== mount && !(n.pmViewDesc && n.pmViewDesc.dom === n && n.pmViewDesc.node)) n = n.parentNode;
      if (n && n !== mount && (n.pmViewDesc.node.type === N.raw_block || n.pmViewDesc.node.type === N.raw_inline)) rawTouched.add(n);
    }
    const dirty = new Set();
    for (const r of s.records) {
      if (r.target === mount) continue;
      const top = topLevel(r.target);
      if (top) dirty.add(top);
    }
    const old = s.before.filter((el) => descOf(el));
    // (Un élément venu de l'intérieur d'un bloc — image sortie d'un paragraphe — est relu comme un nouveau bloc.)
    const now = [...mount.children].filter((el) => !(el.pmViewDesc && el.pmViewDesc.dom === el && !el.pmViewDesc.node) && !el.classList.contains('ft-pg-gap'));
    let a = 0;
    while (a < old.length && a < now.length && old[a] === now[a] && !dirty.has(old[a])) a++;
    let b = 0;
    while (b < old.length - a && b < now.length - a && old[old.length - 1 - b] === now[now.length - 1 - b] && !dirty.has(old[old.length - 1 - b])) b++;
    if (a === old.length && a === now.length) return null;
    const doc = view.state.doc;
    const from = a > 0 ? descOf(old[a - 1]).posBefore + descOf(old[a - 1]).node.nodeSize : 0;
    const to = b > 0 ? descOf(old[old.length - b]).posBefore : doc.content.size;
    const nodes = [];
    // Bouts de la sélection : position dans le modèle d'avant (blocs gardés), ou repère (blocs relus).
    const ends = [];
    const slice = now.slice(a, now.length - b);
    if (points) {
      for (const p of points) {
        const d = descOf(p.top);
        const i = slice.indexOf(p.top);
        if (i < 0 || (d && !dirty.has(p.top))) {
          let pos = null;
          try { pos = view.posAtDOM(p.node, p.offset); } catch { /* bout hors du moteur */ }
          if (pos === null) { points = null; break; }
          ends.push(i < 0 ? { old: pos } : { el: p.top, rel: pos - d.posBefore });
        } else {
          ends.push({ char: p.char });
        }
      }
    }
    let at = from;
    const startOf = new Map();
    for (const el of slice) {
      startOf.set(el, at);
      const d = descOf(el);
      if (d && !dirty.has(el)) { nodes.push(d.node); at += d.node.nodeSize; continue; }
      window.FTSchema.parse(cleanHtml(el, points)).forEach((n) => { nodes.push(n); at += n.nodeSize; });
    }
    if (!nodes.length && from === 0 && to === doc.content.size) nodes.push(emptyPara());
    const tr = view.state.tr.replaceWith(from, to, nodes);
    if (points && ends.length) {
      // Repères retirés (du dernier au premier), puis sélection posée.
      const found = {};
      tr.doc.nodesBetween(from, Math.min(at, tr.doc.content.size), (node, pos) => {
        if (!node.isText) return true;
        for (const ch of [ANCHOR, HEAD]) {
          const k = node.text.indexOf(ch);
          if (k >= 0) found[ch] = pos + k;
        }
        return false;
      });
      const marks = Object.entries(found).sort((x, y) => y[1] - x[1]);
      for (const [, pos] of marks) tr.delete(pos, pos + 1);
      const fix = (pos) => pos - marks.filter(([, q]) => q < pos).length;
      const where = ends.map((e) => {
        if (e.char) return found[e.char] === undefined ? null : fix(found[e.char]);
        if (e.el) return fix(startOf.get(e.el) + e.rel);
        return tr.mapping.map(e.old);
      });
      if (where.every((w) => w !== null)) {
        try {
          const $a = tr.doc.resolve(where[0]);
          const $h = tr.doc.resolve(where.length > 1 ? where[1] : where[0]);
          tr.setSelection($a.parent.inlineContent && $h.parent.inlineContent ? TextSelection.between($a, $h) : Selection.near($a));
        } catch { /* sélection d'avant */ }
      }
      return tr;
    }
    // Marque relue : sélection de l'objet, ou curseur au début ou à la fin d'un bloc.
    let size = 0;
    for (const n of nodes) size += n.nodeSize;
    let found = null;
    tr.doc.nodesBetween(from, Math.min(from + size, tr.doc.content.size), (node, pos) => {
      if (found) return false;
      const bag = node.attrs && node.attrs.a;
      let kind = bag && bag[MARK] !== undefined ? bag[MARK] : null;
      if (kind === null && node.type === N.raw_block) {
        const m = new RegExp(' ' + MARK + '="(\\w*)"').exec(node.attrs.html);
        if (m) kind = m[1];
      }
      if (kind === null) return true;
      found = { node, pos, kind };
      return false;
    });
    // Mêmes tailles (attributs seuls changés : taille, habillage…) : le curseur reste où il était.
    if (!found && size === to - from) {
      try { tr.setSelection(Selection.fromJSON(tr.doc, view.state.selection.toJSON())); } catch { /* sélection d'après */ }
    }
    if (found) {
      const { node, pos, kind } = found;
      if (node.type === N.raw_block) {
        tr.setNodeMarkup(pos, null, { html: node.attrs.html.replace(new RegExp(' ' + MARK + '="\\w*"'), '') });
      } else {
        const bag = { ...node.attrs.a };
        delete bag[MARK];
        tr.setNodeMarkup(pos, null, { ...node.attrs, a: bag });
      }
      if (kind === 'node' && NodeSelection.isSelectable(node)) tr.setSelection(NodeSelection.create(tr.doc, pos));
      else if (kind === 'end') tr.setSelection(Selection.near(tr.doc.resolve(pos + node.nodeSize), -1));
      else tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)), 1));
    }
    return tr;
  }

  // Légende quittée par un clic dans le texte : le curseur reste où l'on a cliqué.
  function keepClickedCaret(tr) {
    const ds = window.getSelection();
    if (!ds.rangeCount || !mount.contains(ds.anchorNode)) return;
    const el = ds.anchorNode.nodeType === 1 ? ds.anchorNode : ds.anchorNode.parentElement;
    if (el && el.closest(CAPTION)) return;
    try {
      const p = view.posAtDOM(ds.anchorNode, ds.anchorOffset);
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(p))));
    } catch { /* curseur non retrouvé : sélection d'avant */ }
  }

  // Une autre modification arrive pendant un geste (outil de la barre pendant l'écriture d'une légende…) :
  // le geste est appliqué d'abord, puis cette modification par-dessus.
  const OWN = 'ftObjets';
  function guard(tr) {
    if (!session || tr.getMeta(OWN)) return tr;
    const done = end();
    if (!done || tr.before === view.state.doc) return tr;
    const out = view.state.tr;
    const map = new Mapping();
    for (let i = tr.steps.length - 1; i >= 0; i--) map.appendMap(tr.steps[i].getMap().invert());
    map.appendMapping(done.mapping);
    const n = tr.steps.length;
    for (let i = 0; i < n; i++) {
      const step = tr.steps[i].map(map.slice(n - i));
      if (step && !out.maybeStep(step).failed) map.appendMap(step.getMap());
    }
    for (const k in tr.meta) out.setMeta(k, tr.meta[k]);
    if (tr.storedMarksSet) out.setStoredMarks(tr.storedMarks);
    if (tr.scrolledIntoView) out.scrollIntoView();
    return out;
  }
  M.guardDispatch(guard);

  // ----- Objet sélectionné : cadre et poignée -----

  const handle = document.createElement('div');
  handle.id = 'block-handle';
  handle.title = 'Cliquer pour sélectionner, glisser pour déplacer';
  handle.textContent = '⠿';
  handle.hidden = true;
  const frame = document.createElement('div');
  frame.id = 'object-frame';
  frame.hidden = true;
  page.append(handle, frame);

  // Voile transparent pendant un geste (curseur du geste, voir styles.css). Les recherches d'un endroit
  // du texte sous la souris passent à travers lui.
  const cover = document.createElement('div');
  cover.id = 'ft-cover';
  document.body.append(cover);
  const workspace = document.getElementById('workspace');
  cover.addEventListener('wheel', (e) => workspace.scrollBy({ top: e.deltaY, left: e.deltaX }), { passive: true });
  for (const name of ['caretRangeFromPoint', 'elementFromPoint', 'elementsFromPoint']) {
    const native = document[name].bind(document);
    document[name] = (x, y) => {
      const b = document.body.classList;
      if (!b.contains('ft-dragging') && !b.contains('ft-resizing')) return native(x, y);
      cover.style.pointerEvents = 'none';
      try {
        return native(x, y);
      } finally {
        cover.style.pointerEvents = '';
      }
    };
  }

  let onObjectChange = () => {};
  let hoverObj = null;
  let dragging = false;

  const isObjectEl = (el) => !!el && el.nodeType === 1 && el.matches(OBJECTS) && (isContainer(el.parentNode) || el.classList.contains('ft-image'));

  function objectOf(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const obj = el && el.closest(OBJECTS);
    if (!obj || !mount.contains(obj)) return null;
    return isContainer(obj.parentNode) || obj.classList.contains('ft-image') ? obj : null;
  }

  // Objet sélectionné dans le moteur (pendant un geste : l'objet du geste).
  function selectedDom() {
    const sel = view.state.selection;
    if (!(sel instanceof NodeSelection)) return null;
    const dom = view.nodeDOM(sel.from);
    return isObjectEl(dom) ? dom : null;
  }
  function selected() {
    if (session && session.focus && session.focus.kind === 'node') return session.focus.el;
    return selectedDom();
  }

  function pageRect(el) {
    const r = el.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    const k = page.currentCSSZoom || 1;
    return { top: (r.top - p.top) / k, left: (r.left - p.left) / k, width: r.width / k, height: r.height / k };
  }

  // Barre de l'objet (layout.js) : affichée pour l'objet sélectionné, ou le tableau du curseur.
  const tools = () => document.getElementById('object-tools');
  let framed = null;
  function placeFrame() {
    const obj = selected();
    if (!obj || !obj.isConnected || obj.hasAttribute(FAR)) {
      frame.hidden = true;
      if (framed) {
        framed = null;
        onObjectChange(null);
      } else if (L() && tools() && !tools().hidden) {
        L().refreshTools();
      }
      return;
    }
    framed = obj;
    frame.hidden = false;
    const r = pageRect(obj);
    Object.assign(frame.style, { top: r.top - 5 + 'px', left: r.left - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' });
    if (hoverObj && !handle.hidden && hoverObj.isConnected) placeHandle(hoverObj);
    onObjectChange(obj, r);
  }
  let frameRaf = 0;
  const placeFrameSoon = () => { if (!frameRaf) frameRaf = requestAnimationFrame(() => { frameRaf = 0; placeFrame(); }); };
  M.onUpdate(() => { if (!session) placeFrameSoon(); });
  document.addEventListener('ft-paginated', placeFrameSoon);
  window.addEventListener('resize', placeFrameSoon);

  // Images insérées par les outils des versions 1.x : élément préparé → nœud placé dans le texte.
  const inserted = new WeakMap();
  function findNode(node) {
    let at = null;
    view.state.doc.descendants((n, pos) => {
      if (at !== null) return false;
      if (n === node) { at = pos; return false; }
      return true;
    });
    return at;
  }

  function selectObject(obj) {
    if (session) {
      session.focus = { el: obj, kind: 'node' };
      placeFrame();
      return;
    }
    // (Changements de la page encore en attente — objet flottant replacé pendant le clic… : lus d'abord,
    // sinon le moteur les relirait après et remettrait le curseur dans le texte de l'objet.)
    let pos = posOf(obj);
    if (pos === null && inserted.has(obj)) pos = findNode(inserted.get(obj));
    if (pos === null) return;
    const doc = view.state.doc;
    view.domObserver.flush();
    // (Texte changé par cette lecture : la place est recherchée de nouveau.)
    if (view.state.doc !== doc) pos = posOf(obj);
    if (pos === null) return;
    const node = view.state.doc.nodeAt(pos);
    if (!node || !NodeSelection.isSelectable(node)) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    if (!view.hasFocus()) view.focus();
    placeFrame();
  }

  function deselect() {
    const sel = view.state.selection;
    if (sel instanceof NodeSelection) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(sel.to), 1)));
  }

  function placeCaret(node, atEnd) {
    if (session) {
      const el = node.nodeType === 1 ? node : node.parentElement;
      session.focus = { el, kind: atEnd ? 'end' : 'start' };
      return;
    }
    try {
      const p = view.posAtDOM(node, atEnd ? node.childNodes.length : 0);
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(p), atEnd ? -1 : 1)));
      view.focus();
    } catch { /* élément hors du moteur */ }
  }

  // Objet retrouvé : l'élément donné s'il est encore affiché par le moteur, sinon l'objet sélectionné.
  const live = (obj) => (posOf(obj) !== null ? obj : selectedDom());

  function removeObject(obj) {
    if (session) end();
    obj = live(obj);
    const pos = posOf(obj);
    if (pos === null) return;
    const node = view.state.doc.nodeAt(pos);
    const tr = view.state.tr;
    if (node.isBlock && tr.doc.resolve(pos).depth === 0 && tr.doc.childCount === 1) tr.replaceWith(pos, pos + node.nodeSize, emptyPara());
    else tr.delete(pos, pos + node.nodeSize);
    const at = Math.min(tr.mapping.map(pos), tr.doc.content.size);
    tr.setSelection(node.isInline ? TextSelection.create(tr.doc, at) : Selection.near(tr.doc.resolve(at), 1));
    view.dispatch(step(tr).scrollIntoView());
    view.focus();
  }

  // ----- Poser un bloc -----

  // Une ligne de texte après le bloc, pour pouvoir continuer à écrire.
  function ensureLineAfter(tr, pos) {
    const node = tr.doc.nodeAt(pos);
    const end = pos + node.nodeSize;
    const next = tr.doc.resolve(end).nodeAfter;
    if (!next || !next.isTextblock) tr.insert(end, emptyPara());
    return end + 1;
  }

  // Insère un objet préparé (image, schéma) à l'endroit du curseur ; le curseur passe à la ligne qui le suit.
  function insertBlockObject(el) {
    if (session) {
      if (session.records.length) end();
      else cancel();
    }
    const node = window.FTSchema.parse(el.outerHTML).firstChild;
    if (!node) return;
    const tr = view.state.tr;
    const ds = window.getSelection();
    if (ds.rangeCount && mount.contains(ds.anchorNode) && !view.hasFocus()) {
      try { tr.setSelection(Selection.near(tr.doc.resolve(view.posAtDOM(ds.anchorNode, ds.anchorOffset)))); } catch { /* sélection du moteur */ }
    }
    const pos = window.FTBlocs.placeBlock(tr, node);
    const next = ensureLineAfter(tr, pos);
    tr.setSelection(Selection.near(tr.doc.resolve(next), 1));
    view.dispatch(step(tr).scrollIntoView());
    view.focus();
    inserted.set(el, node);
  }

  // Pose un bloc à l'endroit indiqué, pendant un geste (layout.js : objet qui redevient un bloc).
  const SPLITTABLE = TEXT;
  const isBlank = (r) => r.toString().replace(/[\s​]/g, '') === '' && !r.cloneContents().querySelector('img, .ft-image, .ft-math, sup.ft-fn-ref');
  function placeBlockAt(el, range) {
    let top = range && mount.contains(range.startContainer) ? topBlock(range.startContainer) : null;
    if (top && (top.nodeType !== 1 || top.classList.contains('ft-footnotes'))) top = null;
    if (!top) {
      const notes = mount.querySelector(':scope > .ft-footnotes');
      if (notes) notes.before(el);
      else mount.appendChild(el);
      return;
    }
    const before = document.createRange();
    before.setStart(top, 0);
    before.setEnd(range.startContainer, range.startOffset);
    if (!top.matches(SPLITTABLE) || top.matches(OBJECTS)) {
      if (isBlank(before)) top.before(el);
      else top.after(el);
      return;
    }
    const rest = document.createRange();
    rest.setStart(range.startContainer, range.startOffset);
    rest.setEnd(top, top.childNodes.length);
    if (isBlank(before) && isBlank(rest)) top.replaceWith(el);
    else if (isBlank(before)) top.before(el);
    else if (isBlank(rest)) top.after(el);
    else {
      const tail = top.cloneNode(false);
      tail.removeAttribute('id');
      for (const k of ['bm', 'lettrine', 'pgStart']) delete tail.dataset[k];
      tail.appendChild(rest.extractContents());
      top.after(el, tail);
    }
  }

  // ----- Poignée à gauche de l'objet survolé -----

  // Objets qui ont une poignée : ceux du texte et des zones en colonnes, parmi les blocs affichés
  // (recherchés à chaque mouvement de la souris : seuls les blocs affichés sont parcourus).
  function handleObjects() {
    const out = [];
    for (const b of mount.children) {
      if (b.hasAttribute(FAR)) continue;
      if (isZone(b)) {
        for (const c of b.children) if (c.matches(OBJECTS)) out.push(c);
      } else if (b.matches(OBJECTS)) out.push(b);
    }
    return out;
  }
  const isLocked = (obj) => !!(L() && L().isLocked(obj));

  function placeHandle(obj) {
    const r = pageRect(obj);
    const beside = isFree(obj) || isBeside(obj);
    handle.style.left = (beside ? r.left : pageRect(mount).left) - 30 + 'px';
    handle.style.top = r.top + Math.min(r.height / 2, 14) - 12 + 'px';
    const locked = isLocked(obj);
    handle.classList.toggle('locked', locked);
    handle.title = locked ? 'Cliquer pour sélectionner' : 'Cliquer pour sélectionner, glisser pour déplacer';
  }

  page.addEventListener('mousemove', (e) => {
    if (dragging || session) return;
    const ed = mount.getBoundingClientRect();
    let found = null;
    if (e.clientX >= ed.left - 40 && e.clientX <= ed.right) {
      for (const obj of handleObjects()) {
        const r = obj.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        if (e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) { found = obj; break; }
      }
    }
    if (found !== hoverObj) {
      hoverObj = found;
      handle.hidden = !found;
    }
    if (found) placeHandle(found);
  });
  page.addEventListener('mouseleave', () => { if (!dragging) { hoverObj = null; handle.hidden = true; } });

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hoverObj) return;
    e.preventDefault();
    const obj = hoverObj;
    if (!(L() && L().startDrag(obj, e))) startBlockDrag(obj, e);
  });

  // Blocs entre lesquels un objet peut être déposé (ceux des zones en colonnes compris).
  const dropBlocks = () => [...mount.children]
    .flatMap((b) => (isZone(b) ? [...b.children] : [b]))
    .filter((b) => !b.hasAttribute(FAR) && !b.classList.contains('ft-footnotes') && !b.classList.contains('ft-pg-gap') && !(b.matches(OBJECTS) && (isFree(b) || isBeside(b))));

  // Glisser un objet entre les blocs du texte : il change de place pendant le geste.
  // onStart : appelé quand l'objet change de place pour la première fois (layout.js).
  function startBlockDrag(obj, e, onStart) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const from = obj.parentNode;
    let moved = false;
    let last = null;
    let raf = 0;
    if (!session) selectObject(obj);

    function step() {
      raf = 0;
      let best = null;
      for (const b of dropBlocks()) {
        if (b === obj) continue;
        const r = b.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) continue;
        for (const [y, isAfter] of [[r.top, false], [r.bottom, true]]) {
          const d = Math.abs(last.clientY - y);
          if (!best || d < best.d) best = { d, target: b, after: isAfter };
        }
      }
      if (!best) return;
      if ((best.after ? best.target.nextElementSibling : best.target.previousElementSibling) === obj) return;
      if (!moved) {
        moved = true;
        begin();
        if (onStart) onStart();
      }
      if (best.after) best.target.after(obj);
      else best.target.before(obj);
      placeHandle(obj);
      session.focus = { el: obj, kind: 'node' };
      placeFrame();
    }

    function onMove(ev) {
      if (!dragging && Math.abs(ev.clientY - y0) < 5 && Math.abs(ev.clientX - x0) < 5) return;
      if (!dragging) {
        dragging = true;
        handle.classList.add('dragging');
        document.body.classList.add('ft-dragging');
      }
      last = ev;
      if (!raf) raf = requestAnimationFrame(step);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (raf) { cancelAnimationFrame(raf); step(); }
      handle.classList.remove('dragging');
      document.body.classList.remove('ft-dragging');
      dragging = false;
      if (moved) {
        if (isZone(from) && !from.firstElementChild) from.remove();
        const next = obj.nextElementSibling;
        if (obj.tagName === 'TABLE' && (!next || next.classList.contains('ft-footnotes'))) {
          const p = document.createElement('p');
          p.appendChild(document.createElement('br'));
          obj.after(p);
        }
        session.focus = { el: obj, kind: 'node' };
        end();
      } else {
        selectObject(obj);
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ----- Touches et souris -----

  // Légende d'image, champ de la page de titre : écrits directement dans l'affichage.
  const CAPTION = '.ft-caption, .ft-cover-field';
  const inCaption = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest(CAPTION));
  };

  // Curseur juste après l'objet : dans la ligne pour une image du texte, sinon au début du bloc suivant.
  function caretAfter(sel) {
    const tr = view.state.tr;
    if (sel.node.isInline) {
      tr.setSelection(TextSelection.create(tr.doc, sel.to));
    } else {
      const next = tr.doc.resolve(sel.to).nodeAfter;
      if (!next || !next.isTextblock) tr.insert(sel.to, emptyPara());
      tr.setSelection(TextSelection.create(tr.doc, sel.to + 1));
    }
    view.dispatch(tr.scrollIntoView());
  }

  // Alt+↑ / Alt+↓ : l'objet passe avant le bloc d'avant, ou après le bloc d'après.
  function moveSelected(sel, up) {
    const $pos = view.state.doc.resolve(sel.from);
    const parent = $pos.parent;
    const index = $pos.index();
    const other = up ? (index > 0 ? parent.child(index - 1) : null) : (index + 1 < parent.childCount ? parent.child(index + 1) : null);
    if (!other) return;
    const node = sel.node;
    const tr = view.state.tr.delete(sel.from, sel.to);
    const at = up ? sel.from - other.nodeSize : sel.from + other.nodeSize;
    tr.insert(at, node);
    // Un tableau en fin de texte garde une ligne après lui.
    if (node.type === N.table && $pos.depth === 0 && at + node.nodeSize === tr.doc.content.size) tr.insert(at + node.nodeSize, emptyPara());
    tr.setSelection(NodeSelection.create(tr.doc, at));
    view.dispatch(step(tr).scrollIntoView());
  }

  // Objet de texte (tableau, encadré, repère, bloc de code…) qui contient toute la sélection : le plus proche.
  function objectAround(sel) {
    const { $from, to } = sel;
    for (let d = $from.depth; d > 0; d--) {
      const at = $from.before(d);
      if (to > at + $from.node(d).nodeSize) continue;
      const dom = view.nodeDOM(at);
      if (isObjectEl(dom)) return dom;
    }
    return null;
  }

  const POPUPS = '.context-menu:not([hidden]), #context-submenu:not([hidden]), .ft-pop:not([hidden]), #color-pop:not([hidden]), [role="menu"]:not([hidden]), [role="listbox"]:not([hidden]), dialog[open]';
  const popupOpen = () => [...document.querySelectorAll(POPUPS)].some((el) => el.getClientRects().length > 0);

  function objectKey(v, e) {
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection)) {
      if (session || e.ctrlKey || e.metaKey || e.altKey) return false;
      const T = PM.tables;
      // Toutes les cases d'un tableau sélectionnées : Suppr retire le tableau.
      if ((e.key === 'Delete' || e.key === 'Backspace') && T && sel instanceof T.CellSelection && sel.isRowSelection() && sel.isColSelection()) {
        const table = v.nodeDOM(sel.$anchorCell.before(sel.$anchorCell.depth - 1));
        if (!isObjectEl(table)) return false;
        removeObject(table);
        e.preventDefault();
        return true;
      }
      // Échap dans le texte d'un objet : l'objet entier est sélectionné (Suppr le retire ensuite).
      // (Pas quand Échap ferme d'abord un menu ou une fenêtre ouverte.)
      if (e.key === 'Escape' && !e.shiftKey && !popupOpen()) {
        const obj = objectAround(sel);
        if (!obj) return false;
        selectObject(obj);
        e.preventDefault();
        return true;
      }
      return false;
    }
    const obj = v.nodeDOM(sel.from);
    if (!isObjectEl(obj)) return false;
    if (session) return true;
    if (e.ctrlKey || e.metaKey) return false;
    const inline = sel.node.isInline;
    const arrow = e.key.startsWith('Arrow');
    if (e.key === 'Delete' || e.key === 'Backspace') {
      removeObject(obj);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inline) {
      if (!isLocked(obj)) moveSelected(sel, e.key === 'ArrowUp');
    } else if (e.key === 'Escape' || arrow || e.key === 'Enter') {
      const before = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const tr = v.state.tr;
      if (inline) {
        tr.setSelection(TextSelection.create(tr.doc, before ? sel.from : sel.to));
      } else if (e.key === 'Enter') {
        tr.insert(sel.to, emptyPara());
        tr.setSelection(TextSelection.create(tr.doc, sel.to + 1));
      } else {
        const found = Selection.findFrom(tr.doc.resolve(before ? sel.from : sel.to), before ? -1 : 1, true);
        if (found && !(found instanceof NodeSelection)) tr.setSelection(found);
        else if (before) {
          tr.insert(sel.from, emptyPara());
          tr.setSelection(TextSelection.create(tr.doc, sel.from + 1));
        } else {
          tr.insert(sel.to, emptyPara());
          tr.setSelection(TextSelection.create(tr.doc, sel.to + 1));
        }
      }
      v.dispatch(tr.scrollIntoView());
    } else if (e.key.length === 1 && !e.altKey) {
      // La frappe continue juste après l'objet, sans l'effacer.
      caretAfter(sel);
      return false;
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  }

  // Vue des images : la légende (texte modifiable dans l'image) est écrite directement, sans le moteur
  // (relue à la fin, comme un geste).
  function imageView(node) {
    const base = node.type === N.image && V() ? V().keepView(node) : (() => {
      const { dom } = PM.model.DOMSerializer.renderSpec(document, node.type.spec.toDOM(node));
      let cur = node;
      return {
        dom,
        update(nw) {
          if (nw.type !== cur.type || nw.attrs.inner !== cur.attrs.inner || JSON.stringify(nw.attrs.a) !== JSON.stringify(cur.attrs.a)) return false;
          cur = nw;
          return true;
        }
      };
    })();
    // (Schéma : affiché avec les polices du logiciel qu'il emploie, diagram.js.)
    const fonts = () => { const img = base.dom.querySelector && base.dom.querySelector('img'); if (img && window.FTDiagram) window.FTDiagram.fontify(img); };
    fonts();
    return {
      dom: base.dom,
      update: (nw) => { const ok = base.update(nw); if (ok) fonts(); return ok; },
      stopEvent: (e) => inCaption(e.target),
      ignoreMutation: (m) => m.type !== 'selection' || inCaption(m.target)
    };
  }

  M.addPlugin(new Plugin({
    props: {
      nodeViews: { image: imageView, image_inline: imageView },
      handleKeyDown: objectKey,
      handleDOMEvents: {
        compositionstart(v) {
          const sel = v.state.selection;
          if (sel instanceof NodeSelection && isObjectEl(v.nodeDOM(sel.from))) caretAfter(sel);
          return false;
        },
        // Double-clic hors d'un mot : l'objet est sélectionné ; sur un schéma : il s'ouvre.
        dblclick(v, e) {
          if (inCaption(e.target)) return false;
          const diagram = e.target.closest && e.target.closest('.ft-image[data-diagram]');
          if (diagram && window.FTDiagram) {
            e.preventDefault();
            selectObject(diagram);
            window.FTDiagram.open(diagram);
            return true;
          }
          const obj = objectOf(e.target);
          if (!obj || e.target.closest('.ft-toc-label')) return false;
          if (e.target === obj || window.getSelection().toString().trim() === '') {
            e.preventDefault();
            selectObject(obj);
            return true;
          }
          return false;
        }
      }
    }
  }));

  // ----- Paragraphe coupé autour d'un tableau ou d'un encadré à côté du texte (layout.js) -----
  // Les deux morceaux (data-coupe, puis data-suite) se recollent dès qu'aucun objet ne les sépare plus
  // (objet supprimé, déplacé, remis entre les paragraphes).
  const bagOf = (n) => (n && n.attrs && n.attrs.a) || {};
  const has = (n, name) => n && bagOf(n)[name] !== undefined;
  const besideNode = (n) => !!n && /^(gauche|droite)$/.test(bagOf(n)['data-wrap'] || '');
  const without = (a, name) => {
    const out = { ...a };
    delete out[name];
    return out;
  };
  const dropAlignLast = (a) => (M.styleValue(a.style, 'text-align-last') ? M.withStyleAttr(a, 'text-align-last', '') : a);

  const posAt = (doc, i) => {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
    return pos;
  };

  function healCuts(tr, i0, i1) {
    let changed = false;
    // Morceaux côte à côte : recollés (le morceau d'après disparaît dans celui d'avant).
    for (let i = Math.min(i1, tr.doc.childCount - 2); i >= Math.max(0, i0); i--) {
      const a = tr.doc.child(i);
      const b = tr.doc.child(i + 1);
      if (!has(a, 'data-coupe') || !has(b, 'data-suite') || a.type !== b.type) continue;
      const pos = posAt(tr.doc, i);
      let attrs = without(bagOf(a), 'data-coupe');
      if (has(b, 'data-coupe')) attrs['data-coupe'] = '';
      else attrs = dropAlignLast(attrs);
      tr.join(pos + a.nodeSize);
      tr.setNodeMarkup(pos, null, { ...a.attrs, a: attrs });
      changed = true;
    }
    // Marques restées sans objet entre les deux morceaux : retirées.
    const doc = tr.doc;
    for (let i = Math.max(0, i0); i <= Math.min(i1, doc.childCount - 1); i++) {
      const a = doc.child(i);
      let attrs = bagOf(a);
      if (has(a, 'data-coupe') && !besideNode(i + 1 < doc.childCount ? doc.child(i + 1) : null)) attrs = dropAlignLast(without(attrs, 'data-coupe'));
      if (has(a, 'data-suite') && !(i > 1 && besideNode(doc.child(i - 1)) && has(doc.child(i - 2), 'data-coupe'))) attrs = without(attrs, 'data-suite');
      if (attrs === bagOf(a)) continue;
      tr.setNodeMarkup(posAt(tr.doc, i), null, { ...a.attrs, a: attrs });
      changed = true;
    }
    return changed;
  }

  M.addPlugin(new Plugin({
    appendTransaction(trs, oldState, newState) {
      if (!trs.some((t) => t.docChanged)) return null;
      const a = oldState.doc.content;
      const b = newState.doc.content;
      const start = a.findDiffStart(b);
      if (start === null) return null;
      const endPos = a.findDiffEnd(b);
      const doc = newState.doc;
      const i0 = doc.resolve(Math.min(start, doc.content.size)).index(0) - 2;
      const i1 = doc.resolve(Math.min(endPos ? endPos.b : doc.content.size, doc.content.size)).index(0) + 2;
      // Rien à recoller sans morceau de paragraphe coupé à cet endroit.
      let any = false;
      for (let i = Math.max(0, i0); i <= Math.min(i1, doc.childCount - 1); i++) if (has(doc.child(i), 'data-coupe') || has(doc.child(i), 'data-suite')) { any = true; break; }
      if (!any) return null;
      const tr = newState.tr;
      return healCuts(tr, i0, i1) ? tr : null;
    }
  }));

  // Encadré ou citation (clic droit, moteur/generes.js) : style, source, position, retirer, supprimer.
  function calloutMenu(box) {
    const quote = box.classList.contains('ft-quote');
    const own = window.FTBlocs.calloutItems(box);
    const bio = window.FTBio && window.FTBio.isBio(box);
    return [
      ...(bio ? [...window.FTBio.menuItems(box), '-'] : own.top),
      ...((L() && L().wrapMenu(box)) || []),
      '-',
      ...(bio ? [] : [own.remove]),
      { text: bio ? 'Supprimer le repère biographique' : quote ? 'Supprimer la citation et son texte' : "Supprimer l'encadré et son texte", danger: true, action: () => removeObject(box) }
    ];
  }

  // Légende : écrite comme un geste (relue quand on la quitte).
  mount.addEventListener('focusin', (e) => {
    if (!inCaption(e.target) || session) return;
    begin();
    session.caption = true;
  });
  mount.addEventListener('focusout', (e) => {
    if (!session || !session.caption || !inCaption(e.target)) return;
    const s = session;
    setTimeout(() => { if (session === s && !s.ending && !(document.activeElement && inCaption(document.activeElement))) end(); }, 0);
  });

  window.FTObjets = {
    // Pour layout.js (à la place de FTStructure) et diagram.js.
    checkpoint: begin,
    changed,
    edit,
    after,
    quiet,
    regen,
    selectObject,
    deselect,
    placeFrame,
    removeObject,
    startBlockDrag,
    insertBlockObject,
    placeBlockAt,
    placeCaret,
    // Après une fenêtre ou un panneau : le curseur du moteur revient dans la page (focus compris).
    restoreSelection() { view.focus(); },
    insertItems: (x, y) => window.FTStructure.insertItems(x, y),
    calloutMenu,
    objectOf,
    posOf,
    isZone,
    topBlock,
    pageRect,
    selected,
    onObjectChange(fn) { onObjectChange = fn; },
    // Pour le banc d'essai.
    busy: () => !!session,
    // Légende ou champ de la page de titre en cours d'écriture : relu tout de suite (enregistrement,
    // changement de document ; le curseur peut y être resté si l'on a cliqué hors du texte).
    finishCaption() { if (session && session.caption && !session.ending) end(); },
    // Document remplacé (ouverture, version restaurée) : un geste resté ouvert est abandonné, sans quoi il
    // serait défait sur l'affichage du nouveau document.
    abandon() { if (session) cancel(); },
    // Moteur 2.0 : les outils de layout.js travaillent sur la zone du moteur.
    start() {
      // Poignée et cadre des versions 1.x (ancienne zone) : remplacés par ceux-ci.
      for (const el of document.querySelectorAll('#block-handle, #object-frame')) if (el !== handle && el !== frame) el.remove();
      if (L()) L().useEngine(mount, window.FTObjets);
    }
  };
})();
