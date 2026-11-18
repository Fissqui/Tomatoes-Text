// Zone d'écriture (nouveau moteur, version 2.0) et barre de mise en forme.
// Le texte est tenu par le moteur ProseMirror (vendor/prosemirror) : un modèle du document, d'où la page
// est redessinée, au lieu du texte modifiable du navigateur. Chaque frappe ne touche que la ligne écrite :
// le logiciel reste rapide sur un document de plusieurs centaines de pages.
// L'ancienne zone d'écriture (#editor) reste dans la page, vide et cachée : les outils des versions 1.x
// s'y installent, puis sont branchés sur le moteur (moteur/demarrage.js).
(function () {
  // Polices livrées avec le logiciel (voir fonts/fonts.css) : disponibles sur tous les ordinateurs.
  const BUILTIN_FONTS = [
    'Archivo', 'Atkinson Hyperlegible', 'Caveat', 'Crimson Pro', 'EB Garamond', 'Inter',
    'JetBrains Mono', 'Libre Baskerville', 'Literata', 'Lora', 'Merriweather', 'Montserrat',
    'Nunito', 'Open Sans', 'Playfair Display', 'Roboto', 'Source Serif 4'
  ];
  // Polices courantes de Windows, Office et macOS, proposées si elles sont présentes sur l'ordinateur.
  const COMMON_SYSTEM_FONTS = [
    'Aptos', 'Aptos Display', 'Aptos Serif', 'Aptos Narrow', 'Arial', 'Arial Black', 'Bahnschrift',
    'Book Antiqua', 'Bookman Old Style', 'Calibri', 'Calibri Light', 'Cambria', 'Candara',
    'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel', 'Courier New',
    'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Garamond', 'Georgia', 'Gill Sans MT',
    'Helvetica', 'Impact', 'Ink Free', 'Leelawadee', 'Leelawadee UI', 'Lucida Console',
    'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Palatino Linotype', 'Rockwell', 'Segoe Print',
    'Segoe Script', 'Segoe UI', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman',
    'Trebuchet MS', 'Verdana'
  ];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  const DEFAULT_FONT = 'Georgia';
  const DEFAULT_SIZE = 12;
  // « Automatique » : la couleur du texte par défaut, qui suit le mode jour/nuit.
  const AUTO_COLOR = 'auto';

  const { EditorState, TextSelection, Plugin } = PM.state;
  const { EditorView } = PM.view;
  const { DOMParser: PMParser } = PM.model;
  const { history, undo, redo, undoDepth, redoDepth, closeHistory } = PM.history;
  const { keymap } = PM.keymap;
  const { baseKeymap } = PM.commands;
  const { tableEditing } = PM.tables;
  const { dropCursor } = PM.dropcursor;
  const { gapCursor } = PM.gapcursor;
  const { schema } = window.FTSchema;

  const legacy = document.getElementById('editor');
  const fontSelect = document.getElementById('font-family');
  const sizeSelect = document.getElementById('font-size');
  const colorInput = document.getElementById('text-color');
  const colorSwatch = document.getElementById('color-swatch');
  const colorPop = document.getElementById('color-pop');
  const alignButtons = document.querySelectorAll('#toolbar [data-align]');
  const indentBtn = document.getElementById('auto-indent');
  const cmdButtons = document.querySelectorAll('#toolbar [data-cmd]');
  const scBtn = document.getElementById('smallcaps-btn');

  let onChange = () => {};
  let onSelectionText = () => {};
  let loading = false;

  // ----- Zone d'écriture -----

  // La zone du moteur prend la place de l'ancienne (même id « editor » une fois les modules chargés).
  const mount = document.createElement('div');
  mount.id = 'pm-editor';
  mount.dataset.placeholder = legacy.dataset.placeholder || '';
  legacy.after(mount);
  legacy.hidden = true;
  legacy.removeAttribute('contenteditable');

  // Extensions ajoutées par les autres fichiers du moteur (titres, listes, tableaux…) avant l'ouverture.
  const extraPlugins = [];
  const updateHooks = [];
  const beforeHooks = [];
  const loadHooks = [];

  // Frappe ordinaire : la lettre est écrite par le moteur lui-même, sans passer par l'édition du
  // navigateur (qui revérifie la mise en page autour du curseur, coûteux sur un très long document).
  // Les compositions (accents des touches mortes, saisie asiatique) restent confiées au navigateur.
  const typing = new Plugin({
    props: {
      // Le curseur vient d'être déplacé (flèche, clic) : le moteur le relit avant la touche suivante,
      // sans attendre que le navigateur le lui signale.
      // (Pas pour une touche rejouée par le moteur pendant qu'il relit un changement fait par le navigateur :
      // il relirait le curseur déjà déplacé, et Retour arrière au 2e caractère d'une ligne de liste la
      // faisait sortir de la liste.)
      handleKeyDown(v, e) {
        if (e.isTrusted) v.domObserver.flush();
        return false;
      },
      handleKeyPress(v, e) {
        if (v.composing || !e.charCode || (e.ctrlKey && !e.altKey) || e.metaKey) return false;
        const text = String.fromCharCode(e.charCode);
        if (/[\r\n]/.test(text)) return false;
        // Plusieurs cases d'un tableau choisies : elles sont vidées et la lettre s'écrit dans la première
        // (comme les versions 1.x ; sinon seule la dernière case était remplacée).
        const cells = v.state.selection;
        if (cells instanceof PM.tables.CellSelection) {
          const first = Math.min(...cells.ranges.map((r) => r.$from.pos));
          let tr = v.state.tr;
          PM.tables.deleteCellSelection(v.state, (t) => { tr = t; });
          v.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(first)))));
        }
        const { from, to } = v.state.selection;
        const deflt = () => v.state.tr.insertText(text, from, to);
        if (v.someProp('handleTextInput', (f) => f(v, from, to, text, deflt))) return true;
        v.dispatch(deflt().scrollIntoView());
        return true;
      }
    }
  });

  function plugins() {
    return [
      typing,
      ...extraPlugins,
      history({ depth: 300, newGroupDelay: 600 }),
      keymap(ownKeys),
      keymap(baseKeymap),
      dropCursor({ color: 'var(--accent)', width: 2 }),
      gapCursor(),
      // Un tableau entier peut être sélectionné comme un objet (objets.js).
      tableEditing({ allowTableNodeSelection: true })
    ];
  }

  const emptyDoc = () => schema.nodes.doc.create(null, schema.nodes.paragraph.create({ bare: false }));

  const view = new EditorView({ mount }, {
    state: EditorState.create({ schema, doc: emptyDoc() }),
    attributes: { spellcheck: 'false', translate: 'no' },
    dispatchTransaction,
    handlePaste
  });

  // Geste en cours sur un objet (objets.js) : il est appliqué avant cette modification, qui est ajustée.
  let guard = null;

  function dispatchTransaction(tr) {
    if (guard) tr = guard(tr);
    const state = view.state.apply(tr);
    for (const fn of beforeHooks) fn(tr, state);
    view.updateState(state);
    if (tr.docChanged) {
      updateEmpty();
      // (Contenu produit par le logiciel, refait tout seul : plan, numéros… — le document n'est pas modifié.)
      if (!loading && !tr.getMeta('ftQuiet')) onChange();
    }
    scheduleToolbar(tr.docChanged);
    for (const fn of updateHooks) fn(tr, state);
  }

  // Lance une commande du moteur (forme commande(state, dispatch, view)) sur le texte.
  function run(cmd) {
    const done = cmd(view.state, view.dispatch, view);
    if (!view.hasFocus()) view.focus();
    return done;
  }

  // Bouton repris par le moteur : son clic passe avant ceux des versions 1.x (qui agiraient sur l'ancienne zone).
  function take(selector, handler) {
    document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest(selector)) e.preventDefault(); }, true);
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest(selector);
      if (!el || el.disabled) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      handler(e);
    }, true);
  }

  // ----- Styles écrits dans l'attribut style -----

  const styleBox = document.createElement('span');
  // Change (ou retire, si value est vide) une propriété dans un texte « style ».
  function withStyle(style, prop, value) {
    styleBox.setAttribute('style', style || '');
    if (value === null || value === undefined || value === '') styleBox.style.removeProperty(prop);
    else styleBox.style.setProperty(prop, value);
    return styleBox.getAttribute('style') || '';
  }
  function styleValue(style, prop) {
    if (!style) return '';
    styleBox.setAttribute('style', style);
    return styleBox.style.getPropertyValue(prop);
  }
  // Attributs d'un élément avec une propriété de style changée (l'attribut style disparaît s'il est vide).
  function withStyleAttr(a, prop, value) {
    const style = withStyle(a.style, prop, value);
    const out = { ...a };
    if (style) out.style = style; else delete out.style;
    return out;
  }

  // ----- Mises en forme du texte -----
  // Le gras, l'italique, le souligné et le barré viennent soit d'une balise (b, i, u, s), soit d'un style
  // posé sur un <span> (texte des versions 1.x). Les deux sont reconnus et retirés ensemble.

  const KINDS = {
    bold: { mark: 'strong', tag: 'b', props: ['font-weight'], on: (v) => v === 'bold' || v === 'bolder' || Number(v) >= 600, off: ['font-weight', 'normal'] },
    italic: { mark: 'em', tag: 'i', props: ['font-style'], on: (v) => v === 'italic' || v === 'oblique', off: ['font-style', 'normal'] },
    underline: { mark: 'underline', tag: 'u', props: ['text-decoration-line', 'text-decoration'], word: 'underline' },
    strike: { mark: 'strike', tag: 's', props: ['text-decoration-line', 'text-decoration'], word: 'line-through' }
  };

  // Retire une mise en forme d'un style : renvoie le nouveau texte du style.
  function stripKind(style, kind) {
    const k = KINDS[kind];
    for (const prop of k.props) {
      const v = styleValue(style, prop);
      if (!v) continue;
      if (k.word) {
        if (!v.includes(k.word)) continue;
        const rest = v.split(/\s+/).filter((w) => w && w !== k.word);
        style = withStyle(style, prop, prop === 'text-decoration-line' ? rest.join(' ') : rest.filter((w) => /^(underline|line-through|overline)$/.test(w)).join(' '));
      } else if (k.on(v)) {
        style = withStyle(style, prop, '');
      }
    }
    return style;
  }

  const isInl = (m) => m.type === schema.marks.inl;
  // Un <span> qui ne porte qu'un style (pas de classe : ni commentaire, ni surlignage de révision…).
  const plainSpan = (m) => isInl(m) && m.attrs.tag === 'span' && Object.keys(m.attrs.a).every((k) => k === 'style');

  function markOn(marks, kind) {
    const k = KINDS[kind];
    return marks.some((m) => m.type.name === k.mark || (isInl(m) && !!m.attrs.a.style && stripKind(m.attrs.a.style, kind) !== m.attrs.a.style));
  }

  // Applique fn à toutes les marques des morceaux de texte de [from, to] (une seule étape par morceau).
  function rewriteMarks(tr, from, to, fn) {
    const changes = [];
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const a = Math.max(from, pos);
      const b = Math.min(to, pos + node.nodeSize);
      if (a >= b) return;
      const next = fn(node.marks);
      if (next !== node.marks) changes.push([a, b, next]);
    });
    for (const [a, b, marks] of changes) {
      tr.removeMark(a, b, null);
      for (const m of marks) tr.addMark(a, b, m);
    }
    return changes.length > 0;
  }

  // Les marques sans la mise en forme « kind ».
  function marksWithout(marks, kind) {
    const k = KINDS[kind];
    let changed = false;
    const out = [];
    for (const m of marks) {
      if (m.type.name === k.mark) { changed = true; continue; }
      if (isInl(m) && m.attrs.a.style) {
        const style = stripKind(m.attrs.a.style, kind);
        if (style !== m.attrs.a.style) {
          changed = true;
          const a = { ...m.attrs.a };
          if (style) a.style = style; else delete a.style;
          if (m.attrs.tag === 'span' && !Object.keys(a).length) continue;
          out.push(schema.marks.inl.create({ tag: m.attrs.tag, a }));
          continue;
        }
      }
      out.push(m);
    }
    return changed ? out : marks;
  }

  // Les marques avec une propriété de style donnée (value vide : propriété retirée partout).
  function marksWithStyle(marks, prop, value) {
    let changed = false;
    let host = null;
    const out = [];
    for (const m of marks) {
      if (isInl(m) && m.attrs.a.style && styleValue(m.attrs.a.style, prop)) {
        changed = true;
        if (value && !host && plainSpan(m)) {
          // Propriété changée sur place : l'ordre du style ne bouge pas.
          host = schema.marks.inl.create({ tag: 'span', a: withStyleAttr(m.attrs.a, prop, value) });
          out.push(host);
          value = null;
          continue;
        }
        const a = withStyleAttr(m.attrs.a, prop, '');
        if (m.attrs.tag === 'span' && !Object.keys(a).length) continue;
        const nm = schema.marks.inl.create({ tag: m.attrs.tag, a });
        out.push(nm);
        if (!host && plainSpan(nm)) host = nm;
        continue;
      }
      if (!host && plainSpan(m)) host = m;
      out.push(m);
    }
    if (value) {
      changed = true;
      if (host) {
        // Le même <span> reçoit la nouvelle propriété : pas de <span> imbriqués.
        const i = out.indexOf(host);
        out[i] = schema.marks.inl.create({ tag: 'span', a: withStyleAttr(host.attrs.a, prop, value) });
      } else {
        out.push(schema.marks.inl.create({ tag: 'span', a: { style: withStyle('', prop, value) } }));
      }
    }
    return changed ? sortMarks(out) : marks;
  }

  const sortMarks = (marks) => marks.reduce((set, m) => m.addToSet(set), []);

  // Bloc de texte (paragraphe, titre…) où se trouve le début de la sélection, et son élément à l'écran.
  function blockDom(state = view.state) {
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.isTextblock) {
        const dom = view.nodeDOM($from.before(d));
        return dom && dom.nodeType === 1 ? dom : null;
      }
    }
    return null;
  }

  // Élément à l'écran au début de la sélection (pour lire son style calculé) : sans sélection, le
  // texte juste avant le curseur ; avec une sélection, son premier caractère.
  function domAtSelection(state = view.state) {
    const sel = state.selection;
    const back = sel.empty;
    try {
      let { node, offset } = view.domAtPos(sel.from, back ? -1 : 1);
      if (node.nodeType === 1 && node.childNodes.length) {
        const child = node.childNodes[back ? Math.max(0, offset - 1) : Math.min(offset, node.childNodes.length - 1)];
        if (child && !(child.nodeType === 1 && child.tagName === 'BR')) node = child;
      }
      const el = node.nodeType === 1 ? node : node.parentElement;
      return el && mount.contains(el) ? el : mount;
    } catch {
      return mount;
    }
  }

  // Marques du texte au début de la sélection (marques en attente comprises).
  function marksAtSelection(state) {
    const sel = state.selection;
    if (sel.empty) return state.storedMarks || sel.$from.marks();
    let found = null;
    state.doc.nodesBetween(sel.from, sel.to, (n) => {
      if (found) return false;
      if (n.isText) { found = n.marks; return false; }
      return true;
    });
    return found || sel.$from.marks();
  }

  function computedOn(kind, el) {
    const k = KINDS[kind];
    if (!k.word) {
      const cs = getComputedStyle(el);
      return k.on(kind === 'bold' ? cs.fontWeight : cs.fontStyle);
    }
    // Le soulignement ne se transmet pas aux éléments intérieurs : on remonte jusqu'au bloc.
    for (let n = el; n && n !== mount; n = n.parentElement) {
      if (getComputedStyle(n).textDecorationLine.includes(k.word)) return true;
    }
    return false;
  }

  // La mise en forme est-elle active au début de la sélection ? Lue dans les marques du texte, et pour le
  // gras et l'italique, aussi dans le style du bloc (un titre est en gras par son style).
  function isActive(kind, state = view.state) {
    const k = KINDS[kind];
    const marks = marksAtSelection(state);
    if (markOn(marks, kind)) return true;
    if (!k.off) return false;
    const reset = marks.some((m) => isInl(m) && styleValue(m.attrs.a.style, k.off[0]) === k.off[1]);
    const bd = blockDom(state);
    return !reset && !!bd && computedOn(kind, bd);
  }

  // Gras, italique, souligné, barré : posé, ou retiré s'il est déjà là.
  function toggle(kind) {
    const state = view.state;
    const k = KINDS[kind];
    const on = isActive(kind, state);
    const bd = blockDom(state);
    // Retiré d'un titre (gras par son style) : le texte est remis en normal par-dessus.
    const fromBlock = on && k.off && bd && computedOn(kind, bd);
    const add = on
      ? (marks) => (fromBlock ? marksWithStyle(marksWithout(marks, kind), k.off[0], k.off[1]) : marksWithout(marks, kind))
      : (marks) => sortMarks([...(k.off ? marksWithStyle(marks, k.off[0], '') : marks), schema.marks[k.mark].create({ tag: k.tag })]);
    const tr = state.tr;
    if (state.selection.empty) {
      tr.setStoredMarks(add(state.storedMarks || state.selection.$from.marks()));
    } else {
      for (const r of state.selection.ranges) rewriteMarks(tr, r.$from.pos, r.$to.pos, add);
    }
    view.dispatch(tr);
    view.focus();
  }

  // Police, taille, couleur, surlignage, petites capitales : une propriété de style sur le passage.
  function setStyle(prop, value) {
    const state = view.state;
    const tr = state.tr;
    const fn = (marks) => marksWithStyle(marks, prop, value);
    if (state.selection.empty) {
      tr.setStoredMarks(fn(state.storedMarks || state.selection.$from.marks()));
    } else {
      for (const r of state.selection.ranges) rewriteMarks(tr, r.$from.pos, r.$to.pos, fn);
    }
    view.dispatch(tr);
    view.focus();
  }

  // Valeur d'une propriété posée sur le texte au curseur (marques en attente comprises), ou ''.
  function markedStyle(prop, state = view.state) {
    const marks = state.storedMarks || state.selection.$from.marks();
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (isInl(m) && m.attrs.a.style) {
        const v = styleValue(m.attrs.a.style, prop);
        if (v) return v;
      }
    }
    return '';
  }

  function toggleSmallCaps() {
    const on = view.state.storedMarks
      ? markedStyle('font-variant-caps') === 'small-caps'
      : getComputedStyle(domAtSelection()).fontVariantCaps === 'small-caps';
    const bd = blockDom();
    const inherited = !!bd && getComputedStyle(bd).fontVariantCaps === 'small-caps';
    setStyle('font-variant-caps', on ? (inherited ? 'normal' : '') : (inherited ? '' : 'small-caps'));
  }

  // ----- Polices -----

  let knownFonts = new Set();

  function fontGroup(label, names) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const f of names) {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      o.style.fontFamily = `"${f}"`;
      group.appendChild(o);
      knownFonts.add(f);
    }
    fontSelect.appendChild(group);
  }

  // Une police est présente si le texte témoin change de largeur quand on la demande.
  function isFontAvailable(name) {
    const ctx = isFontAvailable.ctx || (isFontAvailable.ctx = document.createElement('canvas').getContext('2d'));
    const sample = 'mmmmmmmmmlliWWQQ@#1234 àéè';
    return ['monospace', 'serif', 'sans-serif'].some((base) => {
      ctx.font = `40px ${base}`;
      const w0 = ctx.measureText(sample).width;
      ctx.font = `40px "${name}", ${base}`;
      return ctx.measureText(sample).width !== w0;
    });
  }

  // Liste toutes les polices installées ; à défaut, teste une liste de polices courantes.
  async function systemFonts() {
    let names = [];
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        names = [...new Set(fonts.map((f) => f.family))];
      }
    } catch { /* accès refusé : on passe à la méthode de secours */ }
    if (names.length === 0) names = COMMON_SYSTEM_FONTS.filter(isFontAvailable);
    const builtin = new Set(BUILTIN_FONTS);
    return names
      .filter((n) => n && !builtin.has(n) && !n.startsWith('.') && !n.startsWith('@'))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }

  // Polices « cloud » d'Office (Aptos…), chargées à la demande.
  let officeFonts = new Set();
  const loadedOffice = new Map();

  function loadOfficeFont(family) {
    if (!officeFonts.has(family)) return Promise.resolve();
    if (!loadedOffice.has(family)) {
      loadedOffice.set(family, window.frameText.loadOfficeFont(family).then(async (faces) => {
        for (const f of faces) {
          const face = new FontFace(family, f.data, { weight: String(f.weight), style: f.style });
          document.fonts.add(await face.load());
        }
      }).catch(() => {}));
    }
    return loadedOffice.get(family);
  }

  // Charge les polices Office utilisées dans un document qu'on ouvre (lu dans le HTML, sans l'afficher).
  function loadFontsUsedIn(html) {
    const used = new Set();
    for (const m of String(html || '').matchAll(/font-family:\s*([^;"]+)|face="([^"]+)"/g)) {
      (m[1] || m[2]).split(',').forEach((name) => used.add(name.replace(/&quot;|["']/g, '').trim()));
    }
    return Promise.all([...used].map(loadOfficeFont));
  }

  let lastHtml = '';
  async function buildFontList() {
    let office = [];
    try { office = await window.frameText.officeFonts(); } catch { /* pas d'Office */ }
    const system = await systemFonts();
    officeFonts = new Set(office.filter((f) => !system.includes(f) && !BUILTIN_FONTS.includes(f)));
    fontSelect.innerHTML = '';
    knownFonts = new Set();
    fontGroup('Polices de Tomatoes Text', BUILTIN_FONTS);
    if (officeFonts.size) fontGroup('Polices Office', [...officeFonts]);
    fontGroup("Polices de l'ordinateur", system);
    fontSelect.value = DEFAULT_FONT;
    // Le document déjà ouvert peut utiliser une police Office.
    loadFontsUsedIn(lastHtml);
  }
  buildFontList();
  for (const s of SIZES) {
    const o = document.createElement('option');
    o.value = String(s);
    o.textContent = String(s);
    sizeSelect.appendChild(o);
  }
  sizeSelect.value = String(DEFAULT_SIZE);
  Object.assign(sizeSelect.dataset, { min: 1, max: 400 });

  // ----- État de la barre d'outils -----
  // Lu après l'affichage (jamais pendant la frappe elle-même) : une seule lecture de style par image.

  let toolbarFrame = 0;
  let toolbarTimer = 0;
  function scheduleToolbar(typing) {
    if (typing) {
      // Pendant la frappe, la barre suit après une courte pause.
      clearTimeout(toolbarTimer);
      toolbarTimer = setTimeout(scheduleToolbar, 150);
      return;
    }
    if (toolbarFrame) return;
    toolbarFrame = requestAnimationFrame(() => {
      toolbarFrame = 0;
      updateToolbar();
    });
  }

  let lastSelText = '';
  function updateToolbar() {
    if (!view.hasFocus() && document.activeElement !== document.body) return;
    const state = view.state;
    for (const btn of cmdButtons) {
      const kind = { bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strike' }[btn.dataset.cmd];
      btn.classList.toggle('on', !!kind && isActive(kind, state));
    }
    const el = domAtSelection(state);
    const style = getComputedStyle(el);
    scBtn.classList.toggle('on', (markedStyle('font-variant-caps', state) || style.fontVariantCaps) === 'small-caps');
    const bd = blockDom(state);
    let align = bd ? getComputedStyle(bd).textAlign : 'left';
    if (align === 'start') align = 'left';
    for (const btn of alignButtons) btn.classList.toggle('on', btn.dataset.align === align);
    const family = (markedStyle('font-family', state) || style.fontFamily).split(',')[0].replace(/["']/g, '').trim();
    if (family && !knownFonts.has(family)) {
      // Police absente des listes (document venu d'un autre ordinateur) : on l'affiche quand même.
      const o = document.createElement('option');
      o.value = family;
      o.textContent = family;
      fontSelect.prepend(o);
      knownFonts.add(family);
    }
    fontSelect.value = family;
    const marked = markedStyle('font-size', state);
    const pt = marked && /pt$/.test(marked) ? parseFloat(marked) : Math.round(parseFloat(style.fontSize) * 0.75 * 4) / 4;
    if (!SIZES.includes(pt) && !sizeSelect.querySelector(`option[value="${pt}"]`)) {
      sizeSelect.querySelectorAll('option.custom').forEach((o) => o.remove());
      const o = document.createElement('option');
      o.className = 'custom';
      o.value = String(pt);
      o.textContent = String(pt).replace('.', ',');
      sizeSelect.appendChild(o);
    }
    sizeSelect.value = String(pt);
    const sel = state.selection;
    const text = sel.empty ? '' : state.doc.textBetween(sel.from, sel.to, '\n', ' ');
    if (text !== lastSelText) {
      lastSelText = text;
      onSelectionText(text);
    }
  }

  // ----- Boutons -----

  const keep = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());

  for (const btn of cmdButtons) {
    keep(btn);
    btn.addEventListener('click', () => toggle({ bold: 'bold', italic: 'italic', underline: 'underline', strikeThrough: 'strike' }[btn.dataset.cmd]));
  }
  keep(scBtn);
  scBtn.addEventListener('click', toggleSmallCaps);

  // La liste des polices et celle des tailles prennent le focus : la sélection du moteur reste la même.
  fontSelect.addEventListener('change', async () => {
    const family = fontSelect.value;
    if (!family) return;
    await loadOfficeFont(family);
    // Les guillemets sont nécessaires pour les noms comme « Source Serif 4 ».
    setStyle('font-family', `"${family}"`);
  });
  sizeSelect.addEventListener('change', () => {
    const pt = Number(sizeSelect.value);
    if (pt > 0) setStyle('font-size', pt + 'pt');
  });

  // ----- Couleur : palette simple, couleur libre en option avancée -----

  // Couleur retenue par l'outil (la dernière choisie) : un clic sur le bouton l'applique.
  let textColor = { value: window.FTCouleurs.list().find((c) => c.startsWith('#')) || '#c0392b', label: '' };
  function showTextColor() {
    colorSwatch.style.background = textColor.value === AUTO_COLOR ? 'var(--text)' : textColor.value;
    colorSwatch.title = textColor.label || (textColor.value === AUTO_COLOR ? 'Automatique' : textColor.value);
  }
  showTextColor();
  function applyColor(value, label) {
    colorPop.hidden = true;
    textColor = { value, label };
    showTextColor();
    setStyle('color', value === AUTO_COLOR ? '' : value);
    if (value !== AUTO_COLOR) window.FTCouleurs.add(value);
  }
  // Les 6 dernières couleurs choisies, sous la palette.
  colorPop.querySelector('.color-grid').after(window.FTCouleurs.row((c) => applyColor(c, c), { className: 'color-recents' }));

  keep(document.getElementById('color-btn'));
  document.getElementById('color-btn').addEventListener('click', () => applyColor(textColor.value, textColor.label));
  keep(document.getElementById('color-more'));
  document.getElementById('color-more').addEventListener('click', (e) => {
    colorPop.hidden = !colorPop.hidden;
    if (colorPop.hidden) return;
    // La palette s'ouvre sous le bouton, sans jamais dépasser du bord de la fenêtre.
    window.FTToolbar.placePop(colorPop, e.currentTarget.parentElement);
  });
  colorPop.querySelectorAll('[data-color]').forEach((b) => {
    b.style.background = b.dataset.color;
    keep(b);
    b.addEventListener('click', () => applyColor(b.dataset.color, b.title));
  });
  keep(document.getElementById('color-auto'));
  document.getElementById('color-auto').addEventListener('click', () => applyColor(AUTO_COLOR, 'Automatique'));
  document.getElementById('color-custom-apply').addEventListener('click', () => applyColor(colorInput.value, colorInput.value));
  document.addEventListener('mousedown', (e) => {
    if (!colorPop.hidden && !e.target.closest('.color-picker')) colorPop.hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') colorPop.hidden = true; });

  // ----- Surlignage : fond coloré et transparent, lisible en mode jour comme en mode nuit -----

  const HIGHLIGHTS = [
    ['rgba(255, 221, 0, 0.45)', 'Jaune'],
    ['rgba(80, 220, 100, 0.4)', 'Vert'],
    ['rgba(70, 170, 255, 0.4)', 'Bleu'],
    ['rgba(255, 105, 180, 0.4)', 'Rose'],
    ['rgba(255, 150, 40, 0.45)', 'Orange'],
    ['rgba(170, 110, 255, 0.4)', 'Violet']
  ];
  const hlKey = (c) => String(c || '').replace(/\s+/g, '');
  const isHighlight = (c) => HIGHLIGHTS.some(([v]) => hlKey(v) === hlKey(c));
  const hlPop = document.getElementById('hl-pop');
  const hlSwatch = document.getElementById('hl-swatch');
  let hlColor = HIGHLIGHTS[0][0];
  hlSwatch.style.background = hlColor;

  function highlight(value) {
    hlPop.hidden = true;
    if (view.state.selection.empty) return;
    setStyle('background-color', value || '');
  }

  const hlGrid = hlPop.querySelector('.hl-grid');
  for (const [value, name] of HIGHLIGHTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.style.background = value;
    keep(b);
    b.addEventListener('click', () => { hlColor = value; hlSwatch.style.background = value; highlight(value); });
    hlGrid.append(b);
  }
  keep(document.getElementById('hl-btn'));
  document.getElementById('hl-btn').addEventListener('click', () => highlight(hlColor));
  keep(document.getElementById('hl-more'));
  document.getElementById('hl-more').addEventListener('click', (e) => {
    hlPop.hidden = !hlPop.hidden;
    if (!hlPop.hidden) window.FTToolbar.placePop(hlPop, e.currentTarget.parentElement);
  });
  keep(document.getElementById('hl-none'));
  document.getElementById('hl-none').addEventListener('click', () => highlight(null));
  document.addEventListener('mousedown', (e) => { if (!hlPop.hidden && !e.target.closest('.hl-picker')) hlPop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hlPop.hidden = true; });

  // ----- Alignement -----

  // Blocs de premier niveau (les paragraphes d'une zone en colonnes comptent un par un), avec leur position.
  function topBlocks(doc) {
    const out = [];
    doc.forEach((node, offset) => {
      if (node.type.name === 'container' && /\bft-cols\b/.test(node.attrs.a.class || '')) {
        node.forEach((child, o) => out.push({ node: child, pos: offset + 1 + o }));
      } else {
        out.push({ node, pos: offset });
      }
    });
    return out;
  }

  // Alignement d'un bloc sans réglage à lui : justifié pour les paragraphes d'un thème justifié (sauf la
  // bibliographie, alignée à gauche), sinon à gauche. Le réglage n'est écrit que s'il en diffère : « à
  // gauche » dans un thème justifié est donc gardé (avant la 2.4.4, il revenait au justifié du thème).
  function defaultAlign(node) {
    const justified = window.FTTheme && window.FTTheme.textAlign && window.FTTheme.textAlign() === 'justify';
    return justified && node.type.name === 'paragraph' && node.attrs.tag === 'p' && !/(^|\s)ft-bib(\s|$)/.test(node.attrs.a.class || '') ? 'justify' : 'left';
  }

  // L'alignement porte sur des paragraphes entiers : ceux touchés par la sélection,
  // ou tout le document quand rien n'est sélectionné.
  function setAlign(value) {
    const state = view.state;
    const { from, to, empty } = state.selection;
    const tr = state.tr;
    for (const { node, pos } of topBlocks(state.doc)) {
      if (!empty && (pos + node.nodeSize <= from || pos >= to)) continue;
      if (!node.type.spec.attrs || !node.type.spec.attrs.a) continue;
      const a = withStyleAttr(node.attrs.a, 'text-align', value === defaultAlign(node) ? '' : value);
      if (JSON.stringify(a) !== JSON.stringify(node.attrs.a)) tr.setNodeMarkup(pos, null, { ...node.attrs, a });
    }
    if (tr.docChanged) view.dispatch(tr);
    view.focus();
    scheduleToolbar();
  }

  for (const btn of alignButtons) {
    keep(btn);
    btn.addEventListener('click', () => setAlign(btn.dataset.align));
  }

  keep(indentBtn);
  indentBtn.addEventListener('click', () => {
    setAutoIndent(!mount.classList.contains('auto-indent'));
    onChange();
  });

  function setAutoIndent(on) {
    mount.classList.toggle('auto-indent', on);
    indentBtn.classList.toggle('on', on);
  }

  // ----- Raccourcis clavier -----

  const cmd = (fn) => () => { fn(); return true; };
  const ownKeys = {
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,
    'Mod-g': cmd(() => toggle('bold')),
    'Mod-b': cmd(() => toggle('bold')),
    'Mod-i': cmd(() => toggle('italic')),
    'Mod-u': cmd(() => toggle('underline')),
    'Mod-Shift-x': cmd(() => toggle('strike')),
    'Mod-Shift-k': cmd(toggleSmallCaps),
    'Mod-l': cmd(() => setAlign('left')),
    'Mod-e': cmd(() => setAlign('center')),
    'Mod-r': cmd(() => setAlign('right')),
    'Mod-j': cmd(() => setAlign('justify')),
    // Tabulation : un retrait (espace cadratin) plutôt que de quitter la zone d'écriture.
    Tab: (state, dispatch) => {
      if (dispatch) dispatch(state.tr.insertText(' ').scrollIntoView());
      return true;
    },
    // Maj+Tab : retire le retrait juste avant le curseur ; le curseur reste toujours dans le texte.
    'Shift-Tab': (state, dispatch) => {
      const { $from, empty } = state.selection;
      if (dispatch && empty && $from.parentOffset > 0 && $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset, '', '') === '\u2003') {
        dispatch(state.tr.delete($from.pos - 1, $from.pos).scrollIntoView());
      }
      return true;
    },
    'Shift-Enter': (state, dispatch) => {
      if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
      return true;
    }
  };

  // ----- Collage -----

  let plainUntil = 0; // Ctrl+Maj+V : coller sans mise en forme
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') plainUntil = Date.now() + 1000;
  }, true);
  const SHORT = 80;

  // Insère un HTML (déjà nettoyé) à la place de la sélection.
  function insertHtml(html, range) {
    const box = window.FTSchema.prepare(html);
    // Tableaux collés : style des prochains tableaux.
    const S = window.FTStructure;
    for (const t of box.querySelectorAll('table.ft-table[data-paste]')) {
      t.removeAttribute('data-paste');
      if (!S || !S.setTableLook) continue;
      const look = S.newTableLook();
      if (t.dataset.header === 'oui') look.header = true;
      // Tableau large : cases serrées et texte réduit pour tenir dans la page (paste.js).
      if (t.dataset.fitPad) look.pad = t.dataset.fitPad;
      if (t.dataset.fitSize) look.size = Number(t.dataset.fitSize);
      t.removeAttribute('data-fit-pad');
      t.removeAttribute('data-fit-size');
      S.setTableLook(t, look);
    }
    // Dans une case de tableau : le texte entre à l'endroit du curseur, lignes séparées par des retours
    // à la ligne (un tableau ou une liste collés deviennent des lignes de texte).
    const $at = view.state.doc.resolve(Math.min(range ? range.from : view.state.selection.from, view.state.doc.content.size));
    let inCell = false;
    for (let d = $at.depth; d > 0; d--) if ($at.node(d).type.spec.tableRole === 'cell' || $at.node(d).type.spec.tableRole === 'header_cell') inCell = true;
    // Tableau collé dans un tableau : ses cases remplissent celles du tableau à partir de la case du curseur
    // (ou les cases choisies), le tableau s'agrandit si besoin, comme dans Word.
    if (inCell && box.children.length === 1 && box.firstElementChild.tagName === 'TABLE') {
      const slice = PMParser.fromSchema(schema).parseSlice(box);
      const sel = view.state.selection;
      if (range && (sel.from !== range.from || sel.to !== range.to)) {
        const size = view.state.doc.content.size;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(range.from, size), Math.min(range.to, size))));
      }
      if (PM.tables.handlePaste(view, null, slice)) { view.focus(); return; }
    }
    if (inCell) {
      const line = document.createElement('p');
      const br = () => document.createElement('br');
      [...box.children].forEach((b, i) => {
        if (i) line.append(br());
        let text = null;
        if (b.tagName === 'TABLE') text = [...b.rows].map((r) => [...r.cells].map((c) => c.textContent).join(' – ')).join('\n');
        else if (/^(UL|OL)$/.test(b.tagName)) text = [...b.querySelectorAll('li')].map((li) => (li.firstChild ? li.firstChild.textContent || '' : '')).join('\n');
        if (text !== null) text.split('\n').forEach((t, k) => { if (k) line.append(br()); line.append(t); });
        else line.append(...b.childNodes);
      });
      box.replaceChildren(line);
    }
    let slice = PMParser.fromSchema(schema).parseSlice(box, { preserveWhitespace: true });
    let state = view.state;
    const tr = state.tr;
    if (range) tr.setSelection(TextSelection.create(tr.doc, Math.min(range.from, tr.doc.content.size), Math.min(range.to, tr.doc.content.size)));
    // Tableau au début ou à la fin du collage : il reste entier (le texte autour du curseur n'entre pas dans
    // sa dernière case) ; un tableau seul se pose comme un tableau inséré (avant, après ou au milieu de la ligne).
    const isTable = (n) => !!n && n.type.spec.tableRole === 'table';
    const { firstChild: first, lastChild: last } = slice.content;
    if (isTable(first) || isTable(last)) slice = new PM.model.Slice(slice.content, isTable(first) ? 0 : slice.openStart, isTable(last) ? 0 : slice.openEnd);
    if (slice.content.childCount === 1 && isTable(first) && window.FTBlocs && window.FTBlocs.placeBlock) {
      if (!tr.selection.empty) tr.deleteSelection();
      const pos = window.FTBlocs.placeBlock(tr, first);
      const after = pos + tr.doc.nodeAt(pos).nodeSize;
      if (!(tr.doc.resolve(after).nodeAfter || {}).isTextblock) tr.insert(after, schema.nodes.paragraph.create({ tag: 'p', a: {}, bare: false }));
      tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return;
    }
    tr.replaceSelection(slice).scrollIntoView();
    view.dispatch(tr);
    view.focus();
  }

  // Texte venu d'ailleurs : nettoyé (voir paste.js), directement s'il est court, sinon avec un aperçu.
  // Un passage copié dans le logiciel même se colle tel quel.
  function handlePaste(v, e) {
    const cd = e.clipboardData;
    if (!cd) return false;
    const text = cd.getData('text/plain') || '';
    // Dans un bloc de code (moteur/code.js) : le texte tel quel.
    const { $from, $to } = view.state.selection;
    if ($from.parent.type.spec.code && $to.parent === $from.parent) {
      if (!text) return true;
      view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, '\n')).scrollIntoView());
      return true;
    }
    let html = cd.getData('text/html') || '';
    if (/data-pm-slice/.test(html)) return false;
    if (!text.trim() && !html) return false;
    if ([...cd.files].length && !text.trim()) return false;
    const P = window.FTPaste;
    if (!P) return false;
    const plain = Date.now() < plainUntil;
    if (plain) html = '';
    // Fragment HTML sans balise utile (simple texte) : traité comme du texte.
    if (html && !/<(p|div|br|li|h[1-6]|table|b|strong|i|em|u|a|span|font)\b/i.test(html)) html = '';
    const source = { html, text };
    const range = { from: view.state.selection.from, to: view.state.selection.to };
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim()).length;
    if (plain || (lines <= 1 && text.length < SHORT)) {
      const prefs = P.prefs();
      const opts = { lines: true, spaces: prefs.spaces !== false, inline: !plain && prefs.inline !== false, structure: !plain && prefs.structure !== false };
      insertHtml(P.render(P.build(source, opts)), range);
      return true;
    }
    P.open(source, range, (out, raw) => {
      if (raw && !source.html) {
        const size = view.state.doc.content.size;
        const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(range.from, size), Math.min(range.to, size))).insertText(source.text);
        view.dispatch(tr.scrollIntoView());
        view.focus();
        return;
      }
      insertHtml(out, range);
    });
    return true;
  }

  // ----- Statistiques du texte -----
  // Mots et caractères comptés bloc par bloc ; un bloc qui n'a pas changé n'est pas recompté (le moteur
  // garde les mêmes blocs d'une frappe à l'autre) : le compteur reste instantané sur un long document.

  // Espaces au sens de \s (espace, tabulation, retour à la ligne, espaces insécables…).
  const isSpace = (c) => (c <= 32 ? c === 32 || (c >= 9 && c <= 13)
    : c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff);

  function countText(text) {
    let words = 0;
    let lines = 0;
    let inWord = false;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 10) lines++;
      const space = isSpace(c);
      if (!space && !inWord) words++;
      inWord = !space;
    }
    return { words, chars: text.length - lines };
  }

  const rawText = (html) => {
    const t = document.createElement('template');
    // Une espace à la fin de chaque ligne (sommaire, index…) : ses mots ne se collent pas aux suivants.
    t.innerHTML = html.replace(/<\/(p|div|li|td|th|h[1-6])>|<br\s*\/?>/gi, ' $&');
    return t.content.textContent;
  };
  // Texte d'un objet fermé : celui de son HTML (légende d'une image comprise).
  const objectText = (n) => {
    const name = n.type.name;
    if (name === 'raw_block' || name === 'raw_inline') return rawText(n.attrs.html);
    if (name === 'image' || name === 'image_inline') return rawText(n.attrs.inner || '');
    return '';
  };
  const leafText = (n) => (n.type.name === 'hard_break' ? '\n' : objectText(n));
  const textOf = (node) => (node.isLeaf ? objectText(node) : node.textBetween(0, node.content.size, '\n', leafText));

  const counts = new WeakMap();
  function blockCount(node) {
    let c = counts.get(node);
    if (!c) {
      c = countText(textOf(node));
      counts.set(node, c);
    }
    return c;
  }

  function countWords() {
    let words = 0;
    let chars = 0;
    view.state.doc.forEach((n) => {
      const c = blockCount(n);
      words += c.words;
      chars += c.chars;
    });
    return { words, chars };
  }

  // ----- Ouverture -----

  function updateEmpty() {
    const doc = view.state.doc;
    const first = doc.firstChild;
    mount.classList.toggle('is-empty', doc.childCount === 1 && first.isTextblock && first.content.size === 0);
  }

  // Les images sont affichées depuis la mémoire (adresses blob:, voir layout.js) ; le fichier garde leurs données.
  function adoptImages(box) {
    const L = window.FTLayout;
    box.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:') && L) img.setAttribute('src', L.imageUrl(src));
      else if (!src.startsWith('blob:') && !src.startsWith('data:')) { img.remove(); return; } // image extérieure : non affichable
      img.setAttribute('draggable', 'false');
      if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
      // (Portrait d'un repère biographique : dans son propre cadre, bio.js.)
      if (!img.parentElement.classList.contains('ft-image') && !img.parentElement.classList.contains('ft-bio-photo')) {
        const box2 = img.ownerDocument.createElement('span');
        box2.className = 'ft-image';
        box2.setAttribute('data-wrap', 'ligne');
        img.replaceWith(box2);
        box2.appendChild(img);
      }
      img.parentElement.setAttribute('contenteditable', 'false');
    });
  }

  // Curseur au début du texte (pas sur un plan ou une page de titre placé en tête : un tel objet
  // sélectionné coûte cher au navigateur sur un très long document).
  function newState(doc) {
    const selection = PM.state.Selection.findFrom(doc.resolve(0), 1, true) || undefined;
    return EditorState.create({ schema, doc, selection, plugins: plugins() });
  }

  window.FTMoteur = {
    view,
    schema,
    run,
    take,
    // first : avant les autres (sa réponse à une touche passe avant la leur).
    addPlugin(p, first) { if (first) extraPlugins.unshift(p); else extraPlugins.push(p); },
    onUpdate(fn) { updateHooks.push(fn); },
    // Juste avant que l'écran ne suive le nouvel état (le texte affiché est encore l'ancien).
    beforeUpdate(fn) { beforeHooks.push(fn); },
    // Document ouvert (son texte vient d'être placé dans la zone d'écriture).
    onLoad(fn) { loadHooks.push(fn); },
    guardDispatch(fn) { guard = fn; },
    withStyle,
    styleValue,
    withStyleAttr,
    topBlocks,
    insertHtml,
    closeHistory: () => view.dispatch(closeHistory(view.state.tr)),
    undoDepth: () => undoDepth(view.state),
    redoDepth: () => redoDepth(view.state),
    undo: () => run(undo),
    redo: () => run(redo),
    // Position du curseur (reprise du document là où on s'est arrêté).
    caret: () => view.state.selection.from,
    placeCaret(pos) {
      const doc = view.state.doc;
      const at = Math.max(0, Math.min(Number(pos) || 0, doc.content.size));
      view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(at))).setMeta('addToHistory', false));
    }
  };

  window.FTEditor = {
    load(doc) {
      if (window.FTObjets && window.FTObjets.abandon) window.FTObjets.abandon();
      const html = (doc.content && doc.content.html) || '';
      lastHtml = html;
      loading = true;
      let pmDoc;
      try {
        const box = window.FTSchema.prepare(html);
        adoptImages(box);
        pmDoc = PMParser.fromSchema(schema).parse(box, { preserveWhitespace: true });
      } catch (err) {
        console.error(err);
        pmDoc = emptyDoc();
      }
      if (!pmDoc.childCount) pmDoc = emptyDoc();
      view.updateState(newState(pmDoc));
      // (Un module en erreur ne doit pas laisser le document « en ouverture » : il ne serait plus enregistré.)
      for (const fn of loadHooks) {
        try { fn(); } catch (err) { console.error(err); }
      }
      window.FTSchema.warm(pmDoc);
      loading = false;
      loadFontsUsedIn(html);
      setAutoIndent(!!(doc.settings && doc.settings.autoIndent));
      // Les modules des versions 1.x lisent les réglages du document (colonnes, pages).
      if (window.FTLayout) window.FTLayout.load(doc.settings || {});
      if (window.FTPages) window.FTPages.load(doc.settings || {});
      cmdButtons.forEach((b) => b.classList.remove('on'));
      alignButtons.forEach((b) => b.classList.remove('on'));
      fontSelect.value = DEFAULT_FONT;
      sizeSelect.value = String(DEFAULT_SIZE);
      updateEmpty();
      if (window.FTHistory) window.FTHistory.reset();
    },
    getHtml() {
      const html = window.FTSchema.serialize(view.state.doc);
      return window.FTLayout ? window.FTLayout.serialize(html) : html;
    },
    // Texte avec les adresses blob: des images (app.js : enregistrement, images envoyées à part).
    getRawHtml: () => window.FTSchema.serialize(view.state.doc),
    loadFont: loadOfficeFont,
    getAutoIndent: () => mount.classList.contains('auto-indent'),
    setAutoIndent: (on) => setAutoIndent(!!on),
    focus() {
      view.focus();
      const end = TextSelection.atEnd(view.state.doc);
      view.dispatch(view.state.tr.setSelection(end));
    },
    // Curseur au début du bloc qui suit le titre du document (nouveau document).
    focusAfterTitle() {
      const doc = view.state.doc;
      const first = doc.firstChild;
      view.focus();
      if (first && first.type.name === 'heading' && doc.childCount > 1) {
        view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(first.nodeSize + 1))));
      }
    },
    selectAll() {
      view.focus();
      view.dispatch(view.state.tr.setSelection(new PM.state.AllSelection(view.state.doc)));
    },
    countWords,
    // Pour les statistiques (goals.js).
    stats() {
      const { words, chars } = countWords();
      let charsNoSpaces = 0;
      let paragraphs = 0;
      let sentences = 0;
      view.state.doc.descendants((n) => {
        if (n.isTextblock || n.type.name === 'raw_block') {
          const t = textOf(n);
          if (t.trim()) paragraphs++;
          charsNoSpaces += t.replace(/\s/g, '').length;
          sentences += (t.match(/[^.!?…\n]*[\p{L}\p{N}][^.!?…\n]*([.!?…]+|\n|$)/gu) || []).length;
          return false;
        }
        return true;
      });
      return { words, chars, charsNoSpaces, paragraphs, sentences };
    },
    onChange(fn) { onChange = fn; },
    // Réglage du document changé hors du texte (langues, colonnes…) : à enregistrer.
    changed: () => onChange(),
    onSelectionText(fn) { onSelectionText = fn; },
    // Mémorise la sélection actuelle pour la remplacer plus tard (aide au texte).
    captureSelection() {
      const { from, to, empty } = view.state.selection;
      if (empty) return null;
      const text = view.state.doc.textBetween(from, to, '\n', ' ');
      return { from, to, text, toString: () => text };
    },
    // Remplace un passage par un nouveau texte ; Ctrl+Z permet d'annuler.
    replaceRange(range, text) {
      if (!range) return false;
      const doc = view.state.doc;
      if (range.to > doc.content.size || doc.textBetween(range.from, range.to, '\n', ' ') !== range.text) return false;
      const paras = String(text).replace(/\r/g, '').split(/\n+/);
      const tr = view.state.tr.setSelection(TextSelection.create(doc, range.from, range.to));
      paras.forEach((p, i) => {
        if (i > 0) tr.split(tr.selection.from);
        tr.insertText(p);
      });
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    },
    isHighlight
  };

  // Interrupteurs à deux positions (modes, guillemets) : le fond coloré glisse sous le choix actif.
  window.FTSwitch = {
    place(sw, animate = true) {
      const knob = sw.querySelector('.ft-knob');
      const on = sw.querySelector('button[aria-pressed="true"]');
      if (!knob || !on || !on.offsetWidth) return;
      sw.classList.toggle('still', !animate || !knob.style.width);
      knob.style.width = on.offsetWidth + 'px';
      knob.style.transform = `translateX(${on.offsetLeft}px)`;
    }
  };
  const switchObserver = new ResizeObserver((entries) => entries.forEach((e) => window.FTSwitch.place(e.target, false)));
  document.querySelectorAll('.ft-switch').forEach((sw) => switchObserver.observe(sw));
})();
