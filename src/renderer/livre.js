// Export livre : un PDF prêt pour l'imprimeur, au format d'un livre. Fenêtre « Exporter en livre » :
// format (poche, 13 × 20, A5…), marges intérieure et extérieure (pages en miroir), coupure des mots et
// justification équilibrée (composition.js), chapitres ouverts sur une page de droite, titres courants
// (titre du livre à gauche, du chapitre à droite), folios en pied de page côté extérieur, puis fichier :
// pages à la suite, pages avec traits de coupe, ou livret à plier (deux pages par face, dans l'ordre
// d'un cahier). La page est préparée ici ; main.js (livre.js) la met en pages et fait le PDF.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialog = $('livre-dialog');

  // Formats : largeur, hauteur ; marges intérieure, extérieure, haut, bas (mm).
  const FORMATS = [
    { id: 'document', label: 'Format du document' },
    { id: 'poche', label: 'Poche (11 × 17,8 cm)', w: 110, h: 178, m: [15, 11, 13, 16] },
    { id: '13x20', label: 'Roman (13 × 20 cm)', w: 130, h: 200, m: [17, 13, 15, 18] },
    { id: 'a5', label: 'A5 (14,8 × 21 cm)', w: 148, h: 210, m: [19, 14, 16, 19] },
    { id: '15x23', label: 'Essai (15 × 23 cm)', w: 150, h: 230, m: [20, 15, 17, 21] },
    { id: '155x24', label: 'Grand format (15,5 × 24 cm)', w: 155, h: 240, m: [21, 16, 18, 22] },
    { id: '17x24', label: 'Beau livre (17 × 24 cm)', w: 170, h: 240, m: [22, 17, 18, 22] },
    { id: 'a4', label: 'A4 (21 × 29,7 cm)', w: 210, h: 297, m: [25, 20, 22, 25] }
  ];
  const DEFAULTS = { format: '13x20', margins: null, cesure: true, justif: true, justifyText: true, recto: true, heads: true, output: 'pages' };

  let settings = { ...DEFAULTS };
  let save = () => {};

  const formatOf = (id) => FORMATS.find((f) => f.id === id) || FORMATS[2];
  // Format du document : taille et marges des réglages des pages (gauche = intérieur).
  function docFormat() {
    const info = window.FTPages.exportInfo();
    info.cleanup();
    const [w, h] = info.size('portrait');
    const m = info.cfg.margins;
    return { w, h, m: [m.left, m.right, m.top, m.bottom] };
  }
  const sizeOf = (id) => (id === 'document' ? docFormat() : formatOf(id));

  // ----- Fenêtre -----

  const sel = $('lv-format');
  sel.innerHTML = FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
  const M = ['inner', 'outer', 'top', 'bottom'];
  const field = (k) => $('lv-m-' + k);
  const num = (el, d) => { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? Math.min(80, Math.max(3, v)) : d; };
  function showMargins(m) { M.forEach((k, i) => { field(k).value = m[i]; }); }
  function showHelp() {
    const out = dialog.querySelector('input[name="lv-sortie"]:checked').value;
    const f = sizeOf(sel.value);
    $('lv-size').textContent = `${String(f.w).replace('.', ',')} × ${String(f.h).replace('.', ',')} mm`;
    $('lv-help').textContent = {
      pages: 'Une page du livre par page du PDF.',
      coupe: 'Chaque page sur une feuille plus grande, avec traits de coupe : à remettre à l’imprimeur.',
      livret: 'Deux pages par face de feuille, dans l’ordre d’un cahier : imprimer en recto verso (bord court), plier, agrafer au pli.'
    }[out];
  }
  sel.addEventListener('change', () => { showMargins(sizeOf(sel.value).m); showHelp(); });
  dialog.querySelectorAll('input[name="lv-sortie"]').forEach((r) => r.addEventListener('change', showHelp));

  function open() {
    sel.value = FORMATS.some((f) => f.id === settings.format) ? settings.format : DEFAULTS.format;
    showMargins(settings.margins && settings.margins.length === 4 && settings.format === sel.value ? settings.margins : sizeOf(sel.value).m);
    $('lv-cesure').checked = settings.cesure !== false;
    $('lv-justif').checked = settings.justif !== false;
    $('lv-justify-text').checked = settings.justifyText !== false;
    $('lv-recto').checked = settings.recto !== false;
    $('lv-tetes').checked = settings.heads !== false;
    const out = dialog.querySelector(`input[name="lv-sortie"][value="${settings.output}"]`) || dialog.querySelector('input[name="lv-sortie"]');
    out.checked = true;
    showHelp();
    dialog.showModal();
  }
  $('lv-cancel').addEventListener('click', () => dialog.close());
  $('lv-ok').addEventListener('click', () => {
    const f = sizeOf(sel.value);
    settings = {
      format: sel.value,
      margins: M.map((k, i) => num(field(k), f.m[i])),
      cesure: $('lv-cesure').checked,
      justif: $('lv-justif').checked,
      justifyText: $('lv-justify-text').checked,
      recto: $('lv-recto').checked,
      heads: $('lv-tetes').checked,
      output: dialog.querySelector('input[name="lv-sortie"]:checked').value
    };
    save(settings);
    dialog.close();
    if (onExport) onExport(settings);
  });
  let onExport = null;

  // ----- Page à imprimer -----

  // Chaîne CSS (content: "…").
  const cssString = (s) => '"' + String(s).replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const short = (s, n = 70) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

  // Mots de l'index : chaque occurrence entourée d'un repère, et la ligne de l'index sait lesquels sont à elle.
  function indexAnchors(box) {
    const rows = box.querySelectorAll('.ft-index-entry[data-term]');
    if (!rows.length || !window.FTIndex || !window.FTIndex.occurrencesIn) return;
    const found = window.FTIndex.occurrencesIn(box);
    const byTerm = new Map();
    let n = 0;
    // (Du dernier au premier : les plages encore à entourer restent justes.)
    const all = [];
    for (const [entry, ranges] of found) for (const r of ranges) all.push({ entry, r });
    all.sort((a, b) => b.r.compareBoundaryPoints(Range.START_TO_START, a.r));
    for (const { entry, r } of all) {
      const span = document.createElement('span');
      span.className = 'lv-ix';
      span.id = 'lvi' + ++n;
      try { r.surroundContents(span); } catch { continue; }
      const list = byTerm.get(entry.term) || [];
      list.push(span.id);
      byTerm.set(entry.term, list);
    }
    rows.forEach((row) => { const ids = byTerm.get(row.dataset.term); if (ids) row.dataset.lv = ids.join(' '); });
  }

  // Police du texte courant (folios, titres courants).
  function textFont() {
    const p = document.querySelector('#editor p:not(.ft-legend)') || document.getElementById('editor');
    return getComputedStyle(p).fontFamily || 'Georgia, serif';
  }

  async function build(o) {
    const f = sizeOf(o.format);
    const [inner, outer, top, bottom] = o.margins;
    const P = window.FTPdf;
    const { box, cls } = P.content({ keepPages: true });
    if (o.cesure) await P.markLanguages(box);
    indexAnchors(box);
    // Chapitres : chaque titre 1 (et le titre du document) ouvre une page ; les notes de fin aussi. Les
    // notes de bas de page vont au pied de leur page (notes-pied.js).
    const notes = P.hasFootnotes(box);
    const book = short((box.querySelector('.ft-cover .ft-cover-field[data-field="titre"]') || {}).textContent || ((n) => (n && n !== 'Sans titre' ? n : ''))(window.FTApp && window.FTApp.docName()) || (box.querySelector('h1') || {}).textContent || '');
    const chapters = [];
    let k = 0;
    for (const el of [...box.children]) {
      if (el.matches('h1') || (el.matches('.ft-endnotes') && el.textContent.trim())) {
        k++;
        el.classList.add('lv-chap');
        if (el.matches('h1')) chapters.push(short(el.textContent));
        else {
          // Notes (en fin de livre) : un titre en tête.
          const name = 'Notes';
          const t = document.createElement('div');
          t.className = 'lv-notes-titre';
          t.textContent = name;
          el.prepend(t);
          chapters.push(name);
        }
      }
      if (!el.matches('.ft-cover')) el.classList.add('lv-c' + k);
    }
    if (box.firstElementChild) box.firstElementChild.classList.add('lv-premier');
    const font = textFont();
    const W = f.w;
    const H = f.h;
    const folio = `font-family: ${font}; font-size: 9.5pt; color: #333;`;
    const css = P.PRINT_CSS + `
  @page { size: ${W}mm ${H}mm; margin: ${top}mm ${outer}mm ${bottom}mm ${inner}mm; }
  @page :right { margin-left: ${inner}mm; margin-right: ${outer}mm; @bottom-right { content: counter(page); ${folio} vertical-align: middle; } }
  @page :left { margin-left: ${outer}mm; margin-right: ${inner}mm; @bottom-left { content: counter(page); ${folio} vertical-align: middle; } }
  @page lvblanc { @bottom-left { content: none; } @bottom-right { content: none; } @top-center { content: none; } }
  .ft-print { width: ${(W - inner - outer).toFixed(2)}mm; }
  #editor .ft-cover { page: lvblanc; aspect-ratio: auto !important; height: ${(H - top - bottom - 1).toFixed(1)}mm !important; margin: 0 !important; break-after: page; }
  #editor .lv-blanc { page: lvblanc; break-before: page; break-after: page; height: 1px; }
  #editor .lv-chap { break-before: page; }
  #editor .lv-chap.lv-premier { break-before: auto; }
  #editor h1.lv-chap, #editor .lv-notes-titre { padding-top: ${Math.round(H / 12)}mm; }
  #editor .lv-notes-titre { font-family: ${font}; font-size: 1.6em; font-weight: bold; margin: 0 0 1em; }
${chapters.map((_t, i) => `  #editor > .lv-c${i + 1} { page: lvc${i + 1}; }`).join('\n')}
${o.justifyText ? '  #editor :is(p, li):not([style*="text-align"]):not(.ft-legend, .ft-quote-src, .ft-caption):not(:is(td, th, .ft-callout, .ft-toc, .ft-lof, .ft-index, .ft-cover) *) { text-align: justify; }\n' : ''}`;
    // Titres courants : à part, pour les retirer des pages d'ouverture.
    const head = `font-family: ${font}; font-size: 8.5pt; color: #444; vertical-align: bottom; padding-bottom: ${Math.min(6, Math.max(2, top / 3)).toFixed(1)}mm;`;
    const heads = o.heads ? `<style id="lv-tetes">
  @page :left { @top-center { content: ${cssString(book)}; ${head} font-variant: small-caps; letter-spacing: 0.04em; } }
  @page :right { @top-center { content: ${cssString(book)}; ${head} font-style: italic; } }
${chapters.map((t, i) => `  @page lvc${i + 1}:right { @top-center { content: ${cssString(t)}; } }`).join('\n')}
  @page lvblanc { @top-center { content: none; } }
</style>` : '';
    const html = P.pageHtml({ box, cls, css, head: heads, scripts: (o.cesure || o.justif ? P.composeScripts() : '') + (notes ? P.NOTES_SCRIPTS : '') + '<script src="livre-page.js"></script>' });
    return {
      html,
      page: { width: W, height: H },
      compose: o.cesure || o.justif ? { lang: P.docLang(), hyphenate: o.cesure, justify: o.justif } : null,
      notes: notes ? { height: H - top - bottom } : null,
      layout: { recto: o.recto, heads: o.heads },
      output: o.output
    };
  }

  window.FTLivre = {
    // settings du logiciel : { livre } ; store(v) les enregistre.
    init(saved, store) {
      settings = { ...DEFAULTS, ...(saved || {}) };
      save = store || (() => {});
    },
    open(fn) { onExport = fn; open(); },
    build,
    FORMATS
  };
})();
