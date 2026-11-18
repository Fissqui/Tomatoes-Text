// Rechercher et remplacer (bouton de la barre d'outils, Ctrl+F, Ctrl+H).
// Les mots trouvés sont surlignés sans toucher au texte (CSS Highlight) ; « Remplacer » change
// seulement celui qui est en cours, « Tout remplacer » les change tous d'un coup.
(function () {
  let editor = document.getElementById('editor');
  const page = document.getElementById('page');
  const workspace = document.getElementById('workspace');
  const panel = document.getElementById('find-panel');
  const btn = document.getElementById('find-btn');
  const input = document.getElementById('find-input');
  const replaceInput = document.getElementById('find-replace');
  const count = document.getElementById('find-count');
  const prevBtn = document.getElementById('find-prev');
  const nextBtn = document.getElementById('find-next');
  const replaceBtn = document.getElementById('find-replace-one');
  const replaceAllBtn = document.getElementById('find-replace-all');
  const caseBox = document.getElementById('find-case');
  const wordBox = document.getElementById('find-word');
  const closeBtn = document.getElementById('find-close');

  const canMark = !!(window.CSS && CSS.highlights && window.Highlight);
  const allMarks = canMark ? new Highlight() : null;
  const currentMark = canMark ? new Highlight() : null;
  if (canMark) {
    currentMark.priority = 1;
    CSS.highlights.set('ft-find', allMarks);
    CSS.highlights.set('ft-find-current', currentMark);
  }

  let matches = [];
  let current = null;      // Range (suivi par le navigateur quand le texte change autour)
  let message = '';        // « 12 remplacements », affiché quelques secondes à la place du compte
  let messageAt = 0;

  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, div, blockquote, figcaption, pre, dt, dd';
  // Lettres (accents compris) et chiffres : pour l'option « Mot entier ».
  const WORD_CHAR = /[\p{L}\p{N}_]/u;

  // Même longueur avant et après : les positions restent valables dans le texte d'origine.
  function fold(s) {
    s = s.replace(/[’‘ʼ]/g, "'").replace(/[  ]/g, ' ');
    return caseBox.checked ? s : s.toLowerCase();
  }

  // Le texte de l'éditeur, découpé par paragraphe : [{ text, parts: [{ node, at }] }].
  function paragraphs() {
    const out = [];
    let last = null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const el = n.parentElement;
        if (!el || !n.data.length) return NodeFilter.FILTER_REJECT;
        if (el.closest('.ft-pg-gap')) return NodeFilter.FILTER_REJECT;
        const ce = el.closest('[contenteditable]');
        if (!ce || ce.getAttribute('contenteditable') === 'false') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const block = n.parentElement.closest(BLOCK) || editor;
      if (!last || last.block !== block) out.push(last = { block, text: '', parts: [] });
      last.parts.push({ node: n, at: last.text.length });
      last.text += n.data;
    }
    return out;
  }

  // Position (nœud, décalage) du caractère n° i d'un paragraphe ; « end » : fin d'un mot trouvé.
  function point(para, i, end) {
    let k = para.parts.length - 1;
    while (k > 0 && (para.parts[k].at > i || (end && para.parts[k].at === i))) k--;
    const p = para.parts[k];
    return [p.node, Math.min(i - p.at, p.node.length)];
  }

  function search() {
    matches = [];
    const needle = input.value;
    if (!needle || page.hidden) return;
    if (E) { matches = E.search(fold(needle)); return; }
    const n = fold(needle);
    for (const para of paragraphs()) {
      const hay = fold(para.text);
      for (let i = hay.indexOf(n); i !== -1; i = hay.indexOf(n, i + n.length)) {
        if (wordBox.checked && (WORD_CHAR.test(para.text[i - 1] || '') || WORD_CHAR.test(para.text[i + n.length] || ''))) continue;
        const r = document.createRange();
        r.setStart(...point(para, i, false));
        r.setEnd(...point(para, i + n.length, true));
        matches.push(r);
      }
    }
  }

  let before = (a, b) => a.compareBoundaryPoints(Range.START_TO_START, b) < 0;
  let alive = (r) => r && editor.contains(r.startContainer) && !r.collapsed;

  // Le mot trouvé qui suit (ou précède) la position de départ, en revenant au début après le dernier.
  function pick(from, back) {
    if (!matches.length) return null;
    if (!from) return back ? matches[matches.length - 1] : matches[0];
    if (back) {
      for (let i = matches.length - 1; i >= 0; i--) if (before(matches[i], from)) return matches[i];
      return matches[matches.length - 1];
    }
    for (const m of matches) if (!before(m, from)) return m;
    return matches[0];
  }

  // Point de départ : le mot en cours, sinon le curseur dans le texte.
  let startPoint = function () {
    if (alive(current)) return current;
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) return sel.getRangeAt(0);
    return null;
  };

  let same = (a, b) => a && b && a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;

  // Recherche de nouveau et garde le mot en cours s'il est toujours là.
  function refresh(scroll) {
    const from = startPoint();
    search();
    current = from ? pick(from, false) : (matches[0] || null);
    paint(scroll);
  }

  function paint(scroll) {
    if (E) E.paint();
    else if (canMark) {
      allMarks.clear();
      currentMark.clear();
      if (!panel.hidden) {
        matches.forEach((m) => allMarks.add(m));
        if (current) currentMark.add(current);
      }
    }
    const i = current ? matches.findIndex((m) => same(m, current)) : -1;
    if (message) count.textContent = message;
    else if (!input.value) count.textContent = '';
    else if (!matches.length) count.textContent = 'Aucun résultat';
    else count.textContent = `${i + 1} sur ${matches.length}`;
    panel.classList.toggle('none', !!input.value && !matches.length && !message);
    const empty = !matches.length;
    prevBtn.disabled = nextBtn.disabled = replaceBtn.disabled = replaceAllBtn.disabled = empty;
    if (scroll && current) reveal(current);
  }

  // Fait défiler la page jusqu'au mot en cours, s'il n'est pas déjà visible.
  function reveal(range) {
    if (E) return E.reveal(range);
    const r = range.getBoundingClientRect();
    const box = workspace.getBoundingClientRect();
    const top = box.top + panel.offsetHeight + 16;
    if (r.top < top || r.bottom > box.bottom - 24) workspace.scrollTop += r.top - box.top - box.height / 3;
  }

  function go(back) {
    message = '';
    const from = startPoint();
    search();
    if (!matches.length) { current = null; return paint(); }
    const here = from && matches.find((m) => same(m, from));
    if (here) {
      const i = matches.indexOf(here);
      current = matches[(i + (back ? -1 : 1) + matches.length) % matches.length];
    } else {
      current = pick(from, back);
    }
    paint(true);
  }

  // ----- Remplacer -----

  const checkpoint = () => { if (window.FTHistory) window.FTHistory.commit(); };
  const changed = () => editor.dispatchEvent(new Event('input'));

  // Remplace le texte d'un mot trouvé, en gardant la mise en forme de sa première lettre.
  function put(range, text) {
    const node = range.startContainer;
    const offset = range.startOffset;
    range.deleteContents();
    if (node.nodeType === Node.TEXT_NODE && node.isConnected) {
      node.insertData(offset, text);
      return [node, offset + text.length];
    }
    const t = document.createTextNode(text);
    range.insertNode(t);
    return [t, text.length];
  }

  function replaceOne() {
    message = '';
    refresh(false);
    if (!current) return;
    if (E) {
      const at = E.replace([current], replaceInput.value);
      search();
      current = matches.length ? pick(at, false) : null;
      return paint(true);
    }
    checkpoint();
    const end = put(current, replaceInput.value);
    // On repart juste après le mot remplacé.
    const after = document.createRange();
    after.setStart(...end);
    current = null;
    search();
    current = matches.length ? pick(after, false) : null;
    changed();
    paint(true);
  }

  function replaceAll() {
    message = '';
    search();
    if (!matches.length) return paint();
    const n = matches.length;
    if (E) E.replace(matches, replaceInput.value);
    else {
      checkpoint();
      for (let i = matches.length - 1; i >= 0; i--) put(matches[i], replaceInput.value);
    }
    current = null;
    if (!E) changed();
    search();
    message = n === 1 ? '1 remplacement' : `${n} remplacements`;
    messageAt = Date.now();
    paint();
  }

  // ----- Fenêtre -----

  function place() {
    const box = workspace.getBoundingClientRect();
    panel.style.top = box.top + 8 + 'px';
    panel.style.right = Math.max(8, window.innerWidth - box.right + 22) + 'px';
  }

  function open(replace) {
    if (page.hidden) return;
    if (window.FTMindmap && window.FTMindmap.isVisible()) window.FTMindmap.show(false);
    if (window.FTTimeline && window.FTTimeline.isVisible()) window.FTTimeline.show(false);
    const sel = window.getSelection();
    const picked = sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) ? sel.toString() : '';
    if (picked && !picked.includes('\n') && picked.length <= 80) input.value = picked;
    panel.hidden = false;
    btn.classList.add('on');
    place();
    message = '';
    current = null;
    refresh(true);
    const target = replace && input.value ? replaceInput : input;
    target.focus();
    target.select();
  }

  // En fermant : le mot en cours reste sélectionné dans le texte.
  function close(keepSelection = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.classList.remove('on');
    const keep = keepSelection && alive(current) ? (E ? current : current.cloneRange()) : null;
    current = null;
    matches = [];
    paint();
    if (keep && E) E.select(keep);
    else if (keep) {
      editor.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(keep);
    }
  }

  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => (panel.hidden ? open(false) : close()));
  closeBtn.addEventListener('click', () => close());
  prevBtn.addEventListener('click', () => go(true));
  nextBtn.addEventListener('click', () => go(false));
  replaceBtn.addEventListener('click', replaceOne);
  replaceAllBtn.addEventListener('click', replaceAll);
  for (const b of [prevBtn, nextBtn, replaceBtn, replaceAllBtn, closeBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());

  input.addEventListener('input', () => { message = ''; current = null; refresh(true); });
  [caseBox, wordBox].forEach((b) => b.addEventListener('change', () => { message = ''; refresh(true); }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey); }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey) replaceAll(); else replaceOne(); }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'F3') { e.preventDefault(); go(e.shiftKey); }
  });

  // Le texte change (frappe, annulation, découpage en pages) : les surlignages suivent.
  let timer = null;
  const later = () => {
    if (panel.hidden || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (panel.hidden) return;
      if (Date.now() - messageAt > 3000) message = '';
      refresh(false);
    }, 250);
  };
  const watcher = new MutationObserver(later);
  watcher.observe(editor, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', () => { if (!panel.hidden) place(); });

  // Ctrl+F / Ctrl+H quand le menu ne les a pas déjà pris (F3 : mot suivant).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F3' && !panel.hidden) { e.preventDefault(); go(e.shiftKey); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 'f' || key === 'h') { e.preventDefault(); open(key === 'h'); }
  });

  // ----- Moteur 2.0 : recherche dans le texte du moteur -----
  // Mots trouvés : positions { from, to } dans le modèle (tout le document, même les pages pas
  // affichées), surlignés par des décorations ; remplacements faits par le moteur (une étape
  // d'annulation pour « Remplacer », une pour « Tout remplacer »).
  let E = null;
  function engineFind(M) {
    const view = M.view;
    const { TextSelection } = PM.state;
    const OBJ = '\uFFFC'; // objet dans la ligne (image, formule…) : un caractère, jamais trouvé
    const valid = (m) => !!m && m.to <= view.state.doc.content.size && m.to > m.from;
    let cache = null;
    M.onUpdate((tr) => { if (tr.docChanged && !panel.hidden) later(); });

    // Surlignage (comme les versions 1.x, sans toucher au texte) : seulement les mots des blocs affichés
    // (très long document : les autres ne le sont pas) ; refait quand l'affichage change.
    function rangeOf(m) {
      const a = view.domAtPos(m.from);
      const b = view.domAtPos(m.to);
      const r = document.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
      return r;
    }
    function mark() {
      if (!canMark) return;
      allMarks.clear();
      currentMark.clear();
      if (panel.hidden || !matches.length) return;
      const doc = view.state.doc;
      // (Mots dans l'ordre du texte : les blocs de premier niveau sont parcourus une seule fois.)
      // (Éléments des blocs lus dans la vue du moteur, dans le même ordre : sans recherche bloc par bloc.)
      const descs = view.docView.children;
      let k = -1;
      let i = -1;
      let start = 0;
      let end = 0;
      let on = false;
      for (const m of matches) {
        if (m.to > doc.content.size) continue;
        while (m.from >= end && i + 1 < doc.childCount) {
          i++;
          start = end;
          end = start + doc.child(i).nodeSize;
          do k++; while (k < descs.length && !descs[k].node);
          const el = descs[k] && descs[k].node === doc.child(i) ? descs[k].dom : view.nodeDOM(start);
          on = !!el && el.nodeType === 1 && !el.hasAttribute('data-pm-far');
        }
        if (!on) continue;
        try {
          const r = rangeOf(m);
          allMarks.add(r);
          if (current && m.from === current.from && m.to === current.to) currentMark.add(r);
        } catch { /* mot qui vient de changer */ }
      }
    }
    let raf = 0;
    const markSoon = () => { if (!raf && !panel.hidden) raf = requestAnimationFrame(() => { raf = 0; mark(); }); };
    workspace.addEventListener('scroll', markSoon, { passive: true });
    M.onUpdate(markSoon);

    return {
      search(needle) {
        // Même texte, même recherche (mot suivant, précédent) : les mots déjà trouvés.
        const key = needle + '\u0000' + wordBox.checked + caseBox.checked;
        if (cache && cache.doc === view.state.doc && cache.key === key) return cache.out.slice();
        const out = [];
        view.state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          const text = node.textBetween(0, node.content.size, undefined, OBJ);
          const hay = fold(text);
          for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
            if (wordBox.checked && (WORD_CHAR.test(text[i - 1] || '') || WORD_CHAR.test(text[i + needle.length] || ''))) continue;
            out.push({ from: pos + 1 + i, to: pos + 1 + i + needle.length });
          }
          return false;
        });
        cache = { doc: view.state.doc, key, out };
        return out.slice();
      },
      before: (a, b) => a.from < b.from,
      alive: valid,
      same: (a, b) => !!a && !!b && a.from === b.from && a.to === b.to,
      startPoint() {
        if (valid(current)) return current;
        const sel = view.state.selection;
        return { from: sel.from, to: sel.to };
      },
      paint: mark,
      // Le mot en cours à l'écran : son bloc est d'abord affiché s'il ne l'était pas (très long document).
      reveal(m) {
        const $p = view.state.doc.resolve(m.from);
        const block = $p.depth ? view.nodeDOM($p.before(1)) : null;
        const go = () => {
          let c;
          try { c = view.coordsAtPos(m.from); } catch { return; }
          const box = workspace.getBoundingClientRect();
          const top = box.top + panel.offsetHeight + 16;
          if (c.top < top || c.bottom > box.bottom - 24) workspace.scrollTop += c.top - box.top - box.height / 3;
          markSoon();
        };
        if (block && block.nodeType === 1 && block.hasAttribute('data-pm-far')) {
          block.scrollIntoView({ block: 'center' });
          requestAnimationFrame(go);
        } else {
          go();
        }
      },
      replace(list, text) {
        const tr = view.state.tr;
        for (let i = list.length - 1; i >= 0; i--) tr.insertText(text, list[i].from, list[i].to);
        view.dispatch(PM.history.closeHistory(tr));
        M.closeHistory();
        const at = tr.mapping.map(list[list.length - 1].to);
        return { from: at, to: at };
      },
      select(m) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)));
        view.focus();
      }
    };
  }
  if (window.FTMoteur) {
    const backend = engineFind(window.FTMoteur);
    // Branchée quand le moteur prend la zone d'écriture (moteur/demarrage.js).
    var useEngine = (mount) => {
      watcher.disconnect();
      editor = mount;
      E = backend;
      before = E.before;
      alive = E.alive;
      same = E.same;
      startPoint = E.startPoint;
    };
  }

  window.FTFind = {
    useEngine,
    open,
    close,
    // Nouveau document ouvert : la recherche repart de zéro.
    reset() { close(false); }
  };
})();
