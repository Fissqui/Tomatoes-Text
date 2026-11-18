// Commentaires en marge, comme dans Word.
// Le passage commenté est entouré dans le texte par span.ft-comment[data-c="<id>"] (plusieurs span si
// le passage couvre plusieurs paragraphes). Les fils de discussion sont gardés dans les réglages du
// document (settings.comments) : { id, author, date, text, done, replies: [{ author, date, text }] }.
// Les bulles sont posées à droite de la page, à la hauteur de leur passage, qui est surligné (sans
// toucher au texte). Répondre, Résoudre (la bulle disparaît, « Commentaires résolus » la remontre),
// Modifier, Supprimer. Export Word : vrais commentaires Word, réponses et commentaires résolus compris.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.frameText;
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js). Les passages sont posés et retirés par son
  // pont (une étape d'annulation) ; un passage loin de l'écran (caché) est placé d'après sa hauteur prévue.
  let G = null;
  const viaEngine = (fn) => (G ? G.edit(fn) : fn());
  const page = $('page');
  const workspace = $('workspace');
  const app = $('app');
  const layer = document.createElement('div');
  layer.id = 'cm-layer';
  page.appendChild(layer);

  const MAX_TEXT = 4000;
  const canMark = !!(window.CSS && CSS.highlights && window.Highlight);

  let threads = [];      // tous les fils connus pendant la session (un fil sans passage reste pour Annuler)
  let author = '';
  let saveAuthor = () => {};
  let showDone = false;
  let hidden = false;
  let active = null;     // id du fil actif
  let editing = null;    // { id, kind: 'new' | 'edit' | 'reply' }
  let onChange = () => {};
  const removed = new Map(); // fils supprimés pendant la session (Annuler peut remettre leur passage)

  const clean = (s) => String(s || '').replace(/\r/g, '').trim().slice(0, MAX_TEXT);
  const now = () => new Date().toISOString();
  const byId = (id) => threads.find((t) => t.id === id);
  const commit = () => { if (window.FTHistory) window.FTHistory.commit(); };
  const changed = () => { onChange(threads); editor.dispatchEvent(new Event('input')); };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const msg = (m) => (m && typeof m === 'object' ? { author: clean(m.author).slice(0, 60) || 'Auteur', date: typeof m.date === 'string' ? m.date : '', text: clean(m.text) } : null);
    return list.filter((t) => t && typeof t.id === 'string' && /^[\w-]{1,40}$/.test(t.id) && !seen.has(t.id) && seen.add(t.id))
      .map((t) => ({ id: t.id, ...msg(t), done: !!t.done, replies: Array.isArray(t.replies) ? t.replies.map(msg).filter((r) => r && r.text).slice(0, 200) : [] }));
  }

  // Les passages de chaque fil, dans l'ordre du texte.
  function anchors() {
    const map = new Map();
    for (const span of editor.querySelectorAll('span.ft-comment[data-c]')) {
      const id = span.dataset.c;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(span);
    }
    return map;
  }

  // Les fils à montrer, dans l'ordre de leur passage.
  function shown(map = anchors()) {
    if (hidden || app.classList.contains('reading-mode')) return [];
    return [...map.keys()].map(byId).filter((t) => t && (showDone || !t.done || (editing && editing.id === t.id)));
  }

  // ----- Nom de l'auteur -----

  const initials = (name) => (name.match(/\p{L}+/gu) || ['?']).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const hue = (name) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  async function askAuthor() {
    const name = await window.FTApp.ask('Nom affiché sur vos commentaires', author, { okLabel: 'Enregistrer', maxLength: 60 });
    if (name === null) return;
    author = name.trim().slice(0, 60) || author;
    saveAuthor(author);
  }

  // ----- Passage commenté -----

  // Les morceaux de texte modifiables de la plage (hors plan, index, renvois…).
  function textPieces(range) {
    const out = [];
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.currentNode.nodeType === Node.TEXT_NODE ? walker.currentNode : walker.nextNode(); n; n = walker.nextNode()) {
      if (!range.intersectsNode(n)) continue;
      const el = n.parentElement;
      if (!el || !editor.contains(el) || !el.isContentEditable || el.closest('.ft-pg-gap')) continue;
      const a = n === range.startContainer ? range.startOffset : 0;
      const b = n === range.endContainer ? range.endOffset : n.data.length;
      if (b > a && n.data.slice(a, b).trim()) out.push({ n, a, b });
    }
    return out;
  }

  function wordRange(range) {
    const n = range.startContainer;
    if (n.nodeType !== Node.TEXT_NODE) return null;
    const isW = (c) => /[\p{L}\p{N}'’-]/u.test(c);
    let a = range.startOffset;
    let b = range.startOffset;
    while (a > 0 && isW(n.data[a - 1])) a--;
    while (b < n.data.length && isW(n.data[b])) b++;
    if (a === b) return null;
    const r = document.createRange();
    r.setStart(n, a);
    r.setEnd(n, b);
    return r;
  }

  function wrap(range, id) {
    const pieces = textPieces(range);
    for (const { n, a, b } of pieces) {
      let node = n;
      if (b < node.data.length) node.splitText(b);
      if (a > 0) node = node.splitText(a);
      const span = document.createElement('span');
      span.className = 'ft-comment';
      span.dataset.c = id;
      node.replaceWith(span);
      span.appendChild(node);
    }
    return pieces.length;
  }

  function unwrap(id) {
    for (const span of editor.querySelectorAll(`span.ft-comment[data-c="${CSS.escape(id)}"]`)) {
      const parent = span.parentNode;
      span.replaceWith(...span.childNodes);
      parent.normalize();
    }
  }

  // ----- Actions -----

  function add() {
    if (!window.FTApp || !window.FTApp.currentId() || app.classList.contains('reading-mode')) return false;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return false;
    let range = sel.getRangeAt(0);
    if (range.collapsed) range = wordRange(range);
    if (!range || !textPieces(range).length) {
      window.FTSidebar.showMenu(innerWidth / 2 - 140, 120, [{ explain: 'Sélectionnez le passage à commenter (ou placez le curseur dans un mot).' }]);
      return false;
    }
    commit();
    const id = newId();
    viaEngine(() => wrap(range, id));
    threads.push({ id, author: author || 'Auteur', date: now(), text: '', done: false, replies: [] });
    hidden = false;
    active = id;
    editing = { id, kind: 'new' };
    sel.removeAllRanges();
    build();
    changed();
    return true;
  }

  function remove(id) {
    if (editing && editing.id === id) editing = null;
    commit();
    viaEngine(() => unwrap(id));
    const t = byId(id);
    if (t && t.text) removed.set(id, t);
    threads = threads.filter((x) => x.id !== id);
    if (active === id) active = null;
    build();
    changed();
  }

  function setDone(id, done) {
    const t = byId(id);
    if (!t) return;
    t.done = done;
    if (done && active === id) active = null;
    build();
    changed();
  }

  function publish(id, kind, text) {
    const t = byId(id);
    text = clean(text);
    editing = null;
    if (!t) return build();
    if (kind === 'new') {
      if (!text) return remove(id);
      t.text = text;
      t.date = now();
    } else if (kind === 'edit') {
      if (text) t.text = text;
    } else if (kind === 'reply' && text) {
      t.replies.push({ author: author || 'Auteur', date: now(), text });
      t.done = false;
    }
    build();
    changed();
  }

  function cancel(id, kind) {
    editing = null;
    if (kind === 'new') {
      // Commentaire jamais écrit : le passage redevient normal, sans trace dans l'historique.
      viaEngine(() => unwrap(id));
      threads = threads.filter((t) => t.id !== id);
      active = null;
      changed();
    }
    build();
  }

  function selectAnchor(id) {
    const spans = anchors().get(id);
    if (!spans) return;
    if (G) G.show(spans[0]);
    const box = workspace.getBoundingClientRect();
    const r = spans[0].getBoundingClientRect();
    if (r.top < box.top + 40 || r.bottom > box.bottom - 40) workspace.scrollTop += r.top - box.top - box.height / 3;
  }

  function activate(id, scroll) {
    if (active === id) return;
    active = id;
    for (const c of layer.children) c.classList.toggle('active', c.dataset.c === id);
    paintMarks();
    place();
    if (scroll && id) selectAnchor(id);
  }

  // ----- Bulles -----

  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : fmt.format(d); };

  function head(m) {
    const h = document.createElement('div');
    h.className = 'cm-head';
    const av = Object.assign(document.createElement('span'), { className: 'cm-avatar', textContent: initials(m.author) });
    av.style.setProperty('--cm-hue', hue(m.author));
    const who = Object.assign(document.createElement('span'), { className: 'cm-who', textContent: m.author });
    const date = Object.assign(document.createElement('span'), { className: 'cm-date', textContent: when(m.date) });
    h.append(av, who, date);
    return h;
  }

  function editorBox(t, kind) {
    const box = document.createElement('div');
    box.className = 'cm-edit';
    const area = Object.assign(document.createElement('textarea'), {
      className: 'cm-input',
      rows: 2,
      maxLength: MAX_TEXT,
      placeholder: kind === 'reply' ? 'Répondre…' : 'Écrire un commentaire…',
      value: kind === 'edit' ? t.text : ''
    });
    area.spellcheck = true;
    const fit = () => { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight + 2, 260) + 'px'; place(); };
    area.addEventListener('input', fit);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); publish(t.id, kind, area.value); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(t.id, kind); }
    });
    const acts = document.createElement('div');
    acts.className = 'cm-acts';
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'primary cm-ok', textContent: kind === 'edit' ? 'Enregistrer' : 'Publier', title: 'Ctrl+Entrée' });
    ok.addEventListener('click', () => publish(t.id, kind, area.value));
    const no = Object.assign(document.createElement('button'), { type: 'button', className: 'cm-cancel', textContent: 'Annuler', title: 'Échap' });
    no.addEventListener('click', () => cancel(t.id, kind));
    acts.append(no, ok);
    box.append(area, acts);
    requestAnimationFrame(() => { fit(); area.focus({ preventScroll: true }); if (kind === 'edit') area.setSelectionRange(area.value.length, area.value.length); });
    return box;
  }

  function card(t) {
    const c = document.createElement('div');
    c.className = 'cm-card' + (t.done ? ' done' : '') + (t.id === active ? ' active' : '');
    c.dataset.c = t.id;
    const isEditing = (kind) => editing && editing.id === t.id && editing.kind === kind;
    c.append(head(t));
    if (isEditing('new') || isEditing('edit')) c.append(editorBox(t, editing.kind));
    else c.append(Object.assign(document.createElement('div'), { className: 'cm-text', textContent: t.text }));
    for (const r of t.replies) {
      const rep = document.createElement('div');
      rep.className = 'cm-reply';
      rep.append(head(r), Object.assign(document.createElement('div'), { className: 'cm-text', textContent: r.text }));
      c.append(rep);
    }
    if (isEditing('reply')) c.append(editorBox(t, 'reply'));
    else if (!isEditing('new') && !isEditing('edit')) {
      const bar = document.createElement('div');
      bar.className = 'cm-bar';
      const btn = (text, title, fn, cls = '') => {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text, title, className: cls });
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
        return b;
      };
      if (!t.done) bar.append(btn('Répondre', 'Répondre à ce commentaire', () => { editing = { id: t.id, kind: 'reply' }; active = t.id; build(); }));
      bar.append(btn(t.done ? 'Rouvrir' : 'Résoudre', t.done ? 'Rouvrir la discussion' : 'Marquer comme résolu : la bulle est masquée', () => setDone(t.id, !t.done)));
      bar.append(btn('⋯', 'Plus d’actions', (e) => {
        const r = e.target.getBoundingClientRect();
        window.FTSidebar.showMenu(r.left, r.bottom + 2, [
          { text: 'Modifier', action: () => { editing = { id: t.id, kind: 'edit' }; active = t.id; build(); } },
          { text: 'Supprimer le commentaire', danger: true, action: () => remove(t.id) }
        ]);
      }, 'cm-more'));
      c.append(bar);
    }
    c.addEventListener('mousedown', (e) => { if (!e.target.closest('textarea, button')) e.preventDefault(); });
    c.addEventListener('click', (e) => { if (!e.target.closest('textarea, button')) activate(t.id, true); });
    return c;
  }

  // Refait les bulles (après un changement des commentaires eux-mêmes).
  function build() {
    const map = anchors();
    const list = shown(map);
    if (active && !list.some((t) => t.id === active)) active = null;
    layer.replaceChildren(...list.map(card));
    workspace.classList.toggle('with-comments', list.length > 0);
    paintMarks(map);
    place(map);
  }

  // Place les bulles à la hauteur de leur passage, sans qu'elles se chevauchent.
  function place(map = anchors()) {
    const cards = [...layer.children];
    if (!cards.length) return;
    const top0 = page.getBoundingClientRect().top;
    const z = page.currentCSSZoom || 1; // zoom de la page (zoom.js)
    // Fenêtre étroite (en mode avancé, la page garde sa largeur) : les bulles prennent la place qui reste
    // à droite de la page, au lieu d'être coupées par le bord de la fenêtre.
    const inner = workspace.getBoundingClientRect().right - (workspace.offsetWidth - workspace.clientWidth);
    const room = (inner - page.getBoundingClientRect().right) / z - 18 - 12;
    const width = Math.round(Math.max(190, Math.min(290, room))) + 'px';
    if (layer.style.width !== width) layer.style.width = width;
    const want = cards.map((c) => {
      const spans = map.get(c.dataset.c);
      const r = spans && spans[0].getClientRects()[0];
      const top = r ? r.top : spans && G ? G.topOf(spans[0]) : null;
      return top !== null && top !== undefined ? (top - top0) / z - 6 : 0;
    });
    // La bulle active reste en face de son passage ; les autres se rangent autour.
    const k = Math.max(0, cards.findIndex((c) => c.dataset.c === active));
    const tops = new Array(cards.length);
    tops[k] = Math.max(0, want[k]);
    for (let i = k + 1; i < cards.length; i++) tops[i] = Math.max(want[i], tops[i - 1] + cards[i - 1].offsetHeight + 8);
    for (let i = k - 1; i >= 0; i--) tops[i] = Math.min(want[i], tops[i + 1] - cards[i].offsetHeight - 8);
    // Rien au-dessus du haut de la page : on redescend tout ce qu'il faut.
    for (let i = 0; i < cards.length; i++) {
      const min = i ? tops[i - 1] + cards[i - 1].offsetHeight + 8 : 0;
      if (tops[i] < min) tops[i] = min;
    }
    cards.forEach((c, i) => { const v = Math.round(tops[i]) + 'px'; if (c.style.top !== v) c.style.top = v; });
  }

  function paintMarks(map = anchors()) {
    if (!canMark) return;
    const all = [];
    const act = [];
    const list = shown(map);
    for (const t of list) {
      for (const span of map.get(t.id)) {
        const r = document.createRange();
        r.selectNodeContents(span);
        (t.id === active ? act : all).push(r);
      }
    }
    CSS.highlights.set('ft-comment', new Highlight(...all));
    CSS.highlights.set('ft-comment-active', new Highlight(...act));
  }

  // ----- Suivre le texte -----

  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(sync, 150); };
  // Un passage supprimé ou rétabli (Annuler) : les bulles suivent.
  function sync() {
    const map = anchors();
    for (const id of map.keys()) if (!byId(id) && removed.has(id)) threads.push(removed.get(id));
    const ids = shown(map).map((t) => t.id).join();
    const now = [...layer.children].map((c) => c.dataset.c).join();
    if (ids !== now) build();
    else { paintMarks(map); place(map); }
  }
  editor.addEventListener('input', later);
  const onClick = (e) => {
    const span = e.target.closest && e.target.closest('span.ft-comment[data-c]');
    if (!span || app.classList.contains('reading-mode')) return;
    const t = byId(span.dataset.c);
    if (!t || (t.done && !showDone)) return;
    if (hidden) { hidden = false; build(); }
    activate(t.id, false);
  };
  document.addEventListener('ft-paginated', () => { if (layer.childElementCount) place(); });
  new ResizeObserver(() => { if (layer.childElementCount) place(); }).observe(page);

  // Curseur dans un passage commenté : sa bulle devient active.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode) || !layer.childElementCount) return;
    const el = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    const span = el && el.closest('span.ft-comment[data-c]');
    const id = span && [...layer.children].some((c) => c.dataset.c === span.dataset.c) ? span.dataset.c : null;
    if (id && id !== active) activate(id, false);
  });

  let pendingSpace = null;
  editor.addEventListener('input', () => {
    const p = pendingSpace;
    if (!p) return;
    const d = p.node.data;
    if (!p.node.isConnected || d[p.i] !== '\u00a0') { pendingSpace = null; return; }
    const prev = p.i > 0 ? d[p.i - 1] : (p.node.previousSibling ? p.node.previousSibling.textContent.slice(-1) : '');
    const next = d[p.i + 1];
    if (next === undefined || /\s/.test(next)) return;
    pendingSpace = null;
    if (prev && !/\s/.test(prev)) p.node.replaceData(p.i, 1, ' ');
  });

  // Écrire juste après (ou juste avant) un passage commenté ne l'allonge pas.
  editor.addEventListener('beforeinput', (e) => {
    if (e.defaultPrevented || e.inputType !== 'insertText' || !e.data || e.isComposing) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== Node.TEXT_NODE) return;
    let span = n.parentElement && n.parentElement.closest('span.ft-comment');
    if (!span || !editor.contains(span)) return;
    const edge = (s, end) => {
      const r = document.createRange();
      r.selectNodeContents(s);
      if (end) r.setStart(n, sel.anchorOffset); else r.setEnd(n, sel.anchorOffset);
      return r.toString() === '';
    };
    const atEnd = edge(span, true);
    const atStart = !atEnd && edge(span, false);
    if (!atEnd && !atStart) return;
    while (span.parentElement && span.parentElement.matches('span.ft-comment') && edge(span.parentElement, atEnd)) span = span.parentElement;
    e.preventDefault();
    // Le texte rejoint le morceau voisin hors du passage ; deux espaces côte à côte : insécable,
    // sinon le navigateur en efface une.
    const near = atEnd ? span.nextSibling : span.previousSibling;
    const before = atEnd ? span.textContent.slice(-1) : (near && near.nodeType === Node.TEXT_NODE ? near.data.slice(-1) : '');
    const after = atEnd ? (near && near.nodeType === Node.TEXT_NODE ? near.data.charAt(0) : '') : span.textContent.charAt(0);
    let data = e.data;
    if (/ $/.test(data) && (!after || /\s/.test(after))) data = data.slice(0, -1) + '\u00a0';
    if (/^ /.test(data) && (!before || /\s/.test(before))) data = '\u00a0' + data.slice(1);
    let t;
    let at;
    if (near && near.nodeType === Node.TEXT_NODE) {
      t = near;
      at = atEnd ? 0 : t.data.length;
      t.insertData(at, data);
    } else {
      t = document.createTextNode(data);
      at = 0;
      if (atEnd) span.after(t); else span.before(t);
    }
    // L'insécable posée redevient une espace ordinaire dès qu'un mot la suit.
    const k = data.indexOf('\u00a0');
    if (k >= 0) pendingSpace = { node: t, i: at + k };
    const r = document.createRange();
    r.setStart(t, at + data.length);
    sel.removeAllRanges();
    sel.addRange(r);
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data, bubbles: true }));
  });

  // Clic dans un passage commenté : sa bulle s'active (et réapparaît si les commentaires sont masqués).
  editor.addEventListener('click', onClick);

  // Mode lecture : pas de bulles.
  let reading = false;
  new MutationObserver(() => {
    const now = app.classList.contains('reading-mode');
    if (now !== reading) { reading = now; build(); }
  }).observe(app, { attributes: true, attributeFilter: ['class'] });

  // ----- Menus -----

  const check = (on, text) => (on ? '✓ ' : '  ') + text;
  function toolItems() {
    const list = [...anchors().keys()].map(byId).filter(Boolean);
    const done = list.filter((t) => t.done).length;
    return [
      { text: 'Nouveau commentaire', action: add },
      '-',
      { text: check(!hidden, 'Afficher les commentaires'), action: () => { hidden = !hidden; build(); } },
      { text: check(showDone, `Commentaires résolus (${done})`), action: () => { showDone = !showDone; build(); } },
      { text: 'Nom de l’auteur…', action: askAuthor }
    ];
  }

  const btn = $('comment-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode)) return add();
    const r = btn.getBoundingClientRect();
    window.FTSidebar.showMenu(r.left, r.bottom + 2, toolItems());
  });

  window.FTComments = {
    async init(name, save) {
      saveAuthor = save;
      author = typeof name === 'string' ? name.trim().slice(0, 60) : '';
      if (!author && api && api.userName) {
        try { author = String(await api.userName() || '').slice(0, 60); } catch { /* nom inconnu */ }
      }
    },
    load(settings) {
      threads = sanitize(settings && settings.comments);
      removed.clear();
      // Un fil sans passage (supprimé avec son texte) n'est pas gardé.
      const map = anchors();
      threads = threads.filter((t) => map.has(t.id));
      editing = null;
      active = null;
      build();
    },
    // Pour l'enregistrement : les fils dont le passage est dans le texte.
    get() {
      const map = anchors();
      return threads.filter((t) => map.has(t.id) && (t.text || !(editing && editing.id === t.id))).map((t) => ({ ...t, replies: t.replies.map((r) => ({ ...r })) }));
    },
    onChange(fn) { onChange = fn; },
    useEngine(mount, api) {
      editor = mount;
      G = api;
      mount.addEventListener('click', onClick);
      const M = window.FTMoteur;
      M.onUpdate((tr) => { if (tr.docChanged) later(); });
      // Nouveau découpage (après la frappe…) : les bulles suivent après une courte pause (pas à chaque touche).
      if (window.FTVisibles) window.FTVisibles.onLayout(() => { if (layer.childElementCount) later(); });
      // Écrire juste après un passage commenté ne l'allonge pas : le texte tapé n'en prend pas la marque.
      const isComment = (m) => m.type.name === 'inl' && /\bft-comment\b/.test((m.attrs.a && m.attrs.a.class) || '');
      M.addPlugin(new PM.state.Plugin({
        appendTransaction(trs, old, state) {
          const sel = state.selection;
          if (!sel.empty || state.storedMarks || !trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const $p = sel.$from;
          const marks = $p.marks();
          if (!marks.some(isComment)) return null;
          const after = $p.nodeAfter ? $p.nodeAfter.marks : [];
          const ends = marks.filter((m) => isComment(m) && !m.isInSet(after));
          return ends.length ? state.tr.setStoredMarks(marks.filter((m) => !ends.includes(m))) : null;
        }
      }));
    },
    add,
    remove,
    resolve: (id) => setDone(id, true),
    author: () => author,
    refresh: sync,
    // Export Word : les fils avec leur passage, dans l'ordre du texte.
    exportList() {
      const map = anchors();
      return [...map.keys()].map(byId).filter((t) => t && t.text).map((t) => ({ ...t, spans: map.get(t.id) }));
    },
    // Clic droit dans le texte (structure.js).
    menuItems(target, x, y) {
      if (app.classList.contains('reading-mode') || !window.FTApp.currentId()) return [];
      const span = target.closest && target.closest('span.ft-comment[data-c]');
      const t = span && byId(span.dataset.c);
      if (t) {
        return [
          { text: 'Nouveau commentaire', action: add },
          ...(t.done ? [{ text: 'Rouvrir le commentaire', action: () => setDone(t.id, false) }] : [{ text: 'Résoudre le commentaire', action: () => setDone(t.id, true) }]),
          { text: 'Supprimer le commentaire', danger: true, action: () => remove(t.id) }
        ];
      }
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode)) return [{ text: 'Nouveau commentaire', action: add }];
      const r = document.caretRangeFromPoint(x, y);
      if (!r || !editor.contains(r.startContainer) || !wordRange(r)) return [];
      return [{ text: 'Nouveau commentaire', action: () => { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); add(); } }];
    }
  };
})();
