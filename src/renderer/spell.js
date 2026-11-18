// Correcteur : fautes d'orthographe soulignées en rouge (dictionnaire de la langue du passage +
// dictionnaire personnel) et fautes de grammaire en bleu (modèle d'IA local). La langue de chaque
// passage est reconnue parmi les langues du document (languages.js). Clic droit sur un mot souligné :
// propositions de correction. Un mot répété d'affilée (« le le ») est surligné en vert ; clic droit :
// « Supprimer le doublon ». Le soulignement passe par les « surlignages » du navigateur
// (CSS Custom Highlight) : le texte du document n'est jamais modifié.
(function () {
  const editor = document.getElementById('editor');
  const api = window.frameText;
  const S = () => window.FTStructure;
  if (!(window.CSS && CSS.highlights && window.Highlight)) return;

  editor.spellcheck = false;
  const spellMarks = new Highlight();
  const grammarMarks = new Highlight();
  const doubleMarks = new Highlight();
  CSS.highlights.set('ft-spell', spellMarks);
  CSS.highlights.set('ft-grammar', grammarMarks);
  CSS.highlights.set('ft-double', doubleMarks);

  const SKIP = '.ft-math, sup.ft-fn-ref, [contenteditable="false"]';
  const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, div, blockquote';
  const WORD = /[\p{L}\p{M}](?:[\p{L}\p{M}'’·-]*[\p{L}\p{M}])?/gu;
  // Élisions du français et de l'italien (l'homme, jusqu'à ; dell'anno, un'altra).
  const ELISIONS = new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'dell', 'nell', 'all', 'dall', 'sull', 'un', 'quest', 'quell']);
  const NOT_WORDS = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/g;
  const TYPING_PAUSE = 2500; // la grammaire attend que l'on ait fini sa phrase
  const MAX_CACHE = 500;

  const HAN = /\p{Script=Han}/u;
  const known = new Map(); // langue + mot -> bien écrit ?
  const segsOf = new WeakMap(); // paragraphe -> { text, segs: [{ start, end, lang }] }
  // Noms propres au logiciel, jamais soulignés.
  const APP_WORDS = new Set(['Tomatoes', 'Mindmap', 'mindmap', 'AAT', 'Piennolo', 'Costoluto', 'Brandywine', 'Black', 'Krim', 'Text', 'Romana', 'Marzano', 'Cuore', 'Bue', 'Datterino', 'Green', 'Zebra', 'Pantano', 'Romanesco']);
  const grammarCache = new Map(); // langue + texte d'un passage -> fautes de grammaire
  const ignored = new Set(); // remarques de grammaire et doublons écartés
  // Répétitions correctes : « nous nous sommes », « vous vous taisez ».
  const DOUBLE_OK = new Set(['nous', 'vous']);
  const SPACES = /^[\s\u00a0\u202f]+$/;
  const pending = []; // passages à faire relire par le modèle : { key, text, lang }
  let spots = []; // mots et passages soulignés
  let grammarOn = true;
  let grammarAvailable = true;
  let grammarBusy = false;
  let timer = null;
  let lastInput = 0;
  let running = false;
  let again = false;

  // Paragraphes du document, avec leur texte et la place de chaque morceau de texte.
  function blocks() {
    const map = new Map();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const block = n.parentElement.closest(BLOCKS);
      if (!block || !(block === editor || editor.contains(block))) continue;
      let entry = map.get(block);
      if (!entry) map.set(block, (entry = { text: '', nodes: [] }));
      entry.nodes.push([n, entry.text.length]);
      entry.text += n.data;
    }
    return map;
  }

  function words(text) {
    const masked = text.replace(NOT_WORDS, (m) => ' '.repeat(m.length));
    const list = [];
    for (const m of masked.matchAll(WORD)) {
      const start = m.index;
      const end = start + m[0].length;
      // Les mots collés à un chiffre (A4, x2…) et les lettres seules ne sont pas vérifiés.
      if (m[0].length < 2 || /[\d_]/.test(text[start - 1] || '') || /[\d_]/.test(text[end] || '')) continue;
      list.push({ word: m[0], start, end });
    }
    return list;
  }

  function rangeOf(entry, start, end) {
    const point = (offset, isEnd) => {
      for (let i = entry.nodes.length - 1; i >= 0; i--) {
        const [node, from] = entry.nodes[i];
        if (offset > from || (offset === from && !isEnd) || i === 0) return [node, Math.min(offset - from, node.data.length)];
      }
      return null;
    };
    const a = point(start, false);
    const b = point(end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    try {
      r.setStart(a[0], a[1]);
      r.setEnd(b[0], b[1]);
    } catch {
      return null;
    }
    return r;
  }

  // Position du curseur dans le texte d'un paragraphe, s'il s'y trouve.
  function caretIn(entry) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return -1;
    const hit = entry.nodes.find(([node]) => node === sel.anchorNode);
    return hit ? hit[1] + sel.anchorOffset : -1;
  }

  function schedule(delay = 400) {
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  const principal = () => (window.FTLang ? window.FTLang.principal() : 'fr');
  const langIn = (segs, offset) => (segs.find((s) => offset >= s.start && offset < s.end) || segs[segs.length - 1] || { lang: principal() }).lang;

  // Passages de chaque paragraphe et leur langue (reconnus au besoin).
  async function segmentAll(map) {
    const entries = [...map].map(([block, entry]) => ({ block, text: entry.text }));
    const all = window.FTLang ? await window.FTLang.segment(entries) : entries.map((e) => [{ start: 0, end: e.text.length, lang: 'fr' }]);
    entries.forEach((e, i) => segsOf.set(e.block, { text: e.text, segs: all[i] }));
  }

  // Passages d'un paragraphe : ceux reconnus pour ce texte, sinon les derniers connus (texte en cours de frappe).
  function segsFor(block, text) {
    const info = segsOf.get(block);
    return info ? info.segs.map((s) => (info.text === text ? s : { ...s, end: s === info.segs[info.segs.length - 1] ? text.length : s.end })) : [{ start: 0, end: text.length, lang: principal() }];
  }

  async function run() {
    if (running) { again = true; return; }
    running = true;
    try {
      const map = blocks();
      await segmentAll(map);
      const unknown = new Map(); // langue -> mots à vérifier
      for (const [block, entry] of map) {
        const segs = segsFor(block, entry.text);
        for (const w of words(entry.text)) {
          if (APP_WORDS.has(w.word) || HAN.test(w.word)) continue;
          const lang = langIn(segs, w.start);
          if (known.has(lang + '\u0000' + w.word)) continue;
          if (!unknown.has(lang)) unknown.set(lang, new Set());
          unknown.get(lang).add(w.word);
        }
      }
      for (const [lang, set] of unknown) {
        const list = [...set];
        const answers = await api.spellCheck(list, lang);
        list.forEach((w, i) => known.set(lang + '\u0000' + w, answers[i]));
      }
      paint();
    } catch {
      // Correcteur indisponible : le texte reste sans soulignement (les doublons restent signalés).
      try { paint(); } catch { /* rien à signaler */ }
    } finally {
      running = false;
      if (again) { again = false; schedule(0); }
    }
  }

  // Redessine tous les soulignements (sans toucher au texte).
  function paint() {
    spellMarks.clear();
    grammarMarks.clear();
    doubleMarks.clear();
    spots = [];
    const idle = Date.now() - lastInput >= TYPING_PAUSE;
    let waitForPause = false;
    const texts = new Set();
    for (const [block, entry] of blocks()) {
      const caret = caretIn(entry);
      const segs = segsFor(block, entry.text);
      // Mot répété d'affilée, séparé seulement par une espace.
      const list = words(entry.text);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        const word = b.word.toLocaleLowerCase();
        if (word !== a.word.toLocaleLowerCase() || DOUBLE_OK.has(word) || !SPACES.test(entry.text.slice(a.end, b.start))) continue;
        if (caret === b.end && !idle) { waitForPause = true; continue; }
        const ignoreKey = 'double\u0000' + entry.text + '\u0000' + b.start;
        if (ignored.has(ignoreKey)) continue;
        const range = rangeOf(entry, a.start, b.end);
        const extra = rangeOf(entry, a.end, b.end);
        if (!range || !extra) continue;
        doubleMarks.add(range);
        spots.push({ kind: 'double', range, extra, word: b.word, ignoreKey });
      }
      for (const w of list) {
        const lang = langIn(segs, w.start);
        if (known.get(lang + '\u0000' + w.word) !== false) continue;
        // Le mot en train d'être tapé n'est pas encore une faute.
        if (caret === w.end && !idle) { waitForPause = true; continue; }
        const range = rangeOf(entry, w.start, w.end);
        if (!range) continue;
        spellMarks.add(range);
        spots.push({ kind: 'spell', range, word: w.word, lang });
      }
      if (!grammarOn) continue;
      // Chaque passage est relu dans sa langue.
      for (const seg of segs) {
        const text = entry.text.slice(seg.start, seg.end);
        const short = seg.lang === 'zh' ? (text.match(/\p{Script=Han}/gu) || []).length < 6 : text.trim().length < 12 || text.trim().split(/\s+/).length < 3;
        if (short) continue;
        const key = seg.lang + '\u0000' + text;
        texts.add(key);
        const found = grammarCache.get(key);
        if (found) {
          for (const g of found) {
            const ignoreKey = key + '\u0000' + g.start;
            if (ignored.has(ignoreKey)) continue;
            const range = rangeOf(entry, seg.start + g.start, seg.start + g.end);
            if (!range) continue;
            grammarMarks.add(range);
            spots.push({ kind: 'grammar', range, ...g, ignoreKey, lang: seg.lang });
          }
        } else if (grammarAvailable && (caret < 0 || idle)) {
          if (!pending.some((p) => p.key === key)) pending.push({ key, text, lang: seg.lang });
        } else if (caret >= 0) {
          waitForPause = true;
        }
      }
    }
    // Les passages effacés entre-temps ne sont plus à relire.
    for (let i = pending.length - 1; i >= 0; i--) if (!texts.has(pending[i].key)) pending.splice(i, 1);
    if (waitForPause) schedule(Math.max(200, TYPING_PAUSE - (Date.now() - lastInput) + 50));
    pumpGrammar();
  }

  async function pumpGrammar() {
    if (grammarBusy || !grammarOn || !grammarAvailable || !pending.length) return;
    const { key, text, lang } = pending.shift();
    grammarBusy = true;
    try {
      const answer = await api.grammarCheck(text, lang);
      if (answer && answer.unavailable) {
        grammarAvailable = false; // pas de modèle installé : pas de grammaire
        pending.length = 0;
      } else if (answer && answer.retry) {
        // Laissée de côté pour une demande de synonymes : relue juste après.
        pending.unshift({ key, text, lang });
      } else {
        grammarCache.set(key, (answer && answer.errors) || []);
        if (grammarCache.size > MAX_CACHE) grammarCache.delete(grammarCache.keys().next().value);
      }
    } catch {
      grammarCache.set(key, []);
    } finally {
      grammarBusy = false;
    }
    schedule(0);
  }

  editor.addEventListener('input', () => {
    lastInput = Date.now();
    schedule();
  });
  // Le curseur quitte le mot qu'on tapait : on peut le vérifier.
  document.addEventListener('selectionchange', () => {
    if (editor.contains(document.activeElement) || document.activeElement === editor) schedule(300);
  });

  // ----- Clic droit sur un passage souligné -----

  function spotAt(x, y) {
    const pos = document.caretRangeFromPoint(x, y);
    if (!pos) return null;
    const inside = (s) => [...s.range.getClientRects()].some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2);
    return spots.find((s) => s.kind === 'double' && inside(s)) || spots.find((s) => s.kind === 'spell' && inside(s)) ||
      spots.find((s) => s.kind === 'grammar' && inside(s)) || null;
  }

  function replace(spot, text) {
    S().checkpoint();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(spot.range.cloneRange());
    editor.focus({ preventScroll: true });
    document.execCommand('insertText', false, text);
  }

  // Le second mot et l'espace qui le précède disparaissent ; le curseur se place à la fin du premier.
  function removeDouble(spot) {
    S().checkpoint();
    const r = spot.extra;
    const node = r.startContainer;
    const offset = r.startOffset;
    r.deleteContents();
    if (node.parentNode) node.parentNode.normalize();
    const sel = window.getSelection();
    try {
      const at = document.createRange();
      at.setStart(node, offset);
      at.collapse(true);
      sel.removeAllRanges();
      sel.addRange(at);
    } catch { /* le curseur reste où il est */ }
    S().changed();
    paint();
  }

  // ----- Synonymes (clic droit sur un mot) -----

  // Langue du passage à un endroit du texte (nœud de texte + position), d'après la dernière vérification.
  function langAt(node, offset) {
    if (!node) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = el && el.closest(BLOCKS);
    if (!block || !editor.contains(block)) return null;
    const info = segsOf.get(block);
    if (!info) return window.FTLang ? window.FTLang.fixedLang(block) || principal() : null;
    if (node.nodeType !== Node.TEXT_NODE) return info.segs[0] ? info.segs[0].lang : principal();
    let pos = 0;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) && n.parentElement.closest(BLOCKS) === block ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) pos += n.data.length;
    return langIn(info.segs, Math.min(pos + offset, Math.max(0, info.text.length - 1)));
  }

  // Mots chinois : découpés par le navigateur (le chinois s'écrit sans espaces).
  const zhWords = window.Intl && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

  // Mot sous la souris : { word, range, lang }. « l'homme » donne « homme » (l'élision reste en place).
  function wordAt(x, y) {
    const pos = document.caretRangeFromPoint(x, y);
    if (!pos || pos.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const node = pos.startContainer;
    if (!node.parentElement || node.parentElement.closest(SKIP) || !editor.contains(node)) return null;
    const lang = langAt(node, pos.startOffset) || principal();
    const hit = (start, word) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      const inside = [...range.getClientRects()].some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2);
      return inside && /\p{L}/u.test(word) ? { word, range, lang } : null;
    };
    for (const m of node.data.matchAll(WORD)) {
      if (pos.startOffset < m.index || pos.startOffset > m.index + m[0].length) continue;
      let start = m.index;
      let word = m[0];
      if (HAN.test(word) && zhWords) {
        // Le mot chinois sous la souris, dans cette suite de caractères.
        const at = pos.startOffset - m.index;
        for (const seg of zhWords.segment(word)) {
          if (!seg.isWordLike || at < seg.index || at > seg.index + seg.segment.length) continue;
          return hit(m.index + seg.index, seg.segment);
        }
        return null;
      }
      const elided = /^([\p{L}]{1,7})['’](?=\p{L})/u.exec(word);
      if (elided && (lang === 'fr' || lang === 'it') && ELISIONS.has(elided[1].toLowerCase())) {
        start += elided[0].length;
        word = word.slice(elided[0].length);
      }
      return hit(start, word);
    }
    return null;
  }

  // Texte du paragraphe avant et après le mot : le sens du mot dépend de sa phrase.
  function contextOf(range) {
    const node = range.startContainer;
    const block = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node).closest('.ft-caption, p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, div:not(#editor)') || editor;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(block, block.childNodes.length);
    return { before: before.toString().slice(-400), after: after.toString().slice(0, 400) };
  }

  // Entrée « Synonymes… » : la liste s'affiche au survol, un clic remplace le mot.
  function synonymItems(found) {
    if (!found) return [];
    return [{
      text: 'Synonymes…',
      submenu: async () => {
        const list = await api.synonyms(found.word, contextOf(found.range), found.lang || principal());
        return list.map((s) => ({ text: s, action: () => replace(found, s) }));
      }
    }];
  }

  editor.addEventListener('contextmenu', async (e) => {
    const spot = spotAt(e.clientX, e.clientY);
    if (!spot) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const { clientX: x, clientY: y } = e;
    const show = (items) => window.FTSidebar.showMenu(x, y, items);
    if (spot.kind === 'double') {
      show([
        { text: `Supprimer le doublon « ${spot.word} »`, strong: true, action: () => removeDouble(spot) },
        { text: 'Ignorer', action: () => { ignored.add(spot.ignoreKey); paint(); } },
        '-',
        ...window.FTStructure.insertItems(x, y)
      ]);
      return;
    }
    if (spot.kind === 'grammar') {
      show([
        { text: `Remplacer par « ${spot.correction} »`, action: () => replace(spot, spot.correction) },
        ...(spot.explication ? [{ explain: spot.explication }] : []),
        '-',
        {
          text: 'Ignorer cette remarque',
          action: () => {
            ignored.add(spot.ignoreKey);
            paint();
          }
        },
        '-',
        ...window.FTStructure.insertItems(x, y)
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
          for (const c of window.FTLang ? window.FTLang.LANGS.map(([l]) => l) : ['fr']) known.set(c + '\u0000' + spot.word, true);
          paint();
        }
      },
      { text: 'Ouvrir le dictionnaire personnel', action: () => api.openDictionary() },
      '-',
      ...synonymItems(spot),
      ...(window.FTLinks ? window.FTLinks.selectionItems() : []),
      '-',
      ...window.FTStructure.insertItems(x, y)
    ]);
  }, true);

  // Dictionnaire personnel modifié à la main : tout est revérifié.
  api.onSpellChanged(() => {
    known.clear();
    schedule(0);
  });

  // Langues du document changées : tout est revérifié (les résultats déjà connus restent valables).
  if (window.FTLang) window.FTLang.onChange(() => { pending.length = 0; schedule(0); });

  window.FTSpell = {
    langAt,
    // Nouveau document ouvert.
    reset() {
      spots = [];
      spellMarks.clear();
      grammarMarks.clear();
      doubleMarks.clear();
      pending.length = 0;
      lastInput = 0;
      schedule(100);
    },
    // Pour les autres menus du clic droit (structure.js) : « Synonymes… » du mot sous la souris.
    synonymItems: (x, y) => synonymItems(wordAt(x, y)),
    // Pour les essais : les doublons repérés.
    doubles: () => spots.filter((s) => s.kind === 'double').map((s) => s.range.toString()),
    setGrammar(on) {
      grammarOn = on !== false;
      if (!grammarOn) pending.length = 0;
      schedule(0);
    }
  };
})();
