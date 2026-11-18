// Structure du texte dans le nouveau moteur : titres, listes, listes à cocher, encadrés, citations,
// tableaux et ligne de séparation, avec les raccourcis de saisie en début de ligne : « - » (liste),
// « -- » au début d'une ligne de liste (la décaler d'un niveau), « # » à « ##### » (titres),
// « > » (encadré), « 1. », « i. », « I. », « a. », « A. » (listes numérotées), « [] » (liste à cocher),
// « __ » (ligne de séparation). Les listes s'écrivent aussi dans les tableaux, les encadrés et les titres.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const N = schema.nodes;
  const { Plugin, TextSelection, EditorState, Selection } = PM.state;
  const { keymap } = PM.keymap;
  const { splitListItem, liftListItem, sinkListItem } = PM.schemaList;
  const { splitBlockAs, chainCommands, createParagraphNear, liftEmptyBlock } = PM.commands;
  const T = PM.tables;
  const S = () => window.FTStructure;
  const { Fragment } = PM.model;

  const LEVELS = 5;
  // Numérotation tapée en début de ligne (data-num de la liste : celle de son premier niveau).
  const NUM_TYPED = { '1. ': '', 'i. ': 'romain-min', 'I. ': 'romain-maj', 'a. ': 'lettre-min', 'A. ': 'lettre-maj', '1.1. ': '' };
  const NUM_DATA = { 1: '', i: 'romain-min', I: 'romain-maj', a: 'lettre-min', A: 'lettre-maj' };
  // Liste commencée à un autre numéro : « 2. », « 12. », « II. », « iv. »… (chiffres romains I, V, X, L
  // seulement : « M. Dupont » ou « CD. » restent du texte). Rend [numérotation, premier numéro] ou null.
  function typedStart(before) {
    let m = /^(\d{1,3})\. $/.exec(before);
    if (m && Number(m[1]) > 0) return ['', Number(m[1])];
    m = /^([IVXL]{2,7}|[ivxl]{2,7}|V|X|L)\. $/.exec(before);
    if (!m) return null;
    const r = m[1].toUpperCase();
    const VAL = { I: 1, V: 5, X: 10, L: 50 };
    let n = 0;
    for (let k = 0; k < r.length; k++) n += VAL[r[k]] < (VAL[r[k + 1]] || 0) ? -VAL[r[k]] : VAL[r[k]];
    // (Seulement un nombre romain bien écrit : « IIV » ou « VX » restent du texte.)
    const roman = (x) => [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((out, [v, c]) => { while (x >= v) { out += c; x -= v; } return out; }, '');
    if (n < 1 || n > 89 || roman(n) !== r) return null;
    return [m[1] === r ? 'romain-maj' : 'romain-min', n];
  }

  const isList = (n) => n.type === N.bullet_list || n.type === N.ordered_list;
  const isZone = (n) => n.type === N.container && /\bft-cols\b/.test(n.attrs.a.class || '');
  // Où un bloc peut être transformé (liste, encadré…) : le texte, une zone en colonnes, un encadré.
  const isFlow = (n) => n.type === N.doc || n.type === N.blockquote || isZone(n);

  const classes = (a) => String(a.class || '').split(/\s+/).filter(Boolean);
  function withClass(a, cls, on) {
    const list = classes(a).filter((c) => c !== cls);
    if (on) list.push(cls);
    const out = { ...a };
    if (list.length) out.class = list.join(' '); else delete out.class;
    return out;
  }
  function withData(a, name, value) {
    const out = { ...a };
    if (value === null || value === undefined || value === '') delete out[name]; else out[name] = String(value);
    return out;
  }

  const dispatch = (tr) => { view.dispatch(tr.scrollIntoView()); view.focus(); };

  // ----- Repères dans le document -----

  // Bloc de texte du curseur : { node, depth, pos } (pos : position juste avant le bloc).
  function textblock($pos) {
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).isTextblock) return { node: $pos.node(d), depth: d, pos: $pos.before(d) };
    }
    return null;
  }

  // Ancêtre le plus proche qui vérifie pred : { node, depth, pos }.
  function ancestor($pos, pred) {
    for (let d = $pos.depth; d > 0; d--) {
      if (pred($pos.node(d))) return { node: $pos.node(d), depth: d, pos: $pos.before(d) };
    }
    return null;
  }

  // Liste la plus haute qui contient le curseur.
  function outerList($pos) {
    let found = null;
    for (let d = $pos.depth; d > 0; d--) if (isList($pos.node(d))) found = { node: $pos.node(d), depth: d, pos: $pos.before(d) };
    return found;
  }

  // Les blocs voisins touchés par la sélection, dans le même texte (pas dans une liste ni un tableau).
  function flowRange(state) {
    const { $from, $to } = state.selection;
    return $from.blockRange($to, isFlow);
  }

  // ----- Titres -----

  // Un titre qui redevient du texte perd ce qui n'allait qu'au titre : « sans numéro », et son propre
  // style (data-hs, posé sur l'élément par l'outil des titres : police, taille, filet…).
  const HEADING_STYLE = /^(font-family|font-size|font-weight|font-style|text-decoration|text-transform|font-variant-caps|color|border-bottom|padding-bottom)$/;
  function textAttrs(a) {
    const out = withData(withData(withClass(a, 'ft-title', false), 'data-nonum', null), 'data-hs', null);
    if (a['data-hs'] && out.style) {
      const kept = out.style.split(';').map((d) => d.trim()).filter((d) => d && !HEADING_STYLE.test(d.split(':')[0].trim()));
      if (kept.length) out.style = kept.join('; ') + ';'; else delete out.style;
    }
    return out;
  }

  function headingAttrs(tag, a) {
    if (tag === 'p') return { type: N.paragraph, attrs: { tag: 'p', a: textAttrs(a), bare: false } };
    if (tag === 'title') return { type: N.heading, attrs: { level: 1, a: withClass(a, 'ft-title', true) } };
    return { type: N.heading, attrs: { level: Number(tag.slice(1)), a: withClass(a, 'ft-title', false) } };
  }

  // Type des lignes de la sélection : « p », « h1 »…, ou « title » (le titre du document).
  function setBlock(tag) {
    const state = view.state;
    const { $from, from, to } = state.selection;
    // Ligne de liste : elle devient un titre (le tiret reste), ou redevient du texte.
    if (ancestor($from, (n) => n.type === N.list_item)) {
      const tb = textblock($from);
      if (tag === 'p' && !(tb && tb.node.type === N.heading)) return toggleList(false);
      if (!tb || tag === 'title') return;
      const want = tag === 'p'
        ? { type: N.paragraph, attrs: { tag: 'p', a: textAttrs(tb.node.attrs.a), bare: true } }
        : headingAttrs(tag, tb.node.attrs.a);
      return dispatch(state.tr.setNodeMarkup(tb.pos, want.type, want.attrs));
    }
    if (ancestor($from, (n) => n.type === N.table_cell || n.type === N.table_header)) return;
    const tr = state.tr;
    state.doc.nodesBetween(from, Math.max(to, from + 1), (node, pos, parent) => {
      if (!node.isTextblock) return !isList(node) && node.type !== N.table;
      if (!isFlow(parent)) return false;
      const want = headingAttrs(tag, node.attrs.a);
      tr.setNodeMarkup(pos, want.type, want.attrs);
      return false;
    });
    if (tr.docChanged) dispatch(tr);
  }

  // ----- Listes -----

  // Un titre garde sa forme dans la liste.
  function itemFrom(block, itemAttrs) {
    const first = block.type === N.heading ? block : N.paragraph.create({ tag: 'p', a: {}, bare: true }, block.content);
    return N.list_item.create({ a: itemAttrs || {} }, first);
  }

  function listAttrs(ordered) {
    if (ordered === 'cocher') return { type: N.bullet_list, a: { class: 'ft-check' } };
    if (ordered === false) return { type: N.bullet_list, a: {} };
    return { type: N.ordered_list, a: typeof ordered === 'string' && ordered ? { 'data-num': ordered } : {} };
  }

  // Les lignes de la sélection deviennent une liste (une ligne par élément) ; les blocs qui ne sont
  // pas des lignes de texte (tableau, image…) restent entre deux listes.
  function makeList(tr, range, ordered, itemAttrs) {
    const { type, a } = listAttrs(ordered);
    const out = [];
    let items = [];
    const flush = () => { if (items.length) out.push(type.create({ a }, items)); items = []; };
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const child = range.parent.child(i);
      if (child.isTextblock) items.push(itemFrom(child, itemAttrs));
      else { flush(); out.push(child); }
    }
    flush();
    tr.replaceWith(range.start, range.end, out);
    return range.start;
  }

  // Une liste entière (sous-listes comprises) redevient des paragraphes.
  function unmakeList(tr, list) {
    const paras = [];
    list.node.descendants((n) => {
      if (n.type === N.list_item) return true;
      if (isList(n)) return true;
      if (n.type === N.heading) paras.push(n);
      else if (n.isTextblock) paras.push(N.paragraph.create({ tag: 'p', a: n.type === N.paragraph && !n.attrs.bare ? n.attrs.a : {}, bare: false }, n.content));
      else paras.push(n);
      return false;
    });
    tr.replaceWith(list.pos, list.pos + list.node.nodeSize, paras.length ? paras : [N.paragraph.create({ bare: false })]);
  }

  // Numérotation d'un niveau d'une liste numérotée (1 : la liste du haut) : posée sur la liste du haut
  // (data-num pour le premier niveau, data-n2… pour les suivants, structure.js) ; les sous-listes de ce niveau qui avaient la leur (data-num) la perdent.
  // Une liste en escalier (versions précédentes) garde des chiffres aux autres niveaux.
  function setLevelNumber(tr, $pos, level, value) {
    let top = null;
    for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type === N.ordered_list) top = $pos.before(d);
    if (top === null) return;
    const topNode = tr.doc.nodeAt(top);
    let a = topNode.attrs.a;
    if (a['data-num'] === 'escalier') for (let k = 1; k <= LEVELS; k++) if (!a['data-n' + k]) a = withData(a, 'data-n' + k, '1');
    if (a['data-num'] === 'escalier') a = withData(a, 'data-num', '');
    // Premier niveau : data-num, comme les listes tapées « i. » (et lu par les versions précédentes).
    if (level === 1) a = withData(withData(a, 'data-n1', ''), 'data-num', NUM_DATA[value]);
    else a = withData(a, 'data-n' + level, value);
    tr.setNodeMarkup(top, null, { a });
    const walk = (node, pos, depth) => node.forEach((child, offset) => {
      const p = pos + 1 + offset;
      const d = depth + (child.type === N.ordered_list ? 1 : 0);
      if (child.type === N.ordered_list && d === level && child.attrs.a['data-num']) tr.setNodeMarkup(p, null, { a: withData(child.attrs.a, 'data-num', '') });
      if (d <= level && !child.isTextblock) walk(child, p, d);
    });
    walk(tr.doc.nodeAt(top), top, 1);
  }

  // Numérotation tapée ou choisie dans un menu : la liste du curseur devient numérotée, et son niveau
  // prend cette numérotation (value : data-num, '' pour des chiffres).
  function setNumStyle(tr, $pos, value) {
    const list = ancestor($pos, isList);
    if (!list) return;
    if (list.node.type !== N.ordered_list) tr.setNodeMarkup(list.pos, N.ordered_list, { a: withData(withClass(list.node.attrs.a, 'ft-check', false), 'data-bl', '') });
    const $p = tr.doc.resolve(list.pos + 1);
    const f = Object.keys(NUM_DATA).find((k) => NUM_DATA[k] === value) || '1';
    setLevelNumber(tr, $p, numLevel($p), f);
  }

  // Niveau d'une ligne de liste numérotée (1 : liste du haut), en comptant les listes numérotées.
  function numLevel($pos) {
    let level = 0;
    for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type === N.ordered_list) level++;
    return level;
  }

  // ----- Décaler une ligne de liste -----

  const itemRange = ($from, $to) => $from.blockRange($to, (n) => n.childCount > 0 && n.firstChild.type === N.list_item);
  // Notes et bibliographie : des listes que le logiciel numérote lui-même, jamais décalées.
  const inNotes = ($pos) => !!ancestor($pos, (n) => n.type === N.container && /\bft-(footnotes|endnotes|biblio)\b/.test(n.attrs.a.class || ''));

  // Vers la droite : sous la ligne du dessus ; la première ligne d'une liste, qui n'a pas de ligne
  // au-dessus, passe dans une ligne « porteuse » (sans tiret ni texte) : 1. devient 1.1.
  function sinkItem(state, dispatch_) {
    if (inNotes(state.selection.$from)) return false;
    if (sinkListItem(N.list_item)(state, dispatch_)) return true;
    const range = itemRange(state.selection.$from, state.selection.$to);
    if (!range || range.startIndex !== 0 || range.depth >= 40) return false;
    if (dispatch_) {
      const list = range.parent;
      const tr = state.tr.wrap(range, [{ type: N.list_item, attrs: { a: {} } }, { type: list.type, attrs: { a: {} } }]);
      dispatch_(tr.scrollIntoView());
    }
    return true;
  }

  // Vers la gauche : un niveau plus haut ; au premier niveau, la ligne redevient du texte.
  function liftItem(state, dispatch_) {
    const { $from, $to } = state.selection;
    const range = itemRange($from, $to);
    if (!range || inNotes($from)) return false;
    const cd = range.depth - 1;
    // Lignes du début d'une sous-liste portée : elles prennent la place de la ligne porteuse ; la suite
    // de la sous-liste et ce que portait encore la ligne passent sous la dernière d'entre elles.
    if (cd > 0 && range.startIndex === 0 && $from.node(cd).type === N.list_item && $from.index(cd) === 0) {
      if (!dispatch_) return true;
      const carrier = $from.node(cd);
      const list = range.parent;
      const lifted = [];
      for (let i = 0; i < range.endIndex; i++) lifted.push(list.child(i));
      const tail = [];
      const rest = [];
      for (let i = range.endIndex; i < list.childCount; i++) rest.push(list.child(i));
      if (rest.length) tail.push(list.type.create(list.attrs, rest));
      for (let i = 1; i < carrier.childCount; i++) tail.push(carrier.child(i));
      const last = lifted.pop();
      lifted.push(last.type.create(last.attrs, last.content.append(Fragment.from(tail))));
      const start = $from.before(cd);
      const tr = state.tr.replaceWith(start, start + carrier.nodeSize, lifted);
      tr.setSelection(TextSelection.create(tr.doc, $from.pos - 2, $to.pos - 2));
      dispatch_(tr.scrollIntoView());
      return true;
    }
    return liftListItem(N.list_item)(state, dispatch_);
  }

  // Une commande appliquée à la suite d'une transaction en cours (même étape d'annulation).
  function onTr(tr, cmd) {
    let out = null;
    cmd(EditorState.create({ doc: tr.doc, selection: tr.selection }), (t) => { out = t; });
    if (!out) return false;
    for (const step of out.steps) tr.step(step);
    tr.setSelection(TextSelection.create(tr.doc, out.selection.anchor, out.selection.head));
    return true;
  }

  function toggleList(ordered) {
    const state = view.state;
    const { $from } = state.selection;
    const tr = state.tr;
    const item = ancestor($from, (n) => n.type === N.list_item);
    if (item && typeof ordered === 'string' && ordered !== 'cocher') {
      setNumStyle(tr, $from, ordered);
      return dispatch(tr);
    }
    if (item) {
      const list = outerList($from);
      const top = textblock($from);
      unmakeList(tr, list);
      // Le curseur reste dans la ligne où il était.
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(top ? top.pos : list.pos) + 1, tr.doc.content.size))));
      return dispatch(tr);
    }
    const range = flowRange(state);
    if (!range) return;
    const start = makeList(tr, range, ordered);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(state.selection.to), tr.doc.content.size))));
    if (tr.selection.from < start) tr.setSelection(TextSelection.near(tr.doc.resolve(start + 3)));
    dispatch(tr);
  }

  // Liste à cocher : chaque élément porte data-checked="oui" quand sa case est cochée.
  function toggleCheck() {
    const state = view.state;
    const { $from } = state.selection;
    const tr = state.tr;
    const list = outerList($from);
    if (list) {
      if (classes(list.node.attrs.a).includes('ft-check')) unmakeList(tr, list);
      else tr.setNodeMarkup(list.pos, N.bullet_list, { a: withData(withClass(list.node.attrs.a, 'ft-check', true), 'data-num', '') });
      return dispatch(tr);
    }
    const range = flowRange(state);
    if (!range) return;
    makeList(tr, range, 'cocher');
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(state.selection.to), tr.doc.content.size))));
    dispatch(tr);
  }

  // Un clic sur la case (à gauche du texte) la coche ou la décoche.
  function checkClick(v, e) {
    // Clic droit sur des cases sélectionnées : la sélection reste (pour « Fusionner les cellules »…).
    if (e.button === 2) {
      const cell = e.target.closest && e.target.closest('td, th');
      if (v.state.selection instanceof T.CellSelection && cell && cell.classList.contains('selectedCell')) e.preventDefault();
      return false;
    }
    if (e.button !== 0) return false;
    const li = e.target.closest && e.target.closest('li');
    if (!li || !v.dom.contains(li) || !li.parentElement.matches('ul.ft-check, ul.ft-check ul')) return false;
    const r = li.getBoundingClientRect();
    if (e.clientX >= r.left + parseFloat(getComputedStyle(li).paddingLeft) - 2) return false;
    const item = ancestor(v.state.doc.resolve(v.posAtDOM(li, 0)), (n) => n.type === N.list_item);
    if (!item) return false;
    e.preventDefault();
    const a = item.node.attrs.a;
    v.dispatch(v.state.tr.setNodeMarkup(item.pos, null, { a: withData(a, 'data-checked', a['data-checked'] ? '' : 'oui') }));
    return true;
  }

  // ----- Encadrés et citations -----

  const isCallout = (n) => n.type === N.blockquote && classes(n.attrs.a).includes('ft-callout');
  const look = (name) => (S() && S()[name] ? S()[name]() : { look: '', color: '' });

  function calloutAttrs(quote) {
    const l = look(quote ? 'newQuoteLook' : 'newCalloutLook');
    let a = { class: quote ? 'ft-callout ft-quote' : 'ft-callout' };
    if (quote) a = withData(a, 'data-qlook', l.look);
    else a = withData(a, 'data-look', l.look);
    return withData(a, 'data-color', l.color);
  }

  function unwrap(tr, box) {
    tr.replaceWith(box.pos, box.pos + box.node.nodeSize, box.node.content);
  }

  function wrapCallout(quote) {
    const state = view.state;
    const range = state.selection.$from.blockRange(state.selection.$to, (n) => n.type === N.doc || isZone(n));
    if (!range) return;
    const tr = state.tr;
    // Les blocs déjà dans un encadré le rejoignent (pas d'encadré dans un encadré).
    const content = [];
    for (let i = range.startIndex; i < range.endIndex; i++) {
      const c = range.parent.child(i);
      if (isCallout(c)) c.forEach((x) => content.push(x));
      else content.push(c);
    }
    if (content.some((c) => c.type === N.table)) return;
    tr.replaceWith(range.start, range.end, N.blockquote.create({ a: calloutAttrs(quote) }, content));
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(state.selection.from + 1, tr.doc.content.size))));
    dispatch(tr);
  }

  function toggleCallout() {
    const box = ancestor(view.state.selection.$from, isCallout);
    if (box) {
      const tr = view.state.tr;
      unwrap(tr, box);
      return dispatch(tr);
    }
    wrapCallout(false);
  }

  // Bouton « Citation » : met les paragraphes dans un bloc de citation, ou retire celui du curseur.
  function toggleQuote() {
    const box = ancestor(view.state.selection.$from, isCallout);
    if (box && classes(box.node.attrs.a).includes('ft-quote')) {
      const tr = view.state.tr;
      unwrap(tr, box);
      return dispatch(tr);
    }
    if (box) {
      // Un encadré devient une citation.
      const l = look('newQuoteLook');
      let a = withData(withClass(box.node.attrs.a, 'ft-quote', true), 'data-look', '');
      a = withData(withData(a, 'data-qlook', l.look), 'data-color', l.color);
      return dispatch(view.state.tr.setNodeMarkup(box.pos, null, { a }));
    }
    wrapCallout(true);
  }

  // ----- Tableaux et ligne de séparation -----

  const emptyPara = () => N.paragraph.create({ tag: 'p', a: {}, bare: false });

  function buildTable(rows, cols, opts) {
    const el = document.createElement('table');
    el.className = 'ft-table';
    if (S()) S().setTableLook(el, { ...S().newTableLook(), ...opts });
    const cell = () => N.table_cell.create({ a: {} }, N.paragraph.create({ tag: 'p', a: {}, bare: true }));
    const body = [];
    for (let r = 0; r < rows; r++) body.push(N.table_row.create({ a: {} }, Array.from({ length: cols }, cell)));
    return N.table.create({ a: window.FTSchema.bag(el) }, body);
  }

  // Pose un bloc à l'endroit du curseur, comme dans les versions 1.x : à la place d'une ligne vide,
  // avant ou après la ligne, ou au milieu (la fin de la ligne passe après le bloc). Renvoie sa position.
  function placeBlock(tr, node) {
    const { $from } = tr.selection;
    const tb = textblock($from);
    let pos;
    if (!tb || !isFlow($from.node(tb.depth - 1))) {
      // Dans une liste, un tableau… : après le bloc de premier niveau.
      const top = $from.depth >= 1 ? $from.before(1) : 0;
      const topNode = tr.doc.nodeAt(top);
      pos = topNode ? top + topNode.nodeSize : tr.doc.content.size;
      tr.insert(pos, node);
      return pos;
    }
    const offset = $from.parentOffset;
    const size = tb.node.content.size;
    if (size === 0) {
      tr.replaceWith(tb.pos, tb.pos + tb.node.nodeSize, node);
      return tb.pos;
    }
    if (offset === 0) { tr.insert(tb.pos, node); return tb.pos; }
    if (offset === size) { pos = tb.pos + tb.node.nodeSize; tr.insert(pos, node); return pos; }
    tr.split($from.pos);
    pos = tb.pos + offset + 2;
    tr.insert(pos, node);
    return pos;
  }

  // Une ligne de texte après le bloc, pour pouvoir continuer à écrire.
  function ensureLineAfter(tr, pos) {
    const node = tr.doc.nodeAt(pos);
    const after = pos + node.nodeSize;
    const next = tr.doc.resolve(after).nodeAfter;
    if (!next || !next.isTextblock) tr.insert(after, emptyPara());
  }

  function insertTable(opts = {}) {
    const rows = opts.rows || 3;
    const cols = opts.cols || 3;
    const tr = view.state.tr;
    const pos = placeBlock(tr, buildTable(rows, cols, opts));
    ensureLineAfter(tr, pos);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3)));
    dispatch(tr);
  }

  function insertRule() {
    const tr = view.state.tr;
    const pos = placeBlock(tr, N.raw_block.create({ html: '<hr class="ft-rule">' }));
    ensureLineAfter(tr, pos);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    dispatch(tr);
  }

  // ----- Clavier -----

  const UNIQUE = ['id', 'data-bm', 'data-lettrine', 'data-checked'];
  // Bibliographie (moteur/notes.js) : la nouvelle ligne n'est ni le titre ni la référence d'une source.
  const BIB_OWN = ['data-src', 'data-h', 'data-n', 'data-ids', 'data-bib'];
  const fresh = (a) => {
    const out = { ...a };
    for (const k of UNIQUE) delete out[k];
    if (/\bft-bib(-title)?\b/.test(out.class || '')) {
      for (const k of BIB_OWN) delete out[k];
      const cls = classes(out).filter((c) => c !== 'ft-bib-title').join(' ');
      if (cls) out.class = cls; else delete out.class;
    }
    return out;
  };

  // Ligne vide ordinaire (texte ou titre, sans signet ni lettrine).
  const emptyLine = (n) => (n.type === N.paragraph || n.type === N.heading) && n.content.size === 0
    && !n.attrs.a.id && !n.attrs.a['data-bm'] && !classes(n.attrs.a).some((c) => /^ft-(legend|caption|quote-src|title)$/.test(c));
  // Retire la ligne vide [from, to) ; si c'était le texte nu d'une case ou d'une ligne de liste, la ligne
  // qui prend sa place le redevient (comme avant Entrée). Le curseur va au début de cette ligne.
  function dropEmpty(tr, from, to, bare) {
    tr.delete(from, to);
    const node = tr.doc.nodeAt(from);
    if (bare && node && node.type === N.paragraph && !node.attrs.bare && !Object.keys(node.attrs.a).length) {
      tr.setNodeMarkup(from, null, { ...node.attrs, bare: true });
    }
    return tr.setSelection(TextSelection.create(tr.doc, from + 1));
  }

  const atStart = (state) => state.selection.empty && state.selection.$from.parentOffset === 0;
  const inItemFirstLine = ($from) => {
    const tb = textblock($from);
    return tb && $from.node(tb.depth - 1).type === N.list_item && $from.index(tb.depth - 1) === 0;
  };

  const keys = {
    // La nouvelle ligne ne reprend pas ce qui n'appartient qu'à la première : signet, lettrine, case cochée.
    Enter: (state, dispatch_, v) => {
      const item = ancestor(state.selection.$from, (n) => n.type === N.list_item);
      if (item) return splitListItem(N.list_item, { a: fresh(item.node.attrs.a) })(state, dispatch_, v);
      return chainCommands(createParagraphNear, liftEmptyBlock, splitBlockAs((node, atEnd) => {
        // Entrée à la fin d'un titre : la ligne suivante est du texte normal.
        if (node.type === N.heading && atEnd) return { type: N.paragraph, attrs: { tag: 'p', a: {}, bare: false, nobr: false } };
        if (node.type === N.paragraph) return { type: N.paragraph, attrs: { ...node.attrs, a: fresh(node.attrs.a), bare: false, nobr: false } };
        if (node.type === N.heading) return { type: N.heading, attrs: { ...node.attrs, a: fresh(node.attrs.a), nobr: false } };
        return null;
      }))(state, dispatch_, v);
    },
    Backspace: (state, dispatch_) => {
      if (!atStart(state)) return false;
      const { $from } = state.selection;
      const tb = textblock($from);
      if (!tb) return false;
      // Ligne vide juste après un tableau : elle disparaît et le curseur passe à la fin de la dernière case ;
      // la dernière ligne du texte reste (sans elle, plus moyen d'écrire après le tableau).
      const parent = $from.node(tb.depth - 1);
      const index = $from.index(tb.depth - 1);
      // Ligne de texte après un tableau : le curseur passe aussi dans la dernière case (le tableau n'est ni
      // choisi ni effacé par un second Retour arrière ; il s'efface par son menu).
      if (index > 0 && parent.child(index - 1).type === N.table) {
        if (!dispatch_) return true;
        const tr = state.tr;
        if (index < parent.childCount - 1 && tb.node.content.size === 0) tr.delete(tb.pos, tb.pos + tb.node.nodeSize);
        tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos - 1), -1));
        dispatch_(tr.scrollIntoView());
        return true;
      }
      // Au début d'une ligne de liste : elle recule d'un cran, ou redevient un paragraphe.
      // Un titre vidé sort de la liste comme une ligne de texte.
      if (inItemFirstLine($from)) {
        if (!dispatch_ || tb.node.type !== N.heading || tb.node.content.size) return liftItem(state, dispatch_);
        return liftItem(state, (tr) => {
          const out = textblock(tr.selection.$from);
          if (out && out.node.type === N.heading && !out.node.content.size && !ancestor(tr.selection.$from, (n) => n.type === N.list_item)) {
            tr.setNodeMarkup(out.pos, N.paragraph, { tag: 'p', a: textAttrs(out.node.attrs.a), bare: false });
          }
          dispatch_(tr);
        });
      }
      // Ligne juste après une liste : son texte rejoint la fin de la dernière ligne de la liste (la ligne
      // n'entre pas dans la liste avec un nouveau numéro).
      if (index > 0 && isList(parent.child(index - 1)) && (tb.node.type === N.paragraph || tb.node.type === N.heading)) {
        if (!dispatch_) return true;
        const listStart = tb.pos - parent.child(index - 1).nodeSize;
        const end = Selection.findFrom(state.doc.resolve(tb.pos), -1, true);
        if (!end || end.from < listStart) return false;
        const tr = state.tr;
        tr.delete(tb.pos, tb.pos + tb.node.nodeSize);
        if (tb.node.content.size) tr.insert(end.from, tb.node.content);
        tr.setSelection(TextSelection.create(tr.doc, end.from));
        dispatch_(tr.scrollIntoView());
        return true;
      }
      // Titre vide : il redevient une ligne de texte, à sa place (la ligne vide au-dessus reste).
      if (tb.node.type === N.heading && !tb.node.content.size) {
        if (dispatch_) dispatch_(state.tr.setNodeMarkup(tb.pos, N.paragraph, { tag: 'p', a: textAttrs(tb.node.attrs.a), bare: false }));
        return true;
      }
      // Ligne vide juste au-dessus (même conteneur) : elle disparaît et la ligne garde son style (un titre
      // reste un titre, une ligne centrée reste centrée), comme dans Word.
      if (index > 0 && emptyLine(parent.child(index - 1)) && tb.node.type !== N.code_block) {
        if (!dispatch_) return true;
        dispatch_(dropEmpty(state.tr, tb.pos - parent.child(index - 1).nodeSize, tb.pos, parent.child(index - 1).attrs.bare === true).scrollIntoView());
        return true;
      }
      // Au début d'un titre : il redevient du texte normal (sous un autre titre, les deux se réunissent,
      // comme avant Entrée au milieu d'un titre).
      if (tb.node.type === N.heading && !(index > 0 && parent.child(index - 1).type === N.heading)) {
        if (dispatch_) dispatch_(state.tr.setNodeMarkup(tb.pos, N.paragraph, { tag: 'p', a: textAttrs(tb.node.attrs.a), bare: false }));
        return true;
      }
      return false;
    },
    // Suppr sur une ligne vide : elle disparaît et la ligne suivante garde son style (même conteneur).
    Delete: (state, dispatch_) => {
      const { $from, empty } = state.selection;
      const tb = textblock($from);
      if (!empty || !tb || $from.parentOffset < tb.node.content.size || tb.node.type === N.code_block) return false;
      const parent = $from.node(tb.depth - 1);
      const index = $from.index(tb.depth - 1);
      const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
      // Avant un tableau : une ligne vide disparaît (le tableau remonte), et le curseur passe dans la
      // première case ; le tableau n'est ni choisi ni effacé par un second Suppr.
      if (next && next.type === N.table) {
        if (!dispatch_) return true;
        const tr = state.tr;
        const drop = emptyLine(tb.node) && index > 0;
        if (drop) tr.delete(tb.pos, tb.pos + tb.node.nodeSize);
        dispatch_(tr.setSelection(TextSelection.near(tr.doc.resolve((drop ? tb.pos : tb.pos + tb.node.nodeSize) + 1))).scrollIntoView());
        return true;
      }
      if (!emptyLine(tb.node) || !next || !next.isTextblock || next.type === N.code_block) return false;
      if (!dispatch_) return true;
      dispatch_(dropEmpty(state.tr, tb.pos, tb.pos + tb.node.nodeSize, tb.node.attrs.bare === true).scrollIntoView());
      return true;
    },
    Tab: (state, dispatch_) => {
      if (T.isInTable(state)) {
        if (T.goToNextCell(1)(state, dispatch_)) return true;
        // Dernière case : une ligne s'ajoute dessous.
        if (dispatch_) {
          T.addRowAfter(state, dispatch_);
          T.goToNextCell(1)(view.state, view.dispatch);
        }
        return true;
      }
      if (ancestor(state.selection.$from, (n) => n.type === N.list_item)) {
        sinkItem(state, dispatch_);
        return true;
      }
      return false;
    },
    'Shift-Tab': (state, dispatch_) => {
      if (T.isInTable(state)) { T.goToNextCell(-1)(state, dispatch_); return true; }
      if (ancestor(state.selection.$from, (n) => n.type === N.list_item)) { liftItem(state, dispatch_); return true; }
      return false;
    }
  };

  // ----- Raccourcis de saisie -----

  // Le texte tapé est d'abord écrit (Ctrl+Z après la transformation le laisse tel quel), puis la ligne
  // est transformée sans ses caractères de marque.
  function typed(v, from, to, text) {
    const state = v.state;
    const $from = state.doc.resolve(from);
    const tb = textblock($from);
    if (!tb || from !== to) return false;
    const before = (tb.node.textBetween(0, $from.parentOffset, '', '￼') + text).replace(/ /g, ' ');
    const parent = $from.node(tb.depth - 1);
    const plain = tb.node.type === N.paragraph && isFlow(parent);
    // Où « - », « 1. »… font une liste : une ligne de texte ou un titre, dans le texte, un encadré,
    // une zone en colonnes ou une case de tableau (pas le titre du document, une légende, une source).
    const own = classes(tb.node.attrs.a);
    const listable = (tb.node.type === N.paragraph || tb.node.type === N.heading)
      && (isFlow(parent) || parent.type === N.table_cell || parent.type === N.table_header)
      && !own.some((c) => c === 'ft-title' || c === 'ft-legend' || c === 'ft-quote-src' || c === 'ft-caption');
    const start = tb.pos + 1;
    const transform = (fn) => {
      v.dispatch(state.tr.insertText(text, from, to));
      M.closeHistory();
      const tr = v.state.tr.delete(start, start + before.length);
      fn(tr);
      v.dispatch(tr.scrollIntoView());
      return true;
    };
    if (text === ' ' && (plain || listable)) {
      // (« ## » + espace au début d'un titre : il change d'étage.)
      const heading = (plain || (tb.node.type === N.heading && isFlow(parent) && !own.includes('ft-title'))) && /^(#{1,5}) $/.exec(before);
      // (Titre tapé sans numéro, même si le thème numérote les titres : le numéro vient d'un « 1. » tapé ensuite.)
      if (heading) return transform((tr) => tr.setNodeMarkup(tb.pos, N.heading, { level: heading[1].length, a: withData(tb.node.attrs.a, 'data-nonum', 'oui') }));
      if (/^\[[ xX]?\] $/.test(before)) {
        return transform((tr) => {
          const range = tr.doc.resolve(tb.pos + 1).blockRange();
          makeList(tr, range, 'cocher', /x/i.test(before) ? { 'data-checked': 'oui' } : null);
          tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos + 3)));
        });
      }
      if (before === '- ' || before === '* ' || NUM_TYPED[before] !== undefined) {
        const style = NUM_TYPED[before] !== undefined ? NUM_TYPED[before] : false;
        return transform((tr) => {
          const range = tr.doc.resolve(tb.pos + 1).blockRange();
          makeList(tr, range, style);
          tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos + 3)));
        });
      }
      const from = typedStart(before);
      if (from) {
        return transform((tr) => {
          const range = tr.doc.resolve(tb.pos + 1).blockRange();
          makeList(tr, range, from[0]);
          const list = tr.doc.nodeAt(range.start);
          if (list && list.type === N.ordered_list && from[1] > 1) tr.setNodeMarkup(range.start, null, { ...list.attrs, a: { ...list.attrs.a, start: String(from[1]) } });
          tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos + 3)));
        });
      }
      if (plain && before === '> ' && (parent.type === N.doc || isZone(parent))) {
        return transform((tr) => {
          const node = tr.doc.nodeAt(tb.pos);
          tr.replaceWith(tb.pos, tb.pos + node.nodeSize, N.blockquote.create({ a: calloutAttrs(false) }, node));
          tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos + 2)));
        });
      }
      return false;
    }
    // « -- » au début d'une ligne de liste : la décale d'un niveau vers la droite (1. devient 1.1.).
    if (text === '-' && before === '--' && inItemFirstLine($from)) return transform((tr) => onTr(tr, sinkItem));
    // « __ » seul sur une ligne : ligne de séparation.
    if (text === '_' && before === '__' && plain && tb.node.textContent === '_' && (parent.type === N.doc || isZone(parent))) {
      return transform((tr) => {
        tr.insert(tb.pos, N.raw_block.create({ html: '<hr class="ft-rule">' }));
        tr.setSelection(TextSelection.near(tr.doc.resolve(tb.pos + 2)));
      });
    }
    return false;
  }

  // ----- Menus du clic droit (tableaux) -----

  const check = (on, text) => (on ? '✓ ' : '\u2003') + text;
  const tcmd = (c) => () => { c(view.state, view.dispatch, view); view.focus(); };
  // Choix d'un menu : une étape d'annulation à lui seul.
  const apply = (tr) => { view.dispatch(PM.history.closeHistory(tr).scrollIntoView()); M.closeHistory(); view.focus(); };

  function tableAt($pos) {
    return ancestor($pos, (n) => n.type === N.table);
  }

  // Colonne ajoutée ou retirée dans un tableau aux largeurs réglées à la souris (<colgroup>) : la nouvelle
  // prend la moitié de sa voisine ; celle qui part rend sa largeur à sa voisine (comme les versions 1.x).
  const widthOf = (col) => /width:\s*([\d.]+)(%|px)/.exec((col && col.style) || '');
  const withWidth = (col, v, unit) => ({ ...col, style: (col.style || '').replace(/width:\s*[\d.]+(%|px)/, 'width: ' + +v.toFixed(3) + unit) });
  function colCmd(kind) {
    return () => {
      const state = view.state;
      let rect = null;
      try { rect = T.selectedRect(state); } catch { /* pas dans un tableau */ }
      let cmd = kind === 'before' ? T.addColumnBefore : kind === 'after' ? T.addColumnAfter : T.deleteColumn;
      // Curseur dans une case fusionnée : seule sa première colonne part (la case rétrécit, comme les
      // versions 1.x).
      if (kind === 'delete' && rect && !(state.selection instanceof T.CellSelection) && rect.right - rect.left > 1) {
        rect = { ...rect, right: rect.left + 1 };
        const one = rect;
        cmd = (st, d) => {
          const tr = st.tr;
          T.removeColumn(tr, one, one.left);
          if (d) d(tr);
          return true;
        };
      }
      const cols = rect && rect.table.attrs.cols;
      if (!cols || cols.length !== rect.map.width) return tcmd(cmd)();
      const pos = rect.tableStart - 1;
      let next = cols.slice();
      if (kind === 'delete') {
        for (let c = rect.right - 1; c >= rect.left; c--) {
          const other = c > 0 ? c - 1 : c + 1;
          const a = widthOf(next[c]);
          const b = widthOf(next[other]);
          if (a && b && a[2] === b[2]) next[other] = withWidth(next[other], Number(a[1]) + Number(b[1]), a[2]);
          next.splice(c, 1);
        }
      } else {
        const index = kind === 'before' ? rect.left : rect.right;
        const ref = Math.min(kind === 'before' ? index : index - 1, next.length - 1);
        const w = widthOf(next[ref]);
        if (w) {
          next[ref] = withWidth(next[ref], Number(w[1]) / 2, w[2]);
          next.splice(index, 0, next[ref]);
        } else {
          next = null;
        }
      }
      cmd(state, (tr) => {
        const t = tr.doc.nodeAt(pos);
        if (t && t.type === N.table) tr.setNodeMarkup(pos, null, { ...t.attrs, cols: next && next.length ? next : null });
        view.dispatch(tr);
      });
      view.focus();
    };
  }

  function setTableData(name) {
    const t = tableAt(view.state.selection.$from);
    if (!t) return;
    const a = t.node.attrs.a;
    apply(view.state.tr.setNodeMarkup(t.pos, null, { ...t.node.attrs, a: withData(a, name, a[name] ? '' : 'oui') }));
  }

  // Cases choisies (sélection de cases), sinon la case du curseur : [{ node, pos }].
  function cellsOf(state) {
    const sel = state.selection;
    const out = [];
    if (sel instanceof T.CellSelection) sel.forEachCell((node, pos) => out.push({ node, pos }));
    else {
      const c = ancestor(sel.$from, (n) => n.type === N.table_cell || n.type === N.table_header);
      if (c) out.push(c);
    }
    return out;
  }

  // Alignement vertical du texte dans les cases (data-valign), comme dans Word.
  const VALIGNS = [['', 'En haut'], ['milieu', 'Au milieu'], ['bas', 'En bas']];
  function valignItem() {
    const cells = cellsOf(view.state);
    const current = (cells[0] && cells[0].node.attrs.a['data-valign']) || '';
    const set = (v) => () => {
      const tr = view.state.tr;
      for (const c of cellsOf(view.state)) tr.setNodeMarkup(c.pos, null, { ...c.node.attrs, a: withData(c.node.attrs.a, 'data-valign', v) });
      apply(tr);
    };
    return { text: 'Alignement vertical', submenu: () => VALIGNS.map(([v, label]) => ({ text: check(current === v, label), action: set(v) })) };
  }

  // Bordures choisies (data-borders : traits montrés ; data-bw : épaisseur), sinon celles du style.
  function bordersItem(t) {
    const B = S().TABLE_BORDERS;
    const a = t.node.attrs.a;
    const own = a['data-borders'] !== undefined;
    const cur = own ? a['data-borders'].split(/\s+/).filter(Boolean) : (B.byStyle[a['data-style'] || 'quadrille'] || []);
    const same = (list) => own && list.length === cur.length && list.every((k) => cur.includes(k));
    const order = (list) => B.sides.map(([k]) => k).filter((k) => list.includes(k)).join(' ');
    const set = (fn) => () => {
      const now = tableAt(view.state.selection.$from);
      if (!now) return;
      const next = { ...now.node.attrs.a };
      fn(next);
      apply(view.state.tr.setNodeMarkup(now.pos, null, { ...now.node.attrs, a: next }));
    };
    const sides = (list) => set((x) => { x['data-borders'] = order(list); });
    return {
      text: 'Bordures',
      submenu: () => [
        { text: check(!own, 'Bordures du style'), action: set((x) => { delete x['data-borders']; delete x['data-bw']; }) },
        { text: check(same([...B.outer, 'h', 'v']), 'Toutes les bordures'), action: sides([...B.outer, 'h', 'v']) },
        { text: check(same(B.outer), 'Bordures extérieures'), action: sides(B.outer) },
        { text: check(same(['h', 'v']), 'Bordures intérieures'), action: sides(['h', 'v']) },
        { text: check(same(['haut', 'bas', 'h']), 'Lignes horizontales seules'), action: sides(['haut', 'bas', 'h']) },
        { text: check(own && !cur.length, 'Aucune bordure'), action: sides([]) },
        '-',
        ...B.sides.map(([k, label]) => ({ text: check(cur.includes(k), label), action: sides(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]) })),
        '-',
        ...B.widths.map(([v, label]) => ({
          text: check((a['data-bw'] || '') === v, label),
          action: set((x) => {
            if (x['data-borders'] === undefined) x['data-borders'] = order(cur);
            if (v) x['data-bw'] = v; else delete x['data-bw'];
          })
        }))
      ]
    };
  }

  // Fusion : une ligne restée sans case (lignes entières réunies) disparaît, les cases qui la
  // traversaient raccourcissent (comme les versions 1.x).
  function mergeCells(state, dispatch_) {
    const t = tableAt(state.selection.$from);
    return T.mergeCells(state, dispatch_ && ((tr) => {
      const tpos = t ? t.pos : null;
      for (let again = true; again && tpos !== null;) {
        again = false;
        const table = tr.doc.nodeAt(tpos);
        const map = T.TableMap.get(table);
        let rowPos = tpos + 1;
        for (let r = 0; r < table.childCount; r++) {
          const row = table.child(r);
          if (!row.childCount) {
            const seen = new Set();
            for (let c = 0; c < map.width; c++) {
              const off = map.map[r * map.width + c];
              if (seen.has(off)) continue;
              seen.add(off);
              const cell = table.nodeAt(off);
              if (cell && cell.attrs.rowspan > 1) tr.setNodeMarkup(tpos + 1 + off, null, { ...cell.attrs, rowspan: cell.attrs.rowspan - 1 });
            }
            tr.delete(rowPos, rowPos + row.nodeSize);
            again = true;
            break;
          }
          rowPos += row.nodeSize;
        }
      }
      dispatch_(tr);
    }));
  }

  function setTableAttrs(fn) {
    const t = tableAt(view.state.selection.$from);
    if (!t) return;
    const a = { ...t.node.attrs.a };
    fn(a);
    apply(view.state.tr.setNodeMarkup(t.pos, null, { ...t.node.attrs, a }));
  }

  // ----- Outils façon Word : couleur des cases, répartition, sélection -----

  // Propriété CSS d'un attribut style (couleur de fond d'une case, hauteur d'une ligne).
  function withStyle(a, prop, value) {
    const rest = String(a.style || '').split(';').map((x) => x.trim()).filter((x) => x && !x.toLowerCase().startsWith(prop + ':'));
    if (value) rest.push(prop + ': ' + value);
    const out = { ...a };
    if (rest.length) out.style = rest.join('; '); else delete out.style;
    return out;
  }
  const styleValue = (a, prop) => {
    const m = new RegExp('(?:^|;)\\s*' + prop + ':\\s*([^;]+)', 'i').exec(String(a.style || ''));
    return m ? m[1].trim() : '';
  };

  // Couleur de fond des cases choisies (ou de la case du curseur) ; '' la retire.
  function setCellFill(color) {
    const cells = cellsOf(view.state);
    if (!cells.length) return;
    const tr = view.state.tr;
    for (const c of cells) tr.setNodeMarkup(c.pos, null, { ...c.node.attrs, a: withStyle(c.node.attrs.a, 'background-color', color) });
    if (color && window.FTCouleurs) window.FTCouleurs.add(color);
    apply(tr);
  }
  const cellFill = () => { const c = cellsOf(view.state)[0]; return c ? styleValue(c.node.attrs.a, 'background-color') : ''; };

  const FILLS = [
    [['#f2f2f2', 'Gris très clair'], ['#d9d9d9', 'Gris clair'], ['#fbe4d5', 'Saumon clair'], ['#fff2cc', 'Jaune clair'],
      ['#e2efd9', 'Vert clair'], ['#deeaf6', 'Bleu clair'], ['#e7e0f1', 'Violet clair'], ['#f4e6da', 'Beige']],
    [['#a6a6a6', 'Gris'], ['#f4b183', 'Saumon'], ['#ffd966', 'Jaune'], ['#a8d08d', 'Vert'],
      ['#9cc3e5', 'Bleu'], ['#b4a7d6', 'Violet'], ['#c9a27e', 'Marron clair'], ['#595959', 'Gris foncé']]
  ];
  const swatch = (c) => `<svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" style="fill:${c};fill-opacity:1;stroke:rgba(0,0,0,.28);stroke-width:1"/></svg>`;
  function otherColor() {
    const input = document.createElement('input');
    input.type = 'color';
    const now = window.FTCouleurs ? window.FTCouleurs.norm(cellFill()) : '';
    input.value = /^#[0-9a-f]{6}$/.test(now) ? now : '#deeaf6';
    input.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0';
    document.body.append(input);
    input.addEventListener('change', () => setCellFill(input.value));
    input.addEventListener('blur', () => setTimeout(() => input.remove(), 500));
    input.click();
  }
  function fillItems() {
    const now = window.FTCouleurs ? window.FTCouleurs.norm(cellFill()) : cellFill();
    const row = (list) => ({ icons: list.map(([c, t]) => ({ html: swatch(c), title: t, on: now === c, action: () => setCellFill(c) })) });
    const recent = window.FTCouleurs ? window.FTCouleurs.list().filter((c) => c.startsWith('#') && !FILLS.flat().some(([x]) => x === c)) : [];
    return [
      { label: 'Couleur de fond des cellules' },
      ...FILLS.map(row),
      ...(recent.length ? [{ label: 'Récentes' }, row(recent.map((c) => [c, c]))] : []),
      '-',
      { text: 'Autre couleur…', action: otherColor },
      { text: 'Aucune couleur', disabled: !now, action: () => setCellFill('') }
    ];
  }

  // Colonnes de même largeur (comme le double-clic sur un trait de colonne).
  function distributeColumns() {
    const t = tableAt(view.state.selection.$from);
    if (!t) return;
    const cols = t.node.attrs.cols;
    let next = null;
    // Tableau ajusté au contenu, aux colonnes réglées en pixels : la largeur totale est gardée.
    if (cols && cols.length && t.node.attrs.a['data-width'] === 'auto') {
      const ws = cols.map(widthOf);
      if (ws.every((w) => w && w[2] === 'px')) {
        const mean = ws.reduce((sum, w) => sum + Number(w[1]), 0) / ws.length;
        next = cols.map((c) => withWidth(c, Math.round(mean), 'px'));
      }
    }
    apply(view.state.tr.setNodeMarkup(t.pos, null, { ...t.node.attrs, cols: next }));
  }

  // Lignes de même hauteur : celle de la plus haute.
  function distributeRows() {
    const t = tableAt(view.state.selection.$from);
    if (!t) return;
    const rows = [];
    t.node.forEach((row, offset) => {
      const pos = t.pos + 1 + offset;
      const dom = view.nodeDOM(pos);
      const k = (dom && dom.currentCSSZoom) || 1;
      rows.push({ pos, row, h: dom ? dom.getBoundingClientRect().height / k : 0 });
    });
    const max = Math.round(Math.max(...rows.map((r) => r.h)));
    if (!max) return;
    const tr = view.state.tr;
    for (const r of rows) tr.setNodeMarkup(r.pos, null, { ...r.row.attrs, a: withStyle(r.row.attrs.a, 'height', max + 'px') });
    apply(tr);
  }

  function selectCells(kind) {
    let $cell = null;
    try { $cell = T.selectionCell(view.state); } catch { /* pas dans un tableau */ }
    if (!$cell) return;
    let sel;
    if (kind === 'ligne') sel = T.CellSelection.rowSelection($cell);
    else if (kind === 'colonne') sel = T.CellSelection.colSelection($cell);
    else {
      const t = tableAt($cell);
      const map = T.TableMap.get(t.node);
      sel = T.CellSelection.create(view.state.doc, t.pos + 1 + map.map[0], t.pos + 1 + map.map[map.map.length - 1]);
    }
    view.dispatch(view.state.tr.setSelection(sel));
    view.focus();
  }
  const selectItem = () => ({
    text: 'Sélectionner',
    submenu: () => [
      { text: 'La ligne', action: () => selectCells('ligne') },
      { text: 'La colonne', action: () => selectCells('colonne') },
      { text: 'Le tableau', action: () => selectCells('tableau') }
    ]
  });

  // ----- Barre « Tableau » (barre de l'objet, layout.js) -----
  // Affichée quand le curseur ou la sélection de cases est dans un tableau, comme l'onglet Tableau de Word.

  const tsvg = (body) => `<svg class="thin" viewBox="0 0 16 16">${body}</svg>`;
  const TICONS = {
    rowAbove: tsvg('<rect x="1.5" y="7.5" width="13" height="7"/><path d="M1.5 11h13M6 7.5v7M10 7.5v7"/><rect class="fill" x="1.5" y="1.5" width="13" height="4.3"/><path d="M8 2.4v2.5M6.75 3.65h2.5"/>'),
    rowBelow: tsvg('<rect x="1.5" y="1.5" width="13" height="7"/><path d="M1.5 5h13M6 1.5v7M10 1.5v7"/><rect class="fill" x="1.5" y="10.2" width="13" height="4.3"/><path d="M8 11.1v2.5M6.75 12.35h2.5"/>'),
    colLeft: tsvg('<rect x="7.5" y="1.5" width="7" height="13"/><path d="M11 1.5v13M7.5 6h7M7.5 10h7"/><rect class="fill" x="1.5" y="1.5" width="4.3" height="13"/><path d="M3.65 6.75v2.5M2.4 8h2.5"/>'),
    colRight: tsvg('<rect x="1.5" y="1.5" width="7" height="13"/><path d="M5 1.5v13M1.5 6h7M1.5 10h7"/><rect class="fill" x="10.2" y="1.5" width="4.3" height="13"/><path d="M12.35 6.75v2.5M11.1 8h2.5"/>'),
    remove: tsvg('<rect x="1.5" y="2" width="13" height="12"/><path d="M1.5 6h13M1.5 10h13M8 2v4M8 10v4"/><rect class="solid" x="4" y="6.6" width="8" height="2.8" rx="1.4"/><path d="M5.6 8h4.8"/>'),
    merge: tsvg('<rect x="1.5" y="3.5" width="13" height="9"/><path d="M8 3.5v1.6M8 10.9v1.6M3.4 8h3.2M5.3 6.5 6.8 8l-1.5 1.5M12.6 8H9.4M10.7 6.5 9.2 8l1.5 1.5"/>'),
    split: tsvg('<rect x="1.5" y="3.5" width="13" height="9"/><path d="M8 3.5v9M6.4 8H3.4M4.9 6.5 3.4 8l1.5 1.5M9.6 8h3M11.1 6.5 12.6 8l-1.5 1.5"/>'),
    fill: (c) => tsvg('<path d="M2.6 7.6 7 3.2l4.4 4.4-4.2 4.2a1 1 0 0 1-1.4 0L2.6 9a1 1 0 0 1 0-1.4zM5.2 1.4 7 3.2M2.9 8h8.2"/><path d="M13 8.6s1.3 1.5 1.3 2.4a1.3 1.3 0 0 1-2.6 0c0-.9 1.3-2.4 1.3-2.4z"/>'
      + `<rect x="1.5" y="13.3" width="13" height="2.2" rx=".6" style="fill:${c || 'transparent'};fill-opacity:1;stroke:${c ? 'none' : 'currentColor'};stroke-dasharray:${c ? 'none' : '1.2 1.2'}"/>`),
    borders: tsvg('<rect x="2" y="2" width="12" height="12"/><path d="M8 2.6v10.8M2.6 8h10.8" stroke-dasharray="1.3 1.3"/>'),
    valign: (v) => {
      const y = v === 'milieu' ? 6.6 : v === 'bas' ? 10 : 3.6;
      return tsvg(`<rect x="1.5" y="1.5" width="13" height="13"/><path d="M4.5 ${y}h7M4.5 ${y + 2.6}h5"/>`);
    },
    spread: tsvg('<rect x="1.5" y="3" width="13" height="10"/><path d="M5.8 3v10M10.2 3v10M2.6 8h2.1M6.9 8h2.2M11.3 8h2.1"/>'),
    width: tsvg('<path d="M1.5 2.5v11M14.5 2.5v11"/><rect class="fill" x="3.3" y="5" width="9.4" height="6"/><path d="M4.2 8h7.6M5.6 6.6 4.2 8l1.4 1.4M10.4 6.6 11.8 8l-1.4 1.4"/>'),
    header: tsvg('<rect x="1.5" y="2.5" width="13" height="11"/><rect class="fill" x="1.5" y="2.5" width="13" height="3.7"/><path d="M1.5 6.2h13M1.5 9.9h13M8 2.5v11"/>'),
    style: tsvg('<rect x="1.5" y="1.5" width="10" height="9"/><path d="M1.5 4.6h10M1.5 7.6h10M5 1.5v9"/><path class="fill" d="M9.4 14.6c.2-1.3.7-2 1.6-2.3l3-3.2 1 1-3.2 3c-.3.9-1 1.4-2.4 1.5z"/>')
  };

  // Tableau du curseur, ou tableau choisi d'un clic sur sa poignée.
  function currentTable(state) {
    const sel = state.selection;
    if (sel.node && sel.node.type === N.table) return { node: sel.node, pos: sel.from };
    return tableAt(sel.$from);
  }
  // Tableau choisi en entier : les outils agissent à partir de sa première case.
  function intoTable() {
    const sel = view.state.selection;
    if (sel.node && sel.node.type === N.table) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(sel.from + 3))));
  }

  // Cases choisies dans un même tableau : clé des icônes (layout.js ne refait la barre que si elle change).
  function tableToolsKey() {
    const t = currentTable(view.state);
    if (!t) return '';
    const a = t.node.attrs.a;
    const c = cellsOf(view.state)[0];
    return [!!T.mergeCells(view.state), !!T.splitCell(view.state), cellFill(), c ? c.node.attrs.a['data-valign'] || '' : '', a['data-header'] || '', a['data-width'] || ''].join('|');
  }

  // Groupes d'icônes : [{ html, title, on, disabled, action(bouton) }].
  function tableTools() {
    const t = currentTable(view.state);
    if (!t) return null;
    const a = t.node.attrs.a;
    const menuAt = (items) => (b) => {
      intoTable();
      const r = b.getBoundingClientRect();
      window.FTSidebar.showMenu(r.left, r.bottom + 4, typeof items === 'function' ? items() : items);
    };
    const c = cellsOf(view.state)[0];
    const valign = c ? c.node.attrs.a['data-valign'] || '' : '';
    const groups = [
      [
        { html: TICONS.rowAbove, title: 'Insérer une ligne au-dessus', action: tcmd(T.addRowBefore) },
        { html: TICONS.rowBelow, title: 'Insérer une ligne en dessous', action: tcmd(T.addRowAfter) },
        { html: TICONS.colLeft, title: 'Insérer une colonne à gauche', action: colCmd('before') },
        { html: TICONS.colRight, title: 'Insérer une colonne à droite', action: colCmd('after') },
        { html: TICONS.remove, title: 'Supprimer une ligne ou une colonne', action: menuAt([
          { text: 'Supprimer la ligne', action: tcmd(T.deleteRow) },
          { text: 'Supprimer la colonne', action: colCmd('delete') },
          '-',
          { text: 'Supprimer le tableau', danger: true, action: tcmd(T.deleteTable) }
        ]) }
      ],
      [
        { html: TICONS.merge, title: 'Fusionner les cellules (choisies à la souris)', disabled: !T.mergeCells(view.state), action: tcmd(mergeCells) },
        { html: TICONS.split, title: 'Fractionner la cellule', disabled: !T.splitCell(view.state), action: tcmd(T.splitCell) }
      ],
      [
        { html: TICONS.fill(cellFill()), title: 'Couleur de fond des cellules', action: menuAt(fillItems) },
        { html: TICONS.borders, title: 'Bordures', action: menuAt(() => bordersItem(tableAt(view.state.selection.$from)).submenu()) },
        { html: TICONS.valign(valign), title: 'Alignement vertical du texte dans les cellules', action: menuAt(() => valignItem().submenu()) }
      ],
      [
        { html: TICONS.spread, title: 'Répartir : colonnes de même largeur, ou lignes de même hauteur', action: menuAt([
          { text: 'Colonnes de même largeur', action: distributeColumns },
          { text: 'Lignes de même hauteur', action: distributeRows }
        ]) },
        { html: TICONS.width, title: 'Toute la largeur de la page (sinon : ajusté au contenu)', on: a['data-width'] !== 'auto', action: () => setTableAttrs((x) => {
          if (x['data-width'] === 'auto') delete x['data-width']; else x['data-width'] = 'auto';
        }) },
        { html: TICONS.header, title: "Ligne d'en-tête", on: !!a['data-header'], action: () => setTableData('data-header') },
        { html: TICONS.style, title: 'Style du tableau…', action: () => window.FTStyles.open('tableaux', view.nodeDOM(tableAt(view.state.selection.$from).pos)) }
      ]
    ];
    for (const g of groups) for (const it of g) { const run = it.action; it.action = (b) => { intoTable(); run(b); }; }
    return groups;
  }

  function tableMenu() {
    const t = tableAt(view.state.selection.$from);
    if (!t) return null;
    const a = t.node.attrs.a;
    const dom = view.nodeDOM(t.pos);
    const items = [
      {
        text: 'Lignes et colonnes',
        submenu: () => [
          { text: 'Ajouter une ligne au-dessus', action: tcmd(T.addRowBefore) },
          { text: 'Ajouter une ligne en dessous', action: tcmd(T.addRowAfter) },
          { text: 'Ajouter une colonne à gauche', action: colCmd('before') },
          { text: 'Ajouter une colonne à droite', action: colCmd('after') },
          '-',
          { text: 'Supprimer la ligne', action: tcmd(T.deleteRow) },
          { text: 'Supprimer la colonne', action: colCmd('delete') }
        ]
      }
    ];
    if (T.mergeCells(view.state)) items.push({ text: 'Fusionner les cellules', action: tcmd(mergeCells) });
    if (T.splitCell(view.state)) items.push({ text: 'Fractionner la cellule', action: tcmd(T.splitCell) });
    const wrap = (window.FTLayout && window.FTLayout.wrapMenu(dom)) || [];
    items.push(selectItem(), '-',
      { text: 'Couleur de fond des cellules', submenu: fillItems },
      valignItem(), bordersItem(t),
      { text: 'Répartir', submenu: () => [
        { text: 'Colonnes de même largeur', action: distributeColumns },
        { text: 'Lignes de même hauteur', action: distributeRows }
      ] },
      '-',
      ...((window.FTCaptions && window.FTCaptions.tableItems(dom)) || []),
      { text: 'Style…', action: () => window.FTStyles.open('tableaux', view.nodeDOM(tableAt(view.state.selection.$from).pos)) },
      { text: check(!!a['data-header'], "Ligne d'en-tête"), action: () => setTableData('data-header') },
      { text: check(!!a['data-header'] && !!a['data-repeat'], "Répéter l'en-tête sur chaque page"), action: () => setTableAttrs((x) => {
        if (x['data-header'] && x['data-repeat']) delete x['data-repeat'];
        else { x['data-header'] = 'oui'; x['data-repeat'] = 'oui'; }
      }) },
      { text: check(!!a['data-bands'], 'Lignes à bandes'), action: () => setTableData('data-bands') },
      { text: check(a['data-width'] !== 'auto', 'Toute la largeur de la page'), action: () => setTableAttrs((x) => {
        if (x['data-width'] === 'auto') delete x['data-width']; else x['data-width'] = 'auto';
      }) },
      ...(wrap.length ? ['-', ...wrap] : []),
      '-',
      { text: 'Supprimer le tableau', danger: true, action: tcmd(T.deleteTable) });
    return items;
  }

  function contextMenu(v, e) {
    const pos = v.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!pos) return false;
    const $p = v.state.doc.resolve(pos.pos);
    if (!tableAt($p)) return false;
    // Clic droit hors de la sélection de cases : le curseur va où l'on a cliqué.
    const sel = v.state.selection;
    if (!(sel instanceof T.CellSelection) && (pos.pos < sel.from || pos.pos > sel.to)) v.dispatch(v.state.tr.setSelection(TextSelection.near($p)));
    e.preventDefault();
    const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const G = window.FTGeneres;
    window.FTSidebar.showMenu(e.clientX, e.clientY, G ? G.menuAt(target, e.clientX, e.clientY, tableMenu()) : tableMenu());
    return true;
  }

  // Lignes porteuses (moteur/schema.js) : data-porteur à l'affichage, refait autour de chaque changement.
  const { Decoration, DecorationSet } = PM.view;
  function carriers(doc, from, to, out) {
    doc.nodesBetween(from, to, (n, pos) => {
      if (n.type === N.list_item && n.firstChild && isList(n.firstChild)) out.push(Decoration.node(pos, pos + n.nodeSize, { 'data-porteur': '' }));
      return !n.isTextblock && !n.isAtom;
    });
    return out;
  }
  M.addPlugin(new Plugin({
    state: {
      init: (_, state) => DecorationSet.create(state.doc, carriers(state.doc, 0, state.doc.content.size, [])),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        set = set.map(tr.mapping, tr.doc);
        const size = tr.doc.content.size;
        tr.mapping.maps.forEach((map, i) => map.forEach((a, b, start, end) => {
          const rest = tr.mapping.slice(i + 1);
          const $a = tr.doc.resolve(Math.min(rest.map(start, -1), size));
          const $b = tr.doc.resolve(Math.min(rest.map(end, 1), size));
          const from = $a.depth ? $a.before(1) : $a.pos;
          const to = $b.depth ? $b.after(1) : $b.pos;
          set = set.remove(set.find(from, to)).add(tr.doc, carriers(tr.doc, from, to, []));
        }));
        return set;
      }
    },
    props: { decorations(state) { return this.getState(state); } }
  }));

  // Tiret ou numéro de liste au format du texte qu'il précède (police, taille, gras, italique, couleur) :
  // lu à l'écran sur le premier texte de chaque ligne, posé sur la ligne (data-mk-* et --mk-*, voir
  // styles.css) quand il diffère de celui de la ligne elle-même (sinon le tiret garde le style du thème).
  const MK = [['ff', 'fontFamily'], ['fs', 'fontSize'], ['fw', 'fontWeight'], ['fi', 'fontStyle'], ['c', 'color']];
  const mkKey = new PM.state.PluginKey('ft-marques-liste');
  function markerLook(li) {
    let el = null;
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (t.parentElement.closest('li') === li ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.data.trim()) { el = t.parentElement; break; }
    if (!el) el = li.firstElementChild;
    if (!el || el.matches('ul, ol')) return '';
    const a = getComputedStyle(li);
    const b = getComputedStyle(el);
    return MK.filter(([, k]) => a[k] !== b[k]).map(([n, k]) => `${n}=${b[k]}`).join('|');
  }
  function markerAttrs(look) {
    const attrs = { style: '' };
    for (const part of look.split('|')) {
      const i = part.indexOf('=');
      const n = part.slice(0, i);
      attrs['data-mk-' + n] = '';
      attrs.style += `--mk-${n}: ${part.slice(i + 1)}; `;
    }
    return attrs;
  }
  M.addPlugin(new Plugin({
    key: mkKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const looks = tr.getMeta(mkKey);
        if (looks) return DecorationSet.create(tr.doc, looks.map(([pos, look]) => Decoration.node(pos, pos + tr.doc.nodeAt(pos).nodeSize, markerAttrs(look), { look })));
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
      }
    },
    props: { decorations(state) { return mkKey.getState(state); } },
    view(v) {
      let timer = 0;
      const measure = () => {
        timer = 0;
        if (!v.dom.isConnected) return;
        const looks = [];
        for (const li of v.dom.querySelectorAll('li')) {
          if (li.closest('[data-pm-far]') || !li.offsetParent) continue;
          let pos;
          try { pos = v.posAtDOM(li, 0) - 1; } catch (err) { continue; }
          const node = pos >= 0 && v.state.doc.nodeAt(pos);
          if (!node || node.type !== N.list_item) continue;
          const look = markerLook(li);
          if (look) looks.push([pos, look]);
        }
        // (Rien à changer : pas de transaction.)
        const sig = looks.map((x) => x.join(':')).join(';');
        const had = mkKey.getState(v.state).find().map((d) => d.from + ':' + d.spec.look).join(';');
        if (sig !== had) v.dispatch(v.state.tr.setMeta(mkKey, looks).setMeta('addToHistory', false));
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(measure, 120); };
      later();
      // (Lignes affichées en faisant défiler un long document.)
      window.addEventListener('scroll', later, true);
      return {
        update: (view, prev) => { if (view.state.doc !== prev.doc) later(); },
        destroy: () => { clearTimeout(timer); window.removeEventListener('scroll', later, true); }
      };
    }
  }));

  // Retour à la ligne resté dans un texte ordinaire (bloc de code réuni à la ligne d'avant, texte
  // collé…) : il devient un saut de ligne (Maj+Entrée), sinon il s'afficherait comme une espace.
  M.addPlugin(new Plugin({
    appendTransaction(trs, _old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      let ranges = [];
      for (const t of trs) {
        ranges = ranges.map(([a, b]) => [t.mapping.map(a, -1), t.mapping.map(b, 1)]);
        t.mapping.maps.forEach((map, i) => map.forEach((a, b, start, end) => ranges.push([t.mapping.slice(i + 1).map(start, -1), t.mapping.slice(i + 1).map(end, 1)])));
      }
      const size = state.doc.content.size;
      const found = [];
      for (const [a, b] of ranges) {
        state.doc.nodesBetween(Math.max(0, Math.min(a, size)), Math.max(0, Math.min(b, size)), (n, pos, parent) => {
          if (n.isText && n.text.includes('\n') && !parent.type.spec.code && parent.type.contentMatch.matchType(N.hard_break)) found.push(pos);
          return !n.isText;
        });
      }
      if (!found.length) return null;
      const tr = state.tr;
      for (const pos of [...new Set(found)].sort((x, y) => y - x)) {
        const n = tr.doc.nodeAt(pos);
        if (!n || !n.isText) continue;
        for (let i = n.text.lastIndexOf('\n'); i >= 0; i = i ? n.text.lastIndexOf('\n', i - 1) : -1) {
          tr.replaceWith(pos + i, pos + i + 1, N.hard_break.create());
        }
      }
      return tr.docChanged ? tr : null;
    }
  }));

  M.addPlugin(keymap(keys));
  M.addPlugin(new Plugin({
    props: {
      handleTextInput: typed,
      handleDOMEvents: {
        mousedown: checkClick,
        contextmenu: contextMenu
      }
    }
  }));

  // ----- Clic droit sur une ligne, un titre, une ligne de liste, un encadré (comme les versions 1.x) -----

  // Le curseur va dans l'élément cliqué (à la fin), puis le choix s'applique à lui.
  // (Ligne de liste : à la fin de sa propre ligne, pas dans ses sous-lignes.)
  function inEl(el, fn) {
    return () => {
      let pos = null;
      try { pos = view.posAtDOM(el, el.tagName === 'LI' ? 0 : el.childNodes.length); } catch { /* élément refait */ }
      if (pos !== null && el.tagName === 'LI') {
        const $line = TextSelection.near(view.state.doc.resolve(pos), 1).$from;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $line.end())));
      } else if (pos !== null) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos), -1)));
      view.focus();
      fn();
    };
  }

  function typeItem(block) {
    const heading = /^H[1-6]$/.test(block.tagName);
    const title = heading && block.classList.contains('ft-title');
    const level = !heading ? -1 : title ? 0 : Number(block.tagName[1]);
    const set = (tag) => inEl(block, () => setBlock(tag));
    return {
      text: 'Type de ligne',
      submenu: () => [
        { text: check(level === -1, 'Texte normal'), action: set('p') },
        { text: check(title, 'Titre du document'), action: set('title') },
        ...Array.from({ length: LEVELS }, (_, i) => ({ text: check(level === i + 1, `Titre ${i + 1}`), action: set('h' + (i + 1)) }))
      ]
    };
  }

  // Titre numéroté ou non (Introduction, Conclusion… sans numéro) : data-nonum.
  function numberItem(h) {
    const level = Number(h.tagName[1]);
    if (h.classList.contains('ft-title') || level > LEVELS || !window.FTStructure.numbered(level)) return [];
    const on = !h.hasAttribute('data-nonum');
    return [{
      text: check(on, 'Numéroter ce titre'),
      action: inEl(h, () => {
        const found = ancestor(view.state.selection.$from, (n) => n.type === N.heading);
        if (!found) return;
        const tr = view.state.tr;
        tr.setNodeMarkup(found.pos, null, { ...found.node.attrs, a: withData(found.node.attrs.a, 'data-nonum', on ? 'oui' : '') });
        apply(tr);
      })
    }];
  }

  function headingItems(h) {
    const text = h.textContent.replace(/\s+/g, ' ').trim();
    const App = window.FTApp;
    const named = App && text && App.docName() === text.slice(0, 80);
    return [
      typeItem(h),
      ...numberItem(h),
      ...(App && text ? [{ text: check(named, 'Nommer le document'), action: () => App.setName(text) }] : []),
      '-',
      { text: 'Style…', action: () => window.FTStyles.open('titres', h) }
    ];
  }

  // Ligne de la liste du curseur : la changer d'un coup (une étape d'annulation).
  function onItem(li, fn) {
    return inEl(li, () => {
      const item = ancestor(view.state.selection.$from, (n) => n.type === N.list_item);
      if (!item) return;
      const tr = view.state.tr;
      fn(tr, item);
      if (tr.docChanged) apply(tr);
    });
  }

  // Numérotation affichée de chaque niveau au-dessus d'une liste (et du sien) : '1', 'i', 'I', 'a', 'A'.
  const NUM_CSS = { decimal: '1', 'lower-roman': 'i', 'upper-roman': 'I', 'lower-alpha': 'a', 'upper-alpha': 'A' };
  function shownNumbers(list, level) {
    const cs = getComputedStyle(list);
    return Array.from({ length: level }, (_, j) => NUM_CSS[cs.getPropertyValue('--ft-f' + (j + 1)).trim()] || '1');
  }

  function listItems(li) {
    const list = li.parentElement;
    let outer = list;
    for (let n = list.parentElement; n && n !== view.dom; n = n.parentElement) if (n.matches('ul, ol')) outer = n;
    let topOl = null;
    let level = 0;
    for (let n = list; n && n !== view.dom; n = n.parentElement) if (n.tagName === 'OL') { topOl = n; level++; }
    if (list.tagName !== 'OL') level++;
    const S_ = S();
    const shown = shownNumbers(list, level);
    const current = list.tagName === 'OL' ? shown[level - 1] : null;
    const checkList = list.tagName === 'UL' && !!li.closest('ul.ft-check');
    // Numérotation de ce niveau, pour toute la liste : 1.1. 1.2. ou 1.a. 1.b. …
    const items = [{
      text: level > 1 ? `Numérotation du niveau ${level}` : 'Numérotation',
      submenu: () => [
        ...S_.numChoices().map(([f]) => {
          const nums = shown.map((x, j) => (j === level - 1 ? f : x));
          return { text: check(current === f, `${S_.numLabel(nums, level)}  ${S_.numLabel(nums, level, 2)}  ${S_.numLabel(nums, level, 3)}`), action: inEl(li, () => toggleList(NUM_DATA[f])) };
        }),
        ...(current !== null ? ['-', {
          text: 'Remettre des tirets',
          action: onItem(li, (tr) => {
            const l = ancestor(tr.selection.$from, isList);
            if (l) tr.setNodeMarkup(l.pos, N.bullet_list, { a: withData(l.node.attrs.a, 'data-num', '') });
          })
        }] : [])
      ]
    }];
    if (checkList) {
      items.push(
        { text: li.dataset.checked ? 'Décocher la case' : 'Cocher la case', action: onItem(li, (tr, item) => tr.setNodeMarkup(item.pos, null, { a: withData(item.node.attrs.a, 'data-checked', item.node.attrs.a['data-checked'] ? '' : 'oui') })) },
        { text: 'Enlever les cases (garder le texte)', action: inEl(li, toggleCheck) },
        '-'
      );
    } else {
      items.push({ text: 'Mettre des cases à cocher', action: inEl(li, toggleCheck) });
    }
    if (window.FTSort) items.push(window.FTSort.listItem(li));
    items.push(
      { text: 'Décaler vers la droite (-- ou Tab)', action: inEl(li, () => { sinkItem(view.state, view.dispatch); }) },
      { text: 'Décaler vers la gauche (Maj+Tab)', action: inEl(li, () => { liftItem(view.state, view.dispatch); }) }
    );
    if (outer.tagName === 'UL' && !outer.classList.contains('ft-check')) items.push('-', { text: 'Style…', action: () => window.FTStyles.open('tirets', outer) });
    else if (topOl && list.tagName === 'OL') items.push('-', { text: 'Style…', action: () => window.FTStyles.open('numeros', topOl) });
    return items;
  }

  // Ce que propose le clic droit pour la ligne cliquée (target : élément du texte affiché).
  function lineItems(target) {
    const el = target && target.nodeType === 1 ? target : target && target.parentElement;
    if (!el || !view.dom.contains(el) || el.closest('.ft-caption, .ft-footnotes, .ft-endnotes, .ft-biblio, td, th')) return [];
    const li = el.closest('li');
    if (li && view.dom.contains(li)) return listItems(li);
    const h = el.closest('h1, h2, h3, h4, h5, h6');
    if (h && view.dom.contains(h)) return headingItems(h);
    const p = el.closest('p');
    if (p && view.dom.contains(p) && !p.classList.contains('ft-legend') && !p.classList.contains('ft-quote-src')) return [typeItem(p)];
    return [];
  }

  // Encadré ou citation : style, source, retirer (le texte reste) ; layout.js et objets.js ajoutent la
  // position et la suppression.
  function calloutItems(box) {
    const quote = box.classList.contains('ft-quote');
    const first = box.querySelector('p, h1, h2, h3, h4, h5, h6, li') || box;
    return {
      top: [
        { text: 'Style…', action: () => window.FTStyles.open(quote ? 'citations' : 'encadres', box) },
        ...(quote && !box.querySelector(':scope > p.ft-quote-src') ? [{ text: 'Ajouter la source', action: inEl(first, addQuoteSource) }] : [])
      ],
      remove: { text: quote ? 'Retirer la citation (garder le texte)' : "Retirer l'encadré (garder le texte)", action: inEl(first, () => (quote ? toggleQuote() : toggleCallout())) }
    };
  }

  // Source d'une citation : une ligne à la fin du bloc, son texte sélectionné pour être remplacé.
  function addQuoteSource() {
    const box = ancestor(view.state.selection.$from, isCallout);
    if (!box) return;
    const end = box.pos + box.node.nodeSize - 1;
    const src = N.paragraph.create({ tag: 'p', a: { class: 'ft-quote-src' }, bare: false }, schema.text('Auteur, œuvre'));
    const tr = view.state.tr.insert(end, src);
    tr.setSelection(TextSelection.create(tr.doc, end + 1, end + 1 + src.content.size));
    apply(tr);
  }

  // ----- Menu « Titres, listes et encadrés » -----

  const structurePop = document.getElementById('structure-pop');
  const closePops = () => document.querySelectorAll('#structure-pop, #table-pop, #styles-pop').forEach((p) => { p.hidden = true; });

  function popButton(html, title, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = html;
    if (title) b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { closePops(); action(); });
    return b;
  }

  function numRow() {
    const row = document.createElement('div');
    row.className = 'num-styles';
    for (const [f, example] of S().numChoices()) {
      const label = f + '.';
      const b = popButton(label, `Numérotation ${example}  (taper ${label} puis espace en début de ligne ; -- pour décaler)`, () => toggleList(NUM_DATA[f]));
      b.className = 'num-style';
      row.append(b);
    }
    return row;
  }

  // Rangée « Trier » : la liste du curseur ou les lignes sélectionnées (sort.js).
  function sortRow() {
    const row = document.createElement('div');
    row.className = 'num-styles sort-row';
    const label = document.createElement('span');
    label.className = 'sort-label';
    label.textContent = 'Trier';
    row.append(label);
    for (const [mode, text, title] of [['az', 'A → Z', 'De A à Z'], ['za', 'Z → A', 'De Z à A'], ['date', 'Date', 'Par date, plus ancienne en premier'], ['num', 'Nombre', 'Par nombre, croissant']]) {
      const b = popButton(text, `${title} : la liste du curseur ou les lignes sélectionnées`, () => window.FTSort.sortHere(mode));
      b.className = 'num-style';
      row.append(b);
    }
    return row;
  }

  function buildStructurePop() {
    const hint = (t) => `<kbd>${t}</kbd>`;
    structurePop.textContent = '';
    structurePop.append(
      popButton('<span>Texte normal</span>', '', () => setBlock('p')),
      popButton('<span class="ft-preview-h0">Titre du document</span>', 'Le grand titre en tête du texte (sans numéro). Il peut être déplacé ou effacé', () => setBlock('title')),
      ...Array.from({ length: LEVELS }, (_, i) => popButton(
        `<span class="ft-preview-h${i + 1}">Titre ${i + 1}</span>${hint('#'.repeat(i + 1))}`,
        `Taper ${'#'.repeat(i + 1)} puis espace en début de ligne`,
        () => setBlock('h' + (i + 1))
      )),
      document.createElement('hr'),
      popButton(`<span>Liste à tirets</span>${hint('-')}`, 'Taper - puis espace en début de ligne ; -- pour décaler', () => toggleList(false)),
      popButton(`<span>Liste numérotée</span>${hint('1.')}`, 'Taper 1. puis espace en début de ligne ; -- pour décaler', () => toggleList(true)),
      numRow(),
      popButton(`<span>Liste à cocher</span>${hint('[ ]')}`, 'Taper [] puis espace en début de ligne ([x] pour une case déjà cochée)', toggleCheck),
      sortRow(),
      popButton(`<span>Encadré</span>${hint('&gt;')}`, 'Taper > puis espace en début de ligne', toggleCallout),
      popButton(`<span>Bloc de code</span>${hint('```')}`, 'Taper ``` puis espace en début de ligne', () => window.FTCode.toggle()),
      popButton(`<span>Ligne de séparation</span>${hint('__')}`, 'Taper __ sur une ligne vide', insertRule),
      popButton('<span>Plan du document</span>', 'Insère le plan (titre du document et titres # à #####) à l\'endroit du curseur ; il se met à jour tout seul', () => window.FTToc.insert()),
      popButton(`<span>Note de bas de page</span>${hint('^')}`, 'Taper ^ (puis espace sur un clavier français) à l\'endroit de l\'appel de note', () => window.FTStructure.insertFootnote()),
      document.createElement('hr'),
      popButton('<span>Styles du document…</span>', 'Titres, tirets, tableaux, encadrés, plan, schémas', () => window.FTStyles.open())
    );
  }
  buildStructurePop();

  // Boutons de la barre d'insertion : pris avant ceux des versions 1.x (qui agissent sur l'ancienne zone).
  const take = M.take;
  take('#bullets-btn', () => toggleList(false));
  take('#check-btn', toggleCheck);
  take('#quote-btn', toggleQuote);
  take('#callout-btn', toggleCallout);
  take('#table-quick', () => { closePops(); insertTable(); });
  take('#table-grid button', (e) => {
    const b = e.target.closest('button');
    closePops();
    insertTable({ rows: Number(b.dataset.r), cols: Number(b.dataset.c) });
  });
  take('#table-insert', () => {
    const clamp = (v, max) => Math.max(1, Math.min(max, Math.round(Number(v)) || 1));
    closePops();
    insertTable({ rows: clamp(document.getElementById('table-rows').value, 100), cols: clamp(document.getElementById('table-cols').value, 20) });
  });

  window.FTBlocs = { tableTools, tableToolsKey, setBlock, toggleList, toggleCheck, toggleCallout, toggleQuote, insertTable, insertRule, buildTable, placeBlock, lineItems, calloutItems };
})();
