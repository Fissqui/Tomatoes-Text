// Trier une liste, ou des lignes sélectionnées : de A à Z, de Z à A, par date ou par nombre.
// Une ligne sans date (ou sans nombre) va à la fin, dans son ordre d'origine. Les sous-listes
// suivent leur ligne ; les cases cochées restent cochées.
(function () {
  let editor = document.getElementById('editor');
  // Moteur 2.0 : les lignes sont rangées sur le texte affiché, relu d'un coup par le moteur (useEngine).
    const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base', ignorePunctuation: false });

  const MODES = [
    ['az', 'De A à Z'], ['za', 'De Z à A'],
    ['date', 'Par date (plus ancienne en premier)'], ['date-desc', 'Par date (plus récente en premier)'],
    ['num', 'Par nombre (croissant)'], ['num-desc', 'Par nombre (décroissant)']
  ];

  const MONTHS = [
    ['janvier', 'janv', 'january', 'jan'], ['février', 'fevrier', 'févr', 'fevr', 'february', 'feb'], ['mars', 'march', 'mar'],
    ['avril', 'avr', 'april', 'apr'], ['mai', 'may'], ['juin', 'june', 'jun'], ['juillet', 'juil', 'july', 'jul'],
    ['août', 'aout', 'august', 'aug'], ['septembre', 'sept', 'september', 'sep'], ['octobre', 'oct', 'october'],
    ['novembre', 'nov', 'november'], ['décembre', 'decembre', 'déc', 'dec', 'december']
  ];
  const MONTH_OF = new Map(MONTHS.flatMap((names, i) => names.map((n) => [n, i + 1])));
  const MONTH_RE = [...MONTH_OF.keys()].sort((a, b) => b.length - a.length).join('|');
  const year = (y) => (y.length <= 2 ? (Number(y) < 50 ? 2000 : 1900) + Number(y) : Number(y));
  const stamp = (y, m, d) => y * 10000 + m * 100 + d;

  // La première date du texte, en nombre comparable (aaaammjj), ou null.
  function dateOf(text) {
    const t = text.toLowerCase();
    let m = t.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) return stamp(+m[1], +m[2], +m[3]);
    m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
    if (m && +m[2] <= 12) return stamp(year(m[3]), +m[2], +m[1]);
    m = t.match(new RegExp(`(?:\\b(\\d{1,2})(?:er)?\\s+)?\\b(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?(?![\\p{L}])`, 'u'));
    if (m && (m[1] || m[3])) return stamp(m[3] ? +m[3] : 0, MONTH_OF.get(m[2]), m[1] ? +m[1] : 0);
    m = t.match(/\b(\d{1,2})[/.-](\d{4})\b/);
    if (m && +m[1] <= 12) return stamp(+m[2], +m[1], 0);
    m = t.match(/\b(1\d{3}|2\d{3})\b/);
    if (m) return stamp(+m[1], 0, 0);
    return null;
  }

  // Le premier nombre du texte : espaces des milliers, virgule ou point décimal, signe moins.
  function numberOf(text) {
    const m = text.match(/[-−]?\d{1,3}(?:[   ]\d{3})+(?:[,.]\d+)?|[-−]?\d+(?:[,.]\d+)?/);
    if (!m) return null;
    return Number(m[0].replace(/[   ]/g, '').replace(',', '.').replace('−', '-'));
  }

  // Texte propre à une ligne (sans ses sous-listes), sans guillemets ni tirets au début.
  function keyText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('ul, ol, .ft-fn-ref, sup').forEach((n) => n.remove());
    return c.textContent.replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+/u, '');
  }

  function order(items, mode) {
    const rows = items.map((el, i) => ({ el, i, text: keyText(el) }));
    const desc = mode === 'za' || mode.endsWith('-desc');
    if (mode === 'az' || mode === 'za') {
      rows.sort((a, b) => (desc ? -1 : 1) * collator.compare(a.text, b.text) || a.i - b.i);
      return rows.map((r) => r.el);
    }
    const value = mode.startsWith('date') ? dateOf : numberOf;
    rows.forEach((r) => { r.v = value(r.text); });
    rows.sort((a, b) => {
      if (a.v === null || b.v === null) return (a.v === null) - (b.v === null) || a.i - b.i;
      return (desc ? b.v - a.v : a.v - b.v) || a.i - b.i;
    });
    return rows.map((r) => r.el);
  }

  const bare = (fn) => (window.FTPages ? window.FTPages.bare(fn) : fn());

  // Range les éléments dans le nouvel ordre, à la place des anciens. Rend le nombre de lignes déplacées.
  function reorder(items, mode) {
    const sorted = order(items, mode);
    if (sorted.every((el, i) => el === items[i])) return 0;
    return engine ? engine(items, sorted) : place(items, sorted);
  }
  // Moteur 2.0 : les lignes (côte à côte) sont remises dans le nouvel ordre en une étape d'annulation.
  let engine = null;
  function engineOrder(bridge, items, sorted) {
    const M = window.FTMoteur;
    const view = M.view;
    const doc = view.state.doc;
    const pos = items.map((el) => bridge.posOf(el));
    const nodes = pos.map((p) => (p === null ? null : doc.nodeAt(p)));
    if (nodes.some((n) => !n)) return 0;
    const from = pos[0];
    const to = pos[pos.length - 1] + nodes[nodes.length - 1].nodeSize;
    if (nodes.reduce((sum, n) => sum + n.nodeSize, 0) !== to - from) return 0;
    const byEl = new Map(items.map((el, i) => [el, nodes[i]]));
    const tr = view.state.tr.replaceWith(from, to, sorted.map((el) => byEl.get(el)));
    view.dispatch(PM.history.closeHistory(tr));
    M.closeHistory();
    view.focus();
    return sorted.length;
  }
  function place(items, sorted) {
    if (window.FTHistory) window.FTHistory.commit();
    bare(() => {
      const marks = items.map((el) => { const m = document.createComment('tri'); el.before(m); return m; });
      sorted.forEach((el, i) => marks[i].replaceWith(el));
    });
    editor.dispatchEvent(new Event('input'));
    // Après un clic dans un menu, Ctrl+Z doit agir tout de suite sur le texte.
    if (document.activeElement !== editor) editor.focus({ preventScroll: true });
    return sorted.length;
  }

  function listItems(list) {
    return [...list.children].filter((c) => c.tagName === 'LI');
  }

  // Lignes sélectionnées : au moins deux paragraphes (ou lignes d'une même liste) côte à côte.
  function selectedLines() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const el = (n) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : n);
    const a = el(r.startContainer).closest('li, p');
    const b = el(r.endContainer).closest('li, p');
    if (!a || !b || a === b || a.parentElement !== b.parentElement || !editor.contains(a)) return null;
    if (a.closest('.ft-footnotes, .ft-endnotes, .ft-biblio, .ft-toc, .ft-cover')) return null;
    const out = [];
    let on = false;
    for (const c of a.parentElement.children) {
      if (c === a) on = true;
      if (on && !c.classList.contains('ft-pg-gap')) {
        // Un titre, un tableau… au milieu : pas de tri (on ne mélange pas les sortes de lignes).
        if (c.tagName !== a.tagName) return null;
        out.push(c);
      }
      if (c === b) break;
    }
    return out.length > 1 ? out : null;
  }

  // La liste du curseur (au niveau de la ligne du curseur).
  function caretList() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    const n = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
    const li = n.closest('li');
    return li && editor.contains(li) && !li.closest('.ft-footnotes, .ft-toc') ? li.parentElement : null;
  }

  // Bouton du menu « Structure » : les lignes sélectionnées, sinon la liste du curseur.
  function sortHere(mode) {
    const lines = selectedLines();
    if (lines) return reorder(lines, mode);
    const list = caretList();
    return list ? reorder(listItems(list), mode) : 0;
  }

  const submenu = (run) => () => MODES.map(([mode, label]) => ({ text: label, action: () => run(mode) }));

  window.FTSort = {
    MODES,
    dateOf,
    numberOf,
    sortHere,
    useEngine(mount, bridge) {
      editor = mount;
      engine = (items, sorted) => engineOrder(bridge, items, sorted);
    },
    // Clic droit sur une ligne de liste.
    listItem: (li) => ({ text: 'Trier la liste', submenu: submenu((mode) => reorder(listItems(li.parentElement), mode)) }),
    // Clic droit avec plusieurs lignes sélectionnées.
    selectionItems() {
      const lines = selectedLines();
      return lines ? [{ text: 'Trier les lignes sélectionnées', submenu: submenu((mode) => reorder(lines, mode)) }] : [];
    }
  };
})();
