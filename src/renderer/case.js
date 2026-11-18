// Casse : minuscules, MAJUSCULES, majuscule en début de phrase, à chaque mot, ou inversée.
// Le texte lui-même est changé (pas un simple affichage) : il reste ainsi à l'export Word et à la
// recherche. Sans sélection, le mot sous le curseur. Maj+F3 passe d'une casse à l'autre, comme Word.
(function () {
  let editor = document.getElementById('editor');
  // Moteur 2.0 : le texte du moteur, modifié d'un coup (moteur/objets.js).
  let run = (fn) => fn();
  const pop = document.getElementById('case-pop');
  const btn = document.getElementById('case-btn');
  const MODES = ['lower', 'upper', 'sentence', 'title', 'toggle'];
  const LETTER = /\p{L}/u;
  const WORD = /[\p{L}\p{N}'’-]/u;
  const BLOCK = 'P, LI, H1, H2, H3, H4, H5, H6, DIV, BLOCKQUOTE, TD, TH, FIGCAPTION, DT, DD';

  const skip = (node) => {
    const el = node.parentElement;
    return !el || !!el.closest('.ft-pg-gap, [contenteditable="false"], .ML__container, math-field');
  };
  const blockOf = (node) => (node.parentElement && node.parentElement.closest(BLOCK)) || editor;

  // Morceaux de texte touchés par la sélection : [nœud, début, fin].
  function pieces(range) {
    const out = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!range.intersectsNode(n) || skip(n) || !editor.contains(n)) continue;
      const start = n === range.startContainer ? range.startOffset : 0;
      const end = n === range.endContainer ? range.endOffset : n.data.length;
      if (end > start) out.push([n, start, end]);
    }
    return out;
  }

  // Sans sélection : le mot autour du curseur.
  function wordRange(sel) {
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;
    let a = sel.anchorOffset;
    let b = a;
    while (a > 0 && WORD.test(node.data[a - 1])) a--;
    while (b < node.data.length && WORD.test(node.data[b])) b++;
    if (a === b) return null;
    const r = document.createRange();
    r.setStart(node, a);
    r.setEnd(node, b);
    return r;
  }

  // Le texte qui précède la sélection dans son paragraphe finit-il une phrase ?
  function startsSentence(node, offset) {
    const block = blockOf(node);
    const r = document.createRange();
    r.setStart(block, 0);
    r.setEnd(node, offset);
    const before = r.toString().replace(/\s+$/, '');
    return !before || /[.!?…][\s"»”)]*$/.test(before);
  }

  // Casse actuelle du passage, pour Maj+F3.
  function current(text) {
    const letters = [...text].filter((c) => LETTER.test(c));
    if (!letters.length) return null;
    if (letters.every((c) => c === c.toLocaleLowerCase())) return 'lower';
    if (letters.every((c) => c === c.toLocaleUpperCase())) return 'upper';
    return null;
  }

  // Nouvelle forme de chaque caractère, d'après tout le passage (les phrases et les mots peuvent
  // être coupés entre plusieurs morceaux de mise en forme).
  function transform(chars, mode, sentenceStart) {
    const up = (c) => c.toLocaleUpperCase();
    const low = (c) => c.toLocaleLowerCase();
    if (mode === 'upper') return chars.map(up);
    if (mode === 'lower') return chars.map(low);
    if (mode === 'toggle') return chars.map((c) => (c === low(c) ? up(c) : low(c)));
    const out = [];
    let capNext = mode === 'sentence' ? sentenceStart : true;
    let prev = '';
    for (const c of chars) {
      if (c === '\n') { out.push(c); capNext = true; prev = ''; continue; }
      if (mode === 'title') {
        const startWord = !WORD.test(prev) || prev === '-';
        out.push(LETTER.test(c) ? (startWord ? up(c) : low(c)) : c);
      } else {
        if (LETTER.test(c)) { out.push(capNext ? up(c) : low(c)); capNext = false; }
        else {
          out.push(c);
          if (/[.!?…]/.test(c)) capNext = true;
          else if (/\p{N}/u.test(c)) capNext = false;
        }
      }
      prev = c;
    }
    return out;
  }

  function apply(mode) {
    pop.hidden = true;
    run(() => change(mode));
  }

  function change(mode) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const range = sel.isCollapsed ? wordRange(sel) : sel.getRangeAt(0);
    if (!range) return;
    const parts = pieces(range);
    if (!parts.length) return;
    // Un retour à la ligne entre deux paragraphes (une phrase y commence toujours).
    const chars = [];
    const owner = [];
    parts.forEach(([n, a, b], i) => {
      if (i > 0 && blockOf(n) !== blockOf(parts[i - 1][0])) { chars.push('\n'); owner.push(-1); }
      for (const c of n.data.slice(a, b)) { chars.push(c); owner.push(i); }
    });
    if (mode === 'cycle') {
      const now = current(chars.join(''));
      mode = now === 'lower' ? 'upper' : now === 'upper' ? 'title' : 'lower';
    }
    const out = transform(chars, mode, startsSentence(parts[0][0], parts[0][1]));
    const texts = parts.map(() => '');
    out.forEach((c, k) => { if (owner[k] >= 0) texts[owner[k]] += c; });
    let changed = false;
    parts.forEach(([n, a, b], i) => {
      const next = n.data.slice(0, a) + texts[i] + n.data.slice(b);
      if (next !== n.data) { n.data = next; changed = true; }
      parts[i][2] = a + texts[i].length;
    });
    // La sélection reste sur le passage (sa longueur peut changer : « ß » devient « SS »).
    const first = parts[0];
    const last = parts[parts.length - 1];
    try { sel.setBaseAndExtent(first[0], first[1], last[0], last[2]); } catch { /* sélection perdue */ }
    if (changed) editor.dispatchEvent(new Event('input'));
  }

  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    pop.hidden = !pop.hidden;
    if (!pop.hidden) window.FTToolbar.placePop(pop, e.currentTarget.parentElement);
  });
  for (const b of pop.querySelectorAll('[data-case]')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => apply(b.dataset.case));
  }
  document.addEventListener('mousedown', (e) => { if (!pop.hidden && !e.target.closest('.case-picker')) pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });

  window.FTCase = {
    apply,
    cycle: () => apply('cycle'),
    MODES,
    useEngine(mount, bridge) {
      editor = mount;
      run = bridge.edit;
    }
  };
})();
