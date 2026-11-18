// Légendes numérotées et table des illustrations.
// Une légende numérotée porte son numéro dans data-cap (« Figure 2 », « Schéma 1 », « Tableau 3 »),
// refait à chaque modification et affiché devant le texte par la feuille de style :
//  - légende d'une image ou d'un schéma : .ft-image[data-num="figure" | "schema"] > .ft-caption ;
//  - légende d'un tableau : paragraphe p.ft-legend[data-kind="tableau"] juste au-dessus du tableau.
// La table des illustrations (div.ft-lof, non modifiable) liste ces légendes, avec leur page en mode
// avancé, comme le plan (toc.js). data-kind sur le bloc : « tout », « figure », « schema » ou « tableau ».
(function () {
  let editor = document.getElementById('editor');
  const workspace = document.getElementById('workspace');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const regen = (fn) => (G ? G.regen(fn) : fn());

  const LABEL = { figure: 'Figure', schema: 'Schéma', tableau: 'Tableau' };
  const TITLES = { tout: 'Table des illustrations', figure: 'Table des figures', schema: 'Table des schémas', tableau: 'Liste des tableaux' };
  const KINDS = Object.keys(TITLES);
  const SEP = ' : ';

  // Les légendes numérotées, dans l'ordre du texte : { el, kind, box } (box : l'objet légendé).
  function captions() {
    const out = [];
    for (const el of editor.querySelectorAll('.ft-image[data-num] > .ft-caption, p.ft-legend[data-kind]')) {
      const legend = el.classList.contains('ft-legend');
      const kind = legend ? el.dataset.kind : el.parentElement.dataset.num;
      if (!LABEL[kind] || el.closest('.ft-lof, .ft-footnotes, .ft-endnotes')) continue;
      out.push({ el, kind, box: legend ? el : el.parentElement });
    }
    return out;
  }

  // Numéros : un compte par sorte, dans l'ordre du texte. Ne touche qu'aux numéros qui changent.
  function renumber() {
    return regen(() => {
      const count = {};
      const list = captions().map((c) => {
        const n = (count[c.kind] = (count[c.kind] || 0) + 1);
        const tag = `${LABEL[c.kind]} ${n}`;
        if (c.el.dataset.cap !== tag) c.el.dataset.cap = tag;
        return { ...c, n, tag };
      });
      const live = new Set(list.map((c) => c.el));
      editor.querySelectorAll('[data-cap]').forEach((el) => { if (!live.has(el)) delete el.dataset.cap; });
      return list;
    });
  }

  const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  function pageOf(el) {
    const n = window.FTPages && window.FTPages.pageNumberOf ? window.FTPages.pageNumberOf(el) : null;
    return n === null || n === undefined ? '' : String(n);
  }

  function build(kind, list) {
    const out = [];
    const label = document.createElement('div');
    label.className = 'ft-lof-label';
    label.textContent = TITLES[kind] || TITLES.tout;
    out.push(label);
    const rows = list.filter((c) => kind === 'tout' || c.kind === kind);
    for (const c of rows) {
      const row = document.createElement('div');
      row.className = 'ft-lof-item';
      row.dataset.target = list.indexOf(c);
      const t = document.createElement('span');
      t.className = 'ft-lof-text';
      const text = textOf(c.el);
      t.textContent = text ? c.tag + SEP + text : c.tag;
      row.append(t);
      const page = pageOf(c.box);
      if (page) {
        const p = document.createElement('span');
        p.className = 'ft-lof-page';
        p.textContent = page;
        row.append(p);
      }
      out.push(row);
    }
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'ft-lof-empty';
      empty.textContent = kind === 'tableau' ? 'Aucun tableau légendé.' : 'Aucune illustration légendée.';
      out.push(empty);
    }
    return out;
  }

  // Ne touche aux tables que si elles ont changé (sinon le découpage en pages recommencerait sans fin).
  function refresh() {
    return regen(() => {
      const list = renumber();
      for (const lof of editor.querySelectorAll('.ft-lof')) {
        if (!KINDS.includes(lof.dataset.kind)) lof.dataset.kind = 'tout';
        if (lof.getAttribute('contenteditable') !== 'false') lof.setAttribute('contenteditable', 'false');
        const fresh = document.createElement('div');
        fresh.append(...build(lof.dataset.kind, list));
        if (lof.innerHTML !== fresh.innerHTML) lof.innerHTML = fresh.innerHTML;
      }
      return list;
    });
  }

  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
  editor.addEventListener('input', () => { renumber(); later(); });
  document.addEventListener('ft-paginated', () => { if (!G && editor.querySelector('.ft-lof')) refresh(); });

  const changed = () => { refresh(); editor.dispatchEvent(new Event('input')); };
  const commit = () => { if (window.FTHistory) window.FTHistory.commit(); };

  // Bloc du haut qui contient le curseur (ou le dernier bloc).
  function topAtCaret() {
    const sel = window.getSelection();
    let node = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (!node || !editor.contains(node)) node = editor.lastChild;
    while (node && node.parentNode && node.parentNode !== editor && !(node.parentNode.classList && node.parentNode.classList.contains('ft-cols'))) node = node.parentNode;
    return node && node.parentNode ? node : null;
  }

  function caretTo(el, atEnd = false) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(!atEnd);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Insère une table des illustrations à l'endroit du curseur.
  function insert(kind = 'tout') {
    if (G) {
      const lof = document.createElement('div');
      lof.className = 'ft-lof';
      lof.dataset.kind = KINDS.includes(kind) ? kind : 'tout';
      lof.setAttribute('contenteditable', 'false');
      lof.append(...build(lof.dataset.kind, captions().map((c, i) => ({ ...c, tag: c.el.dataset.cap || LABEL[c.kind] + ' ' + (i + 1) }))));
      return G.insertBlock(lof);
    }
    editor.focus({ preventScroll: true });
    const node = topAtCaret();
    commit();
    const lof = document.createElement('div');
    lof.className = 'ft-lof';
    lof.dataset.kind = KINDS.includes(kind) ? kind : 'tout';
    lof.setAttribute('contenteditable', 'false');
    const empty = node && node.nodeType === Node.ELEMENT_NODE && node.matches('p, div:not(.ft-lof):not(.ft-toc):not(.ft-cover)') && !node.textContent.trim() && !node.querySelector('img, .ft-math, .ft-image');
    if (!node) editor.append(lof);
    else if (empty) node.before(lof);
    else node.after(lof);
    let next = lof.nextElementSibling;
    while (next && next.classList.contains('ft-pg-gap')) next = next.nextElementSibling;
    if (!next || next.matches('.ft-footnotes, .ft-endnotes, .ft-toc, .ft-lof, table')) {
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      lof.after(next);
    }
    caretTo(next);
    changed();
  }

  function setKind(lof, kind) {
    if (G) { G.edit(() => { lof.dataset.kind = kind; }); G.soon(0); return; }
    commit();
    lof.dataset.kind = kind;
    changed();
  }

  function remove(el) {
    if (G) { G.edit(() => el.remove()); return; }
    commit();
    el.remove();
    changed();
  }

  // ----- Légende d'un tableau -----

  const prevBlock = (el) => {
    let p = el.previousElementSibling;
    while (p && p.classList.contains('ft-pg-gap')) p = p.previousElementSibling;
    return p;
  };
  const nextBlock = (el) => {
    let n = el.nextElementSibling;
    while (n && n.classList.contains('ft-pg-gap')) n = n.nextElementSibling;
    return n;
  };
  const legendOf = (table) => { const p = prevBlock(table); return p && p.matches('p.ft-legend') ? p : null; };

  function addLegend(table) {
    let legend = legendOf(table);
    if (G) {
      G.edit(() => {
        if (!legend) {
          legend = document.createElement('p');
          legend.className = 'ft-legend';
          legend.dataset.kind = 'tableau';
          table.before(legend);
        }
        caretTo(legend, true);
      });
      editor.focus({ preventScroll: true });
      G.soon(0);
      return;
    }
    if (!legend) {
      commit();
      legend = document.createElement('p');
      legend.className = 'ft-legend';
      legend.dataset.kind = 'tableau';
      legend.appendChild(document.createElement('br'));
      table.before(legend);
      changed();
    }
    editor.focus({ preventScroll: true });
    caretTo(legend, true);
  }

  function removeLegend(table) {
    const legend = legendOf(table);
    if (legend) remove(legend);
  }

  // Entrée dans la légende d'un tableau : on passe dans le tableau (pas de nouvelle légende).
  // Retour arrière dans une légende vide : elle disparaît.
  editor.addEventListener('keydown', (e) => {
    if (G || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key !== 'Enter' && e.key !== 'Backspace') return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const n = sel.anchorNode;
    const legend = (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement).closest('p.ft-legend');
    if (!legend || !editor.contains(legend)) return;
    const table = nextBlock(legend);
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (table && table.tagName === 'TABLE' && table.rows[0]) caretTo(table.rows[0].cells[0]);
      else {
        commit();
        const p = document.createElement('p');
        p.appendChild(document.createElement('br'));
        legend.after(p);
        caretTo(p);
        changed();
      }
    } else if (!textOf(legend) && !legend.querySelector('img')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const dest = table && table.tagName === 'TABLE' && table.rows[0] ? table.rows[0].cells[0] : prevBlock(legend);
      remove(legend);
      if (dest) caretTo(dest, dest.tagName !== 'TD' && dest.tagName !== 'TH');
    }
  }, true);

  // ----- Clic sur une ligne de la table : on va à la légende -----

  function targetOf(row) {
    const c = captions()[Number(row.dataset.target)];
    return c ? c.box : null;
  }

  function onClick(e) {
    const row = e.target.closest && e.target.closest('.ft-lof-item');
    if (!row || !editor.contains(row) || document.getElementById('app').classList.contains('reading-mode')) return;
    e.preventDefault();
    const target = targetOf(row);
    if (!target) return;
    if (G) {
      G.reveal(target, 60);
      G.flash(target);
      return;
    }
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += target.getBoundingClientRect().top - box.top - 60;
    target.classList.remove('ft-toc-flash');
    void target.offsetWidth;
    target.classList.add('ft-toc-flash');
    setTimeout(() => target.classList.remove('ft-toc-flash'), 1300);
  }
  editor.addEventListener('click', onClick);

  // ----- Menus -----

  const check = (on, text) => (on ? '✓ ' : '  ') + text;

  // Bouton de la barre d'insertion : les quatre tables.
  const btn = document.getElementById('lof-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const r = btn.getBoundingClientRect();
    window.FTSidebar.showMenu(r.left, r.bottom + 2, [
      { label: 'Insérer' },
      ...KINDS.map((k) => ({ text: TITLES[k], action: () => insert(k) })),
      '-',
      { explain: 'Les légendes se numérotent depuis le clic droit sur une image, un schéma ou un tableau.' }
    ]);
  });

  window.FTCaptions = {
    // Moteur 2.0 : numéros et tables du nouveau moteur, refaits après chaque modification du texte.
    useEngine(mount, api) {
      editor.removeEventListener('click', onClick);
      mount.addEventListener('click', onClick);
      editor = mount;
      G = api;
      api.add(refresh);
    },
    refresh,
    renumber,
    insert,
    list: () => renumber().map(({ el, kind, box, n, tag }) => ({ el, kind, box, n, tag, text: textOf(el) })),
    targetOf,
    label: (kind) => LABEL[kind] || '',
    legendOf,
    // Clic droit dans un tableau (structure.js).
    tableItems(table) {
      const legend = legendOf(table);
      return legend
        ? [{ text: 'Supprimer la légende du tableau', action: () => removeLegend(table) }]
        : [{ text: 'Ajouter une légende (Tableau n)', action: () => addLegend(table) }];
    },
    // Clic droit sur une table des illustrations (structure.js).
    menuItems(target) {
      const lof = target.closest && target.closest('.ft-lof');
      if (!lof || !editor.contains(lof)) return [];
      return [
        { label: TITLES[lof.dataset.kind] || TITLES.tout },
        { text: 'Contenu', submenu: () => KINDS.map((k) => ({ text: check(lof.dataset.kind === k, TITLES[k]), action: () => setKind(lof, k) })) },
        { text: 'Mettre à jour', action: refresh },
        { text: 'Supprimer la table', danger: true, action: () => remove(lof) }
      ];
    }
  };
})();
