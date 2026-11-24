// Équations dans le texte (moteur 2.0) : modifiées sur place, comme dans Word.
// Un clic sur une équation (ou les flèches qui y entrent, ou Entrée quand elle est sélectionnée) la
// remplace par une zone d'écriture MathLive à la même place ; chaque frappe est enregistrée dans le
// document (une seule étape d'annulation pour toute la modification). On en sort par Échap, Entrée, les
// flèches au bord, ou un clic ailleurs. Alt+= crée une équation au curseur (le texte sélectionné devient
// son code LaTeX). Une petite barre au-dessus propose les structures courantes et la fenêtre complète.
// Numérotation : les équations numérotées (data-numero) reçoivent leur numéro (data-eq) dans l'ordre du
// texte, à chaque modification. Clic droit : modifier, numéroter, disposition, alignement, encadrement.
(function () {
  const M = window.FTMoteur;
  if (!M) return;
  const { view, schema } = M;
  const { Plugin, NodeSelection, TextSelection } = PM.state;
  const N = schema.nodes;
  const F = () => window.FTFormules;
  const ML = window.MathLive;

  const MATH = /^<(span|div)\b[^>]*?\sclass="(?:[^"]*\s)?ft-math(?:\s[^"]*)?"/;
  const isMathHtml = (html) => MATH.test(html || '');
  const isMath = (node) => !!node && (node.type === N.raw_inline || node.type === N.raw_block) && isMathHtml(node.attrs.html);
  const closed = () => !view.editable || document.getElementById('app').classList.contains('reading-mode');
  const fromHtml = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild;
  };

  // Vue de chaque équation affichée (pour y entrer au clavier).
  const views = new WeakMap();
  let active = null; // équation en cours de modification

  // ----- Vue d'une équation -----

  function mathView(node, v, getPos) {
    let cur = node;
    const dom = fromHtml(node.attrs.html) || document.createElement('span');
    dom.setAttribute('contenteditable', 'false');
    // Dessin absent (document importé, ancien document) : refait depuis le code.
    if (!dom.querySelector('.ML__latex') && F()) dom.innerHTML = F().render(dom.dataset.latex || '', dom.tagName === 'DIV');
    let ed = null;

    const block = () => dom.tagName === 'DIV';
    const pos = () => { try { return getPos(); } catch { return undefined; } };

    // Enregistre le code tapé dans le document (étape d'annulation de la modification en cours).
    function commit(latex, extra) {
      const at = pos();
      if (at === undefined || !ed) return;
      const info = { ...F().infoOf(dom), latex, ...(extra || {}) };
      const html = F().html(info);
      if (html === cur.attrs.html) return;
      ed.expect = html;
      let tr = v.state.tr.setNodeMarkup(at, null, { html });
      if (!ed.started) { tr = PM.history.closeHistory(tr); ed.started = true; }
      tr.setTime(ed.time).setMeta('ft-formule', true);
      v.dispatch(tr);
    }

    function sync() {
      if (!ed) return;
      const latex = F().clean(ed.field.value);
      dom.dataset.latex = latex;
      if (latex !== ed.last) {
        ed.last = latex;
        commit(latex);
      }
      placeBar();
    }

    // at : 'start', 'end' ou {x, y} (clic) ; joined : suite de la création de l'équation (même annulation).
    function begin(at, joined) {
      if (ed || closed() || !ML || !F()) return false;
      if (active && active !== ctl) active.finish(null);
      const field = new ML.MathfieldElement();
      const latex = dom.dataset.latex || '';
      const markup = dom.querySelector(':scope > .ML__latex');
      if (markup) markup.replaceWith(field); else dom.prepend(field);
      dom.classList.add('ft-math-edit');
      F().setupField(field, { inline: true });
      field.value = latex;
      ed = { field, last: F().clean(latex), time: joined || Date.now(), started: !!joined, expect: null };
      active = ctl;
      field.addEventListener('input', sync);
      field.addEventListener('keydown', keys, true);
      field.addEventListener('paste', (e) => F().pasteInto(field, e), true);
      field.addEventListener('move-out', (e) => {
        e.preventDefault();
        const d = e.detail && e.detail.direction;
        finish(d === 'backward' || d === 'upward' ? 'before' : 'after');
      });
      field.addEventListener('focusout', () => {
        // (Clic dans la petite barre : le clavier revient dans l'équation.)
        setTimeout(() => { if (ed && ed.field === field && !field.hasFocus() && !barHolds) finish(null); }, 0);
      });
      requestAnimationFrame(() => {
        if (!ed || ed.field !== field) return;
        field.focus({ preventScroll: true });
        try {
          if (at === 'start') field.position = 0;
          else if (at && typeof at === 'object') {
            const off = field.getOffsetFromPoint(at.x, at.y, { bias: 0 });
            field.position = off >= 0 ? off : field.lastOffset;
          } else field.position = field.lastOffset;
        } catch { /* position par défaut : à la fin */ }
        showBar(ctl);
      });
      return true;
    }

    function keys(e) {
      if (!ed) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        finish('after');
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !ed.field.value) {
        e.preventDefault();
        e.stopPropagation();
        finish('before');
        return;
      }
      // Tab hors d'une case à remplir : la sortie se fait par « move-out ».
      if (e.key === 'F2' || (e.altKey && (e.key === '=' || e.code === 'Equal'))) {
        e.preventDefault();
        e.stopPropagation();
        finish('after');
      }
    }

    // Fin de la modification : l'équation redevient un dessin ; vide, elle disparaît.
    // where : 'after' / 'before' (curseur placé après / avant), null (le clic est allé ailleurs).
    function finish(where) {
      if (!ed) return;
      const e = ed;
      const latex = F().clean(e.field.value);
      if (latex !== e.last) { e.last = latex; commit(latex); }
      ed = null;
      if (active === ctl) active = null;
      hideBar();
      dom.classList.remove('ft-math-edit');
      dom.dataset.latex = latex;
      const field = e.field;
      field.removeEventListener('input', sync);
      const drawn = document.createElement('template');
      drawn.innerHTML = F().render(latex, block());
      if (field.isConnected) field.replaceWith(...drawn.content.childNodes);
      const at = pos();
      if (at === undefined) return;
      if (!latex) {
        let tr = v.state.tr.delete(at, at + cur.nodeSize);
        if (e.started) tr.setTime(e.time);
        else tr = PM.history.closeHistory(tr);
        if (where) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)), -1));
        v.dispatch(tr.scrollIntoView());
        if (where) v.focus();
        return;
      }
      if (!where) return;
      const size = cur.nodeSize;
      const target = where === 'after' ? at + size : at;
      const tr = v.state.tr;
      const $p = tr.doc.resolve(Math.min(target, tr.doc.content.size));
      tr.setSelection(block() ? TextSelection.near($p, where === 'after' ? 1 : -1) : TextSelection.create(tr.doc, $p.pos));
      v.dispatch(tr.scrollIntoView());
      v.focus();
    }

    function onDown(e) {
      if (ed || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || closed()) return;
      e.preventDefault();
      begin({ x: e.clientX, y: e.clientY });
    }
    dom.addEventListener('mousedown', onDown);

    const ctl = {
      dom,
      begin,
      finish,
      editing: () => !!ed,
      field: () => (ed ? ed.field : null),
      block,
      // Réglage changé depuis la petite barre (numérotation) sans quitter l'équation.
      set(extra) {
        if (!ed) return;
        if ('numbered' in extra) {
          if (extra.numbered) {
            dom.setAttribute('data-numero', '');
            // Équation numérotée : à gauche, numéro à droite.
            if (!('align' in extra)) { extra = { ...extra, align: 'gauche' }; dom.dataset.align = 'gauche'; }
          } else { dom.removeAttribute('data-numero'); delete dom.dataset.eq; }
        }
        commit(F().clean(ed.field.value), extra);
      }
    };
    views.set(dom, ctl);

    return {
      dom,
      update(nw) {
        if (nw.type !== cur.type || !isMath(nw)) return false;
        if (ed) {
          // Modification en cours : seuls les réglages (numéro…) suivent ; la zone d'écriture reste.
          const fresh = fromHtml(nw.attrs.html);
          if (!fresh) return false;
          if (nw.attrs.html !== ed.expect && fresh.dataset.latex !== F().clean(ed.field.value)) { ed.started = true; finish(null); return false; }
          for (const at of [...dom.attributes]) if (at.name !== 'class' && !fresh.hasAttribute(at.name)) dom.removeAttribute(at.name);
          for (const at of fresh.attributes) if (at.name !== 'class' && dom.getAttribute(at.name) !== at.value) dom.setAttribute(at.name, at.value);
          cur = nw;
          return true;
        }
        if (nw.attrs.html !== cur.attrs.html) return false;
        cur = nw;
        return true;
      },
      selectNode() { dom.classList.add('ProseMirror-selectednode'); },
      deselectNode() { dom.classList.remove('ProseMirror-selectednode'); },
      stopEvent: (e) => !!ed || (e.type === 'mousedown' && !closed() && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey),
      ignoreMutation: (m) => !!ed || m.type !== 'selection',
      destroy() {
        dom.removeEventListener('mousedown', onDown);
        if (ed) {
          // Équation refaite pendant sa modification (rare) : le code tapé est déjà enregistré.
          ed = null;
          if (active === ctl) active = null;
          hideBar();
        }
      }
    };
  }

  // ----- Petite barre au-dessus de l'équation modifiée -----

  let bar = null;
  let barFor = null;
  let barHolds = false;
  function makeBar() {
    bar = document.createElement('div');
    bar.className = 'ft-math-bar';
    bar.hidden = true;
    bar.addEventListener('mousedown', (e) => { e.preventDefault(); barHolds = true; setTimeout(() => { barHolds = false; }, 0); });
    document.body.append(bar);
  }
  function fillBar(ctl) {
    const items = F().quick().map(([d, ins, title]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.innerHTML = F().render(d, false);
      b.addEventListener('click', () => {
        const field = ctl.field();
        if (!field) return;
        field.focus();
        field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
        field.dispatchEvent(new Event('input'));
      });
      return b;
    });
    const sep = () => { const s = document.createElement('span'); s.className = 'sep'; return s; };
    const text = (label, title, fn, on) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'txt' + (on ? ' on' : '');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    const extra = [];
    if (ctl.block()) {
      const numbered = ctl.dom.hasAttribute('data-numero');
      extra.push(text('(1)', numbered ? 'Retirer le numéro' : 'Numéroter l’équation', () => {
        ctl.set({ numbered: !ctl.dom.hasAttribute('data-numero') });
        fillBar(ctl);
        const field = ctl.field();
        if (field) field.focus();
      }, numbered));
    }
    extra.push(text('Plus…', 'Ouvrir la fenêtre d’équation', () => {
      const dom = ctl.dom;
      ctl.finish(null);
      requestAnimationFrame(() => { if (dom.isConnected) F().open(dom); });
    }));
    bar.replaceChildren(...items, sep(), ...extra);
  }
  function showBar(ctl) {
    if (!bar) makeBar();
    barFor = ctl;
    fillBar(ctl);
    bar.hidden = false;
    placeBar();
  }
  function hideBar() {
    if (bar) bar.hidden = true;
    barFor = null;
  }
  function placeBar() {
    if (!bar || bar.hidden || !barFor) return;
    const field = barFor.field();
    if (!field) return;
    const r = field.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    let top = r.top - b.height - 8;
    if (top < 8) top = r.bottom + 8;
    const left = Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }
  window.addEventListener('scroll', placeBar, true);
  window.addEventListener('resize', placeBar);

  // ----- Entrer dans une équation au clavier ; Alt+= -----

  const ctlAt = (pos) => {
    const dom = pos === null || pos === undefined ? null : view.nodeDOM(pos);
    return dom ? views.get(dom) : null;
  };

  function insertNew(v) {
    const { $from, from, to, empty } = v.state.selection;
    if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false;
    const text = empty ? '' : v.state.doc.textBetween(from, to, ' ').trim();
    const lone = $from.parent.type === N.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
    const html = F().html({ latex: text, block: lone });
    let tr = v.state.tr;
    let pos;
    if (lone) {
      // Ligne vide : équation sur sa propre ligne, suivie d'une ligne de texte.
      const before = $from.before();
      tr.replaceWith(before, $from.after(), N.raw_block.create({ html }));
      pos = before;
      const after = pos + 1;
      if (!(tr.doc.resolve(after).nodeAfter || {}).isTextblock) tr.insert(after, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
    } else {
      tr.replaceSelectionWith(N.raw_inline.create({ html }), true);
      pos = tr.mapping.map(from, -1);
    }
    tr = PM.history.closeHistory(tr).scrollIntoView();
    v.dispatch(tr);
    const ctl = ctlAt(pos);
    if (ctl) ctl.begin('end', tr.time);
    return true;
  }

  function keyDown(v, e) {
    if (closed()) return false;
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '=' || e.code === 'Equal')) {
      e.preventDefault();
      return insertNew(v);
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    const sel = v.state.selection;
    // Équation sélectionnée (objet) : Entrée ou F2 l'ouvre.
    if (sel instanceof NodeSelection && isMath(sel.node) && (e.key === 'Enter' || e.key === 'F2')) {
      const ctl = ctlAt(sel.from);
      if (ctl && ctl.begin('end')) { e.preventDefault(); return true; }
    }
    if (!sel.empty || !(sel instanceof TextSelection)) return false;
    // Flèche vers une équation dans la ligne : on entre dedans, comme dans Word.
    if (e.key === 'ArrowRight' && isMath(sel.$from.nodeAfter)) {
      const ctl = ctlAt(sel.from);
      if (ctl && ctl.begin('start')) { e.preventDefault(); return true; }
    }
    if (e.key === 'ArrowLeft' && isMath(sel.$from.nodeBefore)) {
      const ctl = ctlAt(sel.from - sel.$from.nodeBefore.nodeSize);
      if (ctl && ctl.begin('end')) { e.preventDefault(); return true; }
    }
    return false;
  }

  // ----- Clic droit -----

  function menu(v, e) {
    const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    const f = target && target.closest('.ft-math');
    if (!f || !v.dom.contains(f) || !F()) return false;
    e.preventDefault();
    if (active) active.finish(null);
    const info = F().infoOf(f);
    const apply = (changes) => F().apply(f, changes);
    const check = (on, text) => (on ? '✓ ' : ' ') + text;
    const items = [
      { text: 'Modifier l’équation', action: () => F().open(f) },
      ...(info.block ? [{ text: check(info.numbered, 'Numéroter l’équation'), action: () => apply({ numbered: !info.numbered }) }] : []),
      ...(info.numbered ? [{ text: check(info.chap, 'Inclure le numéro de chapitre'), action: () => setChapters(!info.chap) }] : []),
      {
        text: 'Disposition',
        submenu: () => [
          { text: check(!info.block, 'Dans le texte'), action: () => apply({ block: false, numbered: false, align: '' }) },
          { text: check(info.block, 'Sur sa propre ligne'), action: () => apply({ block: true }) }
        ]
      },
      ...(info.block ? [{
        text: 'Alignement',
        submenu: () => [
          { text: check(info.align !== 'gauche', 'Centrée'), action: () => apply({ align: '' }) },
          { text: check(info.align === 'gauche', 'À gauche'), action: () => apply({ align: 'gauche' }) }
        ]
      }] : []),
      {
        text: 'Encadrement',
        submenu: () => [['', 'Aucun'], ['cadre', 'Cadre'], ['colore', 'Encadré coloré']].map(([box, name]) => ({
          text: check(info.box === box, name),
          action: () => apply({ box })
        }))
      },
      { text: 'Copier le code LaTeX', action: () => copyLatex(info.latex) },
      ...(info.block ? [{ text: 'Sélectionner (pour la déplacer)', action: () => window.FTObjets.selectObject(f) }] : []),
      '-',
      { text: 'Supprimer l’équation', danger: true, action: () => F().remove(f) }
    ];
    window.FTSidebar.showMenu(e.clientX, e.clientY, items);
    return true;
  }

  function copyLatex(latex) {
    const done = () => window.FTGeneres && window.FTGeneres.flash && window.FTGeneres.flash('Code LaTeX copié.');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(latex).then(done, () => {}); return; }
    } catch { /* presse-papiers indisponible */ }
    const t = document.createElement('textarea');
    t.value = latex;
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    done();
  }

  // ----- Numéros des équations -----

  const NUMBERED = /^<div\b[^>]*?\sdata-numero(?:=""|\s|>)/;
  const EQ = /^<div\b[^>]*?\sdata-eq="([^"]*)"/;
  const CHAP = /^<div\b[^>]*?\sdata-chap(?:=""|\s|>)/;
  function setEq(html, eq, chap) {
    const el = fromHtml(html);
    if (!el) return html;
    if (eq) el.dataset.eq = eq; else delete el.dataset.eq;
    if (chap) el.setAttribute('data-chap', ''); else el.removeAttribute('data-chap');
    return el.outerHTML;
  }

  // Numéro de chapitre écrit comme les titres de niveau 1 (I, A, a ou 1).
  function chapterLabel(n) {
    const style = window.FTStructure && window.FTStructure.getStyles ? (window.FTStructure.getStyles().headings[0] || {}).number : '';
    if (style === 'I') {
      let out = '';
      for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { out += r; n -= v; }
      return out;
    }
    if (style === 'A' || style === 'a') {
      let out = '';
      for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
      return style === 'a' ? out.toLowerCase() : out;
    }
    return String(n);
  }

  const isChapter = (node) => node.type === N.heading && node.attrs.level === 1 && !/\bft-title\b/.test(node.attrs.a.class || '');

  // Numéros par chapitre : réglage du document, porté par ses équations numérotées (data-chap).
  function chaptersOn(doc) {
    let on = false;
    doc.descendants((node) => {
      if (on || node.isTextblock) return false;
      if (node.type === N.raw_block) { if (isMathHtml(node.attrs.html) && NUMBERED.test(node.attrs.html) && CHAP.test(node.attrs.html)) on = true; return false; }
      return true;
    });
    return on;
  }

  // Numéros attendus, dans l'ordre du texte : [position, nœud, numéro, par chapitre].
  // Par chapitre : le compte repart à chaque titre de niveau 1 ; « (2.1) » dans le chapitre 2, « (1) » avant
  // le premier chapitre ou sous un titre sans numéro.
  function numbering(doc) {
    const chap = chaptersOn(doc);
    let n = 0;
    let chapters = 0;
    let label = '';
    const fixes = [];
    doc.descendants((node, pos) => {
      if (chap && isChapter(node)) {
        n = 0;
        if (node.attrs.a['data-nonum'] !== undefined) label = '';
        else label = chapterLabel(++chapters);
      }
      if (node.isTextblock) return false;
      if (node.type === N.raw_block) {
        if (isMathHtml(node.attrs.html)) {
          const numbered = NUMBERED.test(node.attrs.html);
          const want = numbered ? `(${chap && label ? label + '.' : ''}${++n})` : '';
          const have = (EQ.exec(node.attrs.html) || [])[1] || '';
          const wantChap = numbered && chap;
          if (want !== have || wantChap !== CHAP.test(node.attrs.html)) fixes.push([pos, node, want, wantChap]);
        }
        return false;
      }
      return true;
    });
    return fixes;
  }

  // Numéros par chapitre ou non, pour toutes les équations numérotées du document.
  function setChapters(on) {
    const v = M.view;
    const tr = v.state.tr;
    v.state.doc.descendants((node, pos) => {
      if (node.isTextblock) return false;
      if (node.type === N.raw_block) {
        if (isMathHtml(node.attrs.html) && NUMBERED.test(node.attrs.html) && CHAP.test(node.attrs.html) !== on) {
          tr.setNodeMarkup(pos, null, { html: setEq(node.attrs.html, (EQ.exec(node.attrs.html) || [])[1] || '', on) }, node.marks);
        }
        return false;
      }
      return true;
    });
    if (tr.docChanged) v.dispatch(tr);
  }

  function renumber(state) {
    const fixes = numbering(state.doc);
    if (!fixes.length) return null;
    const tr = state.tr;
    for (const [pos, node, eq, chap] of fixes) tr.setNodeMarkup(pos, null, { html: setEq(node.attrs.html, eq, chap) }, node.marks);
    return tr;
  }

  // Document ouvert : numéros posés (ils ne sont pas toujours enregistrés, ou l'ont été avant un changement).
  M.onLoad(() => {
    const tr = renumber(M.view.state);
    if (tr) M.view.dispatch(tr.setMeta('addToHistory', false));
  });

  M.addPlugin(new Plugin({
    props: {
      handleKeyDown: keyDown,
      handleDOMEvents: { contextmenu: menu }
    },
    appendTransaction(trs, oldState, newState) {
      if (!trs.some((t) => t.docChanged)) return null;
      return renumber(newState);
    }
  }), true);

  window.FTFormuleVue = {
    // Vues d'équation (moteur/generes.js pour raw_block, et raw_inline).
    isMath,
    isMathHtml,
    view: (node, v, getPos) => mathView(node, v, getPos),
    // Équation affichée à cette position, entrée pour la modifier.
    edit(el, at) { const ctl = views.get(el); return ctl ? ctl.begin(at || 'end') : false; },
    active: () => (active ? active.dom : null),
    finish() { if (active) active.finish(null); },
    numbering,
    chapters: () => chaptersOn(M.view.state.doc),
    setChapters
  };
})();
