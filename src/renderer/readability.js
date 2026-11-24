// Statistiques de lisibilité : onglet « Lisibilité » de l'Aide au texte (aussi ouvert depuis « Objectifs et
// statistiques »). Indice de lisibilité (adaptation de Flesch propre à la langue du texte),
// longueur des phrases, phrases les plus longues, mots rares, temps de lecture. Les phrases longues et
// les mots rares peuvent être surlignés dans le texte ; un clic sur une phrase ou un mot y mène.
// Mots rares : mots en minuscules absents de la liste des mots courants du français (vendor/frequences-fr,
// formes dont le mot ou le lemme compte au moins une occurrence par million).
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const workspace = $('workspace');
  // Visible : tiroir de l'Aide au texte ouvert sur l'onglet Lisibilité.
  const shown = () => !!(window.FTAssistant && window.FTAssistant.isOpen() && window.FTAssistant.tab() === 'lisibilite');

  const LONG = 21;       // phrase longue : plus de 20 mots
  const VERY_LONG = 31;  // très longue : plus de 30 mots
  const WPM = 230;       // lecture silencieuse (mots par minute)
  const WPM_VOICE = 150; // lecture à voix haute

  // Parties du document qui ne sont pas de la prose : titres, tableaux, plans, notes, légendes…
  const SKIP = 'h1, h2, h3, h4, h5, h6, table, .ft-toc, .ft-lof, .ft-index, .ft-biblio, .ft-bib, .ft-footnotes, .ft-endnotes, .ft-math, .ft-caption, .ft-legend, .ft-cover, .ft-pg-gap, sup, #track-layer, #bm-layer, [contenteditable="false"]';
  const BLOCK = 'p, li, blockquote, div';
  const ABBR = new Set(['m', 'mm', 'mme', 'mmes', 'mlle', 'mlles', 'dr', 'pr', 'me', 'st', 'ste', 'etc', 'cf', 'p', 'pp', 'vol', 'ch', 'chap', 'éd', 'ed', 'art', 'av', 'apr', 'ibid', 'op', 'cit', 'fig', 'coll', 'env', 'max', 'min', 'no', 'nos', 'n', 'vs', 'ex', 'éds', 'trad', 'cie', 'sq', 'sqq', 'id', 'resp']);
  const ELISION = /^(?:l|d|j|m|n|s|t|c|ç|qu|jusqu|lorsqu|puisqu|quoiqu|presqu|quelqu)['’]/i;

  let common = null; // Set des mots courants (chargé à la première ouverture)
  let last = null;   // dernière analyse
  let timer = null;
  const marks = { long: false, rare: false };
  const hl = {};
  if (window.Highlight) {
    for (const name of ['ft-read-long', 'ft-read-vlong', 'ft-read-rare']) {
      hl[name] = new Highlight();
      CSS.highlights.set(name, hl[name]);
    }
  }

  function loadWords() {
    if (common) return Promise.resolve(common);
    return new Promise((resolve) => {
      const done = () => {
        common = new Set(String(window.FT_COMMON_WORDS || '').split('\n'));
        delete window.FT_COMMON_WORDS;
        resolve(common);
      };
      if (window.FT_COMMON_WORDS) return done();
      const s = document.createElement('script');
      s.src = 'vendor/frequences-fr/frequences.js';
      s.onload = done;
      s.onerror = done;
      document.head.append(s);
    });
  }

  // ----- Le texte, bloc par bloc -----

  function blocks() {
    const map = new Map();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) continue;
      const block = el.closest(BLOCK) || editor;
      if (!map.has(block)) map.set(block, { block, text: '', nodes: [] });
      const b = map.get(block);
      b.nodes.push({ node: n, start: b.text.length });
      b.text += n.data;
    }
    return [...map.values()].filter((b) => /[\p{L}\p{N}]/u.test(b.text));
  }

  function rangeIn(b, start, end) {
    const at = (i) => {
      for (let k = b.nodes.length - 1; k >= 0; k--) if (b.nodes[k].start <= i) return [b.nodes[k].node, Math.min(i - b.nodes[k].start, b.nodes[k].node.data.length)];
      return [b.nodes[0].node, 0];
    };
    const r = document.createRange();
    r.setStart(...at(start));
    r.setEnd(...at(end));
    return r;
  }

  // ----- Phrases, mots, syllabes -----

  // Fins de phrase d'un bloc : . ! ? … suivis d'un espace (sauf abréviations et initiales), ou fin du bloc.
  function sentencesOf(text) {
    const out = [];
    let start = 0;
    const re = /[.!?…]+(?:[ \u00a0\u202f]*[»”")\]’])*(?=\s|$)/g;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (m[0][0] === '.' && m[0].length === 1) {
        const before = /([\p{L}\p{N}]+)\.$/u.exec(text.slice(Math.max(0, m.index - 12), m.index + 1));
        const word = before ? before[1] : '';
        if (ABBR.has(word.toLowerCase()) || /^\p{Lu}$/u.test(word)) continue;
        const after = /\s*(\S)/.exec(text.slice(end));
        if (after && /\p{Ll}/u.test(after[1])) continue; // « etc. et », « p. 12 »
      }
      if (/[\p{L}\p{N}]/u.test(text.slice(start, end))) out.push([start, end]);
      start = end;
    }
    if (/[\p{L}\p{N}]/u.test(text.slice(start))) out.push([start, text.length]);
    return out;
  }

  const VOWELS = /[aeiouyàáâãäéèêëíìîïóòôõöúùûüœæ]+/g;
  // Syllabes d'un mot (approximation : groupes de voyelles, e muet final retiré en français et en anglais).
  function syllables(word, lang = 'fr') {
    const w = word.toLowerCase();
    let n = (w.match(VOWELS) || []).length;
    if (lang === 'fr') n += (w.match(/[ao]é|é[aoiu]/g) || []).length; // aé-roport, ré-a-lité : deux syllabes
    if (lang !== 'fr' && lang !== 'en') return Math.max(1, n);
    if (n > 1 && (/[^aeiouyéè]es?$/.test(w) || /[qg]ues?$/.test(w))) n--;
    else if (lang === 'fr' && n > 1 && /[^aeiouy]ent$/.test(w) && /(?:ai|oi|e)ent$/.test(w)) n--;
    return Math.max(1, n);
  }

  // Indice de lisibilité de chaque langue (adaptations de Flesch) : asl = mots par phrase, asw = syllabes par mot.
  const FORMULAS = {
    fr: ['Indice de Kandel et Moles (adaptation française de Flesch)', (asl, asw) => 207 - 1.015 * asl - 73.6 * asw],
    en: ['Indice de Flesch (Reading Ease)', (asl, asw) => 206.835 - 1.015 * asl - 84.6 * asw],
    de: ['Indice d’Amstad (adaptation allemande de Flesch)', (asl, asw) => 180 - asl - 58.5 * asw],
    es: ['Indice de Fernández Huerta (adaptation espagnole de Flesch)', (asl, asw) => 206.84 - 1.02 * asl - 60 * asw],
    it: ['Indice de Flesch-Vacca (adaptation italienne de Flesch)', (asl, asw) => 217 - 1.3 * asl - 60 * asw],
    pt: ['Indice de Flesch adapté au portugais (Martins)', (asl, asw) => 248.835 - 1.015 * asl - 84.6 * asw]
  };

  // Langue d'un endroit d'un bloc (langues du document, voir languages.js).
  function langIn(b, i) {
    const S = window.FTSpell;
    if (!S || !S.langAt || !window.FTLang || window.FTLang.list().length < 2) return window.FTLang ? window.FTLang.principal() : 'fr';
    let k = b.nodes.length - 1;
    while (k > 0 && b.nodes[k].start > i) k--;
    return S.langAt(b.nodes[k].node, Math.max(0, i - b.nodes[k].start)) || window.FTLang.principal();
  }
  const zhWords = window.Intl && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

  // Mots lexicaux d'un « mot » écrit : l'élision et les traits d'union sont coupés.
  function parts(token) {
    const out = [];
    let offset = 0;
    let t = token;
    const el = ELISION.exec(t);
    if (el) { offset = el[0].length; t = t.slice(offset); }
    const re = /[\p{L}\p{M}]+/gu;
    let m;
    while ((m = re.exec(t))) out.push({ word: m[0], start: offset + m.index });
    return out;
  }

  // ----- Analyse -----

  function analyze() {
    const sentences = [];
    const rare = new Map(); // mot → { count, places: [{ b, start, end }] }
    let words = 0;
    let syll = 0;
    let lexical = 0;
    let rareCount = 0;
    const byLang = {}; // langue -> { words, sentences, syll, lexical } (pour l'indice)
    for (const b of blocks()) {
      for (const [s, e] of sentencesOf(b.text)) {
        const chunk = b.text.slice(s, e);
        const lang = langIn(b, s);
        // Le chinois n'a ni espaces ni syllabes à compter : seuls ses mots et ses phrases le sont.
        if (lang === 'zh') {
          const count = zhWords ? [...zhWords.segment(chunk)].filter((x) => x.isWordLike).length : chunk.replace(/\s/g, '').length;
          if (!count) continue;
          words += count;
          sentences.push({ b, start: s, end: e, words: count, text: chunk.trim() });
          continue;
        }
        const stat = byLang[lang] || (byLang[lang] = { words: 0, sentences: 0, syll: 0, lexical: 0 });
        let count = 0;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(chunk))) {
          const token = m[0].replace(/^[«"“(\[—–-]+|[»"”)\],;:.!?…]+$/g, '');
          if (!/[\p{L}\p{N}]/u.test(token)) continue;
          count++;
          const lead = m[0].indexOf(token);
          for (const p of parts(token)) {
            lexical++;
            const n = syllables(p.word, lang);
            syll += n;
            stat.lexical++;
            stat.syll += n;
            const lower = p.word.toLowerCase();
            // Mots rares : d'après la fréquence des mots français, dans les passages en français.
            if (lang !== 'fr' || p.word !== lower || p.word.length < 3 || !common || common.has(lower)) continue;
            rareCount++;
            const start = s + m.index + lead + p.start;
            const entry = rare.get(lower) || { word: lower, count: 0, places: [] };
            entry.count++;
            entry.places.push({ b, start, end: start + p.word.length });
            rare.set(lower, entry);
          }
        }
        if (!count) continue;
        words += count;
        stat.words += count;
        stat.sentences++;
        sentences.push({ b, start: s, end: e, words: count, text: chunk.trim() });
      }
    }
    const total = window.FTEditor.countWords().words;
    const asl = sentences.length ? words / sentences.length : 0;
    const asw = lexical ? syll / lexical : 0;
    // Indice de la langue la plus employée (hors chinois), calculé sur ses phrases.
    const main = Object.keys(byLang).sort((x, y) => byLang[y].words - byLang[x].words)[0];
    const st = main && byLang[main];
    const formula = FORMULAS[main] || FORMULAS.fr;
    const score = st && st.sentences && st.lexical ? Math.max(0, Math.min(100, formula[1](st.words / st.sentences, st.syll / st.lexical))) : null;
    const lengths = sentences.map((x) => x.words).sort((a, b) => a - b);
    return {
      total,
      words,
      sentences,
      asl,
      asw,
      score,
      scoreName: formula[0],
      median: lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0,
      longest: lengths.length ? lengths[lengths.length - 1] : 0,
      buckets: [
        sentences.filter((x) => x.words <= 10).length,
        sentences.filter((x) => x.words > 10 && x.words < LONG).length,
        sentences.filter((x) => x.words >= LONG && x.words < VERY_LONG).length,
        sentences.filter((x) => x.words >= VERY_LONG).length
      ],
      rare: [...rare.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'fr')),
      rareCount,
      lexical
    };
  }

  // ----- Affichage -----

  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const dec = (n) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pct = (a, b) => (b ? (a / b * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %' : '—');
  function duration(words, wpm) {
    if (!words) return '—';
    const m = words / wpm;
    if (m < 1) return 'moins d’une minute';
    const r = Math.round(m);
    if (r < 60) return r + ' min';
    return `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
  }
  const LEVELS = [[90, 'Très facile'], [80, 'Facile'], [70, 'Assez facile'], [60, 'Standard'], [50, 'Assez difficile'], [30, 'Difficile'], [0, 'Très difficile']];
  const level = (score) => LEVELS.find(([min]) => score >= min)[1];

  const el = (tag, props = {}, ...kids) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids.filter((k) => k !== null && k !== undefined));
    return e;
  };

  function render(a) {
    $('rl-title').textContent = window.FTApp.docName();
    const score = $('rl-score');
    if (a.score === null) {
      score.replaceChildren(el('p', { className: 'rl-empty', textContent: 'Pas encore de phrase à analyser.' }));
    } else {
      const s = Math.round(a.score);
      score.replaceChildren(
        el('div', { className: 'rl-score-row' },
          el('span', { className: 'rl-score', textContent: String(s) }),
          el('span', { className: 'rl-level', textContent: level(s) })),
        el('div', { className: 'rl-gauge' }, el('i', { style: `width:${s}%` })),
        el('p', { className: 'rl-hint', textContent: `${a.scoreName}, de 0 à 100 : plus il est élevé, plus le texte se lit facilement.` })
      );
    }
    const row = (k, v) => [el('dt', { textContent: k }), el('dd', { textContent: v })];
    $('rl-stats').replaceChildren(...[
      row('Mots du document', fmt(a.total)),
      row('Phrases analysées', fmt(a.sentences.length)),
      row('Longueur moyenne', a.sentences.length ? dec(a.asl) + ' mots' : '—'),
      row('Longueur médiane', a.sentences.length ? fmt(a.median) + ' mots' : '—'),
      row('Phrase la plus longue', a.sentences.length ? fmt(a.longest) + ' mots' : '—'),
      row('Syllabes par mot', a.lexical ? dec(a.asw) : '—'),
      row('Mots rares', a.lexical ? `${fmt(a.rareCount)} (${pct(a.rareCount, a.lexical)})` : '—'),
      row('Temps de lecture', duration(a.total, WPM)),
      row('Lecture à voix haute', duration(a.total, WPM_VOICE))
    ].flat());

    const names = ['Courtes (≤ 10 mots)', 'Moyennes (11 à 20)', 'Longues (21 à 30)', 'Très longues (> 30)'];
    const max = Math.max(1, ...a.buckets);
    $('rl-dist').replaceChildren(...a.buckets.map((n, i) => el('div', { className: 'rl-bar rl-b' + i },
      el('span', { className: 'rl-bar-name', textContent: names[i] }),
      el('span', { className: 'rl-bar-track' }, el('i', { style: `width:${(n / max) * 100}%` })),
      el('span', { className: 'rl-bar-num', textContent: `${fmt(n)} · ${pct(n, a.sentences.length)}` }))));

    const longest = [...a.sentences].filter((x) => x.words >= LONG).sort((x, y) => y.words - x.words).slice(0, 10);
    $('rl-long').replaceChildren(...(longest.length ? longest.map((x) => {
      const b = el('button', { type: 'button', className: 'rl-sentence' + (x.words >= VERY_LONG ? ' very' : ''), title: 'Aller à cette phrase' },
        el('b', { textContent: `${x.words} mots` }),
        el('span', { textContent: x.text.length > 150 ? x.text.slice(0, 150).replace(/\s\S*$/, '') + '…' : x.text }));
      b.addEventListener('click', () => goTo(rangeIn(x.b, x.start, x.end)));
      return b;
    }) : [el('p', { className: 'rl-empty', textContent: 'Aucune phrase de plus de 20 mots.' })]));

    $('rl-rare-count').textContent = a.rare.length ? `${fmt(a.rare.length)} mot${a.rare.length > 1 ? 's' : ''} différent${a.rare.length > 1 ? 's' : ''}` : '';
    $('rl-rare').replaceChildren(...(a.rare.length ? a.rare.slice(0, 120).map((r) => {
      let next = 0;
      const b = el('button', { type: 'button', className: 'rl-word', title: r.count > 1 ? 'Clics successifs : occurrence suivante' : 'Aller à ce mot' },
        r.word, r.count > 1 ? el('span', { textContent: ' ×' + r.count }) : null);
      b.addEventListener('click', () => {
        const p = r.places[next % r.places.length];
        next++;
        if (p.b.block.isConnected) goTo(rangeIn(p.b, p.start, p.end));
      });
      return b;
    }) : [el('p', { className: 'rl-empty', textContent: 'Aucun mot rare.' })]));
    paint();
  }

  // Surlignage des phrases longues et des mots rares dans le texte (API Highlight : le texte n'est pas modifié).
  function paint() {
    Object.values(hl).forEach((h) => h.clear());
    if (!last || !shown() || !window.Highlight) return;
    if (marks.long) {
      for (const x of last.sentences) {
        if (x.words < LONG || !x.b.block.isConnected) continue;
        hl[x.words >= VERY_LONG ? 'ft-read-vlong' : 'ft-read-long'].add(rangeIn(x.b, x.start, x.end));
      }
    }
    if (marks.rare) {
      for (const r of last.rare) for (const p of r.places) if (p.b.block.isConnected) hl['ft-read-rare'].add(rangeIn(p.b, p.start, p.end));
    }
  }

  function goTo(range) {
    if (G) { G.selectRange(range); return; }
    const rect = range.getBoundingClientRect();
    const box = workspace.getBoundingClientRect();
    if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) workspace.scrollTop += rect.top - box.top - box.height / 3;
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function clear() {
    clearTimeout(timer);
    Object.values(hl).forEach((h) => h.clear());
    last = null;
  }

  async function refresh() {
    if (!window.FTApp.currentId()) {
      clear();
      $('rl-title').textContent = '';
      $('rl-score').replaceChildren(el('p', { className: 'rl-empty', textContent: 'Aucun document ouvert.' }));
      for (const id of ['rl-stats', 'rl-dist', 'rl-long', 'rl-rare']) $(id).replaceChildren();
      $('rl-rare-count').textContent = '';
      return;
    }
    await loadWords();
    if (!shown()) return;
    last = analyze();
    render(last);
  }

  function open() {
    if (!window.FTApp.currentId()) return;
    // Le tiroir est masqué en mode lecture.
    if (window.FTReading && window.FTReading.isOn()) window.FTReading.set(false);
    window.FTAssistant.showTab('lisibilite');
  }

  function close() {
    window.FTAssistant.toggle(false);
  }

  // Onglet affiché ou masqué (assistant.js).
  document.addEventListener('ft-assist-view', () => { if (shown()) refresh(); else clear(); });

  // Le texte change : nouvelle analyse après une pause de frappe.
  const later = () => {
    if (!shown()) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 800);
  };
  editor.addEventListener('input', later);
  document.addEventListener('ft-docname', () => { if (shown()) refresh(); });

  $('rl-refresh').addEventListener('click', refresh);
  $('rl-mark-long').addEventListener('change', (e) => { marks.long = e.target.checked; paint(); });
  $('rl-mark-rare').addEventListener('change', (e) => { marks.rare = e.target.checked; paint(); });

  window.FTReadability = {
    open,
    close,
    useEngine(mount, api) {
      editor = mount;
      G = api;
      window.FTMoteur.onUpdate((tr) => { if (tr.docChanged) later(); });
    },
    // Pour les essais.
    analyze: async () => { await loadWords(); return analyze(); },
    _sentences: sentencesOf,
    _syllables: syllables
  };
})();
