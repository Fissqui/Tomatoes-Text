// Images du texte (version 2.5) : chaque image a un type de déplacement, un ancrage, un centrage, une
// superposition et un encadrage (légende, cadre). Tout passe par le moteur (une étape d'annulation par geste).
//  - Déplacement par ligne : bloc entre deux paragraphes, ou entre deux lignes d'un paragraphe (coupé en deux
//    morceaux, qui se recollent quand l'image s'en va) ; le texte ne passe jamais à côté de l'image.
//  - Déplacement libre (par défaut) : l'image est accrochée au début d'une ligne ; le texte passe à côté
//    d'elle quand il y a la place (du côté le plus large), ou elle est posée devant ou derrière le texte.
//  - Ancrage mouvant (par défaut) : l'image suit le texte qui la précède. Ancrage fixe : elle reste au même
//    endroit de sa page ; le texte s'écoule autour d'elle (elle change de ligne d'accroche quand il bouge).
// Pendant un déplacement, l'image est cachée à sa place et un double est posé à l'endroit visé (décorations
// du moteur) : le texte s'écarte autour de lui au fil de la souris, sans rien changer au document.
// Dans le texte enregistré (span.ft-image, comme dans les versions d'avant) :
//   data-wrap    (rien) : par ligne ; « gauche » / « droite » : libre, le texte passe de l'autre côté ;
//                « devant » / « derriere » : libre, superposée au texte ; « ligne » : petite image dans la
//                ligne du texte (anciens documents, collages).
//   data-align   centrage : « gauche », « centre », « droite » (par ligne : centré sans attribut).
//   --mx         libre au niveau du texte : écart avec le bord (% de la largeur du paragraphe).
//   --dy         libre : écart entre le haut de la ligne d'accroche et le haut de l'image (px).
//   --x, --y     devant ou derrière le texte : écart avec la place de l'image dans sa ligne (px).
//   data-anchor="page", data-page, --fx, --fy : ancrage fixe (page à partir de 1, place dans sa zone de texte).
//   width (% de la largeur du texte), --ar (proportions choisies).
//   Encadrage : data-caption (haut, bas, gauche, droite), data-num (figure, schema), data-cap-style
//   (fig, num, perso, aucun), data-cap-label, data-cap-chap, data-cap-b, data-cap-i, data-caption-align,
//   --cap-f, --cap-s, --cap-c, data-caption-box (--cap-bc, --cap-bg) ; data-frame (plein, pointille,
//   tirets, double), --fw, --fc, --fr, --fp, data-frame-all (cadre autour de la légende aussi), data-shadow.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const { Plugin, PluginKey, NodeSelection, TextSelection, Selection } = PM.state;
  const { Decoration, DecorationSet } = PM.view;
  const N = schema.nodes;
  const mount = view.dom;
  const page = document.getElementById('page');
  const workspace = document.getElementById('workspace');
  const app = document.getElementById('app');
  const V = () => window.FTVisibles;
  const D = () => window.FTDecoupage;
  const step = (tr) => PM.history.closeHistory(tr);
  const zoom = () => mount.currentCSSZoom || 1;
  const KEY = new PluginKey('ft-images');
  const FIX = 'ftImagesFix';
  const LOOSE = /^(gauche|droite|devant|derriere)$/;
  const EDGE = 8; // px : à moins de cette distance du bord, l'image s'y colle
  const round1 = (n) => Math.round(n * 10) / 10;

  // ----- Lecture des attributs -----

  const isImg = (n) => !!n && (n.type === N.image || n.type === N.image_inline);
  const bagOf = (n) => (n && n.attrs && n.attrs.a) || {};
  const sv = (a, prop) => M.styleValue(a.style, prop);
  const withStyle = (a, prop, value) => M.withStyleAttr(a, prop, value);
  function put(a, name, value) {
    const o = { ...a };
    if (value === null || value === undefined || value === '' || value === false) delete o[name];
    else o[name] = value === true ? '' : String(value);
    return o;
  }
  function styles(a, props) {
    let o = a;
    for (const [k, v] of Object.entries(props)) o = withStyle(o, k, v === null || v === undefined ? '' : String(v));
    return o;
  }
  // Déplacement : « ligne » (par ligne), « libre », « texte » (dans la ligne du texte, anciens documents).
  function moveOf(a) {
    const w = a['data-wrap'];
    if (w === 'ligne') return 'texte';
    return w && LOOSE.test(w) ? 'libre' : 'ligne';
  }
  const layerOf = (a) => (a['data-wrap'] === 'devant' || a['data-wrap'] === 'derriere' ? a['data-wrap'] : 'niveau');
  // (Versions d'avant : « fixé sur la page » sans numéro de page, converti quand l'image est affichée.)
  const isFixed = (a) => a['data-anchor'] === 'page';
  const isLegacyFixed = (a) => a['data-anchor'] === 'page' && a['data-page'] === undefined;
  const widthOf = (a) => { const m = /^([\d.]+)%$/.exec(sv(a, 'width') || ''); return m ? Number(m[1]) : null; };
  const pct = (v) => { const m = /^(-?[\d.]+)%$/.exec(v || ''); return m ? Number(m[1]) : null; };
  // Centrage affiché : gauche, centre ou droite (ou rien : image placée librement à la souris).
  function alignOf(a) {
    const move = moveOf(a);
    if (move === 'ligne') return a['data-align'] === 'gauche' || a['data-align'] === 'droite' ? a['data-align'] : 'centre';
    if (a['data-align'] && /^(gauche|centre|droite)$/.test(a['data-align'])) return a['data-align'];
    if (layerOf(a) === 'niveau' && !sv(a, '--mx')) return a['data-wrap'];
    return '';
  }

  // Légende en cours d'écriture (texte modifiable dans l'image, relu par moteur/objets.js).
  const inCaption = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest('.ft-caption'));
  };

  // ----- Décorations : image cachée à sa place, double à l'endroit visé -----

  const ghostEl = document.createElement('span');
  ghostEl.setAttribute('contenteditable', 'false');
  let ghostSpec = null; // { pos, kind: 'block' | 'line' | 'inline' }
  let hidden = null;    // position de l'image cachée
  M.addPlugin(new Plugin({
    key: KEY,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const meta = tr.getMeta(KEY);
        if (meta) return meta.set;
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
      }
    },
    props: { decorations: (state) => KEY.getState(state) }
  }));
  function setDecos() {
    const doc = view.state.doc;
    const decos = [];
    if (hidden !== null) {
      const n = doc.nodeAt(hidden);
      if (isImg(n)) decos.push(Decoration.node(hidden, hidden + n.nodeSize, { class: 'ft-img-src' }));
    }
    if (ghostSpec) {
      decos.push(Decoration.widget(ghostSpec.pos, () => ghostEl, {
        side: ghostSpec.kind === 'block' ? -1 : 1,
        key: 'ft-img-ghost:' + ghostSpec.kind + ':' + ghostSpec.pos,
        ignoreSelection: true,
        stopEvent: () => true
      }));
    }
    const set = DecorationSet.create(doc, decos);
    view.dispatch(view.state.tr.setMeta(KEY, { set }).setMeta('addToHistory', false));
  }

  // ----- Où se trouve le texte -----

  const TEXTS = 'p, h1, h2, h3, h4, h5, h6';
  const isFar = (el) => !!el.closest('[data-pm-far]');
  // Paragraphe (ou titre) où une image libre peut s'accrocher : pas dans une légende, un plan, les notes…
  const NO_ANCHOR = '.ft-caption, .ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-footnotes, .ft-endnotes, .ft-biblio, pre, [contenteditable="false"], .ft-image';
  const anchorable = (el) => !!el && el.matches(TEXTS) && mount.contains(el) && !el.closest(NO_ANCHOR) && !!el.pmViewDesc && !!el.pmViewDesc.node;

  // Blocs affichés de premier niveau, dans l'ordre.
  function shownTops() {
    const out = [];
    for (const el of mount.children) {
      if (el.hasAttribute('data-pm-far') || !el.pmViewDesc || !el.pmViewDesc.node || el.classList.contains('ft-footnotes')) continue;
      out.push(el);
    }
    return out;
  }
  // Paragraphe sous la hauteur y (écran), en descendant dans les listes, encadrés, zones en colonnes.
  function textAt(y, x) {
    const tops = shownTops();
    let host = null;
    for (const el of tops) {
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      // (Entre deux blocs — marge, passage d'une page à l'autre — : au début du bloc qui suit.)
      if (y < r.top) { host = { el, before: true }; break; }
      host = { el, before: y > r.bottom ? 'after' : false };
      if (y <= r.bottom) break;
    }
    if (!host) return null;
    const top = host.el;
    if (host.before === true) return { top, block: top, before: true };
    if (host.before === 'after') return { top, block: top, after: true };
    // Le paragraphe du bloc qui contient y (le plus proche de x à cette hauteur).
    let best = null;
    const list = top.matches(TEXTS) ? [top] : [...top.querySelectorAll(TEXTS)];
    for (const el of list) {
      if (!anchorable(el) || el.closest('table')) continue;
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      if (y >= r.top - 1 && y <= r.bottom + 1) {
        const d = x === undefined ? 0 : x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (!best || d < best.d) best = { el, d };
      }
    }
    return { top, block: best ? best.el : top, inside: !!best };
  }
  // Début de la ligne du paragraphe à la hauteur y (écran) : { pos, top (écran) }.
  function lineAt(tb, y) {
    const desc = tb.pmViewDesc;
    const start = desc.posAtStart;
    const lines = D().linesOf(tb);
    if (!lines.length) return { pos: start, top: tb.getBoundingClientRect().top, index: 0, count: 0, height: 0 };
    let i = 0;
    while (i + 1 < lines.length && y >= (lines[i].bottom + lines[i + 1].top) / 2) i++;
    if (i === 0) return { pos: start, top: lines[0].top, index: 0, count: lines.length, height: lines[0].bottom - lines[0].top };
    const at = D().lineStart(tb, i);
    let pos = start;
    try {
      if (at) pos = at.offset < 0 ? view.posAtDOM(at.node.parentNode, [...at.node.parentNode.childNodes].indexOf(at.node)) : view.posAtDOM(at.node, at.offset);
    } catch { pos = start; }
    // (Les images déjà accrochées au début de la ligne restent devant celle qu'on pose.)
    return { pos, top: lines[i].top, index: i, count: lines.length, height: lines[i].bottom - lines[i].top };
  }
  // Fin de la ligne n° index (début de la suivante), ou fin du paragraphe.
  function lineEnd(tb, index) {
    const lines = D().linesOf(tb);
    if (index + 1 >= lines.length) return tb.pmViewDesc.posAtEnd;
    const at = D().lineStart(tb, index + 1);
    try {
      if (at) return at.offset < 0 ? view.posAtDOM(at.node.parentNode, [...at.node.parentNode.childNodes].indexOf(at.node)) : view.posAtDOM(at.node, at.offset);
    } catch { /* fin du paragraphe */ }
    return tb.pmViewDesc.posAtEnd;
  }
  // Largeur et bord gauche du texte d'un paragraphe (écran).
  function column(tb) {
    const r = tb.getBoundingClientRect();
    const cs = getComputedStyle(tb);
    const k = zoom();
    const l = r.left + (parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)) * k;
    const w = tb.clientWidth * k - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * k;
    return { left: l, width: Math.max(1, w), right: l + Math.max(1, w) };
  }
  function textColumn() {
    const r = mount.getBoundingClientRect();
    const cs = getComputedStyle(mount);
    const k = zoom();
    const l = r.left + parseFloat(cs.paddingLeft) * k;
    return { left: l, width: mount.clientWidth * k - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) * k, right: r.right - parseFloat(cs.paddingRight) * k };
  }
  // Bas du texte (écran) : bas du dernier bloc affiché du fil du texte.
  function textBottom() {
    const tops = shownTops();
    for (let i = tops.length - 1; i >= 0; i--) {
      const r = tops[i].getBoundingClientRect();
      if (r.height) return r.bottom;
    }
    return mount.getBoundingClientRect().top;
  }
  const lineHeight = (el) => {
    const cs = getComputedStyle(el || mount);
    return (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 24) * zoom();
  };
  // Mesure faite sans le double ni l'image cachée (le texte tel qu'il serait sans l'image).
  function bare(fn) {
    const was = ghostEl.style.display;
    view.domObserver.stop();
    ghostEl.style.display = 'none';
    try { return fn(); } finally { ghostEl.style.display = was; view.domObserver.start(); }
  }

  // ----- Poser l'image dans le texte (transactions) -----

  const emptyPara = (extra) => N.paragraph.create({ tag: 'p', a: extra || {}, bare: false });
  const SUITE_DROP = ['id', 'data-bm', 'data-pg-start', 'data-coupe', 'data-lettrine'];
  // Bloc posé à la position pos d'un paragraphe : avant ou après lui, ou entre ses deux morceaux s'il est
  // coupé là (data-coupe, data-suite : ils se recollent quand l'image s'en va). Renvoie la position du bloc.
  function placeBlock(tr, pos, block, justify) {
    let $p = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
    if ($p.parent.isTextblock) {
      const tb = $p.parent;
      const before = $p.before();
      const atStart = $p.parentOffset === 0 || !tb.textBetween(0, $p.parentOffset, '', (n) => (isImg(n) && LOOSE.test(bagOf(n)['data-wrap'] || '') ? '' : 'x')).length;
      const atEnd = $p.parentOffset === tb.content.size;
      const canSplit = tb.type === N.paragraph && $p.depth === 1 && !atStart && !atEnd;
      if (atStart) return insertAt(tr, before, block);
      if (!canSplit) return insertAt(tr, $p.after(), block);
      const a = tb.attrs.a || {};
      let tail = { ...a };
      for (const k of SUITE_DROP) delete tail[k];
      tail['data-suite'] = '';
      if (a['data-coupe'] !== undefined) tail['data-coupe'] = '';
      let head = { ...a, 'data-coupe': '' };
      // (Texte justifié : la dernière ligne du premier morceau reste justifiée, comme au milieu du paragraphe.)
      if (justify) head = withStyle(head, 'text-align-last', 'justify');
      tr.split($p.pos, 1, [{ type: tb.type, attrs: { ...tb.attrs, a: tail } }]);
      tr.setNodeMarkup(before, null, { ...tb.attrs, a: head });
      // (Entre les deux morceaux : juste après la fin du premier.)
      const at = $p.pos + 1;
      tr.insert(at, block);
      return at;
    }
    return insertAt(tr, pos, block);
  }
  // Bloc inséré à pos, ou au plus près où un bloc peut aller.
  function insertAt(tr, pos, block) {
    const $p = tr.doc.resolve(pos);
    for (let d = $p.depth; d >= 0; d--) {
      const at = d === $p.depth ? pos : $p.after(d + 1);
      const $a = tr.doc.resolve(at);
      if ($a.parent.canReplaceWith($a.index(), $a.index(), block.type)) {
        tr.insert(at, block);
        return at;
      }
    }
    const end = tr.doc.content.size;
    tr.insert(end, block);
    return end;
  }
  // Ligne pour continuer à écrire après une image posée en fin de texte.
  function lineAfter(tr, pos) {
    const node = tr.doc.nodeAt(pos);
    const end = pos + node.nodeSize;
    const next = tr.doc.resolve(end).nodeAfter;
    if (!next || !next.isTextblock) tr.insert(end, emptyPara());
  }

  // Attributs d'une image qui passe en déplacement par ligne / libre.
  const PLACE = ['--mx', '--dy', '--x', '--y'];
  function lineAttrs(a, align) {
    let o = styles(a, Object.fromEntries(PLACE.map((p) => [p, null])));
    o = put(o, 'data-wrap', null);
    const al = align || (o['data-wrap'] === undefined && a['data-wrap'] && /^(gauche|droite)$/.test(a['data-wrap']) ? a['data-wrap'] : alignOf(a));
    o = put(o, 'data-align', al === 'gauche' || al === 'droite' ? al : null);
    return o;
  }
  function freeAttrs(a, side, layer) {
    let o = styles(a, { '--x': null, '--y': null });
    o = put(o, 'data-wrap', layer && layer !== 'niveau' ? layer : side || 'gauche');
    return o;
  }

  // Image accrochée à pos (dans un paragraphe) : nouveau nœud dans la ligne.
  function inlineNode(a, inner) { return N.image_inline.create({ a, inner }); }
  function blockNode(a, inner) { return N.image.create({ a, inner }); }

  // ----- Image sélectionnée -----

  function selectedImage() {
    const sel = view.state.selection;
    if (!(sel instanceof NodeSelection) || !isImg(sel.node)) return null;
    const dom = view.nodeDOM(sel.from);
    return { pos: sel.from, node: sel.node, a: bagOf(sel.node), dom: dom && dom.nodeType === 1 ? dom : null };
  }
  const posOfDom = (el) => (window.FTObjets ? window.FTObjets.posOf(el) : null);
  function select(pos) {
    const n = view.state.doc.nodeAt(pos);
    if (!isImg(n)) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    if (!view.hasFocus()) view.focus();
  }

  // Applique un changement d'attributs (une étape d'annulation), l'image reste sélectionnée.
  function change(pos, fn, opts = {}) {
    const node = view.state.doc.nodeAt(pos);
    if (!isImg(node)) return;
    const a = fn(bagOf(node), node);
    if (!a) return;
    const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, a });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    view.dispatch(opts.merge ? tr : step(tr));
    after(pos, opts);
  }
  // Après un changement : l'image reste en vue et sélectionnée ; correction de sa place (devant/derrière).
  function after(pos, opts = {}) {
    if (opts.want) settle(opts.want);
    placeTools();
    if (popOpen()) buildPop();
  }

  // Place voulue (écran) d'une image devant ou derrière le texte, ou libre : écarts corrigés après coup (la
  // place d'une image dans sa ligne n'est connue qu'une fois affichée). Fondu dans la même étape d'annulation.
  function settle(want) {
    for (let pass = 0; pass < 2; pass++) {
      const cur = selectedImage();
      if (!cur || !cur.dom) return;
      const r = cur.dom.getBoundingClientRect();
      const k = zoom();
      const dx = (want.left - r.left) / k;
      const dy = (want.top - r.top) / k;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      const a = cur.a;
      let o = a;
      if (layerOf(a) !== 'niveau') {
        o = styles(a, { '--x': Math.round((parseFloat(sv(a, '--x')) || 0) + dx) + 'px', '--y': Math.round((parseFloat(sv(a, '--y')) || 0) + dy) + 'px' });
      } else if (moveOf(a) === 'libre') {
        const nd = Math.max(0, Math.round((parseFloat(sv(a, '--dy')) || 0) + dy));
        o = styles(a, { '--dy': nd + 'px' });
      } else return;
      if (o === a) return;
      const tr = view.state.tr.setNodeMarkup(cur.pos, null, { ...cur.node.attrs, a: o });
      tr.setSelection(NodeSelection.create(tr.doc, cur.pos));
      view.dispatch(tr);
    }
  }

  // ----- Les cinq réglages -----

  // 1. Type de déplacement.
  function setMove(move) {
    const cur = selectedImage();
    if (!cur || moveOf(cur.a) === move) return;
    const r = cur.dom ? cur.dom.getBoundingClientRect() : null;
    const tr = view.state.tr;
    const { pos, node, a } = cur;
    let at;
    if (move === 'ligne') {
      const block = blockNode(lineAttrs(a), node.attrs.inner);
      if (node.type === N.image) {
        tr.setNodeMarkup(pos, null, { ...node.attrs, a: block.attrs.a });
        at = pos;
      } else {
        tr.delete(pos, pos + node.nodeSize);
        at = placeBlock(tr, pos, block, justified(cur.dom && cur.dom.parentElement));
      }
      lineAfterIfLast(tr, at);
    } else {
      // Libre : accrochée au début du paragraphe qui suit sa place (ou de la ligne où elle était).
      const al = alignOf(a);
      const side = al === 'droite' ? 'droite' : 'gauche';
      let o = freeAttrs(styles(a, { '--dy': null }), side);
      o = put(o, 'data-align', al === 'centre' ? 'centre' : al || null);
      if (al === 'centre') o = withStyle(o, '--mx', round1((100 - (widthOf(o) || 50)) / 2) + '%');
      const inl = inlineNode(o, node.attrs.inner);
      if (node.type === N.image_inline) {
        tr.setNodeMarkup(pos, null, { ...node.attrs, a: o });
        at = pos;
      } else {
        tr.delete(pos, pos + node.nodeSize);
        at = anchorAfter(tr, pos);
        tr.insert(at, inl);
      }
    }
    tr.setSelection(NodeSelection.create(tr.doc, at));
    view.dispatch(step(tr).scrollIntoView());
    if (move === 'libre' && r) keepFixed();
    after(at);
  }
  // Paragraphe où accrocher une image libre posée à pos (entre deux blocs) : le début du paragraphe qui suit
  // (ou du précédent, en fin de texte ; une ligne vide est ajoutée s'il n'y en a pas).
  function anchorAfter(tr, pos) {
    const $p = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
    if ($p.parent.isTextblock && $p.parent.type !== N.code_block) return pos;
    const found = Selection.findFrom($p, 1, true);
    if (found && found instanceof TextSelection && found.$from.parent.isTextblock && found.$from.parent.type !== N.code_block && found.$from.parentOffset === 0) return found.from;
    const at = Math.min(pos, tr.doc.content.size);
    const p = emptyPara();
    const ins = insertAt(tr, at, p);
    return ins + 1;
  }
  function lineAfterIfLast(tr, at) {
    const $a = tr.doc.resolve(at);
    if ($a.depth === 0) lineAfter(tr, at);
  }
  const justified = (el) => !!el && el.nodeType === 1 && getComputedStyle(el).textAlign === 'justify';

  // 2. Ancrage.
  function setAnchor(fixed) {
    const cur = selectedImage();
    if (!cur || isFixed(cur.a) === fixed) return;
    if (!fixed) {
      // (L'image reste où elle est.)
      const want = cur.dom ? cur.dom.getBoundingClientRect() : null;
      change(cur.pos, (a) => styles(put(put(a, 'data-anchor', null), 'data-page', null), { '--fx': null, '--fy': null }), want ? { want } : {});
      return;
    }
    const spot = pageSpot(cur.dom);
    if (!spot) return;
    change(cur.pos, (a) => styles(put(put(a, 'data-anchor', 'page'), 'data-page', spot.page + 1), { '--fx': Math.round(spot.fx) + 'px', '--fy': Math.round(spot.fy) + 'px' }));
  }
  // Page et place (dans sa zone de texte) du coin haut gauche d'un élément.
  function pageSpot(dom, rect) {
    if (!dom || !V() || !V().pageFrame) return null;
    const r = rect || dom.getBoundingClientRect();
    const k = zoom();
    const m = mount.getBoundingClientRect();
    const y = (r.top - m.top) / k;
    const p = V().pageOfY(y);
    const f = V().pageFrame(p);
    const col = textColumn();
    return { page: p, fy: y - f.ct, fx: (r.left - col.left) / k };
  }

  // 3. Centrage.
  function setAlign(al) {
    const cur = selectedImage();
    if (!cur) return;
    const a = cur.a;
    const move = moveOf(a);
    if (move === 'ligne' || move === 'texte') {
      change(cur.pos, (o) => put(o, 'data-align', al === 'centre' ? null : al));
      return;
    }
    if (layerOf(a) === 'niveau') {
      change(cur.pos, (o) => {
        let x = put(o, 'data-wrap', al === 'droite' ? 'droite' : 'gauche');
        x = put(x, 'data-align', al);
        x = withStyle(x, '--mx', al === 'centre' ? round1((100 - (widthOf(x) || 50)) / 2) + '%' : '');
        return x;
      });
      keepFixed();
      return;
    }
    // Devant ou derrière : à gauche, au centre ou à droite du texte, à la même hauteur.
    if (!cur.dom) return;
    const r = cur.dom.getBoundingClientRect();
    const col = textColumn();
    const left = al === 'gauche' ? col.left : al === 'droite' ? col.right - r.width : col.left + (col.width - r.width) / 2;
    change(cur.pos, (o) => put(o, 'data-align', al), { want: { left, top: r.top } });
    keepFixed();
  }

  // 4. Superposition (déplacement libre seulement).
  function setLayer(layer) {
    const cur = selectedImage();
    if (!cur || moveOf(cur.a) !== 'libre' || layerOf(cur.a) === layer) return;
    const r = cur.dom ? cur.dom.getBoundingClientRect() : null;
    if (layer === 'niveau') {
      // Retour au niveau du texte : du côté où elle se trouve, à la même distance du bord.
      let side = 'gauche';
      let mx = null;
      if (r && cur.dom.parentElement) {
        const col = column(cur.dom.parentElement);
        side = r.left + r.width / 2 > col.left + col.width / 2 ? 'droite' : 'gauche';
        const gap = side === 'gauche' ? r.left - col.left : col.right - r.right;
        if (gap > EDGE) mx = round1(Math.min(100, (gap / col.width) * 100)) + '%';
      }
      change(cur.pos, (a) => {
        let o = styles(a, { '--x': null, '--y': null, '--mx': mx, '--dy': null });
        o = put(o, 'data-wrap', side);
        if (o['data-align'] === 'centre' || mx) o = put(o, 'data-align', null);
        return o;
      });
      keepFixed();
      return;
    }
    // Devant ou derrière : au même endroit de la page.
    change(cur.pos, (a) => styles(put(a, 'data-wrap', layer), { '--mx': null, '--dy': null }), r ? { want: { left: r.left, top: r.top } } : {});
    keepFixed();
  }

  // Taille : largeur en %, proportions d'origine.
  function setWidth(p) {
    const cur = selectedImage();
    if (!cur) return;
    change(cur.pos, (a) => {
      let o = withStyle(a, 'width', p + '%');
      if (o['data-align'] === 'centre' && layerOf(o) === 'niveau' && moveOf(o) === 'libre') o = withStyle(o, '--mx', round1((100 - p) / 2) + '%');
      // (L'image reste dans la largeur du texte.)
      const mx = pct(sv(o, '--mx'));
      if (mx !== null && mx + p > 100) o = withStyle(o, '--mx', round1(Math.max(0, 100 - p)) + '%');
      return o;
    });
  }
  function resetRatio() {
    const cur = selectedImage();
    if (cur) change(cur.pos, (a) => withStyle(a, '--ar', ''));
  }
  function remove() {
    const cur = selectedImage();
    if (cur && window.FTObjets) window.FTObjets.removeObject(cur.dom);
  }

  // Image à ancrage fixe déplacée ou réglée : sa nouvelle place devient sa place sur la page.
  function keepFixed() {
    const cur = selectedImage();
    if (!cur || !isFixed(cur.a) || !cur.dom) return;
    if (isLegacyFixed(cur.a)) { convertLegacy({ node: cur.node }); return; }
    const spot = pageSpot(cur.dom);
    if (!spot) return;
    const a = cur.a;
    let o = put(a, 'data-page', spot.page + 1);
    o = styles(o, { '--fx': Math.round(spot.fx) + 'px', '--fy': Math.round(spot.fy) + 'px' });
    if (JSON.stringify(o) === JSON.stringify(a)) return;
    const tr = view.state.tr.setNodeMarkup(cur.pos, null, { ...cur.node.attrs, a: o });
    tr.setSelection(NodeSelection.create(tr.doc, cur.pos));
    view.dispatch(tr);
  }

  // ----- Insertion -----

  // Nouvelle image (élément préparé par layout.js) au curseur : déplacement libre, accrochée au début de la
  // ligne du curseur, du côté gauche ; elle est sélectionnée. at : { x, y } (écran) pour un dépôt à la souris.
  function insert(el, at) {
    const html = el.outerHTML;
    let node0 = null;
    window.FTSchema.parse(html).descendants((n) => { if (!node0 && isImg(n)) node0 = n; return !node0; });
    if (!node0) return null;
    let a = bagOf(node0);
    const inner = node0.attrs.inner;
    a = put(a, 'contenteditable', 'false');
    let tr = view.state.tr;
    let pos = null;
    if (at) {
      const spot = bare(() => aimFree(at.x, at.y, at.x, at.y, null));
      if (spot && spot.kind === 'line') {
        a = freeAttrs(a, spot.side);
        if (spot.mx) a = withStyle(a, '--mx', spot.mx + '%');
        pos = spot.pos;
      } else if (spot && spot.kind === 'end') {
        a = freeAttrs(a, spot.side);
        if (spot.mx) a = withStyle(a, '--mx', spot.mx + '%');
        pos = fillTo(tr, spot);
      }
    }
    if (pos === null) {
      a = freeAttrs(a, 'gauche');
      pos = caretAnchor(tr);
    }
    tr.insert(pos, inlineNode(a, inner));
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    view.dispatch(step(tr).scrollIntoView());
    view.focus();
    return pos;
  }
  // Début de la ligne du curseur (une ligne vide est créée si le curseur n'est pas dans un paragraphe).
  function caretAnchor(tr) {
    const sel = tr.selection;
    const ds = window.getSelection();
    if (ds.rangeCount && mount.contains(ds.anchorNode) && !view.hasFocus()) {
      try { tr.setSelection(Selection.near(tr.doc.resolve(view.posAtDOM(ds.anchorNode, ds.anchorOffset)))); } catch { /* sélection du moteur */ }
    }
    const $h = tr.selection.$head;
    if (!(tr.selection instanceof TextSelection) || !$h.parent.isTextblock || $h.parent.type === N.code_block || inNoAnchor($h)) {
      const end = sel instanceof NodeSelection ? sel.to : $h.after(1);
      const p = emptyPara();
      const at = insertAt(tr, Math.min(end, tr.doc.content.size), p);
      return at + 1;
    }
    if (!tr.selection.empty) tr.deleteSelection();
    const head = tr.selection.head;
    // Début de la ligne affichée du curseur.
    try {
      const dom = view.domAtPos(head);
      let tb = dom.node.nodeType === 1 ? dom.node : dom.node.parentElement;
      tb = tb && tb.closest(TEXTS);
      if (tb && view.state.doc === tr.doc) {
        const c = view.coordsAtPos(head);
        const l = lineAt(tb, (c.top + c.bottom) / 2);
        if (l.pos <= head) return l.pos;
      }
    } catch { /* début du paragraphe */ }
    return tr.selection.$head.start();
  }
  function inNoAnchor($p) {
    for (let d = $p.depth; d > 0; d--) {
      const n = $p.node(d);
      const cls = (n.attrs && n.attrs.a && n.attrs.a.class) || '';
      if (/\bft-(footnotes|endnotes|biblio)\b/.test(cls)) return true;
    }
    return false;
  }

  // ----- Viser un endroit du texte (déplacement à la souris, dépôt d'un fichier) -----

  // Libre : la ligne du haut de l'image, le côté, l'écart avec le bord. x, y : coin haut gauche de l'image
  // (écran) ; px, py : pointeur. Renvoie { kind: 'line', pos, top, side, mx, dy, tb } ou { kind: 'end', … }.
  function aimFree(x, y, px, py, size) {
    const w = size ? size.w : 0;
    const h = textAt(y + 2, px);
    const bottom = textBottom();
    if (!h || h.after || y > bottom) {
      // Sous le texte : des lignes vides jusque-là.
      const col = textColumn();
      const sd = side(x, w, col);
      return { kind: 'end', top: Math.max(y, bottom), y, side: sd.side, mx: sd.mx, col };
    }
    let tb = h.inside ? h.block : null;
    if (!tb) {
      // Au-dessus du premier bloc ou sur un objet : le paragraphe le plus proche après lui.
      const list = shownTops();
      let k = list.indexOf(h.top);
      if (h.before === true) k = Math.max(0, k);
      for (; k < list.length && !tb; k++) {
        const el = list[k];
        if (anchorable(el)) tb = el;
        else if (!el.matches('table, .ft-image, pre, .ft-toc, .ft-lof, .ft-index, .ft-cover')) tb = [...el.querySelectorAll(TEXTS)].find((e) => anchorable(e) && !e.closest('table')) || null;
      }
      if (!tb) return { kind: 'end', top: bottom, y, ...side(x, w, textColumn()), col: textColumn() };
    }
    const l = lineAt(tb, Math.max(y + 2, tb.getBoundingClientRect().top));
    const col = column(tb);
    const sd = side(x, w, col);
    return { kind: 'line', pos: l.pos, top: l.top, side: sd.side, mx: sd.mx, dy: Math.max(0, (y - l.top) / zoom()), tb, col };
  }
  function side(x, w, col) {
    const sd = x + w / 2 <= col.left + col.width / 2 ? 'gauche' : 'droite';
    let gap = sd === 'gauche' ? x - col.left : col.right - (x + w);
    gap = Math.max(0, Math.min(col.width - w, gap));
    if (gap < EDGE) gap = 0;
    return { side: sd, mx: gap ? round1((gap / col.width) * 100) : 0 };
  }
  // Par ligne : entre deux paragraphes ou entre deux lignes. y : pointeur (écran). Renvoie { pos, kind:
  // 'block' (entre deux blocs) | 'split' (dans un paragraphe), top } ou null.
  function aimLine(y, x) {
    const h = textAt(y, x);
    if (!h) return null;
    if (h.after) {
      // Sous le texte : après le dernier bloc.
      const d = h.top.pmViewDesc;
      return { pos: d.posAfter, kind: 'block', end: true };
    }
    if (h.before === true) return { pos: h.top.pmViewDesc.posBefore, kind: 'block' };
    const el = h.inside ? h.block : h.top;
    const r = el.getBoundingClientRect();
    if (!h.inside || !el.matches('p')) {
      // Titre, tableau, objet : avant ou après lui, selon la moitié visée.
      const d = (h.inside ? el : h.top).pmViewDesc;
      return { pos: y < r.top + r.height / 2 ? d.posBefore : d.posAfter, kind: 'block' };
    }
    // Paragraphe : avant la ligne visée (moitié haute) ou après elle.
    const l = lineAt(el, y);
    const desc = el.pmViewDesc;
    if (!l.count) return { pos: y < r.top + r.height / 2 ? desc.posBefore : desc.posAfter, kind: 'block' };
    const lower = y > l.top + l.height / 2;
    const index = l.index + (lower ? 1 : 0);
    if (index === 0) return { pos: desc.posBefore, kind: 'block' };
    if (index >= l.count) return { pos: desc.posAfter, kind: 'block' };
    const pos = lower ? lineEnd(el, l.index) : l.pos;
    return { pos, kind: 'split', el };
  }

  // Lignes vides créées sous le texte pour une image posée plus bas (marquées : retirées si l'image remonte
  // et qu'on n'y a rien écrit). Renvoie la position d'accroche (début de la dernière ligne créée).
  const AUTO = 'data-ligne-image';
  function fillTo(tr, spot) {
    // (Pas d'une ligne vide : hauteur de ligne et écart entre paragraphes.)
    const probe = mount.querySelector(':scope > p') || mount;
    const pcs = getComputedStyle(probe);
    const lh = lineHeight(probe) + Math.max(parseFloat(pcs.marginTop) || 0, parseFloat(pcs.marginBottom) || 0) * zoom();
    const count = Math.max(0, Math.min(200, Math.floor((spot.y - textBottom()) / lh)));
    // (Avant les notes de fin de document.)
    let end = tr.doc.content.size;
    const last = tr.doc.lastChild;
    if (last && /\bft-(footnotes|endnotes)\b/.test((last.attrs.a && last.attrs.a.class) || '')) end -= last.nodeSize;
    const paras = [];
    for (let i = 0; i <= count; i++) paras.push(emptyPara({ [AUTO]: '' }));
    tr.insert(end, paras);
    return end + (paras.length - 1) * 2 + 1;
  }
  // Lignes vides créées pour une image, restées vides et en fin de texte, sans image : retirées.
  function dropAutoLines(tr) {
    const doc = tr.doc;
    let end = doc.childCount;
    let from = null;
    let pos = doc.content.size;
    for (let i = doc.childCount - 1; i >= 0; i--) {
      const n = doc.child(i);
      pos -= n.nodeSize;
      if (/\bft-(footnotes|endnotes)\b/.test((n.attrs.a && n.attrs.a.class) || '')) { end = i; continue; }
      if (i >= end) continue;
      if (n.type === N.paragraph && bagOf(n)[AUTO] !== undefined && n.childCount === 0) from = pos;
      else break;
    }
    if (from === null) return;
    let to = from;
    for (let i = doc.resolve(from).index(0); i < end; i++) to += doc.child(i).nodeSize;
    // (Une ligne reste au bout du texte.)
    const keepOne = doc.resolve(from).index(0) === 0;
    if (to > from && !keepOne) tr.delete(from, to);
  }

  // ----- Déplacer à la souris -----

  let gesture = null; // geste en cours

  function startMove(cur, e) {
    const a = cur.a;
    const move = moveOf(a);
    const dom = cur.dom;
    const r0 = dom.getBoundingClientRect();
    gesture = {
      kind: 'move', pos: cur.pos, node: cur.node, a, move, layer: layerOf(a), dom,
      x0: e.clientX, y0: e.clientY, gx: e.clientX - r0.left, gy: e.clientY - r0.top,
      w: r0.width, h: r0.height, started: false, last: e, raf: 0, target: null, scroll: 0
    };
    window.addEventListener('mousemove', onMoveMove, true);
    window.addEventListener('mouseup', onMoveUp, true);
  }
  function onMoveMove(e) {
    const g = gesture;
    if (!g || g.kind !== 'move') return;
    g.last = e;
    if (!g.started) {
      if (Math.abs(e.clientX - g.x0) < 4 && Math.abs(e.clientY - g.y0) < 4) return;
      g.started = true;
      beginMove(g);
    }
    if (!g.raf) g.raf = requestAnimationFrame(() => { g.raf = 0; moveFrame(g); });
  }
  function beginMove(g) {
    document.body.classList.add('ft-dragging', 'ft-img-gesture');
    hideTools();
    closePop();
    if (g.layer !== 'niveau' && g.move === 'libre') {
      // Devant ou derrière : l'image suit la souris, le texte ne bouge pas.
      g.free = true;
      return;
    }
    // Double de l'image (mêmes attributs), posé à l'endroit visé ; l'image est cachée à sa place.
    ghostEl.className = 'ft-image ft-img-ghost';
    ghostEl.innerHTML = g.node.attrs.inner;
    ghostEl.querySelectorAll('[contenteditable]').forEach((c) => c.removeAttribute('contenteditable'));
    for (const at of [...ghostEl.attributes]) if (!/^(class|contenteditable)$/.test(at.name)) ghostEl.removeAttribute(at.name);
    for (const [k, v] of Object.entries(g.a)) if (k !== 'class' && k !== 'contenteditable') ghostEl.setAttribute(k, v);
    ghostEl.style.display = '';
    hidden = g.pos;
    // Par ligne : le double prend d'abord la place de l'image (le texte ne saute pas au début du geste).
    if (g.move === 'ligne' && g.node.type === N.image) {
      ghostSpec = { pos: g.pos, kind: 'block' };
      g.key = 'block:' + g.pos;
      ghostLine(g, false);
    }
    setDecos();
  }
  function autoScroll(g, e) {
    const r = workspace.getBoundingClientRect();
    const edge = 40;
    let d = 0;
    if (e.clientY < r.top + edge) d = -Math.ceil((r.top + edge - e.clientY) / 3);
    else if (e.clientY > r.bottom - edge) d = Math.ceil((e.clientY - (r.bottom - edge)) / 3);
    if (!d) { if (g.scroll) { clearInterval(g.scroll); g.scroll = 0; } return; }
    g.scrollSpeed = d;
    if (!g.scroll) g.scroll = setInterval(() => {
      workspace.scrollTop += g.scrollSpeed;
      if (!g.raf) g.raf = requestAnimationFrame(() => { g.raf = 0; moveFrame(g); });
    }, 16);
  }
  function moveFrame(g) {
    if (gesture !== g) return;
    const e = g.last;
    autoScroll(g, e);
    const x = e.clientX - g.gx;
    const y = e.clientY - g.gy;
    if (g.free) {
      // Devant ou derrière : déplacement au pixel près.
      const k = zoom();
      const dx = (e.clientX - g.x0) / k;
      const dy = (e.clientY - g.y0) / k;
      view.domObserver.stop();
      g.dom.style.translate = `${dx}px ${dy}px`;
      view.domObserver.start();
      g.target = { left: x, top: y };
      placeFrame(g.dom);
      return;
    }
    if (g.move === 'ligne' || g.move === 'texte') {
      // Par ligne : le double se pose entre les lignes ; le texte s'écarte au-dessus ou au-dessous de lui.
      const my = mapY(g, e.clientY);
      const t = bare(() => aimLine(my, e.clientX));
      if (!t) return;
      const key = t.kind + ':' + t.pos;
      if (key !== g.key) {
        g.key = key;
        g.target = t;
        ghostEl.style.display = '';
        ghostSpec = { pos: t.pos, kind: t.kind === 'split' ? 'line' : 'block' };
        ghostLine(g, t.kind === 'split');
        setDecos();
      }
      placeFrame(ghostEl);
      return;
    }
    // Libre au niveau du texte : le double suit la souris, le texte passe à côté de lui.
    const t = bare(() => aimFree(x, y, e.clientX, e.clientY, { w: g.w, h: g.h }));
    if (!t) return;
    g.target = t;
    if (t.kind === 'end') {
      // Sous le texte : le double flotte à l'endroit visé (les lignes vides seront créées au dépôt).
      ghostSpec = null;
      const k = zoom();
      const pr = page.getBoundingClientRect();
      ghostEl.className = 'ft-image ft-img-ghost ft-img-ghost-out';
      ghostEl.style.left = (x - pr.left) / k + 'px';
      ghostEl.style.top = (y - pr.top) / k + 'px';
      ghostEl.style.width = g.w / k + 'px';
      if (ghostEl.parentNode !== page) { setDecos(); page.append(ghostEl); }
      g.key = 'end';
      placeFrame(ghostEl);
      return;
    }
    ghostEl.className = 'ft-image ft-img-ghost';
    ghostEl.style.left = '';
    ghostEl.style.top = '';
    ghostEl.style.width = '';
    ghostEl.style.setProperty('width', sv(g.a, 'width') || '');
    ghostEl.setAttribute('data-wrap', t.side);
    ghostEl.style.setProperty('--mx', t.mx ? t.mx + '%' : '0px');
    ghostEl.style.setProperty('--dy', Math.round(t.dy) + 'px');
    const key = 'line:' + t.pos;
    if (key !== g.key || ghostEl.parentNode === page) {
      g.key = key;
      if (ghostEl.parentNode === page) ghostEl.remove();
      ghostSpec = { pos: t.pos, kind: 'inline' };
      setDecos();
    }
    placeFrame(ghostEl);
  }
  // Par ligne : le pointeur sous le double compte comme s'il n'y était pas (sinon le double, qui repousse
  // le texte, se poursuivrait lui-même).
  function mapY(g, y) {
    if (!ghostSpec || ghostEl.style.display === 'none' || !ghostEl.isConnected) return y;
    const r = ghostEl.getBoundingClientRect();
    if (!r.height) return y;
    // (Hauteur avec les marges : tout le texte qui suit le double est décalé d'autant.)
    const cs = getComputedStyle(ghostEl);
    const k = zoom();
    const top = r.top - (parseFloat(cs.marginTop) || 0) * k;
    const bottom = r.bottom + (parseFloat(cs.marginBottom) || 0) * k;
    if (y > bottom) return y - (bottom - top);
    if (y >= top) return top - 1 + (y - top < (bottom - top) / 2 ? 0 : 2);
    return y;
  }
  function ghostLine(g, split) {
    ghostEl.removeAttribute('data-wrap');
    ghostEl.classList.toggle('ft-img-ghost-split', split);
    for (const p of PLACE) ghostEl.style.removeProperty(p);
    ghostEl.style.left = '';
    ghostEl.style.top = '';
  }
  function onMoveUp() {
    const g = gesture;
    window.removeEventListener('mousemove', onMoveMove, true);
    window.removeEventListener('mouseup', onMoveUp, true);
    if (!g) return;
    if (g.raf) { cancelAnimationFrame(g.raf); g.raf = 0; if (g.started) moveFrame(g); }
    if (g.scroll) clearInterval(g.scroll);
    gesture = null;
    document.body.classList.remove('ft-dragging', 'ft-img-gesture');
    if (!g.started) { select(g.pos); placeTools(); return; }
    let want = null;
    const ghostRect = ghostEl.isConnected && ghostEl.style.display !== 'none' ? ghostEl.getBoundingClientRect() : null;
    if (g.free) {
      want = g.dom.getBoundingClientRect();
      view.domObserver.stop();
      g.dom.style.translate = '';
      view.domObserver.start();
    }
    const target = g.target;
    // Le double et l'image cachée disparaissent ; l'image va à sa nouvelle place.
    ghostSpec = null;
    hidden = null;
    if (ghostEl.parentNode === page) ghostEl.remove();
    setDecos();
    if (!target) { select(g.pos); placeTools(); return; }
    drop(g, target, want, ghostRect);
  }

  // Dépôt : une seule modification (une étape d'annulation).
  function drop(g, t, want, ghostRect) {
    const doc = view.state.doc;
    const node = doc.nodeAt(g.pos);
    if (!isImg(node)) return;
    const tr = view.state.tr;
    const a = bagOf(node);
    let at = null;
    if (g.free) {
      // Devant ou derrière : accrochée à la ligne de son nouveau haut ; place corrigée ensuite.
      const spot = bare(() => aimFree(want.left, want.top, want.left, want.top, { w: want.width, h: want.height }));
      tr.delete(g.pos, g.pos + node.nodeSize);
      if (spot && spot.kind === 'line') {
        at = tr.mapping.map(spot.pos);
        tr.insert(at, inlineNode(put(a, 'data-align', null), node.attrs.inner));
      } else {
        at = fillTo(tr, { y: want.top });
        tr.insert(at, inlineNode(put(a, 'data-align', null), node.attrs.inner));
      }
    } else if (g.move === 'ligne' || g.move === 'texte') {
      const block = blockNode(lineAttrs(a, alignOf(a)), node.attrs.inner);
      if (t.kind === 'block' && (t.pos === g.pos || t.pos === g.pos + node.nodeSize) && node.type === N.image) {
        // Même place : rien ne change.
        select(g.pos);
        placeTools();
        return;
      }
      const target = t.pos;
      tr.delete(g.pos, g.pos + node.nodeSize);
      const mapped = tr.mapping.map(target, t.kind === 'block' ? -1 : 1);
      at = t.kind === 'split' ? placeBlock(tr, mapped, block, justified(t.el)) : insertAt(tr, mapped, block);
      lineAfterIfLast(tr, at);
    } else {
      // Libre au niveau du texte.
      let o = put(a, 'data-wrap', t.side);
      o = put(o, 'data-align', null);
      o = styles(o, { '--mx': t.mx ? t.mx + '%' : null, '--x': null, '--y': null });
      if (t.kind === 'end') {
        tr.delete(g.pos, g.pos + node.nodeSize);
        at = fillTo(tr, t);
        o = withStyle(o, '--dy', null);
        tr.insert(at, inlineNode(o, node.attrs.inner));
        want = ghostRect;
      } else {
        o = withStyle(o, '--dy', t.dy > 0.5 ? Math.round(t.dy) + 'px' : null);
        tr.delete(g.pos, g.pos + node.nodeSize);
        at = tr.mapping.map(t.pos, -1);
        tr.insert(at, inlineNode(o, node.attrs.inner));
      }
    }
    dropAutoLinesAround(tr, at);
    at = Math.min(at, tr.doc.content.size);
    const sel = tr.doc.nodeAt(at);
    if (isImg(sel)) tr.setSelection(NodeSelection.create(tr.doc, at));
    view.dispatch(step(tr));
    if (want) settle(want);
    keepFixed();
    view.focus();
    placeTools();
  }
  // Lignes vides créées pour une image et restées vides : retirées si l'image n'y est plus accrochée.
  function dropAutoLinesAround(tr) {
    const before = tr.doc.content.size;
    // (Seulement si aucune image n'est accrochée dans ces lignes.)
    let holds = false;
    tr.doc.forEach((n) => { if (bagOf(n)[AUTO] !== undefined && n.childCount) holds = true; });
    if (!holds) dropAutoLines(tr);
    return before !== tr.doc.content.size;
  }

  // ----- Taille à la souris : huit poignées -----

  const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const DIR_TITLES = { n: 'Hauteur', s: 'Hauteur', e: 'Largeur', w: 'Largeur' };
  const grips = DIRS.map((dir) => {
    const el = document.createElement('div');
    el.className = 'ft-rz ft-img-rz ft-rz-' + dir;
    el.dataset.dir = dir;
    el.title = DIR_TITLES[dir] || 'Taille (proportions gardées)';
    el.hidden = true;
    el.addEventListener('mousedown', (e) => startResize(dir, e));
    page.append(el);
    return el;
  });
  // Largeur qui vaut 100 % pour l'image (texte du paragraphe, de la page ou du bloc qui la contient).
  function basis(dom) {
    const k = zoom();
    const cs = getComputedStyle(dom);
    if (cs.position === 'absolute') {
      const op = dom.offsetParent || mount;
      return op.clientWidth * k;
    }
    const parent = dom.parentElement || mount;
    const pcs = getComputedStyle(parent);
    return Math.max(1, (parent.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)) * k);
  }
  function startResize(dir, e) {
    if (e.button !== 0) return;
    const cur = selectedImage();
    if (!cur || !cur.dom) return;
    e.preventDefault();
    e.stopPropagation();
    const dom = cur.dom;
    const img = dom.querySelector('img');
    if (!img) return;
    const r0 = dom.getBoundingClientRect();
    const i0 = img.getBoundingClientRect();
    const full = basis(dom);
    const k = zoom();
    const a = cur.a;
    const g = {
      kind: 'resize', pos: cur.pos, dom, img, dir, x0: e.clientX, y0: e.clientY, r0, i0, full, a,
      ratio: i0.width / Math.max(1, i0.height), w: r0.width, h: i0.height, raf: 0, last: e,
      extra: r0.width - i0.width, mx: pct(sv(a, '--mx')), x: parseFloat(sv(a, '--x')) || 0, y: parseFloat(sv(a, '--y')) || 0, k
    };
    gesture = g;
    document.body.classList.add('ft-resizing', 'ft-img-gesture');
    document.body.dataset.rz = dir;
    hideBar();
    const onMove = (ev) => { g.last = ev; if (!g.raf) g.raf = requestAnimationFrame(() => { g.raf = 0; resizeFrame(g); }); };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      if (g.raf) { cancelAnimationFrame(g.raf); resizeFrame(g); }
      document.body.classList.remove('ft-resizing', 'ft-img-gesture');
      delete document.body.dataset.rz;
      gesture = null;
      endResize(g);
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  }
  function resizeFrame(g) {
    const e = g.last;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const d = g.dir;
    let w = g.i0.width;
    let h = g.i0.height;
    if (d.includes('e')) w += dx;
    if (d.includes('w')) w -= dx;
    if (d.includes('s')) h += dy;
    if (d.includes('n')) h -= dy;
    w = Math.max(16, Math.min(g.full - g.extra, w));
    h = Math.max(16, h);
    const corner = d.length === 2;
    if (corner) h = w / g.ratio;
    const k = g.k;
    // Largeur de l'image entière (légende de côté comprise), en % de la largeur de base.
    const p = Math.min(100, round1(((w + g.extra) / g.full) * 100));
    const dom = g.dom;
    view.domObserver.stop();
    dom.style.width = p + '%';
    if (!corner && (d === 'n' || d === 's' || d === 'e' || d === 'w')) {
      // Côté : seule cette dimension change (proportions choisies).
      const ar = w / h;
      dom.style.setProperty('--ar', String(Math.round(ar * 1000) / 1000));
    }
    // Le bord opposé ne bouge pas.
    const lay = layerOf(g.a);
    const move = moveOf(g.a);
    if (move === 'libre' && lay === 'niveau') {
      const wrap = g.a['data-wrap'];
      const pulled = (wrap === 'gauche' && d.includes('w')) || (wrap === 'droite' && d.includes('e'));
      if (pulled) {
        const base = g.mx !== null ? (g.mx / 100) * g.full : 0;
        const delta = (w - g.i0.width);
        const mx = Math.max(0, base - delta);
        dom.style.setProperty('--mx', round1((mx / g.full) * 100) + '%');
      }
    } else if (move === 'libre') {
      if (d.includes('w')) dom.style.setProperty('--x', Math.round(g.x - (w - g.i0.width) / k) + 'px');
      if (d.includes('n')) dom.style.setProperty('--y', Math.round(g.y - (h - g.i0.height) / k) + 'px');
    }
    view.domObserver.start();
    g.changed = true;
    placeFrame(dom);
  }
  function endResize(g) {
    const node = view.state.doc.nodeAt(g.pos);
    if (!g.changed || !isImg(node)) { placeTools(); return; }
    const st = g.dom.style;
    let o = withStyle(g.a, 'width', st.width);
    for (const p of ['--ar', '--mx', '--x', '--y']) if (st.getPropertyValue(p)) o = withStyle(o, p, st.getPropertyValue(p).trim());
    if (o['data-align'] === 'centre' && moveOf(o) === 'libre' && layerOf(o) === 'niveau') {
      const w = widthOf(o) || 50;
      o = withStyle(o, '--mx', round1((100 - w) / 2) + '%');
    } else if (moveOf(o) === 'libre' && (g.dir.includes('w') || g.dir.includes('e'))) {
      // Bord tiré à la souris : l'image n'est plus centrée par le centrage.
      if (layerOf(o) !== 'niveau' || g.dir.includes(o['data-wrap'] === 'droite' ? 'e' : 'w')) o = put(o, 'data-align', o['data-align'] === 'centre' ? null : o['data-align']);
    }
    const tr = view.state.tr.setNodeMarkup(g.pos, null, { ...node.attrs, a: o });
    tr.setSelection(NodeSelection.create(tr.doc, g.pos));
    view.dispatch(step(tr));
    keepFixed();
    placeTools();
  }

  // ----- Barre de l'image -----

  const svg = (body) => `<svg class="thin" viewBox="0 0 16 16">${body}</svg>`;
  const ICONS = {
    ligne: svg('<path d="M1.5 2h13M1.5 14h13"/><rect class="fill" x="3.5" y="4.5" width="9" height="7"/>'),
    libre: svg('<rect class="fill" x="1.5" y="3.5" width="6.5" height="6"/><path d="M10 4h4.5M10 6.6h4.5M10 9.2h4.5M1.5 12h13M1.5 14.6h9"/>'),
    mouvant: svg('<rect class="fill" x="2" y="2" width="7" height="5.5"/><path d="M2 10.2h7M2 13h7M12.5 2.5v10.8M10.6 11.4l1.9 1.9 1.9-1.9"/>'),
    fixe: svg('<rect class="fill" x="4" y="5" width="8" height="6.5"/><path d="M1.5 2.5h13M1.5 14h13M8 1v3.5M6.2 1h3.6"/>'),
    gauche: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/><rect class="fill" x="1.5" y="5" width="7" height="6"/>'),
    centre: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/><rect class="fill" x="4.5" y="5" width="7" height="6"/>'),
    droite: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/><rect class="fill" x="7.5" y="5" width="7" height="6"/>'),
    devant: svg('<path d="M1.5 4h13M1.5 8h13M1.5 12h13"/><rect class="solid" x="4.5" y="5" width="7" height="6"/>'),
    niveau: svg('<rect class="fill" x="1.5" y="4" width="6" height="6.5"/><path d="M1.5 1.8h13M9.5 4.5h5M9.5 7.2h5M9.5 10h5M1.5 13h13"/>'),
    derriere: svg('<rect class="fill" x="4" y="2.5" width="8" height="11"/><path d="M1.5 5h13M1.5 8h13M1.5 11h13"/>'),
    encadrage: svg('<rect x="1.8" y="1.5" width="12.4" height="13" rx="0.8"/><rect class="fill" x="4.2" y="3.8" width="7.6" height="5.4"/><path d="M4.6 11.6h6.8"/>'),
    supprimer: svg('<path d="M2.5 4.2h11M6.2 4.2V2.5h3.6v1.7M4 4.2l.8 9.3h6.4l.8-9.3M6.6 6.6v4.6M9.4 6.6v4.6"/>')
  };
  const MOVES = [['ligne', 'Déplacement par ligne'], ['libre', 'Déplacement libre']];
  const ANCHORS = [['mouvant', 'Ancrage mouvant (suit le texte)'], ['fixe', 'Ancrage fixe (reste sur la page)']];
  const ALIGNS = [['gauche', 'Aligner à gauche'], ['centre', 'Centrer'], ['droite', 'Aligner à droite']];
  const LAYERS = [['devant', 'Devant le texte'], ['niveau', 'Au niveau du texte'], ['derriere', 'Derrière le texte']];
  const WIDTHS = [25, 50, 75, 100];

  // Groupes d'icônes : déplacement, ancrage, centrage, superposition.
  function groups(a) {
    const move = moveOf(a);
    const free = move === 'libre';
    const al = alignOf(a);
    return [
      MOVES.map(([v, t]) => ({ v, html: ICONS[v], title: t, on: move === v, action: () => setMove(v) })),
      ANCHORS.map(([v, t]) => ({ v, html: ICONS[v], title: t, on: (v === 'fixe') === isFixed(a), action: () => setAnchor(v === 'fixe') })),
      ALIGNS.map(([v, t]) => ({ v, html: ICONS[v], title: t, on: al === v, action: () => setAlign(v) })),
      LAYERS.map(([v, t]) => ({ v, html: ICONS[v], title: free ? t : t + ' (déplacement libre seulement)', on: free && layerOf(a) === v, disabled: !free, action: () => setLayer(v) }))
    ];
  }

  const bar = document.createElement('div');
  bar.id = 'image-tools';
  bar.className = 'ft-object-bar';
  bar.hidden = true;
  page.append(bar);
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  let barKey = '';
  function button(it) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = it.html;
    b.title = it.title;
    if (it.on) b.classList.add('on');
    if (it.disabled) b.disabled = true;
    if (it.id) b.dataset.act = it.id;
    else if (it.v) b.dataset.act = it.v;
    b.addEventListener('click', () => it.action(b));
    return b;
  }
  function buildBar(cur) {
    const parts = [];
    const sep = () => Object.assign(document.createElement('span'), { className: 'sep' });
    for (const g of groups(cur.a)) {
      if (parts.length) parts.push(sep());
      parts.push(...g.map(button));
    }
    parts.push(sep());
    parts.push(button({ id: 'encadrage', html: ICONS.encadrage, title: 'Encadrage : légende et cadre', on: !!(cur.a['data-caption'] || cur.a['data-frame']), action: (b) => togglePop(b) }));
    parts.push(sep());
    parts.push(button({ id: 'supprimer', html: ICONS.supprimer, title: cur.a['data-diagram'] !== undefined ? 'Supprimer le schéma' : "Supprimer l'image", action: remove }));
    bar.replaceChildren(...parts);
  }
  function hideBar() { bar.hidden = true; }
  function hideTools() {
    bar.hidden = true;
    for (const el of grips) el.hidden = true;
  }
  // Barre et poignées de l'image sélectionnée.
  function placeTools() {
    const cur = selectedImage();
    if (!cur || !cur.dom || !cur.dom.isConnected || gesture || app.classList.contains('reading-mode') || isFar(cur.dom)) { hideTools(); return; }
    const key = JSON.stringify(cur.a) + cur.node.type.name;
    if (key !== barKey || bar.hidden) { barKey = key; buildBar(cur); }
    bar.hidden = false;
    placeFrame(cur.dom);
  }
  // Barre et poignées autour d'un élément (l'image, ou son double pendant un geste).
  function placeFrame(el) {
    const p = page.getBoundingClientRect();
    const k = page.currentCSSZoom || 1;
    const r0 = el.getBoundingClientRect();
    const r = { top: (r0.top - p.top) / k, left: (r0.left - p.left) / k, width: r0.width / k, height: r0.height / k };
    const z = zoom() / k;
    const R = { top: r.top * z, left: r.left * z, width: r.width * z, height: r.height * z };
    if (!bar.hidden) {
      const top = R.top < 44 ? R.top + R.height + 8 : R.top - 40;
      bar.style.top = top + 'px';
      bar.style.left = Math.max(0, Math.min(page.clientWidth * z - bar.offsetWidth, R.left + R.width - bar.offsetWidth + 5)) + 'px';
    }
    const xs = { w: R.left, e: R.left + R.width, '': R.left + R.width / 2 };
    const ys = { n: R.top, s: R.top + R.height, '': R.top + R.height / 2 };
    for (const g of grips) {
      const d = g.dataset.dir;
      g.hidden = !!(gesture && gesture.kind === 'move');
      g.style.left = xs[d.replace(/[ns]/, '')] + 'px';
      g.style.top = ys[d.replace(/[ew]/, '')] + 'px';
    }
  }

  // ----- Encadrage : légende et cadre (mini-menu) -----

  const pop = document.createElement('div');
  pop.id = 'image-frame-pop';
  pop.className = 'ft-pop';
  pop.hidden = true;
  document.body.append(pop);
  let popPos = null;
  const popOpen = () => !pop.hidden;
  const el = (tag, props = {}, children = []) => {
    const x = document.createElement(tag);
    Object.assign(x, props);
    for (const c of children) x.append(c);
    return x;
  };
  const CAP_PLACES = [['', 'Aucune'], ['haut', 'Dessus'], ['bas', 'Dessous'], ['gauche', 'Gauche'], ['droite', 'Droite']];
  // (« Schéma 1 » : compté avec les schémas, dans la table des schémas ; les autres, avec les figures.)
  const CAP_STYLES = [['', 'Figure 1'], ['schema', 'Schéma 1'], ['fig', 'Fig. 1'], ['num', '1.'], ['perso', 'Autre…'], ['aucun', 'Sans numéro']];
  const CAP_SIZES = [['0.75em', 'Très petite'], ['0.82em', 'Petite'], ['', 'Normale'], ['1em', 'Grande'], ['1.15em', 'Très grande']];
  const CAP_ALIGNS = [
    ['gauche', 'Aligner à gauche', 'M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8'],
    ['', 'Centrer', 'M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8'],
    ['droite', 'Aligner à droite', 'M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8'],
    ['justifie', 'Justifier', 'M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12']
  ];
  const FRAME_STYLES = [['', 'Aucun'], ['plein', 'Plein'], ['pointille', 'Pointillés'], ['tirets', 'Tirets'], ['double', 'Double']];
  const FRAME_WIDTHS = [['1px', 'Fin'], ['2px', 'Moyen'], ['4px', 'Épais']];
  const FRAME_PADDINGS = [['0px', 'Aucune'], ['6px', 'Petite'], ['14px', 'Grande']];
  const FRAME_CORNERS = [['', 'Droits'], ['8px', 'Arrondis']];
  // Coins du contour de la légende (--cap-r ; vide = légèrement arrondis).
  const CAP_CORNERS = [['0px', 'Droits'], ['', 'Légers'], ['8px', 'Arrondis'], ['1em', 'Très arrondis']];
  const COLORS = [['', 'Automatique'], ['#1f1f1f', 'Noir'], ['#6b6b6b', 'Gris'], ['#7b4a2a', 'Marron'], ['#c0392b', 'Rouge'],
    ['#e67e22', 'Orange'], ['#27ae60', 'Vert'], ['#2e86c1', 'Bleu'], ['#1f3a93', 'Bleu marine'], ['#8e44ad', 'Violet']];

  // Changement venu du mini-menu : sur l'image sélectionnée (le mini-menu reste ouvert).
  function popChange(fn) {
    const cur = selectedImage();
    if (!cur) return;
    change(cur.pos, fn);
    if (window.FTGeneres && window.FTGeneres.now) window.FTGeneres.now();
    buildPop();
  }
  function seg(list, current, apply, cls) {
    return el('div', { className: 'seg' + (cls ? ' ' + cls : '') }, list.map(([v, t, icon]) => {
      const b = el('button', { type: 'button', title: icon ? t : '' });
      if (icon) b.innerHTML = `<svg class="thin" viewBox="0 0 16 16"><path d="${icon}"/></svg>`;
      else b.textContent = t;
      if (current === v) b.classList.add('on');
      b.dataset.v = v;
      b.addEventListener('click', () => apply(v));
      return b;
    }));
  }
  function swatchRow(current, apply) {
    const now = (window.FTCouleurs && window.FTCouleurs.norm(current)) || '';
    const set = (v) => { if (v && window.FTCouleurs) window.FTCouleurs.add(v); apply(v); };
    const box = el('div', { className: 'frame-colors' }, COLORS.map(([v, t]) => {
      const b = el('button', { type: 'button', title: t, className: 'swatch' + (now === v ? ' on' : '') + (v ? '' : ' auto') });
      if (v) b.style.background = v;
      b.addEventListener('click', () => set(v));
      return b;
    }));
    const custom = el('input', { type: 'color', className: 'swatch-custom', title: 'Autre couleur', value: /^#[0-9a-f]{6}$/.test(now) ? now : '#888888' });
    custom.addEventListener('change', () => set(custom.value));
    box.append(custom);
    if (!window.FTCouleurs) return box;
    return el('div', { className: 'swatch-group' }, [box, window.FTCouleurs.row(set, { title: '' })]);
  }
  function check(text, on, apply) {
    const box = el('input', { type: 'checkbox', checked: !!on });
    box.addEventListener('change', () => apply(box.checked));
    return el('label', { className: 'pop-check' }, [box, ' ' + text]);
  }
  const title = (t) => el('div', { className: 'pop-title', textContent: t });
  function fontSelect(current, apply) {
    const s = el('select', { title: 'Police de la légende' });
    s.append(new Option('Police du texte', ''));
    document.querySelectorAll('#font-family optgroup').forEach((group) => {
      if (group.label === 'Polices Office') return;
      const g = el('optgroup', { label: group.label });
      group.querySelectorAll('option').forEach((o) => g.append(new Option(o.value, o.value)));
      s.append(g);
    });
    const value = (current || '').replace(/^["']|["'],?.*$/g, '').trim();
    s.value = [...s.options].some((o) => o.value === value) ? value : '';
    s.addEventListener('change', () => apply(s.value));
    return s;
  }

  // Légende : ajoutée, déplacée ou retirée (dans le contenu de l'image).
  function withCaption(node, a, where) {
    const box = document.createElement('span');
    box.innerHTML = node.attrs.inner;
    let cap = box.querySelector(':scope > .ft-caption');
    const img = box.querySelector(':scope > img');
    let o = a;
    if (!where) {
      if (cap) cap.remove();
      o = put(put(put(o, 'data-caption', null), 'data-num', null), 'data-caption-align', null);
      o = put(o, 'data-caption-box', null);
      return { a: o, inner: box.innerHTML };
    }
    if (!cap) {
      cap = document.createElement('span');
      cap.className = 'ft-caption';
      cap.setAttribute('contenteditable', 'true');
      if (!o['data-num'] && o['data-cap-style'] !== 'aucun') o = put(o, 'data-num', o['data-diagram'] !== undefined ? 'schema' : 'figure');
    }
    if (img) {
      if (where === 'haut' || where === 'gauche') img.before(cap);
      else img.after(cap);
    } else box.append(cap);
    o = put(o, 'data-caption', where);
    return { a: o, inner: box.innerHTML };
  }
  function setCaption(where) {
    const cur = selectedImage();
    if (!cur) return;
    const had = !!cur.a['data-caption'];
    const { a, inner } = withCaption(cur.node, cur.a, where);
    const tr = view.state.tr.setNodeMarkup(cur.pos, null, { ...cur.node.attrs, a, inner });
    tr.setSelection(NodeSelection.create(tr.doc, cur.pos));
    view.dispatch(step(tr));
    if (window.FTGeneres && window.FTGeneres.now) window.FTGeneres.now();
    placeTools();
    buildPop();
    // Nouvelle légende : le curseur y est posé quand le mini-menu se ferme (Terminé).
    if (where && !had) pendingCaption = true;
  }
  let pendingCaption = false;

  function buildPop() {
    const cur = selectedImage();
    if (!cur) { closePop(); return; }
    popPos = cur.pos;
    const a = cur.a;
    const where = a['data-caption'] || '';
    const capCol = [title('Légende'), seg(CAP_PLACES, where, (v) => setCaption(v))];
    if (where) {
      const style = a['data-cap-style'] || (a['data-num'] === 'schema' ? 'schema' : '');
      capCol.push(title('Numérotation'), seg(CAP_STYLES, style, (v) => popChange((o) => {
        let x = put(o, 'data-cap-style', v && v !== 'schema' ? v : null);
        if (v === 'aucun') x = put(x, 'data-num', null);
        else if (v === '') x = put(x, 'data-num', 'figure');
        else if (v === 'schema') x = put(x, 'data-num', 'schema');
        else if (!x['data-num']) x = put(x, 'data-num', x['data-diagram'] !== undefined ? 'schema' : 'figure');
        if (v === 'perso' && !x['data-cap-label']) x = put(x, 'data-cap-label', 'Illustration');
        return x;
      }), 'wrap'));
      if (style === 'perso') {
        const input = el('input', { type: 'text', className: 'pop-input', value: a['data-cap-label'] || '', placeholder: 'Illustration', maxLength: 40 });
        input.addEventListener('change', () => popChange((o) => put(o, 'data-cap-label', input.value.trim() || 'Illustration')));
        capCol.push(el('label', { className: 'pop-field' }, ['Mot avant le numéro ', input]));
      }
      if (style !== 'aucun') capCol.push(check('Numéroter par chapitre (Figure 2.1)', a['data-cap-chap'] !== undefined, (on) => popChange((o) => put(o, 'data-cap-chap', on ? '' : null))));
      capCol.push(title('Police'), el('div', { className: 'pop-row' }, [
        fontSelect(sv(a, '--cap-f'), (v) => popChange((o) => withStyle(o, '--cap-f', v ? `"${v}"` : ''))),
        (() => {
          const s = el('select', { title: 'Taille de la légende' });
          for (const [v, t] of CAP_SIZES) s.append(new Option(t, v));
          s.value = sv(a, '--cap-s') || '';
          s.addEventListener('change', () => popChange((o) => withStyle(o, '--cap-s', s.value)));
          return s;
        })()
      ]));
      const bold = a['data-cap-b'] !== undefined;
      const italic = a['data-cap-i'] !== '0';
      const tg = (txt, t, on, fn) => { const b = el('button', { type: 'button', title: t, innerHTML: txt }); if (on) b.classList.add('on'); b.addEventListener('click', fn); return b; };
      capCol.push(el('div', { className: 'pop-row' }, [
        el('div', { className: 'seg compact' }, [
          tg('<b>G</b>', 'Gras', bold, () => popChange((o) => put(o, 'data-cap-b', bold ? null : ''))),
          tg('<i>I</i>', 'Italique', italic, () => popChange((o) => put(o, 'data-cap-i', italic ? '0' : null)))
        ]),
        seg(CAP_ALIGNS, a['data-caption-align'] || '', (v) => popChange((o) => put(o, 'data-caption-align', v || null)), 'icons')
      ]));
      capCol.push(title('Couleur du texte'), swatchRow(sv(a, '--cap-c'), (v) => popChange((o) => withStyle(o, '--cap-c', v))));
      capCol.push(check('Fond et contour de la légende', a['data-caption-box'] !== undefined, (on) => popChange((o) => put(o, 'data-caption-box', on ? '1' : null))));
      if (a['data-caption-box'] !== undefined) {
        capCol.push(title('Couleur du contour'), swatchRow(sv(a, '--cap-bc'), (v) => popChange((o) => withStyle(o, '--cap-bc', v))));
        capCol.push(title('Fond de la légende'), swatchRow(sv(a, '--cap-bg'), (v) => popChange((o) => withStyle(o, '--cap-bg', v))));
        capCol.push(title('Coins de la légende'), seg(CAP_CORNERS, sv(a, '--cap-r'), (v) => popChange((o) => withStyle(o, '--cap-r', v)), 'wrap'));
      }
    }
    const frame = a['data-frame'] || '';
    const frameCol = [title('Cadre'), seg(FRAME_STYLES, frame, (v) => popChange((o) => {
      let x = put(o, 'data-frame', v || null);
      if (!v) x = styles(x, { '--fw': null, '--fc': null, '--fr': null, '--fp': null });
      if (!v) x = put(x, 'data-frame-all', null);
      return x;
    }), 'wrap')];
    if (frame) {
      const get = (p, d) => sv(a, p) || d;
      frameCol.push(
        title('Épaisseur'), seg(FRAME_WIDTHS, get('--fw', '1px'), (v) => popChange((o) => withStyle(o, '--fw', v === '1px' ? '' : v))),
        title('Couleur'), swatchRow(get('--fc', ''), (v) => popChange((o) => withStyle(o, '--fc', v))),
        title('Coins'), seg(FRAME_CORNERS, get('--fr', ''), (v) => popChange((o) => withStyle(o, '--fr', v))),
        title('Marge intérieure'), seg(FRAME_PADDINGS, get('--fp', '6px'), (v) => popChange((o) => withStyle(o, '--fp', v === '6px' ? '' : v)))
      );
      if (where) frameCol.push(check('Encadrer aussi la légende', a['data-frame-all'] !== undefined, (on) => popChange((o) => put(o, 'data-frame-all', on ? '' : null))));
    }
    frameCol.push(check('Ombre légère', a['data-shadow'] !== undefined, (on) => popChange((o) => put(o, 'data-shadow', on ? '1' : null))));
    const done = el('button', { type: 'button', className: 'primary pop-done', textContent: 'Terminé' });
    done.addEventListener('click', () => closePop(true));
    pop.replaceChildren(
      el('div', { className: 'pop-cols' }, [el('div', { className: 'pop-col' }, capCol), el('div', { className: 'pop-col' }, frameCol)]),
      el('div', { className: 'pop-foot' }, [done])
    );
    if (!pop.hidden) keepInView();
  }
  function keepInView() {
    const top = parseFloat(pop.style.top) || 0;
    pop.style.top = Math.max(8, Math.min(top, window.innerHeight - pop.offsetHeight - 8)) + 'px';
    const left = parseFloat(pop.style.left) || 0;
    pop.style.left = Math.max(8, Math.min(left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  }
  function openPop(at) {
    buildPop();
    if (!selectedImage()) return;
    pop.hidden = false;
    // À côté de l'image (à droite, sinon à gauche), pour la voir changer ; sinon sous le bouton.
    const cur = selectedImage();
    const img = cur && cur.dom ? cur.dom.getBoundingClientRect() : null;
    const w = pop.offsetWidth;
    if (img && img.right + 12 + w <= window.innerWidth - 8) { pop.style.left = img.right + 12 + 'px'; pop.style.top = img.top + 'px'; }
    else if (img && img.left - 12 - w >= 8) { pop.style.left = img.left - 12 - w + 'px'; pop.style.top = img.top + 'px'; }
    else if (img) { pop.style.left = window.innerWidth - w - 8 + 'px'; pop.style.top = Math.max(8, img.top) + 'px'; }
    else {
      const r = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, bottom: at.y };
      pop.style.left = r.left + 'px';
      pop.style.top = r.bottom + 6 + 'px';
    }
    keepInView();
  }
  function togglePop(b) { if (popOpen()) closePop(); else openPop(b); }
  function closePop(done) {
    if (pop.hidden) return;
    pop.hidden = true;
    popPos = null;
    if (pendingCaption) {
      pendingCaption = false;
      // (Nouvelle légende : prête à être écrite.)
      const cur = selectedImage();
      const cap = cur && cur.dom && cur.dom.querySelector('.ft-caption');
      if (done && cap && !cap.textContent) focusCaption(cap);
    }
  }
  function focusCaption(cap) {
    cap.focus();
    const r = document.createRange();
    r.selectNodeContents(cap);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  pop.addEventListener('mousedown', (e) => { if (!e.target.closest('label, select, input')) e.preventDefault(); });
  // Un clic ailleurs ferme le mini-menu (pas un clic dans la barre de l'image ni dans un menu).
  document.addEventListener('mousedown', (e) => {
    if (pop.hidden) return;
    if (e.target.closest && e.target.closest('#image-frame-pop, #image-tools, .context-menu, #context-submenu')) return;
    closePop();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { closePop(); e.stopPropagation(); } }, true);

  // ----- Menu du clic droit -----

  function menuItems(dom, point) {
    const cur = selectedImage();
    if (!cur) return [];
    const a = cur.a;
    const [moves, anchors, aligns, layers] = groups(a);
    const strip = (list) => list.map(({ html, title: t, on, disabled, action }) => ({ html, title: t, on, disabled, action }));
    const items = [];
    if (a['data-diagram'] !== undefined && window.FTDiagram) {
      items.push({ text: 'Modifier le schéma…', action: () => window.FTDiagram.open(dom) }, { text: 'Style…', action: () => window.FTStyles.open('schemas', dom) }, '-');
    }
    items.push({ label: 'Déplacement' }, { icons: strip(moves) }, { label: 'Ancrage' }, { icons: strip(anchors) }, { label: 'Centrage' }, { icons: strip(aligns) });
    if (moveOf(a) === 'libre') items.push({ label: 'Superposition' }, { icons: strip(layers) });
    const w = widthOf(a);
    items.push({ label: 'Largeur' }, { icons: WIDTHS.map((p) => ({ html: `${p} %`, title: `${p} % de la largeur du texte`, on: w !== null && Math.round(w) === p, action: () => setWidth(p) })) });
    if (sv(a, '--ar')) items.push({ text: "Proportions d'origine", action: resetRatio });
    items.push('-', { text: 'Encadrage…', action: () => openPop(point) });
    items.push('-', { text: a['data-diagram'] !== undefined ? 'Supprimer le schéma' : "Supprimer l'image", danger: true, action: remove });
    if (window.FTObjets) items.push('-', ...window.FTObjets.insertItems(point.x, point.y));
    return items;
  }

  // ----- Souris sur une image -----

  // Une image derrière le texte se sélectionne là où il n'y a pas de lettres par-dessus.
  function overText(x, y) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r || r.startContainer.nodeType !== Node.TEXT_NODE) return false;
    const n = r.startContainer;
    for (const o of [r.startOffset - 1, r.startOffset]) {
      if (o < 0 || o >= n.length) continue;
      const c = document.createRange();
      c.setStart(n, o);
      c.setEnd(n, o + 1);
      if ([...c.getClientRects()].some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) return true;
    }
    return false;
  }
  // Quitte la légende en cours d'écriture (enregistrée, ce qui peut redessiner l'image) avant de viser l'image.
  // (Sinon, la légende relue au premier changement remettrait le curseur là où il était resté.)
  function leaveCaption() {
    if (window.FTObjets && window.FTObjets.finishCaption) window.FTObjets.finishCaption();
    const f = document.activeElement;
    if (f && f.closest && f.closest('.ft-caption') && mount.contains(f)) view.focus();
  }
  function imageAt(e) {
    const t0 = e.target && e.target.isConnected ? e.target : document.elementFromPoint(e.clientX, e.clientY);
    const t = t0 && t0.nodeType === 1 ? t0 : t0 && t0.parentElement;
    let img = t && t.closest && t.closest('.ft-image');
    if (img && (!mount.contains(img) || img.classList.contains('ft-img-ghost'))) img = null;
    if (!img) {
      for (const o of mount.querySelectorAll('.ft-image[data-wrap="derriere"]')) {
        if (isFar(o)) continue;
        const r = o.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && !overText(e.clientX, e.clientY)) { img = o; break; }
      }
    }
    return img && posOfDom(img) !== null ? img : null;
  }
  // (Écoutés sur la fenêtre, avant les outils du texte.)
  // Clic droit sur une image : elle est sélectionnée tout de suite ; le moteur ne place pas le curseur
  // à côté au relâchement (le menu s'ouvre à l'appui ou au relâchement selon le système).
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !active || !mount.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.ft-caption')) return;
    if (!imageAt(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (window.FTSidebar && window.FTSidebar.hideMenu) window.FTSidebar.hideMenu();
    leaveCaption();
    const img = imageAt(e);
    const pos = img ? posOfDom(img) : null;
    if (pos !== null) select(pos);
  }, true);
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !active || e.target.closest('.ft-rz, #image-tools, #image-frame-pop')) return;
    if (!mount.contains(e.target) && !(e.target.closest && e.target.closest('#page'))) return;
    if (e.target.closest && e.target.closest('.ft-caption')) return; // écrire dans la légende
    if (!imageAt(e)) return;
    leaveCaption();
    const img = imageAt(e);
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = posOfDom(img);
    if (pos === null) return;
    view.focus();
    select(pos);
    const cur = selectedImage();
    if (!cur || !cur.dom) return;
    placeTools();
    startMove(cur, e);
  }, true);
  window.addEventListener('contextmenu', (e) => {
    if (!active || !mount.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.ft-caption')) return;
    if (!imageAt(e)) return;
    e.preventDefault();
    e.stopPropagation();
    leaveCaption();
    const img = imageAt(e);
    const pos = img ? posOfDom(img) : null;
    if (pos === null) return;
    select(pos);
    if (!selectedImage()) return;
    placeTools();
    window.FTSidebar.showMenu(e.clientX, e.clientY, menuItems(img, { x: e.clientX, y: e.clientY }));
  }, true);
  // Double-clic sur un schéma : il s'ouvre (moteur/objets.js) ; sur une image derrière le texte : sélection.
  window.addEventListener('dblclick', (e) => {
    if (!active || !mount.contains(e.target)) return;
    const t = e.target.closest && e.target.closest('.ft-image');
    if (t) return;
    const img = imageAt(e);
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    select(posOfDom(img));
  }, true);
  // Pas de glisser natif du navigateur sur une image.
  mount.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.ft-image')) e.preventDefault(); }, true);

  // L'image sélectionnée change, le texte bouge : barre et poignées suivent.
  let raf = 0;
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!gesture) placeTools(); }); };
  M.onUpdate(() => {
    later();
    if (!selectedImage() && !pop.hidden && !(document.activeElement && inCaption(document.activeElement))) closePop();
    scheduleFix();
  });
  document.addEventListener('ft-paginated', later);
  window.addEventListener('resize', later);
  workspace.addEventListener('scroll', later, { passive: true });
  // (Image affichée après coup : sa taille est maintenant connue.)
  mount.addEventListener('load', () => { later(); scheduleFix(); }, true);

  // ----- Ancrage fixe : l'image reste à sa place sur la page -----
  // Après chaque changement du texte (et chaque découpage en pages), une image fixée qui n'est plus à sa
  // place est accrochée à la ligne qui se trouve maintenant à cette hauteur de sa page. Hors annulation : le
  // texte s'écoule autour de l'image, qui ne bouge pas.

  let fixTimer = 0;
  let fixing = false;
  const tries = new Map(); // clé d'image → { n, t } (tentatives récentes : pas de va-et-vient sans fin)
  // (Un long document sans image fixée n'est pas parcouru à chaque frappe : seul le passage changé l'est.)
  let scanDoc = null;
  let hasFixed = false;
  function noteDoc() {
    const doc = view.state.doc;
    if (doc === scanDoc) return;
    if (!hasFixed) {
      let from = 0;
      let to = doc.content.size;
      if (scanDoc) {
        const a = scanDoc.content.findDiffStart(doc.content);
        const b = scanDoc.content.findDiffEnd(doc.content);
        if (a === null) { scanDoc = doc; return; }
        from = a;
        to = Math.max(a, b ? b.b : to);
      }
      doc.nodesBetween(from, Math.min(to, doc.content.size), (n) => {
        if (hasFixed) return false;
        if (isImg(n)) { if (isFixed(bagOf(n))) hasFixed = true; return false; }
        return true;
      });
    }
    scanDoc = doc;
  }
  function scheduleFix() {
    noteDoc();
    if (!hasFixed) return;
    if (fixTimer || fixing) return;
    fixTimer = setTimeout(() => { fixTimer = 0; fixAll(); }, 120);
  }
  function fixedImages() {
    const out = [];
    view.state.doc.descendants((n, pos) => {
      if (isImg(n)) { if (isFixed(bagOf(n))) out.push({ pos, node: n }); return false; }
      return !n.isTextblock || n.childCount > 0;
    });
    return out;
  }
  function fixAll() {
    if (gesture || !active || fixing || mount.offsetParent === null) return;
    if (window.FTObjets && window.FTObjets.busy()) { scheduleFix(); return; }
    const list = fixedImages();
    if (!list.length) { hasFixed = false; return; }
    fixing = true;
    try {
      for (const it of list) {
        if (isLegacyFixed(bagOf(it.node))) convertLegacy(it);
        else fixOne(it);
      }
    } finally {
      fixing = false;
    }
  }
  function fixOne({ node }) {
    // (Position relue : un déplacement précédent a pu la changer.)
    let pos = null;
    view.state.doc.descendants((n, p) => { if (pos !== null) return false; if (n === node) { pos = p; return false; } return true; });
    if (pos === null) return;
    const a = bagOf(node);
    const pg = Math.max(0, (parseInt(a['data-page'], 10) || 1) - 1);
    const fy = parseFloat(sv(a, '--fy')) || 0;
    const f = V().pageFrame(pg);
    const want = f.ct + fy;           // haut voulu, px depuis le haut de la zone d'écriture
    const k = zoom();
    const mr = mount.getBoundingClientRect();
    const dom = view.nodeDOM(pos);
    const shown = dom && dom.nodeType === 1 && !isFar(dom) && dom.getBoundingClientRect().height > 0;
    let now = null;
    if (shown) now = (dom.getBoundingClientRect().top - mr.top) / k;
    else now = V().yOfPos(pos);
    if (now === null) return;
    const id = (a['data-page'] || '') + ':' + fy + ':' + (node.attrs.inner || '').length;
    const tr0 = tries.get(id);
    const t = Date.now();
    if (tr0 && t - tr0.t < 2000 && tr0.n >= 4) return;
    if (Math.abs(now - want) <= 1.5) { tries.delete(id); return; }
    const move = moveOf(a);
    const layer = layerOf(a);
    // Devant ou derrière, affichée : seul l'écart change si sa ligne d'accroche est encore sur la bonne page.
    const tr = view.state.tr;
    let target = null;
    let dy = 0;
    if (shown) {
      const y = mr.top + want * k;
      const col = textColumn();
      if (move === 'ligne') {
        const t2 = bare(() => { view.domObserver.stop(); const was = dom.style.display; dom.style.display = 'none'; try { return aimLine(y + 1, col.left + 2); } finally { dom.style.display = was; view.domObserver.start(); } });
        if (t2) target = { pos: t2.pos, kind: t2.kind, el: t2.el };
      } else {
        const t2 = withHidden(dom, () => aimFree(col.left + 1, y, col.left + 1, y, null));
        if (t2 && t2.kind === 'line') { target = { pos: t2.pos, kind: 'inline' }; dy = t2.dy; }
      }
    } else {
      const s = V().spotAt(want);
      if (s && (s.text || move === 'ligne')) { target = { pos: s.pos, kind: move === 'ligne' ? (s.text && s.pos > view.state.doc.resolve(s.pos).start() ? 'split' : 'block') : 'inline' }; dy = Math.max(0, want - s.top); }
    }
    if (!target) return;
    tries.set(id, { n: (tr0 && t - tr0.t < 2000 ? tr0.n : 0) + 1, t });
    const sel = view.state.selection;
    const wasSelected = sel instanceof NodeSelection && sel.from === pos;
    let at;
    if (move === 'ligne') {
      const block = blockNode(styles(a, { '--dy': null }), node.attrs.inner);
      if (target.kind !== 'split' && (target.pos === pos || target.pos === pos + node.nodeSize)) return;
      tr.delete(pos, pos + node.nodeSize);
      const m = tr.mapping.map(target.pos, -1);
      at = target.kind === 'split' ? placeBlock(tr, m, block, justified(target.el)) : insertAt(tr, m, block);
    } else {
      let o = a;
      if (layer === 'niveau') o = withStyle(o, '--dy', dy > 0.5 ? Math.round(dy) + 'px' : '');
      const same = target.pos === pos || target.pos === pos + node.nodeSize;
      if (same && layer === 'niveau') {
        if (o === a) return;
        tr.setNodeMarkup(pos, null, { ...node.attrs, a: o });
        at = pos;
      } else if (same) {
        // Devant ou derrière : même ligne, l'écart vertical suffit.
        const ny = Math.round((parseFloat(sv(a, '--y')) || 0) + (want - now));
        tr.setNodeMarkup(pos, null, { ...node.attrs, a: withStyle(a, '--y', ny + 'px') });
        at = pos;
      } else {
        tr.delete(pos, pos + node.nodeSize);
        at = tr.mapping.map(target.pos, -1);
        tr.insert(at, inlineNode(o, node.attrs.inner));
      }
    }
    if (wasSelected && isImg(tr.doc.nodeAt(at))) tr.setSelection(NodeSelection.create(tr.doc, at));
    view.dispatch(tr.setMeta('addToHistory', false).setMeta(FIX, true));
    // Devant ou derrière, déplacée vers une autre ligne : l'écart est corrigé quand elle est affichée.
    if (layer !== 'niveau' && move === 'libre') {
      const d2 = view.nodeDOM(at);
      if (d2 && d2.nodeType === 1 && !isFar(d2)) {
        const r = d2.getBoundingClientRect();
        const dyy = (mr.top + want * k - r.top) / k;
        const fx = parseFloat(sv(a, '--fx'));
        const col = textColumn();
        const dxx = Number.isFinite(fx) ? (col.left + fx * k - r.left) / k : 0;
        if (Math.abs(dyy) > 0.5 || Math.abs(dxx) > 0.5) {
          const n2 = view.state.doc.nodeAt(at);
          const b2 = bagOf(n2);
          const o2 = styles(b2, { '--y': Math.round((parseFloat(sv(b2, '--y')) || 0) + dyy) + 'px', '--x': Math.round((parseFloat(sv(b2, '--x')) || 0) + dxx) + 'px' });
          const tr2 = view.state.tr.setNodeMarkup(at, null, { ...n2.attrs, a: o2 });
          if (wasSelected) tr2.setSelection(NodeSelection.create(tr2.doc, at));
          view.dispatch(tr2.setMeta('addToHistory', false).setMeta(FIX, true));
        }
      }
    }
  }
  // Image « fixée sur la page » des versions d'avant (placée par rapport au haut du texte) : sa page et sa place
  // dans la page sont relevées, puis elle reste à la même place à l'écran.
  function convertLegacy({ node }) {
    let pos = null;
    view.state.doc.descendants((n, p) => { if (pos !== null) return false; if (n === node) { pos = p; return false; } return true; });
    if (pos === null) return;
    const dom = view.nodeDOM(pos);
    if (!dom || dom.nodeType !== 1 || isFar(dom) || !dom.getBoundingClientRect().height) return;
    const r0 = dom.getBoundingClientRect();
    const spot = pageSpot(dom, r0);
    if (!spot) return;
    const sel = view.state.selection;
    const wasSelected = sel instanceof NodeSelection && sel.from === pos;
    let o = put(bagOf(node), 'data-page', spot.page + 1);
    o = styles(o, { '--fx': Math.round(spot.fx) + 'px', '--fy': Math.round(spot.fy) + 'px', '--x': '0px', '--y': '0px' });
    const tr = view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, a: o });
    if (wasSelected) tr.setSelection(NodeSelection.create(tr.doc, pos));
    view.dispatch(tr.setMeta('addToHistory', false).setMeta(FIX, true));
    const d2 = view.nodeDOM(pos);
    if (!d2 || d2.nodeType !== 1) return;
    const r1 = d2.getBoundingClientRect();
    const k = zoom();
    const n2 = view.state.doc.nodeAt(pos);
    const o2 = styles(bagOf(n2), { '--x': Math.round((r0.left - r1.left) / k) + 'px', '--y': Math.round((r0.top - r1.top) / k) + 'px' });
    const tr2 = view.state.tr.setNodeMarkup(pos, null, { ...n2.attrs, a: o2 });
    if (wasSelected) tr2.setSelection(NodeSelection.create(tr2.doc, pos));
    view.dispatch(tr2.setMeta('addToHistory', false).setMeta(FIX, true));
  }
  function withHidden(dom, fn) {
    return bare(() => {
      view.domObserver.stop();
      const was = dom.style.display;
      dom.style.display = 'none';
      try { return fn(); } finally { dom.style.display = was; view.domObserver.start(); }
    });
  }

  // ----- Anciens documents et collages : images des versions d'avant -----
  // Les images libres sont toujours accrochées dans un paragraphe ; « position rigide » devient le
  // déplacement par ligne ; « texte mouvant » le déplacement libre ; « mouvement fixe » est retiré.

  function migrate(box) {
    const imgs = box.querySelectorAll('span.ft-image');
    if (!imgs.length) return;
    const doc = box.ownerDocument;
    const isText = (el) => !!el && el.nodeType === 1 && /^(P|H[1-6])$/.test(el.tagName) && !el.closest('.ft-caption, .ft-toc, .ft-lof, .ft-index, .ft-cover');
    for (const im of imgs) {
      if (im.closest('[contenteditable="false"]:not(.ft-image)') || im.closest('.ft-bio, .ft-cover')) continue;
      const w = im.getAttribute('data-wrap') || '';
      // « Mouvement fixe » / « position rigide » des versions 1.6–2.4 : retirés.
      if (im.hasAttribute('data-pos')) im.removeAttribute('data-pos');
      if (!w) {
        // Par ligne : centrage à gauche, au centre ou à droite (l'ancienne marge choisie à la souris, au plus près).
        if (im.getAttribute('data-align') === 'libre') {
          const ml = parseFloat(im.style.getPropertyValue('--ml')) || 0;
          const width = parseFloat(im.style.width) || 50;
          const opts = [['gauche', 0], ['', (100 - width) / 2], ['droite', 100 - width]];
          opts.sort((x, y) => Math.abs(x[1] - ml) - Math.abs(y[1] - ml));
          if (opts[0][0]) im.setAttribute('data-align', opts[0][0]);
          else im.removeAttribute('data-align');
          im.style.removeProperty('--ml');
        }
        continue;
      }
      if (!LOOSE.test(w)) continue;
      // Écarts en px des versions d'avant : gardés (--mx en px reste valable).
      const parent = im.parentElement;
      if (isText(parent)) continue;
      // Libre posée entre deux blocs : accrochée au début du paragraphe qui suit (ou à la fin du précédent).
      let next = im.nextElementSibling;
      while (next && next.classList.contains('ft-image')) next = next.nextElementSibling;
      if (isText(next)) {
        next.prepend(im);
        // Paragraphe coupé autour de l'image : les deux morceaux sont recollés (l'image reste à la coupure).
        const head = next.previousElementSibling;
        if (head && next.hasAttribute('data-suite') && head.hasAttribute('data-coupe') && head.tagName === next.tagName) {
          head.append(...next.childNodes);
          if (!next.hasAttribute('data-coupe')) {
            head.removeAttribute('data-coupe');
            head.style.removeProperty('text-align-last');
            if (!head.getAttribute('style')) head.removeAttribute('style');
          }
          next.remove();
        }
        continue;
      }
      let prev = im.previousElementSibling;
      while (prev && prev.classList.contains('ft-image')) prev = prev.previousElementSibling;
      if (isText(prev)) { prev.append(im); continue; }
      const p = doc.createElement('p');
      im.replaceWith(p);
      p.append(im);
    }
    // Paragraphes coupés autour d'un tableau ou d'un encadré : inchangés ; autour d'une image libre déplacée
    // dans le paragraphe qui suit : recollés (le moteur recolle les morceaux côte à côte).
  }
  window.FTSchema.onPrepare(migrate);

  // ----- Mise en route -----

  let active = false;
  window.FTImages = {
    insert,
    menuItems,
    placeTools,
    hideTools,
    active: () => active,
    selected: selectedImage,
    // Pour les autres modules : l'élément est-il une image gérée ici ?
    owns: (elm) => active && !!elm && elm.nodeType === 1 && elm.classList.contains('ft-image') && mount.contains(elm),
    openFraming: (at) => openPop(at || { x: 200, y: 200 }),
    closeFraming: () => closePop(true),
    // Pour le banc d'essai.
    _: { state: () => ({ gesture: gesture && gesture.kind, fixing, list: fixedImages().length }), setMove, setAnchor, setAlign, setLayer, setWidth, setCaption, popChange, moveOf, layerOf, alignOf, isFixed, fixAll, aimFree, aimLine, bare },
    start() {
      active = true;
      // Ancrage fixe : vérifié après chaque nouvel affichage du texte (ouverture, découpage en pages).
      if (V() && V().onSettled) V().onSettled(scheduleFix);
    }
  };
})();
