// Affichage du texte par le nouveau moteur : très longs documents et mode avancé (pages).
// - Très long document : seuls les blocs autour de l'écran (et ceux de la sélection) sont affichés. Les
//   autres sont retirés de l'affichage (display: none), et la place qu'ils occupaient est rendue par une
//   marge sur le bloc affiché qui les suit : la hauteur du texte, la barre de défilement et la position
//   de chaque bloc restent celles du document entier. Le navigateur ne met plus en page et ne relit plus
//   (pour la saisie au clavier) que quelques pages : le coût d'une touche ne dépend plus de la longueur.
// - Mode avancé : le découpage en pages est calculé (moteur/decoupage.js) ; ses coupures ne sont
//   dessinées que dans les blocs affichés.
// - Double page (zoom.js, zoom sous 60 %) : seuls les blocs des deux pages affichées (et un de chaque
//   côté) sont affichés ; la zone d'écriture devient une suite de colonnes de la taille d'une page, et
//   chaque coupure du découpage y force une nouvelle colonne : les pages sont exactement celles du mode
//   avancé, et le coût ne dépend pas de la longueur du document.
// - Pages tournées : un bloc qui commence sur une page tournée et y tient entier en prend la largeur
//   (mesuré à cette largeur sur une copie, à la demande) ; il est affiché avec la marque data-pm-alt.
// - Export Word : tous les blocs sont affichés, avec leurs coupures, le temps de l'export (showAll).
// Chaque bloc a sa « place » : la distance entre son haut et celui du bloc suivant, sans pages, mesurée
// quand il est affiché (estimée d'après son texte tant qu'il ne l'a pas été). Les marques posées sur les
// blocs (data-pm-far, data-pm-sp…) et les intercalaires n'appartiennent pas au texte : ils ne sont
// jamais lus ni enregistrés.
(function () {
  const M = window.FTMoteur;
  const D = window.FTDecoupage;
  const view = M.view;
  const mount = view.dom;
  const workspace = document.getElementById('workspace');
  const pageEl = document.getElementById('page');
  const { Plugin, PluginKey, Selection, TextSelection } = PM.state;
  const { Decoration, DecorationSet } = PM.view;

  const MIN_BLOCKS = 120;   // en dessous, tout reste affiché
  const MARGIN = 1.5;       // hauteurs d'écran affichées au-dessus et au-dessous de l'écran
  const FAR = 'data-pm-far'; // bloc retiré de l'affichage
  const SP = 'data-pm-sp';   // marge du haut (px) : la place des blocs retirés juste avant, ou la coupure de page
  const SB = 'data-pm-sb';   // marge du bas (px) : la place des blocs retirés à la fin
  const CS = 'data-pm-cs';   // numéros des titres (compteurs) repris après des blocs retirés
  const BRK = 'data-pm-brk'; // double page : le bloc ouvre une page (nouvelle colonne)
  const SPREAD = 'pm-spread'; // double page : classe de la zone d'écriture
  const ALT = 'data-pm-alt'; // bloc à la largeur d'une page tournée
  // Les marges sont écrites en deux parties (pixels entiers, puis le reste) : une seule longueur lue
  // dans un attribut est arrondie à 6 chiffres, soit au pixel près au-delà de 100 000 px.
  const MARKS = [FAR, SP, SP + 'f', SB, SB + 'f', CS, BRK, ALT];
  const MARKED = [FAR, SP, SB, CS, BRK, ALT].map((at) => `:scope > [${at}]`).join(', ');
  const setLen = (el, at, v) => {
    v = Math.max(0, v);
    const whole = Math.floor(v);
    el.setAttribute(at, whole + 'px');
    el.setAttribute(at + 'f', (v - whole).toFixed(4) + 'px');
  };
  const lenOf = (el, at) => (parseFloat(el.getAttribute(at)) || 0) + (parseFloat(el.getAttribute(at + 'f')) || 0);
  const unset = (el, ...ats) => { for (const at of ats) for (const a of [at, at + 'f']) if (el.hasAttribute(a)) el.removeAttribute(a); };

  // Mesures de chaque bloc (nœud du document), valables pour une largeur de texte (gen) :
  // slots : { h, next, gen } — place mesurée (du haut du bloc au haut du suivant, next) ;
  // meas : { height, mt, mb, units, gen } — hauteur, marges, endroits où le bloc peut être coupé.
  let gen = 1;
  const slots = new WeakMap();
  const meas = new WeakMap();
  const measAlt = new WeakMap(); // { m, slot, gen, shift } : mesure à la largeur d'une page tournée
  const estimates = new WeakMap();
  const lineStarts = new WeakMap(); // nœud → Map(« largeur:ligne:position du paragraphe » → position)
  // Blocs qui débordent sur les suivants (image habillée par le texte, lettrine) : hauteur de ce qui
  // dépasse, mesurée depuis le haut du bloc. Ces blocs sont toujours affichés avec ceux qu'ils touchent.
  const floatH = new WeakMap();
  // Objets devant ou derrière le texte (posés par-dessus) : hors du fil du texte, ils ne prennent pas de place.
  const LOOSE = '[data-wrap="devant"], [data-wrap="derriere"]';
  const FLOAT = '[data-wrap="gauche"], [data-wrap="droite"], ' + LOOSE;
  // Notes de bas de page au pied de leur page (mode avancé) : le bloc des notes, à la fin du texte, sort
  // du fil du texte (moteur.css, classe pm-fn-pages) ; chacune de ses notes est posée au bas de la page
  // de son appel (décorations du moteur, voir placeNotes). Pour le découpage, le bloc ne prend pas de place.
  const FN_OUT = 'pm-fn-pages';
  let fnOut = false;
  const isFootBox = (node) => node.type.name === 'container' && !!node.attrs.a && / ft-footnotes /.test(' ' + (node.attrs.a.class || '') + ' ');
  const looseNode = (node) => {
    if (fnOut && isFootBox(node)) return true;
    const a = node.attrs.a;
    const w = a && a['data-wrap'];
    return w === 'devant' || w === 'derriere';
  };
  const ZERO = { height: 0, mt: 0, mb: 0, units: [{ y: 0, b: 0, kind: 'start' }], loose: true };
  let floats = [];          // index des blocs qui débordent
  let shownBefore = new Set(); // éléments affichés
  let shownList = null; // [index, élément] des blocs affichés, dans l'ordre (null : inconnu)
  let marked = new Set();   // éléments portant une marge ou des compteurs
  let fresh = [];           // éléments créés par le moteur depuis le dernier passage
  const known = new WeakSet();
  const headings = new WeakMap();
  let head = 0;             // haut du premier bloc dans la zone d'écriture

  let els = [];             // éléments des blocs de premier niveau, dans l'ordre du document
  let indexOfEl = null;     // élément d'un bloc → sa place (faite à la demande)
  const layoutFns = [];     // appelés quand le découpage en pages change (numéros de page du plan…)
  const modeFns = [];       // appelés après un passage en mode note ou avancé, ou de nouveaux réglages des pages
  let nodes = [];           // nœuds correspondants
  let starts = [];          // position de chaque bloc dans le texte
  let nat = null;           // haut naturel (sans pages) de chaque bloc ; nat[n] : hauteur du texte
  let lay = null;           // découpage : { R, breaks, push, inner, pageOf, last } (R : haut de chaque bloc)
  let layDoc = null;        // document dont les blocs sont listés
  let pageCount = 0;        // nombre de pages pas encore donné à pages.js
  let virtual = false;      // affichage partiel
  let paged = false;        // mode avancé
  let lastKey = '';
  let seq = 0;              // change à chaque nouvelle liste de blocs
  let pendingScroll = false;
  let scrollEdge = '';      // Ctrl+Début, Ctrl+Fin : tout en haut ou tout en bas
  let off = false;          // essais : tout afficher
  let busy = false;
  let held = 0;             // gestes en cours sur un objet (objets.js) : rien n'est touché
  let pagesApi = null;      // pages.js : zones de texte des pages
  let needAll = false;      // mode avancé : tout mesurer au prochain passage
  const extra = new Set();  // blocs affichés en plus, le temps d'y aller (scrollIntoView)
  let spreadAt = null;      // double page : première page affichée (paire), ou null
  let spreadHead = -1;      // double page : place du curseur au dernier passage (la vue suit le curseur)
  const spreadFns = [];     // double page : appelés quand les pages affichées changent
  let brkEls = new Set();   // double page : blocs marqués comme ouvrant une page
  let altEls = new Set();   // blocs affichés à la largeur d'une page tournée
  let all = false;          // export : tous les blocs affichés

  const counterSheet = document.createElement('style');
  counterSheet.id = 'pm-visibles';
  document.head.append(counterSheet);

  const zoom = () => mount.currentCSSZoom || 1;
  const active = () => virtual || paged;

  // Les marques sont posées hors de la surveillance du moteur (sinon il relirait ces blocs).
  function mutate(fn) {
    const obs = view.domObserver;
    obs.stop();
    try { fn(); } finally { obs.start(); }
  }

  // Double page : les mesures se font sur la zone d'écriture sans colonnes (le temps de la mesure, seuls
  // quelques blocs sont affichés : c'est rapide).
  function flat(fn) {
    const on = mount.classList.contains(SPREAD);
    if (on) mount.classList.remove(SPREAD);
    try { return fn(); } finally { if (on) mount.classList.add(SPREAD); }
  }
  const spreading = () => spreadAt !== null && paged;

  // ----- Intercalaires des coupures de page (décorations du moteur) -----

  const pagesKey = new PluginKey('ft-pages');
  const gapEls = new Map();   // clé → élément de l'intercalaire
  let decoSig = '';
  let gapPositions = new Set(); // positions des intercalaires au milieu d'une ligne de texte
  M.addPlugin(new Plugin({
    key: pagesKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => {
        const next = tr.getMeta(pagesKey);
        if (next) return next;
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
      }
    },
    props: {
      decorations: (state) => pagesKey.getState(state),
      // Flèches de part et d'autre d'un intercalaire : le curseur avance d'un caractère (sinon le
      // navigateur passe l'intercalaire, à la même place dans le texte, et le curseur semble bloqué).
      handleKeyDown(v, e) {
        if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey || e.altKey || e.metaKey || !gapPositions.size) return false;
        const sel = v.state.selection;
        if (!gapPositions.has(sel.head)) return false;
        const to = sel.head + (e.key === 'ArrowLeft' ? -1 : 1);
        if (to < 0 || to > v.state.doc.content.size) return false;
        const $to = v.state.doc.resolve(to);
        if (!$to.parent.isTextblock) return false;
        v.dispatch(v.state.tr.setSelection(e.shiftKey ? TextSelection.create(v.state.doc, sel.anchor, to) : TextSelection.create(v.state.doc, to)).scrollIntoView());
        return true;
      }
    }
  }));

  function gapWidget(pos, kind, key, height) {
    return Decoration.widget(pos, () => {
      let el;
      if (kind === 'row') {
        el = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 99;
        td.style.height = Math.max(1, height) + 'px';
        el.append(td);
      } else if (kind === 'head') {
        el = document.createElement('tr');
        el.className = 'ft-pg-rhead';
      } else {
        el = document.createElement(kind === 'line' ? 'span' : 'div');
        el.style.height = Math.max(1, height) + 'px';
      }
      el.classList.add('ft-pg-gap');
      el.contentEditable = 'false';
      el.setAttribute('aria-hidden', 'true');
      gapEls.set(key, el);
      return el;
    }, { side: kind === 'head' ? -1 : -2, key, ignoreSelection: true, stopEvent: () => true });
  }
  const gapHeight = (el) => parseFloat((el.tagName === 'TR' ? el.firstChild : el).style.height) || 0;
  const setGapHeight = (el, h) => { (el.tagName === 'TR' ? el.firstChild : el).style.height = Math.max(1, h) + 'px'; };

  function setDecorations(specs) {
    const sig = specs.map((s) => s.key).join('|');
    if (sig === decoSig) return false;
    decoSig = sig;
    const doc = view.state.doc;
    const decos = [];
    for (const s of specs) {
      decos.push(gapWidget(s.pos, s.kind, s.key, s.height));
      if (s.head) decos.push(gapWidget(s.pos, 'head', s.key + ':h', 0));
    }
    gapPositions = new Set(specs.filter((s) => s.kind === 'line').map((s) => s.pos));
    for (const k of [...gapEls.keys()]) if (!specs.some((s) => k === s.key || k === s.key + ':h')) gapEls.delete(k);
    const set = DecorationSet.create(doc, decos);
    busy = true;
    try {
      view.updateState(view.state.apply(view.state.tr.setMeta(pagesKey, set).setMeta('addToHistory', false)));
    } finally {
      busy = false;
    }
    return true;
  }

  // ----- Blocs et places -----

  function collect() {
    indexOfEl = null;
    els = [];
    nodes = [];
    starts = [];
    const dv = view.docView;
    for (const el of mount.children) {
      const d = el.pmViewDesc;
      if (d && d.parent === dv && d.node && d.dom === el) {
        els.push(el);
        nodes.push(d.node);
        if (!known.has(el)) { known.add(el); fresh.push(el); }
      }
    }
    // Le moteur garde l'élément d'un bloc refait à l'identique (Ctrl+Z…) avec l'ancien nœud : les
    // blocs sont ceux du document, et leurs mesures passent de l'un à l'autre.
    const doc = view.state.doc;
    if (nodes.length === doc.childCount) {
      const was = nodes;
      let moved = false;
      nodes = [];
      for (let i = 0; i < was.length; i++) {
        const node = doc.child(i);
        nodes.push(node);
        if (node === was[i]) continue;
        moved = true;
        for (const cache of [meas, estimates, lineStarts, floatH, headings, slots]) {
          if (cache.has(was[i]) && !cache.has(node)) cache.set(node, cache.get(was[i]));
        }
      }
      if (moved) {
        for (let i = 0; i < nodes.length; i++) {
          const sl = slots.get(nodes[i]);
          if (sl && i + 1 < nodes.length && sl.next !== nodes[i + 1] && sl.next === was[i + 1]) slots.set(nodes[i], { ...sl, next: nodes[i + 1] });
        }
      }
    }
    let pos = 0;
    for (const node of nodes) { starts.push(pos); pos += node.nodeSize; }
    floats = [];
    for (let i = 0; i < els.length; i++) if (floatHeight(i)) floats.push(i);
    layDoc = view.state.doc;
    seq++;
    nat = null;
    lay = null;
    return nodes.length === view.state.doc.childCount;
  }

  // Place estimée d'un bloc jamais affiché : ses lignes de texte (environ 85 caractères par ligne).
  function estimate(node) {
    let h = estimates.get(node);
    if (h !== undefined) return h;
    const name = node.type.name;
    if (name === 'image') h = 300;
    else if (name === 'raw_block') {
      // Image ou schéma, autre objet.
      const html = node.attrs.html || '';
      h = /<(img|svg)[\s>]/.test(html) ? 300 : 90;
    } else if (name === 'table') h = node.childCount * 30 + 16;
    else if (node.isTextblock) h = Math.max(1, Math.ceil(node.content.size / 85)) * 25.6 + 9.6;
    else {
      h = 9.6;
      node.descendants((c) => {
        if (c.isTextblock) { h += Math.max(1, Math.ceil(c.content.size / 80)) * 25.6; return false; }
        return true;
      });
    }
    estimates.set(node, h);
    return h;
  }

  function floatHeight(i) {
    const node = nodes[i];
    let h = floatH.get(node);
    if (h !== undefined) return h;
    const el = els[i];
    h = el.matches(FLOAT) || el.querySelector(FLOAT) ? 300 : el.hasAttribute('data-lettrine') ? 100 : 0;
    floatH.set(node, h);
    return h;
  }
  // Dernier bloc touché par ce qui dépasse du bloc f.
  function reach(f) {
    const R = lay.R;
    const bottom = R[f] + floatHeight(f);
    let lo = f;
    let hi = nodes.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R[mid] < bottom) lo = mid; else hi = mid - 1; }
    return lo;
  }

  const current = (x) => (x && x.gen === gen ? x : null);
  // Marges qui se touchent : la plus grande des deux (ou leur somme si l'une est négative).
  const collapse = (a, b) => (a >= 0 && b >= 0 ? Math.max(a, b) : a < 0 && b < 0 ? Math.min(a, b) : a + b);
  function slotOf(i) {
    if (looseNode(nodes[i])) return 0;
    const s = current(slots.get(nodes[i]));
    if (s && s.next === (nodes[i + 1] || null)) return s.h;
    const m = current(meas.get(nodes[i]));
    if (m) {
      if (i + 1 >= nodes.length) return s ? s.h : m.height + Math.max(0, m.mb);
      const m2 = current(meas.get(nodes[i + 1]));
      if (m2) return m.height + collapse(m.mb, m2.mt);
      if (s) return s.h;
      return m.height + Math.max(m.mb, 9.6);
    }
    return s ? s.h : estimate(nodes[i]);
  }
  // Mesure d'un bloc pour le découpage (estimée d'après sa place s'il n'a jamais été affiché).
  function measOf(i) {
    if (looseNode(nodes[i])) return ZERO;
    const m = current(meas.get(nodes[i]));
    if (m) return m;
    const h = Math.max(1, slotOf(i) - 9.6);
    const node = nodes[i];
    const units = [{ y: 0, b: Math.min(h, 25.6), kind: 'start' }];
    if (node.isTextblock) for (let y = 25.6; y + 25.6 <= h; y += 25.6) units.push({ y, b: y + 25.6, kind: 'line', est: true });
    if (fnOut) { const f = fnIdsOf(node); if (f.length) units[0].fn = f; }
    return { height: h, mt: 0, mb: 9.6, units, est: true };
  }

  // Appels de note de bas de page d'un bloc jamais mesuré (identifiants, dans l'ordre du texte).
  const fnIds = new WeakMap();
  const FN_REF = /^<sup\b[^>]*\bclass="[^"]*\bft-fn-ref\b/;
  function fnIdsOf(node) {
    let list = fnIds.get(node);
    if (list) return list;
    list = [];
    node.descendants((c) => {
      if (c.type.name !== 'raw_inline') return true;
      const m = FN_REF.test(c.attrs.html) && / data-fn="([^"]+)"/.exec(c.attrs.html);
      if (m) list.push(m[1]);
      return false;
    });
    fnIds.set(node, list);
    return list;
  }

  // Hauteur d'un bloc dans le découpage (à la largeur d'une page tournée, s'il y est).
  const heightOf = (i) => (lay && lay.alt && lay.alt[i] ? altOf(i).m.height : measOf(i).height);

  // Mesure d'un bloc à la largeur d'une page tournée (pages tournées une à une) : faite à la demande, sur
  // une copie, pour les seuls blocs qui commencent sur une page tournée. Sa place garde l'écart d'avec
  // le bloc suivant.
  let altShift = '';
  function altOf(i) {
    const node = nodes[i];
    const a = measAlt.get(node);
    if (a && a.gen === gen && a.shift === altShift) return a;
    if (looseNode(node) || !els[i] || !els[i].isConnected) return null;
    const m = measureBlock(i, zoom(), true);
    const base = measOf(i);
    const r = { m, slot: Math.max(0, slotOf(i) - base.height + m.height), gen, shift: altShift };
    measAlt.set(node, r);
    return r;
  }

  // Dernier découpage et ce qui l'a donné : refait seulement si une place, une mesure ou une règle de
  // bloc a changé (la plupart des touches ne changent pas la hauteur du paragraphe : rien à redécouper).
  let memo = null;
  const sameUnits = (a, b) => {
    if (a.length !== b.length) return false;
    for (let j = 0; j < a.length; j++) if (a[j].y !== b[j].y || a[j].b !== b[j].b || a[j].kind !== b[j].kind || String(a[j].fn || '') !== String(b[j].fn || '')) return false;
    return true;
  };
  const sameMeas = (a, b) => a === b || (!!a && !!b && a.height === b.height && a.mt === b.mt && a.mb === b.mb && sameUnits(a.units, b.units));

  // Règles de découpage propres à un bloc : 1 page qui reste en place, 2 légende, 4 en-tête répété.
  const ruleBits = new WeakMap();
  function rulesOf(node) {
    let f = ruleBits.get(node);
    if (f === undefined) {
      f = 0;
      const a = node.attrs.a;
      if (a) {
        if (a['data-pg-start']) f |= 1;
        if (a.class && /\bft-legend\b/.test(a.class)) f |= 2;
        if (node.type.name === 'table' && a['data-header'] !== undefined && a['data-repeat'] !== undefined) f |= 4;
      } else if (node.type.name === 'raw_block' && /^<[^>]*\sdata-pg-start=/.test(node.attrs.html)) {
        // Objet fermé (plan…) posé en haut d'une page par un modèle de mise en page (modeles.js).
        f |= 1;
      }
      if (node.type.name === 'heading') f |= 16;
      ruleBits.set(node, f);
    }
    return f;
  }

  // Titre qui commence toujours une page (réglages des pages, « Nouvelle page avant ») : bit 32.
  const isChapter = (node) => {
    const c = pagesApi && pagesApi.chapters ? pagesApi.chapters() : 0;
    return !!c && node.type.name === 'heading' && node.attrs.level <= c && !/\bft-title\b/.test(node.attrs.a.class || '');
  };

  let relayouts = 0;
  let reused = 0;
  function relayout() {
    relayouts++;
    const n = nodes.length;
    const sl = new Float64Array(n);
    nat = new Float64Array(n + 1);
    nat[0] = head;
    for (let i = 0; i < n; i++) { sl[i] = slotOf(i); nat[i + 1] = nat[i] + sl[i]; }
    if (!paged || !pagesApi) {
      lay = { R: nat, breaks: new Map(), push: null, inner: null, pageOf: null, last: 0 };
      return;
    }
    const off = pagesApi.offset();
    const keepOn = pagesApi.keep();
    const turned = !!(pagesApi.turned && pagesApi.turned());
    const cover = !!(pagesApi.cover && pagesApi.cover());
    if (turned) altShift = getComputedStyle(pageEl).getPropertyValue('--pg-shift').trim();
    const ms = new Array(n);
    const fl = new Uint8Array(n);
    // Nouvelle page avant chaque titre de niveau 1 (ou 1 et 2) : 32 (réglages des pages, « Nouvelle page avant »).
    for (let i = 0; i < n; i++) {
      ms[i] = measOf(i);
      fl[i] = rulesOf(nodes[i]) | (i + 1 < n && nodes[i + 1].type.name === 'table' ? 8 : 0);
      if (isChapter(nodes[i])) fl[i] |= 32;
    }
    if (fnOut) measureNotes();
    const nSig = fnOut ? noteSig : '';
    if (memo && !turned && memo.gen === gen && memo.n === n && memo.head === head && memo.off === off && memo.keepOn === keepOn && memo.cover === cover && memo.nSig === nSig) {
      let same = true;
      // (Places à un quart de pixel près, comme les mesures enregistrées.)
      for (let i = 0; i < n && same; i++) same = Math.abs(sl[i] - memo.sl[i]) <= 0.25 && fl[i] === memo.fl[i] && sameMeas(ms[i], memo.ms[i]);
      if (same) {
        reused++;
        lay = memo.lay;
        memo.ms = ms;
        return;
      }
    }
    const regionCache = [];
    const region = (r) => {
      if (!regionCache[r]) {
        const g = pagesApi.region(r);
        regionCache[r] = { page: g.page, ct: g.ct - off, cb: g.cb - off, full: true, turned: !!g.turned };
      }
      return regionCache[r];
    };
    const result = D.paginate({
      n,
      head,
      cover,
      slot: (i) => sl[i],
      meas: (i) => ms[i],
      keep: (i) => (keepOn && !!(fl[i] & 1)) || !!(fl[i] & 32),
      legend: (i) => (fl[i] & 10) === 10,
      withNext: (i) => !!(fl[i] & 16),
      repeat: (i) => {
        if (!(fl[i] & 4)) return 0;
        const u = ms[i].units;
        return u[1] && u[1].kind === 'row' ? u[1].y - u[0].y : u[0].b;
      },
      region,
      alt: turned ? (i) => altOf(i) : null,
      note: fnOut && noteInfo.size ? (id) => noteInfo.get(id) : null,
      sep: sepH
    });
    // Ce que chaque bloc reçoit avant lui (coupure avant le bloc) et dans le bloc (coupures au milieu).
    const push = new Float64Array(n);
    const inner = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      push[i] = result.R[i] - (i ? result.R[i - 1] + result.S[i - 1] + inner[i - 1] : head);
      for (const br of result.breaks.get(i) || []) inner[i] += br.add;
    }
    lay = { ...result, push, inner, region };
    memo = { gen, n, head, off, keepOn, cover, sl, ms, fl, lay, nSig };
    for (const fn of layoutFns) fn();
    // Nombre de pages donné à pages.js à la fin du passage (un découpage intermédiaire, fait avec la
    // place estimée d'un bloc modifié, ferait redessiner toutes les feuilles pour rien).
    pageCount = Math.max(1, region(result.last).page + 1);
  }

  // ----- Notes de bas de page au pied des pages (mode avancé) -----

  const noteMeas = new WeakMap(); // nœud d'une note → { h, cuts, gen } (px, taille réelle)
  let noteInfo = new Map();       // identifiant → { h, cuts, node, pos }
  let noteSig = '';
  let sepH = 0;                   // place du filet au-dessus des notes d'une page
  let sepGen = 0;
  let foots = [];                 // index des blocs de notes (un seul, sauf le temps de les réunir : notes.js)
  let footsSeq = -1;
  const footList = () => {
    if (footsSeq !== seq) {
      footsSeq = seq;
      foots = [];
      for (let i = 0; i < nodes.length; i++) if (isFootBox(nodes[i])) foots.push(i);
    }
    return foots;
  };

  function setFnOut(on) {
    if (on === fnOut) return;
    fnOut = on;
    mutate(() => mount.classList.toggle(FN_OUT, on));
    // (Seule la place du bloc qui précède les notes change.)
    for (const fi of footList()) if (fi > 0) slots.delete(nodes[fi - 1]);
    nat = null;
    lay = null;
    memo = null;
    lastKey = '';
    noteInfo = new Map();
    noteSig = '';
    if (!on) setNoteDecorations([]);
  }

  // Hauteur de chaque note, et ses endroits de coupure (haut de chaque ligne après la première). Seules
  // les notes modifiées depuis la dernière fois sont mesurées.
  function measureNotes() {
    noteInfo = new Map();
    let sig = '';
    const k = zoom();
    for (const fi of footList()) {
      const el = els[fi];
      if (el.hasAttribute(FAR)) mutate(() => el.removeAttribute(FAR));
      if (sepGen !== gen) {
        sepGen = gen;
        sepH = Math.round((parseFloat(getComputedStyle(el).fontSize) || 13) * 1.4);
      }
      const base = starts[fi] + 1;
      nodes[fi].forEach((ol, off) => {
        if (ol.type.name !== 'ordered_list') return;
        ol.forEach((li, off2) => {
          const id = li.attrs.a['data-fn'];
          if (!id || noteInfo.has(id)) return;
          const pos = base + off + 1 + off2;
          let m = noteMeas.get(li);
          if (!m || m.gen !== gen) {
            const dom = view.nodeDOM(pos);
            if (!dom || dom.nodeType !== 1) return;
            const r = dom.getBoundingClientRect();
            const cuts = noteLines(dom).slice(1).map((l) => (l.top - r.top) / k).filter((y) => y > 1);
            m = { h: r.height / k, cuts, gen };
            noteMeas.set(li, m);
          }
          noteInfo.set(id, { h: m.h, cuts: m.cuts, node: li, pos });
          sig += id + ':' + m.h.toFixed(2) + ';';
        });
      });
    }
    noteSig = sig;
  }

  // Lignes d'une note (tous ses paragraphes) : { top, bottom } à l'écran.
  const noteRange = document.createRange();
  function noteLines(li) {
    const rects = [];
    const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let x = w.nextNode(); x; x = w.nextNode()) {
      let list;
      if (x.nodeType === 3) {
        if (!x.data.length) continue;
        noteRange.selectNodeContents(x);
        list = noteRange.getClientRects();
      } else if (x.tagName === 'IMG' || x.tagName === 'BR' || x.getAttribute('contenteditable') === 'false') list = [x.getBoundingClientRect()];
      else continue;
      for (const r of list) if (r.height > 0) rects.push({ top: r.top, bottom: r.bottom });
    }
    rects.sort((a, b) => a.top - b.top);
    const lines = [];
    for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last && r.top < last.bottom - 2) last.bottom = Math.max(last.bottom, r.bottom);
      else lines.push({ ...r });
    }
    // (Haut d'une ligne : à mi-chemin du bas de la ligne d'avant.)
    for (let i = 1; i < lines.length; i++) lines[i].top = (lines[i - 1].bottom + lines[i].top) / 2;
    return lines;
  }

  // Décorations des notes : place de chaque note (et le haut de sa partie visible), suites des notes
  // coupées (copie de la fin de la note en tête des notes de la page suivante), filet au-dessus des
  // notes de chaque page, numéro.
  const notesKey = new PluginKey('ft-notes-pages');
  let noteDecoSig = '';
  M.addPlugin(new Plugin({
    key: notesKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => {
        const next = tr.getMeta(notesKey);
        if (next) return next;
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
      }
    },
    props: { decorations: (state) => notesKey.getState(state) }
  }));
  function setNoteDecorations(specs) {
    const sig = specs.map((s) => s.sig).join('|');
    // (Même place, mais décoration perdue : note remplacée par une modification, la première lettre tapée
    // dans une note vide par exemple. La note resterait cachée en haut du texte.)
    if (sig === noteDecoSig && notesKey.getState(view.state).find().length === specs.length) return;
    noteDecoSig = sig;
    const decos = [];
    for (const s of specs) {
      if (s.node) decos.push(Decoration.node(s.pos, s.pos + s.node.nodeSize, s.attrs));
      else decos.push(Decoration.widget(s.pos, () => contWidget(s), { key: s.sig, side: 1, ignoreSelection: true, stopEvent: () => true }));
    }
    const set = DecorationSet.create(view.state.doc, decos);
    busy = true;
    try {
      view.updateState(view.state.apply(view.state.tr.setMeta(notesKey, set).setMeta('addToHistory', false)));
    } finally {
      busy = false;
    }
  }
  // Suite d'une note coupée : la fin de la note, recopiée (sans numéro).
  function contWidget(s) {
    const wrap = document.createElement('div');
    wrap.className = 'pm-fn-cont' + (s.first ? ' pm-fn-top' : '');
    wrap.contentEditable = 'false';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = s.style;
    const clip = document.createElement('div');
    clip.className = 'pm-fn-clip';
    const inner = document.createElement('div');
    inner.style.marginTop = -s.y0 + 'px';
    clip.append(inner);
    const li = view.nodeDOM(s.liPos);
    if (li && li.nodeType === 1) {
      inner.innerHTML = li.innerHTML;
      inner.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    }
    wrap.append(clip);
    // Clic : le curseur va dans la note.
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const info = noteInfo.get(s.id);
      if (!info) return;
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(info.pos + info.node.nodeSize - 1), -1)));
      view.focus();
    });
    return wrap;
  }

  // Les notes posées d'après le découpage : chacune au bas de la page de son appel.
  function placeNotes() {
    const fl = fnOut ? footList() : [];
    if (!lay || !lay.notes || !fl.length) { setNoteDecorations([]); return; }
    const specs = [];
    const spread = spreading();
    let stride = 0;
    let base = 0;
    let colW = 0;
    if (spread) {
      const cs = getComputedStyle(mount);
      const gap = parseFloat(cs.columnGap) || 0;
      colW = (mount.clientWidth - gap) / 2;
      stride = colW + gap;
      base = shownList && shownList.length ? lay.pageOf[shownList[0][0]] : spreadAt;
    }
    let num = 0;
    const order = new Map();
    for (const id of noteInfo.keys()) order.set(id, ++num);
    const last = fl[fl.length - 1];
    const end = starts[last] + nodes[last].nodeSize - 1;
    lay.notes.forEach((list, r) => {
      if (!list || !list.length) return;
      const g = lay.region(r);
      let y = g.cb - lay.fh[r] + sepH;
      let x = '';
      if (spread) {
        if (g.page < spreadAt || g.page > spreadAt + 1) return;
        y -= g.ct;
        x = `left: calc(${((g.page - base) * stride).toFixed(2)}px + 1.8em); right: auto; width: calc(${colW.toFixed(2)}px - 1.8em);`;
      }
      list.forEach((p, k) => {
        const info = noteInfo.get(p.id);
        if (!info) return;
        const top = `top: ${y.toFixed(2)}px;${x}`;
        if (p.y0 < 0.5) {
          const clip = p.y1 < info.h - 0.5 ? `clip-path: inset(-2em -3em ${(info.h - p.y1).toFixed(2)}px -3em);` : '';
          const attrs = { style: top + clip, 'data-pm-n': String(order.get(p.id)) };
          if (!k) attrs.class = 'pm-fn-top';
          specs.push({ node: info.node, pos: info.pos, attrs, sig: `n:${info.pos}:${top}${clip}:${k ? '' : 't'}:${attrs['data-pm-n']}` });
        } else {
          const style = top + `height: ${(p.y1 - p.y0).toFixed(2)}px;`;
          specs.push({ pos: end, liPos: info.pos, id: p.id, y0: p.y0, style, first: !k, sig: `c:${p.id}:${p.y0.toFixed(2)}:${style}:${k ? '' : 't'}:${noteSig.length}:${info.node.content.size}` });
        }
        y += p.y1 - p.y0;
      });
    });
    // (Une note dont l'appel n'est pas encore placé reste cachée.)
    setNoteDecorations(specs);
  }

  // Titres contenus dans un bloc (niveaux 1 à 5), pour reprendre leur numérotation.
  function headingLevels(node) {
    let list = headings.get(node);
    if (list) return list;
    list = [];
    const visit = (c) => {
      if (c.type.name === 'heading') {
        if (!/\bft-title\b/.test(c.attrs.a.class || '')) list.push(c.attrs.level);
        return false;
      }
      return !c.isTextblock;
    };
    if (visit(node)) node.descendants(visit);
    headings.set(node, list);
    return list;
  }
  function countHeadings(node, counts) {
    for (const lv of headingLevels(node)) {
      if (lv < 1 || lv > 5) continue;
      counts[lv - 1]++;
      for (let j = lv; j < 5; j++) counts[j] = 0;
    }
  }
  // Valeur des compteurs posée sur un bloc (counter-set s'applique après counter-increment : un titre
  // reçoit les valeurs qui le comptent déjà, un autre bloc celles d'avant lui).
  const counterValue = (counts) => counts.map((c, j) => `fth${j + 1} ${c}`).join(' ');

  // ----- Ce qui est affiché -----

  // Blocs à afficher autour de l'écran : [a, b] (index).
  function windowRange() {
    const n = nodes.length;
    if (all) return [0, n - 1];
    if (spreading() && lay.pageOf) return spreadRange();
    if (!virtual) return [0, n - 1];
    const R = lay.R;
    const k = zoom();
    const mr = mount.getBoundingClientRect();
    const v = workspace.getBoundingClientRect();
    const vh = v.height / k;
    const y0 = (v.top - mr.top) / k - vh * MARGIN;
    const y1 = (v.bottom - mr.top) / k + vh * MARGIN;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (R[mid + 1] <= y0) lo = mid + 1; else hi = mid; }
    const a = lo;
    lo = a;
    hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R[mid] < y1) lo = mid; else hi = mid - 1; }
    return [a, Math.max(a, lo)];
  }

  // Double page : les blocs des pages spreadAt et spreadAt + 1, plus un bloc de chaque côté (le curseur
  // peut y passer aux flèches ; leurs colonnes sont hors de la vue).
  function spreadRange() {
    const n = nodes.length;
    const P = lay.pageOf;
    const p = spreadAt;
    // Premier bloc qui commence sur la page p ou après, et dernier qui commence au plus sur la page p + 1.
    let lo = 0;
    let hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid] < p) lo = mid + 1; else hi = mid; }
    const first = lo;
    lo = first;
    hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid] <= p + 1) lo = mid + 1; else hi = mid; }
    const a = Math.max(0, first - 1);
    return [Math.min(a, n - 1), Math.min(n - 1, Math.max(a, lo))];
  }

  // Page (à partir de 0) d'une position du texte, d'après le découpage.
  function pageOfPos(pos) {
    if (!lay || !lay.pageOf || !nodes.length) return null;
    const doc = view.state.doc;
    const i = Math.min(doc.resolve(Math.min(pos, doc.content.size)).index(0), nodes.length - 1);
    let p = lay.pageOf[i];
    const b = lay.breaks.get(i);
    if (b) {
      const u = measOf(i).units;
      for (const br of b) {
        const unit = u[br.j];
        if (unit && unit.rel !== undefined && starts[i] + unit.rel < pos) p++;
      }
    }
    return p;
  }

  function setSpread(p) {
    if (p === spreadAt) return;
    spreadAt = p;
    lastKey = '';
    for (const fn of spreadFns) fn(p);
  }

  function selectionBlocks() {
    const { $from, $to } = view.state.selection;
    const n = nodes.length;
    return new Set([Math.min($from.index(0), n - 1), Math.min($to.index(0), n - 1)]);
  }

  function deactivate() {
    lastKey = '';
    setFnOut(false);
    const had = virtual || shownBefore.size || marked.size || decoSig;
    virtual = false;
    if (!had) return;
    mutate(() => {
      for (const el of mount.querySelectorAll(MARKED)) {
        for (const at of MARKS) el.removeAttribute(at);
      }
    });
    counterSheet.textContent = '';
    shownBefore = new Set();
    shownList = null;
    marked = new Set();
    fresh = [];
    setDecorations([]);
  }

  function update(force) {
    if (off || busy || held || mount.offsetParent === null) return;
    if (pagesApi && pagesApi.pending()) { pagesApi.prepare(); return; }
    paged = !!(pagesApi && pagesApi.paged());
    if (paged !== fnOut) setFnOut(paged);
    // Éléments des blocs refaits par le moteur sans nouvelle liste (Ctrl+Z après une note ajoutée…) : la
    // liste est refaite, sinon les places mesurées sur des éléments retirés de la page seraient fausses.
    if (els.length && els.some((el) => !el.isConnected)) collect();
    if (!nat || !lay) {
      if (nodes.length !== view.state.doc.childCount || !nodes.length) collect();
      if (nodes.length !== view.state.doc.childCount) { deactivate(); return; }
    }
    const wasVirtual = virtual;
    virtual = nodes.length >= MIN_BLOCKS || spreading();
    if (!virtual && !paged) { deactivate(); return; }
    if (paged && needAll) { measureAll(); return; }
    if (!lay) relayout();
    // Passage à l'affichage partiel : tous les blocs sont à revoir.
    if (virtual && !wasVirtual) fresh = els.slice();
    // Double page : le curseur a bougé (frappe, flèches, clic) hors des pages affichées : la vue le suit.
    if (spreading() && !all) {
      const h = view.state.selection.head;
      if (h !== spreadHead) {
        spreadHead = h;
        const pg = pageOfPos(h);
        if (pg !== null && (pg < spreadAt || pg > spreadAt + 1)) setSpread(pg - (pg % 2));
      }
    }
    const ranges = [windowRange()];
    // (Le bloc des notes, sorti du fil du texte, est toujours affiché.)
    if (fnOut) for (const fi of footList()) ranges.push([fi, fi]);
    if (!spreading()) {
      for (const i of selectionBlocks()) ranges.push([i, i]);
      for (const i of extra) if (i < nodes.length) ranges.push([i, i]);
    }
    // Un bloc touché par une image habillée (ou une lettrine) s'affiche avec elle, et inversement.
    for (const r of ranges) {
      for (let k = floats.length - 1; k >= 0; k--) {
        const f = floats[k];
        if (f < r[0] && reach(f) >= r[0]) r[0] = f;
      }
      for (const f of floats) if (f >= r[0] && f <= r[1]) r[1] = Math.max(r[1], reach(f));
      // Une image habillée ne peut pas porter la place des blocs retirés (sa marge ne repousse pas le
      // texte qui suit) : le bloc d'avant, ou d'après, est affiché aussi.
      while (r[0] > 0 && els[r[0]].matches(FLOAT)) r[0]--;
      while (r[1] < nodes.length - 1 && els[r[1]].matches(FLOAT)) r[1]++;
    }
    const key = seq + ':' + paged + ':' + ranges.map((r) => r.join('-')).join(',');
    if (key === lastKey && !force) { sendCount(); placeNotes(); return; }
    lastKey = key;
    busy = true;
    try {
      for (let pass = 0; pass < 4; pass++) if (!apply(ranges)) break;
    } finally {
      busy = false;
    }
    sendCount();
    placeNotes();
    if (flowCheck) noteFlowing();
  }
  function sendCount() {
    if (!pageCount) return;
    const n = pageCount;
    pageCount = 0;
    if (paged && pagesApi.setCount) pagesApi.setCount(n);
  }

  // Position d'un endroit mesuré dans un bloc (élément de la page) : la position du nœud dans le texte.
  function posBefore(el) {
    const d = el && el.pmViewDesc;
    return d && d.node && d.dom === el ? d.posBefore : null;
  }

  // Images pas encore chargées : la place du bloc n'est pas encore la bonne (il est remesuré au chargement).
  const stale = new WeakSet();
  function imagesReady(el) {
    for (const im of el.getElementsByTagName('img')) if (!im.complete) return false;
    return true;
  }

  // Mesure d'un bloc affiché, tel qu'il serait sans coupures de page : sur le bloc lui-même s'il n'en a
  // pas, sinon sur une copie sans intercalaires posée à sa place le temps de la mesure.
  // (Double page : le texte y est affiché au zoom de la double page ; ces mesures sont refaites au retour.)
  const spreadMeasured = new Set();
  // (wide : à la largeur d'une page tournée.)
  const measureBlock = (i, k, wide) => {
    if (spreading() && !wide) spreadMeasured.add(nodes[i]);
    return flat(() => measureBlockNow(i, k, wide));
  };
  function measureBlockNow(i, k, wide) {
    const el = els[i];
    // (Une marge posée par le moteur fausserait aussi la mesure des marges du bloc ; une zone en colonnes
    // se mesure sur une copie mise en une colonne.)
    const plain = !wide && !el.classList.contains('ft-cols') && !el.hasAttribute(FAR) && !el.querySelector('.ft-pg-gap') && !el.hasAttribute(SP) && !el.hasAttribute(SB) && !el.hasAttribute(ALT);
    let m;
    let map = null;
    if (plain) m = D.measure(el, k);
    else {
      mutate(() => {
        const copy = el.cloneNode(true);
        for (const at of MARKS) copy.removeAttribute(at);
        if (wide) copy.setAttribute(ALT, '');
        copy.querySelectorAll('.ft-pg-gap').forEach((g) => g.remove());
        const a = [...el.querySelectorAll('*')].filter((x) => !x.closest('.ft-pg-gap'));
        const b = [...copy.querySelectorAll('*')];
        map = new Map(b.map((x, j) => [x, a[j]]));
        map.set(copy, el);
        const wasFar = el.hasAttribute(FAR);
        el.before(copy);
        if (!wide) el.setAttribute(FAR, '');
        try {
          m = D.measure(copy, k);
        } finally {
          copy.remove();
          if (!wasFar && !wide) el.removeAttribute(FAR);
        }
      });
    }
    const base = starts[i];
    const units = [];
    for (const u of m.units) {
      if (u.kind === 'start') { units.push({ y: u.y, b: u.b, kind: 'start', fn: u.fn }); continue; }
      const orig = map ? map.get(u.at) : u.at;
      const p = posBefore(orig);
      if (p === null) {
        // (Ses appels de note vont avec l'endroit d'avant.)
        if (u.fn) { const last = units[units.length - 1]; last.fn = (last.fn || []).concat(u.fn); }
        continue;
      }
      units.push({ y: u.y, b: u.b, kind: u.kind, rel: p - base, line: u.line, fn: u.fn });
    }
    if (imagesReady(el)) stale.delete(nodes[i]);
    else stale.add(nodes[i]);
    return { height: m.height, mt: m.mt, mb: m.mb, units, gen };
  }

  // Début de la ligne n° line d'un paragraphe (rel : sa position dans le bloc), sans coupures : position.
  const lineStartPos = (i, rel, line) => flat(() => lineStartPosNow(i, rel, line));
  function lineStartPosNow(i, rel, line) {
    const node = nodes[i];
    let cache = lineStarts.get(node);
    if (!cache || cache.gen !== gen) { cache = { gen, map: new Map() }; lineStarts.set(node, cache); }
    const ck = rel + ':' + line;
    if (cache.map.has(ck)) return cache.map.get(ck);
    const el = els[i];
    const tb = view.nodeDOM(starts[i] + rel);
    if (!tb || !el.contains(tb)) return null;
    let pos = null;
    mutate(() => {
      const copy = el.cloneNode(true);
      for (const at of MARKS) copy.removeAttribute(at);
      copy.querySelectorAll('.ft-pg-gap').forEach((g) => g.remove());
      // L'élément du paragraphe dans la copie, et ses textes (dans l'ordre) avec ceux de l'original.
      const path = [];
      for (let x = tb; x !== el; x = x.parentNode) path.unshift([...x.parentNode.childNodes].filter((c) => !(c.nodeType === 1 && c.classList.contains('ft-pg-gap'))).indexOf(x));
      let ctb = copy;
      for (const j of path) ctb = [...ctb.childNodes][j];
      const texts = (root, skipGaps) => {
        const out = [];
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
          acceptNode: (x) => (skipGaps && x.nodeType === 1 && x.classList.contains('ft-pg-gap') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
        });
        for (let x = w.nextNode(); x; x = w.nextNode()) out.push(x);
        return out;
      };
      const a = texts(tb, true);
      const b = texts(ctb, false);
      el.before(copy);
      const wasFar = el.hasAttribute(FAR);
      el.setAttribute(FAR, '');
      try {
        const at = D.lineStart(ctb, line);
        if (at) {
          const orig = a[b.indexOf(at.node)];
          if (orig) pos = at.offset < 0 ? view.posAtDOM(orig.parentNode, [...orig.parentNode.childNodes].indexOf(orig)) : view.posAtDOM(orig, at.offset);
        }
      } catch {
        pos = null;
      } finally {
        copy.remove();
        if (!wasFar) el.removeAttribute(FAR);
      }
    });
    const rel2 = pos === null ? null : pos - starts[i];
    cache.map.set(ck, rel2);
    return rel2;
  }

  // Un passage : blocs affichés ou retirés, coupures dessinées, mesures, places ajustées au pixel près.
  // Renvoie true si les mesures ont changé le découpage des blocs affichés (un autre passage suit).
  function apply(ranges) {
    const n = nodes.length;
    const k = zoom();
    const R = lay.R;
    // 1. Blocs affichés ou retirés ; marges : place des blocs retirés, coupures avant un bloc.
    let last = -1;
    const counts = [0, 0, 0, 0, 0];
    const counterRules = new Set();
    // Seuls les blocs qui changent d'état sont touchés : ceux affichés maintenant ou avant, et ceux
    // que le moteur vient de créer (le reste garde sa marque) : le coût ne dépend pas de la longueur.
    const shownNow = [];
    for (const [a, b] of ranges) for (let i = a; i <= b; i++) shownNow.push(i);
    shownNow.sort((x, y) => x - y);
    const list = [];
    const now = new Set();
    const wanted = new Map();   // élément → { guess, cv } (bloc placé par une marge)
    let c = 0;
    for (let j = 0; j < shownNow.length; j++) {
      const i = shownNow[j];
      if (j && shownNow[j - 1] === i) continue;
      list.push(i);
      now.add(els[i]);
      // (Bloc des notes sorti du fil du texte : ni marge, ni place.)
      if (fnOut && isFootBox(nodes[i])) continue;
      const after = last !== i - 1;
      if (after || (paged && lay.push[i] > D.EPS)) {
        const p = last;
        const guess = R[i] - (p >= 0 ? R[p] + heightOf(p) + (lay.inner ? lay.inner[p] : 0) : 0);
        let cv = null;
        if (after) {
          // Numéros des titres à cet endroit : les titres comptés jusqu'ici (lui compris s'il en est un).
          for (; c < i; c++) countHeadings(nodes[c], counts);
          if (nodes[i].type.name === 'heading') countHeadings(nodes[i], counts);
          cv = counterValue(counts);
          if (nodes[i].type.name === 'heading') c = i + 1;
          counterRules.add(cv);
        }
        wanted.set(els[i], { guess, cv });
      }
      last = i;
    }
    mutate(() => {
      for (const el of now) if (el.hasAttribute(FAR)) el.removeAttribute(FAR);
      for (const el of shownBefore) if (!now.has(el)) el.setAttribute(FAR, '');
      for (const el of fresh) { if (!now.has(el)) el.setAttribute(FAR, ''); }
      fresh = [];
      for (const el of marked) {
        const w = wanted.get(el);
        if (!w) unset(el, SP, CS);
        else if (!w.cv) unset(el, CS);
        unset(el, SB);
      }
      for (const [el, w] of wanted) {
        if (!el.hasAttribute(SP)) setLen(el, SP, w.guess);
        if (w.cv && el.getAttribute(CS) !== w.cv) el.setAttribute(CS, w.cv);
      }
      marked = new Set(wanted.keys());
      if (last >= 0 && last < n - 1) {
        setLen(els[last], SB, R[n] - (R[last] + heightOf(last) + (lay.inner ? lay.inner[last] : 0)));
        marked.add(els[last]);
      }
      // Double page : blocs qui ouvrent une page (nouvelle colonne), colonne de la première page affichée.
      const brk = new Set();
      if (spreading() && list.length) {
        for (const i of list) if (i !== list[0] && lay.push[i] > D.EPS) brk.add(els[i]);
        const col0 = String(spreadAt - lay.pageOf[list[0]]);
        if (mount.style.getPropertyValue('--pm-col0') !== col0) mount.style.setProperty('--pm-col0', col0);
      }
      for (const el of brkEls) if (!brk.has(el)) el.removeAttribute(BRK);
      for (const el of brk) if (!el.hasAttribute(BRK)) el.setAttribute(BRK, '');
      brkEls = brk;
      // Blocs sur une page tournée, à sa largeur.
      const alt = new Set();
      if (paged && lay.alt) for (const i of list) if (lay.alt[i]) alt.add(els[i]);
      for (const el of altEls) if (!alt.has(el)) el.removeAttribute(ALT);
      for (const el of alt) if (!el.hasAttribute(ALT)) el.setAttribute(ALT, '');
      altEls = alt;
    });
    shownBefore = now;
    shownList = list.map((i) => [i, els[i]]);
    counterSheet.textContent = [...counterRules].map((v) => `#editor > [${CS}="${v}"] { counter-set: ${v} !important; }`).join('\n');

    // Mode avancé : les blocs affichés jamais mesurés (bloc modifié…) le sont avant de dessiner les
    // coupures, qui sont ainsi justes du premier coup.
    if (paged) {
      let measured = false;
      flat(() => {
        for (const i of list) {
          if (looseNode(nodes[i]) || current(meas.get(nodes[i]))) continue;
          meas.set(nodes[i], measureBlock(i, k));
          measured = true;
        }
      });
      // (Un bloc qui vient d'être mesuré peut pousser un bloc affiché en haut de la page suivante : un
      // autre passage lui pose sa marge, sinon il restait en bas de la page d'avant, hors de la feuille.)
      if (measured) {
        const before = pushSig(list);
        relayout();
        if (pushSig(list) !== before) return true;
      }
    }

    // 2. Coupures au milieu des blocs affichés (mode avancé) : intercalaires.
    const specs = [];
    if (paged) {
      for (const i of list) {
        const b = lay.breaks.get(i);
        if (!b) continue;
        const u = measOf(i).units;
        for (const br of b) {
          const unit = u[br.j];
          if (unit.est || unit.rel === undefined) continue;
          let pos;
          if (unit.kind === 'line') {
            const rel = unit.line ? lineStartPos(i, unit.rel, unit.line) : unit.rel + 1;
            if (rel === null) continue;
            pos = starts[i] + rel;
          } else pos = starts[i] + unit.rel;
          const kind = unit.kind === 'row' ? 'row' : unit.kind === 'line' && unit.line ? 'line' : 'block';
          const repeat = kind === 'row' && br.target > br.gapTarget + D.EPS;
          specs.push({ i, br, kind, pos, key: `pg:${pos}:${kind}`, height: br.add - (repeat ? br.target - br.gapTarget : 0), head: repeat });
        }
      }
    }
    setDecorations(specs);
    // Double page : les blocs sont dans des colonnes, leurs places à l'écran ne se comparent pas au
    // découpage (il est déjà juste : chaque coupure ouvre une colonne).
    if (spreading()) return false;

    // 3. Mesures des blocs affichés : leur place (quand le bloc suivant est affiché juste après, sans
    // marge posée), et en mode avancé leurs endroits de coupure.
    const mtop = mount.getBoundingClientRect().top;
    const top = new Map();
    for (const i of list) if (els[i].isConnected) top.set(i, (els[i].getBoundingClientRect().top - mtop) / k);
    let changed = false;
    const record = (i, h) => {
      if (!imagesReady(els[i]) || els[i].hasAttribute(ALT)) return;
      const s = current(slots.get(nodes[i]));
      if (!s || Math.abs(s.h - h) > 0.25 || s.next !== (nodes[i + 1] || null)) {
        if (!s || Math.abs(s.h - h) > 0.25) changed = true;
        slots.set(nodes[i], { h, next: nodes[i + 1] || null, gen });
      }
    };
    const hasGaps = (i) => !!(lay.breaks.get(i) && paged);
    for (const [i, t] of top) {
      if (looseNode(nodes[i])) continue;
      // (Jusqu'au bloc suivant dans le fil du texte : un objet devant ou derrière n'y est pas.)
      let j = i + 1;
      while (j < n && looseNode(nodes[j]) && top.has(j) && !els[j].hasAttribute(SP)) j++;
      if (j < n && top.has(j) && !els[j].hasAttribute(SP) && !hasGaps(i)) record(i, top.get(j) - t);
    }
    if (top.has(n - 1) && !looseNode(nodes[n - 1]) && !hasGaps(n - 1) && !els[n - 1].hasAttribute(SB)) record(n - 1, (mount.getBoundingClientRect().bottom - mtop) / k - top.get(n - 1));
    if (top.has(0) && !els[0].hasAttribute(SP)) {
      const h0 = top.get(0);
      if (Math.abs(h0 - head) > 0.25) { head = h0; changed = true; }
    }
    if (paged) {
      for (const i of list) {
        const old = current(meas.get(nodes[i]));
        if (old || looseNode(nodes[i])) continue;
        meas.set(nodes[i], measureBlock(i, k));
        changed = true;
      }
    }
    // Ce qui dépasse des blocs affichés (images habillées, lettrines).
    for (const f of floats) {
      if (!top.has(f)) continue;
      const el = els[f];
      const tf = top.get(f) * k + mtop;
      let bottom = tf;
      for (const x of el.matches(FLOAT) ? [el] : el.querySelectorAll(FLOAT)) {
        const r = x.getBoundingClientRect();
        // (Sa marge du bas, sauf si elle porte la place des blocs retirés après elle.)
        const cs = getComputedStyle(x);
        const mb = x.hasAttribute(SB) ? 0.7 * parseFloat(cs.fontSize) : parseFloat(cs.marginBottom) || 0;
        bottom = Math.max(bottom, r.bottom + mb);
      }
      if (el.hasAttribute('data-lettrine')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom, tf + 100 * k);
      const h = Math.max(1, (bottom - tf) / k);
      if (Math.abs(h - floatHeight(f)) > 0.5) { floatH.set(nodes[f], h); lastKey = ''; }
    }
    if (changed) {
      const before = paged ? breakSig(list) : '';
      relayout();
      if (paged && breakSig(list) !== before) return true;
    }

    // 4. Places ajustées au pixel près, de haut en bas : chaque bloc placé par une marge est à sa place,
    // chaque intercalaire a la hauteur qui met la suite en haut de la page suivante.
    const R2 = lay.R;
    let cum = 0;
    const fixes = [];
    const bySpec = new Map();
    for (const s of specs) { if (!bySpec.has(s.i)) bySpec.set(s.i, []); bySpec.get(s.i).push(s); }
    for (const i of list) {
      const el = els[i];
      if (el.hasAttribute(SP) && wanted.has(el)) {
        const d = R2[i] - (top.get(i) + cum);
        if (Math.abs(d) > 0.05) { fixes.push(() => setLen(el, SP, lenOf(el, SP) + d)); cum += d; }
      }
      for (const s of bySpec.get(i) || []) {
        const g = gapEls.get(s.key);
        if (!g || !g.isConnected) continue;
        let got;
        let want;
        if (s.kind === 'block') {
          const target = view.nodeDOM(s.pos);
          if (!target || target.nodeType !== 1) continue;
          got = (target.getBoundingClientRect().top - mtop) / k;
          want = s.br.target;
        } else {
          got = (g.getBoundingClientRect().bottom - mtop) / k;
          want = s.br.gapTarget;
        }
        const d = want - (got + cum);
        if (Math.abs(d) > 0.05) {
          const h = gapHeight(g) + d;
          fixes.push(() => setGapHeight(g, h));
          cum += d;
        }
        if (s.head) {
          const copy = gapEls.get(s.key + ':h');
          const table = g.closest('table');
          const row = table && [...table.rows].find((r) => !r.classList.contains('ft-pg-gap'));
          if (copy && row && !copy.cells.length) fixes.push(() => D.fillHeadCopy(copy, row));
        }
      }
    }
    if (last >= 0 && last < n - 1) {
      const want = R2[n];
      const got = (mount.getBoundingClientRect().bottom - mtop) / k + cum;
      const d = want - got;
      if (Math.abs(d) > 0.05) fixes.push(() => setLen(els[last], SB, lenOf(els[last], SB) + d));
    }
    if (fixes.length) mutate(() => { for (const f of fixes) f(); });
    return false;
  }
  function pushSig(list) {
    let s = breakSig(list);
    if (lay.push) for (const i of list) s += lay.push[i] > D.EPS ? i + '^' : '';
    return s;
  }
  function breakSig(list) {
    let s = '';
    for (const i of list) {
      const b = lay.breaks.get(i);
      if (b) s += i + ':' + b.map((x) => x.j + '/' + Math.round(x.target)).join(',') + ';';
      s += Math.round(lay.R[i]) + ' ';
    }
    return s;
  }

  // Mode avancé : tous les blocs mesurés d'un coup, affichés tels qu'ils sont sans pages (à l'ouverture,
  // au passage en mode avancé, quand la largeur du texte ou les polices changent).
  const measureAll = () => flat(measureAllNow);
  function measureAllNow() {
    needAll = false;
    if (!nodes.length || nodes.length !== view.state.doc.childCount) collect();
    gen++;
    busy = true;
    try {
      setDecorations([]);
      mutate(() => {
        for (const el of mount.querySelectorAll(MARKED)) {
          for (const at of MARKS) el.removeAttribute(at);
        }
      });
      counterSheet.textContent = '';
      // (Blocs refaits par le moteur en retirant les intercalaires : la liste des éléments est refaite.)
      if (els.some((el) => !el.isConnected)) collect();
      shownBefore = new Set(els);
      shownList = null;
      marked = new Set();
      fresh = [];
      const k = zoom();
      measuredWidth = mount.clientWidth;
      fullGen = gen;
      const mtop = mount.getBoundingClientRect().top;
      const n = nodes.length;
      const tops = els.map((el) => (el.getBoundingClientRect().top - mtop) / k);
      const bottom = (mount.getBoundingClientRect().bottom - mtop) / k;
      head = n ? tops[0] : 0;
      for (let i = 0; i < n; i++) {
        if (looseNode(nodes[i])) continue;
        // (Jusqu'au bloc suivant dans le fil du texte : un objet devant ou derrière n'y est pas.)
        let j = i + 1;
        while (j < n && looseNode(nodes[j])) j++;
        if (imagesReady(els[i])) slots.set(nodes[i], { h: (j < n ? tops[j] : bottom) - tops[i], next: nodes[i + 1] || null, gen });
        meas.set(nodes[i], measureBlock(i, k));
      }
      for (const f of floats) floatH.delete(nodes[f]);
    } finally {
      busy = false;
    }
    nat = null;
    lay = null;
    lastKey = '';
    relayout();
    update(true);
  }

  // ----- Pages qui restent en place (mode avancé) -----
  // Comme dans les versions 1.x : après une modification, chaque page qui suit et qui commence par un
  // bloc entier garde ce bloc en haut (data-pg-start, enregistré avec le texte). Si le texte d'avant
  // grandit et déborde, ce bloc passe en haut de la page suivante avec toute la suite ; s'il raccourcit,
  // la page garde son début. Une page qui vient de se former parce que le texte d'au-dessus a débordé
  // (« flowing ») suit le texte, sinon chaque touche ajouterait une page.
  const KEEP = 'data-pg-start';
  const keepKey = new PluginKey('ft-keep');
  const flowing = new WeakSet();
  let keepSeq = Date.now() % 100000;
  let flowCheck = null;     // { old : nœuds qui ouvraient une page, from : premier bloc après la modification }
  const opensPage = (i) => i > 0 && lay.opens[i] === 1 && !els[i].matches(FLOAT);
  const keptId = (node) => node.attrs.a && node.attrs.a[KEEP];
  const withKeep = (node, id) => {
    const a = { ...node.attrs.a };
    if (id) a[KEEP] = id;
    else delete a[KEEP];
    return { ...node.attrs, a };
  };

  // Blocs refaits sans changement de mise en page (seule la marque de page gardée change, Ctrl+Z
  // compris : le contenu reste le même objet) : leurs mesures passent au nouveau nœud.
  const sameBag = (x, y) => {
    const kx = Object.keys(x).filter((k) => k !== KEEP);
    return kx.length === Object.keys(y).filter((k) => k !== KEEP).length && kx.every((k) => x[k] === y[k]);
  };
  function sameLayout(o, nw) {
    if (o.type !== nw.type || o.content !== nw.content) return false;
    for (const k in nw.attrs) if (k === 'a' ? !sameBag(o.attrs.a, nw.attrs.a) : o.attrs[k] !== nw.attrs[k]) return false;
    return true;
  }
  function carryOver(a, b) {
    if (a === b) return;
    const pairs = [];
    const na = a.childCount;
    const nb = b.childCount;
    // Depuis le début, puis depuis la fin, tant que les blocs sont les mêmes ou refaits à l'identique.
    let i = 0;
    for (; i < na && i < nb; i++) {
      const o = a.child(i);
      const nw = b.child(i);
      if (o === nw) continue;
      if (!sameLayout(o, nw)) break;
      pairs.push([o, nw, i]);
    }
    for (let k = 1; na - k >= i && nb - k >= i; k++) {
      const o = a.child(na - k);
      const nw = b.child(nb - k);
      if (o === nw) continue;
      if (!sameLayout(o, nw)) break;
      pairs.push([o, nw, nb - k]);
    }
    if (!pairs.length) return;
    const map = new Map(pairs.map(([o, nw]) => [o, nw]));
    for (const cache of [meas, estimates, lineStarts, floatH, headings]) {
      for (const [o, nw] of pairs) if (cache.has(o) && !cache.has(nw)) cache.set(nw, cache.get(o));
    }
    for (const [o, nw] of pairs) {
      const sl = slots.get(o);
      if (sl && !slots.has(nw)) slots.set(nw, { ...sl, next: map.get(sl.next) || sl.next });
    }
    for (const [o, nw, k] of pairs) {
      const prev = k > 0 ? b.child(k - 1) : null;
      const ps = prev && slots.get(prev);
      if (ps && ps.next === o) slots.set(prev, { ...ps, next: nw });
    }
  }

  function noteFlowing() {
    const { old, from } = flowCheck;
    if (!paged || !lay || !lay.opens || layDoc !== view.state.doc) { if (!paged) flowCheck = null; return; }
    flowCheck = null;
    const k = from ? nodes.indexOf(from) : -1;
    const now = new Set();
    for (let i = 1; i < nodes.length; i++) if (opensPage(i)) now.add(nodes[i]);
    if (k >= 0) for (let i = k; i < nodes.length; i++) if (now.has(nodes[i]) && !old.has(nodes[i])) flowing.add(nodes[i]);
    for (const node of old) if (!now.has(node)) flowing.delete(node);
  }

  // Un bloc qui reçoit ou perd la marque garde son élément (une image refaite serait rechargée, et
  // mesurée avant de l'être) : seul l'attribut change.
  function keepView(node, accept) {
    const { dom, contentDOM } = PM.model.DOMSerializer.renderSpec(document, node.type.spec.toDOM(node));
    let cur = node;
    return {
      dom,
      contentDOM,
      update(nw) {
        if (nw.type !== cur.type) return false;
        let same = true;
        for (const k in nw.attrs) if (k === 'a' ? !sameBag(cur.attrs.a, nw.attrs.a) : cur.attrs[k] !== nw.attrs[k]) same = false;
        if (!same && !(accept && accept(nw, cur, dom))) return false;
        const id = keptId(nw);
        if (id) dom.setAttribute(KEEP, id);
        else dom.removeAttribute(KEEP);
        cur = nw;
        return true;
      }
    };
  }
  const keepViews = {};
  for (const [name, type] of Object.entries(view.state.schema.nodes)) {
    if (type.isBlock && type.spec.attrs && type.spec.attrs.a && type.spec.toDOM) keepViews[name] = (node) => keepView(node);
  }

  M.addPlugin(new Plugin({
    key: keepKey,
    props: { nodeViews: keepViews },
    appendTransaction(trs, oldState, newState) {
      if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta(keepKey) || t.getMeta('addToHistory') === false)) return null;
      const a = oldState.doc;
      const b = newState.doc;
      const end = a.content.findDiffEnd(b.content);
      const begin = a.content.findDiffStart(b.content);
      if (!end || begin === null) return null;
      const dn = b.childCount - a.childCount;
      let tr = null;
      const pairs = new Map();
      // Entrée au milieu d'un bloc gardé recopie sa marque sur le nouveau bloc : on n'en garde qu'une,
      // sur le bloc qui a du texte (le premier si les deux en ont).
      const i0 = Math.max(0, b.resolve(Math.min(begin, b.content.size)).index(0) - 1);
      const i1 = Math.min(b.childCount - 1, b.resolve(Math.min(end.b, b.content.size)).index(0) + 1);
      const seen = new Map();
      const empty = (n) => !n.textContent.trim() && !/<(img|table|hr)\b|ft-image|ft-math/.test(n.attrs.html || '') && n.childCount <= 1 && !(n.firstChild && !n.firstChild.isText);
      for (let i = i0, pos = posOf(b, i0); i <= i1; pos += b.child(i).nodeSize, i++) {
        const node = (tr ? tr.doc : b).child(i);
        const id = keptId(node);
        if (!id) continue;
        const prev = seen.get(id);
        if (!prev) { seen.set(id, { i, pos }); continue; }
        tr = tr || newState.tr;
        const pn = tr.doc.child(prev.i);
        if (empty(pn) && !empty(node)) {
          tr.setNodeMarkup(prev.pos, null, withKeep(pn, null));
          seen.set(id, { i, pos });
        } else tr.setNodeMarkup(pos, null, withKeep(node, null));
      }
      // Les pages d'après la modification gardent leur début (découpage du texte d'avant).
      if (paged && lay && lay.opens && layDoc === a && pagesApi.keep() && nodes.length === a.childCount) {
        let i = 0;
        while (i < nodes.length && starts[i] < end.a) i++;
        const old = new Set();
        for (let j = 1; j < nodes.length; j++) if (opensPage(j)) old.add(nodes[j]);
        for (let j = i; j < nodes.length; j++) {
          const node = nodes[j];
          if (!old.has(node) || flowing.has(node) || !node.attrs.a || keptId(node) || isChapter(node)) continue;
          tr = tr || newState.tr;
          tr.setNodeMarkup(starts[j] + end.b - end.a, null, withKeep(node, (++keepSeq).toString(36)));
          pairs.set(node, tr.doc.child(j + dn));
        }
        const from = i < nodes.length ? nodes[i] : null;
        flowCheck = { old: new Set([...old].map((n) => pairs.get(n) || n)), from: pairs.get(from) || from };
      }
      return tr && tr.setMeta(keepKey, true);
    }
  }));
  function posOf(doc, i) {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
    return pos;
  }
  // Nombre de pages gardées, et « Remettre le texte à la suite » (Réglages des pages).
  function keptCount() {
    let n = 0;
    view.state.doc.forEach((node) => { if (keptId(node)) n++; });
    return n;
  }
  function releaseAll() {
    const tr = view.state.tr;
    view.state.doc.forEach((node, pos) => { if (keptId(node)) tr.setNodeMarkup(pos, null, withKeep(node, null)); });
    if (tr.docChanged) view.dispatch(tr.setMeta(keepKey, true));
  }

  // ----- Suivi -----

  workspace.addEventListener('scroll', () => {
    if (!virtual) return;
    extra.clear();
    update();
  }, { passive: true });

  // Aller à un élément du texte (plan, carte du temps…) : son bloc est d'abord affiché à sa place.
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (virtual && this !== mount && mount.contains(this)) {
      let el = this;
      while (el.parentElement !== mount) el = el.parentElement;
      if (el.hasAttribute(FAR)) {
        const i = els.indexOf(el);
        if (i >= 0) { extra.add(i); lastKey = ''; update(); }
      }
    }
    return scrollIntoView.apply(this, args);
  };
  window.addEventListener('resize', () => { if (active()) { lastKey = ''; update(); } });
  // Largeur du texte ou polices chargées : les mesures sont à refaire (toutes d'un coup en mode avancé,
  // au fil de l'affichage sinon).
  let width = 0;
  let measuredWidth = 0;    // largeur du texte lors de la dernière mesure complète
  let fullGen = 0;          // mesures de la dernière mesure complète
  function invalidate(fonts) {
    if (!fonts && paged && mount.clientWidth === measuredWidth && !needAll) return;
    gen++;
    if (paged) needAll = true;
    nat = null;
    lay = null;
    lastKey = '';
    update();
  }
  new ResizeObserver(() => {
    // (Mode lecture, double page : la zone change de forme le temps de cette vue, pas la largeur du texte.)
    if (off || mount.classList.contains(SPREAD)) return;
    const w = mount.clientWidth;
    if (w === width) return;
    const had = width;
    width = w;
    if (had && active()) invalidate();
  }).observe(mount);
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { if (active()) invalidate(true); });
  // Image chargée après coup (document ouvert, image insérée) : le bloc qui la contient est remesuré,
  // même retiré de l'affichage (il est affiché le temps de la mesure).
  const loaded = new Set();
  let loadFrame = 0;
  mount.addEventListener('load', (e) => {
    if (e.target.tagName !== 'IMG') return;
    let el = e.target;
    while (el && el.parentElement !== mount) el = el.parentElement;
    if (!el) return;
    loaded.add(el);
    if (!loadFrame) loadFrame = requestAnimationFrame(remeasureLoaded);
  }, true);
  function remeasureLoaded() {
    loadFrame = 0;
    // Seuls les blocs mesurés avant le chargement sont à remesurer ; les autres le sont en s'affichant.
    const list = [...loaded].map((el) => els.indexOf(el)).filter((i) => i >= 0 && stale.has(nodes[i]));
    loaded.clear();
    if (!active() || busy || !lay) return;
    if (!list.length) { lastKey = ''; update(); return; }
    const k = zoom();
    const hidden = list.filter((i) => els[i].hasAttribute(FAR));
    busy = true;
    try {
      if (hidden.length) mutate(() => { for (const i of hidden) els[i].removeAttribute(FAR); });
      for (const i of list) {
        slots.delete(nodes[i]);
        floatH.delete(nodes[i]);
        meas.set(nodes[i], measureBlock(i, k));
      }
      if (hidden.length) mutate(() => { for (const i of hidden) els[i].setAttribute(FAR, ''); });
    } finally {
      busy = false;
    }
    nat = null;
    lay = null;
    lastKey = '';
    update();
  }

  // Mode avancé : blocs modifiés loin de l'écran (numéros des légendes, renvois, notes renumérotées…),
  // mesurés tout de suite (sur une copie affichée) : sinon leur place n'est qu'estimée, et les coupures
  // de page voisines ne seraient justes qu'une fois le bloc affiché.
  const MEASURE_MAX = 100;
  function measureChanged(a, b) {
    if (off || !paged || a.childCount !== b.childCount || nodes.length !== b.childCount) return 0;
    const k = zoom();
    let done = 0;
    busy = true;
    try {
      flat(() => {
        for (let i = 0; i < nodes.length && done < MEASURE_MAX; i++) {
          if (a.child(i) === nodes[i] || looseNode(nodes[i]) || current(meas.get(nodes[i]))) continue;
          meas.set(nodes[i], measureBlock(i, k));
          done++;
        }
      });
    } finally {
      busy = false;
    }
    return done;
  }

  // Le curseur ou la sélection vont dans un bloc retiré : il est réaffiché avant que le moteur n'y
  // pose la sélection (sa place exacte est rendue juste après).
  M.beforeUpdate((tr, state) => {
    if (!virtual || busy) return;
    const sel = state.selection;
    for (const pos of [sel.from, sel.to]) {
      const node = state.doc.child(Math.min(state.doc.resolve(pos).index(0), state.doc.childCount - 1));
      const i = nodes.indexOf(node);
      if (i >= 0 && els[i].hasAttribute(FAR)) mutate(() => els[i].removeAttribute(FAR));
    }
  });

  M.onUpdate((tr) => {
    if (busy) return;
    if (tr.docChanged) {
      carryOver(tr.before, view.state.doc);
      // Blocs modifiés mesurés avant le découpage : il est fait une fois, avec leur vraie place.
      collect();
      measureChanged(tr.before, view.state.doc);
      lastKey = '';
      update();
    }
    else if (active()) update();
    if (pendingScroll) {
      pendingScroll = false;
      scrollToSelection();
    }
  });

  // Défilement jusqu'à la sélection : une fois les blocs à leur place (le moteur le ferait trop tôt).
  function scrollToSelection() {
    const edgeTo = scrollEdge;
    scrollEdge = '';
    if (edgeTo) {
      workspace.scrollTop = edgeTo === 'start' ? 0 : workspace.scrollHeight;
      update();
    }
    let c;
    try { c = view.coordsAtPos(view.state.selection.head); } catch { return; }
    const v = workspace.getBoundingClientRect();
    const m = 5;
    if (c.top < v.top + m) workspace.scrollTop -= v.top + m - c.top;
    else if (c.bottom > v.bottom - m) workspace.scrollTop += c.bottom - (v.bottom - m);
    update();
  }

  // Début et fin du texte : le navigateur s'arrêterait aux blocs affichés.
  const edge = (end, extend) => (state, dispatch) => {
    if (!virtual) return false;
    const target = end ? Selection.atEnd(state.doc) : Selection.atStart(state.doc);
    const sel = extend ? TextSelection.create(state.doc, state.selection.anchor, target.head) : target;
    if (dispatch) {
      scrollEdge = end ? 'end' : 'start';
      dispatch(state.tr.setSelection(sel).scrollIntoView());
    }
    return true;
  };
  M.addPlugin(PM.keymap.keymap({
    'Ctrl-Home': edge(false, false),
    'Ctrl-End': edge(true, false),
    'Shift-Ctrl-Home': edge(false, true),
    'Shift-Ctrl-End': edge(true, true)
  }));

  M.addPlugin(new Plugin({
    props: {
      handleScrollToSelection() {
        if (!active()) return false;
        pendingScroll = true;
        return true;
      }
    }
  }));

  // Document ouvert : avant toute mise en page, seuls les premiers blocs sont affichés.
  M.onLoad(() => {
    virtual = false;
    lastKey = '';
    head = 0;
    decoSig = '';
    gapEls.clear();
    gapPositions = new Set();
    if (off) return;
    // Le moteur peut garder des éléments du document précédent : leurs marques sont toutes reprises.
    const ok = collect() && nodes.length >= MIN_BLOCKS;
    if (ok) {
      nat = new Float64Array(nodes.length + 1);
      for (let i = 0; i < nodes.length; i++) nat[i + 1] = nat[i] + slotOf(i);
    }
    const limit = (window.innerHeight || 800) * (1 + MARGIN);
    mutate(() => {
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        unset(el, SP, SB, CS);
        if (ok && nat[i] > limit) el.setAttribute(FAR, '');
        else if (el.hasAttribute(FAR)) el.removeAttribute(FAR);
      }
    });
    nat = null;
    shownBefore = new Set(els.filter((el) => !el.hasAttribute(FAR)));
    shownList = null;
    marked = new Set();
    fresh = [];
    counterSheet.textContent = '';
    virtual = ok;
    needAll = true;
    requestAnimationFrame(() => { lastKey = ''; update(); });
  });

  window.FTVisibles = {
    update: () => { lastKey = ''; update(); },
    // Tout remesurer (retour du mode lecture : blocs et notes ont pu y être mesurés avec ses styles).
    remeasure() {
      gen++;
      if (paged) needAll = true;
      nat = null;
      lay = null;
      lastKey = '';
      update(true);
    },
    active: () => virtual,
    // Mode avancé (pages.js) : pages.js donne les zones de texte des pages et reçoit le nombre de pages.
    usePages(api) { pagesApi = api; },
    // Réglages des pages changés, passage en mode avancé ou retour en mode note : tout est refait.
    repaginate() {
      paged = !!(pagesApi && pagesApi.paged());
      memo = null;
      // Tout est remesuré si la largeur du texte a changé depuis la dernière mesure complète (format,
      // marges, passage en mode avancé) ; sinon (numéros, en-tête…) seule la page de titre l'est.
      // (Double page : largeur du texte sans les colonnes.)
      if (paged && (fullGen !== gen || flat(() => mount.clientWidth) !== measuredWidth)) {
        gen++;
        needAll = true;
      } else if (paged && nodes[0] && /\bft-cover\b/.test(nodes[0].attrs.html || '')) {
        slots.delete(nodes[0]);
        meas.delete(nodes[0]);
      }
      nat = null;
      lay = null;
      lastKey = '';
      if (!paged) setDecorations([]);
      update(true);
      for (const fn of modeFns) fn(paged);
    },
    // Export Word : tous les blocs affichés (coupures de page comprises) le temps de fn.
    async showAll(fn) {
      if (off || !active()) return fn();
      all = true;
      lastKey = '';
      update(true);
      try {
        return await fn();
      } finally {
        all = false;
        lastKey = '';
        update(true);
      }
    },
    // Marges propres d'un bloc de premier niveau placé par une marge du moteur, ou null.
    marginsOf(el) {
      if (!el.hasAttribute(SP) && !el.hasAttribute(SB)) return null;
      const b = window.FTVisibles.blockOf(el);
      if (!b) return null;
      const m = current(meas.get(nodes[b.i])) || measureBlock(b.i, zoom());
      return { mt: m.mt, mb: m.mb };
    },
    // Page (à partir de 0) du haut d'un bloc du texte, mode avancé.
    pageOfBlock: (i) => (lay && lay.pageOf ? lay.pageOf[i] : null),
    // Bloc de premier niveau d'un nœud affiché : { el, i, far } (null hors du texte).
    blockOf(node) {
      let el = node && (node.nodeType === 1 ? node : node.parentNode);
      while (el && el.parentNode !== mount) el = el.parentNode;
      if (!el) return null;
      if (!indexOfEl) indexOfEl = new Map(els.map((e, k) => [e, k]));
      const i = indexOfEl.get(el);
      return i === undefined ? null : { el, i, far: el.hasAttribute(FAR) };
    },
    // Page (à partir de 0) du bloc d'un nœud, mode avancé.
    pageOfNode(node) {
      const b = window.FTVisibles.blockOf(node);
      return b && lay && lay.pageOf ? lay.pageOf[b.i] : null;
    },
    // Le bloc d'un nœud est affiché tout de suite (s'il était retiré de l'affichage) : sa place à l'écran
    // peut être lue.
    show(node) {
      const b = window.FTVisibles.blockOf(node);
      if (!b) return;
      // Double page : on passe aux pages de l'élément.
      if (spreading()) {
        let pg = lay.pageOf[b.i];
        try { pg = pageOfPos(view.posAtDOM(node, 0)); } catch { /* place du bloc */ }
        if (pg !== null && (pg < spreadAt || pg > spreadAt + 1)) { setSpread(pg - (pg % 2)); update(); }
        return;
      }
      if (!b.far || !virtual) return;
      extra.add(b.i);
      lastKey = '';
      update();
    },
    // Haut du bloc d'un nœud à l'écran (px), même retiré de l'affichage.
    topOf(node) {
      const b = window.FTVisibles.blockOf(node);
      if (!b) return null;
      if (!b.far || !lay) return node.getBoundingClientRect ? node.getBoundingClientRect().top : b.el.getBoundingClientRect().top;
      return mount.getBoundingClientRect().top + lay.R[b.i] * zoom();
    },
    onLayout(fn) { layoutFns.push(fn); },
    onRepaginate(fn) { modeFns.push(fn); },
    // Double page (zoom.js) : pages p et p + 1 affichées côte à côte (p paire), ou retour à la vue
    // ordinaire (null).
    spread(p) {
      if (p === null || p === undefined) {
        if (spreadAt === null) return;
        spreadAt = null;
        spreadHead = -1;
        mutate(() => {
          mount.classList.remove(SPREAD);
          mount.style.removeProperty('--pm-col0');
          for (const el of brkEls) el.removeAttribute(BRK);
        });
        brkEls = new Set();
        lastKey = '';
        update(true);
        // Blocs mesurés pendant la double page : remesurés à l'affichage ordinaire.
        if (spreadMeasured.size && paged && nodes.length === view.state.doc.childCount) {
          const k = zoom();
          busy = true;
          try {
            for (let i = 0; i < nodes.length; i++) if (spreadMeasured.has(nodes[i])) meas.set(nodes[i], measureBlock(i, k));
          } finally {
            busy = false;
          }
          spreadMeasured.clear();
          nat = null;
          lay = null;
          lastKey = '';
          update(true);
        }
        spreadMeasured.clear();
        return;
      }
      if (spreadAt === null) {
        mount.classList.add(SPREAD);
        spreadHead = view.state.selection.head;
      }
      setSpread(Math.max(0, p - (p % 2)));
      // Le curseur va au début des pages affichées s'il n'y est pas : resté dans un bloc retiré de
      // l'affichage, le navigateur parcourrait à chaque image tout le texte qui le suit pour le placer.
      const pg = pageOfPos(view.state.selection.head);
      if (lay && lay.pageOf && nodes.length && (pg === null || pg < spreadAt || pg > spreadAt + 1)) {
        let i = spreadRange()[0];
        while (i < nodes.length - 1 && lay.pageOf[i] < spreadAt) i++;
        const sel = Selection.near(view.state.doc.resolve(Math.min(starts[i] + 1, view.state.doc.content.size)));
        spreadHead = sel.head;
        view.dispatch(view.state.tr.setSelection(sel));
      }
      update(true);
    },
    // Double page : appelé avec la première page affichée quand elle change (le curseur l'a fait changer…).
    onSpread(fn) { spreadFns.push(fn); },
    spreadPage: () => spreadAt,
    // Page (à partir de 0) d'une position du texte, mode avancé.
    pageOfPos,
    // Page (à partir de 0) d'un point de la vue ordinaire (le haut de l'écran…), mode avancé.
    pageAtY(clientY) {
      if (!lay || !lay.pageOf || !nodes.length) return null;
      const y = (clientY - mount.getBoundingClientRect().top) / zoom();
      const R = lay.R;
      let lo = 0;
      let hi = nodes.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R[mid] <= y) lo = mid; else hi = mid - 1; }
      // (Dans l'espace entre deux pages : la page qui suit.)
      if (lo + 1 < nodes.length && y > R[lo] + heightOf(lo) + (lay.inner ? lay.inner[lo] : 0)) lo++;
      return lay.pageOf[lo];
    },
    // Vue ordinaire amenée au haut de la page p (mode avancé).
    scrollToPage(p) {
      if (!lay || !lay.pageOf || !nodes.length) return;
      let i = 0;
      while (i < nodes.length - 1 && lay.pageOf[i] < p) i++;
      const box = workspace.getBoundingClientRect();
      workspace.scrollTop += mount.getBoundingClientRect().top + lay.R[i] * zoom() - box.top - 40;
      lastKey = '';
      update();
    },
    // Blocs affichés : [index, élément] dans l'ordre (null : tous, ou pas encore connus).
    shownBlocks: () => (virtual ? shownList : null),
    keptCount,
    releaseAll,
    // Geste sur un objet (objets.js) : l'affichage ne bouge pas pendant le geste.
    hold(on) {
      held = Math.max(0, held + (on ? 1 : -1));
      if (!held) { lastKey = ''; update(); }
    },
    // Vue d'un bloc qui garde son élément quand seule la marque « page gardée » change (objets.js s'en sert
    // pour les images). accept(nouveau, ancien, dom) : autre changement accepté sans refaire l'élément.
    keepView,
    // Pour les essais : index des blocs qui ouvrent une page.
    pageStarts: () => (lay && lay.opens ? nodes.map((n, i) => i).filter(opensPage) : []),
    // Tout afficher, sans marques ni coupures (false : mode lecture, essais), ou revenir à l'affichage
    // autour de l'écran (true). Au retour, les blocs sont d'abord tous retirés : seuls ceux autour de
    // l'écran sont ensuite remis en page (et pas tout le document).
    enable(on) {
      if (off === !on) return;
      off = !on;
      if (off) { deactivate(); return; }
      if (els.length >= MIN_BLOCKS) mutate(() => { for (const el of els) el.setAttribute(FAR, ''); });
      nat = null;
      lay = null;
      lastKey = '';
      update();
    },
    tops: () => lay && [...lay.R],
    // Pour les essais : découpages faits jusqu'ici.
    relayouts: () => ({ relayouts, reused }),
    // Pour les essais : index des blocs affichés.
    shown: () => els.map((el, i) => (el.hasAttribute(FAR) ? -1 : i)).filter((i) => i >= 0)
  };
})();
