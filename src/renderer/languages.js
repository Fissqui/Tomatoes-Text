// Langues du document (doc.settings.languages, la première est la langue principale) : français,
// anglais, allemand, espagnol, italien, portugais, mandarin. La langue de chaque paragraphe, et de
// chaque phrase assez longue, est reconnue parmi celles-ci (src/languages.js) ; l'orthographe, la
// grammaire, les synonymes et l'AAT suivent la langue du passage. Un paragraphe peut aussi recevoir
// une langue fixe (attribut lang, clic droit « Langue du paragraphe »).
(function () {
  const api = window.frameText;
  let editor = document.getElementById('editor');
  // Moteur 2.0 : le nouveau moteur (useEngine).
  let M = null;
  // Document modifié (enregistré ensuite).
  const touched = () => (M ? window.FTEditor.changed() : editor.dispatchEvent(new Event('input')));
  const $ = (id) => document.getElementById(id);

  const LANGS = [
    ['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'],
    ['it', 'Italien'], ['pt', 'Portugais'], ['zh', 'Mandarin']
  ];
  const CODES = LANGS.map(([c]) => c);
  const LABEL = Object.fromEntries(LANGS);
  // Code de l'attribut lang du HTML et de Word (w:lang).
  const TAG = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', zh: 'zh-CN' };

  const clean = (list) => {
    const out = [];
    for (const c of Array.isArray(list) ? list : []) if (CODES.includes(c) && !out.includes(c)) out.push(c);
    return out;
  };

  let langs = ['fr']; // langues du document ouvert
  let defaults = ['fr']; // langues des nouveaux documents (réglages du logiciel)
  let saveDefaults = () => {};
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn(langs));

  // ----- Reconnaissance -----

  const cache = new Map(); // langues + texte -> { lang, sure }
  const MAX_CACHE = 4000;
  const keyOf = (text) => langs.join(',') + '\u0000' + text;

  // Reconnaît les textes pas encore vus, en une seule demande.
  async function detectAll(texts) {
    const todo = [...new Set(texts.filter((t) => !cache.has(keyOf(t))))];
    for (let i = 0; i < todo.length; i += 200) {
      const part = todo.slice(i, i + 200);
      let res = [];
      try { res = await api.detectLanguages(part, langs); } catch { /* langue principale par défaut */ }
      part.forEach((t, j) => cache.set(keyOf(t), res[j] || { lang: langs[0], sure: false }));
    }
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return texts.map((t) => cache.get(keyOf(t)));
  }

  // Langue choisie à la main pour un paragraphe (attribut lang d'un bloc du texte).
  function fixedLang(node) {
    const el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    const tagged = el && el.closest('[lang]');
    if (!tagged || tagged === editor || !editor.contains(tagged)) return null;
    const code = String(tagged.getAttribute('lang')).slice(0, 2).toLowerCase();
    return CODES.includes(code) ? code : null;
  }

  // Phrases d'un texte : [start, end] (avec la ponctuation et les espaces qui suivent).
  function sentences(text) {
    const out = [];
    const re = /[^.!?…。！？\n]+(?:[.!?…。！？]+[»"”’)\]]*)?\s*/g;
    for (const m of text.matchAll(re)) if (m[0].trim()) out.push([m.index, m.index + m[0].length]);
    return out;
  }
  const longEnough = (s) => (s.match(/\p{Script=Han}/gu) || []).length >= 4 || s.trim().split(/\s+/).length >= 4;

  // Langue de chaque passage de plusieurs paragraphes : entries = [{ block, text }] dans l'ordre du
  // document. Renvoie pour chacun [{ start, end, lang }]. Un paragraphe trop court ou ambigu (un titre,
  // une ligne) prend la langue du paragraphe précédent ; une phrase nettement dans une autre langue
  // devient un passage à part.
  async function segment(entries) {
    if (langs.length === 1) return entries.map((e) => [{ start: 0, end: e.text.length, lang: langs[0] }]);
    const asks = [];
    const plans = entries.map((e) => {
      const fixed = e.fixed !== undefined ? e.fixed : fixedLang(e.block);
      if (fixed) return { fixed };
      const parts = sentences(e.text).filter(([a, b]) => longEnough(e.text.slice(a, b)));
      if (e.text.trim()) asks.push(e.text);
      if (parts.length > 1) for (const [a, b] of parts) asks.push(e.text.slice(a, b));
      return { parts: parts.length > 1 ? parts : [] };
    });
    await detectAll(asks);
    let previous = langs[0];
    return entries.map((e, i) => {
      const plan = plans[i];
      if (plan.fixed) {
        previous = plan.fixed;
        return [{ start: 0, end: e.text.length, lang: plan.fixed }];
      }
      const whole = e.text.trim() ? cache.get(keyOf(e.text)) : null;
      const lang = whole && whole.sure ? whole.lang : previous;
      previous = lang;
      const segs = [{ start: 0, end: e.text.length, lang }];
      for (const [a, b] of plan.parts) {
        const r = cache.get(keyOf(e.text.slice(a, b)));
        if (!r || !r.sure || r.lang === lang) continue;
        // La phrase coupe le passage où elle se trouve.
        const k = segs.findIndex((s) => s.start <= a && b <= s.end);
        if (k < 0) continue;
        const s = segs[k];
        segs.splice(k, 1, ...[{ start: s.start, end: a, lang: s.lang }, { start: a, end: b, lang: r.lang }, { start: b, end: s.end, lang: s.lang }].filter((x) => x.end > x.start));
      }
      // Passages voisins de même langue réunis.
      return segs.reduce((acc, s) => {
        const last = acc[acc.length - 1];
        if (last && last.lang === s.lang) last.end = s.end;
        else acc.push({ ...s });
        return acc;
      }, []);
    });
  }

  // Langue d'un texte isolé (sélection de l'AAT) ; fallback : langue donnée, sinon la principale.
  async function detectText(text, fallback) {
    if (langs.length === 1) return langs[0];
    const [r] = await detectAll([String(text || '')]);
    return r && r.sure ? r.lang : fallback || langs[0];
  }

  // Langue la plus employée dans un texte (un paragraphe par ligne), parmi `among` (toutes par défaut).
  async function dominant(text, among = CODES) {
    const lines = String(text || '').split(/\n+/).filter((l) => l.trim());
    if (!lines.length) return langs[0];
    let res = [];
    try { res = await api.detectLanguages(lines, among); } catch { return langs[0]; }
    const weight = {};
    lines.forEach((l, i) => { const r = res[i]; if (r) weight[r.lang] = (weight[r.lang] || 0) + l.length; });
    return Object.keys(weight).sort((a, b) => weight[b] - weight[a])[0] || langs[0];
  }

  // ----- Fenêtre « Langues du document » -----

  const dialog = $('lang-dialog');
  const box = $('lg-list');
  const mainSel = $('lg-main');

  function fillMain(keep) {
    const checked = [...box.querySelectorAll('input:checked')].map((i) => i.value);
    mainSel.innerHTML = '';
    for (const c of checked) mainSel.add(new Option(LABEL[c], c));
    mainSel.value = checked.includes(keep) ? keep : checked[0] || '';
    mainSel.disabled = checked.length < 2;
    $('lg-ok').disabled = !checked.length;
  }

  function open() {
    if (!window.FTApp.currentId()) return;
    box.innerHTML = '';
    for (const [code, label] of LANGS) {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.value = code;
      i.checked = langs.includes(code);
      i.addEventListener('change', () => fillMain(mainSel.value));
      l.append(i, ' ' + label);
      box.appendChild(l);
    }
    fillMain(langs[0]);
    $('lg-default').checked = false;
    dialog.showModal();
  }

  $('lg-ok').addEventListener('click', () => {
    const checked = [...box.querySelectorAll('input:checked')].map((i) => i.value);
    if (!checked.length) return;
    const main = mainSel.value || checked[0];
    const list = [main, ...checked.filter((c) => c !== main)];
    dialog.close();
    if ($('lg-default').checked && list.join() !== defaults.join()) {
      defaults = list;
      saveDefaults(list.slice());
    }
    if (list.join() === langs.join()) return;
    langs = list;
    showStatus();
    touched(); // document modifié : enregistré
    changed();
  });
  $('lg-cancel').addEventListener('click', () => dialog.close());

  // ----- Barre d'état : langue du passage où se trouve le curseur -----

  const status = $('status-lang');
  status.addEventListener('click', open);
  let caretLang = null;

  function showStatus() {
    const lang = caretLang && langs.includes(caretLang) ? caretLang : caretLang || langs[0];
    status.textContent = LABEL[lang] || LABEL[langs[0]];
    status.title = langs.length > 1
      ? 'Langues du document : ' + langs.map((c) => LABEL[c]).join(', ')
      : 'Langue du document';
  }

  function caretMoved() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const lang = window.FTSpell && window.FTSpell.langAt ? window.FTSpell.langAt(sel.anchorNode, sel.anchorOffset) : null;
    if (lang === caretLang) return;
    caretLang = lang;
    showStatus();
  }
  document.addEventListener('selectionchange', caretMoved);

  // ----- Clic droit : langue fixée pour les paragraphes sélectionnés -----

  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote';

  // Paragraphes touchés par la sélection (les plus petits : un encadré compte par ses paragraphes).
  function blocksOfSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return [];
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
      const list = [...editor.querySelectorAll(BLOCK)].filter((b) => range.intersectsNode(b) && !b.querySelector(BLOCK) && !b.closest('[contenteditable="false"]'));
      if (list.length) return list;
    }
    const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const block = start.closest(BLOCK);
    return block && editor.contains(block) ? [block] : [];
  }

  // Moteur : les blocs de texte de la sélection ; la langue va sur le bloc qui sera enregistré (une ligne
  // de liste ou une case de tableau dont le texte n'a pas de paragraphe à lui).
  function engineTargets() {
    const { view } = M;
    const { from, to } = view.state.selection;
    const doc = view.state.doc;
    const out = new Map();
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      let target = node;
      let at = pos;
      if (node.type.name === 'paragraph' && node.attrs.bare) {
        const $p = doc.resolve(pos);
        if ($p.depth > 0) { target = $p.parent; at = $p.before(); }
      }
      out.set(at, target);
      return false;
    });
    return [...out].map(([pos, node]) => ({ pos, node }));
  }
  const codeOf = (v) => {
    const c = v ? String(v).slice(0, 2).toLowerCase() : '';
    return CODES.includes(c) ? c : null;
  };

  function setFixedEngine(lang) {
    const { view } = M;
    const targets = engineTargets();
    if (!targets.length) return;
    const tr = view.state.tr;
    const without = (a) => {
      const o = { ...a };
      delete o.lang;
      return o;
    };
    for (const { pos, node } of targets) {
      const a = without(node.attrs.a || {});
      if (lang) a.lang = TAG[lang];
      tr.setNodeMarkup(pos, null, { ...node.attrs, a });
      node.descendants((child, p) => {
        if (child.attrs && child.attrs.a && child.attrs.a.lang) tr.setNodeMarkup(pos + 1 + p, null, { ...child.attrs, a: without(child.attrs.a) });
      });
    }
    view.dispatch(PM.history.closeHistory(tr));
    M.closeHistory();
    view.focus();
    caretLang = null;
    caretMoved();
  }

  function setFixed(lang) {
    if (M) return setFixedEngine(lang);
    const blocks = blocksOfSelection();
    if (!blocks.length) return;
    if (window.FTStructure && window.FTStructure.checkpoint) window.FTStructure.checkpoint();
    for (const b of blocks) {
      if (lang) b.setAttribute('lang', TAG[lang]);
      else b.removeAttribute('lang');
      b.querySelectorAll('[lang]').forEach((n) => n.removeAttribute('lang'));
    }
    editor.dispatchEvent(new Event('input'));
    caretLang = null;
    caretMoved();
  }

  function menuItems() {
    if (langs.length < 2 || !(M ? engineTargets() : blocksOfSelection()).length) return [];
    return [{
      text: 'Langue du paragraphe',
      submenu: async () => {
        let fixed = null;
        if (M) {
          const t = engineTargets()[0];
          if (t) {
            const $p = M.view.state.doc.resolve(t.pos + 1);
            for (let d = $p.depth; d > 0 && !fixed; d--) fixed = codeOf($p.node(d).attrs.a && $p.node(d).attrs.a.lang);
          }
        } else {
          const blocks = blocksOfSelection();
          fixed = blocks.length ? fixedLang(blocks[0]) : null;
        }
        return [
          { text: 'Détection automatique', strong: !fixed, action: () => setFixed(null) },
          '-',
          ...langs.map((c) => ({ text: LABEL[c], strong: fixed === c, action: () => setFixed(c) }))
        ];
      }
    }];
  }

  window.FTLang = {
    LANGS,
    TAG,
    label: (c) => LABEL[c] || LABEL.fr,
    // settings : réglages du logiciel { defaultLanguages } ; save(list) les enregistre.
    init(saved, save) {
      const d = clean(saved);
      defaults = d.length ? d : ['fr'];
      saveDefaults = save;
    },
    // Document ouvert : ses langues (à défaut, celles des nouveaux documents).
    load(settings) {
      const list = clean(settings && settings.languages);
      langs = list.length ? list : defaults.slice();
      caretLang = null;
      showStatus();
      changed();
    },
    get: () => langs.slice(),
    forNewDoc: () => defaults.slice(),
    list: () => langs.slice(),
    principal: () => langs[0],
    onChange: (fn) => listeners.push(fn),
    open,
    segment,
    fixedLang,
    detectText,
    dominant,
    menuItems,
    refreshStatus() { caretLang = null; caretMoved(); },
    useEngine(mount, moteur) {
      editor = mount;
      M = moteur;
    }
  };
  showStatus();
})();
