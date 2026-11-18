// Correcteur dans le nouveau moteur (remplace spell.js) : orthographe en rouge, grammaire en bleu, mots
// répétés en vert, synonymes au clic droit. Mêmes règles et mêmes surlignages que les versions 1.x, mais :
// - le texte est lu dans le modèle (un passage par bloc de texte), une seule fois par bloc : un bloc que
//   l'on ne touche pas n'est jamais relu (très long document : seule la partie modifiée est revue) ;
// - les surlignages ne sont posés que sur les blocs affichés, et refaits quand l'affichage défile ;
// - la grammaire n'est demandée que pour les passages affichés.
(function () {
  const M = window.FTMoteur;
  const { view } = M;
  const { TextSelection } = PM.state;
  const mount = view.dom;
  const workspace = document.getElementById('workspace');
  const api = window.frameText;
  const FAR = 'data-pm-far';

  const WORD = /[\p{L}\p{M}](?:[\p{L}\p{M}'’·-]*[\p{L}\p{M}])?/gu;
  const ELISIONS = new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'dell', 'nell', 'all', 'dall', 'sull', 'un', 'quest', 'quell']);
  const NOT_WORDS = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/g;
  const TYPING_PAUSE = 1500;
  const MAX_CACHE = 500;
  const HAN = /\p{Script=Han}/u;
  const APP_WORDS = new Set(['Tomatoes', 'Mindmap', 'mindmap', 'AAT', 'Piennolo', 'Costoluto', 'Brandywine', 'Black', 'Krim', 'Text', 'Romana', 'Marzano', 'Cuore', 'Bue', 'Datterino', 'Green', 'Zebra', 'Pantano', 'Romanesco']);
  const DOUBLE_OK = new Set(['nous', 'vous']);
  const SPACES = /^[\s  ]+$/;
  const CODES = new Set(['fr', 'en', 'de', 'es', 'it', 'pt', 'zh']);
  // Objet dans la ligne (formule, renvoi…) : un caractère qui n'est pas une lettre ; saut de ligne : « \n ».
  const leaf = (n) => (n.type.name === 'hard_break' ? '\n' : '￼');
  // Pas relus : blocs de code, références de la bibliographie (noms propres, titres en toutes langues).
  const unchecked = (n) => !!n.type.spec.code || /(^|\s)ft-bib(\s|$)/.test((n.attrs.a && n.attrs.a.class) || '');

  const known = new Map(); // langue + mot -> bien écrit ?
  let gen = 0; // change quand le dictionnaire personnel est modifié (tout est revérifié)
  const infoOf = new WeakMap(); // bloc de texte -> { text, words }
  const segsOf = new WeakMap(); // bloc de texte -> passages et leur langue [{ start, end, lang }]
  const doneOf = new WeakMap(); // bloc de texte -> vérification faite (gen + langues des passages)
  const grammarCache = new Map();
  const ignored = new Set();
  const pending = [];
  let asking = null; // passage en cours de relecture par le modèle
  // Remarques de grammaire réglées (correction acceptée ou remarque ignorée) : le passage et quelques
  // caractères autour. Le modèle ne peut plus rien signaler à cet endroit, même en relisant la phrase
  // modifiée (sinon il propose parfois une variante de sa correction, et ainsi de suite).
  const quiet = []; // { lang, before, text, after }
  const QUIET_CONTEXT = 10;
  // Dernières remarques reçues pour chaque passage affiché (position du bloc -> [{ lang, part, errors }]) :
  // gardées pendant que le passage modifié est relu, là où le texte n'a pas changé.
  let seen = new Map();
  let spots = [];
  let grammarOn = true;
  let grammarAvailable = true;
  let grammarBusy = false;
  let lastInput = 0;
  let running = false;
  let again = false;
  let started = false;

  let marks = null;

  const principal = () => (window.FTLang ? window.FTLang.principal() : 'fr');
  const langIn = (segs, offset) => (segs.find((s) => offset >= s.start && offset < s.end) || segs[segs.length - 1] || { lang: principal() }).lang;
  const langAttr = (node) => {
    const v = node.attrs && node.attrs.a && node.attrs.a.lang;
    const c = v ? String(v).slice(0, 2).toLowerCase() : '';
    return CODES.has(c) ? c : null;
  };

  function words(text) {
    const masked = text.replace(NOT_WORDS, (m) => ' '.repeat(m.length));
    const list = [];
    for (const m of masked.matchAll(WORD)) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length < 2 || /[\d_]/.test(text[start - 1] || '') || /[\d_]/.test(text[end] || '')) continue;
      list.push({ word: m[0], start, end });
    }
    return list;
  }

  function info(node) {
    let i = infoOf.get(node);
    if (!i) {
      const text = node.textBetween(0, node.content.size, undefined, leaf);
      i = { text, words: words(text) };
      infoOf.set(node, i);
    }
    return i;
  }

  // Blocs de texte d'une partie du document : { node, pos, fixed } (fixed : langue choisie à la main).
  function textblocks(parent, start, fixed, out) {
    parent.forEach((child, offset) => {
      const pos = start + offset;
      if (child.isTextblock) { if (!unchecked(child)) out.push({ node: child, pos, fixed: langAttr(child) || fixed }); }
      else if (!child.isAtom && child.childCount) textblocks(child, pos + 1, langAttr(child) || fixed, out);
    });
    return out;
  }

  const segsFor = (b) => segsOf.get(b.node) || [{ start: 0, end: info(b.node).text.length, lang: b.fixed || principal() }];

  // ----- Vérification (tout le document, seulement les blocs pas encore vus) -----

  let timer = 0;
  function schedule(delay = 400) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  // Vérification en cours : une demande de plus la fait reprendre une fois finie (la promesse rendue
  // est celle de toutes les reprises).
  let current = null;
  function run() {
    if (running) { again = true; return current; }
    running = true;
    current = (async () => {
      do {
        again = false;
        await pass();
      } while (again);
      running = false;
    })();
    return current;
  }

  async function pass() {
    try {
      const doc = view.state.doc;
      const list = textblocks(doc, 0, null, []);
      const L = window.FTLang;
      if (L && L.list().length > 1) {
        const all = await L.segment(list.map((b) => ({ fixed: b.fixed, text: info(b.node).text })));
        list.forEach((b, i) => segsOf.set(b.node, all[i]));
      } else {
        const lang = principal();
        for (const b of list) {
          const s = segsOf.get(b.node);
          const want = b.fixed || lang;
          if (!s || s.length !== 1 || s[0].lang !== want) segsOf.set(b.node, [{ start: 0, end: info(b.node).text.length, lang: want }]);
        }
      }
      const unknown = new Map();
      const checked = [];
      for (const b of list) {
        const segs = segsOf.get(b.node);
        const stamp = gen + '|' + segs.map((s) => s.lang + s.end).join(',');
        if (doneOf.get(b.node) === stamp) continue;
        checked.push([b.node, stamp]);
        for (const w of info(b.node).words) {
          if (APP_WORDS.has(w.word) || HAN.test(w.word)) continue;
          const lang = langIn(segs, w.start);
          if (known.has(lang + '\u0000' + w.word)) continue;
          if (!unknown.has(lang)) unknown.set(lang, new Set());
          unknown.get(lang).add(w.word);
        }
      }
      const g = gen;
      for (const [lang, set] of unknown) {
        const words = [...set];
        const answers = await api.spellCheck(words, lang);
        words.forEach((w, i) => known.set(lang + '\u0000' + w, answers[i]));
      }
      if (g === gen) for (const [node, stamp] of checked) doneOf.set(node, stamp);
      paint();
      if (window.FTLang && window.FTLang.refreshStatus) window.FTLang.refreshStatus();
    } catch (err) {
      console.error(err);
      try { paint(); } catch { /* rien à signaler */ }
    }
  }

  // ----- Surlignages (blocs affichés seulement) -----

  function rangeOf(from, to) {
    const a = view.domAtPos(from);
    const b = view.domAtPos(to);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  // Blocs de texte affichés (les blocs loin de l'écran ne le sont pas, dans un très long document) :
  // ceux que donne visibles.js, sinon tous les blocs parcourus un à un.
  const startsOf = new WeakMap(); // document -> position de chaque bloc de premier niveau
  function starts(doc) {
    let a = startsOf.get(doc);
    if (!a) {
      a = new Array(doc.childCount);
      let pos = 0;
      for (let i = 0; i < doc.childCount; i++) { a[i] = pos; pos += doc.child(i).nodeSize; }
      startsOf.set(doc, a);
    }
    return a;
  }
  const take = (node, pos, out) => {
    if (node.isTextblock) { if (!unchecked(node)) out.push({ node, pos, fixed: langAttr(node) }); }
    else if (!node.isAtom && node.childCount) textblocks(node, pos + 1, langAttr(node), out);
  };
  function shownTextblocks() {
    const doc = view.state.doc;
    const list = window.FTVisibles && window.FTVisibles.shownBlocks ? window.FTVisibles.shownBlocks() : null;
    if (list) {
      const at = starts(doc);
      const out = [];
      let ok = true;
      for (const [i, el] of list) {
        const node = i < doc.childCount ? doc.child(i) : null;
        if (!node || !el.pmViewDesc || el.pmViewDesc.node !== node) { ok = false; break; }
        if (!el.hasAttribute(FAR)) take(node, at[i], out);
      }
      if (ok) return out;
    }
    const descs = view.docView.children;
    const out = [];
    let k = -1;
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      do k++; while (k < descs.length && !descs[k].node);
      const el = descs[k] && descs[k].node === node ? descs[k].dom : view.nodeDOM(pos);
      if (el && el.nodeType === 1 && !el.hasAttribute(FAR)) take(node, pos, out);
      pos += node.nodeSize;
    }
    return out;
  }

  // Surlignages posés : refaits seulement s'ils changent (sinon l'écran n'est pas redessiné).
  let shown = { spell: [], grammar: [], double: [] };
  const same = (a, b) => a.length === b.length && a.every((r, i) => {
    const q = b[i];
    return r.startContainer === q.startContainer && r.startOffset === q.startOffset && r.endContainer === q.endContainer && r.endOffset === q.endOffset;
  });
  function show(next) {
    for (const name of ['spell', 'grammar', 'double']) {
      if (same(next[name], shown[name])) continue;
      marks[name].clear();
      for (const r of next[name]) marks[name].add(r);
    }
    shown = next;
  }

  let paintTimer = 0;
  function paintLater(ms) {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(paint, ms);
  }

  function paint() {
    clearTimeout(paintTimer);
    if (!marks) return;
    const next = { spell: [], grammar: [], double: [] };
    spots = [];
    if (mount.offsetParent === null) { show(next); return; }
    const nextSeen = new Map();
    const remember = (pos, slot, v) => {
      if (!nextSeen.has(pos)) nextSeen.set(pos, []);
      nextSeen.get(pos)[slot] = v;
    };
    const idle = Date.now() - lastInput >= TYPING_PAUSE;
    let waitForPause = false;
    const texts = new Set();
    const sel = view.state.selection;
    const head = sel.empty ? sel.head : -1;
    for (const b of shownTextblocks()) {
      const { text, words: list } = info(b.node);
      if (!list.length) continue;
      const base = b.pos + 1;
      const caret = head >= base && head <= base + b.node.content.size ? head - base : -1;
      const segs = segsFor(b);
      const add = (set, start, end, spot) => {
        let range;
        try { range = rangeOf(base + start, base + end); } catch { return null; }
        set.push(range);
        if (spot) spots.push({ ...spot, range });
        return range;
      };
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const w = list[i];
        const word = w.word.toLocaleLowerCase();
        if (word !== a.word.toLocaleLowerCase() || DOUBLE_OK.has(word) || !SPACES.test(text.slice(a.end, w.start))) continue;
        if (caret === w.end && !idle) { waitForPause = true; continue; }
        const ignoreKey = 'double\u0000' + text + '\u0000' + w.start;
        if (ignored.has(ignoreKey)) continue;
        let extra;
        try { extra = rangeOf(base + a.end, base + w.end); } catch { continue; }
        add(next.double, a.start, w.end, { kind: 'double', extra, word: w.word, ignoreKey });
      }
      for (const w of list) {
        const lang = langIn(segs, w.start);
        if (known.get(lang + '\u0000' + w.word) !== false) continue;
        if (caret === w.end && !idle) { waitForPause = true; continue; }
        add(next.spell, w.start, w.end, { kind: 'spell', word: w.word, lang });
      }
      if (!grammarOn) continue;
      for (let segIndex = 0; segIndex < segs.length; segIndex++) {
        const seg = segs[segIndex];
        const part = text.slice(seg.start, seg.end);
        const short = seg.lang === 'zh' ? (part.match(/\p{Script=Han}/gu) || []).length < 6 : part.trim().length < 12 || part.trim().split(/\s+/).length < 3;
        if (short) continue;
        const key = seg.lang + '\u0000' + part;
        texts.add(key);
        const found = grammarCache.get(key);
        const slot = segIndex;
        let list = found;
        if (found) {
          remember(b.pos, slot, { lang: seg.lang, part, errors: found });
        } else {
          // Pas encore relu : les remarques de la version précédente du passage restent là où le texte
          // n'a pas changé (elles ne disparaissent pas le temps de la relecture).
          const prev = (seen.get(b.pos) || [])[slot];
          if (prev && prev.lang === seg.lang) {
            list = carry(prev.part, part, prev.errors);
            remember(b.pos, slot, prev);
          }
          if (key === asking || pending.some((p) => p.key === key)) { /* déjà demandé */ }
          else if (grammarAvailable && (caret < 0 || idle)) {
            // Le passage où l'on écrit passe avant les autres.
            const job = { key, text: part, lang: seg.lang };
            if (caret >= 0) pending.unshift(job); else pending.push(job);
          } else if (caret >= 0) {
            waitForPause = true;
          }
        }
        if (list && list.length) {
          const hushed = quietIn(seg.lang, part);
          for (const g of list) {
            if (hushed.some(([s, e]) => g.start < e && g.end > s)) continue;
            add(next.grammar, seg.start + g.start, seg.start + g.end, { kind: 'grammar', ...g, lang: seg.lang });
          }
        }
      }
    }
    show(next);
    seen = nextSeen;
    for (let i = pending.length - 1; i >= 0; i--) if (!texts.has(pending[i].key)) pending.splice(i, 1);
    if (waitForPause) paintLater(Math.max(200, TYPING_PAUSE - (Date.now() - lastInput) + 50));
    pumpGrammar();
  }

  async function pumpGrammar() {
    // Un passage déjà relu n'est pas redemandé (le modèle donnerait parfois une autre réponse).
    while (pending.length && grammarCache.has(pending[0].key)) pending.shift();
    if (grammarBusy || !grammarOn || !grammarAvailable || !pending.length) return;
    const { key, text, lang } = pending.shift();
    grammarBusy = true;
    asking = key;
    try {
      const answer = await api.grammarCheck(text, lang);
      if (answer && answer.unavailable) {
        grammarAvailable = false;
        pending.length = 0;
      } else if (answer && answer.retry) {
        pending.unshift({ key, text, lang });
      } else {
        grammarCache.set(key, (answer && answer.errors) || []);
        if (grammarCache.size > MAX_CACHE) grammarCache.delete(grammarCache.keys().next().value);
      }
    } catch {
      grammarCache.set(key, []);
    } finally {
      grammarBusy = false;
      asking = null;
    }
    paint();
  }

  // Remarques de l'ancienne version d'un passage gardées dans la nouvelle : seulement celles dont le
  // texte, et les caractères qui l'entourent, n'ont pas changé (début ou fin commune aux deux versions).
  function carry(before, after, errors) {
    if (!errors.length) return errors;
    const n = Math.min(before.length, after.length);
    let p = 0;
    while (p < n && before[p] === after[p]) p++;
    let s = 0;
    while (s < n - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
    const delta = after.length - before.length;
    const out = [];
    for (const g of errors) {
      if (g.end < p) out.push(g);
      else if (g.start > before.length - s) out.push({ ...g, start: g.start + delta, end: g.end + delta });
    }
    return out;
  }

  // Endroits réglés d'un passage : [début, fin] des textes de « quiet » retrouvés avec leur entourage.
  function quietIn(lang, part) {
    const out = [];
    for (const q of quiet) {
      if (q.lang !== lang) continue;
      const whole = q.before + q.text + q.after;
      for (let i = part.indexOf(whole); i >= 0; i = part.indexOf(whole, i + 1)) {
        out.push([i + q.before.length, i + q.before.length + q.text.length]);
      }
    }
    return out;
  }

  function hush(from, to, lang) {
    const doc = view.state.doc;
    if (from < 0 || to > doc.content.size || to <= from) return;
    const $p = doc.resolve(from);
    if (!$p.parent.isTextblock) return;
    const { text } = info($p.parent);
    const s = $p.parentOffset;
    const e = s + (to - from);
    quiet.push({ lang, before: text.slice(Math.max(0, s - QUIET_CONTEXT), s), text: text.slice(s, e), after: text.slice(e, e + QUIET_CONTEXT) });
    if (quiet.length > 300) quiet.shift();
  }

  // ----- Gestes : remplacer un mot, retirer un doublon -----

  // Position dans le modèle d'un passage surligné (il suit le texte modifié depuis).
  function span(range) {
    try {
      return { from: view.posAtDOM(range.startContainer, range.startOffset), to: view.posAtDOM(range.endContainer, range.endOffset) };
    } catch {
      return null;
    }
  }

  function replace(spot, text) {
    const at = span(spot.range);
    if (!at || at.to <= at.from) return null;
    const tr = PM.history.closeHistory(view.state.tr.insertText(text, at.from, at.to));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at.from + text.length)));
    M.closeHistory();
    view.focus();
    return { from: at.from, to: at.from + text.length };
  }

  function removeDouble(spot) {
    const at = span(spot.extra);
    if (!at || at.to <= at.from) return;
    const tr = PM.history.closeHistory(view.state.tr.delete(at.from, at.to));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at.from)));
    M.closeHistory();
    view.focus();
  }

  // ----- Langue d'un endroit du texte -----

  function langAtPos(pos) {
    const doc = view.state.doc;
    if (pos < 0 || pos > doc.content.size) return null;
    const $p = doc.resolve(pos);
    let fixed = null;
    for (let d = $p.depth; d > 0 && !fixed; d--) fixed = langAttr($p.node(d));
    if (!$p.parent.isTextblock) return fixed || principal();
    const segs = segsOf.get($p.parent);
    if (!segs) return fixed || principal();
    const len = info($p.parent).text.length;
    return langIn(segs, Math.min($p.parentOffset, Math.max(0, len - 1)));
  }

  function langAt(node, offset) {
    if (!node) return null;
    if (!mount.contains(node)) return window.FTLang ? window.FTLang.fixedLang(node) : null;
    try { return langAtPos(view.posAtDOM(node, offset || 0)); } catch { return null; }
  }

  // ----- Synonymes -----

  const zhWords = window.Intl && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

  // Mot sous la souris : { word, range, lang }. « l'homme » donne « homme ».
  function wordAt(x, y) {
    const hit = view.posAtCoords({ left: x, top: y });
    if (!hit) return null;
    const $p = view.state.doc.resolve(hit.pos);
    if (!$p.parent.isTextblock) return null;
    const base = $p.start();
    const { text } = info($p.parent);
    const at = $p.parentOffset;
    const lang = langAtPos(hit.pos) || principal();
    const found = (start, word) => {
      let range;
      try { range = rangeOf(base + start, base + start + word.length); } catch { return null; }
      const inside = [...range.getClientRects()].some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2);
      return inside && /\p{L}/u.test(word) ? { word, range, lang, from: base + start } : null;
    };
    for (const m of text.matchAll(WORD)) {
      if (at < m.index || at > m.index + m[0].length) continue;
      let start = m.index;
      let word = m[0];
      if (HAN.test(word) && zhWords) {
        const k = at - m.index;
        for (const seg of zhWords.segment(word)) {
          if (!seg.isWordLike || k < seg.index || k > seg.index + seg.segment.length) continue;
          return found(m.index + seg.index, seg.segment);
        }
        return null;
      }
      const elided = /^([\p{L}]{1,7})['’](?=\p{L})/u.exec(word);
      if (elided && (lang === 'fr' || lang === 'it') && ELISIONS.has(elided[1].toLowerCase())) {
        start += elided[0].length;
        word = word.slice(elided[0].length);
      }
      return found(start, word);
    }
    return null;
  }

  // Texte du bloc avant et après un passage du modèle : le sens d'un mot dépend de sa phrase.
  function contextAt(from, to) {
    const doc = view.state.doc;
    const $a = doc.resolve(from);
    const $b = doc.resolve(to);
    const pa = $a.parent;
    const pb = $b.parent;
    return {
      before: pa.textBetween(0, $a.parentOffset, '\n', ' ').slice(-400),
      after: pb.textBetween($b.parentOffset, pb.content.size, '\n', ' ').slice(0, 400)
    };
  }

  function contextOf(found) {
    const at = span(found.range);
    return at ? contextAt(at.from, at.to) : { before: '', after: '' };
  }

  function synonymItems(found) {
    if (!found) return [];
    return [{
      text: 'Synonymes…',
      submenu: async () => {
        const list = await api.synonyms(found.word, contextOf(found), found.lang || principal());
        return list.map((s) => ({ text: s, action: () => replace(found, s) }));
      }
    }];
  }

  // ----- Clic droit sur un passage souligné -----

  function spotAt(x, y) {
    const inside = (s) => [...s.range.getClientRects()].some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2);
    return spots.find((s) => s.kind === 'double' && inside(s)) || spots.find((s) => s.kind === 'spell' && inside(s)) ||
      spots.find((s) => s.kind === 'grammar' && inside(s)) || null;
  }

  async function spotMenu(spot, x, y) {
    const show = (items) => window.FTSidebar.showMenu(x, y, items);
    if (spot.kind === 'double') {
      show([
        { text: `Supprimer le doublon « ${spot.word} »`, strong: true, action: () => removeDouble(spot) },
        { text: 'Ignorer', action: () => { ignored.add(spot.ignoreKey); paint(); } }
      ]);
      return;
    }
    if (spot.kind === 'grammar') {
      // LanguageTool propose parfois plusieurs corrections (autres), ou aucune (remarque seule).
      const choices = [spot.correction, ...(spot.autres || [])].filter((c) => typeof c === 'string');
      show([
        ...choices.map((c, i) => ({
          text: c ? `Remplacer par « ${c} »` : `Supprimer « ${spot.range.toString()} »`,
          strong: i === 0,
          action: () => {
            const done = replace(spot, c);
            if (done) hush(done.from, done.to, spot.lang);
          }
        })),
        ...(spot.explication ? [{ explain: spot.explication }] : []),
        '-',
        {
          text: 'Ignorer cette remarque',
          action: () => {
            const at = span(spot.range);
            if (at) hush(at.from, at.to, spot.lang);
            paint();
          }
        }
      ]);
      return;
    }
    let suggestions = [];
    try { suggestions = await api.spellSuggest(spot.word, spot.lang); } catch { /* aucune proposition */ }
    show([
      ...(suggestions.length
        ? suggestions.map((s) => ({ text: s, strong: true, action: () => replace(spot, s) }))
        : [{ label: 'Aucune proposition' }]),
      '-',
      {
        text: `Ajouter « ${spot.word} » au dictionnaire`,
        action: async () => {
          await api.spellAdd(spot.word);
          for (const c of CODES) known.set(c + '\u0000' + spot.word, true);
          paint();
        }
      },
      { text: 'Ouvrir le dictionnaire personnel', action: () => api.openDictionary() },
      '-',
      ...synonymItems(spot)
    ]);
  }

  function start() {
    if (started || !(window.CSS && CSS.highlights && window.Highlight)) return;
    started = true;
    marks = { spell: new Highlight(), grammar: new Highlight(), double: new Highlight() };
    CSS.highlights.set('ft-spell', marks.spell);
    CSS.highlights.set('ft-grammar', marks.grammar);
    CSS.highlights.set('ft-double', marks.double);

    M.onUpdate((tr) => {
      if (tr.docChanged) {
        if (!tr.getMeta('ftQuiet')) lastInput = Date.now();
        if (seen.size) {
          const moved = new Map();
          for (const [pos, v] of seen) {
            const m = tr.mapping.mapResult(pos, 1);
            if (!m.deleted) moved.set(m.pos, v);
          }
          seen = moved;
        }
        schedule();
      } else if (tr.selectionSet) {
        // Le curseur quitte le mot que l'on tapait : il peut être souligné.
        paintLater(300);
      }
    });
    M.onLoad(() => {
      spots = [];
      pending.length = 0;
      seen = new Map();
      quiet.length = 0;
      grammarAvailable = true;
      lastInput = 0;
      show({ spell: [], grammar: [], double: [] });
      schedule(100);
    });
    // Nouveau découpage, blocs affichés après un défilement : surlignages refaits.
    let raf = 0;
    const paintSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
    workspace.addEventListener('scroll', paintSoon, { passive: true });
    if (window.FTVisibles) window.FTVisibles.onLayout(paintSoon);

    // (Avant les autres menus du clic droit.)
    M.addPlugin(new PM.state.Plugin({
      props: {
        handleDOMEvents: {
          contextmenu(v, e) {
            const spot = spotAt(e.clientX, e.clientY);
            if (!spot) return false;
            e.preventDefault();
            spotMenu(spot, e.clientX, e.clientY);
            return true;
          }
        }
      }
    }), true);

    api.onSpellChanged(() => {
      known.clear();
      gen++;
      schedule(0);
    });
    if (window.FTLang) window.FTLang.onChange(() => { pending.length = 0; schedule(0); });

    window.FTSpell = {
      langAt,
      langAtPos,
      contextAt,
      reset() {
        spots = [];
        show({ spell: [], grammar: [], double: [] });
        pending.length = 0;
        lastInput = 0;
        schedule(100);
      },
      synonymItems: (x, y) => synonymItems(wordAt(x, y)),
      doubles: () => spots.filter((s) => s.kind === 'double').map((s) => s.range.toString()),
      // Pour les essais : mots soulignés affichés, et vérification immédiate.
      spelled: () => spots.filter((s) => s.kind === 'spell').map((s) => s.range.toString()),
      grammar: () => spots.filter((s) => s.kind === 'grammar').map((s) => s.range.toString()),
      now: () => { clearTimeout(timer); return run(); },
      _paint: paint,
      // Autre moteur de grammaire : les remarques déjà reçues sont oubliées et les passages relus.
      resetGrammar() {
        grammarCache.clear();
        seen = new Map();
        pending.length = 0;
        grammarAvailable = true;
        schedule(0);
      },
      setGrammar(on) {
        grammarOn = on !== false;
        if (grammarOn) grammarAvailable = true; // modèle peut-être installé depuis
        if (!grammarOn) pending.length = 0;
        schedule(0);
      }
    };
  }

  window.FTCorrecteur = { start };
})();
