// Export PDF : le texte du document (contenu, notes) est remis en page par Chromium dans une
// fenêtre cachée, au format et aux marges du document, avec les numéros de page, l'en-tête et le pied
// de page des réglages des pages. La page elle-même est préparée ici ; main.js en fait le PDF, après la
// composition des paragraphes dans la page cachée (composition.js : coupure des mots, justification).
(function () {
  let editor = document.getElementById('editor');

  const NUMBER_TEXT = {
    page: 'Page <span class="pageNumber"></span>',
    'page-sur': 'Page <span class="pageNumber"></span> sur <span class="totalPages"></span>',
    sur: '<span class="pageNumber"></span> / <span class="totalPages"></span>',
    tirets: '- <span class="pageNumber"></span> -',
    p: 'p. <span class="pageNumber"></span>'
  };

  // Styles ajoutés par le logiciel (titres, tirets, thème…) : repris tels quels.
  const liveStyles = () => [...document.querySelectorAll('head style')].map((s) => s.textContent).join('\n');

  // En-tête ou pied de page de Chromium : un petit HTML à styles en ligne.
  function band(html, numbers, top, m) {
    const c = numbers;
    const align = c && c.on ? c.pos.split('-')[1] : null;
    const num = c && c.on && c.pos.startsWith(top ? 'haut' : 'bas')
      ? `<div style="text-align:${{ gauche: 'left', centre: 'center', droite: 'right' }[align]};${c.font ? `font-family:'${c.font}';` : ''}${c.color ? `color:${c.color};` : ''}${c.bold ? 'font-weight:700;' : ''}${c.italic ? 'font-style:italic;' : ''}">${NUMBER_TEXT[c.format] || '<span class="pageNumber"></span>'}</div>`
      : '';
    const text = html ? `<div>${html}</div>` : '';
    return `<div style="width:100%;font-size:${c && c.size ? c.size : 9}pt;font-family:Georgia,serif;color:#444;padding:0 ${m.right}mm 0 ${m.left}mm;box-sizing:border-box;">${top ? text + num : num + text}</div>`;
  }

  // Contenu du document pour l'impression : sans les numéros de page du plan (Chromium refait les pages
  // à sa façon ; keepPages : l'export livre les récrit), sans marques du moteur. cls : classes du
  // document, sans celles de l'affichage.
  function content({ keepPages = false } = {}) {
    const box = document.createElement('div');
    box.innerHTML = window.FTEditor.getHtml();
    if (!keepPages) box.querySelectorAll('.ft-toc-page, .ft-lof-page').forEach((e) => e.remove());
    box.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    // Blocs de code : leurs couleurs (refaites à l'affichage, jamais enregistrées).
    if (window.FTCode) window.FTCode.colorize(box);
    // En-tête répété : la première ligne passe dans un <thead>, que Chromium répète sur chaque page. Une
    // ligne cachée la remplace en tête du corps, pour que la deuxième ligne garde son style (bandes comprises).
    box.querySelectorAll('table.ft-table[data-header][data-repeat]').forEach((t) => {
      const body = t.tBodies[0];
      if (!body || body.rows.length < 2) return;
      t.createTHead().append(body.rows[0]);
      const pad = document.createElement('tr');
      pad.style.display = 'none';
      body.prepend(pad);
    });
    // (Sans les classes de l'affichage : moteur, double page, objet sélectionné.)
    const cls = editor.className.replace(/\b(object-selected|ProseMirror\S*|pm-\S+)/g, '').replace(/\s+/g, ' ').trim();
    return { box, cls };
  }

  // Langue de chaque paragraphe (document en plusieurs langues) : attribut lang, pour la coupure des mots.
  async function markLanguages(box) {
    const L = window.FTLang;
    if (!L || L.get().length < 2) return;
    const blocks = [...box.querySelectorAll('p, li, blockquote, td, th, dd, dt')].filter((b) => !b.closest('[lang]') && b.textContent.trim());
    try {
      const segs = await L.segment(blocks.map((block) => ({ block, text: block.textContent, fixed: null })));
      blocks.forEach((b, i) => {
        const s = segs[i];
        if (!s || !s.length) return;
        // (Langue du plus long passage du paragraphe.)
        const main = s.reduce((x, y) => (y.end - y.start > x.end - x.start ? y : x));
        if (main.lang && main.lang !== L.principal()) b.setAttribute('lang', L.TAG[main.lang] || main.lang);
      });
    } catch { /* langue principale */ }
  }

  // Scripts de la composition (coupure des mots, justification), pour les langues du document.
  const CESURE = ['fr', 'en', 'de', 'es', 'it', 'pt'];
  function composeScripts() {
    const langs = window.FTLang ? window.FTLang.get() : ['fr'];
    return CESURE.filter((c) => langs.includes(c)).map((c) => `<script src="vendor/cesure/cesure-${c}.js"></script>`).join('') +
      '<script src="cesure.js"></script><script src="composition.js"></script>';
  }
  // Scripts des notes au pied des pages (notes-pied.js), posées après la composition.
  const NOTES_SCRIPTS = '<script src="moteur/decoupage.js"></script><script src="notes-pied.js"></script>';
  const hasFootnotes = (box) => !!box.querySelector(':scope > .ft-footnotes li[data-fn]');
  const docLang = () => (window.FTLang ? window.FTLang.TAG[window.FTLang.principal()] || 'fr' : 'fr');

  // Page HTML complète : styles du logiciel et du document, puis css propre à l'export.
  function pageHtml({ box, cls, css, head = '', scripts = '' }) {
    const page = `<!doctype html><html lang="${docLang()}" data-theme="light"><head><meta charset="utf-8">
<base href="${location.href.replace(/[^/]*$/, '')}">
<link rel="stylesheet" href="fonts/fonts-impression.css"><link rel="stylesheet" href="styles.css">
<style>${liveStyles()}</style>
<style>${css}</style>${head}${scripts}</head>
<body><div class="ft-print"><div id="editor" class="${cls}"></div></div></body></html>`;
    // Le contenu entre par le DOM (pas de texte collé dans le HTML).
    const doc = new DOMParser().parseFromString(page, 'text/html');
    doc.getElementById('editor').innerHTML = box.innerHTML;
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }

  // Styles communs aux exports imprimés.
  const PRINT_CSS = `
  html, body { background: #ffffff !important; margin: 0; padding: 0; height: auto !important; min-height: 0 !important; overflow: visible !important; display: block !important; }
  body { color: #1f1f1f; }
  #editor { min-height: 0; color: #1f1f1f; }
  #editor .ft-toc { break-inside: avoid; }
  #editor p.ft-legend { break-after: avoid; }
  #editor span.ft-xref { color: inherit; border-bottom: 0; }
  #editor .ft-index-entry.absent { opacity: 1; }
  #editor .ft-index-letter { break-after: avoid; }
  #editor .ft-caption:empty::before, #editor p.ft-legend::after { content: none !important; }
  #editor .ft-caption[data-cap]:empty::before { content: attr(data-cap) !important; }
  #editor h1, #editor h2, #editor h3, #editor h4, #editor h5 { break-after: avoid; }
  #editor table, #editor .ft-image, #editor .ft-callout { break-inside: avoid; }
  #editor .ft-pg-gap { display: none !important; }
  #editor .ft-cover .ft-cover-field:empty { display: none; }
  #editor .ft-cover .ft-cover-field { outline: none !important; }
`;

  // opts.typo : coupure des mots et justification par paragraphe entier (composition.js).
  async function build(opts = {}) {
    const info = window.FTPages.exportInfo();
    info.cleanup();
    const c = info.cfg;
    const custom = info.mode === 'avance' || c.custom;
    const [w, h] = custom ? info.size('portrait') : [210, 297];
    const m = custom ? c.margins : { top: 25, bottom: 25, left: 25, right: 25 };
    const { box, cls } = content();
    const typo = opts.typo !== false;
    if (typo) await markLanguages(box);
    // Mode avancé : chaque note de bas de page au pied de sa page (notes-pied.js).
    const notes = info.mode === 'avance' && hasFootnotes(box);
    const css = PRINT_CSS + `
  #editor .ft-cover { aspect-ratio: auto !important; height: ${(h - m.top - m.bottom - 1).toFixed(1)}mm !important; margin: 0 !important; break-after: page; }
  html.ft-cover-bleed #editor .ft-cover { height: ${(h - 0.5).toFixed(1)}mm !important; }
${info.mode === 'avance' ? '' : '  #editor .ft-cover { display: none !important; }\n'}${info.mode === 'avance' && c.keep ? '  #editor > [data-pg-start] { break-before: page; }\n' : ''}${info.mode === 'avance' && c.chapters ? `  #editor > :is(h1${c.chapters > 1 ? ', h2' : ''}):not(.ft-title) { break-before: page; }\n` : ''}${typo || notes ? `  .ft-print { width: ${(w - m.left - m.right).toFixed(2)}mm; }\n  html.ft-cover-bleed .ft-print { width: auto; }\n` : ''}`;
    const html = pageHtml({ box, cls, css, scripts: (typo ? composeScripts() : '') + (notes ? NOTES_SCRIPTS : '') });
    const header = c.header.on && c.header.html ? c.header.html : '';
    const footer = c.footer.on && c.footer.html ? c.footer.html : '';
    return {
      html,
      page: { width: w, height: h, margins: m },
      header: band(header, c.numbers, true, m),
      footer: band(footer, c.numbers, false, m),
      firstDifferent: !!c.firstDifferent,
      // Page de titre en tête (mode avancé) : la première page est imprimée sans marges, à fond perdu.
      cover: info.mode === 'avance' && !!box.firstElementChild && box.firstElementChild.classList.contains('ft-cover'),
      // Composition dans la page cachée, avant l'impression (pages déjà faites : pas de ligne en plus).
      compose: typo ? { lang: docLang(), keepLines: info.mode === 'avance' && !!c.keep } : null,
      // Notes au pied des pages : hauteur de la zone de texte (mm) et règles des pages.
      notes: notes ? { height: h - m.top - m.bottom, keep: !!c.keep, chapters: c.chapters || 0 } : null
    };
  }

  window.FTPdf = {
    build,
    // Pour l'export livre (livre.js) et l'EPUB (epub.js).
    content,
    markLanguages,
    composeScripts,
    NOTES_SCRIPTS,
    hasFootnotes,
    pageHtml,
    docLang,
    PRINT_CSS,
    // Moteur 2.0 : la zone d'écriture du nouveau moteur.
    useEngine(mount) { editor = mount; }
  };
})();
