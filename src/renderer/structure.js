// Structure du texte : listes à tirets, titres, encadrés et tableaux.
// Raccourcis de saisie en début de ligne : « - » (liste), « -- » (décaler la liste),
// « # » à « ##### » (titres), « > » (encadré), « 1. » (liste numérotée ; aussi « i. », « I. », « a. »,
// « A. », et « 1.1. » pour la numérotation en escalier), « [] » (liste à cocher).
(function () {
  let editor = document.getElementById('editor');
  // Moteur 2.0 : menus du clic droit, effacer la mise en forme et « Insérer » sur la zone du moteur
  // (useEngine) ; les modifications faites sur le texte affiché sont relues d'un coup (moteur/objets.js).
  let engine = null;
  const showMenu = (...args) => window.FTSidebar.showMenu(...args);

  // ----- Styles des titres et des tirets (ils font partie du thème du document : voir theme.js) -----

  const LEVELS = 5;
  const BULLETS = [
    ['–', 'Tiret'], ['—', 'Tiret long'], ['•', 'Puce'], ['◦', 'Rond vide'], ['▪', 'Carré'], ['▫', 'Carré vide'],
    ['◆', 'Losange'], ['▸', 'Triangle'], ['→', 'Flèche'], ['➤', 'Flèche pleine'], ['»', 'Chevrons'],
    ['✓', 'Coche'], ['★', 'Étoile'], ['❖', 'Fleuron']
  ];
  const HEADING_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36];
  const HEADING = { font: '', size: 12, bold: true, italic: false, underline: false, caps: false, smallcaps: false, color: '', align: '', rule: false, number: '' };
  const DEFAULT_STYLES = {
    title: { ...HEADING, size: 20, rule: undefined, number: undefined },
    headings: [
      { ...HEADING, size: 20 },
      { ...HEADING, size: 16 },
      { ...HEADING, size: 14 },
      { ...HEADING, size: 12 },
      { ...HEADING, size: 12, bold: false, italic: true }
    ],
    bullets: [
      { symbol: '–', color: '' }, { symbol: '•', color: '' }, { symbol: '◦', color: '' },
      { symbol: '▪', color: '' }, { symbol: '–', color: '' }
    ],
    // Numérotation de chaque niveau des listes numérotées (1, i, I, a, A) ; un niveau décalé
    // reprend les numéros des niveaux au-dessus : 1. → 1.1. → 1.1.1.
    numbers: ['1', '1', '1', '1', '1']
  };

  // Numérotation des titres : « 1. », « I. », « A. », « a. », ou « 1.1. » (avec les étages au-dessus).
  const HEADING_NUMBERS = [['', 'Sans numéro'], ['1', '1.  2.  3.'], ['I', 'I.  II.  III.'], ['A', 'A.  B.  C.'], ['a', 'a.  b.  c.'], ['1.1', '1.1.  1.2.  (avec les étages au-dessus)']];
  const ALIGNS = [['', 'À gauche'], ['center', 'Centré'], ['right', 'À droite']];

  // Modèles de styles : le titre du document et les cinq étages de titres d'un coup.
  const h = (o) => ({ ...HEADING, ...o });
  const PRESETS = [
    { id: 'classique', name: 'Classique', title: h({ size: 20 }), headings: DEFAULT_STYLES.headings.map((x) => ({ ...x })) },
    { id: 'moderne', name: 'Moderne', title: h({ font: 'Montserrat', size: 24, color: '#2e5c8a' }), headings: [
      h({ font: 'Montserrat', size: 18, color: '#2e5c8a' }), h({ font: 'Montserrat', size: 14, color: '#2e5c8a' }),
      h({ font: 'Montserrat', size: 12 }), h({ font: 'Montserrat', size: 11, bold: false, caps: true }), h({ font: 'Montserrat', size: 11, bold: false, italic: true })] },
    { id: 'elegant', name: 'Élégant', title: h({ font: 'Playfair Display', size: 28, bold: false, align: 'center' }), headings: [
      h({ font: 'Playfair Display', size: 20, bold: false, smallcaps: true, align: 'center', rule: true }), h({ font: 'Playfair Display', size: 16, bold: false, italic: true }),
      h({ font: 'Playfair Display', size: 13, smallcaps: true, bold: false }), h({ size: 12, italic: true, bold: false }), h({ size: 12, bold: false })] },
    { id: 'academique', name: 'Académique', title: h({ font: 'EB Garamond', size: 22, align: 'center' }), headings: [
      h({ font: 'EB Garamond', size: 18, number: '1.1' }), h({ font: 'EB Garamond', size: 15, number: '1.1' }),
      h({ font: 'EB Garamond', size: 13, number: '1.1', italic: true }), h({ font: 'EB Garamond', size: 12, bold: false, italic: true, number: 'a' }), h({ font: 'EB Garamond', size: 12, bold: false })] },
    { id: 'romain', name: 'Plan en chiffres romains', title: h({ size: 22, smallcaps: true, align: 'center' }), headings: [
      h({ size: 18, number: 'I', smallcaps: true }), h({ size: 15, number: 'A' }), h({ size: 13, number: '1' }), h({ size: 12, number: 'a', italic: true, bold: false }), h({ size: 12, bold: false })] },
    { id: 'sobre', name: 'Sobre', title: h({ font: 'Inter', size: 18, color: '#3b3b3b' }), headings: [
      h({ font: 'Inter', size: 15, rule: true }), h({ font: 'Inter', size: 13 }), h({ font: 'Inter', size: 12, color: '#6b6b6b' }),
      h({ font: 'Inter', size: 11, caps: true, color: '#6b6b6b' }), h({ font: 'Inter', size: 11, bold: false, italic: true })] },
    { id: 'magazine', name: 'Magazine', title: h({ font: 'Playfair Display', size: 30, color: '#b03a2e' }), headings: [
      h({ font: 'Playfair Display', size: 20, color: '#b03a2e' }), h({ font: 'Montserrat', size: 13, caps: true }),
      h({ font: 'Montserrat', size: 12, color: '#6b6b6b' }), h({ size: 12, italic: true, bold: false }), h({ size: 12, bold: false })] },
    { id: 'technique', name: 'Technique', title: h({ font: 'Roboto', size: 22 }), headings: [
      h({ font: 'Roboto', size: 16, number: '1.1', rule: true }), h({ font: 'Roboto', size: 13, number: '1.1' }),
      h({ font: 'Roboto', size: 12, number: '1.1' }), h({ font: 'Roboto', size: 11, number: '1.1', bold: false }), h({ font: 'Roboto', size: 11, bold: false, italic: true })] },
    { id: 'contraste', name: 'Contraste', title: h({ font: 'Montserrat', size: 26, caps: true }), headings: [
      h({ font: 'Montserrat', size: 17, caps: true, rule: true }), h({ font: 'Montserrat', size: 14 }),
      h({ font: 'Montserrat', size: 12, italic: true }), h({ size: 12, smallcaps: true }), h({ size: 12, bold: false })] },
    { id: 'manuscrit', name: 'Manuscrit', title: h({ font: 'Caveat', size: 32, bold: false }), headings: [
      h({ font: 'Caveat', size: 24, bold: false }), h({ font: 'Caveat', size: 19, bold: false }),
      h({ size: 12, italic: true }), h({ size: 12, italic: true, bold: false }), h({ size: 12, bold: false })] },
    { id: 'rapport', name: 'Rapport', title: h({ font: 'Inter', size: 24, color: '#1f4e79' }), headings: [
      h({ font: 'Inter', size: 16, color: '#1f4e79', number: '1' }), h({ font: 'Inter', size: 13, color: '#2e75b6', number: '1.1' }),
      h({ font: 'Inter', size: 12, number: '1.1' }), h({ font: 'Inter', size: 11, italic: true }), h({ font: 'Inter', size: 11, bold: false })] },
    { id: 'roman', name: 'Roman', title: h({ font: 'EB Garamond', size: 26, bold: false, smallcaps: true, align: 'center' }), headings: [
      h({ font: 'EB Garamond', size: 20, bold: false, align: 'center', number: 'I' }), h({ font: 'EB Garamond', size: 15, bold: false, italic: true, align: 'center' }),
      h({ font: 'EB Garamond', size: 13, smallcaps: true, bold: false }), h({ font: 'EB Garamond', size: 12, italic: true, bold: false }), h({ font: 'EB Garamond', size: 12, bold: false })] },
    { id: 'scolaire', name: 'Scolaire', title: h({ font: 'Nunito', size: 24, color: '#1565c0', align: 'center', rule: true }), headings: [
      h({ font: 'Nunito', size: 17, color: '#c62828', number: 'I', underline: true }), h({ font: 'Nunito', size: 14, color: '#2e7d32', number: 'A' }),
      h({ font: 'Nunito', size: 12, color: '#6a1b9a', number: '1' }), h({ font: 'Nunito', size: 12, italic: true, number: 'a' }), h({ font: 'Nunito', size: 11, bold: false })] },
    { id: 'juridique', name: 'Juridique', title: h({ font: 'Source Serif 4', size: 18, caps: true, align: 'center' }), headings: [
      h({ font: 'Source Serif 4', size: 14, caps: true, number: 'I' }), h({ font: 'Source Serif 4', size: 13, number: 'A' }),
      h({ font: 'Source Serif 4', size: 12, number: '1' }), h({ font: 'Source Serif 4', size: 12, italic: true, number: 'a' }), h({ font: 'Source Serif 4', size: 12, bold: false, italic: true })] },
    { id: 'carmin', name: 'Carmin', title: h({ font: 'Archivo', size: 26, color: '#7e1119' }), headings: [
      h({ font: 'Archivo', size: 15, color: '#26292e' }), h({ font: 'Archivo', size: 11.5, color: '#7e1119' }),
      h({ font: 'Archivo', size: 9, caps: true, color: '#7e1119' }), h({ font: 'Source Serif 4', size: 11.5, bold: false, italic: true, color: '#7e1119' }),
      h({ font: 'Source Serif 4', size: 10.5, bold: false, italic: true })] }
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  let styles = clone(DEFAULT_STYLES);
  const styleTag = document.createElement('style');
  document.head.appendChild(styleTag);

  // Complète des réglages enregistrés (anciens ou incomplets) avec les valeurs d'origine.
  function merge(saved) {
    const out = clone(DEFAULT_STYLES);
    if (!saved || typeof saved !== 'object') return out;
    for (const key of ['headings', 'bullets']) {
      if (Array.isArray(saved[key])) out[key] = out[key].map((d, i) => ({ ...d, ...(saved[key][i] || {}) }));
    }
    if (Array.isArray(saved.numbers)) out.numbers = out.numbers.map((d, i) => (NUM_CSS[saved.numbers[i]] ? saved.numbers[i] : d));
    if (saved.title && typeof saved.title === 'object') out.title = { ...out.title, ...saved.title };
    return out;
  }

  const cssString = (s) => '"' + String(s).replace(/["\\\n]/g, '') + '"';
  const validColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');

  function textDecl(h) {
    const decl = [
      `font-size: ${Number(h.size) || 12}pt`,
      `font-weight: ${h.bold ? 700 : 400}`,
      `font-style: ${h.italic ? 'italic' : 'normal'}`,
      `text-decoration: ${h.underline ? 'underline' : 'none'}`,
      `text-transform: ${h.caps ? 'uppercase' : 'none'}`,
      `font-variant-caps: ${h.smallcaps ? 'small-caps' : 'normal'}`,
      `color: ${validColor(h.color) || 'inherit'}`
    ];
    if (h.font) decl.push(`font-family: ${cssString(h.font)}, Georgia, serif`);
    return decl;
  }

  // ----- Numéros des titres -----

  const CSS_STYLE = { 1: 'decimal', I: 'upper-roman', A: 'upper-alpha', a: 'lower-alpha' };

  // ----- Numérotation des listes -----
  const NUM_CSS = { 1: 'decimal', i: 'lower-roman', I: 'upper-roman', a: 'lower-alpha', A: 'upper-alpha' };
  // data-num d'une liste (versions précédentes, listes tapées « i. », « a. »…) → numérotation.
  const NUM_OLD = { 'romain-min': 'i', 'romain-maj': 'I', 'lettre-min': 'a', 'lettre-maj': 'A' };
  const NUM_DEPTH = 9;
  // Les listes numérotées d'un niveau donné (1 : liste du haut), hors notes, bibliographie, plan et index.
  // (Une liste de sélecteurs : chacun contient des virgules, dans son :not(…).)
  const numDepthList = (k) => ['#editor', '.ft-list-preview']
    .map((root) => `${root} ${Array(k).fill('ol').join(' ')}:not(:where(.ft-footnotes, .ft-endnotes, .ft-biblio, .ft-toc, .ft-index, .ft-lof) ol)`);
  const numDepthSel = (k) => numDepthList(k).join(', ');
  function roman(n) {
    let out = '';
    for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { out += r; n -= v; }
    return out;
  }
  function alpha(n) {
    let out = '';
    for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    return out;
  }
  const formatNum = (n, style) => (style === 'I' ? roman(n) : style === 'A' ? alpha(n) : style === 'a' ? alpha(n).toLowerCase() : String(n));
  // Style d'un étage quand il sert de base à « 1.1. » : le sien, ou des chiffres.
  const baseStyle = (i) => (CSS_STYLE[styles.headings[i].number] ? styles.headings[i].number : '1');

  // Les numéros des titres du document, dans l'ordre (comme les compteurs CSS) : Map titre → « 1.2. ».
  function headingNumbers(root = editor) {
    const out = new Map();
    const count = [0, 0, 0, 0, 0];
    for (const el of root.querySelectorAll('h1, h2, h3, h4, h5')) {
      if (el.closest('.ft-toc, .ft-footnotes') || el.classList.contains('ft-title')) continue;
      const i = Number(el.tagName[1]) - 1;
      // Titre sans numéro (Introduction, Conclusion…) : pas compté, les étages en dessous repartent de zéro.
      if (el.hasAttribute('data-nonum')) {
        for (let j = i + 1; j < count.length; j++) count[j] = 0;
        continue;
      }
      count[i]++;
      for (let j = i + 1; j < count.length; j++) count[j] = 0;
      const style = styles.headings[i].number;
      if (!style) continue;
      if (style === '1.1') out.set(el, count.slice(0, i + 1).map((n, j) => formatNum(n, baseStyle(j))).join('.') + '.');
      else out.set(el, formatNum(count[i], style) + '.');
    }
    return out;
  }

  function applyStyles() {
    const rules = [];
    const t = styles.title;
    rules.push(`#editor h1.ft-title, .ft-preview-h0 { ${textDecl(t).join('; ')}; text-align: ${t.align || 'left'} }`);
    const names = [1, 2, 3, 4, 5].map((n) => 'fth' + n);
    rules.push(`#editor { counter-reset: ${names.join(' ')} }`);
    styles.headings.forEach((h, i) => {
      const decl = textDecl(h);
      rules.push(`#editor h${i + 1}, .ft-preview-h${i + 1} { ${decl.join('; ')} }`);
      const more = [`counter-increment: ${names[i]}`];
      if (i < names.length - 1) more.push(`counter-set: ${names.slice(i + 1).map((n) => n + ' 0').join(' ')}`);
      if (h.align) more.push(`text-align: ${h.align}`);
      if (h.rule) more.push('border-bottom: 1px solid currentColor; padding-bottom: 0.15em');
      rules.push(`#editor h${i + 1} { ${more.join('; ')} }`);
      // Titre dans une liste : le filet passe aussi sous son numéro ou son tiret.
      if (h.rule) rules.push(`#editor li > h${i + 1} { border-bottom: 0; position: relative }`,
        `#editor li > h${i + 1}::after { content: ''; position: absolute; left: calc(-1 * var(--ft-lirule)); right: 0; bottom: 0; border-bottom: 1px solid currentColor; pointer-events: none }`);
      if (h.number) {
        const parts = h.number === '1.1'
          ? names.slice(0, i + 1).map((n, j) => `counter(${n}, ${CSS_STYLE[baseStyle(j)]})`).join(' "." ')
          : `counter(${names[i]}, ${CSS_STYLE[h.number]})`;
        rules.push(`#editor h${i + 1}::before { content: ${parts} "."; margin-right: 0.5em }`);
      }
      rules.push(`#editor h${i + 1}[data-nonum] { counter-increment: none }`, `#editor h${i + 1}[data-nonum]::before { content: none }`);
    });
    // Un étage de plus à chaque liste imbriquée : « ul ul » vise le niveau 2, etc. Les tirets du thème
    // passent par des variables (--ft-b1…, --ft-bc1…) : une liste qui a ses propres tirets (ownList)
    // les redéfinit, et ses sous-listes, même créées ensuite, les suivent.
    const vars = [];
    styles.bullets.forEach((b, i) => {
      vars.push(`--ft-b${i + 1}: ${cssString(b.symbol + ' ')}`, `--ft-bc${i + 1}: ${validColor(b.color) || 'currentColor'}`);
      const chain = Array(i + 1).fill('ul').join(' ');
      const sel = `#editor ${chain}, .ft-list-preview ${chain}`;
      rules.push(`${sel} { list-style-type: var(--ft-b${i + 1}) }`);
      rules.push(sel.split(', ').map((s) => s + ' > li::marker').join(', ') + ` { color: var(--ft-bc${i + 1}) }`);
    });
    // Listes réglées avant la 2.1.6 (style posé sur chaque sous-liste) : la couleur passe par --bm.
    rules.push('#editor :is(ul[data-blv], ul[data-bl][style*="--bm"]) > li::marker { color: var(--bm, inherit) }');
    // Listes numérotées : un compteur par niveau (ft-n1…), chaque niveau avec sa numérotation
    // (--ft-f1…), écrite après les numéros des niveaux au-dessus.
    for (let k = 1; k <= NUM_DEPTH; k++) vars.push(`--ft-f${k}: ${NUM_CSS[styles.numbers[Math.min(k, LEVELS) - 1]]}`);
    rules.push(`#editor, .ft-list-preview { ${vars.join('; ')} }`);
    const PAD = [1.9, 2.6, 3.2, 3.8, 4.4];
    for (let k = 1; k <= NUM_DEPTH; k++) {
      const ols = numDepthSel(k);
      const each = (suffix) => numDepthList(k).map((sel) => sel + suffix).join(', ');
      const parts = [];
      for (let j = 1; j <= k; j++) parts.push(`counter(ft-n${j}, var(--ft-f${j}))`);
      rules.push(`${ols} { counter-reset: ft-n${k}; counter-reset: ft-n${k} calc(attr(start type(<integer>), 1) - 1); padding-left: ${PAD[Math.min(k, PAD.length) - 1]}em; --ft-lipad: ${PAD[Math.min(k, PAD.length) - 1]}em }`);
      rules.push(`${each(' > li')} { counter-increment: ft-n${k} }`);
      rules.push(`${each(' > li::marker')} { content: ${parts.join(' "." ')} ". " }`);
      // Numérotation choisie pour une liste (data-n1… sur la liste du haut) ou pour une sous-liste
      // (data-num, comme avant la 2.1.6 et les listes tapées « i. », « a. »…).
      if (k <= LEVELS) for (const [f, css] of Object.entries(NUM_CSS)) rules.push(`:is(#editor, .ft-list-preview) ol[data-n${k}="${f}"] { --ft-f${k}: ${css} }`);
      for (const [v, f] of Object.entries(NUM_OLD)) rules.push(`${each(`[data-num="${v}"]`)} { --ft-f${k}: ${NUM_CSS[f]} }`);
      if (k === 1) rules.push(`${each('[data-num="escalier"]')} { ${Array.from({ length: NUM_DEPTH }, (_, j) => `--ft-f${j + 1}: decimal`).join('; ')} }`);
    }
    styleTag.textContent = rules.join('\n');
    if (window.FTToc) window.FTToc.refresh();
  }
  applyStyles();

  // ----- Styles de numérotation (attribut data-num de la liste <ol>) -----
  // Sans attribut : 1. 2. 3. ; « escalier » sur la liste du haut numérote toute la liste et ses
  // sous-listes 1. 1.1. 1.2. 2. (le style des sous-listes est alors ignoré).
  const NUM_STYLES = [
    ['', '1.', '1. 2. 3.'],
    ['romain-min', 'i.', 'i. ii. iii.'],
    ['romain-maj', 'I.', 'I. II. III.'],
    ['lettre-min', 'a.', 'a. b. c.'],
    ['lettre-maj', 'A.', 'A. B. C.'],
    ['escalier', '1.1.', '1. 1.1. 1.2. 2.']
  ];
  const NUM_TYPED = { '1. ': '', 'i. ': 'romain-min', 'I. ': 'romain-maj', 'a. ': 'lettre-min', 'A. ': 'lettre-maj', '1.1. ': 'escalier' };

  // La liste <ol> la plus haute dont fait partie cette liste.
  function outerOl(list) {
    let top = list.tagName === 'OL' ? list : null;
    for (let n = list.parentElement; n && n !== editor; n = n.parentElement) if (n.tagName === 'OL') top = n;
    return top;
  }

  function numStyleOf(list) {
    const top = list && outerOl(list);
    if (top && top.dataset.num === 'escalier') return 'escalier';
    return list && list.tagName === 'OL' ? (list.dataset.num || '') : null;
  }

  // Change une liste à tirets en liste numérotée (ou l'inverse) en gardant son contenu.
  function retag(list, tag) {
    if (list.tagName === tag.toUpperCase()) return list;
    const other = document.createElement(tag);
    for (const a of list.attributes) if (a.name !== 'data-num') other.setAttribute(a.name, a.value);
    if (tag === 'ol') other.classList.remove('ft-check');
    if (!other.classList.length) other.removeAttribute('class');
    other.append(...list.childNodes);
    list.replaceWith(other);
    return other;
  }

  // Applique un style de numérotation à la liste qui contient cet élément.
  function setNumStyle(li, value) {
    checkpoint();
    let list = retag(li.parentElement, 'ol');
    const top = outerOl(list);
    if (value === 'escalier') {
      top.dataset.num = 'escalier';
      top.querySelectorAll('ol[data-num]').forEach((o) => delete o.dataset.num);
    } else {
      if (top.dataset.num === 'escalier') delete top.dataset.num;
      if (value) list.dataset.num = value; else delete list.dataset.num;
    }
    changed();
  }

  // ----- Sélection et blocs -----

  let lastRange = null;
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) lastRange = sel.getRangeAt(0).cloneRange();
  });

  function restore() {
    editor.focus({ preventScroll: true });
    if (lastRange && editor.contains(lastRange.commonAncestorContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(lastRange);
    }
  }

  // Prévient l'éditeur (enregistrement, compteur de mots) après une modification faite ici.
  const changed = () => editor.dispatchEvent(new Event('input'));
  // Mémorise l'état du texte juste avant une transformation, pour que Ctrl+Z y revienne.
  const checkpoint = () => { if (window.FTHistory) window.FTHistory.commit(); };

  function blockOf(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const block = node.closest('p, div, h1, h2, h3, h4, h5, h6, li, td, th');
    return block && block !== editor && editor.contains(block) ? block : null;
  }

  // Paragraphe ordinaire (pas dans une liste ni un tableau), où les raccourcis s'appliquent.
  const isPlain = (block) => block.matches('p, div') && !block.closest('li, td, th');

  function caret() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const block = blockOf(range.startContainer);
    if (!block) return null;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    return { block, before: before.toString().replace(/ /g, ' '), beforeRange: before };
  }

  function placeCaret(node, atEnd) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(!atEnd);
    if (!atEnd) {
      // Après une image posée au début de la ligne, sinon le texte tapé part ailleurs.
      let lead = null;
      for (let n = node.firstChild; n && n.nodeType === Node.ELEMENT_NODE && n.isContentEditable === false; n = n.nextSibling) lead = n;
      if (lead) range.setStartAfter(lead), range.collapse(true);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function command(cmd, value) {
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd, false, value);
  }

  // Efface le marqueur tapé (« - », « # »…) avant de transformer la ligne : seulement ses caractères,
  // pas une image posée au début de la ligne.
  function eraseMarker(info) {
    checkpoint();
    const range = info.beforeRange.cloneRange();
    const walker = document.createTreeWalker(info.block, NodeFilter.SHOW_TEXT);
    let left = info.before.length;
    let start = null;
    const texts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (range.intersectsNode(n)) texts.push(n);
    for (let i = texts.length - 1; i >= 0 && left > 0; i--) {
      const n = texts[i];
      const end = n === range.endContainer ? range.endOffset : n.length;
      const take = Math.min(left, end);
      start = [n, end - take];
      left -= take;
    }
    if (start) range.setStart(start[0], start[1]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete');
  }

  // Zone de texte en colonnes (layout.js) : ses paragraphes comptent comme des blocs de premier niveau.
  const isZone = (el) => !!el && el.nodeType === Node.ELEMENT_NODE && el.parentNode === editor && el.classList.contains('ft-cols');
  const isContainer = (el) => el === editor || isZone(el);

  function topBlock(node) {
    while (node && node.parentNode && !isContainer(node.parentNode)) node = node.parentNode;
    return node && node.parentNode ? node : null;
  }

  // Blocs de premier niveau touchés par la sélection.
  function selectedTopBlocks() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const first = topBlock(range.startContainer);
    const last = topBlock(range.endContainer);
    if (!first || !last || first.parentNode !== last.parentNode) return first ? [first] : [];
    const out = [];
    for (let n = first; n; n = n.nextSibling) {
      if (n.nodeType === Node.ELEMENT_NODE) out.push(n);
      if (n === last) break;
    }
    return out;
  }

  // ----- Listes -----

  // Transforme des paragraphes en liste (un élément par paragraphe). Le navigateur le fait mal
  // (il glisse la liste dans le paragraphe), d'où cette version.
  // Une image habillée au début d'une ligne reste dans un paragraphe à elle juste avant la liste :
  // dans un élément de liste, elle se placerait entre la puce et le texte.
  const isFloat = (n) => n.nodeType === Node.ELEMENT_NODE && n.isContentEditable === false && /^(gauche|droite)$/.test(n.dataset.wrap || '');

  // ordered : true, ou le nom d'un style de numérotation (voir NUM_STYLES).
  // ordered === 'cocher' : liste à cases à cocher (<ul class="ft-check">).
  function makeList(blocks, ordered) {
    const check = ordered === 'cocher';
    const list = document.createElement((ordered || ordered === '') && !check ? 'ol' : 'ul');
    if (check) list.className = 'ft-check';
    else if (typeof ordered === 'string' && ordered) list.dataset.num = ordered;
    const floats = [];
    for (const b of blocks) {
      while (b.firstChild && isFloat(b.firstChild)) floats.push(b.firstChild), b.firstChild.remove();
      const li = document.createElement('li');
      li.append(...b.childNodes);
      if (!li.firstChild) li.appendChild(document.createElement('br'));
      list.appendChild(li);
    }
    blocks[0].before(list);
    blocks.forEach((b) => b.remove());
    if (floats.length) {
      const holder = document.createElement('p');
      holder.append(...floats);
      list.before(holder);
    }
    return list;
  }

  // Remet en paragraphes tous les éléments d'une liste (sous-listes comprises).
  function unmakeList(list) {
    const paragraphs = [...list.querySelectorAll('li')].map((li) => {
      const p = document.createElement('p');
      for (const n of [...li.childNodes]) if (!(n.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(n.tagName))) p.appendChild(n);
      if (!p.firstChild) p.appendChild(document.createElement('br'));
      return p;
    });
    list.replaceWith(...paragraphs);
    return paragraphs;
  }

  function toggleList(ordered) {
    restore();
    checkpoint();
    const sel = window.getSelection();
    const block = sel.rangeCount ? blockOf(sel.anchorNode) : null;
    const li = block && block.closest('li');
    // Déjà dans une liste et un style de numérotation choisi : on change seulement la numérotation.
    if (li && typeof ordered === 'string' && !li.closest('.ft-footnotes')) {
      setNumStyle(li, ordered);
      placeCaret(li, true);
      return;
    }
    if (li) {
      let list = li.parentElement;
      while (list.parentElement && /^(UL|OL|LI)$/.test(list.parentElement.tagName)) list = list.parentElement;
      const paragraphs = unmakeList(list);
      placeCaret(paragraphs[0], true);
    } else {
      const blocks = selectedTopBlocks().filter((b) => b.matches('p, div, h1, h2, h3, h4, h5, h6'));
      if (!blocks.length) return;
      const list = makeList(blocks, ordered);
      placeCaret(list.lastElementChild, true);
    }
    changed();
  }

  // ----- Listes à cocher -----
  // Chaque élément porte data-checked="oui" quand sa case est cochée ; la case est dessinée en CSS.

  const outerList = (li) => {
    let list = li.parentElement;
    while (list.parentElement && /^(UL|OL|LI)$/.test(list.parentElement.tagName)) list = list.parentElement;
    return list;
  };
  const isCheckItem = (li) => !!li && li.tagName === 'LI' && li.parentElement.tagName === 'UL' && !!li.closest('ul.ft-check');

  // Bouton « Case à cocher » : transforme les lignes en liste à cocher, ou l'enlève.
  function toggleCheck() {
    restore();
    checkpoint();
    const sel = window.getSelection();
    const block = sel.rangeCount ? blockOf(sel.anchorNode) : null;
    const li = block && block.closest('li');
    if (li && li.closest('.ft-footnotes')) return;
    if (li) {
      const top = outerList(li);
      if (top.classList.contains('ft-check')) {
        const paragraphs = unmakeList(top);
        placeCaret(paragraphs[0], true);
      } else {
        const list = retag(top, 'ul');
        list.classList.add('ft-check');
        placeCaret(li, true);
      }
    } else {
      const blocks = selectedTopBlocks().filter((b) => b.matches('p, div, h1, h2, h3, h4, h5, h6'));
      if (!blocks.length) return;
      const list = makeList(blocks, 'cocher');
      placeCaret(list.lastElementChild, true);
    }
    changed();
  }

  function setChecked(li, on) {
    checkpoint();
    if (on) li.dataset.checked = 'oui'; else delete li.dataset.checked;
    changed();
  }

  // Un clic sur la case (à gauche du texte) la coche ou la décoche.
  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const li = e.target.closest && e.target.closest('li');
    if (!isCheckItem(li)) return;
    const r = li.getBoundingClientRect();
    if (e.clientX >= r.left + parseFloat(getComputedStyle(li).paddingLeft) - 2) return;
    e.preventDefault();
    setChecked(li, !li.dataset.checked);
  }, true);

  // Entrée sur un élément coché : la nouvelle ligne commence avec une case vide.
  editor.addEventListener('input', (e) => {
    if (e.inputType !== 'insertParagraph') return;
    const sel = window.getSelection();
    const li = sel.rangeCount && blockOf(sel.anchorNode) && blockOf(sel.anchorNode).closest('li');
    if (isCheckItem(li) && li.dataset.checked) delete li.dataset.checked;
  });

  function listLevel(li) {
    let level = 0;
    for (let n = li.parentElement; n && n !== editor; n = n.parentElement) if (/^(UL|OL)$/.test(n.tagName)) level++;
    return level;
  }

  // Un élément du premier niveau redevient un paragraphe ; la liste est coupée en deux autour de lui.
  function liToParagraph(li) {
    checkpoint();
    const list = li.parentElement;
    const p = document.createElement('p');
    const nested = [];
    for (const n of [...li.childNodes]) {
      if (n.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(n.tagName)) nested.push(n);
      else p.appendChild(n);
    }
    const rest = [];
    for (let n = li.nextSibling; n; n = n.nextSibling) rest.push(n);
    li.remove();
    list.after(p);
    if (nested.length || rest.length) {
      const tail = document.createElement(list.tagName);
      tail.append(...nested, ...rest);
      p.after(tail);
    }
    if (!list.firstElementChild) list.remove();
    if (!p.firstChild) p.appendChild(document.createElement('br'));
    placeCaret(p);
    changed();
  }

  function indent(li, back) {
    checkpoint();
    if (li) placeCaret(li);
    command(back ? 'outdent' : 'indent');
    cleanSpans();
    changed();
  }

  // Le navigateur ajoute parfois des <span style="font-size"> inutiles en décalant une ligne : on les enlève.
  function cleanSpans() {
    const sel = window.getSelection();
    const block = sel.rangeCount && blockOf(sel.anchorNode);
    if (!block) return;
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;
    for (const span of block.querySelectorAll('span[style]')) {
      const st = span.style;
      if (st.length === 1 && st.fontSize && getComputedStyle(span).fontSize === getComputedStyle(span.parentNode).fontSize) {
        span.replaceWith(...span.childNodes);
      }
    }
    if (node.isConnected) sel.collapse(node, offset);
  }

  // ----- Encadrés -----

  const CALLOUT_COLORS = [['', 'Couleur du document'], ['gris', 'Gris'], ['brun', 'Brun'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['ambre', 'Ambre'], ['rouge', 'Rouge'], ['violet', 'Violet']];
  // Formes des encadrés (attribut data-look ; sans attribut : « Cadre »).
  const CALLOUT_LOOKS = [['', 'Cadre'], ['double', 'Double cadre'], ['ombre', 'Carte ombrée'], ['trait', 'Trait à gauche'], ['fond', 'Fond coloré'],
    ['bandeau', 'Fond et trait'], ['bande', 'Bande latérale'], ['filets', 'Filets dessus et dessous'], ['citation', 'Citation'], ['marge', 'Note en marge']];
  // Styles prêts des encadrés : une forme et une couleur.
  const CALLOUT_PRESETS = [
    ['encadre', 'Encadré', { look: '', color: '' }], ['note', 'Note', { look: 'trait', color: 'bleu' }],
    ['astuce', 'Astuce', { look: 'fond', color: 'vert' }], ['attention', 'Attention', { look: 'bandeau', color: 'ambre' }],
    ['important', 'Important', { look: 'bandeau', color: 'rouge' }], ['definition', 'Définition', { look: 'double', color: 'violet' }],
    ['carte', 'Carte', { look: 'ombre', color: '' }], ['citation', 'Citation', { look: 'citation', color: 'gris' }],
    ['filets', 'Filets', { look: 'filets', color: '' }], ['discret', 'Discret', { look: 'fond', color: 'gris' }],
    ['info', 'Information', { look: 'fond', color: 'bleu' }], ['succes', 'Validé', { look: 'bandeau', color: 'vert' }],
    ['rappel', 'Rappel', { look: 'ombre', color: 'ambre' }], ['remarque', 'Remarque', { look: 'filets', color: 'gris' }],
    ['exemple', 'Exemple', { look: 'double', color: 'vert' }],
    ['plusloin', 'Pour aller plus loin', { look: 'bande', color: '' }], ['repere', 'Repère', { look: 'fond', color: 'brun' }],
    ['marge', 'Note en marge', { look: 'marge', color: 'gris' }]
  ];
  // Style des nouveaux encadrés, donné par le thème du document.
  let newCallout = { look: '', color: '' };

  // Citations : un encadré de la classe ft-quote, avec ses propres formes (attribut data-qlook) et la
  // même palette de couleurs ; une ligne p.ft-quote-src donne l'auteur ou la source.
  const QUOTE_LOOKS = [['', 'Trait à gauche'], ['guillemets', 'Grands guillemets'], ['centree', 'Centrée'], ['exergue', 'Mise en exergue'],
    ['encadree', 'Encadrée'], ['fond', 'Fond coloré'], ['epigraphe', 'Épigraphe'], ['retrait', 'Retrait simple'], ['detachee', 'Citation détachée']];
  const QUOTE_PRESETS = [
    ['classique', 'Classique', { look: '', color: 'gris' }], ['litteraire', 'Littéraire', { look: 'guillemets', color: '' }],
    ['exergue', 'Exergue', { look: 'exergue', color: '' }], ['epigraphe', 'Épigraphe', { look: 'epigraphe', color: 'gris' }],
    ['academique', 'Académique', { look: 'retrait', color: '' }], ['temoignage', 'Témoignage', { look: 'fond', color: 'ambre' }],
    ['encadree', 'Encadrée', { look: 'encadree', color: 'bleu' }], ['discours', 'Discours', { look: 'centree', color: '' }],
    ['moderne', 'Moderne', { look: 'guillemets', color: 'bleu' }], ['presse', 'Presse', { look: 'exergue', color: 'rouge' }],
    ['sobre', 'Sobre', { look: 'retrait', color: 'gris' }], ['grande', 'Grande citation', { look: 'exergue', color: 'violet' }],
    ['orateur', 'Orateur', { look: 'guillemets', color: 'rouge' }], ['lecture', 'Note de lecture', { look: 'fond', color: 'gris' }],
    ['source', 'Source encadrée', { look: 'encadree', color: 'vert' }],
    ['detachee', 'Détachée', { look: 'detachee', color: '' }]
  ];
  let newQuote = { look: '', color: 'gris' };
  function styleQuote(box, look) {
    if (look.look) box.dataset.qlook = look.look; else delete box.dataset.qlook;
    if (look.color) box.dataset.color = look.color; else delete box.dataset.color;
  }

  function styleCallout(box, look) {
    if (look.look) box.dataset.look = look.look; else delete box.dataset.look;
    if (look.color) box.dataset.color = look.color; else delete box.dataset.color;
  }

  function makeCallout(blocks, quote) {
    const box = document.createElement('blockquote');
    box.className = quote ? 'ft-callout ft-quote' : 'ft-callout';
    if (quote) styleQuote(box, newQuote); else styleCallout(box, newCallout);
    blocks[0].before(box);
    for (const b of blocks) {
      if (b.tagName === 'BLOCKQUOTE' && b.classList.contains('ft-callout')) box.append(...b.childNodes), b.remove();
      else box.appendChild(b);
    }
    return box;
  }

  function removeCallout(box) {
    checkpoint();
    const first = box.firstElementChild;
    box.replaceWith(...box.childNodes);
    if (first) placeCaret(first, true);
    changed();
  }

  function toggleCallout() {
    restore();
    checkpoint();
    const info = caret();
    const inside = window.getSelection().rangeCount && blockOf(window.getSelection().anchorNode);
    const existing = inside && inside.closest('.ft-callout');
    if (existing) return removeCallout(existing);
    const blocks = selectedTopBlocks().filter((b) => b.tagName !== 'TABLE');
    if (!blocks.length) return;
    const box = makeCallout(blocks);
    placeCaret(info ? info.block : box.lastElementChild, true);
    changed();
  }

  // Bouton « Citation » : met les paragraphes dans un bloc de citation, ou retire celui du curseur.
  function toggleQuote() {
    restore();
    checkpoint();
    const info = caret();
    const inside = window.getSelection().rangeCount && blockOf(window.getSelection().anchorNode);
    const existing = inside && inside.closest('.ft-callout');
    if (existing && existing.classList.contains('ft-quote')) return removeCallout(existing);
    if (existing) {
      // Un encadré devient une citation.
      existing.classList.add('ft-quote');
      delete existing.dataset.look;
      styleQuote(existing, newQuote);
      return changed();
    }
    const blocks = selectedTopBlocks().filter((b) => b.tagName !== 'TABLE');
    if (!blocks.length) return;
    const box = makeCallout(blocks, true);
    placeCaret(info ? info.block : box.lastElementChild, true);
    changed();
  }

  // Ligne de source sous la citation (« — Auteur, œuvre »).
  function addQuoteSource(box) {
    checkpoint();
    let src = box.querySelector(':scope > p.ft-quote-src');
    if (!src) {
      src = document.createElement('p');
      src.className = 'ft-quote-src';
      src.textContent = 'Auteur, œuvre';
      box.append(src);
    }
    const r = document.createRange();
    r.selectNodeContents(src);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    changed();
  }

  // ----- Titres -----

  function setBlock(tag) {
    restore();
    checkpoint();
    const info = caret() || { block: blockOf(window.getSelection().anchorNode) };
    if (info.block && info.block.closest('li')) {
      if (tag === 'p') toggleList(false);
      return;
    } else if (info.block && !info.block.closest('td, th')) {
      formatAs(info.block, tag);
    }
    changed();
  }

  // Type d'une ligne : « p », « h1 »…, ou « title » (le titre du document, un h1.ft-title sans numéro).
  function formatAs(block, tag) {
    const want = tag === 'title' ? 'h1' : tag;
    if (block.tagName.toLowerCase() !== want) command('formatBlock', want);
    const sel = window.getSelection();
    const now = (sel.rangeCount && blockOf(sel.anchorNode)) || block;
    if (!now || !editor.contains(now)) return;
    now.classList.toggle('ft-title', tag === 'title');
    if (!now.classList.length) now.removeAttribute('class');
  }

  // ----- Raccourcis de saisie -----

  editor.addEventListener('input', (e) => {
    syncFootnotes();
    placeFrame();
    if (e.inputType !== 'insertText' || (e.target.closest && e.target.closest('.ft-caption, .ft-cover'))) return;
    const info = caret();
    if (!info) return;
    const { block, before } = info;
    if (e.data === '^' && before.endsWith('^')) {
      typedFootnote(info);
    } else if (e.data === ' ' && isPlain(block)) {
      const heading = /^(#{1,5}) $/.exec(before);
      if (heading) {
        eraseMarker(info);
        command('formatBlock', 'h' + heading[1].length);
      } else if (/^\[[ xX]?\] $/.test(before)) {
        // « [] » ou « [ ] » : liste à cocher ; « [x] » : déjà cochée.
        eraseMarker(info);
        const p = blockOf(window.getSelection().anchorNode) || block;
        const li = makeList([p], 'cocher').firstElementChild;
        if (/x/i.test(before)) li.dataset.checked = 'oui';
        placeCaret(li);
      } else if (before === '- ' || before === '* ' || NUM_TYPED[before] !== undefined) {
        // « i. » et « a. » : la majuscule automatique a pu changer la lettre tapée.
        let style = NUM_TYPED[before] !== undefined ? NUM_TYPED[before] : false;
        if ((before === 'I. ' || before === 'A. ') && window.FTLayout && window.FTLayout.autoCapital(block, before[0])) {
          style = NUM_TYPED[before.toLowerCase()];
        }
        eraseMarker(info);
        const p = blockOf(window.getSelection().anchorNode) || block;
        placeCaret(makeList([p], style).firstElementChild);
      } else if (before === '> ' && !block.closest('.ft-callout') && block.parentNode === editor) {
        eraseMarker(info);
        const p = blockOf(window.getSelection().anchorNode) || block;
        makeCallout([p]);
        placeCaret(p);
      } else {
        return;
      }
      changed();
    } else if (e.data === '-' && before === '-' && block.tagName === 'LI' && !block.closest('.ft-footnotes')) {
      // « - » au début d'un élément de liste : le décale d'un niveau vers la droite.
      eraseMarker(info);
      indent(null);
    } else if (e.data === '_' && before === '__' && isPlain(block) && block.textContent === '__' && block.parentNode === editor) {
      // « __ » seul sur une ligne : ligne de séparation.
      eraseMarker(info);
      makeRule(blockOf(window.getSelection().anchorNode) || block);
    }
  });

  // Clavier français : « ^ » est une touche morte, le caractère arrive à la fin d'une composition.
  editor.addEventListener('compositionend', (e) => {
    if (e.data !== '^') return;
    const info = caret();
    if (info && info.before.endsWith('^')) typedFootnote(info);
  });

  // Capture : passe avant la tabulation ordinaire de l'éditeur.
  editor.addEventListener('keydown', (e) => {
    if (selectedObj && objectKey(e)) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const sel = window.getSelection();
    const block = sel.rangeCount ? blockOf(sel.anchorNode) : null;
    if (!block) return;

    if (e.key === 'Tab') {
      const cell = block.closest('td, th');
      const li = block.closest('li');
      if (li && (!cell || cell.contains(li))) {
        e.preventDefault();
        indent(null, e.shiftKey);
      } else if (cell) {
        e.preventDefault();
        moveCell(cell, e.shiftKey);
      }
      return;
    }

    const info = caret();
    if (!info) return;
    const box = info.block.closest('.ft-callout');

    // Dans une note de bas de page : Entrée ramène au texte, et les notes ne se fusionnent pas.
    const note = info.block.closest('.ft-footnotes li');
    if (note) {
      if (e.key === 'Enter') {
        e.preventDefault();
        backToReference(note);
      } else if (e.key === 'Backspace' && info.before === '') {
        e.preventDefault();
      }
      return;
    }

    // Retour arrière au début d'un élément de liste : recule d'un cran, ou redevient un paragraphe au premier cran.
    if (e.key === 'Backspace' && info.before === '' && info.block.tagName === 'LI') {
      e.preventDefault();
      if (listLevel(info.block) > 1) indent(null, true);
      else liToParagraph(info.block);
      return;
    }

    // Entrée sur une ligne vide à la fin d'un encadré : on en sort.
    if (e.key === 'Enter' && !e.shiftKey && box && info.block.parentNode === box &&
        info.block === box.lastElementChild && info.block.textContent === '') {
      e.preventDefault();
      box.after(info.block);
      if (!box.firstElementChild) box.remove();
      placeCaret(info.block);
      changed();
      return;
    }

    if (e.key === 'Backspace' && info.before === '') {
      // Effacer au début d'un titre le remet en texte normal.
      if (/^H[1-6]$/.test(info.block.tagName)) {
        e.preventDefault();
        command('formatBlock', 'p');
        changed();
      } else if (box && info.block.parentNode === box && info.block === box.firstElementChild) {
        // Au début d'un encadré : la ligne en sort.
        e.preventDefault();
        box.before(info.block);
        if (!box.firstElementChild) box.remove();
        placeCaret(info.block);
        changed();
      }
    }
  }, true);

  // ----- Tableaux -----

  // Style d'un tableau, comme les styles de tableau de Word : un dessin (bordures et fond), une couleur,
  // les parties mises en valeur, la police, la taille du texte et l'espacement des cases.
  const TABLE_THEMES = [
    ['quadrille', 'Quadrillé'], ['clair', 'Grille claire'], ['grille', 'Grille colorée'],
    ['liste', 'Liste'], ['colore', 'En-tête coloré'], ['sombre', 'Couleur pleine'],
    ['lignes', 'Lignes'], ['raye', 'Bandes'], ['sans', 'Sans bordures'], ['edition', 'Filets éditoriaux']
  ];
  const TABLE_COLORS = [
    ['', 'Automatique (selon le mode jour/nuit)'], ['theme', 'Couleur du document'], ['gris', 'Gris'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['orange', 'Orange'],
    ['rouge', 'Rouge'], ['violet', 'Violet'], ['turquoise', 'Turquoise'], ['or', 'Or']
  ];
  // Options -> attributs data-… du tableau.
  const TABLE_OPTIONS = ['header', 'first', 'total', 'last', 'bands', 'bandcols', 'sep'];
  const TABLE_PADS = [['serre', 'Serré'], ['', 'Normal'], ['aere', 'Aéré']];
  const DEFAULT_TABLE = { rows: 3, cols: 3, style: 'quadrille', color: '', header: true, first: false, total: false, last: false, bands: false, bandcols: false, sep: false, font: '', size: 0, pad: '', width: 'full' };
  // Styles prêts : dessin, couleur, parties mises en valeur, police, taille et espacement choisis ensemble.
  const TABLE_PRESETS = [
    ['Fiche', { style: 'lignes', color: '', header: false, first: true, sep: true }],
    ['Registre', { style: 'clair', color: 'bleu', header: true, first: true, sep: true }],
    ['Comparatif', { style: 'colore', color: 'vert', header: true, first: true, sep: true, bands: true }],
    ['Bilan', { style: 'liste', color: 'violet', header: true, total: true, first: true, sep: true }],
    ['Agenda', { style: 'raye', color: 'turquoise', header: true, first: true, sep: true, bands: true }],
    ['Sommaire', { style: 'sans', color: 'or', header: false, first: true, sep: true }],
    ['Classique', { style: 'quadrille', color: '', header: true }],
    ['Moderne', { style: 'grille', color: 'bleu', header: true, bands: true }],
    ['Élégant', { style: 'lignes', color: 'gris', header: true, total: true }],
    ['Compact', { style: 'quadrille', color: 'gris', header: true, size: 10, pad: 'serre' }],
    ['Aéré', { style: 'lignes', color: 'gris', header: true, pad: 'aere' }],
    ['Rapport', { style: 'liste', color: 'bleu', header: true, bands: true, font: 'Inter', size: 10.5 }],
    ['Facture', { style: 'clair', color: 'gris', header: true, total: true, last: true, font: 'Roboto', size: 10.5 }],
    ['Planning', { style: 'grille', color: 'turquoise', header: true, first: true, bandcols: true, size: 10, pad: 'serre' }],
    ['Scientifique', { style: 'lignes', color: '', header: true, font: 'Source Serif 4', size: 10.5, pad: 'serre' }],
    ['Fiche technique', { style: 'sans', color: 'gris', first: true, sep: true, font: 'JetBrains Mono', size: 10 }],
    ['Carte', { style: 'sans', color: 'or', header: true, font: 'Playfair Display', pad: 'aere' }],
    ['Nuit', { style: 'sombre', color: 'bleu', header: true }],
    ['Prairie', { style: 'sombre', color: 'vert', header: true, bands: true }],
    ['Pastel', { style: 'raye', color: 'violet', header: true, bands: true, pad: 'aere' }],
    ['Orange', { style: 'colore', color: 'orange', header: true, total: true }],
    ['Rouge', { style: 'grille', color: 'rouge', header: true, first: true }],
    ['Document', { style: 'colore', color: 'theme', header: true, bands: true }],
    ['Manuscrit', { style: 'lignes', color: 'or', header: true, font: 'Caveat', size: 13 }],
    ['Zèbre', { style: 'raye', color: 'gris', header: true, bands: true, pad: 'serre' }],
    ['Tableur', { style: 'quadrille', color: 'gris', header: true, first: true, font: 'Roboto', size: 10, pad: 'serre' }],
    ['Menu', { style: 'sans', color: 'rouge', header: true, font: 'Playfair Display', pad: 'aere' }],
    ['Lettre', { style: 'lignes', color: '', header: true, font: 'EB Garamond', size: 12 }],
    ['Score', { style: 'colore', color: 'turquoise', header: true, total: true, last: true }],
    ['Ardoise', { style: 'sombre', color: 'gris', header: true, first: true }],
    ['Carmin', { style: 'edition', color: 'theme', header: true, font: 'Archivo', size: 9.5 }],
    ['Édition', { style: 'edition', color: 'gris', header: true, total: true }]
  ];
  const presetLook = (p) => ({ ...Object.fromEntries(TABLE_OPTIONS.map((o) => [o, false])), color: '', font: '', size: 0, pad: '', ...p });

  function lookOf(table) {
    const look = { style: table.dataset.style || 'quadrille', color: table.dataset.color || '', width: table.dataset.width === 'auto' ? 'auto' : 'full',
      font: table.dataset.font || '', size: Number(table.dataset.fsize) || 0, pad: table.dataset.pad || '' };
    for (const o of TABLE_OPTIONS) look[o] = !!table.dataset[o];
    return look;
  }

  function applyLook(table, look) {
    table.dataset.style = look.style;
    if (look.color) table.dataset.color = look.color; else delete table.dataset.color;
    for (const o of TABLE_OPTIONS) {
      if (look[o]) table.dataset[o] = 'oui'; else delete table.dataset[o];
    }
    if (look.width === 'auto') table.dataset.width = 'auto'; else delete table.dataset.width;
    if (look.font) table.dataset.font = look.font; else delete table.dataset.font;
    if (look.size) table.dataset.fsize = String(look.size); else delete table.dataset.fsize;
    if (look.pad) table.dataset.pad = look.pad; else delete table.dataset.pad;
    table.style.fontFamily = look.font ? `${cssString(look.font)}, Georgia, serif` : '';
    table.style.fontSize = look.size ? look.size + 'pt' : '';
    if (!table.getAttribute('style')) table.removeAttribute('style');
    table.dataset.t = '2';
  }

  // Tableaux des versions précédentes : l'ancien style « Lignes alternées » avait toujours ses bandes.
  function upgradeTables(root) {
    for (const table of root.querySelectorAll('table.ft-table:not([data-t])')) {
      if (table.dataset.style === 'raye') table.dataset.bands = 'oui';
      table.dataset.t = '2';
    }
  }

  function emptyCell() {
    const td = document.createElement('td');
    td.appendChild(document.createElement('br'));
    return td;
  }

  function buildTable(opts) {
    const { rows, cols } = opts;
    const table = document.createElement('table');
    table.className = 'ft-table';
    applyLook(table, opts);
    const body = table.createTBody();
    for (let r = 0; r < rows; r++) {
      const tr = body.insertRow();
      for (let c = 0; c < cols; c++) tr.appendChild(emptyCell());
    }
    return table;
  }

  function insertTable(opts) {
    restore();
    checkpoint();
    const sel = window.getSelection();
    const table = buildTable({ ...DEFAULT_TABLE, ...opts });
    placeBlockAt(table, sel.rangeCount ? sel.getRangeAt(0) : null);
    // Toujours une ligne de texte après le tableau, pour pouvoir continuer à écrire.
    const after = table.nextElementSibling;
    if (!after || after.tagName === 'TABLE' || after.classList.contains('ft-footnotes')) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      table.after(p);
    }
    placeCaret(table.rows[0].cells[0]);
    changed();
  }

  // ----- Grille d'un tableau aux cases fusionnées -----
  // grid[r][c] : la case qui couvre la ligne r et la colonne c (une case fusionnée en couvre plusieurs) ;
  // pos : ligne et colonne de départ de chaque case. Les intercalaires du découpage en pages sont ignorés.
  function tableGrid(table) {
    const rows = [...table.rows].filter((tr) => !tr.classList.contains('ft-pg-gap'));
    const grid = rows.map(() => []);
    const pos = new Map();
    rows.forEach((tr, r) => {
      let c = 0;
      for (const cell of tr.cells) {
        while (grid[r][c]) c++;
        pos.set(cell, { r, c });
        for (let i = 0; i < Math.max(1, cell.rowSpan); i++) {
          if (!grid[r + i]) break;
          for (let j = 0; j < cell.colSpan; j++) grid[r + i][c + j] = cell;
        }
        c += cell.colSpan;
      }
    });
    const width = Math.max(0, ...grid.map((g) => g.length));
    const end = (cell) => { const p = pos.get(cell); return { r: p.r + Math.max(1, cell.rowSpan) - 1, c: p.c + cell.colSpan - 1 }; };
    return { rows, grid, pos, width, end };
  }
  const spanAttrs = (cell) => {
    if (cell.colSpan <= 1) cell.removeAttribute('colspan');
    if (cell.rowSpan <= 1) cell.removeAttribute('rowspan');
  };
  // Les intercalaires des pages sont retirés pendant les changements de structure (cases fusionnées).
  const bareTable = (fn) => (window.FTPages ? window.FTPages.bare(fn) : fn());

  const columnCount = (table) => tableGrid(table).width;

  // Case insérée dans la ligne tr à la colonne c de la grille g (avant la première case qui commence après).
  function insertCellAt(g, tr, c, cell) {
    const next = [...tr.cells].find((x) => g.pos.has(x) && g.pos.get(x).c >= c);
    if (next) next.before(cell); else tr.appendChild(cell);
    return cell;
  }

  function addRow(tr, above) {
    const table = tr.closest('table');
    const g = tableGrid(table);
    const r = g.rows.indexOf(tr);
    const row = document.createElement('tr');
    if (r < 0) {
      for (let c = 0; c < g.width; c++) row.appendChild(emptyCell());
    } else {
      // Une case fusionnée qui traverse la nouvelle ligne s'allonge d'une ligne ; ailleurs, une case vide.
      const grown = new Set();
      for (let c = 0; c < g.width; c++) {
        const cell = g.grid[r][c];
        const p = cell && g.pos.get(cell);
        const crosses = cell && (above ? p.r < r : g.end(cell).r > r);
        if (crosses) {
          if (!grown.has(cell)) { cell.rowSpan += 1; grown.add(cell); }
          c = g.end(cell).c;
        } else row.appendChild(emptyCell());
      }
    }
    if (above) tr.before(row);
    else tr.after(row);
    return row;
  }

  function addColumn(cell, left) {
    const table = cell.closest('table');
    const g = tableGrid(table);
    const p = g.pos.get(cell);
    // Nouvelle colonne entre les colonnes index - 1 et index de la grille.
    const index = left ? p.c : g.end(cell).c + 1;
    // Largeurs choisies à la souris : la nouvelle colonne prend la moitié de sa voisine.
    const cols = colsOf(table);
    if (cols) {
      const ref = cols[Math.min(left ? index : index - 1, cols.length - 1)];
      const half = splitWidth(ref.style.width, 0.5);
      ref.style.width = half;
      const col = document.createElement('col');
      col.style.width = half;
      if (left) ref.before(col); else ref.after(col);
    }
    const grown = new Set();
    g.rows.forEach((tr, r) => {
      const a = g.grid[r][index - 1];
      const b = g.grid[r][index];
      if (a && a === b) {
        // Case fusionnée de part et d'autre : elle s'élargit d'une colonne.
        if (!grown.has(a)) { a.colSpan += 1; grown.add(a); }
        return;
      }
      insertCellAt(g, tr, index, emptyCell());
    });
  }

  // ----- Fusionner et fractionner des cases -----

  // Rectangle de cases choisi : de la case où commence la sélection à celle où elle finit.
  function cellRect(table) {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const cellOf = (n) => {
      const el = n && (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement);
      const c = el && el.closest('td, th');
      return c && c.closest('table') === table ? c : null;
    };
    const a = cellOf(sel.anchorNode);
    const b = cellOf(sel.focusNode);
    if (!a || !b || a === b) return null;
    const g = tableGrid(table);
    if (!g.pos.has(a) || !g.pos.has(b)) return null;
    const pa = g.pos.get(a);
    const pb = g.pos.get(b);
    const ea = g.end(a);
    const eb = g.end(b);
    const rect = { r0: Math.min(pa.r, pb.r), c0: Math.min(pa.c, pb.c), r1: Math.max(ea.r, eb.r), c1: Math.max(ea.c, eb.c) };
    // Le rectangle prend en entier les cases déjà fusionnées qu'il touche.
    for (let changedRect = true; changedRect;) {
      changedRect = false;
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cell = g.grid[r][c];
          if (!cell) continue;
          const p = g.pos.get(cell);
          const e = g.end(cell);
          if (p.r < rect.r0 || p.c < rect.c0 || e.r > rect.r1 || e.c > rect.c1) {
            Object.assign(rect, { r0: Math.min(rect.r0, p.r), c0: Math.min(rect.c0, p.c), r1: Math.max(rect.r1, e.r), c1: Math.max(rect.c1, e.c) });
            changedRect = true;
          }
        }
      }
    }
    return rect;
  }

  const isEmptyCell = (cell) => !cell.textContent.trim() && !cell.querySelector('img, table, .ft-image, .ft-math, hr');
  const BLOCKS = 'p, div, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, pre';

  function mergeCells(table, rect) {
    bareTable(() => {
      const g = tableGrid(table);
      const cells = [];
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cell = g.grid[r][c];
          if (cell && !cells.includes(cell)) cells.push(cell);
        }
      }
      const target = g.grid[rect.r0][rect.c0];
      const full = cells.filter((c) => !isEmptyCell(c));
      // Le texte des cases réunies se suit, un paragraphe par case.
      if (full.length === 1 && full[0] !== target) target.replaceChildren(...full[0].childNodes);
      else if (full.length > 1) {
        const blocks = [];
        for (const cell of full) {
          if ([...cell.children].some((ch) => ch.matches(BLOCKS))) blocks.push(...cell.childNodes);
          else {
            const p = document.createElement('p');
            p.append(...cell.childNodes);
            blocks.push(p);
          }
        }
        target.replaceChildren(...blocks);
      }
      for (const cell of cells) if (cell !== target) cell.remove();
      target.colSpan = rect.c1 - rect.c0 + 1;
      target.rowSpan = rect.r1 - rect.r0 + 1;
      spanAttrs(target);
      dropEmptyRows(table);
      placeCaret(target, true);
    });
  }

  // Lignes restées sans case (toutes réunies dans une case fusionnée au-dessus) : retirées.
  function dropEmptyRows(table) {
    const g = tableGrid(table);
    for (let r = g.rows.length - 1; r >= 0; r--) {
      const tr = g.rows[r];
      if (tr.cells.length) continue;
      const seen = new Set();
      for (const cell of g.grid[r]) {
        if (cell && !seen.has(cell)) { seen.add(cell); cell.rowSpan = Math.max(1, cell.rowSpan - 1); spanAttrs(cell); }
      }
      tr.remove();
    }
  }

  // La case fusionnée redevient des cases simples (la première garde le texte).
  function splitCell(cell) {
    bareTable(() => {
      const table = cell.closest('table');
      const g = tableGrid(table);
      const p = g.pos.get(cell);
      const rs = Math.max(1, cell.rowSpan);
      const cs = cell.colSpan;
      cell.removeAttribute('colspan');
      cell.removeAttribute('rowspan');
      for (let i = 0; i < rs; i++) {
        const tr = g.rows[p.r + i];
        if (!tr) break;
        if (i === 0) {
          let at = cell;
          for (let j = 1; j < cs; j++) { const td = emptyCell(); at.after(td); at = td; }
        } else {
          const next = [...tr.cells].find((x) => g.pos.has(x) && g.pos.get(x).c > p.c);
          for (let j = 0; j < cs; j++) { const td = emptyCell(); if (next) next.before(td); else tr.appendChild(td); }
        }
      }
      placeCaret(cell, true);
    });
  }

  // ----- Largeur des colonnes et hauteur des lignes, à la souris -----

  const colsOf = (table) => {
    const group = table.querySelector(':scope > colgroup');
    return group && group.children.length ? [...group.children] : null;
  };
  const splitWidth = (width, part) => {
    const m = /^([\d.]+)(%|px)$/.exec(width || '');
    return m ? +(Number(m[1]) * part).toFixed(2) + m[2] : '';
  };
  const EDGE = 4; // distance au trait, en pixels, pour le saisir

  // Trait de colonne ou de ligne sous la souris : { kind: 'col', table, index } (entre index et index + 1)
  // ou { kind: 'row', tr }.
  function edgeAt(e) {
    const cell = e.target.closest && e.target.closest('#editor table.ft-table > tbody > tr > td, #editor table.ft-table > tbody > tr > th');
    if (!cell) return null;
    const table = cell.closest('table');
    const r = cell.getBoundingClientRect();
    const tr = cell.parentElement;
    const near = Math.abs(e.clientX - r.right) <= EDGE ? 'right' : Math.abs(e.clientX - r.left) <= EDGE ? 'left' : '';
    if (near && !tr.classList.contains('ft-pg-gap')) {
      const g = tableGrid(table);
      if (g.pos.has(cell)) {
        const c0 = g.pos.get(cell).c;
        const c1 = g.end(cell).c;
        if (near === 'right' && c1 < g.width - 1) return { kind: 'col', table, index: c1 };
        if (near === 'left' && c0 > 0) return { kind: 'col', table, index: c0 - 1 };
      }
    }
    if (Math.abs(e.clientY - r.bottom) <= EDGE) return { kind: 'row', tr };
    if (Math.abs(e.clientY - r.top) <= EDGE && tr.previousElementSibling) return { kind: 'row', tr: tr.previousElementSibling };
    return null;
  }

  // Largeur affichée de chaque colonne de la grille (une case simple de la colonne la donne ; sinon, part
  // égale de la case fusionnée).
  function columnWidths(table) {
    const g = tableGrid(table);
    const out = [];
    for (let c = 0; c < g.width; c++) {
      let w = 0;
      for (const row of g.grid) {
        const x = row[c];
        if (x && x.colSpan === 1) { w = x.getBoundingClientRect().width; break; }
      }
      if (!w) {
        const x = g.grid.map((row) => row[c]).find(Boolean);
        w = x ? x.getBoundingClientRect().width / x.colSpan : 0;
      }
      out.push(w);
    }
    return out;
  }

  let resizing = null;
  editor.addEventListener('mousemove', (e) => {
    if (resizing || e.buttons) return;
    const edge = edgeAt(e);
    editor.classList.toggle('resize-col', !!edge && edge.kind === 'col');
    editor.classList.toggle('resize-row', !!edge && edge.kind === 'row');
  });
  editor.addEventListener('mouseleave', () => { if (!resizing) editor.classList.remove('resize-col', 'resize-row'); });

  editor.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const edge = edgeAt(e);
    if (!edge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    checkpoint();
    const start = { x: e.clientX, y: e.clientY };
    let move;
    if (edge.kind === 'col') {
      const { table, index } = edge;
      const widths = columnWidths(table);
      const total = table.getBoundingClientRect().width;
      const fixed = table.dataset.width !== 'auto';
      // Les largeurs actuelles deviennent des colonnes réglées (en % de la page, ou en pixels pour un
      // tableau ajusté au contenu).
      let group = table.querySelector(':scope > colgroup');
      if (!group || group.children.length !== widths.length) {
        if (group) group.remove();
        group = document.createElement('colgroup');
        for (let i = 0; i < widths.length; i++) group.appendChild(document.createElement('col'));
        table.prepend(group);
      }
      const cols = [...group.children];
      const zk = table.currentCSSZoom || 1;
      const unit = (w) => (fixed ? +((w / total) * 100).toFixed(3) + '%' : Math.round(w / zk) + 'px');
      cols.forEach((col, i) => { col.style.width = unit(widths[i]); });
      const pair = widths[index] + widths[index + 1];
      const MIN = 28;
      move = (ev) => {
        const left = Math.max(MIN, Math.min(pair - MIN, widths[index] + ev.clientX - start.x));
        cols[index].style.width = unit(left);
        cols[index + 1].style.width = unit(pair - left);
      };
    } else {
      const { tr } = edge;
      const zk = tr.currentCSSZoom || 1;
      const h0 = tr.getBoundingClientRect().height;
      move = (ev) => { tr.style.height = Math.max(18, Math.round((h0 + ev.clientY - start.y) / zk)) + 'px'; };
    }
    resizing = edge;
    document.body.classList.add(edge.kind === 'col' ? 'resizing-col' : 'resizing-row');
    let frameId = 0;
    let last = null;
    const onMove = (ev) => {
      last = ev;
      if (!frameId) frameId = requestAnimationFrame(() => { frameId = 0; move(last); placeFrame(); });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frameId) { cancelAnimationFrame(frameId); move(last); }
      document.body.classList.remove('resizing-col', 'resizing-row');
      resizing = null;
      changed();
      placeFrame();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, true);

  // Double-clic sur un trait de colonne : les colonnes reprennent des largeurs égales.
  editor.addEventListener('dblclick', (e) => {
    const edge = edgeAt(e);
    if (!edge) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    checkpoint();
    if (edge.kind === 'col') {
      const group = edge.table.querySelector(':scope > colgroup');
      if (group) group.remove();
    } else {
      edge.tr.style.removeProperty('height');
      if (!edge.tr.getAttribute('style')) edge.tr.removeAttribute('style');
    }
    changed();
    placeFrame();
  }, true);

  function deleteTable(table) {
    checkpoint();
    const next = table.nextElementSibling || table.previousElementSibling;
    table.remove();
    if (!editor.firstElementChild) editor.innerHTML = '<p><br></p>';
    placeCaret(next && next.isConnected ? next : editor.firstElementChild);
    changed();
  }

  function deleteRow(cell) {
    checkpoint();
    const table = cell.closest('table');
    if (tableGrid(table).rows.length === 1) return deleteTable(table);
    bareTable(() => {
      const g = tableGrid(table);
      const tr = cell.parentElement;
      const r = g.rows.indexOf(tr);
      // Cases fusionnées qui traversent la ligne : une ligne de moins ; celles qui commencent ici
      // passent à la ligne suivante.
      const next = g.rows[r + 1];
      const seen = new Set();
      for (let c = 0; c < g.width; c++) {
        const x = g.grid[r][c];
        if (!x || seen.has(x) || x.rowSpan <= 1) continue;
        seen.add(x);
        x.rowSpan -= 1;
        if (g.pos.get(x).r === r && next) insertCellAt(g, next, g.pos.get(x).c, x);
        spanAttrs(x);
      }
      const neighbour = next || g.rows[r - 1];
      const col = g.pos.get(cell) ? g.pos.get(cell).c : 0;
      tr.remove();
      const ng = tableGrid(table);
      const ri = ng.rows.indexOf(neighbour);
      placeCaret((ri >= 0 && ng.grid[ri][Math.min(col, ng.width - 1)]) || neighbour);
    });
    changed();
  }

  function deleteColumn(cell) {
    checkpoint();
    const table = cell.closest('table');
    if (columnCount(table) === 1) return deleteTable(table);
    const g = tableGrid(table);
    const index = g.pos.get(cell).c;
    const cols = colsOf(table);
    if (cols && cols[index]) {
      // Sa largeur revient à la colonne voisine.
      const other = cols[index - 1] || cols[index + 1];
      const a = /^([\d.]+)(%|px)$/.exec(cols[index].style.width || '');
      const b = other && /^([\d.]+)(%|px)$/.exec(other.style.width || '');
      if (a && b && a[2] === b[2]) other.style.width = +(Number(a[1]) + Number(b[1])).toFixed(3) + a[2];
      cols[index].remove();
    }
    bareTable(() => {
      // Une case fusionnée sur plusieurs colonnes perd une colonne ; les autres cases de la colonne partent.
      const seen = new Set();
      for (const row of tableGrid(table).grid) {
        const x = row[index];
        if (!x || seen.has(x)) continue;
        seen.add(x);
        if (x.colSpan > 1) { x.colSpan -= 1; spanAttrs(x); } else x.remove();
      }
      dropEmptyRows(table);
      const ng = tableGrid(table);
      placeCaret(ng.grid[0][Math.max(0, Math.min(index - 1, ng.width - 1))] || table);
    });
    changed();
  }

  // Tabulation : cellule suivante (une ligne est ajoutée après la dernière cellule).
  function moveCell(cell, back) {
    const table = cell.closest('table');
    const cells = [...table.querySelectorAll('td, th')];
    const i = cells.indexOf(cell) + (back ? -1 : 1);
    if (i < 0) return;
    if (i >= cells.length) {
      checkpoint();
      const row = addRow(cell.parentElement, false);
      placeCaret(row.cells[0]);
      changed();
      return;
    }
    placeCaret(cells[i], true);
  }

  // ----- Menus du clic droit -----

  const check = (on, text) => (on ? '✓ ' : ' ') + text;

  function tableMenu(cell) {
    const table = cell.closest('table');
    const tr = cell.parentElement;
    const act = (fn) => () => { checkpoint(); fn(); changed(); };
    return [
      {
        text: 'Lignes et colonnes',
        submenu: () => [
          { text: 'Ajouter une ligne au-dessus', action: act(() => addRow(tr, true)) },
          { text: 'Ajouter une ligne en dessous', action: act(() => addRow(tr, false)) },
          { text: 'Ajouter une colonne à gauche', action: act(() => addColumn(cell, true)) },
          { text: 'Ajouter une colonne à droite', action: act(() => addColumn(cell, false)) },
          '-',
          { text: 'Supprimer la ligne', action: () => deleteRow(cell) },
          { text: 'Supprimer la colonne', action: () => deleteColumn(cell) }
        ]
      },
      ...mergeItems(table, cell),
      valignItem(cell),
      bordersItem(table),
      '-',
      ...(window.FTCaptions ? window.FTCaptions.tableItems(table) : []),
      { text: 'Style…', action: () => window.FTStyles.open('tableaux', table) },
      { text: check(!!table.dataset.header, "Ligne d'en-tête"), action: act(() => { if (table.dataset.header) delete table.dataset.header; else table.dataset.header = 'oui'; }) },
      { text: check(!!table.dataset.header && !!table.dataset.repeat, "Répéter l'en-tête sur chaque page"), action: act(() => {
        if (table.dataset.header && table.dataset.repeat) delete table.dataset.repeat;
        else { table.dataset.header = 'oui'; table.dataset.repeat = 'oui'; }
      }) },
      { text: check(!!table.dataset.bands, 'Lignes à bandes'), action: act(() => { if (table.dataset.bands) delete table.dataset.bands; else table.dataset.bands = 'oui'; }) },
      { text: check(table.dataset.width !== 'auto', 'Toute la largeur de la page'), action: act(() => { if (table.dataset.width === 'auto') delete table.dataset.width; else table.dataset.width = 'auto'; }) },
      '-',
      { text: 'Supprimer le tableau', danger: true, action: () => deleteTable(table) }
    ];
  }

  // « Fusionner les cellules » (plusieurs cases sélectionnées), « Fractionner la cellule » (case fusionnée).
  function mergeItems(table, cell) {
    const items = [];
    const rect = cellRect(table);
    if (rect) items.push({ text: 'Fusionner les cellules', action: () => { checkpoint(); mergeCells(table, rect); changed(); } });
    if (cell.colSpan > 1 || cell.rowSpan > 1) items.push({ text: 'Fractionner la cellule', action: () => { checkpoint(); splitCell(cell); changed(); } });
    return items;
  }

  // Bordures choisies : data-borders liste les traits montrés (haut, bas, gauche, droite : le tour ;
  // h, v : les lignes intérieures horizontales et verticales). Sans data-borders, le style décide.
  const BORDER_SIDES = [['haut', 'Bordure supérieure'], ['bas', 'Bordure inférieure'], ['gauche', 'Bordure gauche'], ['droite', 'Bordure droite'],
    ['h', 'Lignes intérieures horizontales'], ['v', 'Lignes intérieures verticales']];
  const OUTER = ['haut', 'bas', 'gauche', 'droite'];
  // Traits de chaque style, pour partir de ce qui est affiché.
  const STYLE_BORDERS = { quadrille: [...OUTER, 'h', 'v'], clair: [...OUTER, 'h', 'v'], grille: [...OUTER, 'h', 'v'], liste: [...OUTER, 'h'],
    colore: ['bas', 'h'], lignes: ['bas', 'h'], edition: ['haut', 'bas', 'h'], sombre: [], raye: [], sans: [] };
  const BORDER_WIDTHS = [['', 'Traits fins'], ['moyen', 'Traits moyens'], ['epais', 'Traits épais']];
  function bordersOf(table) {
    if (table.hasAttribute('data-borders')) return table.dataset.borders.split(/\s+/).filter(Boolean);
    return STYLE_BORDERS[table.dataset.style || 'quadrille'] || [];
  }
  function setBorders(table, list) {
    if (list === null) delete table.dataset.borders;
    else table.dataset.borders = BORDER_SIDES.map(([k]) => k).filter((k) => list.includes(k)).join(' ');
  }
  function bordersItem(table) {
    const act = (fn) => () => { checkpoint(); fn(); changed(); };
    const own = table.hasAttribute('data-borders');
    const cur = bordersOf(table);
    const same = (list) => own && list.length === cur.length && list.every((k) => cur.includes(k));
    return {
      text: 'Bordures',
      submenu: () => [
        { text: check(!own, 'Bordures du style'), action: act(() => { setBorders(table, null); delete table.dataset.bw; }) },
        { text: check(same([...OUTER, 'h', 'v']), 'Toutes les bordures'), action: act(() => setBorders(table, [...OUTER, 'h', 'v'])) },
        { text: check(same(OUTER), 'Bordures extérieures'), action: act(() => setBorders(table, OUTER)) },
        { text: check(same(['h', 'v']), 'Bordures intérieures'), action: act(() => setBorders(table, ['h', 'v'])) },
        { text: check(same(['haut', 'bas', 'h']), 'Lignes horizontales seules'), action: act(() => setBorders(table, ['haut', 'bas', 'h'])) },
        { text: check(own && !cur.length, 'Aucune bordure'), action: act(() => setBorders(table, [])) },
        '-',
        ...BORDER_SIDES.map(([k, label]) => ({
          text: check(cur.includes(k), label),
          action: act(() => setBorders(table, cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
        })),
        '-',
        ...BORDER_WIDTHS.map(([v, label]) => ({
          text: check((table.dataset.bw || '') === v, label),
          action: act(() => {
            if (!table.hasAttribute('data-borders')) setBorders(table, cur);
            if (v) table.dataset.bw = v; else delete table.dataset.bw;
          })
        }))
      ]
    };
  }

  // Alignement vertical du texte dans les cases sélectionnées (ou dans la case cliquée), comme dans Word.
  const VALIGNS = [['', 'En haut'], ['milieu', 'Au milieu'], ['bas', 'En bas']];
  function cellsForAlign(cell) {
    const table = cell.closest('table');
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return [cell];
    const r = sel.getRangeAt(0);
    const cells = [...table.querySelectorAll('td, th')].filter((c) => c.closest('table') === table && r.intersectsNode(c));
    return cells.length ? cells : [cell];
  }
  function valignItem(cell) {
    const cells = cellsForAlign(cell);
    const current = cell.dataset.valign || '';
    const set = (v) => {
      checkpoint();
      cells.forEach((c) => { if (v) c.dataset.valign = v; else delete c.dataset.valign; });
      changed();
    };
    return {
      text: 'Alignement vertical',
      submenu: () => VALIGNS.map(([v, label]) => ({ text: check(current === v, label), action: () => set(v) }))
    };
  }

  // « Type de ligne » : texte normal, titre du document ou titre 1 à 5 (sous-menu).
  function lineTypeItem(block) {
    const heading = /^H[1-6]$/.test(block.tagName);
    const title = heading && block.classList.contains('ft-title');
    const level = !heading ? -1 : title ? 0 : Number(block.tagName[1]);
    const set = (tag) => () => { checkpoint(); placeCaret(block, true); formatAs(block, tag); changed(); };
    return {
      text: 'Type de ligne',
      submenu: () => [
        { text: check(level === -1, 'Texte normal'), action: set('p') },
        { text: check(title, 'Titre du document'), action: set('title') },
        ...Array.from({ length: LEVELS }, (_, i) => ({ text: check(level === i + 1, `Titre ${i + 1}`), action: set('h' + (i + 1)) }))
      ]
    };
  }

  function headingMenu(h) {
    const text = h.textContent.replace(/\s+/g, ' ').trim();
    const App = window.FTApp;
    const named = App && text && App.docName() === text.slice(0, 80);
    return [
      lineTypeItem(h),
      ...(App && text ? [{ text: check(named, 'Nommer le document'), action: () => App.setName(text) }] : []),
      '-',
      { text: 'Style…', action: () => window.FTStyles.open('titres', h) }
    ];
  }

  function listMenu(li) {
    const current = numStyleOf(li.parentElement);
    const numbering = li.closest('.ft-footnotes') ? [] : [{
      text: 'Numérotation',
      submenu: () => [
        ...NUM_STYLES.map(([value, , example]) => ({
          text: check(current === value, example),
          action: () => { setNumStyle(li, value); placeCaret(li, true); }
        })),
        ...(current !== null ? ['-', { text: 'Remettre des tirets', action: () => { checkpoint(); retag(li.parentElement, 'ul'); changed(); } }] : [])
      ]
    }];
    const checkItems = isCheckItem(li) ? [
      { text: li.dataset.checked ? 'Décocher la case' : 'Cocher la case', action: () => setChecked(li, !li.dataset.checked) },
      { text: 'Enlever les cases (garder le texte)', action: () => { checkpoint(); unmakeList(outerList(li)); changed(); } },
      '-'
    ] : li.closest('.ft-footnotes') ? [] : [{ text: 'Mettre des cases à cocher', action: () => { checkpoint(); const l = retag(outerList(li), 'ul'); l.classList.add('ft-check'); changed(); } }];
    return [
      ...numbering,
      ...checkItems,
      ...(window.FTSort && !li.closest('.ft-footnotes') ? [window.FTSort.listItem(li)] : []),
      { text: 'Décaler vers la droite (Tab)', action: () => indent(li) },
      { text: 'Décaler vers la gauche (Maj+Tab)', action: () => indent(li, true) },
      ...(outerList(li).tagName === 'UL' && !outerList(li).classList.contains('ft-check') ? ['-', { text: 'Style…', action: () => window.FTStyles.open('tirets', outerList(li)) }] : [])
    ];
  }

  function calloutMenu(box) {
    if (box.classList.contains('ft-quote')) {
      return [
        { text: 'Style…', action: () => window.FTStyles.open('citations', box) },
        ...(box.querySelector(':scope > p.ft-quote-src') ? [] : [{ text: 'Ajouter la source', action: () => addQuoteSource(box) }]),
        ...((window.FTLayout && window.FTLayout.wrapMenu(box)) || []),
        '-',
        { text: 'Retirer la citation (garder le texte)', action: () => removeCallout(box) },
        { text: 'Supprimer la citation et son texte', danger: true, action: () => removeObject(box) }
      ];
    }
    return [
      { text: 'Style…', action: () => window.FTStyles.open('encadres', box) },
      ...((window.FTLayout && window.FTLayout.wrapMenu(box)) || []),
      '-',
      { text: "Retirer l'encadré (garder le texte)", action: () => removeCallout(box) },
      { text: "Supprimer l'encadré et son texte", danger: true, action: () => removeObject(box) }
    ];
  }

  editor.addEventListener('contextmenu', (e) => {
    const target = e.target.nodeType === Node.ELEMENT_NODE ? e.target : e.target.parentElement;
    if (!target || !editor.contains(target) || target.closest('.ft-math')) return;
    const cell = target.closest('td, th');
    const ref = target.closest('sup.ft-fn-ref');
    const tocItems = window.FTToc ? window.FTToc.menuItems(target) : [];
    const coverItems = window.FTCover ? window.FTCover.menuItems(target) : [];
    const lofItems = window.FTCaptions ? window.FTCaptions.menuItems(target) : [];
    const xrefItems = window.FTXref ? window.FTXref.menuItems(target) : [];
    const indexItems = window.FTIndex ? window.FTIndex.menuItems(target) : [];
    const note = target.closest('.ft-footnotes li');
    let items = [];
    if (tocItems.length) {
      items = tocItems;
    } else if (coverItems.length) {
      items = coverItems;
    } else if (lofItems.length) {
      items = lofItems;
    } else if (xrefItems.length) {
      items = xrefItems;
    } else if (indexItems.length) {
      items = indexItems;
    } else if (ref) {
      items = footnoteMenu(ref.dataset.fn);
    } else if (note) {
      items = footnoteMenu(note.dataset.fn);
    } else if (cell) {
      items = tableMenu(cell);
      const extra = window.FTLayout && window.FTLayout.wrapMenu(cell.closest('table'));
      if (extra && extra.length) items.splice(items.length - 2, 0, '-', ...extra);
    } else if (target.tagName === 'HR') {
      items = ruleMenu(target);
    } else {
      const li = target.closest('li');
      const h = target.closest('h1, h2, h3, h4, h5, h6');
      const box = target.closest('.ft-callout');
      const p = target.closest('p');
      if (li) items = listMenu(li);
      else if (h) items = headingMenu(h);
      else if (p && !p.closest('.ft-caption, .ft-footnotes, .ft-endnotes, .ft-biblio') && !p.classList.contains('ft-legend')) items = [lineTypeItem(p)];
      if (box) items = items.length ? [...items, '-', ...calloutMenu(box)] : calloutMenu(box);
      const zone = target.closest('.ft-cols');
      const zoneItems = zone && window.FTLayout ? window.FTLayout.zoneMenu(zone) : [];
      if (zoneItems.length) items = items.length ? [...items, '-', ...zoneItems] : zoneItems;
    }
    const bmItems = window.FTBookmarks ? window.FTBookmarks.menuItems(target) : [];
    if (bmItems.length) items = items.length ? [...items, '-', ...bmItems] : bmItems;
    // Toujours le même ordre : le mot et la sélection (synonymes, liens), puis ce qui est cliqué
    // (ligne, liste, tableau, encadré…), puis « Insérer » à la fin. Les réglages des pages
    // (orientation, numéros) restent dans « Réglages des pages ».
    const synonyms = window.FTSpell && window.FTSpell.synonymItems ? window.FTSpell.synonymItems(e.clientX, e.clientY) : [];
    const linkItems = window.FTLinks ? window.FTLinks.selectionItems() : [];
    const indexWord = window.FTIndex ? window.FTIndex.wordItems(e.clientX, e.clientY) : [];
    const commentItems = window.FTComments ? window.FTComments.menuItems(target, e.clientX, e.clientY) : [];
    const sel = window.getSelection();
    const formatItems = sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode)
      ? [{ text: 'Effacer la mise en forme', action: clearFormat }] : [];
    const langItems = window.FTLang ? window.FTLang.menuItems() : [];
    const sortItems = window.FTSort ? window.FTSort.selectionItems() : [];
    const ordItems = window.FTOrdinals ? window.FTOrdinals.menuItems(target, e.clientX, e.clientY) : [];
    const colItems = window.FTLayout && window.FTLayout.columnItems ? window.FTLayout.columnItems() : [];
    const groups = [[...ordItems, ...synonyms, ...linkItems, ...commentItems, ...indexWord, ...formatItems, ...colItems, ...sortItems, ...langItems], items, insertItems(e.clientX, e.clientY)].filter((g) => g.length);
    e.preventDefault();
    showMenu(e.clientX, e.clientY, groups.flatMap((g, i) => (i ? ['-', ...g] : g)));
  });

  // Effacer la mise en forme du texte sélectionné : police, taille, couleur, gras… reviennent à
  // ceux du thème du document. Les liens, notes et objets restent.
  // Élément entièrement compris dans la sélection.
  function inside(r, n) {
    const nr = document.createRange();
    nr.selectNodeContents(n);
    return r.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, nr) >= 0;
  }

  function clearFormat() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    checkpoint();
    const range = sel.getRangeAt(0);
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('removeFormat');
    const r = sel.rangeCount ? sel.getRangeAt(0) : range;
    const root = r.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const scope = editor.contains(root) ? root : editor;
    const inline = [...scope.querySelectorAll('span[style], font, b, strong, i, em, u, s, strike')]
      .filter((n) => inside(r, n) && !n.closest('.ft-math, .ft-image, .ft-toc, a.ft-doclink, sup, .ft-cite, .ft-date'));
    for (const n of inline) if (n.isConnected) n.replaceWith(...n.childNodes);
    // Retrait de première ligne posé à la main sur les lignes touchées.
    selectedTopBlocks().forEach((b) => {
      if (b.style && b.style.textIndent) b.style.removeProperty('text-indent');
      // Restes sans effet sur du texte (retrait posé sur un morceau de ligne).
      b.querySelectorAll('span[style]').forEach((n) => {
        n.style.removeProperty('text-indent');
        if (!n.style.length && !n.attributes[1] && !n.className) n.replaceWith(...n.childNodes);
      });
    });
    editor.normalize();
    changed();
  }
  // Ctrl+Espace.
  function clearKey(e) {
    if (e.code === 'Space' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !window.getSelection().isCollapsed) {
      e.preventDefault();
      clearFormatAny();
    }
  }
  editor.addEventListener('keydown', clearKey);
  const clearFormatAny = () => (engine ? engine.edit(clearFormat) : clearFormat());

  // « Insérer… » du clic droit : à l'endroit cliqué (ou à la fin de la sélection si on clique dedans).
  function insertItems(x, y) {
    const sel = window.getSelection();
    let range = null;
    if (sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) &&
        [...sel.getRangeAt(0).getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) {
      range = sel.getRangeAt(0).cloneRange();
      range.collapse(false);
    } else {
      range = document.caretRangeFromPoint(x, y);
    }
    if (range) {
      const el = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const obj = el && el.closest('.ft-image, .ft-math');
      if (obj) { range = document.createRange(); range.setStartAfter(obj); range.collapse(true); }
      if (!editor.contains(range.startContainer)) range = null;
    }
    const at = (fn) => () => {
      editor.focus({ preventScroll: true });
      if (range) {
        sel.removeAllRanges();
        sel.addRange(range);
        lastRange = range.cloneRange();
        if (engine) {
          // (Le curseur du moteur suit tout de suite : l'outil s'en sert aussitôt.)
          try {
            const v = window.FTMoteur.view;
            v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.near(v.state.doc.resolve(v.posAtDOM(range.startContainer, range.startOffset)))));
          } catch { /* endroit refait entre-temps */ }
        }
      }
      fn();
    };
    const click = (id) => at(() => document.getElementById(id).click());
    return [{
      text: 'Insérer',
      submenu: () => [
        { text: 'Image…', action: click('image-btn') },
        { text: 'Tableau', action: at(() => (engine ? window.FTBlocs.insertTable() : insertTable(newLook))) },
        { text: 'Schéma…', action: click('diagram-btn') },
        ...(window.FTBio ? [{ text: 'Repère biographique…', action: click('bio-btn') }] : []),
        { text: 'Équation…', action: click('math-btn') },
        { text: 'Symbole…', action: click('chars-btn') },
        ...(engine && window.FTCode && window.FTCode.insert ? [{ text: 'Bloc de code', action: at(() => window.FTCode.insert()) }] : []),
        '-',
        { text: 'Date', action: click('date-btn') },
        { text: 'Note de bas de page', action: click('note-btn') },
        { text: 'Note de fin', action: click('endnote-btn') },
        { text: 'Citation', action: at(() => (engine ? window.FTBlocs.toggleQuote() : toggleQuote())) },
        { text: 'Renvoi à une source…', action: click('cite-btn') },
        { text: 'Signet…', action: at(() => window.FTBookmarks.add()) },
        { text: 'Renvoi…', action: at(() => window.FTXref.open()) },
        '-',
        { text: 'Plan du document', action: at(() => window.FTToc.insert()) },
        { text: 'Table des illustrations', action: at(() => window.FTCaptions.insert('tout')) },
        { text: 'Index', action: at(() => window.FTIndex.insert()) },
        ...(window.FTPages.isPaged() ? [{ text: 'Page de titre…', action: () => window.FTCover.open() }] : [])
      ]
    }];
  }

  // ----- Barre d'outils : menu « Structure » et bouton « Tableau » -----

  const structureBtn = document.getElementById('structure-btn');
  const structurePop = document.getElementById('structure-pop');
  const tableQuick = document.getElementById('table-quick');
  const tableMore = document.getElementById('table-more');
  const tablePop = document.getElementById('table-pop');
  const pops = [structurePop, tablePop];

  function openPop(pop, anchor) {
    const wasOpen = !pop.hidden;
    pops.forEach((p) => { p.hidden = true; });
    if (wasOpen) return;
    pop.hidden = false;
    window.FTToolbar.placePop(pop, anchor);
  }
  const closePops = () => pops.forEach((p) => { p.hidden = true; });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.ft-dropdown')) closePops(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(); });

  function popButton(html, title, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = html;
    if (title) b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { closePops(); action(); });
    return b;
  }

  // Rangée de styles de numérotation, sous « Liste numérotée ».
  function numRow() {
    const row = document.createElement('div');
    row.className = 'num-styles';
    for (const [value, label, example] of NUM_STYLES) {
      const b = popButton(label, `Numérotation ${example}  (taper ${label} puis espace en début de ligne)`, () => toggleList(value));
      b.className = 'num-style';
      row.append(b);
    }
    return row;
  }

  // Rangée « Trier » : la liste du curseur ou les lignes sélectionnées.
  function sortRow() {
    const row = document.createElement('div');
    row.className = 'num-styles sort-row';
    const label = document.createElement('span');
    label.className = 'sort-label';
    label.textContent = 'Trier';
    row.append(label);
    for (const [mode, text, title] of [['az', 'A → Z', 'De A à Z'], ['za', 'Z → A', 'De Z à A'], ['date', 'Date', 'Par date, plus ancienne en premier'], ['num', 'Nombre', 'Par nombre, croissant']]) {
      const b = popButton(text, `${title} : la liste du curseur ou les lignes sélectionnées (clic droit pour l'ordre inverse)`, () => { restore(); window.FTSort.sortHere(mode); });
      b.className = 'num-style';
      row.append(b);
    }
    return row;
  }

  function buildStructurePop() {
    const hint = (t) => `<kbd>${t}</kbd>`;
    structurePop.append(
      popButton(`<span>Texte normal</span>`, '', () => setBlock('p')),
      popButton('<span class="ft-preview-h0">Titre du document</span>', 'Le grand titre en tête du texte (sans numéro). Il peut être déplacé ou effacé ; clic droit dessus : « Nommer le document »', () => setBlock('title')),
      ...Array.from({ length: LEVELS }, (_, i) => popButton(
        `<span class="ft-preview-h${i + 1}">Titre ${i + 1}</span>${hint('#'.repeat(i + 1))}`,
        `Taper ${'#'.repeat(i + 1)} puis espace en début de ligne`,
        () => setBlock('h' + (i + 1))
      )),
      document.createElement('hr'),
      popButton(`<span>Liste à tirets</span>${hint('-')}`, 'Taper - puis espace en début de ligne ; -- pour décaler', () => toggleList(false)),
      popButton(`<span>Liste numérotée</span>${hint('1.')}`, 'Taper 1. puis espace en début de ligne', () => toggleList(true)),
      numRow(),
      popButton(`<span>Liste à cocher</span>${hint('[ ]')}`, 'Taper [] puis espace en début de ligne ([x] pour une case déjà cochée)', toggleCheck),
      sortRow(),
      popButton(`<span>Encadré</span>${hint('&gt;')}`, 'Taper > puis espace en début de ligne', toggleCallout),
      popButton(`<span>Ligne de séparation</span>${hint('__')}`, 'Taper __ sur une ligne vide', () => { restore(); const sel = window.getSelection(); const b = sel.rangeCount && blockOf(sel.anchorNode); const top = b && topBlock(b); if (top) { checkpoint(); const p = document.createElement('p'); p.appendChild(document.createElement('br')); top.after(p); makeRule(p); } }),
      popButton('<span>Plan du document</span>', 'Insère le plan (titre du document et titres # à #####) à l\'endroit du curseur ; il se met à jour tout seul', () => { restore(); window.FTToc.insert(); }),
      popButton(`<span>Note de bas de page</span>${hint('^')}`, 'Taper ^ (puis espace sur un clavier français) à l\'endroit de l\'appel de note', menuFootnote),
      document.createElement('hr'),
      popButton('<span>Styles du document…</span>', 'Titres, tirets, tableaux, encadrés, plan, schémas', () => { closePops(); window.FTStyles.open(); })
    );
  }
  buildStructurePop();

  // Les styles prêts des titres (ancien bouton « Titres », retiré en 2.4.14) sont dans
  // « Styles du document », onglet Titres, et au clic droit sur un titre.

  const checkBtn = document.getElementById('check-btn');
  checkBtn.addEventListener('mousedown', (e) => e.preventDefault());
  checkBtn.addEventListener('click', () => { closePops(); toggleCheck(); });
  structureBtn.addEventListener('mousedown', (e) => e.preventDefault());
  structureBtn.addEventListener('click', () => openPop(structurePop, structureBtn));
  tableQuick.addEventListener('mousedown', (e) => e.preventDefault());
  tableQuick.addEventListener('click', () => { closePops(); insertTable(newLook); });
  tableMore.addEventListener('mousedown', (e) => e.preventDefault());
  tableMore.addEventListener('click', () => {
    // Un tableau sélectionné : le style s'applique à lui.
    const table = selectedObj && selectedObj.tagName === 'TABLE' ? selectedObj : null;
    if (!tablePop.hidden) return closePops();
    openTablePop(table, tableQuick);
  });

  // Style des prochains tableaux (donné par le thème du document ou la fenêtre « Styles du document »).
  let newLook = { ...DEFAULT_TABLE };

  // Petit tableau d'aperçu, dessiné avec les mêmes règles que les vrais.
  function thumb(look) {
    const table = buildTable({ ...look, rows: 5, cols: 4, width: 'full' });
    table.classList.add('ft-thumb');
    table.querySelectorAll('br').forEach((br) => br.remove());
    return table;
  }

  // Menu du tableau : la taille (sans tableau sélectionné), puis les styles prêts (docstyles.js).
  function openTablePop(table, anchor) {
    document.getElementById('table-size-part').hidden = !!table;
    window.FTStyles.renderQuick('tableaux', document.getElementById('table-styles'), table || undefined);
    closePops();
    openPop(tablePop, anchor);
  }

  // Grille de choix de la taille.
  const GRID = 8;
  const grid = document.getElementById('table-grid');
  const gridLabel = document.getElementById('table-grid-label');
  const tableOptions = () => newLook;
  for (let r = 1; r <= GRID; r++) {
    for (let c = 1; c <= GRID; c++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('mouseenter', () => {
        grid.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.r <= r && b.dataset.c <= c));
        gridLabel.textContent = `${r} ligne${r > 1 ? 's' : ''} × ${c} colonne${c > 1 ? 's' : ''}`;
      });
      cell.addEventListener('mousedown', (e) => e.preventDefault());
      cell.addEventListener('click', () => { closePops(); insertTable({ ...tableOptions(), rows: r, cols: c }); });
      grid.appendChild(cell);
    }
  }
  grid.addEventListener('mouseleave', () => {
    grid.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    gridLabel.textContent = 'Survolez pour choisir la taille';
  });
  document.getElementById('table-insert').addEventListener('click', () => {
    const clamp = (v, max) => Math.max(1, Math.min(max, Math.round(Number(v)) || 1));
    closePops();
    insertTable({
      ...tableOptions(),
      rows: clamp(document.getElementById('table-rows').value, 100),
      cols: clamp(document.getElementById('table-cols').value, 20)
    });
  });

  // ----- Réglages des styles de titres et de tirets -----
  // Ils s'affichent dans la fenêtre « Styles du document » (docstyles.js) : pour tout le document
  // (le thème), pour les prochains, ou pour un seul titre ou une seule liste (styles posés sur l'élément).

  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  }

  // Couleur : un sélecteur, et « Auto » pour suivre le mode jour/nuit.
  function colorControl(get, set) {
    const input = el('input', { type: 'color', value: get() || '#8a5a2b', title: 'Couleur' });
    const auto = el('button', { type: 'button', textContent: 'Auto', title: 'Couleur du texte, qui suit le mode jour/nuit' });
    const refresh = () => auto.classList.toggle('on', !get());
    input.addEventListener('input', () => { set(input.value); refresh(); });
    auto.addEventListener('click', () => { set(''); refresh(); });
    refresh();
    return el('span', { className: 'style-color' }, [input, auto]);
  }

  function toggle(label, title, get, set, extraClass) {
    const b = el('button', { type: 'button', innerHTML: label, title, className: extraClass || '' });
    const refresh = () => b.classList.toggle('on', !!get());
    b.addEventListener('click', () => { set(!get()); refresh(); });
    refresh();
    return b;
  }

  function fontOptions(select) {
    select.append(new Option('Police du texte', ''));
    document.querySelectorAll('#font-family optgroup').forEach((group) => {
      if (group.label === 'Polices Office') return;
      const g = el('optgroup', { label: group.label });
      group.querySelectorAll('option').forEach((o) => g.append(new Option(o.value, o.value)));
      select.append(g);
    });
  }

  function selectControl(options, title, get, set) {
    const select = el('select', { title });
    select.append(...options.map(([v, label]) => new Option(label, v)));
    select.value = get() || '';
    select.addEventListener('change', () => set(select.value));
    return select;
  }

  // Mise en forme d'un titre écrite directement sur un élément (aperçu, ou titre qui a son propre style).
  const HEADING_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-transform', 'font-variant-caps', 'color', 'text-align', 'border-bottom', 'padding-bottom'];
  function inlineHeading(node, h) {
    for (const d of textDecl(h)) {
      const i = d.indexOf(':');
      node.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    if (h.align) node.style.textAlign = h.align;
    node.style.borderBottom = h.rule ? '1px solid currentColor' : 'none';
    node.style.paddingBottom = h.rule ? '0.15em' : '0';
  }

  // Un seul titre avec son propre style (data-hs garde ce style).
  function ownHeading(node, h) {
    clearHeading(node);
    inlineHeading(node, h);
    node.dataset.hs = JSON.stringify(h);
  }
  function clearHeading(node) {
    if (!node.dataset.hs) return;
    let own = {};
    try { own = JSON.parse(node.dataset.hs) || {}; } catch { own = {}; }
    for (const prop of HEADING_PROPS) if (prop !== 'text-align' || own.align) node.style.removeProperty(prop);
    delete node.dataset.hs;
    if (!node.getAttribute('style')) node.removeAttribute('style');
  }
  function headingOwnStyle(node) {
    try { return node.dataset.hs ? JSON.parse(node.dataset.hs) : null; } catch { return null; }
  }

  // Une seule liste avec ses propres tirets (data-bl garde les cinq niveaux) : la liste du haut
  // redéfinit les tirets de chaque niveau (--ft-b1…, --ft-bc1…), ses sous-listes les suivent.
  function ownList(list, bullets) {
    clearList(list);
    list.dataset.bl = JSON.stringify(bullets);
    bullets.forEach((b, i) => {
      list.style.setProperty(`--ft-b${i + 1}`, cssString(b.symbol + ' '));
      list.style.setProperty(`--ft-bc${i + 1}`, validColor(b.color) || 'currentColor');
    });
  }
  function clearList(list) {
    // (Avant la 2.1.6 : un style posé sur chaque sous-liste.)
    for (const ul of [list, ...list.querySelectorAll('ul[data-blv]')]) {
      ul.style.removeProperty('list-style-type');
      ul.style.removeProperty('--bm');
      delete ul.dataset.blv;
      if (!ul.getAttribute('style')) ul.removeAttribute('style');
    }
    for (let i = 1; i <= LEVELS; i++) list.style.removeProperty(`--ft-b${i}`), list.style.removeProperty(`--ft-bc${i}`);
    if (!list.getAttribute('style')) list.removeAttribute('style');
    delete list.dataset.bl;
  }

  // Une liste numérotée avec sa propre numérotation : data-n1… sur la liste du haut ; les data-num
  // des sous-listes (numérotation d'une seule sous-liste) sont retirés.
  function ownNumbers(list, numbers) {
    clearNumbers(list);
    numbers.forEach((f, i) => { if (NUM_CSS[f]) list.setAttribute(`data-n${i + 1}`, f); });
  }
  function clearNumbers(list) {
    for (const ol of [list, ...list.querySelectorAll('ol[data-num]')]) ol.removeAttribute('data-num');
    for (let i = 1; i <= LEVELS; i++) list.removeAttribute(`data-n${i}`);
  }
  // Numérotation de chaque niveau d'une liste telle qu'elle s'affiche (null : celle du thème).
  function numbersOf(list) {
    if (!list) return null;
    const own = [...Array(LEVELS)].some((_, i) => list.hasAttribute(`data-n${i + 1}`)) || list.hasAttribute('data-num') || !!list.querySelector('ol[data-num]');
    if (!own) return null;
    const cs = (ol, k) => getComputedStyle(ol).getPropertyValue(`--ft-f${k}`).trim();
    const out = styles.numbers.slice();
    let lists = [list];
    for (let k = 1; k <= LEVELS && lists.length; k++) {
      const css = cs(lists[0], k);
      const f = Object.keys(NUM_CSS).find((x) => NUM_CSS[x] === css);
      if (f) out[k - 1] = f;
      lists = lists.flatMap((l) => [...l.querySelectorAll(':scope > li > ol')]);
    }
    return out;
  }
  function listOwnStyle(list) {
    try { return list.dataset.bl ? JSON.parse(list.dataset.bl) : null; } catch { return null; }
  }

  // Une ligne de réglages : aperçu, puis police, taille, G I S, majuscules, petites capitales,
  // couleur, alignement ; pour les titres # à #####, aussi le filet et la numérotation.
  function styleRow(h, label, keys, onChange) {
    const sample = el('span', { textContent: label });
    const paint = () => { sample.removeAttribute('style'); inlineHeading(sample, h); sample.style.fontSize = Math.min(Number(h.size) || 12, 22) + 'pt'; sample.style.textAlign = ''; sample.style.borderBottom = ''; };
    const update = (key) => (v) => { h[key] = v; paint(); onChange(); };
    const font = el('select', { title: 'Police' });
    fontOptions(font);
    if (h.font && ![...font.options].some((o) => o.value === h.font)) font.append(new Option(h.font, h.font));
    font.value = h.font;
    font.addEventListener('change', () => update('font')(font.value));
    const size = el('select', { title: 'Taille' });
    Object.assign(size.dataset, { min: 6, max: 96 });
    size.append(...HEADING_SIZES.map((x) => new Option(x + ' pt', x)));
    if (!HEADING_SIZES.includes(Number(h.size))) size.append(new Option(String(h.size).replace('.', ',') + ' pt', h.size));
    size.value = h.size;
    size.addEventListener('change', () => update('size')(Number(size.value)));
    const controls = [
      font, size,
      toggle('<b>G</b>', 'Gras', () => h.bold, update('bold')),
      toggle('<i>I</i>', 'Italique', () => h.italic, update('italic')),
      toggle('<u>S</u>', 'Souligné', () => h.underline, update('underline')),
      toggle('AA', 'Tout en majuscules', () => h.caps, update('caps'), 'caps'),
      toggle('<span style="font-variant-caps: small-caps">Pc</span>', 'Petites capitales', () => h.smallcaps, update('smallcaps')),
      colorControl(() => h.color, update('color')),
      selectControl(ALIGNS, 'Alignement', () => h.align, update('align')),
      toggle('<span class="rule-icon">T</span>', 'Filet : un trait sous le titre', () => h.rule, update('rule'))
    ];
    if (keys) controls.push(selectControl(HEADING_NUMBERS, 'Numérotation automatique des titres de cet étage', () => h.number, update('number')));
    paint();
    return el('div', { className: 'style-row' }, [
      el('div', { className: 'style-preview' }, [sample, el('kbd', { textContent: keys || (label === 'Titre du document' ? 'titre du document' : '') })]),
      el('div', { className: 'style-controls' }, controls)
    ]);
  }

  // Réglages des titres. value : { title, headings } ; single : null (tous les étages) ou l'étage
  // d'un seul titre (0 : titre du document).
  function headingEditor({ value, onChange, single = null }) {
    const box = el('div', { className: 'styles-panel' });
    if (single === null) {
      box.append(styleRow(value.title, 'Titre du document', '', onChange));
      value.headings.forEach((h, i) => box.append(styleRow(h, `Titre ${i + 1}`, '#'.repeat(i + 1), onChange)));
    } else {
      const h = single === 0 ? value.title : value.headings[single - 1];
      box.append(styleRow(h, single === 0 ? 'Titre du document' : `Titre ${single}`, '', onChange));
      box.append(el('p', { className: 'styles-note', textContent: 'La numérotation automatique reste celle du document.' }));
    }
    return box;
  }

  // Réglages des tirets : value = les cinq niveaux { symbol, color }.
  function bulletEditor({ value, onChange }) {
    const box = el('div', { className: 'styles-panel' });
    const preview = el('div', { className: 'ft-list-preview' });
    const paint = () => {
      let list = null;
      for (let i = LEVELS - 1; i >= 0; i--) {
        const li = el('li', { textContent: `Niveau ${i + 1}` });
        if (list) li.append(list);
        list = el('ul', {}, [li]);
      }
      ownList(list, value);
      delete list.dataset.bl;
      preview.replaceChildren(list);
    };
    value.forEach((b, i) => {
      const update = (key) => (v) => { b[key] = v; paint(); onChange(); };
      const symbol = el('select', { title: 'Forme du tiret' });
      symbol.append(...BULLETS.map(([sym, name]) => new Option(`${sym}   ${name}`, sym)));
      if (!BULLETS.some(([sym]) => sym === b.symbol)) symbol.append(new Option(b.symbol, b.symbol));
      symbol.value = b.symbol;
      symbol.addEventListener('change', () => update('symbol')(symbol.value));
      const how = i === 0 ? '- puis espace' : `puis ${i}× - ou ${i}× Tab`;
      box.append(el('div', { className: 'style-row bullet-row' }, [
        el('span', { className: 'style-level', textContent: `Niveau ${i + 1}` }),
        symbol,
        colorControl(() => b.color, update('color')),
        el('kbd', { textContent: how })
      ]));
    });
    paint();
    box.append(preview);
    return box;
  }

  // Styles prêts des tirets (les cinq niveaux d'un coup).
  const BULLET_PRESETS = [
    ['classiques', 'Tirets', ['–', '•', '◦', '▪', '–']],
    ['puces', 'Puces', ['•', '◦', '▪', '•', '◦']],
    ['longs', 'Tirets longs', ['—', '–', '·', '–', '·']],
    ['carres', 'Carrés', ['▪', '▫', '–', '▪', '▫']],
    ['fleches', 'Flèches', ['→', '▸', '–', '•', '–']],
    ['losanges', 'Losanges', ['◆', '▸', '–', '◆', '–']],
    ['coches', 'Coches', ['✓', '–', '•', '–', '•']],
    ['etoiles', 'Étoiles', ['★', '•', '◦', '–', '–']],
    ['chevrons', 'Chevrons', ['»', '›', '–', '·', '–']],
    ['fleurons', 'Fleurons', ['❖', '◆', '◦', '–', '–']],
    ['cercles', 'Cercles', ['●', '○', '◦', '·', '·']],
    ['triangles', 'Triangles', ['▶', '▷', '▸', '▹', '–']],
    ['doubles', 'Flèches doubles', ['⇒', '→', '–', '·', '–']],
    ['points', 'Points', ['·', '·', '·', '·', '·']],
    ['mixtes', 'Mixtes', ['■', '–', '•', '◦', '·']]
  ].map(([id, name, syms]) => ({ id, name, value: syms.map((symbol) => ({ symbol, color: '' })) }));

  // Réglages de la numérotation : value = les cinq niveaux ('1', 'i', 'I', 'a', 'A').
  const NUM_CHOICES = [['1', '1, 2, 3'], ['i', 'i, ii, iii'], ['I', 'I, II, III'], ['a', 'a, b, c'], ['A', 'A, B, C']];
  // Numéro d'une ligne d'un niveau, avec les niveaux au-dessus : « 1.a. ».
  const numText = (n, f) => (f === 'i' ? roman(n).toLowerCase() : formatNum(n, f));
  const numLabel = (numbers, k, n = 1) => numbers.slice(0, k).map((f, j) => numText(j === k - 1 ? n : 1, f)).join('.') + '.';
  function numberPreview(numbers, levels = LEVELS, short = false) {
    let list = null;
    for (let i = levels - 1; i >= 0; i--) {
      const li = el('li', { textContent: short ? ['Premier', 'Deuxième', 'Troisième'][i] : `Niveau ${i + 1}` });
      if (list) li.append(list);
      list = el('ol', {}, [li]);
    }
    ownNumbers(list, numbers);
    return list;
  }
  function numberEditor({ value, onChange }) {
    const box = el('div', { className: 'styles-panel' });
    const preview = el('div', { className: 'ft-list-preview' });
    const paint = () => preview.replaceChildren(numberPreview(value));
    value.forEach((f, i) => {
      const select = el('select', { title: 'Numérotation du niveau' });
      const fill = () => {
        select.replaceChildren(...NUM_CHOICES.map(([v]) => new Option(numLabel(value.map((x, j) => (j === i ? v : x)), i + 1), v)));
        select.value = value[i];
      };
      fill();
      select.addEventListener('change', () => {
        value[i] = select.value;
        box.querySelectorAll('select').forEach((s) => s.dispatchEvent(new CustomEvent('ft-refill')));
        paint();
        onChange();
      });
      select.addEventListener('ft-refill', fill);
      const how = i === 0 ? '1. puis espace' : `puis ${i}× -- ou ${i}× Tab`;
      box.append(el('div', { className: 'style-row bullet-row' }, [
        el('span', { className: 'style-level', textContent: `Niveau ${i + 1}` }),
        select,
        el('kbd', { textContent: how })
      ]));
    });
    paint();
    box.append(preview);
    return box;
  }
  // Styles prêts de la numérotation (les cinq niveaux d'un coup).
  const NUMBER_PRESETS = [
    ['chiffres', 'Chiffres', ['1', '1', '1', '1', '1']],
    ['lettres', 'Chiffres et lettres', ['1', 'a', 'i', '1', 'a']],
    ['plan', 'Plan classique', ['I', 'A', '1', 'a', 'i']],
    ['romains', 'Chiffres romains', ['I', '1', 'a', 'i', '1']],
    ['minuscules', 'Lettres', ['a', 'i', '1', 'a', 'i']],
    ['majuscules', 'Majuscules', ['A', '1', 'a', 'i', '1']]
  ].map(([id, name, value]) => ({ id, name, value }));

  function openStyles(tab) {
    closePops();
    window.FTStyles.open(tab === 'tirets' ? 'tirets' : 'titres');
  }

  // ----- Lignes de séparation (« __ ») -----

  const RULE_STYLES = [['', 'Trait fin'], ['epais', 'Trait épais'], ['double', 'Double trait'], ['pointilles', 'Pointillés'], ['court', 'Trait court, centré']];

  // La ligne prend la place du paragraphe (vide) où l'on écrivait. Il ne reste que s'il n'y a pas de
  // ligne de texte après, pour continuer à écrire ; sinon le curseur passe au début de la ligne suivante.
  function makeRule(p) {
    const hr = document.createElement('hr');
    hr.className = 'ft-rule';
    p.before(hr);
    const next = p.nextElementSibling;
    if (!p.textContent.trim() && !p.querySelector('img, .ft-image, .ft-math') && next && next.matches('p, div:not([class]), h1, h2, h3, h4, h5, h6')) {
      p.remove();
      placeCaret(next);
    } else {
      if (!p.firstChild) p.appendChild(document.createElement('br'));
      placeCaret(p);
    }
    changed();
  }

  // ----- Écrire après un tableau, une ligne de séparation ou un plan placé en dernier -----

  // Dernier bloc du texte (avant les notes, la bibliographie et les marques de page).
  function lastBlock() {
    let last = editor.lastElementChild;
    while (last && last.matches('.ft-footnotes, .ft-endnotes, .ft-biblio, .ft-pg-gap')) last = last.previousElementSibling;
    return last;
  }
  const ENDS_TEXT = 'table, hr, .ft-toc, .ft-lof, .ft-index, blockquote, .ft-image, .ft-math, .ft-cols, figure';

  // Moteur 2.0 : lignes vides ajoutées après le bloc (jusqu'à la hauteur y si elle est donnée), curseur
  // sur la dernière ; une étape d'annulation.
  function engineLines(block, y) {
    const M = window.FTMoteur;
    const v = M.view;
    const pos = engine.posOf(block);
    if (pos === null) return null;
    let at = pos + v.state.doc.nodeAt(pos).nodeSize;
    let dom = null;
    M.closeHistory();
    for (let i = 0; i < 300; i++) {
      const tr = v.state.tr.insert(at, v.state.schema.nodes.paragraph.create({ bare: false }));
      tr.setSelection(PM.state.TextSelection.create(tr.doc, at + 1));
      v.dispatch(tr.scrollIntoView());
      dom = v.nodeDOM(at);
      if (y === null || !dom || dom.getBoundingClientRect().bottom >= y) break;
      at += 2;
    }
    M.closeHistory();
    v.focus();
    return dom;
  }

  function lineAfter(block) {
    if (engine) return engineLines(block, null);
    checkpoint();
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    block.after(p);
    placeCaret(p);
    changed();
    return p;
  }

  // Clic sous le dernier élément quand c'est un tableau, une ligne de séparation, un plan… : une
  // ligne de texte s'ajoute dessous.
  document.getElementById('workspace').addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('.ft-toolbar, .ft-pop, #doc-tags, #doc-name, #block-handle, button, input, select')) return;
    const last = lastBlock();
    // (Moteur 2.0 : un dernier bloc retiré de l'affichage est loin de l'écran.)
    if (!last || !last.matches(ENDS_TEXT) || page.hidden || last.hasAttribute('data-pm-far')) return;
    const r = last.getBoundingClientRect();
    const box = editor.getBoundingClientRect();
    if (e.clientY <= r.bottom + 2 || e.clientX < box.left - 40 || e.clientX > box.right + 40) return;
    const notes = last.nextElementSibling && last.parentNode.querySelector(':scope > :is(.ft-footnotes, .ft-endnotes, .ft-biblio)');
    if (notes && e.clientY >= notes.getBoundingClientRect().top) return;
    e.preventDefault();
    editor.focus({ preventScroll: true });
    lineAfter(last);
  });

  // Double-clic sous la dernière ligne du texte : des lignes vides s'ajoutent jusqu'à l'endroit cliqué,
  // et le curseur s'y place (comme « cliquer-taper » dans Word).
  document.getElementById('workspace').addEventListener('dblclick', (e) => {
    if (e.button !== 0 || page.hidden || document.getElementById('app').classList.contains('reading-mode')) return;
    if (e.target.closest('.ft-toolbar, .ft-pop, #doc-tags, #doc-name, #block-handle, #cm-layer, button, input, select, textarea')) return;
    const last = lastBlock();
    if (!last || last.hasAttribute('data-pm-far')) return;
    const box = editor.getBoundingClientRect();
    if (e.clientX < box.left - 40 || e.clientX > box.right + 40 || e.clientY <= last.getBoundingClientRect().bottom + 4) return;
    const notes = editor.querySelector(':scope > :is(.ft-footnotes, .ft-endnotes, .ft-biblio)');
    if (notes && e.clientY >= notes.getBoundingClientRect().top) return;
    e.preventDefault();
    editor.focus({ preventScroll: true });
    if (engine) { engineLines(last, e.clientY); return; }
    checkpoint();
    let block = last;
    for (let i = 0; i < 300; i++) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      block.after(p);
      block = p;
      if (p.getBoundingClientRect().bottom >= e.clientY) break;
    }
    placeCaret(block);
    changed();
  });

  // Flèche vers le bas dans la dernière ligne d'un tableau placé en dernier : une ligne de texte s'ajoute dessous.
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement);
    const cell = node && node.closest('td, th');
    const table = cell && cell.closest('table');
    if (!table || table !== lastBlock() || cell.parentElement !== table.rows[table.rows.length - 1]) return;
    // Seulement depuis la dernière ligne visuelle de la case.
    const rc = sel.getRangeAt(0).getClientRects()[0];
    const cb = cell.getBoundingClientRect();
    if (rc && cb.bottom - rc.bottom > rc.height) return;
    e.preventDefault();
    lineAfter(table);
  });

  function ruleMenu(hr) {
    return [
      { label: 'Ligne de séparation' },
      ...RULE_STYLES.map(([value, name]) => ({
        text: check((hr.dataset.style || '') === value, name),
        action: () => { checkpoint(); if (value) hr.dataset.style = value; else delete hr.dataset.style; changed(); placeFrame(); }
      })),
      '-',
      { text: 'Supprimer la ligne', danger: true, action: () => removeObject(hr) }
    ];
  }

  // ----- Notes de bas de page -----

  const newNoteId = () => 'n' + Math.random().toString(36).slice(2, 9);

  // Numérote les appels de note dans l'ordre du texte et range les notes dans le même ordre,
  // à la fin du document. Une note dont l'appel a été effacé disparaît avec lui.
  function syncFootnotes() {
    const refs = [...editor.querySelectorAll('sup.ft-fn-ref')].filter((r) => !r.closest('.ft-footnotes'));
    let box = editor.querySelector('.ft-footnotes');
    if (!refs.length) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'ft-footnotes';
    }
    if (box !== editor.lastElementChild) editor.appendChild(box);
    let ol = box.querySelector('ol');
    if (!ol) ol = box.appendChild(document.createElement('ol'));
    const notes = new Map();
    for (const li of ol.querySelectorAll('li')) if (li.dataset.fn && !notes.has(li.dataset.fn)) notes.set(li.dataset.fn, li);
    const seen = new Set();
    refs.forEach((ref, i) => {
      if (!ref.dataset.fn || seen.has(ref.dataset.fn)) ref.dataset.fn = newNoteId();
      seen.add(ref.dataset.fn);
      const n = String(i + 1);
      if (ref.textContent !== n) ref.textContent = n;
      if (ref.getAttribute('contenteditable') !== 'false') ref.setAttribute('contenteditable', 'false');
      let li = notes.get(ref.dataset.fn);
      if (!li) {
        li = document.createElement('li');
        li.dataset.fn = ref.dataset.fn;
        li.appendChild(document.createElement('br'));
      }
      if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null);
      const empty = li.textContent.trim() === '';
      if (li.classList.contains('empty') !== empty) li.classList.toggle('empty', empty);
      if (!li.classList.length && li.hasAttribute('class')) li.removeAttribute('class');
    });
    while (ol.children.length > refs.length) ol.lastElementChild.remove();
  }

  // Ajoute un appel de note à l'endroit indiqué, puis place le curseur dans la note.
  function addFootnote(range) {
    const ref = document.createElement('sup');
    ref.className = 'ft-fn-ref';
    ref.dataset.fn = newNoteId();
    ref.setAttribute('contenteditable', 'false');
    range.insertNode(ref);
    syncFootnotes();
    const li = editor.querySelector(`.ft-footnotes li[data-fn="${ref.dataset.fn}"]`);
    placeCaret(li, true);
    li.scrollIntoView({ block: 'nearest' });
    changed();
  }

  function typedFootnote(info) {
    if (info.block.closest('.ft-footnotes')) return;
    const sel = window.getSelection();
    const r = sel.getRangeAt(0);
    if (r.startContainer.nodeType !== Node.TEXT_NODE || r.startOffset < 1) return;
    checkpoint();
    const range = document.createRange();
    range.setStart(r.startContainer, r.startOffset - 1);
    range.setEnd(r.startContainer, r.startOffset);
    range.deleteContents();
    addFootnote(range);
  }

  function menuFootnote() {
    restore();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const b = blockOf(sel.anchorNode);
    if (b && b.closest('.ft-footnotes')) return;
    checkpoint();
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
    addFootnote(range);
  }

  function backToReference(note) {
    const ref = editor.querySelector(`sup.ft-fn-ref[data-fn="${note.dataset.fn}"]`);
    if (!ref) return;
    const range = document.createRange();
    range.setStartAfter(ref);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ref.scrollIntoView({ block: 'nearest' });
  }

  function footnoteMenu(id) {
    const ref = editor.querySelector(`sup.ft-fn-ref[data-fn="${id}"]`);
    const note = editor.querySelector(`.ft-footnotes li[data-fn="${id}"]`);
    return [
      { text: 'Aller à la note', disabled: !note, action: () => { placeCaret(note, true); note.scrollIntoView({ block: 'nearest' }); } },
      { text: "Revenir à l'appel de note", disabled: !ref, action: () => backToReference(note) },
      '-',
      { text: 'Supprimer la note', danger: true, action: () => { checkpoint(); if (ref) ref.remove(); syncFootnotes(); changed(); } }
    ];
  }

  // Un clic sur l'appel de note mène à la note.
  editor.addEventListener('click', (e) => {
    const ref = e.target.closest && e.target.closest('sup.ft-fn-ref');
    if (!ref || ref.closest('.ft-footnotes')) return;
    const note = editor.querySelector(`.ft-footnotes li[data-fn="${ref.dataset.fn}"]`);
    if (note) placeCaret(note, true);
  });

  // ----- Objets : tableaux, encadrés et lignes de séparation -----
  // Sélection par double-clic (hors d'un mot), par clic sur la poignée à gauche, ou par clic sur
  // une ligne de séparation. Suppr efface l'objet ; la poignée permet de le glisser ailleurs.

  // Plan, table des illustrations et index : blocs produits par le logiciel, déplacés et supprimés comme un objet.
  const OBJECTS = 'table.ft-table, blockquote.ft-callout, pre.ft-code, hr, div.ft-math, .ft-image, div.ft-toc, div.ft-lof, div.ft-index';
  // Objets placés librement sur la page (layout.js) : ils se déplacent en les glissant directement.
  const isFree = (obj) => obj.dataset.wrap === 'devant' || obj.dataset.wrap === 'derriere';
  const page = document.getElementById('page');
  const handle = document.createElement('div');
  handle.id = 'block-handle';
  handle.title = 'Cliquer pour sélectionner, glisser pour déplacer';
  handle.textContent = '⠿';
  handle.hidden = true;
  const frame = document.createElement('div');
  frame.id = 'object-frame';
  frame.hidden = true;
  page.append(handle, frame);

  let selectedObj = null;
  let hoverObj = null;

  function objectOf(node) {
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    const obj = el && el.closest(OBJECTS);
    if (!obj || !editor.contains(obj)) return null;
    // Une image peut aussi se trouver dans une ligne de texte.
    return isContainer(obj.parentNode) || obj.classList.contains('ft-image') ? obj : null;
  }

  // Position d'un élément dans la page (qui défile avec le texte).
  // Zoom de la page (zoom.js) : ramené à la taille réelle, comme les positions posées dans la page.
  function pageRect(el) {
    const r = el.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    const k = page.currentCSSZoom || 1;
    return { top: (r.top - p.top) / k, left: (r.left - p.left) / k, width: r.width / k, height: r.height / k };
  }

  let onObjectChange = () => {};

  function placeFrame() {
    if (!selectedObj) return;
    if (!selectedObj.isConnected) return deselect();
    const r = pageRect(selectedObj);
    Object.assign(frame.style, { top: r.top - 5 + 'px', left: r.left - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px' });
    // Un objet déplacé librement emporte sa poignée avec lui.
    if (hoverObj && !handle.hidden && hoverObj.isConnected) placeHandle(hoverObj);
    onObjectChange(selectedObj, r);
  }

  function selectObject(obj) {
    selectedObj = obj;
    editor.classList.add('object-selected');
    frame.hidden = false;
    placeFrame();
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNode(obj);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function deselect() {
    selectedObj = null;
    editor.classList.remove('object-selected');
    frame.hidden = true;
    onObjectChange(null);
  }

  // La sélection a bougé ailleurs (clic, frappe…) : l'objet n'est plus sélectionné.
  document.addEventListener('selectionchange', () => {
    if (!selectedObj) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode) && sel.anchorNode !== editor) return;
    const r = sel.getRangeAt(0);
    const parent = selectedObj.parentNode;
    const same = r.startContainer === parent && r.endContainer === parent &&
      parent.childNodes[r.startOffset] === selectedObj && r.endOffset === r.startOffset + 1;
    if (!same) deselect();
  });

  // Après une suppression, il reste toujours une ligne où écrire.
  function ensureParagraph(after) {
    const first = editor.firstElementChild;
    if (!first || first.classList.contains('ft-footnotes')) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      editor.prepend(p);
      return p;
    }
    return after;
  }

  function removeObject(obj) {
    checkpoint();
    const parent = obj.parentNode;
    let next = obj.nextElementSibling;
    if (!next || next.classList.contains('ft-footnotes')) next = obj.previousElementSibling;
    // Image dans une ligne : le curseur reste à sa place dans le texte.
    if (!isContainer(parent)) {
      const range = document.createRange();
      range.setStartBefore(obj);
      obj.remove();
      deselect();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      changed();
      return;
    }
    obj.remove();
    deselect();
    syncFootnotes();
    if (isZone(parent) && !parent.firstElementChild) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      parent.appendChild(p);
      next = p;
    }
    next = ensureParagraph(next);
    if (next && next.isConnected) placeCaret(next.matches('table') ? next.rows[0].cells[0] : next, true);
    changed();
  }

  // Déplace l'objet avant ou après un autre bloc du texte.
  function moveObject(obj, target, after) {
    if (!target || target === obj) return;
    if (target.classList.contains('ft-footnotes')) { after = false; }
    checkpoint();
    const from = obj.parentNode;
    if (after) target.after(obj);
    else target.before(obj);
    // Une zone en colonnes vidée garde une ligne où écrire.
    if (isZone(from) && !from.firstElementChild) from.remove();
    // Un tableau en fin de texte garde une ligne après lui pour continuer à écrire.
    const next = obj.nextElementSibling;
    if (obj.tagName === 'TABLE' && (!next || next.classList.contains('ft-footnotes'))) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      obj.after(p);
    }
    changed();
    selectObject(obj);
  }

  // Touches quand un objet est sélectionné. Renvoie vrai si la touche est traitée ici.
  function objectKey(e) {
    const obj = selectedObj;
    if (e.ctrlKey || e.metaKey) return false; // Copier, couper, annuler… : comportement habituel.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeObject(obj);
    } else if (!isContainer(obj.parentNode) && (e.key === 'Escape' || e.key.startsWith('Arrow') || e.key === 'Enter')) {
      // Image dans une ligne : le curseur se place juste avant ou juste après elle.
      e.preventDefault();
      deselect();
      const range = document.createRange();
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') range.setStartBefore(obj);
      else range.setStartAfter(obj);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (window.FTLayout && window.FTLayout.isLocked(obj)) return true; // mouvement fixe
      const up = e.key === 'ArrowUp';
      const target = up ? obj.previousElementSibling : obj.nextElementSibling;
      if (target) moveObject(obj, target, !up);
    } else if (e.key === 'Escape' || e.key.startsWith('Arrow') || e.key === 'Enter') {
      e.preventDefault();
      const before = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      deselect();
      let target = before ? obj.previousElementSibling : obj.nextElementSibling;
      if (e.key === 'Enter' || !target || target.matches(OBJECTS) || target.classList.contains('ft-footnotes')) {
        // Nouvelle ligne juste après l'objet.
        if (e.key === 'Enter' || !target) {
          checkpoint();
          target = document.createElement('p');
          target.appendChild(document.createElement('br'));
          obj.after(target);
          changed();
        }
      }
      if (target.matches('table')) target = target.rows[0].cells[0];
      placeCaret(target, before);
    } else if (e.key.length === 1) {
      caretAfter(obj); // La frappe continue juste après l'objet, sans l'effacer.
    } else {
      return false;
    }
    return true;
  }

  // Curseur juste après l'objet : dans la ligne pour une image du texte, sinon au début du paragraphe suivant.
  function caretAfter(obj) {
    deselect();
    if (!isContainer(obj.parentNode)) {
      const range = document.createRange();
      range.setStartAfter(obj);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    let next = obj.nextElementSibling;
    if (!next || !next.matches('p, h1, h2, h3, h4, h5, h6, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math)')) {
      checkpoint();
      next = document.createElement('p');
      next.appendChild(document.createElement('br'));
      obj.after(next);
      changed();
    }
    placeCaret(next);
  }

  // Lettre accentuée composée (^ puis e…) ou texte venu d'ailleurs : il ne remplace pas l'objet sélectionné.
  editor.addEventListener('compositionstart', () => { if (selectedObj) caretAfter(selectedObj); });
  editor.addEventListener('beforeinput', (e) => {
    if (!selectedObj || !/^insert(Text|ReplacementText)$/.test(e.inputType) || !e.data) return;
    e.preventDefault();
    caretAfter(selectedObj);
    document.execCommand('insertText', false, e.data);
  });

  editor.addEventListener('dblclick', (e) => {
    const obj = objectOf(e.target);
    if (!obj || e.target.closest('.ft-toc-label')) return;
    // Double-clic sur un mot : on garde la sélection du mot. Ailleurs dans l'objet : on le sélectionne.
    if (e.target === obj || window.getSelection().toString().trim() === '') {
      e.preventDefault();
      selectObject(obj);
    }
  });
  editor.addEventListener('mousedown', (e) => {
    if (e.button === 0 && e.target.tagName === 'HR' && e.target.parentNode === editor) {
      e.preventDefault();
      selectObject(e.target);
    }
  });

  // Poignée à gauche de l'objet survolé.
  page.addEventListener('mousemove', (e) => {
    if (dragging) return;
    const ed = editor.getBoundingClientRect();
    let found = null;
    if (e.clientX >= ed.left - 40 && e.clientX <= ed.right) {
      for (const obj of handleObjects()) {
        const r = obj.getBoundingClientRect();
        if (e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) { found = obj; break; }
      }
    }
    // Même objet : la poignée le suit quand même (il peut être en train de bouger).
    if (found !== hoverObj) {
      hoverObj = found;
      handle.hidden = !found;
    }
    if (found) placeHandle(found);
  });

  // Objet placé librement ou à côté du texte : la poignée est contre lui, pas dans la marge.
  function placeHandle(obj) {
    const r = pageRect(obj);
    const beside = isFree(obj) || obj.dataset.wrap === 'gauche' || obj.dataset.wrap === 'droite';
    handle.style.left = (beside ? r.left : pageRect(editor).left) - 30 + 'px';
    handle.style.top = r.top + Math.min(r.height / 2, 14) - 12 + 'px';
    // Mouvement fixe : la poignée sélectionne l'objet sans le déplacer.
    const locked = !!(window.FTLayout && window.FTLayout.isLocked(obj));
    handle.classList.toggle('locked', locked);
    handle.title = locked ? 'Cliquer pour sélectionner' : 'Cliquer pour sélectionner, glisser pour déplacer';
  }
  page.addEventListener('mouseleave', () => { if (!dragging) { hoverObj = null; handle.hidden = true; } });

  // Objets qui ont une poignée : ceux du texte et des zones en colonnes.
  // Le sélecteur est préparé une fois (la recherche a lieu à chaque mouvement de la souris).
  const HANDLE_OBJECTS = ['table.ft-table', 'blockquote.ft-callout', 'pre.ft-code', 'hr', 'div.ft-math', '.ft-image', 'div.ft-toc', 'div.ft-lof', 'div.ft-index']
    .flatMap((k) => [`:scope > ${k}`, `:scope > .ft-cols > ${k}`]).join(', ');
  function handleObjects() {
    return [...editor.querySelectorAll(HANDLE_OBJECTS)];
  }

  // Blocs entre lesquels on peut déposer un objet (ceux des zones en colonnes compris).
  const dropBlocks = () => [...editor.children]
    .flatMap((b) => (isZone(b) ? [...b.children] : [b]))
    .filter((b) => !b.classList.contains('ft-footnotes') && !(b.matches(OBJECTS) && isFree(b)));

  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !hoverObj) return;
    e.preventDefault();
    if (!(window.FTLayout && window.FTLayout.startDrag(hoverObj, e))) startBlockDrag(hoverObj, e);
  });

  // Glisser un objet entre les blocs du texte (poignée, ou image saisie directement) :
  // il change de place pendant le geste, et le texte se réarrange aussitôt.
  // onStart : appelé quand l'objet change de place pour la première fois (layout.js).
  function startBlockDrag(obj, e, onStart) {
    const startY = e.clientY;
    const startX = e.clientX;
    const from = obj.parentNode;
    let moved = false;
    let last = null;
    let frameId = 0;

    function step() {
      frameId = 0;
      // Emplacement le plus proche : avant ou après l'un des blocs du texte.
      let best = null;
      for (const b of dropBlocks()) {
        if (b === obj || b.dataset.wrap === 'gauche' || b.dataset.wrap === 'droite') continue;
        const r = b.getBoundingClientRect();
        for (const [y, after] of [[r.top, false], [r.bottom, true]]) {
          const d = Math.abs(last.clientY - y);
          if (!best || d < best.d) best = { d, target: b, after };
        }
      }
      if (!best) return;
      if ((best.after ? best.target.nextElementSibling : best.target.previousElementSibling) === obj) return;
      if (!moved) { moved = true; checkpoint(); if (onStart) onStart(); }
      if (best.after) best.target.after(obj);
      else best.target.before(obj);
      placeHandle(obj);
      placeFrame();
    }

    function onMove(ev) {
      if (!dragging && Math.abs(ev.clientY - startY) < 5 && Math.abs(ev.clientX - startX) < 5) return;
      if (!dragging) {
        dragging = true;
        handle.classList.add('dragging');
        document.body.classList.add('ft-dragging');
      }
      last = ev;
      if (!frameId) frameId = requestAnimationFrame(step);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frameId) { cancelAnimationFrame(frameId); step(); }
      handle.classList.remove('dragging');
      document.body.classList.remove('ft-dragging');
      if (moved) {
        // Une zone en colonnes vidée disparaît ; un tableau en fin de texte garde une ligne après lui.
        if (isZone(from) && !from.firstElementChild) from.remove();
        const next = obj.nextElementSibling;
        if (obj.tagName === 'TABLE' && (!next || next.classList.contains('ft-footnotes'))) {
          const p = document.createElement('p');
          p.appendChild(document.createElement('br'));
          obj.after(p);
        }
        changed();
      }
      selectObject(obj);
      dragging = false;
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  window.addEventListener('resize', placeFrame);

  // Lignes qui peuvent être coupées en deux au curseur pour y poser un objet.
  const SPLITTABLE = 'p, h1, h2, h3, h4, h5, h6, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math):not([contenteditable="false"])';
  const isBlank = (r) => r.toString().replace(/[\s\u200b]/g, '') === '' && !r.cloneContents().querySelector('img, .ft-image, .ft-math, sup.ft-fn-ref');

  // Pose un bloc (tableau, image, schéma, formule centrée…) à l'endroit du curseur : à la place d'une
  // ligne vide, avant ou après la ligne, ou entre ses deux moitiés quand le curseur est au milieu.
  // Dans une liste, un tableau ou un encadré : avant lui si le curseur est à son tout début, sinon après.
  function placeBlockAt(el, range) {
    let top = range && editor.contains(range.startContainer) ? topBlock(range.startContainer) : null;
    if (top && (top.nodeType !== Node.ELEMENT_NODE || top.classList.contains('ft-footnotes'))) top = null;
    if (!top) {
      const notes = editor.querySelector('.ft-footnotes');
      if (notes) notes.before(el);
      else editor.appendChild(el);
      return;
    }
    const before = document.createRange();
    before.setStart(top, 0);
    before.setEnd(range.startContainer, range.startOffset);
    if (!top.matches(SPLITTABLE) || top.matches(OBJECTS)) {
      if (isBlank(before)) top.before(el);
      else top.after(el);
      return;
    }
    const after = document.createRange();
    after.setStart(range.startContainer, range.startOffset);
    after.setEnd(top, top.childNodes.length);
    if (isBlank(before) && isBlank(after)) top.replaceWith(el);
    else if (isBlank(before)) top.before(el);
    else if (isBlank(after)) top.after(el);
    else {
      // La fin de la ligne passe dans une nouvelle ligne du même type, après l'objet.
      const rest = top.cloneNode(false);
      rest.removeAttribute('id');
      delete rest.dataset.bm;
      delete rest.dataset.lettrine;
      rest.appendChild(after.extractContents());
      top.after(el, rest);
    }
  }

  // Insère un bloc à l'endroit du curseur ; le curseur passe à la ligne qui le suit.
  function insertBlockObject(el) {
    const sel = window.getSelection();
    placeBlockAt(el, sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0) : null);
    const next = el.nextElementSibling;
    if (!next || next.matches(OBJECTS) || next.classList.contains('ft-footnotes')) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      el.after(p);
    }
    placeCaret(el.nextElementSibling);
  }

  window.FTStructure = {
    upgradeTables,
    // Pour les raccourcis clavier (shortcuts.js).
    command(name) {
      const sel = window.getSelection();
      if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) lastRange = sel.getRangeAt(0).cloneRange();
      if (/^(p|h[1-5]|title)$/.test(name)) setBlock(name);
      else if (name === 'ul') toggleList(false);
      else if (name === 'ol') toggleList(true);
      else if (name === 'check') toggleCheck();
      else if (name === 'callout') toggleCallout();
    },
    // Nouveau document ouvert.
    reset() {
      deselect();
      hoverObj = null;
      handle.hidden = true;
    },
    setStyles(saved) {
      styles = merge(saved);
      applyStyles();
    },
    getStyles: () => clone(styles),
    mergeStyles: merge,
    headingPresets: () => clone(PRESETS),
    // Pour le thème du document (theme.js) et la fenêtre « Styles du document » (docstyles.js).
    tablePresets: () => TABLE_PRESETS.map(([name, p]) => [name, presetLook(p)]),
    tableThumb: (look) => thumb({ ...DEFAULT_TABLE, ...look }),
    tableParts: () => ({ themes: TABLE_THEMES.slice(), colors: TABLE_COLORS.slice(), options: TABLE_OPTIONS.slice(), pads: TABLE_PADS.slice() }),
    tableLook: (table) => lookOf(table),
    setTableLook(table, look) { applyLook(table, { ...lookOf(table), ...look }); },
    newTableLook: () => ({ ...newLook }),
    setNewTableLook(look) { newLook = { ...DEFAULT_TABLE, ...look }; },
    restyleTables(look) {
      for (const table of editor.querySelectorAll('table.ft-table')) applyLook(table, { ...lookOf(table), ...look, width: lookOf(table).width });
    },
    calloutLooks: () => CALLOUT_LOOKS.slice(),
    calloutColors: () => CALLOUT_COLORS.slice(),
    calloutPresets: () => CALLOUT_PRESETS.map(([id, name, value]) => ({ id, name, value: { ...value } })),
    calloutLook: (box) => ({ look: box.dataset.look || '', color: box.dataset.color || '' }),
    styleCallout,
    setNewCallout(look) { newCallout = { look: look.look || '', color: look.color || '' }; },
    newCalloutLook: () => ({ ...newCallout }),
    newQuoteLook: () => ({ ...newQuote }),
    restyleCallouts(look) { editor.querySelectorAll('blockquote.ft-callout:not(.ft-quote):not(.ft-bio)').forEach((box) => styleCallout(box, look)); },
    quoteLooks: () => QUOTE_LOOKS.slice(),
    quotePresets: () => QUOTE_PRESETS.map(([id, name, value]) => ({ id, name, value: { ...value } })),
    quoteLook: (box) => ({ look: box.dataset.qlook || '', color: box.dataset.color || '' }),
    styleQuote,
    setNewQuote(look) { newQuote = { look: look.look || '', color: look.color || '' }; },
    restyleQuotes(look) { editor.querySelectorAll('blockquote.ft-quote').forEach((box) => styleQuote(box, look)); },
    toggleQuote,
    // Titres et tirets : réglages (fenêtre), styles prêts, style propre à un élément.
    headingEditor,
    bulletEditor,
    bulletPresets: () => clone(BULLET_PRESETS),
    ownHeading,
    clearHeading,
    headingOwnStyle,
    ownList,
    clearList,
    listOwnStyle,
    // Numérotation des listes : réglages, styles prêts, numérotation propre à une liste.
    numberEditor,
    numberPresets: () => clone(NUMBER_PRESETS),
    numberPreview,
    numLabel,
    numText,
    numChoices: () => NUM_CHOICES.slice(),
    ownNumbers,
    clearNumbers,
    numbersOf,
    themeNumbers: () => styles.numbers.slice(),
    inlineHeading,
    // Numéros automatiques des titres (plan du document, export Word).
    headingNumbers,
    // Étage de titre numéroté (1 à 5) ?
    numbered: (level) => !!(styles.headings[level - 1] && styles.headings[level - 1].number),
    // Bordures des tableaux (menu du moteur 2.0) : traits possibles, traits de chaque style, épaisseurs.
    TABLE_BORDERS: { sides: BORDER_SIDES, outer: OUTER, byStyle: STYLE_BORDERS, widths: BORDER_WIDTHS },
    RULE_STYLES,
    openStyles,
    toggleCallout,
    toggleBullets() { toggleList(false); },
    // Pour les autres outils d'insertion (insert.js).
    insertFootnote: menuFootnote,
    insertItems,
    clearFormat: () => clearFormatAny(),
    useEngine(mount, bridge) {
      editor = mount;
      engine = bridge;
      mount.addEventListener('keydown', clearKey);
    },
    insertBlockObject,
    placeBlockAt,
    restoreSelection: restore,
    checkpoint,
    changed,
    placeCaret,
    selectObject,
    deselect,
    placeFrame,
    removeObject,
    startBlockDrag,
    objectOf,
    isZone,
    topBlock,
    pageRect,
    selected: () => selectedObj,
    onObjectChange(fn) { onObjectChange = fn; }
  };
})();
