// Renvois : « voir tableau 3 », « voir page 12 », « figure 2, page 8 »… qui se mettent à jour seuls.
// Un renvoi est un petit bloc non modifiable dans le texte :
//   span.ft-xref[data-target][data-show][data-upper]
// data-target : « x:<id> » (titre ou objet légendé, qui porte data-xid="<id>") ou « bm:<id> » (signet, data-bm).
// data-show : « label » (tableau 3, 2.1, « Titre »), « page » (page 12 ; ci-dessus / ci-dessous en mode
// note), « label-page » (tableau 3, page 12) ou « text » (texte de la légende ou du titre).
// Ctrl+clic : aller à la cible ; double-clic : modifier le renvoi.
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  const workspace = $('workspace');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const regen = (fn) => (G ? G.regen(fn) : fn());
  const dialog = $('xref-dialog');
  const listBox = $('xr-list');
  const search = $('xr-search');
  const formatsBox = $('xr-formats');
  const upperBox = $('xr-upper');
  const preview = $('xr-preview');
  const okBtn = $('xr-ok');

  const HEADINGS = 'h1, h2, h3, h4, h5';
  const OUTSIDE = '.ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-footnotes, .ft-endnotes, .ft-biblio';
  const GROUPS = [['titre', 'Titres'], ['figure', 'Figures'], ['schema', 'Schémas'], ['tableau', 'Tableaux'], ['signet', 'Signets']];
  const FORMATS = {
    titre: [['page', 'Page'], ['label', 'Numéro ou titre'], ['label-page', 'Numéro ou titre, et page'], ['text', 'Texte du titre']],
    legende: [['label', 'Numéro (tableau 3)'], ['page', 'Page'], ['label-page', 'Numéro et page'], ['text', 'Texte de la légende']],
    signet: [['page', 'Page'], ['label', 'Nom du signet'], ['label-page', 'Nom et page']]
  };
  const BROKEN = 'renvoi introuvable';

  const newId = () => Math.random().toString(36).slice(2, 9);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const commit = () => { if (window.FTHistory) window.FTHistory.commit(); };
  const changed = () => editor.dispatchEvent(new Event('input'));
  const family = (kind) => (kind === 'titre' ? 'titre' : kind === 'signet' ? 'signet' : 'legende');

  // ----- Cibles -----

  // Toutes les cibles possibles, dans l'ordre du texte : { kind, el, label, text, level }.
  function targets() {
    const caps = window.FTCaptions ? window.FTCaptions.list() : [];
    const byBox = new Map(caps.map((c) => [c.box, c]));
    const nums = window.FTStructure && window.FTStructure.headingNumbers ? window.FTStructure.headingNumbers(editor) : new Map();
    const out = [];
    for (const el of editor.querySelectorAll(`${HEADINGS}, .ft-image[data-num], p.ft-legend[data-kind], [data-bm]`)) {
      if (el.closest(OUTSIDE)) continue;
      if (el.matches(HEADINGS) && clean(el.textContent)) {
        out.push({ kind: 'titre', el, num: (nums.get(el) || '').replace(/\.$/, ''), text: clean(el.textContent), level: el.classList.contains('ft-title') ? 0 : Number(el.tagName[1]) });
      }
      const c = byBox.get(el);
      if (c) out.push({ kind: c.kind, el, tag: c.tag, text: c.text });
      if (el.dataset.bm) out.push({ kind: 'signet', el, bm: el.dataset.bm, text: el.dataset.bmName || 'Signet', excerpt: clean(el.textContent) });
    }
    return out;
  }

  const keyOf = (t) => (t.kind === 'signet' ? 'bm:' + t.bm : t.el.dataset.xid ? 'x:' + t.el.dataset.xid : null);

  function resolve(key) {
    if (!key) return null;
    const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (!/^[\w-]+$/.test(id)) return null;
    const el = editor.querySelector(type === 'bm' ? `[data-bm="${id}"]` : `[data-xid="${id}"]`);
    return el && !el.closest(OUTSIDE) ? el : null;
  }

  // Entrée au milieu d'un titre : le navigateur recopie data-xid sur la nouvelle ligne. On le garde sur la première.
  function tidy() {
    const seen = new Set();
    for (const el of editor.querySelectorAll('[data-xid]')) {
      if (seen.has(el.dataset.xid)) delete el.dataset.xid;
      else seen.add(el.dataset.xid);
    }
  }

  // ----- Texte d'un renvoi -----

  function describe(span, cache) {
    const key = span.dataset.target;
    const el = resolve(key);
    if (!el) return { text: BROKEN, broken: true };
    const t = key.startsWith('bm:')
      ? cache.all.find((x) => x.kind === 'signet' && x.el === el)
      : cache.all.find((x) => x.kind !== 'signet' && x.el === el);
    if (!t) return { text: BROKEN, broken: true };
    return { text: textFor(t, span.dataset.show || 'label', !!span.dataset.upper, span), broken: false, target: t };
  }

  // Texte d'un renvoi vers la cible t, placé à l'endroit ref (pour « ci-dessus » / « ci-dessous »).
  function textFor(t, show, upper, ref) {
    const el = t.el;
    let label;
    if (t.kind === 'titre') label = t.num || `« ${t.text} »`;
    else if (t.kind === 'signet') label = `« ${t.text} »`;
    else label = t.tag.charAt(0).toLowerCase() + t.tag.slice(1);
    const paged = window.FTPages && window.FTPages.isPaged();
    let where;
    if (paged) where = 'page ' + (window.FTPages.pageNumberOf(el) || '?');
    else where = ref && el.compareDocumentPosition(ref) & Node.DOCUMENT_POSITION_FOLLOWING ? 'ci-dessus' : 'ci-dessous';
    let text;
    if (show === 'page') text = where;
    else if (show === 'label-page') text = label + (paged ? ', ' : ' ') + where;
    else if (show === 'text') text = t.text || label;
    else text = label;
    if (upper) text = text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  }

  const KIND_NAMES = { titre: 'titre', figure: 'figure', schema: 'schéma', tableau: 'tableau', signet: 'signet' };

  // Met les renvois à jour (seulement ceux qui changent).
  let streak = 0;
  function refresh() {
    return regen(refreshNow);
  }
  function refreshNow() {
    tidy();
    const spans = editor.querySelectorAll('span.ft-xref');
    if (!spans.length) return false;
    const cache = { all: targets() };
    let any = false;
    for (const span of spans) {
      if (span.getAttribute('contenteditable') !== 'false') span.setAttribute('contenteditable', 'false');
      const d = describe(span, cache);
      if (span.textContent !== d.text) { span.textContent = d.text; any = true; }
      span.classList.toggle('ft-xref-broken', d.broken);
      const title = d.broken
        ? 'Renvoi dont la cible a été supprimée (double-clic : choisir une autre cible)'
        : `Renvoi vers ${KIND_NAMES[d.target.kind]} : ${clip(d.target.text || d.target.tag || '', 60)} (Ctrl+clic : y aller ; double-clic : modifier)`;
      if (span.title !== title) span.title = title;
    }
    return any;
  }

  let timer = null;
  editor.addEventListener('input', () => { streak = 0; clearTimeout(timer); timer = setTimeout(refresh, 250); });
  // Pages refaites : les numéros de page des renvois peuvent changer. Un renvoi qui change de longueur
  // peut lui-même déplacer le texte : on s'arrête après quelques tours.
  document.addEventListener('ft-paginated', () => {
    if (G || streak > 3) return;
    if (refresh()) streak++;
    else streak = 0;
  });

  // ----- Fenêtre « Renvoi » -----

  let state = null; // { span (renvoi modifié) | null, range (endroit d'insertion), choice (cible), show, upper }

  function rowsFor(all, query) {
    const q = query.toLowerCase();
    const match = (t) => !q || [t.text, t.tag, t.num, t.excerpt].some((s) => s && s.toLowerCase().includes(q));
    const parts = [];
    for (const [kind, title] of GROUPS) {
      const items = all.filter((t) => t.kind === kind && match(t));
      if (!items.length) continue;
      parts.push(Object.assign(document.createElement('div'), { className: 'xr-group', textContent: title }));
      for (const t of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'xr-item';
        row.setAttribute('role', 'option');
        if (t.kind === 'titre') row.style.paddingLeft = 8 + Math.max(0, t.level - 1) * 14 + 'px';
        const main = t.kind === 'titre' ? (t.num ? t.num + ' ' : '') + t.text : t.kind === 'signet' ? t.text : t.tag + (t.text ? ' : ' + t.text : '');
        row.textContent = clip(main, 90);
        if (t.kind === 'signet' && t.excerpt) {
          const ex = document.createElement('span');
          ex.className = 'xr-excerpt';
          ex.textContent = clip(t.excerpt, 60);
          row.append(ex);
        }
        const selected = state.choice && state.choice.el === t.el && state.choice.kind === t.kind;
        row.setAttribute('aria-selected', String(!!selected));
        row.addEventListener('click', () => choose(t));
        row.addEventListener('dblclick', () => { choose(t); confirm(); });
        parts.push(row);
      }
    }
    if (!parts.length) parts.push(Object.assign(document.createElement('div'), { className: 'xr-empty', textContent: all.length ? 'Aucune cible trouvée.' : 'Aucune cible : ajoutez des titres, des légendes numérotées ou des signets.' }));
    return parts;
  }

  function paint() {
    state.all = state.all || targets();
    listBox.replaceChildren(...rowsFor(state.all, search.value.trim()));
    const fam = state.choice ? family(state.choice.kind) : 'legende';
    const list = FORMATS[fam];
    if (!list.some(([v]) => v === state.show)) state.show = list[0][0];
    formatsBox.replaceChildren(...list.map(([v, t]) => {
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'xr-format', value: v, checked: state.show === v, disabled: !state.choice });
      input.addEventListener('change', () => { state.show = v; showPreview(); });
      const label = document.createElement('label');
      label.className = 'pop-check';
      label.append(input, ' ' + t);
      return label;
    }));
    upperBox.checked = !!state.upper;
    upperBox.disabled = !state.choice;
    okBtn.disabled = !state.choice;
    showPreview();
  }

  function showPreview() {
    if (!state.choice) { preview.textContent = 'Choisissez la cible du renvoi.'; preview.classList.add('muted'); return; }
    preview.classList.remove('muted');
    const ref = state.span || (state.range && state.range.startContainer);
    preview.textContent = 'voir ' + textFor(state.choice, state.show, state.upper, ref && editor.contains(ref) ? ref : null);
  }

  function choose(t) {
    state.choice = t;
    if (!state.span) state.show = family(t.kind) === 'legende' ? 'label' : 'page';
    paint();
  }

  function open(span = null) {
    if (!window.FTApp || !window.FTApp.currentId()) return;
    const sel = window.getSelection();
    let range = null;
    if (!span && sel.rangeCount && editor.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0).cloneRange();
      range.collapse(false);
    }
    state = { span, range, choice: null, show: span ? span.dataset.show || 'label' : 'label', upper: !!(span && span.dataset.upper), all: targets() };
    if (span) {
      const el = resolve(span.dataset.target);
      state.choice = el ? state.all.find((t) => t.el === el && (span.dataset.target.startsWith('bm:') ? t.kind === 'signet' : t.kind !== 'signet')) || null : null;
    }
    search.value = '';
    okBtn.textContent = span ? 'Appliquer' : 'Insérer';
    paint();
    if (!dialog.open) dialog.showModal();
    search.focus();
    const sel2 = listBox.querySelector('[aria-selected="true"]');
    if (sel2) sel2.scrollIntoView({ block: 'center' });
  }

  function confirm() {
    if (!state || !state.choice) return;
    if (G) {
      const s = state;
      dialog.close();
      G.edit(() => { state = s; place(); state = null; });
      G.soon(0);
      return;
    }
    commit();
    place();
    dialog.close();
    state = null;
    refresh();
    changed();
  }

  function place() {
    const t = state.choice;
    if (t.kind !== 'signet' && !t.el.dataset.xid) t.el.dataset.xid = newId();
    const key = keyOf(t);
    let span = state.span;
    if (!span) {
      span = document.createElement('span');
      span.className = 'ft-xref';
      span.setAttribute('contenteditable', 'false');
      let r = state.range;
      if (!r || !editor.contains(r.startContainer)) {
        r = document.createRange();
        r.selectNodeContents(editor.lastElementChild || editor);
        r.collapse(false);
      }
      r.insertNode(span);
      // Le curseur après le renvoi, prêt à continuer la phrase.
      const after = document.createRange();
      after.setStartAfter(span);
      after.collapse(true);
      editor.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(after);
    }
    span.dataset.target = key;
    span.dataset.show = state.show;
    if (state.upper) span.dataset.upper = '1'; else delete span.dataset.upper;
  }

  search.addEventListener('input', () => { if (state) paint(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = listBox.querySelector('.xr-item'); if (state.choice) confirm(); else if (first) first.click(); }
  });
  upperBox.addEventListener('change', () => { if (state) { state.upper = upperBox.checked; showPreview(); } });
  okBtn.addEventListener('click', confirm);
  $('xr-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { state = null; });

  // ----- Dans le texte -----

  function go(span) {
    const el = resolve(span.dataset.target);
    if (!el) return;
    if (G) { G.reveal(el, 60); G.flash(el); return; }
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += el.getBoundingClientRect().top - box.top - 60;
    el.classList.remove('ft-toc-flash');
    void el.offsetWidth;
    el.classList.add('ft-toc-flash');
    setTimeout(() => el.classList.remove('ft-toc-flash'), 1300);
  }

  const reading = () => $('app').classList.contains('reading-mode');
  function onClick(e) {
    const span = e.target.closest && e.target.closest('span.ft-xref');
    if (!span || !editor.contains(span) || reading()) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); go(span); }
  }
  function onDblClick(e) {
    const span = e.target.closest && e.target.closest('span.ft-xref');
    if (!span || !editor.contains(span) || reading()) return;
    e.preventDefault();
    open(span);
  }
  editor.addEventListener('click', onClick);
  editor.addEventListener('dblclick', onDblClick);

  function remove(span) {
    if (G) return G.edit(() => span.remove());
    commit();
    span.remove();
    changed();
  }

  const btn = $('xref-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => open());

  window.FTXref = {
    // Moteur 2.0 : renvois du nouveau moteur, refaits après chaque modification du texte.
    useEngine(mount, api) {
      for (const [type, fn] of [['click', onClick], ['dblclick', onDblClick]]) {
        editor.removeEventListener(type, fn);
        mount.addEventListener(type, fn);
      }
      editor = mount;
      G = api;
      api.add(refreshNow);
    },
    open,
    refresh,
    targetOf: (span) => resolve(span.dataset.target),
    // Clic droit sur un renvoi (structure.js).
    menuItems(target) {
      const span = target.closest && target.closest('span.ft-xref');
      if (!span || !editor.contains(span)) return [];
      return [
        { label: 'Renvoi' },
        ...(resolve(span.dataset.target) ? [{ text: 'Aller à la cible', action: () => go(span) }] : []),
        { text: 'Modifier le renvoi…', action: () => open(span) },
        { text: 'Supprimer le renvoi', danger: true, action: () => remove(span) }
      ];
    }
  };
})();
