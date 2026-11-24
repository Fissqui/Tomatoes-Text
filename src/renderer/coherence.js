// Vérification de cohérence du document ouvert (Édition > « Vérifier la cohérence… », ou l'AAT).
// Tout de suite, sans le modèle : les noms écrits de plusieurs façons (« Mathilde » et « Mathide »)
// et les dates impossibles (« 31 avril », « lundi 14 juillet 1789 » alors que c'était un mardi).
// Sur demande, avec le modèle local de l'AAT : les faits qui se contredisent (âges, apparence,
// liens de famille, métiers, lieux, dates).
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const dialog = $('coherence-dialog');
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const App = () => window.FTApp;
  const S = () => window.FTStructure;

  let running = 0;
  let ignored = new Set();

  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ----- Le texte du document, avec de quoi retrouver chaque endroit -----

  const SKIP = '.ft-cite, .ft-biblio, .ft-bib, .ft-toc, .ft-lof, .ft-index, .ft-pg-gap, .ft-math, #track-layer, .ft-endnotes-title';
  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, div';

  // Les paragraphes : { text, nodes: [{ node, start }] }.
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
    return [...map.values()];
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

  function select(range) {
    if (G) { G.selectRange(range); return; }
    const el = range.startContainer.parentElement;
    if (el) el.scrollIntoView({ block: 'center' });
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ----- Noms écrits de plusieurs façons -----

  const NOT_NAMES = new Set(['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
    'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'monsieur', 'madame', 'mademoiselle', 'chapitre', 'partie']);
  const WORD = /\p{Lu}\p{Ll}+(?:[-’']\p{Lu}?\p{Ll}+)*/gu;

  function distance(a, b) {
    // Damerau-Levenshtein (une lettre en trop, en moins, changée ou deux lettres inversées).
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  function nameVariants(list) {
    const forms = new Map(); // forme -> { total, mid, places: [{ b, start, end }] }
    for (const b of list) {
      for (const m of b.text.matchAll(WORD)) {
        const w = m[0];
        if (w.length < 3 || NOT_NAMES.has(fold(w))) continue;
        const before = b.text.slice(0, m.index).replace(/\s+$/, '');
        const initial = !before || /[.!?…:«»"“—–-]$/.test(before);
        if (!forms.has(w)) forms.set(w, { total: 0, mid: 0, places: [] });
        const f = forms.get(w);
        f.total++;
        if (!initial) f.mid++;
        f.places.push({ b, start: m.index, end: m.index + w.length });
      }
    }
    const names = [...forms.entries()].filter(([, f]) => f.mid > 0);
    const out = [];
    const seen = new Set();
    for (const [a, fa] of names) {
      for (const [b, fb] of forms) {
        if (a === b || fold(a[0]) !== fold(b[0]) || Math.min(a.length, b.length) < 4) continue;
        const key = [a, b].sort().join('|');
        if (seen.has(key)) continue;
        const accentsOnly = fold(a) === fold(b);
        const dist = accentsOnly ? 0 : distance(fold(a), fold(b));
        const limit = Math.min(a.length, b.length) >= 8 ? 2 : 1;
        if (!accentsOnly && dist > limit) continue;
        // Deux noms fréquents qui diffèrent d'une lettre sont sans doute deux personnes (Marie, Maria).
        if (!accentsOnly && fa.total >= 3 && fb.total >= 3) continue;
        // Pluriel ou féminin d'un mot ordinaire (« Français », « Française ») : pas un nom mal écrit.
        if (/^(?:s|e|es|x)$/.test(fold(a.length > b.length ? a.slice(b.length) : b.slice(a.length))) && (a.startsWith(b) || b.startsWith(a))) continue;
        seen.add(key);
        const [main, rare] = fa.total >= fb.total ? [a, b] : [b, a];
        if (ignored.has('nom:' + rare + '|' + main)) continue;
        out.push({ main, rare, mainCount: forms.get(main).total, rareCount: forms.get(rare).total, places: forms.get(rare).places });
      }
    }
    return out.sort((x, y) => y.mainCount - x.mainCount);
  }

  // ----- Dates impossibles -----

  const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
  const MONTH_NAMES = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const DATE = /(?:\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(?:le\s+)?)?\b(1er|\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(\d{4}))?\b/giu;
  const NUM_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysIn = (m, y) => [31, y == null || leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

  function dateProblems(list) {
    const out = [];
    for (const b of list) {
      for (const m of b.text.matchAll(DATE)) {
        const day = m[2] === '1er' ? 1 : +m[2];
        const mo = MONTHS[fold(m[3])];
        const y = m[4] ? +m[4] : null;
        const place = { b, start: m.index, end: m.index + m[0].length };
        if (day < 1 || day > daysIn(mo, y)) {
          out.push({ text: m[0], why: day === 29 && mo === 2 ? `${y} n'est pas une année bissextile : il n'y a pas de 29 février.` : `Il n'y a pas de ${day} ${MONTH_NAMES[mo]} : ce mois a ${daysIn(mo, y)} jours.`, place });
          continue;
        }
        if (m[1] && y && y >= 1583) {
          const real = DAYS[new Date(Date.UTC(y, mo - 1, day)).getUTCDay()];
          if (real !== fold(m[1])) out.push({ text: m[0], why: `Le ${day === 1 ? '1er' : day} ${MONTH_NAMES[mo]} ${y} était un ${real}, pas un ${m[1].toLowerCase()}.`, place });
        }
      }
      for (const m of b.text.matchAll(NUM_DATE)) {
        const day = +m[1], mo = +m[2], y = +m[3];
        if (mo < 1 || mo > 12 || day < 1 || day > daysIn(mo, y)) out.push({ text: m[0], why: mo < 1 || mo > 12 ? `Il n'y a pas de mois numéro ${mo}.` : `Il n'y a pas de ${day} ${MONTH_NAMES[mo]} ${y}.`, place: { b, start: m.index, end: m.index + m[0].length } });
      }
    }
    return out.filter((p) => !ignored.has('date:' + p.text));
  }

  // ----- Affichage -----

  function section(title, hint) {
    const box = document.createElement('section');
    box.className = 'coh-section';
    const h = document.createElement('h3');
    h.textContent = title;
    box.append(h);
    if (hint) {
      const p = document.createElement('p');
      p.className = 'coh-hint';
      p.textContent = hint;
      box.append(p);
    }
    return box;
  }

  function item(text, buttons) {
    const row = document.createElement('div');
    row.className = 'coh-item';
    const p = document.createElement('div');
    p.className = 'coh-text';
    if (typeof text === 'string') p.textContent = text; else p.append(...text);
    const acts = document.createElement('div');
    acts.className = 'coh-acts';
    for (const [label, fn, title] of buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', () => fn(row, b));
      acts.append(b);
    }
    row.append(p, acts);
    return row;
  }

  const q = (s) => { const b = document.createElement('b'); b.textContent = `« ${s} »`; return b; };
  const times = (n) => `${n} fois`;

  function renderLocal() {
    const list = blocks();
    const box = $('coh-local');
    box.replaceChildren();
    const names = nameVariants(list);
    const dates = dateProblems(list);

    const ns = section('Noms écrits de plusieurs façons', names.length ? null : 'Aucun nom écrit de deux façons.');
    for (const v of names) {
      let k = 0;
      ns.append(item([q(v.rare), ` (${times(v.rareCount)}) ressemble à `, q(v.main), ` (${times(v.mainCount)}).`], [
        ['Voir', () => { const p = v.places[k++ % v.places.length]; select(rangeIn(p.b, p.start, p.end)); }, `Montrer « ${v.rare} » dans le texte`],
        [`Tout écrire « ${v.main} »`, (row) => { replaceAll(v.rare, v.main); row.remove(); }, `Remplacer les ${v.rareCount} « ${v.rare} » par « ${v.main} »`],
        ['Ignorer', (row) => { ignored.add('nom:' + v.rare + '|' + v.main); row.remove(); }]
      ]));
    }
    box.append(ns);

    const ds = section('Dates impossibles', dates.length ? null : 'Aucune date impossible.');
    for (const d of dates) {
      ds.append(item([q(d.text), ' : ' + d.why], [
        ['Voir', () => select(rangeIn(d.place.b, d.place.start, d.place.end))],
        ['Ignorer', (row) => { ignored.add('date:' + d.text); row.remove(); }]
      ]));
    }
    box.append(ds);
  }

  // Remplace un nom partout (mot entier), en une seule étape d'annulation.
  function replaceAll(from, to) {
    if (G) { G.edit(() => replaceIn(from, to)); return; }
    S().checkpoint();
    replaceIn(from, to);
    S().changed();
  }
  function replaceIn(from, to) {
    const re = new RegExp(`(?<![\\p{L}\\d])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'gu');
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (re.test(n.data)) nodes.push(n), (re.lastIndex = 0);
    for (const n of nodes) n.data = n.data.replace(re, to);
  }

  // ----- Contradictions, par le modèle -----

  function aiState({ progress, error, setup, results, info }) {
    $('coh-ai-run').hidden = !!progress;
    $('coh-ai-stop').hidden = !progress;
    $('coh-ai-progress').hidden = !progress;
    $('coh-ai-error').hidden = !error;
    $('coh-ai-error').textContent = error || '';
    $('coh-ai-setup').hidden = !setup;
    $('coh-ai-info').textContent = info || '';
    const box = $('coh-ai-results');
    box.replaceChildren();
    if (!results) return;
    if (!results.length) {
      const p = document.createElement('p');
      p.className = 'coh-hint';
      p.textContent = 'Le modèle n’a trouvé aucune contradiction.';
      box.append(p);
      return;
    }
    for (const c of results) {
      const quotes = document.createElement('div');
      quotes.className = 'coh-quotes';
      for (const f of c.facts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'coh-quote';
        b.textContent = f.citation ? `« ${f.citation} »` : f.fait;
        b.title = f.fait + (f.citation ? ' : cliquez pour le montrer dans le texte' : '');
        b.disabled = !f.citation;
        b.addEventListener('click', () => showQuote(f.citation, b));
        quotes.append(b);
      }
      const head = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = c.subject + ' : ';
      head.append(name, c.explanation);
      const row = item([head, quotes], [['Ignorer', (r) => r.remove()]]);
      box.append(row);
    }
  }

  // Retrouve une citation dans le texte (en ignorant les espaces et la casse).
  function showQuote(citation, btn) {
    const want = fold(citation).replace(/\s+/g, ' ').trim();
    if (!want) return;
    for (const b of blocks()) {
      const flat = fold(b.text);
      let at = flat.indexOf(want);
      let len = want.length;
      if (at < 0) {
        // Citation pas tout à fait exacte : ses premiers mots.
        const head = want.split(' ').slice(0, 5).join(' ');
        at = head.length > 8 ? flat.indexOf(head) : -1;
        len = head.length;
      }
      if (at >= 0) { select(rangeIn(b, at, at + len)); return; }
    }
    btn.classList.add('missing');
    btn.title = 'Ces mots exacts n’ont pas été retrouvés dans le texte.';
  }

  async function runAI() {
    const id = App().currentId();
    if (!id) return;
    const data = await App().docText(id);
    const me = ++running;
    aiState({ progress: true, info: 'Le modèle lit le texte, puis compare ce qu’il a relevé. Un long texte peut demander plusieurs minutes.' });
    setProgress({ done: 0, total: 1, step: 'faits' });
    const res = await api.assistCoherence({ id: me, title: data.title, text: data.text, langs: window.FTLang ? window.FTLang.list() : ['fr'] });
    if (me !== running) return;
    running = 0;
    if (res.cancelled) return aiState({ info: 'Vérification arrêtée.' });
    if (res.error) return aiState({ error: res.needsSetup ? 'Le modèle de l’Aide au texte n’est pas encore installé. Ouvrez l’Aide au texte, puis « Réglages de l’Aide au texte ».' : res.error, setup: !!res.needsSetup });
    aiState({ results: res.contradictions, info: `${res.facts} faits relevés, ${res.subjects} noms comparés. Trouvé par le modèle local de l'Aide au texte : vérifiez avant de corriger.` });
  }

  function setProgress({ done, total, step }) {
    const pct = step === 'faits' ? 5 + (done / Math.max(1, total)) * 60 : 65 + (done / Math.max(1, total)) * 33;
    $('coh-ai-progress').querySelector('.sum-bar span').style.width = Math.round(pct) + '%';
    $('coh-ai-step').textContent = step === 'faits'
      ? (total > 1 ? `Lecture : partie ${done + 1} sur ${total}…` : 'Lecture du texte…')
      : `Comparaison des faits : ${done + 1} sur ${total}…`;
  }
  api.onCoherenceProgress((p) => { if (p.id === running) setProgress(p); });

  // ----- Fenêtre -----

  async function open(docId) {
    if (docId && docId !== App().currentId()) await App().openDocById(docId);
    if (!App().currentId()) return;
    $('coh-title').textContent = window.FTApp.docName();
    renderLocal();
    if (!running) aiState({});
    if (!dialog.open) dialog.show();
  }

  function close() {
    if (running) { running = 0; api.assistCoherenceCancel(); }
    dialog.close();
  }

  $('coh-refresh').addEventListener('click', renderLocal);
  $('coh-ai-run').addEventListener('click', runAI);
  $('coh-ai-stop').addEventListener('click', () => api.assistCoherenceCancel());
  $('coh-ai-setup').addEventListener('click', () => { window.FTAssistant.toggle(true); const d = $('assist-settings'); if (d) d.open = true; });
  $('coh-close').addEventListener('click', close);
  $('assist-coherence').addEventListener('click', () => open());
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

  window.FTCoherence = { open, useEngine(mount, api) { editor = mount; G = api; }, nameVariants: (text) => nameVariants([{ text, nodes: [] }]).map(({ main, rare }) => [rare, main]), dateProblems: (text) => dateProblems([{ text, nodes: [] }]).map((d) => d.why) };
})();
