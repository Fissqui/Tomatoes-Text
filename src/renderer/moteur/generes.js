// Contenu produit par le logiciel dans le nouveau moteur : plan, table des illustrations, index, numéros
// des légendes, renvois, signets, page de titre (modules des versions 1.x : toc.js, captions.js,
// index-terms.js, xref.js, bookmarks.js, cover.js, navpane.js).
// - Mise à jour : après une modification du texte (ou un nouveau découpage en pages), chaque module refait
//   ce qu'il produit sur le texte affiché ; seuls les éléments touchés passent dans le moteur, hors
//   annulation (FTObjets.regen). Tous les blocs restent dans l'affichage (cachés s'ils sont loin) : les
//   modules les lisent comme dans les versions 1.x.
// - Gestes (insérer un plan, un renvoi, un signet…) : par le pont d'objets.js, une étape d'annulation.
// - Clic droit sur ces objets, touches dans une légende de tableau, champs de la page de titre.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const { Plugin, TextSelection, Selection } = PM.state;
  const N = schema.nodes;
  const mount = view.dom;
  const workspace = document.getElementById('workspace');
  const O = () => window.FTObjets;
  const V = () => window.FTVisibles;

  // ----- Mise à jour -----

  const jobs = [];
  let timer = 0;
  let streak = 0; // mises à jour qui changent encore le texte après un nouveau découpage (renvois : page 9 → 10…)
  function run() {
    clearTimeout(timer);
    timer = 0;
    if (!jobs.length || mount.offsetParent === null) return;
    if (O().busy()) { soon(); return; }
    const before = view.state.doc;
    O().regen(() => {
      for (const fn of jobs) {
        try { fn(); } catch (err) { console.error(err); }
      }
    });
    if (view.state.doc !== before) streak++;
  }
  function soon(ms = 300) {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }
  M.onUpdate((tr) => {
    if (!tr.docChanged || tr.getMeta('ftQuiet')) return;
    streak = 0;
    soon();
  });
  // Nouveau découpage en pages : numéros de page (quelques tours au plus, un renvoi qui s'allonge
  // pouvant lui-même déplacer le texte).
  V().onLayout(() => { if (streak < 4) soon(400); });
  // Passage en mode note (plus de découpage : les numéros de page s'effacent) ou avancé, nouveaux réglages.
  // (Retour en mode note : aussitôt, les numéros de page n'attendent aucun découpage.)
  V().onRepaginate((paged) => { streak = 0; soon(paged ? 400 : 0); });
  M.onLoad(() => { streak = 0; soon(50); });
  document.addEventListener('ft-docname', () => soon());

  // ----- Aller à un élément du texte -----

  // L'élément est affiché (s'il était loin), puis amené à l'écran ; offset : distance au haut de la zone.
  function reveal(el, offset = 60) {
    if (V()) V().show(el);
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += el.getBoundingClientRect().top - box.top - offset;
  }

  // Élément éclairé un instant (sans toucher au texte : un calque par-dessus).
  function flash(el) {
    const page = document.getElementById('page');
    const pr = page.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const z = page.currentCSSZoom || 1;
    const g = document.createElement('div');
    g.className = 'bm-glow';
    Object.assign(g.style, {
      left: (r.left - pr.left) / z - 6 + 'px',
      top: (r.top - pr.top) / z - 3 + 'px',
      width: r.width / z + 12 + 'px',
      height: r.height / z + 6 + 'px'
    });
    page.appendChild(g);
    setTimeout(() => g.remove(), 1500);
  }

  // Passage de l'affichage (Range) sélectionné dans le moteur et amené à l'écran (lisibilité, cohérence…).
  function selectRange(range) {
    let from;
    let to;
    try {
      from = view.posAtDOM(range.startContainer, range.startOffset);
      to = view.posAtDOM(range.endContainer, range.endOffset);
    } catch {
      return false;
    }
    const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    if (el && V()) V().show(el);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(from, to), Math.max(from, to))));
    view.focus();
    try {
      const c = view.coordsAtPos(Math.min(from, to));
      const box = workspace.getBoundingClientRect();
      if (c.top < box.top + 40 || c.bottom > box.bottom - 40) workspace.scrollTop += c.top - box.top - box.height / 3;
    } catch { /* passage qui vient de changer */ }
    return true;
  }

  // ----- Objet produit par le logiciel, au curseur -----

  function insertBlock(el) {
    O().insertBlockObject(el);
  }

  // ----- Page de titre : les champs s'écrivent dans l'affichage (comme une légende d'image) -----

  const FIELD = '.ft-cover-field';
  const inField = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest(FIELD));
  };
  function rawView(node) {
    const t = document.createElement('template');
    t.innerHTML = node.attrs.html;
    const dom = t.content.firstChild || document.createElement('div');
    let cur = node;
    return {
      dom,
      update(nw) {
        if (nw.type !== cur.type || nw.attrs.html !== cur.attrs.html) return false;
        cur = nw;
        return true;
      },
      stopEvent: (e) => inField(e.target),
      ignoreMutation: (m) => m.type !== 'selection' || inField(m.target)
    };
  }

  // ----- Légende d'un tableau : Entrée passe dans le tableau, Retour arrière efface une légende vide -----

  function legendKey(v, e) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'Enter' && e.key !== 'Backspace')) return false;
    const { $from, empty } = v.state.selection;
    if (!empty || !$from.parent.isTextblock || !/\bft-legend\b/.test(($from.parent.attrs.a && $from.parent.attrs.a.class) || '')) return false;
    const d = $from.depth;
    const after = $from.after(d);
    const next = v.state.doc.resolve(after).nodeAfter;
    const table = next && next.type === N.table ? next : null;
    if (e.key === 'Enter') {
      const tr = v.state.tr;
      if (table) tr.setSelection(Selection.near(tr.doc.resolve(after + 1)));
      else {
        tr.insert(after, N.paragraph.create({ bare: false }));
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
      }
      v.dispatch(tr.scrollIntoView());
      return true;
    }
    if ($from.parentOffset > 0 || $from.parent.textContent.trim()) return false;
    const before = $from.before(d);
    const tr = v.state.tr.delete(before, after);
    tr.setSelection(table ? Selection.near(tr.doc.resolve(before + 1)) : Selection.near(tr.doc.resolve(Math.max(0, before - 1)), -1));
    v.dispatch(tr.scrollIntoView());
    return true;
  }

  // ----- Clic droit -----

  // Ligne de séparation : son trait, ou la supprimer.
  function ruleItems(hr) {
    const check = (on, text) => (on ? '✓ ' : '\u2003') + text;
    return [
      { label: 'Ligne de séparation' },
      ...window.FTStructure.RULE_STYLES.map(([value, name]) => ({
        text: check((hr.dataset.style || '') === value, name),
        action: () => O().edit(() => { if (value) hr.dataset.style = value; else delete hr.dataset.style; })
      })),
      '-',
      { text: 'Supprimer la ligne', danger: true, action: () => O().removeObject(hr) }
    ];
  }

  // Comme les versions 1.x : le mot et la sélection (synonymes, liens…), puis ce qui est cliqué (ligne,
  // liste, encadré, plan…), puis « Insérer » à la fin.
  // own : ce que propose déjà l'élément cliqué (tableau : moteur/blocs.js).
  function menuAt(target, x, y, own) {
    const T = window.FTToc;
    const C = window.FTCover;
    const L = window.FTCaptions;
    const X = window.FTXref;
    const I = window.FTIndex;
    const B = window.FTBookmarks;
    const Bl = window.FTBlocs;
    let items = own || [];
    if (!own) for (const api of [T, C, L, X, I]) {
      const got = api && api.menuItems ? api.menuItems(target) : [];
      if (got.length) { items = got; break; }
    }
    const hr = target.closest('hr');
    if (!items.length && hr && mount.contains(hr)) items = ruleItems(hr);
    if (!items.length && !own && Bl) {
      items = Bl.lineItems(target);
      const box = target.closest('blockquote.ft-callout');
      if (box && mount.contains(box)) items = items.length ? [...items, '-', ...O().calloutMenu(box)] : O().calloutMenu(box);
      const zone = target.closest('.ft-cols');
      const zoneItems = zone && mount.contains(zone) && window.FTLayout ? window.FTLayout.zoneMenu(zone) : [];
      if (zoneItems.length) items = items.length ? [...items, '-', ...zoneItems] : zoneItems;
    }
    const bib = window.FTNotes && window.FTNotes.bibItems ? window.FTNotes.bibItems(target) : [];
    if (bib.length) items = items.length ? [...items, '-', ...bib] : bib;
    const bm = B ? B.menuItems(target) : [];
    if (bm.length) items = items.length ? [...items, '-', ...bm] : bm;
    const S = window.FTSpell;
    const Lg = window.FTLang;
    const Ly = window.FTLayout;
    const Cm = window.FTComments;
    const sel = window.getSelection();
    const selected = sel.rangeCount && !sel.isCollapsed && mount.contains(sel.anchorNode);
    const word = [
      ...(window.FTOrdinals ? window.FTOrdinals.menuItems(target, x, y) : []),
      ...(window.FTTimeline && window.FTTimeline.menuItems ? window.FTTimeline.menuItems(target, x, y) : []),
      ...(S && S.synonymItems ? S.synonymItems(x, y) : []),
      ...(window.FTLinks ? window.FTLinks.selectionItems() : []),
      ...(Cm ? Cm.menuItems(target, x, y) : []),
      ...(I ? I.wordItems(x, y) : []),
      ...(selected && window.FTStructure.clearFormat ? [{ text: 'Effacer la mise en forme', action: () => window.FTStructure.clearFormat() }] : []),
      ...(Ly && Ly.columnItems ? Ly.columnItems() : []),
      ...(window.FTSort ? window.FTSort.selectionItems() : []),
      ...(Lg ? Lg.menuItems() : [])
    ];
    const insert = window.FTStructure.insertItems(x, y);
    const groups = [word, items, insert].filter((g) => g.length);
    return groups.flatMap((g, i) => (i ? ['-', ...g] : g));
  }

  // (Avant les touches du moteur.)
  M.addPlugin(new Plugin({ props: { handleKeyDown: legendKey } }), true);
  M.addPlugin(new Plugin({
    props: {
      nodeViews: { raw_block: rawView },
      handleDOMEvents: {
        contextmenu(v, e) {
          const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
          if (!target || !v.dom.contains(target) || target.closest('.ft-math, .ft-footnotes, .ft-endnotes, table, sup.ft-fn-ref, sup.ft-en-ref, span.ft-cite')) return false;
          const items = menuAt(target, e.clientX, e.clientY);
          if (!items.length) return false;
          e.preventDefault();
          window.FTSidebar.showMenu(e.clientX, e.clientY, items);
          return true;
        }
      }
    }
  }));

  window.FTGeneres = {
    // Menu du clic droit sur le texte (moteur/blocs.js : celui d'un tableau).
    menuAt,
    // fn : refait ce que le module produit sur le texte affiché (appelé après chaque modification).
    add(fn) { jobs.push(fn); },
    soon,
    now: run,
    regen: (fn) => O().regen(fn),
    edit: (fn) => O().edit(fn),
    insertBlock,
    reveal,
    selectRange,
    flash,
    show: (el) => V() && V().show(el),
    caret: (el, atEnd) => O().placeCaret(el, atEnd),
    // Élément affiché à une position du modèle (après une fenêtre : l'affichage a pu être refait).
    posOf: (el) => O().posOf(el),
    domAt: (pos) => (pos === null ? null : view.nodeDOM(pos)),
    topOf: (el) => (V() ? V().topOf(el) : el.getBoundingClientRect().top),
    start() {
      for (const api of [window.FTToc, window.FTCaptions, window.FTIndex, window.FTXref, window.FTBookmarks, window.FTCover, window.FTNav,
        window.FTReadability, window.FTCoherence, window.FTTrack, window.FTComments]) {
        if (api && api.useEngine) api.useEngine(mount, window.FTGeneres);
      }
    }
  };
})();
