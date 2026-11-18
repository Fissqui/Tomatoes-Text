// Thème du document (bouton à côté de « Réglages des pages », Affichage > « Thème du document… »).
// Trois niveaux :
// 1. les styles de chaque type d'élément (titres, tirets, tableaux, encadrés, plan, schémas) :
//    fenêtre « Styles du document » (docstyles.js) ;
// 2. le thème du document, ici : un ensemble de styles accordés entre eux pour tout le document
//    (police du texte, styles de chaque élément, marges, couleur du document). Chaque
//    document garde le sien (doc.settings.theme) ; on peut l'enregistrer dans « Mes thèmes », l'exporter
//    en fichier .tttheme pour le partager, et en importer ;
// 3. le thème du logiciel (customize.js), qui ne touche pas aux documents.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.frameText;
  const S = () => window.FTStructure;
  const dialog = $('theme-dialog');
  const panel = $('theme-panel');
  const styleTag = document.createElement('style');
  document.head.appendChild(styleTag);

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  };
  const hexColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');
  const num = (v, min, max, def) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(max, Math.max(min, Number(v))) : def);
  const cssFont = (f) => `"${String(f).replace(/["\\\n]/g, '')}", Georgia, serif`;

  // ----- Contenu d'un thème -----

  const BASE_TEXT = { font: 'Georgia', size: 12, line: 1.6, space: 0.6, align: '' };
  const TEXT_SIZES = [10, 10.5, 11, 11.5, 12, 13, 14, 16];
  const LINES = [[1.15, 'Serré (1,15)'], [1.3, '1,3'], [1.45, '1,45'], [1.6, 'Normal (1,6)'], [1.8, 'Aéré (1,8)'], [2, 'Double (2)']];
  const SPACES = [[0, 'Aucun'], [0.3, 'Petit (0,3)'], [0.6, 'Normal (0,6)'], [1, 'Grand (1)']];
  const MARGINS = [
    ['', 'Garder celles du document', null],
    ['normales', 'Normales (2,5 cm)', { top: 25, bottom: 25, left: 25, right: 25 }],
    ['etroites', 'Étroites (1,27 cm)', { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 }],
    ['moyennes', 'Moyennes', { top: 25.4, bottom: 25.4, left: 19.1, right: 19.1 }],
    ['larges', 'Larges (5 cm sur les côtés)', { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 }]
  ];
  const TABLE_KEYS = ['header', 'first', 'total', 'last', 'bands', 'bandcols', 'sep'];

  const marginsId = (m) => (m ? (MARGINS.find(([, , v]) => v && ['top', 'bottom', 'left', 'right'].every((k) => Math.abs(v[k] - m[k]) < 0.05)) || ['perso'])[0] : '');

  // Styles des titres : un modèle de structure.js, ou des réglages donnés ici.
  function headingStyles(presetId, change) {
    const preset = S().headingPresets().find((p) => p.id === presetId) || S().headingPresets()[0];
    const styles = S().mergeStyles({ title: preset.title, headings: preset.headings });
    if (change) change(styles);
    return styles;
  }

  function make(id, name, note, o) {
    return {
      v: 1, id, name, note,
      text: { ...BASE_TEXT, ...(o.text || {}) },
      accent: o.accent || '',
      styles: o.styles,
      table: { style: 'quadrille', color: '', header: true, ...(o.table || {}) },
      callout: { look: '', color: '', ...(o.callout || {}) },
      quote: { look: '', color: 'gris', ...(o.quote || {}) },
      toc: window.FTToc.presetConfig(o.toc || 'moderne'),
      diagram: window.FTDiagram.cleanStyle((window.FTDiagram.presets().find((p) => p.id === o.diagram) || window.FTDiagram.presets()[0]).value),
      margins: o.margins || null
    };
  }

  // Thèmes prêts : chacun accorde la police, les titres, les tableaux, les encadrés et le plan.
  function builtins() {
    const H = (o) => ({ font: '', size: 12, bold: true, italic: false, underline: false, caps: false, smallcaps: false, color: '', align: '', rule: false, number: '', ...o });
    return [
      make('classique', 'Classique', 'Georgia, titres en gras, tableaux quadrillés.', {
        styles: headingStyles('classique')
      }),
      make('moderne', 'Moderne', 'Open Sans et Montserrat, bleu, tableaux à bandes.', {
        text: { font: 'Open Sans', size: 11, line: 1.55, space: 0.7 }, accent: '#2e5c8a',
        styles: headingStyles('moderne'),
        table: { style: 'grille', color: 'theme', header: true, bands: true }, callout: { look: 'trait' }, quote: { look: 'guillemets', color: '' }, toc: 'encadre', diagram: 'contour'
      }),
      make('elegant', 'Élégant', 'Garamond et Playfair, texte justifié, filets fins.', {
        text: { font: 'EB Garamond', size: 13, line: 1.55, space: 0.5, align: 'justify' }, accent: '#7a4e2d',
        styles: headingStyles('elegant', (s) => { s.bullets[0].symbol = '—'; }),
        table: { style: 'lignes', color: 'theme', header: true, total: true }, callout: { look: 'filets' }, quote: { look: 'exergue', color: '' }, toc: 'elegant', diagram: 'sobre'
      }),
      make('academique', 'Académique', 'Titres numérotés 1.1, citations en retrait, marges normales.', {
        text: { font: 'Source Serif 4', size: 12, line: 1.7, space: 0.6, align: 'justify' }, accent: '#4f5b66',
        styles: headingStyles('academique'),
        table: { style: 'lignes', color: '', header: true }, callout: { look: 'citation' }, quote: { look: 'retrait', color: '' }, toc: 'academique', diagram: 'noir',
        margins: { top: 25, bottom: 25, left: 25, right: 25 }
      }),
      make('dissertation', 'Dissertation', 'Plan en I. A. 1., Literata, texte justifié.', {
        text: { font: 'Literata', size: 12, line: 1.6, space: 0.6, align: 'justify' }, accent: '#7b2d26',
        styles: headingStyles('romain'),
        table: { style: 'quadrille', color: '', header: true }, callout: { look: '' }, quote: { look: 'epigraphe', color: 'gris' }, toc: 'classique', diagram: 'sobre'
      }),
      make('sobre', 'Sobre', 'Inter, gris doux, beaucoup d’air.', {
        text: { font: 'Inter', size: 11, line: 1.65, space: 0.8 }, accent: '#4a5560',
        styles: headingStyles('sobre'),
        table: { style: 'clair', color: 'gris', header: true }, callout: { look: 'fond' }, quote: { look: '', color: 'gris' }, toc: 'sobre', diagram: 'ombre'
      }),
      make('carnet', 'Carnet', 'Nunito, titre manuscrit, rouge tomate et vert tige.', {
        text: { font: 'Nunito', size: 11.5, line: 1.6, space: 0.6 }, accent: '#c8402c',
        styles: headingStyles('classique', (s) => {
          s.title = H({ font: 'Caveat', size: 32, color: '#c8402c' });
          s.headings = [H({ font: 'Nunito', size: 17, color: '#c8402c' }), H({ font: 'Nunito', size: 14, color: '#2f7d32' }), H({ font: 'Nunito', size: 12 }),
            H({ font: 'Nunito', size: 12, bold: false, italic: true }), H({ font: 'Nunito', size: 11, bold: false, caps: true })];
          s.bullets = s.bullets.map((b, i) => ({ symbol: ['•', '◦', '▪', '–', '–'][i], color: i === 0 ? '#c8402c' : '' }));
        }),
        table: { style: 'raye', color: 'theme', header: true, bands: true }, callout: { look: 'fond' }, quote: { look: 'fond', color: '' }, toc: 'compact', diagram: 'tomate'
      }),
      make('rapport', 'Rapport', 'Inter, bleu, titres numérotés 1. 1.1, tableaux à bandes.', {
        text: { font: 'Inter', size: 10.5, line: 1.5, space: 0.7 }, accent: '#1f4e79',
        styles: headingStyles('rapport'),
        table: { style: 'liste', color: 'bleu', header: true, bands: true, size: 10 }, callout: { look: 'fond', color: 'bleu' }, quote: { look: 'retrait', color: 'gris' }, toc: 'rapport', diagram: 'contour',
        margins: { top: 25, bottom: 25, left: 25, right: 25 }
      }),
      make('roman', 'Roman', 'Garamond justifié, titres centrés en chiffres romains.', {
        text: { font: 'EB Garamond', size: 12.5, line: 1.45, space: 0.3, align: 'justify' }, accent: '#5a4632',
        styles: headingStyles('roman', (s) => { s.bullets = s.bullets.map((b) => ({ ...b, symbol: '—' })); }),
        table: { style: 'lignes', color: '', header: true, font: 'EB Garamond' }, callout: { look: 'filets' }, quote: { look: 'epigraphe', color: '' }, toc: 'livre', diagram: 'sobre'
      }),
      make('magazine', 'Magazine', 'Playfair et Montserrat, rouge, citations mises en exergue.', {
        text: { font: 'Source Serif 4', size: 11.5, line: 1.55, space: 0.6 }, accent: '#b03a2e',
        styles: headingStyles('magazine', (s) => { s.bullets[0] = { symbol: '■', color: '#b03a2e' }; }),
        table: { style: 'colore', color: 'rouge', header: true }, callout: { look: 'bandeau' }, quote: { look: 'exergue', color: '' }, toc: 'carte', diagram: 'tomate'
      }),
      make('scolaire', 'Scolaire', 'Nunito, couleurs vives, plan en I. A. 1.', {
        text: { font: 'Nunito', size: 12, line: 1.6, space: 0.6 }, accent: '#1565c0',
        styles: headingStyles('scolaire', (s) => { s.bullets = s.bullets.map((b, i) => ({ symbol: ['➜', '•', '◦', '–', '–'][i] || '–', color: i === 0 ? '#1565c0' : '' })); }),
        table: { style: 'grille', color: 'bleu', header: true, first: true }, callout: { look: 'ombre', color: 'ambre' }, quote: { look: 'fond', color: 'violet' }, toc: 'encadre', diagram: 'colore'
      }),
      make('juridique', 'Juridique', 'Source Serif, plan I. A. 1., sobre et justifié.', {
        text: { font: 'Source Serif 4', size: 12, line: 1.5, space: 0.5, align: 'justify' }, accent: '#3d3d3d',
        styles: headingStyles('juridique', (s) => { s.bullets = s.bullets.map((b) => ({ ...b, symbol: '–' })); }),
        table: { style: 'quadrille', color: '', header: true }, callout: { look: '' , color: 'gris' }, quote: { look: 'retrait', color: '' }, toc: 'classique', diagram: 'noir',
        margins: { top: 25, bottom: 25, left: 25, right: 25 }
      }),
      make('technique', 'Technique', 'Roboto, titres 1.1 avec filet, tableaux compacts.', {
        text: { font: 'Roboto', size: 10.5, line: 1.45, space: 0.6 }, accent: '#0e7490',
        styles: headingStyles('technique'),
        table: { style: 'quadrille', color: 'turquoise', header: true, first: true, size: 10, pad: 'serre' }, callout: { look: 'trait', color: '' }, quote: { look: '', color: '' }, toc: 'rapport', diagram: 'ardoise'
      }),
      make('manuscrit', 'Manuscrit', 'Titres écrits à la main, papier crème, tons sépia.', {
        text: { font: 'Lora', size: 12, line: 1.65, space: 0.6 }, accent: '#8c5a2b',
        styles: headingStyles('manuscrit', (s) => { s.bullets = s.bullets.map((b, i) => ({ symbol: ['✓', '–', '·', '–', '·'][i], color: i === 0 ? '#8c5a2b' : '' })); }),
        table: { style: 'lignes', color: 'or', header: true, font: 'Caveat', size: 13 }, callout: { look: 'fond', color: 'ambre' }, quote: { look: 'guillemets', color: '' }, toc: 'elegant', diagram: 'manuscrit'
      }),
      make('contraste', 'Contraste', 'Montserrat en capitales, noir et jaune, très lisible.', {
        text: { font: 'Atkinson Hyperlegible', size: 12, line: 1.6, space: 0.7 }, accent: '#111111',
        styles: headingStyles('contraste'),
        table: { style: 'sombre', color: 'gris', header: true }, callout: { look: 'bandeau', color: 'ambre' }, quote: { look: 'exergue', color: '' }, toc: 'minimal', diagram: 'contraste'
      }),
      make('carmin', 'Carmin', 'Archivo et Source Serif, rouge carmin, filets éditoriaux.', {
        text: { font: 'Source Serif 4', size: 10.5, line: 1.45, space: 0, align: 'justify' }, accent: '#af1d26',
        styles: headingStyles('carmin', (s) => { s.bullets = s.bullets.map((b, i) => ({ symbol: ['—', '–', '·', '–', '·'][i], color: i === 0 ? '#af1d26' : '' })); }),
        table: { style: 'edition', color: 'theme', header: true, font: 'Archivo', size: 9.5 },
        callout: { look: 'bande', color: '' }, quote: { look: 'detachee', color: '' }, toc: 'carmin', diagram: 'carmin',
        margins: { top: 22, bottom: 20, left: 22, right: 17 }
      })
    ];
  }
  let BUILTIN = null;
  const builtin = () => BUILTIN || (BUILTIN = builtins());

  // Thème lu dans un document ou un fichier : chaque valeur est vérifiée, les manques complétés.
  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    const text = t.text || {};
    const table = t.table || {};
    const callout = t.callout || {};
    const looks = S().calloutLooks().map(([v]) => v);
    const colors = S().calloutColors().map(([v]) => v);
    const parts = S().tableParts();
    const quote = t.quote || {};
    const qlooks = S().quoteLooks().map(([v]) => v);
    const m = t.margins;
    return {
      v: 1,
      id: typeof t.id === 'string' ? t.id.slice(0, 40) : 'perso',
      name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 60) : 'Thème',
      note: typeof t.note === 'string' ? t.note.slice(0, 160) : '',
      modified: !!t.modified,
      text: {
        font: typeof text.font === 'string' && text.font.trim() ? text.font.trim().slice(0, 120) : BASE_TEXT.font,
        size: num(text.size, 6, 40, BASE_TEXT.size),
        line: num(text.line, 1, 3, BASE_TEXT.line),
        space: num(text.space, 0, 3, BASE_TEXT.space),
        // Pas d'alinéa dans un thème : le retrait de première ligne reste un réglage du texte lui-même.
        align: text.align === 'justify' ? 'justify' : ''
      },
      accent: hexColor(t.accent),
      styles: S().mergeStyles(t.styles),
      table: {
        style: parts.themes.some(([v]) => v === table.style) ? table.style : 'quadrille',
        color: parts.colors.some(([v]) => v === table.color) ? table.color : '',
        ...Object.fromEntries(TABLE_KEYS.map((k) => [k, !!table[k]])),
        font: typeof table.font === 'string' ? table.font.slice(0, 120) : '',
        size: num(table.size, 0, 40, 0),
        pad: parts.pads.some(([v]) => v === table.pad) ? table.pad : ''
      },
      callout: { look: looks.includes(callout.look) ? callout.look : '', color: colors.includes(callout.color) ? callout.color : '' },
      quote: { look: qlooks.includes(quote.look) ? quote.look : '', color: colors.includes(quote.color) ? quote.color : (t.quote ? '' : 'gris') },
      // Plan : réglages complets (les thèmes d'avant 1.1.10 gardaient le nom d'un style prêt).
      toc: typeof t.toc === 'string' ? window.FTToc.presetConfig(t.toc) : window.FTToc.clean(t.toc),
      diagram: window.FTDiagram.cleanStyle(t.diagram),
      // Blocs de code : moteur/code.js, chargé après ce fichier, nettoie le réglage à la lecture.
      code: window.FTCode ? window.FTCode.cleanStyle(t.code) : (t.code && typeof t.code === 'object' ? { ...t.code } : null),
      margins: m && typeof m === 'object' ? Object.fromEntries(['top', 'bottom', 'left', 'right'].map((k) => [k, num(m[k], 0, 120, 25)])) : null
    };
  }

  // ----- Réglages du logiciel : Mes thèmes, thème des nouveaux documents -----

  let mine = [];          // thèmes enregistrés par l'utilisateur
  let forNew = null;      // thème des nouveaux documents
  let legacy = null;      // apparence des documents d'avant les thèmes (styles des titres communs)
  let saveSettings = () => {};
  let onChange = () => {};
  let current = null;     // thème du document ouvert
  let tab = 'choisir';
  let restyle = true;

  function persist() {
    saveSettings({ docThemes: clone(mine), defaultDocTheme: clone(forNew), legacyDocTheme: clone(legacy) });
  }

  // ----- Appliquer un thème à l'écran -----

  function css(t) {
    const x = t.text;
    const rules = [
      `#editor { font-family: ${cssFont(x.font)}; font-size: ${x.size}pt; line-height: ${x.line} }`,
      `#editor p, #editor div { margin-bottom: ${x.space}em }`
    ];
    if (x.align === 'justify') rules.push('#editor p { text-align: justify }');
    if (t.accent) {
      rules.push(`:root { --doc-accent: ${t.accent} }`);
      // Mode lune : la couleur du thème est éclaircie pour rester visible sur la page sombre.
      rules.push(`:root[data-theme="dark"]:not([data-paper]) { --doc-accent: color-mix(in srgb, ${t.accent} 55%, #ffffff) }`);
    }
    return rules.join('\n');
  }

  function loadFonts(t) {
    const fonts = new Set([t.text.font, t.styles.title.font, ...t.styles.headings.map((h) => h.font), t.table.font, t.toc.font].filter(Boolean));
    fonts.forEach((f) => window.FTEditor.loadFont(f));
  }

  let shownAlign = 'left';
  function show(t) {
    styleTag.textContent = css(t);
    shownAlign = t.text.align === 'justify' ? 'justify' : 'left';
    loadFonts(t);
    S().setStyles(t.styles);
    S().setNewTableLook(t.table);
    S().setNewCallout(t.callout);
    S().setNewQuote(t.quote);
    window.FTToc.setNewConfig(t.toc);
    window.FTDiagram.setDefault(t.diagram);
    if (window.FTCode) window.FTCode.setDefault(t.code);
  }

  // Les éléments déjà dans le texte prennent les styles du thème (ceux qui avaient leur propre
  // style aussi).
  function restyleText(t) {
    if (window.FTHistory) window.FTHistory.commit();
    window.FTStyles.applyAll(t);
    document.getElementById('editor').dispatchEvent(new Event('input'));
  }

  function choose(t) {
    // Sans « Appliquer aussi aux éléments existants », les titres et les listes du texte gardent leur
    // style actuel (posé sur chacun d'eux).
    if (!restyle) window.FTStyles.freeze();
    current = normalize(clone(t));
    current.modified = false;
    show(current);
    if (restyle) restyleText(current);
    if (current.margins) window.FTPages.setMargins(current.margins);
    onChange();
    render();
  }

  // Un réglage du thème change : le document est retouché tout de suite.
  function update(fn) {
    fn(current);
    current.modified = true;
    show(current);
    onChange();
    render();
  }

  // Les styles d'un type d'élément dans le thème (fenêtre « Styles du document »).
  const PARTS = {
    titres: [(t) => ({ title: t.styles.title, headings: t.styles.headings }), (t, v) => { t.styles = S().mergeStyles({ ...t.styles, title: v.title, headings: v.headings }); }],
    tirets: [(t) => t.styles.bullets, (t, v) => { t.styles = S().mergeStyles({ ...t.styles, bullets: v }); }],
    numeros: [(t) => S().mergeStyles(t.styles).numbers, (t, v) => { t.styles = S().mergeStyles({ ...t.styles, numbers: v }); }],
    tableaux: [(t) => t.table, (t, v) => { const { width, rows, cols, ...look } = v; t.table = look; }],
    encadres: [(t) => t.callout, (t, v) => { t.callout = { look: v.look || '', color: v.color || '' }; }],
    citations: [(t) => t.quote, (t, v) => { t.quote = { look: v.look || '', color: v.color || '' }; }],
    plan: [(t) => t.toc, (t, v) => { t.toc = window.FTToc.clean(v); }],
    schemas: [(t) => t.diagram, (t, v) => { t.diagram = window.FTDiagram.cleanStyle(v); }],
    code: [(t) => window.FTCode.cleanStyle(t.code), (t, v) => { t.code = window.FTCode.cleanStyle(v); }]
  };

  // ----- Fenêtre -----

  const fontNames = () => [...document.querySelectorAll('#font-family optgroup')]
    .filter((g) => g.label !== 'Polices Office')
    .map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);

  // Aperçu d'un thème : une petite page avec titre, titre 1, texte, encadré et tableau.
  function preview(t, big) {
    const k = big ? 0.85 : 0.42;
    const page = el('div', { className: 'th-page' + (big ? ' big' : '') });
    page.style.fontFamily = cssFont(t.text.font);
    page.style.lineHeight = t.text.line;
    page.style.setProperty('--doc-accent', t.accent || 'var(--accent)');
    const head = (h, text, size) => {
      const d = el('div', { className: 'th-head', textContent: text });
      Object.assign(d.style, {
        fontFamily: h.font ? cssFont(h.font) : '',
        fontSize: (size || h.size) * k * 1.333 + 'px',
        fontWeight: h.bold ? 700 : 400,
        fontStyle: h.italic ? 'italic' : 'normal',
        fontVariantCaps: h.smallcaps ? 'small-caps' : 'normal',
        textTransform: h.caps ? 'uppercase' : 'none',
        textDecoration: h.underline ? 'underline' : 'none',
        color: h.color || '',
        textAlign: h.align || 'left',
        borderBottom: h.rule ? '1px solid currentColor' : ''
      });
      return d;
    };
    const h1 = t.styles.headings[0];
    const num = h1.number ? (h1.number === '1.1' || h1.number === '1' ? '1. ' : h1.number === 'I' ? 'I. ' : h1.number === 'A' ? 'A. ' : 'a. ') : '';
    page.append(head(t.styles.title, big ? 'Titre du document' : 'Titre'), head(h1, num + (big ? 'Premier chapitre' : 'Chapitre')));
    const para = el('p', { className: 'th-text', textContent: big
      ? 'Le texte du document s’écrit dans cette police. Les titres, les tableaux, les encadrés et le plan suivent le même thème.'
      : 'Le texte du document s’écrit dans cette police, avec ce thème.' });
    para.style.fontSize = t.text.size * k * 1.333 + 'px';
    para.style.textAlign = t.text.align || 'left';
    para.style.marginBottom = t.text.space + 'em';
    const box = el('blockquote', { className: 'ft-callout', textContent: big ? 'Un encadré pour une idée à retenir.' : 'Encadré' });
    if (t.callout.look) box.dataset.look = t.callout.look;
    if (t.callout.color) box.dataset.color = t.callout.color;
    box.style.fontSize = t.text.size * k * 1.333 + 'px';
    const table = S().tableThumb(t.table);
    page.append(para, el('div', { className: 'th-row' }, [box, table]));
    return el('div', { className: 'th-preview' }, [page]);
  }

  function card(t, { own } = {}) {
    const b = el('button', { type: 'button', className: 'theme-card th-card' + (current && current.id === t.id ? ' on' : '') }, [
      preview(t),
      el('span', { className: 'theme-name', textContent: t.name + (forNew && forNew.id === t.id ? ' ★' : '') }),
      el('span', { className: 'theme-note', textContent: t.note || (own ? 'Mon thème' : '') })
    ]);
    if (forNew && forNew.id === t.id) b.title = 'Thème des nouveaux documents';
    b.addEventListener('click', () => choose(t));
    if (own) {
      const menu = (x, y) => window.FTSidebar.showMenu(x, y, [
        { text: 'Appliquer à ce document', action: () => choose(t) },
        { text: 'Renommer…', action: () => renameMine(t) },
        { text: 'Exporter en fichier…', action: () => exportTheme(t) },
        '-',
        { text: 'Supprimer de Mes thèmes', danger: true, action: () => removeMine(t) }
      ]);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
      const more = el('span', { className: 'th-more', textContent: '⋯', title: 'Renommer, exporter, supprimer' });
      more.addEventListener('click', (e) => { e.stopPropagation(); const r = more.getBoundingClientRect(); menu(r.left, r.bottom + 2); });
      b.append(more);
    }
    return b;
  }

  function renderChoose() {
    const name = el('b', { textContent: current.name });
    const status = el('div', { className: 'th-current' }, [
      el('span', {}, ['Ce document : ', name, current.modified ? ' (modifié)' : '']),
      el('span', { className: 'spacer' }),
      button('Enregistrer dans Mes thèmes…', 'Garder ce thème, avec vos réglages, pour d’autres documents', saveMine),
      button('Exporter…', 'Enregistrer ce thème dans un fichier .tttheme, pour le partager', () => exportTheme(current)),
      button(forNew && forNew.id === current.id && !current.modified ? '★ Thème des nouveaux documents' : 'Pour les nouveaux documents', 'Les prochains documents créés commenceront avec ce thème', useForNew)
    ]);
    const check = el('input', { type: 'checkbox', checked: restyle });
    check.addEventListener('change', () => { restyle = check.checked; });
    const out = [
      status,
      el('label', { className: 'pop-check th-restyle', title: 'Sinon, seuls les prochains éléments prennent les styles du thème' }, [check, ' Appliquer aussi aux éléments existants']),
      el('div', { className: 'toc-dlg-label', textContent: 'Thèmes prêts' }),
      el('div', { className: 'theme-grid th-grid' }, builtin().map((t) => card(t)))
    ];
    out.push(el('div', { className: 'toc-dlg-label', textContent: 'Mes thèmes' }));
    out.push(mine.length
      ? el('div', { className: 'theme-grid th-grid' }, mine.map((t) => card(t, { own: true })))
      : el('p', { className: 'custom-help', textContent: 'Aucun thème enregistré. Réglez le thème de ce document, puis « Enregistrer dans Mes thèmes… », ou importez un fichier de thème.' }));
    return out;
  }

  function button(text, title, fn) {
    const b = el('button', { type: 'button', textContent: text, title });
    b.addEventListener('click', fn);
    return b;
  }

  function select(options, value, fn, title) {
    const s = el('select', { title: title || '' });
    for (const [v, label] of options) s.append(new Option(label, String(v)));
    // Valeur venue d'un thème importé ou d'un thème prêt, absente de la liste : ajoutée telle quelle.
    if (![...s.options].some((o) => o.value === String(value))) s.append(new Option(String(value).replace('.', ','), String(value)));
    s.value = String(value);
    s.addEventListener('change', () => fn(s.value));
    return s;
  }

  // Bornes d'une valeur tapée dans une liste chiffrée (number.js), les mêmes qu'à la lecture d'un thème.
  const limits = (s, min, max) => { Object.assign(s.dataset, { min, max }); return s; };
  const row = (label, ...controls) => el('label', { className: 'custom-field th-field' }, [el('span', { textContent: label }), ...controls]);

  function renderSettings() {
    const t = current;
    // Texte
    const font = el('select', { title: 'Police du texte' });
    for (const [label, names] of fontNames()) {
      const g = el('optgroup', { label });
      names.forEach((n) => { const o = new Option(n, n); o.style.fontFamily = `"${n}"`; g.append(o); });
      font.append(g);
    }
    if (![...font.options].some((o) => o.value === t.text.font)) font.prepend(new Option(t.text.font, t.text.font));
    font.value = t.text.font;
    font.addEventListener('change', () => update((c) => { c.text.font = font.value; }));
    const sizes = TEXT_SIZES.includes(t.text.size) ? TEXT_SIZES : [...TEXT_SIZES, t.text.size].sort((a, b) => a - b);
    const accentInput = el('input', { type: 'color', value: t.accent || '#8a5a2b', title: 'Couleur du document' });
    accentInput.addEventListener('change', () => update((c) => { c.accent = accentInput.value; }));
    const accentAuto = el('label', { className: 'pop-check' }, [el('input', { type: 'checkbox', checked: !t.accent }), ' Celle du logiciel']);
    accentAuto.firstChild.addEventListener('change', (e) => update((c) => { c.accent = e.target.checked ? '' : accentInput.value; }));

    const left = el('div', { className: 'th-form' }, [
      el('div', { className: 'toc-dlg-label', textContent: 'Texte' }),
      row('Police', font),
      row('Taille', limits(select(sizes.map((n) => [n, String(n).replace('.', ',') + ' pt']), t.text.size, (v) => update((c) => { c.text.size = Number(v); })), 6, 40)),
      row('Interligne', limits(select(LINES, t.text.line, (v) => update((c) => { c.text.line = Number(v); })), 1, 3)),
      row('Espace entre les paragraphes', limits(select(SPACES, t.text.space, (v) => update((c) => { c.text.space = Number(v); })), 0, 3)),
      row('Alignement du texte', select([['', 'À gauche'], ['justify', 'Justifié']], t.text.align, (v) => update((c) => { c.text.align = v; }))),
      row('Couleur du document', accentInput, accentAuto),
      el('div', { className: 'toc-dlg-label', textContent: 'Styles des éléments' }),
      el('div', { className: 'th-kinds' }, window.FTStyles.kinds().map(([id, label]) =>
        button(label, `Styles des ${label.toLowerCase()} de ce document`, () => window.FTStyles.open(id, null, 'doc')))),
      el('div', { className: 'toc-dlg-label', textContent: 'Marges' }),
      row('Marges des pages', select([...MARGINS.map(([v, l]) => [v, l]), ...(marginsId(t.margins) === 'perso' ? [['perso', 'Personnalisées']] : [])], marginsId(t.margins), (v) => {
        const m = (MARGINS.find(([k]) => k === v) || [])[2];
        update((c) => { c.margins = m ? { ...m } : null; });
        if (m) window.FTPages.setMargins(m);
      }))
    ]);
    const right = el('div', { className: 'th-side' }, [
      el('div', { className: 'toc-dlg-label', textContent: 'Aperçu' }),
      preview(t, true),
      el('p', { className: 'custom-help', textContent: 'Les réglages s’appliquent immédiatement au document. Clic droit sur un élément, puis « Style… », pour lui donner un style particulier.' })
    ]);
    return [el('div', { className: 'th-settings' }, [left, right])];
  }

  function render() {
    if (!dialog.open || !current) return;
    dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const scroll = panel.scrollTop;
    panel.replaceChildren(...(tab === 'choisir' ? renderChoose() : renderSettings()));
    panel.scrollTop = scroll;
  }

  // ----- Mes thèmes, fichiers -----

  const ask = (...a) => window.FTApp.ask(...a);
  const plain = (t) => {
    const out = clone(t);
    delete out.modified;
    return out;
  };

  async function saveMine() {
    const name = await ask('Nom du thème :', current.modified || !mine.some((x) => x.id === current.id) ? current.name + (current.modified ? ' (perso)' : '') : current.name, { okLabel: 'Enregistrer', maxLength: 60 });
    if (!name) return;
    const existing = mine.find((x) => x.name === name);
    const t = { ...plain(current), id: existing ? existing.id : 'u' + Math.random().toString(36).slice(2, 9), name, note: current.note && !current.modified ? current.note : '' };
    if (existing) mine[mine.indexOf(existing)] = t; else mine.push(t);
    current = { ...clone(t), modified: false };
    persist();
    onChange();
    render();
  }

  async function renameMine(t) {
    const name = await ask('Nouveau nom du thème :', t.name, { okLabel: 'Renommer', maxLength: 60 });
    if (!name) return;
    t.name = name;
    if (current && current.id === t.id) { current.name = name; onChange(); }
    if (forNew && forNew.id === t.id) forNew.name = name;
    persist();
    render();
  }

  async function removeMine(t) {
    const ok = await ask(`Supprimer le thème « ${t.name} » de Mes thèmes ? Les documents qui l'utilisent le gardent.`, '', { okLabel: 'Supprimer', input: false });
    if (!ok) return;
    mine = mine.filter((x) => x !== t);
    persist();
    render();
  }

  async function exportTheme(t) {
    const path = await api.exportTheme(t.name, plain(t));
    if (path) await ask(`Thème exporté dans le fichier :\n${path}`, '', { okLabel: 'OK', input: false });
  }

  async function importTheme() {
    const data = await api.importTheme();
    if (!data) return;
    if (data.error) return ask(data.error, '', { okLabel: 'OK', input: false });
    const t = normalize(data);
    delete t.modified;
    if (builtin().some((b) => b.id === t.id) || mine.some((m) => m.id === t.id)) t.id = 'u' + Math.random().toString(36).slice(2, 9);
    while (mine.some((m) => m.name === t.name)) t.name += ' (importé)';
    mine.push(t);
    persist();
    tab = 'choisir';
    render();
    ask(`Le thème « ${t.name} » est dans Mes thèmes. Cliquez dessus pour l'appliquer à ce document.`, '', { okLabel: 'OK', input: false });
  }

  function useForNew() {
    forNew = { ...plain(current) };
    if (current.modified) forNew.name = current.name;
    persist();
    render();
  }

  dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  $('theme-close').addEventListener('click', () => dialog.close());
  $('theme-import').addEventListener('click', importTheme);
  $('doc-theme-tab').addEventListener('click', () => open());

  function open(which) {
    if (!current || $('page').hidden) return;
    if (which) tab = which;
    if (!dialog.open) dialog.showModal();
    render();
  }

  window.FTTheme = {
    // Alignement des paragraphes donné par le thème du document affiché (editor.js, alignement).
    textAlign: () => shownAlign,
    // saved : { docThemes, defaultDocTheme, legacyDocTheme, textStyles } des réglages du logiciel.
    init(saved, save) {
      saveSettings = save;
      mine = (Array.isArray(saved.docThemes) ? saved.docThemes : []).map(normalize).filter(Boolean).map((t) => { delete t.modified; return t; });
      legacy = normalize(saved.legacyDocTheme);
      forNew = normalize(saved.defaultDocTheme);
      // Première ouverture avec les thèmes : les documents existants gardent les styles des titres
      // qui étaient communs à tous les documents.
      if (!legacy) {
        legacy = normalize(builtin()[0]);
        if (saved.textStyles) {
          legacy.styles = S().mergeStyles(saved.textStyles);
          if (JSON.stringify(legacy.styles) !== JSON.stringify(builtin()[0].styles)) {
            legacy.id = 'u-titres';
            legacy.name = 'Mes styles';
            legacy.note = 'Vos styles de titres d’avant les thèmes.';
          }
        }
        delete legacy.modified;
        if (legacy.id !== 'classique') mine.push(clone(legacy));
      }
      if (!forNew) forNew = clone(legacy);
      delete forNew.modified;
      persist();
    },
    onChange(fn) { onChange = fn; },
    // Document ouvert : son thème, ou l'apparence d'avant les thèmes.
    load(settings) {
      current = normalize(settings && settings.theme) || clone(legacy);
      show(current);
      render();
    },
    get: () => (current ? clone(current) : null),
    // Styles d'un type d'élément (docstyles.js) : lire, et changer pour tout le document.
    part: (kind) => (current ? clone(PARTS[kind][0](current)) : null),
    setPart(kind, value) {
      if (!current) return;
      PARTS[kind][1](current, clone(value));
      current.modified = true;
      show(current);
      onChange();
      render();
    },
    // Thème d'un nouveau document.
    forNewDoc: () => plain(forNew),
    // Modèles de mise en page (modeles.js) : thèmes prêts et Mes thèmes, thème lu dans un fichier,
    // thème posé sur le document (éléments existants compris).
    builtins: () => builtin().map(clone),
    mine: () => mine.map(clone),
    normalize: (t) => { const x = normalize(t); if (x) delete x.modified; return x; },
    apply(t) {
      if (!current || !t) return;
      const keep = restyle;
      restyle = true;
      try { choose(t); } finally { restyle = keep; }
    },
    open
  };
})();
