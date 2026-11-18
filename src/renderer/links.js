// Liens : vers un autre document du logiciel (texte écrit entre (( et ))), et liens vers des sites
// (adresses tapées ou collées, ou Ctrl+Maj+L sur un texte sélectionné). Le texte écrit entre (( )) prend
// la couleur des liens ; un double-clic demande le document à lier (fenêtre « Lier à un document »),
// puis l'ouvre. Seuls les liens définis comptent dans la mindmap. Un clic ouvre un lien vers un site ;
// le clic droit permet de modifier ou de retirer un lien.
(function () {
  let editor = document.getElementById('editor');
  let S = () => window.FTStructure;
  // Moteur 2.0 : la frappe (adresses, « ((texte)) ») passe par moteur/ecriture.js ; les clics, menus,
  // Ctrl+Maj+L et le collage agissent sur le texte affiché, relu d'un coup par le moteur (useEngine).
  let engine = false;
  const handlers = [];
  const on = (type, fn, capture) => {
    editor.addEventListener(type, fn, capture);
    handlers.push([type, fn, capture]);
  };
  // Lien refait par le moteur pendant qu'une fenêtre était ouverte : retrouvé à sa place.
  const placeOf = (a) => (engine && window.FTObjets ? window.FTObjets.posOf(a) : null);
  function live(a, pos) {
    if (!a || a.isConnected || pos === null || pos === undefined) return a;
    try { return window.FTMoteur.view.nodeDOM(pos) || a; } catch { return a; }
  }
  const App = () => window.FTApp;
  const showMenu = (...args) => window.FTSidebar.showMenu(...args);

  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const elementOf = (node) => (node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node);

  function caretAt(node, offset) {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Curseur juste après le lien, hors de lui : ce qu'on tape ensuite ne fait pas partie du lien.
  function caretAfter(a) {
    let next = a.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) {
      next = document.createTextNode('');
      a.after(next);
    }
    caretAt(next, 0);
  }

  // Retire le lien et garde son texte.
  function unwrap(a) {
    S().checkpoint();
    const parent = a.parentNode;
    a.replaceWith(...a.childNodes);
    parent.normalize();
    S().changed();
  }

  // ----- Liens vers un autre document -----

  const otherDocs = () => App().docs().filter((d) => d.id !== App().currentId());

  function findDoc(title) {
    const f = fold(title);
    return otherDocs().find((d) => fold(d.title) === f) || null;
  }

  function setTarget(a, doc) {
    if (doc) {
      a.dataset.doc = doc.id;
      a.title = `Lien vers « ${doc.title} » (double-clic : ouvrir ; clic droit : autres choix)`;
    } else {
      delete a.dataset.doc;
      a.title = 'Lien à définir (double-clic : choisir le document)';
    }
  }

  // ----- Fenêtre « Lier à un document » -----

  const dlg = document.getElementById('doclink-dialog');
  const dlgSearch = document.getElementById('doclink-search');
  const dlgList = document.getElementById('doclink-list');
  const dlgWord = document.getElementById('doclink-word');
  const dlgOk = document.getElementById('doclink-ok');
  const dlgNew = document.getElementById('doclink-new');
  let dlgLink = null;
  let dlgChoice = null;

  function link(a, doc) {
    a = live(a, dlgPos);
    S().checkpoint();
    setTarget(a, doc);
    S().changed();
  }

  function renderChoices() {
    const text = dlgLink ? dlgLink.textContent.trim() : '';
    const q = fold(dlgSearch.value);
    const t = fold(text);
    const docs = otherDocs()
      .filter((d) => !q || fold(d.title).includes(q))
      .sort((x, y) => {
        const rank = (d) => (fold(d.title) === t ? 0 : t && fold(d.title).includes(t) ? 1 : 2);
        return rank(x) - rank(y) || x.title.localeCompare(y.title, 'fr');
      });
    if (dlgChoice && !docs.some((d) => d.id === dlgChoice)) dlgChoice = null;
    if (!dlgChoice && docs.length && (q || fold(docs[0].title) === t)) dlgChoice = docs[0].id;
    dlgList.textContent = '';
    docs.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dl-item' + (d.id === dlgChoice ? ' on' : '');
      b.dataset.id = d.id;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(d.id === dlgChoice));
      b.textContent = d.title;
      b.addEventListener('click', () => { dlgChoice = d.id; renderChoices(); });
      b.addEventListener('dblclick', () => { dlgChoice = d.id; confirmChoice(); });
      dlgList.appendChild(b);
    });
    if (!docs.length) {
      const empty = document.createElement('p');
      empty.className = 'dl-empty';
      empty.textContent = otherDocs().length ? 'Aucun document ne correspond.' : 'Aucun autre document dans ce projet.';
      dlgList.appendChild(empty);
    }
    dlgOk.disabled = !dlgChoice;
    const name = dlgSearch.value.trim() || text;
    dlgNew.hidden = !name || !!findDoc(name);
    dlgNew.textContent = `Créer « ${name.length > 32 ? name.slice(0, 31) + '…' : name} »`;
    const cur = dlgList.querySelector('.dl-item.on');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  let dlgPos = null;
  function chooseDoc(a) {
    dlgLink = a;
    dlgPos = placeOf(a);
    dlgChoice = a.dataset.doc && App().docs().some((d) => d.id === a.dataset.doc) ? a.dataset.doc : null;
    dlgWord.textContent = `« ${a.textContent.trim()} »`;
    dlgSearch.value = '';
    renderChoices();
    dlg.showModal();
    dlgSearch.focus();
  }

  function confirmChoice() {
    const doc = dlgChoice && App().docs().find((d) => d.id === dlgChoice);
    if (!doc || !dlgLink) return;
    link(dlgLink, doc);
    dlg.close();
  }

  dlgSearch.addEventListener('input', () => { dlgChoice = null; renderChoices(); });
  dlgSearch.addEventListener('keydown', (e) => {
    const items = [...dlgList.querySelectorAll('.dl-item')];
    const i = items.findIndex((b) => b.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { dlgChoice = next.dataset.id; renderChoices(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmChoice();
    }
  });
  dlgOk.addEventListener('click', confirmChoice);
  document.getElementById('doclink-cancel').addEventListener('click', () => dlg.close());
  dlgNew.addEventListener('click', async () => {
    const a = dlgLink;
    const name = dlgSearch.value.trim() || a.textContent.trim();
    dlg.close();
    const id = await App().createDoc(name);
    link(a, App().docs().find((d) => d.id === id));
  });
  dlg.addEventListener('close', () => { dlgLink = null; });

  // Double-clic : ouvre le document lié, ou demande lequel lier.
  function followDocLink(a) {
    const id = a.dataset.doc;
    if (id && App().docs().some((d) => d.id === id)) return App().openDocById(id);
    chooseDoc(a);
  }

  // Le lien vers un document forme un tout (comme un mot).
  function docLinkElement(text) {
    const a = document.createElement('a');
    a.className = 'ft-doclink';
    a.setAttribute('contenteditable', 'false');
    a.textContent = text;
    return a;
  }

  async function renameDocLink(a) {
    const pos = placeOf(a);
    const text = await App().ask('Texte du lien :', a.textContent, { maxLength: 200 });
    if (!text) return;
    a = live(a, pos);
    S().checkpoint();
    a.textContent = text;
    S().changed();
  }

  // « ((texte)) » : à la frappe de la deuxième parenthèse fermante, le texte devient un lien à définir.
  function typedDocLink() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const el = node.parentElement;
    if (!el || el.closest('a, .ft-caption, .ft-math, .ft-footnotes')) return;
    const before = node.data.slice(0, offset);
    if (!before.endsWith('))')) return;
    const start = before.lastIndexOf('((', before.length - 3);
    if (start < 0) return;
    const inner = before.slice(start + 2, -2);
    if (!inner.trim() || inner.length > 150 || /\(\(|\)\)|\n/.test(inner)) return;
    S().checkpoint();
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, offset);
    range.deleteContents();
    const a = docLinkElement(inner.trim());
    setTarget(a, null);
    range.insertNode(a);
    caretAfter(a);
    S().changed();
  }

  // ----- Liens vers des sites -----

  const URL_END = /(?:https?:\/\/|www\.)[^\s<>"«»]+$/i;
  const TRAILING = /[.,;:!?)\]»'"]+$/;

  function hrefOf(text) {
    const t = text.trim();
    if (/^(https?:\/\/|mailto:)/i.test(t)) return t;
    if (/^www\.[^\s]+\.[^\s]+$/i.test(t)) return 'https://' + t;
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return 'mailto:' + t;
    return null;
  }

  function makeWebLink(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.title = href + ' (clic : ouvrir dans le navigateur)';
    return a;
  }

  // Adresse tapée juste avant le curseur : elle devient un lien (à l'espace ou au retour à la ligne).
  function linkifyBeforeCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const el = node.parentElement;
    if (!el || el.closest('a, .ft-math, .ft-caption')) return false;
    const before = node.data.slice(0, sel.anchorOffset);
    const m = URL_END.exec(before);
    if (!m) return false;
    let word = m[0].replace(TRAILING, '');
    // La majuscule automatique a pu toucher l'adresse en début de phrase (« Https:// »).
    const fixed = word.replace(/^(Https?:\/\/|Www\.)/, (x) => x.toLowerCase());
    const href = hrefOf(fixed);
    if (!href || word.length < 8) return false;
    S().checkpoint();
    const range = document.createRange();
    range.setStart(node, m.index);
    range.setEnd(node, m.index + word.length);
    range.deleteContents();
    const a = makeWebLink(href, fixed);
    range.insertNode(a);
    // Le curseur revient à sa place (après une éventuelle ponctuation laissée hors du lien).
    const rest = a.nextSibling;
    if (rest && rest.nodeType === Node.TEXT_NODE) caretAt(rest, before.length - m.index - word.length);
    else caretAfter(a);
    return true;
  }

  async function editWebLink(a) {
    const pos = placeOf(a);
    const href = await App().ask('Adresse du lien (par exemple https://exemple.fr) :', a.getAttribute('href') || '', { maxLength: 2000 });
    if (href === null) return;
    a = live(a, pos);
    const value = hrefOf(href) || (href ? 'https://' + href.replace(/^\/+/, '') : '');
    S().checkpoint();
    if (!value) {
      a.replaceWith(...a.childNodes);
    } else {
      a.href = value;
      a.title = value + ' (clic : ouvrir dans le navigateur)';
    }
    S().changed();
  }

  // Ctrl+Maj+L ou clic droit sur une sélection : le texte sélectionné devient un lien.
  async function linkSelection(range) {
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    const text = range.toString().trim();
    const guess = hrefOf(text) || '';
    const href = await App().ask('Adresse du lien (par exemple https://exemple.fr) :', guess, { maxLength: 2000 });
    if (!href) return;
    const value = hrefOf(href) || 'https://' + href.replace(/^\/+/, '');
    S().checkpoint();
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range.collapsed) {
      sel.addRange(range);
      const a = makeWebLink(value, href);
      range.insertNode(a);
      caretAfter(a);
    } else {
      sel.addRange(range);
      document.execCommand('createLink', false, value);
      editor.querySelectorAll(`a[href="${CSS.escape(value)}"]:not([title])`).forEach((a) => {
        a.title = value + ' (clic : ouvrir dans le navigateur)';
      });
    }
    S().changed();
  }

  // ----- Fenêtre « Lien » : une adresse placée sur le mot ou la phrase choisis -----
  // Outil « Lien » de la barre d'insertion, mini-barre, Ctrl+Maj+L, clic droit (« Créer un lien… »,
  // « Modifier le lien… »). Texte affiché et adresse ; un lien existant se modifie ou se retire.

  const $ = (id) => document.getElementById(id);
  const wlDialog = $('weblink-dialog');
  let wlDone = null;
  const SCHEMES = /^(https?|mailto|tel|ftp):/i;

  // Adresse écrite → adresse du lien (null : pas une adresse utilisable).
  function normalizeHref(raw) {
    const t = raw.trim();
    if (!t || /\s/.test(t)) return null;
    const known = hrefOf(t);
    if (known) return known;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return SCHEMES.test(t) ? t : null;
    return /\./.test(t) ? 'https://' + t.replace(/^\/+/, '') : null;
  }

  function closeLink(value) {
    const done = wlDone;
    wlDone = null;
    if (wlDialog.open) wlDialog.close();
    if (done) done(value);
  }
  function confirmLink() {
    const raw = $('wl-href').value;
    const href = normalizeHref(raw);
    if (!href) {
      const err = $('wl-error');
      err.textContent = raw.trim() ? 'Adresse non reconnue : par exemple https://exemple.fr ou nom@exemple.fr.' : "Indiquez l'adresse du lien.";
      err.hidden = false;
      $('wl-href').focus();
      return;
    }
    closeLink({ text: $('wl-text').value, href });
  }
  $('wl-ok').addEventListener('click', confirmLink);
  $('wl-cancel').addEventListener('click', () => closeLink(null));
  $('wl-remove').addEventListener('click', () => closeLink('remove'));
  wlDialog.addEventListener('cancel', (e) => { e.preventDefault(); closeLink(null); });
  wlDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); confirmLink(); }
  });
  $('wl-href').addEventListener('input', () => { $('wl-error').hidden = true; });

  function askLink({ text, href, existing, textLocked }) {
    return new Promise((resolve) => {
      if (wlDone) closeLink(null);
      wlDone = resolve;
      $('wl-text').value = text;
      $('wl-text').disabled = !!textLocked;
      $('wl-text').title = textLocked ? 'Le passage choisi contient autre chose que du texte : il reste tel quel.' : '';
      $('wl-href').value = href;
      $('wl-remove').hidden = !existing;
      $('wl-ok').textContent = existing ? 'Modifier' : 'Créer le lien';
      $('wl-error').hidden = true;
      wlDialog.showModal();
      const field = text || textLocked ? $('wl-href') : $('wl-text');
      field.focus();
      field.select();
    });
  }

  // Lien (marque du moteur) autour de la sélection : { from, to, mark }.
  function linkRun(state) {
    const type = state.schema.marks.link;
    const { $from, $to, empty } = state.selection;
    if (!type || $from.parent !== $to.parent || !$from.parent.isTextblock) return null;
    const start = $from.start();
    const runs = [];
    let cur = null;
    $from.parent.forEach((child, offset) => {
      const m = type.isInSet(child.marks);
      const a = start + offset;
      if (m && cur && cur.mark.eq(m) && cur.to === a) cur.to = a + child.nodeSize;
      else {
        cur = m ? { mark: m, from: a, to: a + child.nodeSize } : null;
        if (cur) runs.push(cur);
      }
    });
    return runs.find((r) => r.from <= $from.pos && $to.pos <= r.to && !(empty && $from.pos === r.from)) || null;
  }

  async function openLinkDialog() {
    const M = window.FTMoteur;
    if (!engine || !M) {
      const sel = window.getSelection();
      const a = sel.anchorNode && elementOf(sel.anchorNode).closest('#editor a[href]');
      if (a) return editWebLink(a);
      return linkSelection(sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null);
    }
    const v = M.view;
    const state = v.state;
    const type = state.schema.marks.link;
    const run = linkRun(state);
    let { from, to } = run || state.selection;
    // Sélection sur plusieurs lignes : le lien va jusqu'à la fin de la première.
    const $from = state.doc.resolve(from);
    if (!run && !$from.parent.isTextblock) return;
    if (!run && to > $from.end()) to = $from.end();
    let objects = false;
    state.doc.nodesBetween(from, to, (n) => { if (n.isInline && !n.isText) objects = true; });
    const text = state.doc.textBetween(from, to, ' ', '');
    const href = run ? run.mark.attrs.a.href || '' : (hrefOf(text) || '');
    const doc = state.doc;
    const res = await askLink({ text: objects ? text.replace(/\s+/g, ' ') : text, href, existing: !!run, textLocked: objects });
    v.focus();
    if (!res || v.state.doc !== doc) return;
    const tr = v.state.tr;
    if (res === 'remove') {
      tr.removeMark(from, to, type);
    } else {
      const mark = type.create({ tag: 'a', a: { href: res.href, title: res.href + ' (clic : ouvrir dans le navigateur)' } });
      const wanted = res.text.trim() ? res.text : res.href.replace(/^mailto:/i, '');
      if (!objects && (from === to || wanted !== text)) {
        const first = doc.nodeAt(from);
        const marks = type.removeFromSet(first && first.isText && from < to ? first.marks : doc.resolve(from).marks());
        // (Espaces autour du texte : hors du lien.)
        const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(wanted);
        const parts = [lead && state.schema.text(lead, marks), state.schema.text(core, mark.addToSet(marks)), trail && state.schema.text(trail, marks)].filter(Boolean);
        tr.replaceWith(from, to, parts);
        to = from + wanted.length;
      } else {
        tr.removeMark(from, to, type);
        tr.addMark(from, to, mark);
      }
      tr.setSelection(PM.state.TextSelection.create(tr.doc, to));
      tr.removeStoredMark(type);
    }
    v.dispatch(PM.history.closeHistory(tr).scrollIntoView());
    if (M.closeHistory) M.closeHistory();
  }
  const linkTool = $('weblink-btn');
  if (linkTool) {
    linkTool.addEventListener('mousedown', (e) => e.preventDefault());
    linkTool.addEventListener('click', () => openLinkDialog());
  }

  // ----- Événements -----

  editor.addEventListener('input', (e) => {
    if (e.inputType !== 'insertText') return;
    if (e.data === ')') return typedDocLink();
    // L'espace insécable mise juste après un lien redevient une espace ordinaire dès qu'un mot suit.
    const sel = window.getSelection();
    const t = sel.anchorNode;
    if (t && t.nodeType === Node.TEXT_NODE && /^\u00a0\S/.test(t.data) && t.previousSibling && t.previousSibling.nodeName === 'A') {
      const offset = sel.anchorOffset;
      t.replaceData(0, 1, ' ');
      caretAt(t, offset);
    }
  });

  // Le curseur est-il juste à la fin d'un lien ? (le navigateur y ajouterait la frappe, dans le lien)
  function linkEndingAt(sel) {
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    let before = null;
    if (node.nodeType === Node.TEXT_NODE) {
      if (offset === 0) before = node.previousSibling;
      else if (offset === node.length) {
        const a = node.parentElement && node.parentElement.closest('#editor a');
        if (a) {
          const end = document.createRange();
          end.setStart(node, offset);
          end.setEnd(a, a.childNodes.length);
          return end.toString() === '' ? a : null;
        }
      }
    } else {
      before = node.childNodes[offset - 1];
    }
    return before && before.nodeType === Node.ELEMENT_NODE && before.matches('#editor a') ? before : null;
  }

  editor.addEventListener('beforeinput', (e) => {
    if ((e.inputType === 'insertText' && /^\s$/.test(e.data || '')) || e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      linkifyBeforeCaret();
    }
    if (e.inputType !== 'insertText' || !e.data) return;
    // Ce qu'on tape juste après un lien n'en fait pas partie.
    const a = linkEndingAt(window.getSelection());
    if (!a) return;
    e.preventDefault();
    let t = a.nextSibling;
    if (!t || t.nodeType !== Node.TEXT_NODE) {
      t = document.createTextNode('');
      a.after(t);
    }
    // Une espace en fin de ligne serait avalée par le navigateur : espace insécable à la place.
    const data = e.data === ' ' && (!t.data || /^\s/.test(t.data)) ? '\u00a0' : e.data;
    t.insertData(0, data);
    caretAt(t, data.length);
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data }));
  });

  on('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openLinkDialog();
    }
  });

  // Une adresse collée sur un texte sélectionné en fait un lien ; collée seule, elle devient un lien.
  on('paste', (e) => {
    const cd = e.clipboardData;
    const text = cd && (cd.getData('text/plain') || '').trim();
    if (!text || /\s/.test(text) || cd.files.length) return;
    const href = /^(https?:\/\/|www\.)/i.test(text) ? hrefOf(text) : null;
    if (!href) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode) || elementOf(sel.anchorNode).closest('a, .ft-caption, .ft-math')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    S().checkpoint();
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const a = makeWebLink(href, text);
      range.insertNode(a);
      caretAfter(a);
    } else {
      document.execCommand('createLink', false, href);
    }
    S().changed();
  }, true);

  // Un clic ouvre le lien (sauf si on était en train de sélectionner du texte).
  on('click', (e) => {
    if (e.button !== 0 || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('#editor a');
    if (!a || !window.getSelection().isCollapsed) return;
    e.preventDefault();
    // Lien vers un document : double-clic (ou Ctrl+clic).
    if (a.classList.contains('ft-doclink')) { if (e.ctrlKey || e.metaKey) followDocLink(a); }
    else if (/^(https?|mailto):/i.test(a.getAttribute('href') || '')) window.open(a.href);
  });

  on('dblclick', (e) => {
    const a = e.target.closest && e.target.closest('#editor a.ft-doclink');
    if (!a) return;
    e.preventDefault();
    window.getSelection().collapseToEnd();
    followDocLink(a);
  });

  // Clic droit > « Modifier le lien… » : le curseur va dans le lien, puis la fenêtre « Lien ».
  function editLinkAt(a) {
    if (!engine || !window.FTMoteur) return editWebLink(a);
    const v = window.FTMoteur.view;
    try {
      const pos = v.posAtDOM(a, 0) + 1;
      v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, Math.min(pos, v.state.doc.content.size))));
    } catch { /* lien hors de l'affichage */ }
    openLinkDialog();
  }

  function linkMenu(a) {
    if (a.classList.contains('ft-doclink')) {
      const doc = a.dataset.doc && App().docs().find((d) => d.id === a.dataset.doc);
      return [
        doc ? { text: `Ouvrir « ${doc.title} »`, action: () => App().openDocById(doc.id) } : { label: 'Lien à définir' },
        { text: doc ? 'Lier à un autre document…' : 'Lier à un document…', action: () => chooseDoc(a) },
        { text: 'Modifier le texte du lien…', action: () => renameDocLink(a) },
        '-',
        { text: 'Retirer le lien (garder le texte)', action: () => unwrap(a) }
      ];
    }
    const href = a.getAttribute('href') || '';
    return [
      { text: 'Ouvrir le lien', action: () => window.open(a.href) },
      { text: 'Modifier le lien…', action: () => editLinkAt(a) },
      { text: "Copier l'adresse", action: () => navigator.clipboard.writeText(href) },
      '-',
      { text: 'Supprimer le lien hypertexte', action: () => unwrap(a) }
    ];
  }

  // Avant le menu du texte : les choix du lien, puis le reste.
  on('contextmenu', (e) => {
    const a = e.target.closest && e.target.closest('#editor a');
    if (!a) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showMenu(e.clientX, e.clientY, [...linkMenu(a), '-', ...S().insertItems(e.clientX, e.clientY)]);
  }, true);

  // Entrée du clic droit sur un texte sélectionné (structure.js).
  function selectionItems() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) return [];
    const range = sel.getRangeAt(0).cloneRange();
    return [{ text: 'Créer un lien…', action: () => (engine ? openLinkDialog() : linkSelection(range)) }];
  }

  // Document ouvert : la bulle d'aide de ses liens suit le titre actuel des documents.
  function refresh() {
    if (!App()) return;
    editor.querySelectorAll('a.ft-doclink').forEach((a) => a.setAttribute('contenteditable', 'false'));
    editor.querySelectorAll('a.ft-doclink[data-doc]').forEach((a) => {
      const doc = App().docs().find((d) => d.id === a.dataset.doc);
      a.title = doc ? `Lien vers « ${doc.title} » (double-clic : ouvrir ; clic droit : autres choix)` : 'Document introuvable (double-clic : choisir le document)';
    });
    editor.querySelectorAll('a.ft-doclink:not([data-doc])').forEach((a) => { a.title = 'Lien à définir (double-clic : choisir le document)'; });
  }

  // Pour moteur/ecriture.js : adresse tapée juste avant le curseur ({ index, word, text, href }), et lien
  // vers un document à définir (HTML) pour « ((texte)) ».
  function urlBefore(before) {
    const m = URL_END.exec(before);
    if (!m) return null;
    const word = m[0].replace(TRAILING, '');
    const text = word.replace(/^(Https?:\/\/|Www\.)/, (x) => x.toLowerCase());
    const href = hrefOf(text);
    return href && word.length >= 8 ? { index: m.index, word, text, href, title: href + ' (clic : ouvrir dans le navigateur)' } : null;
  }
  function docLinkHtml(text) {
    const a = docLinkElement(text);
    setTarget(a, null);
    return a.outerHTML;
  }

  window.FTLinks = {
    openLinkDialog,
    selectionItems,
    refresh,
    urlBefore,
    docLinkHtml,
    useEngine(mount, bridge) {
      editor = mount;
      S = () => bridge;
      engine = true;
      for (const [type, fn, capture] of handlers) mount.addEventListener(type, fn, capture);
    }
  };
})();
