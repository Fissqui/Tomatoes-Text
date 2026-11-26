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
  // Appel de note d'une équation sur sa propre ligne : sup.ft-fn-ref (ou ft-en-ref) après la formule.
  const REF = ':scope > sup.ft-fn-ref, :scope > sup.ft-en-ref';
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
    if (!dom.querySelector('.ML__latex') && F()) {
      const ref = dom.querySelector(REF);
      dom.innerHTML = F().render(dom.dataset.latex || '', dom.tagName === 'DIV', true);
      if (ref) dom.append(ref);
    }
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
    // ins : structure posée dès l'ouverture (cases à remplir, la première sélectionnée).
    function begin(at, joined, ins) {
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
      // Mode maths : clic droit dans l'équation, la sélection s'ajoute aux morceaux.
      field.addEventListener('contextmenu', (e) => {
        const MM = window.FTModeMaths;
        if (!MM || !MM.on()) return;
        e.preventDefault();
        e.stopPropagation();
        const part = selectedLatex(field);
        window.FTSidebar.showMenu(e.clientX, e.clientY, [
          { text: 'Ajouter aux morceaux', action: () => MM.save(part) },
          { text: 'Copier le code LaTeX', action: () => copyLatex(part) }
        ]);
      }, true);
      field.addEventListener('move-out', (e) => {
        e.preventDefault();
        const d = e.detail && e.detail.direction;
        // (Après la fin du traitement de la touche par MathLive : la zone d'écriture disparaît.)
        setTimeout(() => { if (ed && ed.field === field) finish(d === 'backward' || d === 'upward' ? 'before' : 'after'); }, 0);
      });
      field.addEventListener('focusout', () => {
        // (Clic dans la petite barre : le clavier revient dans l'équation.)
        setTimeout(() => {
          if (!ed || ed.field !== field || field.hasFocus() || barHolds) return;
          // Liste des tailles de la barre d'outils : la taille choisie va à cette équation (FTFormuleVue.setSize).
          const a = document.activeElement;
          const box = a && a.closest && a.closest('.ft-num');
          if (a && (a.id === 'font-size' || (box && box.querySelector('#font-size')))) {
            a.addEventListener('blur', () => setTimeout(() => { if (ed && ed.field === field && !field.hasFocus()) finish(null); }, 0), { once: true });
            return;
          }
          finish(null);
        }, 0);
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
        if (ins) {
          field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
          sync();
        }
        showBar(ctl);
        showSize();
      });
      return true;
    }

    // Taille de l'équation dans la liste des tailles de la barre d'outils.
    function showSize() {
      const select = document.getElementById('font-size');
      const pt = Math.round(parseFloat(getComputedStyle(dom).fontSize) * 0.75 * 4) / 4;
      if (select && pt > 0 && select.querySelector(`option[value="${pt}"]`)) select.value = String(pt);
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
      // Ctrl+G / Ctrl+B, Ctrl+I, Ctrl+U : gras, italique, souligné de toute l'équation (barre d'outils).
      const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey ? { g: 'bold', b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()] : null;
      if (cmd) {
        e.preventDefault();
        e.stopPropagation();
        const btn = document.querySelector(`[data-cmd="${cmd === 'underline' ? 'underline' : cmd}"]`);
        if (btn) btn.click();
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
      drawn.innerHTML = F().render(latex, block(), true);
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

    // Clic : l'équation s'ouvre au relâchement. Glissé : sélection, comme depuis du texte (cases d'un
    // tableau d'une case à l'autre, texte et équations ailleurs).
    function onDown(e) {
      // Appel de note d'une équation sur sa propre ligne : le clic mène à la note (moteur/notes.js).
      if (e.target.closest && e.target.closest('sup.ft-fn-ref, sup.ft-en-ref')) return;
      if (ed || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || closed()) return;
      e.preventDefault();
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
        moved = true;
        dragSelect(ev);
      };
      const up = () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        if (!moved) begin({ x: x0, y: y0 });
        else if (!v.hasFocus()) v.focus();
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    }

    function dragSelect(ev) {
      const at = pos();
      const hit = v.posAtCoords({ left: ev.clientX, top: ev.clientY });
      if (at === undefined || !hit) return;
      const doc = v.state.doc;
      const end = at + cur.nodeSize;
      const T = PM.tables;
      const cellOf = (p) => {
        const $p = doc.resolve(p);
        for (let d = $p.depth; d > 0; d--) if (/cell/.test($p.node(d).type.spec.tableRole || '')) return $p.before(d);
        return null;
      };
      const ca = cellOf(at);
      const cb = cellOf(hit.pos);
      let sel = null;
      if (ca !== null && cb !== null && ca !== cb && T && T.CellSelection) {
        try { sel = T.CellSelection.create(doc, ca, cb); } catch { sel = null; }
      }
      if (!sel) {
        // Équation comprise : l'ancre est de l'autre côté de l'équation que le pointeur.
        const down = hit.pos >= end;
        let anchor = down ? at : end;
        if (block()) {
          const near = PM.state.Selection.findFrom(doc.resolve(down ? at : end), down ? -1 : 1, true);
          if (near) anchor = near.from;
        }
        try { sel = TextSelection.between(doc.resolve(anchor), doc.resolve(hit.pos)); } catch { return; }
      }
      if (!sel.eq(v.state.selection)) v.dispatch(v.state.tr.setSelection(sel));
    }
    dom.addEventListener('mousedown', onDown);

    const ctl = {
      dom,
      begin,
      finish,
      editing: () => !!ed,
      at: () => pos(),
      field: () => (ed ? ed.field : null),
      block,
      // Réglage changé depuis la petite barre (numérotation) sans quitter l'équation.
      set(extra) {
        if (!ed) return;
        if ('size' in extra) {
          if (extra.size > 0) {
            dom.dataset.size = String(extra.size);
            dom.style.fontSize = extra.size + 'pt';
          } else {
            delete dom.dataset.size;
            dom.style.removeProperty('font-size');
            if (!dom.getAttribute('style')) dom.removeAttribute('style');
          }
        }
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
          // (Appel de note renuméroté, posé ou retiré pendant la modification.)
          const was = dom.querySelector(REF);
          const now = fresh.querySelector(REF);
          if (!now) { if (was) was.remove(); } else if (!was) dom.append(now); else if (was.outerHTML !== now.outerHTML) was.replaceWith(now);
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
    new ResizeObserver(() => placeBar()).observe(bar);
  }
  // Partie sélectionnée d'une équation en cours d'écriture (toute l'équation sans sélection).
  function selectedLatex(field) {
    try {
      if (!field.selectionIsCollapsed) return F().clean(field.getValue(field.selection, 'latex'));
    } catch { /* sélection illisible : toute l'équation */ }
    return F().clean(field.value);
  }

  function fillBar(ctl) {
    const MM = window.FTModeMaths && window.FTModeMaths.on() ? window.FTModeMaths : null;
    bar.classList.toggle('ft-math-groups', !!MM);
    // Mode maths : barre en groupes nommés (mode-maths.js).
    if (MM) {
      bar.replaceChildren(...MM.groups(ctl));
      return;
    }
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
    if (window.FTModeMaths) window.FTModeMaths.closePop();
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
    const right = window.FTModeMaths && window.FTModeMaths.on() ? window.FTModeMaths.rightEdge() : window.innerWidth;
    const left = Math.max(8, Math.min(right - b.width - 8, r.left + r.width / 2 - b.width / 2));
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

  // opts.ins : structure à poser dans la nouvelle équation ; opts.block : sur sa propre ligne.
  function insertNew(v, opts = {}) {
    const { $from, from, to, empty } = v.state.selection;
    if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false;
    const text = empty || opts.ins ? '' : v.state.doc.textBetween(from, to, ' ').trim();
    const lone = $from.parent.type === N.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
    const html = F().html({ latex: text, block: lone || !!opts.block });
    let tr = v.state.tr;
    let pos;
    if (opts.block && !lone) {
      // Ligne de texte non vide : l'équation se place sous le paragraphe (bloc du haut).
      pos = $from.after(1);
      tr.insert(pos, N.raw_block.create({ html }));
      const after = pos + 1;
      if (!(tr.doc.resolve(after).nodeAfter || {}).isTextblock) tr.insert(after, N.paragraph.create({ tag: 'p', a: {}, bare: false }));
    } else if (lone) {
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
    if (ctl) ctl.begin('end', tr.time, opts.ins);
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
      ...(window.FTModeMaths && window.FTModeMaths.on() ? [{ text: 'Ajouter aux morceaux', action: () => window.FTModeMaths.save(info.latex) }] : []),
      { text: 'Sélectionner l’équation', action: () => selectMath(v, f) },
      '-',
      { text: 'Supprimer l’équation', danger: true, action: () => F().remove(f) }
    ];
    window.FTSidebar.showMenu(e.clientX, e.clientY, items);
    return true;
  }

  // L'équation entière choisie, comme un objet : la taille du texte (barre d'outils) s'y applique ; une
  // équation sur sa ligne peut ensuite se déplacer.
  function selectMath(v, f) {
    if (f.tagName === 'DIV' && window.FTObjets && window.FTObjets.selectObject) { window.FTObjets.selectObject(f); return; }
    const ctl = views.get(f);
    const at = ctl ? ctl.at() : undefined;
    const node = at !== undefined ? v.state.doc.nodeAt(at) : null;
    if (!isMath(node)) return;
    v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, at)));
    v.focus();
  }

  // Réglages des équations du passage choisi (taille, gras, couleur…) ; tr : transaction à compléter.
  function changeIn(tr, ranges, changes) {
    let changed = false;
    for (const r of ranges) {
      tr.doc.nodesBetween(r.$from.pos, r.$to.pos, (node, pos) => {
        if (!isMath(node)) return true;
        const info = F().infoOf(node.attrs.html);
        const html = F().html({ ...info, ...changes });
        if (html !== node.attrs.html) {
          tr.setNodeMarkup(pos, null, { html });
          changed = true;
        }
        return false;
      });
    }
    return changed;
  }
  const sizeIn = (tr, ranges, pt) => changeIn(tr, ranges, { size: pt });
  // Équations du passage choisi (leurs réglages) et présence de texte à côté d'elles.
  function inSelection(state) {
    const out = { text: false, maths: [] };
    const sel = state.selection;
    if (sel.empty) return out;
    for (const r of sel.ranges) {
      state.doc.nodesBetween(r.$from.pos, r.$to.pos, (node) => {
        if (isMath(node)) { out.maths.push(F().infoOf(node.attrs.html)); return false; }
        if (node.isText && node.text.trim()) out.text = true;
        return true;
      });
    }
    return out;
  }

  function copyLatex(latex) {
    const done = () => {};
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
    redraw();
  });

  // Équations dessinées avant la 2.5.25 d'un seul morceau : redessinées pour passer à la ligne après un signe
  // quand elles sont plus larges que leur place (case de tableau…).
  function redraw() {
    if (!F() || !F().split) return;
    const v = M.view;
    const tr = v.state.tr;
    v.state.doc.descendants((node, pos) => {
      if (!isMath(node)) return true;
      const html = node.attrs.html;
      if (/ft-math-lignes/.test(html)) return false;
      const dom = fromHtml(html);
      const latex = dom && dom.dataset.latex;
      if (!latex || F().split(latex).length < 2) return false;
      const old = dom.querySelector(':scope > .ML__latex');
      const t = document.createElement('template');
      t.innerHTML = F().render(latex, dom.tagName === 'DIV', true);
      if (old) old.replaceWith(...t.content.childNodes); else dom.prepend(...t.content.childNodes);
      tr.setNodeMarkup(pos, null, { ...node.attrs, html: dom.outerHTML }, node.marks);
      return false;
    });
    if (tr.docChanged) v.dispatch(tr.setMeta('addToHistory', false));
  }

  // ----- Équations prises dans une sélection de texte -----
  // Une équation est un objet fermé : le navigateur ne la colore pas quand la sélection la traverse. Elle
  // reçoit la couleur de la sélection (ft-math-sel, styles.css) ; une sélection à la souris lâchée sur
  // une équation dans la ligne la prend en entier (le navigateur s'arrêtait juste avant elle).
  const { Decoration, DecorationSet } = PM.view;
  function selected(state) {
    const sel = state.selection;
    if (sel.empty || sel instanceof NodeSelection) return DecorationSet.empty;
    const decos = [];
    for (const r of sel.ranges) {
      state.doc.nodesBetween(r.$from.pos, r.$to.pos, (node, pos) => {
        if (isMath(node)) {
          if (pos >= r.$from.pos && pos + node.nodeSize <= r.$to.pos) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ft-math-sel' }));
          return false;
        }
        return !node.isTextblock || node.childCount > 0;
      });
    }
    return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
  }
  // Sélection à la souris : le pointeur sur une équation dans la ligne, la sélection (lue à l'écran) va
  // jusqu'à son autre bord. drag : glissement en cours (et un court instant après le relâchement, le temps
  // que le moteur relise la sélection).
  const drag = { on: false, until: 0, x: 0, y: 0 };
  function aroundMath(v, anchor, head) {
    if (!drag.on && Date.now() > drag.until) return null;
    const el = document.elementFromPoint(drag.x, drag.y);
    const f = el && el.closest('span.ft-math');
    const ctl = f && v.dom.contains(f) ? views.get(f) : null;
    const at = ctl && !ctl.editing() ? ctl.at() : undefined;
    if (at === undefined) return null;
    const node = v.state.doc.nodeAt(at);
    if (!isMath(node)) return null;
    const end = at + node.nodeSize;
    if (head > anchor && anchor <= at && head <= at) return end;
    if (head < anchor && anchor >= end && head >= end) return at;
    return null;
  }

  M.addPlugin(new Plugin({
    state: {
      init: (_, state) => selected(state),
      apply: (tr, old, oldState, state) => (tr.docChanged || tr.selectionSet ? selected(state) : old)
    },
    view(v) {
      const move = (e) => { if (drag.on) { drag.x = e.clientX; drag.y = e.clientY; } };
      const up = (e) => {
        if (!drag.on) return;
        move(e);
        drag.on = false;
        drag.until = Date.now() + 300;
        // (Après le traitement du relâchement par le moteur, qui pose la sélection lue à l'écran.)
        setTimeout(() => {
          const sel = v.state.selection;
          if (!(sel instanceof TextSelection) || sel.empty) return;
          const head = aroundMath(v, sel.anchor, sel.head);
          if (head !== null) v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, sel.anchor, head)));
        }, 0);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
      return { destroy: () => { window.removeEventListener('mousemove', move, true); window.removeEventListener('mouseup', up, true); } };
    },
    props: {
      handleKeyDown: keyDown,
      decorations(state) { return this.getState(state); },
      handleDOMEvents: {
        contextmenu: menu,
        mousedown: (v, e) => { Object.assign(drag, { on: e.button === 0 && !e.shiftKey, until: 0, x: e.clientX, y: e.clientY }); return false; }
      },
      createSelectionBetween(v, $anchor, $head) {
        const head = aroundMath(v, $anchor.pos, $head.pos);
        return head === null ? null : TextSelection.create(v.state.doc, $anchor.pos, head);
      }
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
    // Position de l'équation en cours de modification (undefined sinon).
    activeAt: () => (active ? active.at() : undefined),
    finish() { if (active) active.finish(null); },
    // Structure ou morceau inséré : dans l'équation en cours d'écriture, sinon dans une nouvelle équation au curseur.
    insert(ins, opts = {}) {
      if (closed()) return false;
      const field = active && active.field();
      if (field && !opts.fresh) {
        field.focus();
        field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
        field.dispatchEvent(new Event('input'));
        return true;
      }
      if (active) active.finish(null);
      view.focus();
      return insertNew(view, { ins, block: opts.block });
    },
    // Équations du texte, dans l'ordre : { pos, latex, block, eq }.
    list() {
      const out = [];
      view.state.doc.descendants((node, pos) => {
        if (isMath(node)) {
          const el = fromHtml(node.attrs.html);
          out.push({ pos, latex: el.dataset.latex || '', block: el.tagName === 'DIV', eq: el.dataset.eq || '' });
          return false;
        }
        return true;
      });
      return out;
    },
    copyLatex,
    selectedLatex,
    sizeIn,
    changeIn,
    inSelection,
    // Équation en cours de modification : ses réglages (null : aucune).
    editingInfo: () => (active && active.editing() ? F().infoOf(active.dom) : null),
    // Réglages choisis pendant la modification d'une équation (taille, gras…) : toute l'équation les prend.
    setInfo(changes) {
      if (!active || !active.editing()) return false;
      active.set(changes);
      const field = active.field();
      if (field) field.focus({ preventScroll: true });
      return true;
    },
    setSize(pt) { return this.setInfo({ size: pt }); },
    refreshBar() { if (barFor && bar && !bar.hidden) fillBar(barFor); },
    numbering,
    chapters: () => chaptersOn(M.view.state.doc),
    setChapters
  };
})();
