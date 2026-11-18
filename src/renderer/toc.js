// Plan du document : un bloc qui liste le titre du document (bloc « Titre du document » du texte,
// ou à défaut le nom du document) et les titres (# à #####), chacun à son étage. Il se refait tout seul quand les titres changent ; un clic sur une ligne mène au titre.
// En mode avancé, chaque ligne montre aussi le numéro de sa page.
(function () {
  let editor = document.getElementById('editor');
  const workspace = document.getElementById('workspace');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js).
  let G = null;
  const regen = (fn) => (G ? G.regen(fn) : fn());
  function flashEl(el) {
    if (G) return G.flash(el);
    el.classList.remove('ft-toc-flash');
    void el.offsetWidth;
    el.classList.add('ft-toc-flash');
    setTimeout(() => el.classList.remove('ft-toc-flash'), 1300);
  }

  // Apparence d'un plan, gardée sur le plan lui-même (attribut data-toc) : chaque plan a la sienne.
  const DEFAULT = { title: 'Plan', showTitle: true, titleStyle: 'petites-capitales', titleAlign: 'gauche', docTitle: true, levels: 5,
    font: '', size: 0, color: '', frame: 'arrondi', number: 'titres', leaders: true, indent: true };
  const PRESETS = [
    ['moderne', 'Moderne', {}],
    ['classique', 'Classique', { title: 'Table des matières', titleStyle: 'gras', titleAlign: 'centre', frame: 'aucun', number: 'titres', docTitle: false }],
    ['elegant', 'Élégant', { title: 'Sommaire', titleStyle: 'italique', titleAlign: 'centre', font: 'EB Garamond', frame: 'double', color: '#7a4e2d', docTitle: false }],
    ['academique', 'Académique', { title: 'Table des matières', titleStyle: 'majuscules', titleAlign: 'gauche', frame: 'aucun', number: '1.1', docTitle: false }],
    ['sobre', 'Sobre', { title: 'Sommaire', titleStyle: 'gras', frame: 'trait', number: 'aucun', leaders: false, docTitle: false }],
    ['encadre', 'Encadré coloré', { title: 'Au sommaire', titleStyle: 'majuscules', frame: 'fond', color: '#2e6da4', number: 'I' }],
    ['compact', 'Compact', { title: 'Plan', titleStyle: 'petites-capitales', frame: 'cadre', levels: 2, size: 10, docTitle: false }],
    ['livre', 'Livre', { title: 'Table des matières', titleStyle: 'petites-capitales', titleAlign: 'centre', font: 'EB Garamond', frame: 'aucun', number: 'I', docTitle: false }],
    ['rapport', 'Rapport', { title: 'Sommaire', titleStyle: 'gras', font: 'Inter', frame: 'filets', color: '#1f4e79', number: '1.1', docTitle: false }],
    ['minimal', 'Minimal', { showTitle: false, frame: 'aucun', levels: 2, number: 'aucun', leaders: false, docTitle: false }],
    ['nature', 'Nature', { title: 'Sommaire', titleStyle: 'majuscules', frame: 'fond', color: '#2e7d32', number: 'titres' }],
    ['carmin', 'Carmin', { title: 'Sommaire', titleStyle: 'gras', font: 'Archivo', color: '#7e1119', frame: 'aucun', number: 'I', docTitle: false }],
    ['carte', 'Carte', { title: 'Au programme', titleStyle: 'italique', titleAlign: 'centre', font: 'Playfair Display', frame: 'double', color: '#8c3b1f', levels: 2, docTitle: false }]
  ];
  // Style des nouveaux plans, donné par le thème du document (theme.js).
  let newConfig = null;
  const presetConfig = (id) => {
    const p = PRESETS.find(([k]) => k === id) || PRESETS[0];
    return { ...p[2], preset: p[0] };
  };

  function configOf(toc) {
    let cfg = {};
    try { cfg = JSON.parse(toc.dataset.toc || '{}') || {}; } catch { cfg = {}; }
    return { ...DEFAULT, ...cfg };
  }
  // Applique l'apparence au bloc : attributs lus par la feuille de style, et police, taille, couleur.
  function style(toc, cfg) {
    toc.dataset.frame = cfg.frame;
    toc.dataset.tstyle = cfg.titleStyle;
    toc.dataset.talign = cfg.titleAlign;
    if (cfg.leaders) delete toc.dataset.noleaders; else toc.dataset.noleaders = '';
    if (cfg.indent) delete toc.dataset.flat; else toc.dataset.flat = '';
    toc.style.fontFamily = cfg.font ? `"${cfg.font}", Georgia, serif` : '';
    toc.style.fontSize = cfg.size ? cfg.size + 'pt' : '';
    if (cfg.color) toc.style.setProperty('--toc-color', cfg.color); else toc.style.removeProperty('--toc-color');
  }

  // Numéro d'une ligne du plan selon le choix de numérotation (« titres » : ceux des styles des titres).
  const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  const roman = (n) => { let r = ''; for (const [v, l] of ROMAN) while (n >= v) { r += l; n -= v; } return r; };
  const alpha = (n) => { let r = ''; while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26); } return r; };
  function numberer(kind) {
    const count = [0, 0, 0, 0, 0, 0];
    return (level) => {
      count[level]++;
      for (let k = level + 1; k < count.length; k++) count[k] = 0;
      const n = count[level];
      if (kind === '1') return n + '.';
      if (kind === '1.1') return count.slice(1, level + 1).map((c) => c || 1).join('.') + (level === 1 ? '.' : '');
      if (kind === 'I') return [roman, alpha, String, (x) => alpha(x).toLowerCase(), (x) => roman(x).toLowerCase()][level - 1](n) + '.';
      if (kind === 'A') return [alpha, String, (x) => alpha(x).toLowerCase(), (x) => roman(x).toLowerCase(), String][level - 1](n) + '.';
      return '';
    };
  }

  // Les titres du texte ; le titre du document (h1.ft-title) est à l'étage 0.
  const levelOf = (h) => (h.classList.contains('ft-title') ? 0 : Number(h.tagName[1]));
  const headings = () => [...editor.querySelectorAll('h1, h2, h3, h4, h5')]
    .filter((h) => !h.closest('.ft-toc, .ft-footnotes') && h.textContent.trim());

  // Numéro de page d'un titre (mode avancé seulement), sinon ''.
  function pageOf(el) {
    const n = window.FTPages && window.FTPages.pageNumberOf ? window.FTPages.pageNumberOf(el) : null;
    return n === null || n === undefined ? '' : String(n);
  }

  function item(level, text, index, el) {
    const row = document.createElement('div');
    row.className = 'ft-toc-item';
    row.dataset.level = level;
    if (index >= 0) row.dataset.target = index;
    const t = document.createElement('span');
    t.className = 'ft-toc-text';
    t.textContent = text;
    row.append(t);
    const page = el ? pageOf(el) : (window.FTPages && window.FTPages.isPaged() ? '1' : '');
    if (page) {
      const p = document.createElement('span');
      p.className = 'ft-toc-page';
      p.textContent = page;
      row.append(p);
    }
    return row;
  }

  function build(cfg = DEFAULT) {
    const out = [];
    if (cfg.showTitle && cfg.title.trim()) {
      const label = document.createElement('div');
      label.className = 'ft-toc-label';
      label.textContent = cfg.title.trim();
      out.push(label);
    }
    const all = headings();
    // Sans bloc « Titre du document » dans le texte, le plan montre le nom du document.
    if (cfg.docTitle && !all.some((h) => levelOf(h) === 0)) {
      out.push(item(0, (window.FTApp && window.FTApp.docName()) || 'Sans titre', -1, null));
    }
    const nums = cfg.number === 'titres' && window.FTStructure && window.FTStructure.headingNumbers ? window.FTStructure.headingNumbers(editor) : new Map();
    const next = numberer(cfg.number);
    all.forEach((h, i) => {
      const level = levelOf(h);
      if (level > cfg.levels || (level === 0 && !cfg.docTitle)) return;
      const text = h.textContent.replace(/\s+/g, ' ').trim();
      // (Titre sans numéro : Introduction, Conclusion…)
      const num = level === 0 || h.hasAttribute('data-nonum') ? '' : cfg.number === 'titres' ? (nums.get(h) || '') : next(level);
      out.push(item(level, num ? num + ' ' + text : text, i, h));
    });
    return out;
  }

  // Ne touche au plan que s'il a changé (sinon le découpage en pages recommencerait sans fin).
  function refresh() {
    const blocks = editor.querySelectorAll('.ft-toc');
    if (!blocks.length) return;
    regen(() => {
      for (const toc of blocks) {
        const fresh = document.createElement('div');
        fresh.append(...build(configOf(toc)));
        if (toc.getAttribute('contenteditable') !== 'false') toc.setAttribute('contenteditable', 'false');
        if (toc.innerHTML !== fresh.innerHTML) toc.innerHTML = fresh.innerHTML;
      }
    });
  }

  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 300); };
  editor.addEventListener('input', later);
  document.addEventListener('ft-docname', later);
  document.addEventListener('ft-paginated', () => { if (!G) refresh(); });

  // Insère un plan à l'endroit du curseur (avant le paragraphe, ou à sa place s'il est vide).
  function insert() {
    if (G) {
      const toc = document.createElement('div');
      toc.className = 'ft-toc';
      toc.setAttribute('contenteditable', 'false');
      setConfig(toc, newConfig || presetConfig('moderne'));
      return G.insertBlock(toc);
    }
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    let node = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    if (!node || !editor.contains(node)) node = editor.lastChild;
    while (node && node.parentNode && node.parentNode !== editor && !(node.parentNode.classList && node.parentNode.classList.contains('ft-cols'))) node = node.parentNode;
    if (window.FTHistory) window.FTHistory.commit();
    const toc = document.createElement('div');
    toc.className = 'ft-toc';
    toc.setAttribute('contenteditable', 'false');
    setConfig(toc, newConfig || presetConfig('moderne'));
    const empty = node && node.nodeType === Node.ELEMENT_NODE && node.matches('p, div:not(.ft-toc)') && !node.textContent.trim() && !node.querySelector('img, .ft-math, .ft-image');
    if (!node) editor.append(toc);
    else if (empty) node.before(toc);
    else node.after(toc);
    // Un paragraphe après le plan pour continuer à écrire, seulement s'il n'y a rien après
    // (sinon il laissait une ligne vide sous le plan).
    let next = toc.nextElementSibling;
    while (next && next.classList.contains('ft-pg-gap')) next = next.nextElementSibling;
    if (!next || next.classList.contains('ft-footnotes') || next.classList.contains('ft-endnotes') || next.classList.contains('ft-toc')) {
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      toc.after(next);
    }
    const r = document.createRange();
    r.selectNodeContents(next);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    editor.dispatchEvent(new Event('input'));
  }

  // Clic sur une ligne du plan : on va au titre, et il clignote un instant.
  function onClick(e) {
    const row = e.target.closest && e.target.closest('.ft-toc-item');
    if (!row || !editor.contains(row)) return;
    e.preventDefault();
    if (row.dataset.target === undefined) { workspace.scrollTop = 0; return; }
    const target = headings()[Number(row.dataset.target)];
    if (!target) return;
    if (G) {
      G.reveal(target, 40);
      G.caret(target);
      G.flash(target);
      return;
    }
    const box = workspace.getBoundingClientRect();
    workspace.scrollTop += target.getBoundingClientRect().top - box.top - 40;
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(true);
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    flashEl(target);
  }
  editor.addEventListener('click', onClick);

  // Effacer la ligne qui suit (ou précède) le plan ne doit pas effacer le plan : le navigateur
  // supprime d'un coup un bloc non modifiable collé au curseur.
  const topOf = (node) => {
    while (node && node.parentNode && node.parentNode !== editor && !(node.parentNode.classList && node.parentNode.classList.contains('ft-cols'))) node = node.parentNode;
    return node && node.parentNode ? node : null;
  };
  const isToc = (n) => n && n.nodeType === 1 && n.classList.contains('ft-toc');
  // Bloc qu'un effacement depuis la ligne voisine ne doit pas emporter : plan, ligne de séparation.
  const isAtom = (n) => isToc(n) || (n && n.nodeType === 1 && n.tagName === 'HR');
  const blank = (b) => !b.textContent.trim() && !b.querySelector('img, .ft-math, .ft-image, table, hr');
  function caretEdge(block, atStart) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    const r = document.createRange();
    r.selectNodeContents(block);
    if (atStart) r.setEnd(sel.anchorNode, sel.anchorOffset); else r.setStart(sel.anchorNode, sel.anchorOffset);
    return !r.toString().length && !r.cloneContents().querySelector('img, .ft-math, .ft-image, table');
  }
  window.addEventListener('keydown', (e) => {
    if (G || (e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const block = topOf(sel.anchorNode);
    if (!block || isAtom(block) || /^(H[1-6]|UL|OL)$/.test(block.tagName)) return;
    const back = e.key === 'Backspace';
    let side = back ? block.previousSibling : block.nextSibling;
    while (side && side.nodeType === 3 && !side.data.trim()) side = back ? side.previousSibling : side.nextSibling;
    if (!isAtom(side) || !caretEdge(block, back)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!blank(block)) return; // une ligne avec du texte reste où elle est
    // La ligne vide disparaît ; le curseur va au début de la ligne d'après (ou à la fin de celle d'avant).
    const usable = (d) => d && !isAtom(d) && !d.matches('.ft-footnotes, .ft-endnotes, .ft-biblio, .ft-pg-gap, table, .ft-image, .ft-math');
    let dest = back ? block.nextElementSibling : block.previousElementSibling;
    let toEnd = !back;
    if (!usable(dest)) {
      dest = null;
      // Ligne de séparation : le curseur peut aussi aller de l'autre côté de la ligne.
      if (side.tagName === 'HR') {
        dest = back ? side.previousElementSibling : side.nextElementSibling;
        toEnd = back;
        if (!usable(dest)) dest = null;
      }
    }
    if (!dest) return; // il faut bien une ligne pour écrire après le plan
    if (window.FTHistory) window.FTHistory.commit();
    block.remove();
    const r = document.createRange();
    r.selectNodeContents(dest);
    r.collapse(!toEnd);
    sel.removeAllRanges();
    sel.addRange(r);
    editor.dispatchEvent(new Event('input'));
  }, true);

  // ----- Réglages d'un plan (fenêtre « Styles du document », onglet Plan : docstyles.js) -----

  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  };
  const OPTIONS = {
    titleStyle: [['petites-capitales', 'Petites capitales'], ['majuscules', 'Majuscules'], ['gras', 'Gras'], ['italique', 'Italique'], ['normal', 'Normale']],
    titleAlign: [['gauche', 'À gauche'], ['centre', 'Centré']],
    size: [[0, 'Taille du texte'], [9, '9 pt'], [10, '10 pt'], [11, '11 pt'], [12, '12 pt'], [13, '13 pt'], [14, '14 pt'], [16, '16 pt']],
    number: [['titres', 'Numéros des titres'], ['aucun', 'Aucune'], ['1', '1.  2.  3.'], ['1.1', '1.  1.1  1.1.1'], ['I', 'I.  A.  1.'], ['A', 'A.  1.  a.']],
    levels: [[1, 'Titres 1'], [2, 'Titres 1 et 2'], [3, 'Titres 1 à 3'], [4, 'Titres 1 à 4'], [5, 'Tous les titres']],
    frame: [['arrondi', 'Cadre arrondi'], ['cadre', 'Cadre droit'], ['double', 'Double cadre'], ['fond', 'Fond coloré'], ['trait', 'Trait à gauche'], ['filets', 'Filets dessus et dessous'], ['aucun', 'Aucun']]
  };

  // Réglages complets et vérifiés (thème importé, ancien document).
  function clean(cfg) {
    const out = { ...DEFAULT };
    if (!cfg || typeof cfg !== 'object') return out;
    for (const k of Object.keys(DEFAULT)) {
      const v = cfg[k];
      if (v === undefined) continue;
      if (typeof DEFAULT[k] === 'boolean') out[k] = !!v;
      else if (k === 'size') { if (Number(v) === 0 || (Number(v) >= 6 && Number(v) <= 40)) out[k] = Number(v); }
      else if (OPTIONS[k]) { if (OPTIONS[k].some(([x]) => String(x) === String(v))) out[k] = typeof DEFAULT[k] === 'number' ? Number(v) : String(v); }
      else if (k === 'color') out[k] = /^#[0-9a-f]{6}$/i.test(v) ? v : '';
      else if (typeof v === 'string') out[k] = v.slice(0, 120);
    }
    if (typeof cfg.preset === 'string') out.preset = cfg.preset;
    return out;
  }

  // Plan d'exemple (aperçus) : les titres du document, ou quelques lignes types.
  function sample(cfg, lines = 5) {
    const toc = el('div', { className: 'ft-toc' });
    style(toc, cfg);
    toc.append(...build(cfg));
    if (toc.querySelectorAll('.ft-toc-item').length < 2) {
      const next = numberer(cfg.number === 'titres' ? '1' : cfg.number);
      [[1, 'Introduction'], [2, 'Contexte'], [2, 'Problématique'], [1, 'Développement'], [3, 'Détail']].slice(0, lines).forEach(([lv, t], i) => {
        if (lv <= cfg.levels) { const n = next(lv); toc.append(item(lv, (n ? n + ' ' : '') + t, i, null)); }
      });
    }
    return toc;
  }

  function fontSelect(value) {
    const select = el('select');
    select.append(new Option('Police du texte', ''));
    document.querySelectorAll('#font-family optgroup').forEach((group) => {
      if (group.label === 'Polices Office') return;
      const g = el('optgroup', { label: group.label });
      group.querySelectorAll('option').forEach((o) => g.append(new Option(o.value, o.value)));
      select.append(g);
    });
    if (value && ![...select.options].some((o) => o.value === value)) select.append(new Option(value, value));
    select.value = value || '';
    return select;
  }

  // Formulaire des réglages : value est modifié sur place, onChange appelé à chaque changement.
  function editorPanel({ value, onChange }) {
    const cfg = value;
    const preview = el('div', { className: 'toc-preview' });
    const paint = () => preview.replaceChildren(sample(cfg));
    const changed = () => { cfg.preset = ''; paint(); onChange(); };
    const field = (label, control) => el('label', { className: 'ds-field' }, [el('span', { textContent: label }), control]);
    const choice = (k) => {
      const s = el('select');
      for (const [v, l] of OPTIONS[k]) s.append(new Option(l, String(v)));
      // Taille tapée à la main (10,5) : ajoutée à la liste.
      if (k === 'size') {
        Object.assign(s.dataset, { min: 6, max: 40 });
        if (![...s.options].some((o) => o.value === String(cfg[k]))) s.append(new Option(String(cfg[k]).replace('.', ',') + ' pt', String(cfg[k])));
      }
      s.value = String(cfg[k]);
      s.addEventListener('change', () => { cfg[k] = typeof DEFAULT[k] === 'number' ? Number(s.value) : s.value; changed(); });
      return s;
    };
    const check = (k, label) => {
      const c = el('input', { type: 'checkbox', checked: !!cfg[k] });
      c.addEventListener('change', () => { cfg[k] = c.checked; title.disabled = !cfg.showTitle; changed(); });
      return el('label', { className: 'pop-check' }, [c, ' ' + label]);
    };
    const title = el('input', { type: 'text', value: cfg.title, placeholder: 'Plan, Sommaire, Table des matières', disabled: !cfg.showTitle });
    title.addEventListener('input', () => { cfg.title = title.value; changed(); });
    const font = fontSelect(cfg.font);
    font.addEventListener('change', () => { cfg.font = font.value; if (font.value && window.FTEditor) window.FTEditor.loadFont(font.value); changed(); });
    const color = el('input', { type: 'color', value: cfg.color || '#333333', disabled: !cfg.color });
    const auto = el('input', { type: 'checkbox', checked: !cfg.color });
    color.addEventListener('change', () => { cfg.color = color.value; changed(); });
    auto.addEventListener('change', () => { color.disabled = auto.checked; cfg.color = auto.checked ? '' : color.value; changed(); });
    paint();
    return el('div', { className: 'ds-two' }, [
      el('div', { className: 'ds-form' }, [
        el('div', { className: 'ds-label', textContent: 'Titre du plan' }),
        el('div', { className: 'ds-row' }, [check('showTitle', 'Afficher'), title]),
        field('Écriture', choice('titleStyle')),
        field('Position', choice('titleAlign')),
        el('div', { className: 'ds-label', textContent: 'Texte' }),
        field('Police', font),
        field('Taille', choice('size')),
        el('div', { className: 'ds-row' }, [el('span', { textContent: 'Couleur' }), color, el('label', { className: 'pop-check' }, [auto, ' Couleur du texte'])]),
        el('div', { className: 'ds-label', textContent: 'Contenu' }),
        field('Numérotation', choice('number')),
        field('Niveaux', choice('levels')),
        el('div', { className: 'ds-row' }, [check('docTitle', 'Titre du document'), check('indent', 'Retrait par niveau'), check('leaders', 'Points de conduite')]),
        el('div', { className: 'ds-label', textContent: 'Bordure' }),
        field('Cadre', choice('frame'))
      ]),
      el('div', { className: 'ds-side' }, [el('div', { className: 'ds-label', textContent: 'Aperçu' }), preview])
    ]);
  }

  // Applique des réglages à un plan du texte.
  function setConfig(toc, cfg) {
    const full = clean(cfg);
    const stored = {};
    for (const [k, v] of Object.entries(full)) if (k === 'preset' ? v : v !== DEFAULT[k]) stored[k] = v;
    toc.dataset.toc = JSON.stringify(stored);
    style(toc, full);
    toc.replaceChildren(...build(full));
  }

  function remove(toc) {
    if (G) return G.edit(() => toc.remove());
    if (window.FTHistory) window.FTHistory.commit();
    toc.remove();
    editor.dispatchEvent(new Event('input'));
  }

  // Double-clic sur le titre du plan : son style.
  function onDblClick(e) {
    const label = e.target.closest && e.target.closest('.ft-toc-label');
    if (label && editor.contains(label)) { e.preventDefault(); window.FTStyles.open('plan', label.closest('.ft-toc')); }
  }
  editor.addEventListener('dblclick', onDblClick);

  window.FTToc = {
    insert,
    // Nouveau plan, au style des nouveaux plans (modèles de mise en page, modeles.js).
    create() {
      const toc = document.createElement('div');
      toc.className = 'ft-toc';
      toc.setAttribute('contenteditable', 'false');
      setConfig(toc, newConfig || presetConfig('moderne'));
      return toc;
    },
    refresh,
    // Titre visé par une ligne du plan (mode lecture).
    targetOf: (row) => (row.dataset.target === undefined ? editor.firstElementChild : headings()[Number(row.dataset.target)] || null),
    // Pour le thème du document (theme.js) et la fenêtre « Styles du document » (docstyles.js).
    presets: () => PRESETS.map(([id, name]) => ({ id, name, value: clean(presetConfig(id)) })),
    presetConfig: (id) => clean(presetConfig(id)),
    clean,
    configOf: (toc) => clean(configOf(toc)),
    setConfig,
    sample,
    editor: editorPanel,
    newConfig: () => clean(newConfig || presetConfig('moderne')),
    setNewConfig(cfg) { newConfig = clean(cfg); },
    restyleAll(cfg) { editor.querySelectorAll('.ft-toc').forEach((toc) => setConfig(toc, cfg)); },
    // Moteur 2.0 : plans du nouveau moteur, refaits après chaque modification du texte.
    useEngine(mount, api) {
      for (const [type, fn] of [['click', onClick], ['dblclick', onDblClick]]) {
        editor.removeEventListener(type, fn);
        mount.addEventListener(type, fn);
      }
      editor = mount;
      G = api;
      api.add(refresh);
    },
    // Pour le clic droit (structure.js).
    menuItems(target) {
      const toc = target.closest && target.closest('.ft-toc');
      if (!toc) return [];
      return [
        { label: 'Plan du document' },
        { text: 'Style…', action: () => window.FTStyles.open('plan', toc) },
        { text: 'Mettre à jour le plan', action: refresh },
        { text: 'Supprimer le plan', danger: true, action: () => remove(toc) }
      ];
    }
  };
})();
