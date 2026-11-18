// Index en fin de document : les mots marqués, avec leurs pages.
// Un mot marqué (clic droit > « Marquer pour l'index », ou bouton « Index ») est une entrée gardée dans
// les réglages du document (settings.index) : { term, variants: [...], parent }. Toutes ses
// occurrences dans le texte sont trouvées (mot entier, sans tenir compte des majuscules), avec
// les autres formes données (pluriel, féminin…). Une entrée peut être rangée sous une autre (sous-entrée).
// Le bloc div.ft-index (non modifiable) liste les entrées par ordre alphabétique, avec une lettre
// pour chaque groupe et les pages en mode avancé (« 3, 7, 12-14 »).
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  const workspace = $('workspace');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const regen = (fn) => (G ? G.regen(fn) : fn());
  const dialog = $('index-dialog');
  const listBox = $('ix-list');
  const addInput = $('ix-add');

  // Parties du texte où les mots ne comptent pas.
  const SKIP = '.ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-footnotes, .ft-endnotes, .ft-biblio, .ft-bib, .ft-xref, .ft-pg-gap, #track-layer, #bm-layer, .ft-math, script, style';
  const MAX = 300;

  let entries = [];       // { term, variants, parent }
  let onChange = () => {};
  const canMark = !!(window.CSS && CSS.highlights && window.Highlight);

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const norm = (s) => clean(s).toLowerCase();
  const key = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const commit = () => { if (window.FTHistory) window.FTHistory.commit(); };

  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const e of list.slice(0, MAX)) {
      if (!e || typeof e.term !== 'string') continue;
      const term = clean(e.term).slice(0, 80);
      if (!term || seen.has(norm(term))) continue;
      seen.add(norm(term));
      const variants = Array.isArray(e.variants) ? [...new Set(e.variants.map((v) => clean(String(v)).slice(0, 80)).filter((v) => v && norm(v) !== norm(term)))].slice(0, 20) : [];
      out.push({ term, variants, parent: typeof e.parent === 'string' ? clean(e.parent).slice(0, 80) : '' });
    }
    // Une sous-entrée a un parent qui existe et qui n'est pas lui-même une sous-entrée.
    const tops = new Set(out.filter((e) => !e.parent).map((e) => norm(e.term)));
    for (const e of out) if (e.parent && (!tops.has(norm(e.parent)) || norm(e.parent) === norm(e.term))) e.parent = '';
    return out;
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

  // Les occurrences de chaque entrée dans le texte (ou une copie, pour l'export livre) : Map entrée → [Range].
  function occurrences(root = editor) {
    const found = new Map(entries.map((e) => [e, []]));
    if (!entries.length) return found;
    const forms = [];
    for (const e of entries) for (const f of [e.term, ...e.variants]) forms.push([norm(f), e]);
    forms.sort((a, b) => b[0].length - a[0].length);
    const byForm = new Map(forms);
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${forms.map(([f]) => escape(f)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(n.data))) {
        const e = byForm.get(norm(m[0]).replace(/\s+/g, ' '));
        if (!e) continue;
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        found.get(e).push(r);
      }
    }
    return found;
  }

  // « 3, 7, 12-14 » à partir des pages (en ordre, sans doublon).
  function pageList(pages) {
    const list = [...new Set(pages)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      let j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      out.push(j > i + 1 ? `${list[i]}–${list[j]}` : j === i + 1 ? `${list[i]}, ${list[j]}` : String(list[i]));
      i = j;
    }
    return out.join(', ');
  }

  const letterOf = (term) => {
    const c = key(term).charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : /[0-9]/.test(c) ? '0-9' : '#';
  };
  const compare = (a, b) => a.term.localeCompare(b.term, 'fr', { sensitivity: 'base', numeric: true });

  function build(found) {
    const out = [];
    const label = document.createElement('div');
    label.className = 'ft-index-label';
    label.textContent = 'Index';
    out.push(label);
    const paged = window.FTPages && window.FTPages.isPaged();
    const tops = entries.filter((e) => !e.parent).sort(compare);
    const subs = (e) => entries.filter((s) => s.parent && norm(s.parent) === norm(e.term)).sort(compare);
    const line = (e, sub) => {
      const row = document.createElement('div');
      row.className = 'ft-index-entry' + (sub ? ' sub' : '');
      row.dataset.term = e.term;
      const t = document.createElement('span');
      t.className = 'ft-index-term';
      t.textContent = e.term;
      row.append(t);
      const ranges = found.get(e) || [];
      if (paged && ranges.length) {
        const pages = ranges.map((r) => (window.FTPages.pageNumberOfRange ? window.FTPages.pageNumberOfRange(r) : window.FTPages.pageNumberAtY(r.getBoundingClientRect().top + 1))).filter((n) => n !== null);
        if (pages.length) {
          const p = document.createElement('span');
          p.className = 'ft-index-pages';
          p.textContent = ', ' + pageList(pages);
          row.append(p);
        }
      } else if (!ranges.length) {
        row.classList.add('absent');
      }
      return row;
    };
    let letter = '';
    for (const e of tops) {
      const l = letterOf(e.term);
      if (l !== letter) {
        letter = l;
        const h = document.createElement('div');
        h.className = 'ft-index-letter';
        h.textContent = l;
        out.push(h);
      }
      out.push(line(e, false));
      for (const s of subs(e)) out.push(line(s, true));
    }
    if (!tops.length) {
      const empty = document.createElement('div');
      empty.className = 'ft-index-empty';
      empty.textContent = 'Aucun mot marqué. Clic droit sur un mot > « Marquer pour l’index ».';
      out.push(empty);
    }
    return out;
  }

  // Ne touche au bloc que s'il a changé (sinon le découpage en pages recommencerait sans fin).
  function refresh() {
    const blocks = editor.querySelectorAll('.ft-index');
    const marking = dialog.open && canMark;
    if (!blocks.length && !marking) return;
    const found = occurrences();
    if (blocks.length) {
      regen(() => {
        for (const ix of blocks) {
          if (ix.getAttribute('contenteditable') !== 'false') ix.setAttribute('contenteditable', 'false');
          const fresh = document.createElement('div');
          fresh.append(...build(found));
          if (ix.innerHTML !== fresh.innerHTML) ix.innerHTML = fresh.innerHTML;
        }
      });
    }
    if (marking) CSS.highlights.set('ft-index', new Highlight(...[...found.values()].flat()));
    if (dialog.open) paintCounts(found);
  }

  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
  editor.addEventListener('input', later);
  document.addEventListener('ft-paginated', () => { if (!G && editor.querySelector('.ft-index')) refresh(); });

  function setEntries(list) {
    entries = sanitize(list);
    onChange(entries);
    refresh();
    if (!G) editor.dispatchEvent(new Event('input'));
  }

  // ----- Marquer un mot -----

  // L', d', qu'… devant le mot ne font pas partie de l'entrée.
  const ELISION = /^(?:[ldjmnstc]|qu|jusqu|lorsqu|puisqu|quoiqu)['’](?=\p{L})/iu;

  // Le mot sous la sélection (ou la sélection elle-même, si elle tient sur une ligne).
  function wordAt(range) {
    if (!range) return '';
    if (!range.collapsed) {
      const t = clean(range.toString());
      return t.length <= 80 && !/[\n.;:!?]/.test(t) ? t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(ELISION, '') : '';
    }
    const n = range.startContainer;
    if (n.nodeType !== Node.TEXT_NODE) return '';
    const s = n.data;
    let a = range.startOffset;
    let b = range.startOffset;
    const isW = (c) => /[\p{L}\p{N}'’-]/u.test(c);
    while (a > 0 && isW(s[a - 1])) a--;
    while (b < s.length && isW(s[b])) b++;
    return s.slice(a, b).replace(/^['’-]+|['’-]+$/g, '').replace(ELISION, '');
  }

  const has = (term) => entries.find((e) => norm(e.term) === norm(term) || e.variants.some((v) => norm(v) === norm(term)));

  function mark(term) {
    term = clean(term);
    if (!term || has(term)) return;
    setEntries([...entries, { term, variants: [], parent: '' }]);
  }

  function unmark(term) {
    const e = has(term);
    if (!e) return;
    setEntries(entries.filter((x) => x !== e).map((x) => (x.parent && norm(x.parent) === norm(e.term) ? { ...x, parent: '' } : x)));
  }

  // ----- Bloc « Index » -----

  function insert() {
    if (G) {
      const ix = document.createElement('div');
      ix.className = 'ft-index';
      ix.setAttribute('contenteditable', 'false');
      ix.append(...build(occurrences()));
      return G.insertBlock(ix);
    }
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    let node = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (!node || !editor.contains(node)) node = editor.lastChild;
    while (node && node.parentNode && node.parentNode !== editor) node = node.parentNode;
    commit();
    const ix = document.createElement('div');
    ix.className = 'ft-index';
    ix.setAttribute('contenteditable', 'false');
    const empty = node && node.nodeType === Node.ELEMENT_NODE && node.matches('p, div:not(.ft-index):not(.ft-toc):not(.ft-lof):not(.ft-cover)') && !node.textContent.trim() && !node.querySelector('img, .ft-math, .ft-image');
    if (!node) editor.append(ix);
    else if (empty) node.before(ix);
    else node.after(ix);
    let next = ix.nextElementSibling;
    while (next && next.classList.contains('ft-pg-gap')) next = next.nextElementSibling;
    if (!next || next.matches('.ft-footnotes, .ft-endnotes')) {
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      ix.after(next);
    }
    const r = document.createRange();
    r.selectNodeContents(next);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    refresh();
    editor.dispatchEvent(new Event('input'));
  }

  function removeBlock(ix) {
    if (G) return G.edit(() => ix.remove());
    commit();
    ix.remove();
    editor.dispatchEvent(new Event('input'));
  }

  // Clic sur une entrée : occurrence suivante dans le texte.
  const cursor = new Map();
  function onClick(e) {
    const row = e.target.closest && e.target.closest('.ft-index-entry');
    if (!row || !editor.contains(row) || $('app').classList.contains('reading-mode')) return;
    const entry = entries.find((x) => x.term === row.dataset.term);
    if (!entry) return;
    const ranges = occurrences().get(entry) || [];
    if (!ranges.length) return;
    const i = ((cursor.get(entry.term) ?? -1) + 1) % ranges.length;
    cursor.set(entry.term, i);
    show(ranges[i]);
  }
  editor.addEventListener('click', onClick);

  function show(range) {
    if (G) G.show(range.startContainer);
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += range.getBoundingClientRect().top - box.top - box.height / 3;
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ----- Fenêtre « Index » -----

  function paintCounts(found) {
    for (const row of listBox.querySelectorAll('.ix-row')) {
      const e = entries[Number(row.dataset.i)];
      const n = e ? (found.get(e) || []).length : 0;
      const c = row.querySelector('.ix-count');
      const text = n ? `${n} occurrence${n > 1 ? 's' : ''}` : 'absent du texte';
      if (c.textContent !== text) c.textContent = text;
      c.classList.toggle('bad', !n);
    }
  }

  function paint() {
    const tops = entries.filter((e) => !e.parent);
    const rows = entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => compare(a.e.parent ? { term: a.e.parent + ' ' + a.e.term } : a.e, b.e.parent ? { term: b.e.parent + ' ' + b.e.term } : b.e))
      .map(({ e, i }) => {
        const row = document.createElement('div');
        row.className = 'ix-row' + (e.parent ? ' sub' : '');
        row.dataset.i = i;
        const term = Object.assign(document.createElement('input'), { type: 'text', value: e.term, className: 'ix-term', title: 'Entrée telle qu’elle apparaît dans l’index' });
        term.addEventListener('change', () => {
          const v = clean(term.value);
          if (!v || (norm(v) !== norm(e.term) && has(v))) { term.value = e.term; return; }
          const old = e.term;
          setEntries(entries.map((x) => (x === e ? { ...x, term: v } : x.parent && norm(x.parent) === norm(old) ? { ...x, parent: v } : x)));
          paint();
        });
        const variants = Object.assign(document.createElement('input'), { type: 'text', value: e.variants.join(', '), className: 'ix-variants', placeholder: 'Autres formes, séparées par des virgules' });
        variants.addEventListener('change', () => { setEntries(entries.map((x) => (x === e ? { ...x, variants: variants.value.split(',').map(clean).filter(Boolean) } : x))); paint(); });
        const parent = document.createElement('select');
        parent.className = 'ix-parent';
        parent.title = 'Ranger sous une autre entrée';
        parent.append(new Option('Entrée principale', ''));
        for (const t of tops) if (t !== e) parent.append(new Option('Sous « ' + t.term + ' »', t.term));
        parent.value = e.parent;
        parent.disabled = entries.some((x) => x.parent && norm(x.parent) === norm(e.term));
        parent.addEventListener('change', () => { setEntries(entries.map((x) => (x === e ? { ...x, parent: parent.value } : x))); paint(); });
        const count = Object.assign(document.createElement('span'), { className: 'ix-count' });
        const del = Object.assign(document.createElement('button'), { type: 'button', className: 'ix-del', textContent: '×', title: 'Retirer de l’index' });
        del.addEventListener('click', () => { unmark(e.term); paint(); });
        row.append(term, variants, parent, count, del);
        return row;
      });
    listBox.replaceChildren(...rows);
    if (!rows.length) listBox.append(Object.assign(document.createElement('div'), { className: 'ix-empty', textContent: 'Aucun mot marqué.' }));
    refresh();
  }

  function open() {
    if (!window.FTApp || !window.FTApp.currentId()) return;
    const sel = window.getSelection();
    const word = sel.rangeCount && editor.contains(sel.anchorNode) ? wordAt(sel.getRangeAt(0)) : '';
    addInput.value = word && !has(word) ? word : '';
    if (!dialog.open) dialog.show();
    paint();
    addInput.focus();
  }

  function close() {
    dialog.close();
  }
  dialog.addEventListener('close', () => { if (canMark) CSS.highlights.delete('ft-index'); });

  $('ix-add-btn').addEventListener('click', () => {
    const v = clean(addInput.value);
    if (!v) return;
    mark(v);
    addInput.value = '';
    paint();
  });
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('ix-add-btn').click(); } });
  $('ix-insert').addEventListener('click', () => { close(); insert(); });
  $('ix-close').addEventListener('click', close);
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

  // Bouton de la barre d'insertion.
  const btn = $('index-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const sel = window.getSelection();
    const word = sel.rangeCount && editor.contains(sel.anchorNode) ? wordAt(sel.getRangeAt(0)) : '';
    const r = btn.getBoundingClientRect();
    window.FTSidebar.showMenu(r.left, r.bottom + 2, [
      ...(word ? [has(word) ? { text: `Retirer « ${word} » de l’index`, action: () => unmark(word) } : { text: `Marquer « ${word} » pour l’index`, action: () => mark(word) }, '-'] : []),
      { text: 'Mots de l’index…', action: open },
      { text: 'Insérer l’index', action: insert }
    ]);
  });

  window.FTIndex = {
    // Moteur 2.0 : index du nouveau moteur, refait après chaque modification du texte.
    useEngine(mount, api) {
      editor.removeEventListener('click', onClick);
      mount.addEventListener('click', onClick);
      editor = mount;
      G = api;
      api.add(refresh);
    },
    load(settings) {
      entries = sanitize(settings && settings.index);
      cursor.clear();
      if (dialog.open) paint();
      refresh();
    },
    get: () => entries.map((e) => ({ ...e, variants: [...e.variants] })),
    occurrencesIn: (root) => occurrences(root),
    onChange(fn) { onChange = fn; },
    set: setEntries,
    refresh,
    insert,
    open,
    mark,
    unmark,
    // Clic droit dans le texte (structure.js) : marquer le mot cliqué.
    wordItems(x, y) {
      const sel = window.getSelection();
      let range = null;
      if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) &&
          [...sel.getRangeAt(0).getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) range = sel.getRangeAt(0);
      else range = document.caretRangeFromPoint(x, y);
      if (!range || !editor.contains(range.startContainer)) return [];
      const el = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      if (!el || el.closest(SKIP)) return [];
      const word = wordAt(range);
      if (!word || word.length < 2) return [];
      return has(word)
        ? [{ text: 'Retirer de l’index', action: () => unmark(word) }]
        : [{ text: 'Marquer pour l’index', action: () => mark(word) }];
    },
    // Clic droit sur le bloc « Index » (structure.js).
    menuItems(target) {
      const ix = target.closest && target.closest('.ft-index');
      if (!ix || !editor.contains(ix)) return [];
      return [
        { label: 'Index' },
        { text: 'Mots de l’index…', action: open },
        { text: 'Mettre à jour', action: refresh },
        { text: 'Supprimer l’index', danger: true, action: () => removeBlock(ix) }
      ];
    }
  };
})();
