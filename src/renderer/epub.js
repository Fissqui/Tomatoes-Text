// Export EPUB 3 (liseuses, tablettes) : le texte coupé en chapitres aux titres 1, une table des matières
// (nav.xhtml, et toc.ncx pour les liseuses anciennes), une page de titre (page de titre du document), les
// notes dans un fichier à part (notes en fenêtre sur les liseuses qui le permettent, lien de retour), les
// images en fichiers, les formules en MathML, une feuille de style tirée du thème du document (polices,
// tailles relatives, couleurs des titres, retraits). Le texte reste fluide : la liseuse fait les pages,
// la taille du texte et la coupure des mots. Les blocs liés aux pages (sommaire, table des illustrations,
// index) ne sont pas repris ; un renvoi devient un lien. main.js (livre.js) fait l'archive.
(function () {
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(3, '0');

  // ----- Feuille de style (thème du document) -----

  function stylesheet() {
    const ed = document.getElementById('editor');
    const p = ed.querySelector('p:not(.ft-legend):not(.ft-quote-src)') || ed;
    const cs = getComputedStyle(p);
    const base = parseFloat(cs.fontSize) || 16;
    const em = (px) => (parseFloat(px) / base).toFixed(3).replace(/\.?0+$/, '') + 'em';
    const family = (f) => clean(f).replace(/;/g, '');
    const rules = [];
    const lh = parseFloat(cs.lineHeight);
    rules.push(`body { font-family: ${family(cs.fontFamily)}, serif; line-height: ${Number.isFinite(lh) ? (lh / base).toFixed(2) : 1.45}; }`);
    rules.push(`p { margin: 0 0 ${em(cs.marginBottom)}; text-indent: ${parseFloat(cs.textIndent) ? em(cs.textIndent) : '0'}; text-align: ${cs.textAlign === 'justify' ? 'justify' : 'left'}; hyphens: auto; -webkit-hyphens: auto; }`);
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5']) {
      const h = ed.querySelector(`${tag}:not(.ft-title)`);
      if (!h) {
        rules.push(`${tag} { font-size: ${[1.8, 1.45, 1.2, 1.05, 1][Number(tag[1]) - 1]}em; margin: 1.2em 0 0.5em; page-break-after: avoid; break-after: avoid; }`);
        continue;
      }
      const s = getComputedStyle(h);
      rules.push(`${tag} { font-family: ${family(s.fontFamily)}, serif; font-size: ${em(s.fontSize)}; font-weight: ${s.fontWeight}; font-style: ${s.fontStyle}; color: ${s.color}; text-align: ${/^(center|right)$/.test(s.textAlign) ? s.textAlign : 'left'}; text-transform: ${s.textTransform}; margin: 1.2em 0 0.5em; line-height: 1.25; page-break-after: avoid; break-after: avoid; }`);
    }
    const t = ed.querySelector('h1.ft-title');
    if (t) {
      const s = getComputedStyle(t);
      rules.push(`h1.ft-title { font-family: ${family(s.fontFamily)}, serif; font-size: ${em(s.fontSize)}; color: ${s.color}; text-align: ${/^(center|right)$/.test(s.textAlign) ? s.textAlign : 'left'}; }`);
    }
    rules.push(
      'h1 { page-break-before: always; break-before: page; margin-top: 2em; }',
      'body > section > h1:first-child { page-break-before: auto; break-before: auto; }',
      'blockquote { margin: 1em 1.5em; font-style: italic; }',
      'blockquote p { text-indent: 0; }',
      '.ft-quote-src { text-align: right; font-style: normal; font-size: 0.9em; }',
      'ul, ol { margin: 0.5em 0 0.8em 1.6em; padding: 0; }',
      'li { margin: 0.2em 0; }',
      'ol.ft-nums { list-style: none; }',
      'p.ft-bib { padding-left: 2em; text-indent: -2em; text-align: left; } p.ft-bib[data-n]::before { content: "[" attr(data-n) "] "; }',
      'ol.ft-nums > li > ol.ft-nums { margin-left: 1.2em; }',
      'table { border-collapse: collapse; margin: 1em 0; max-width: 100%; }',
      'td, th { border: 1px solid #999; padding: 0.25em 0.45em; vertical-align: top; }',
      'img, svg { max-width: 100%; height: auto; }',
      '.ft-image { display: block; text-align: center; margin: 1em auto; max-width: 100%; }',
      '.ft-image img { width: 100%; }',
      // (Images 2.5 : alignées, à côté du texte, dans la ligne ; devant ou derrière le texte : entre les paragraphes.)
      '.ft-image[data-align="gauche"] { margin-left: 0; } .ft-image[data-align="droite"] { margin-right: 0; }',
      '.ft-image[data-wrap="gauche"] { float: left; margin: 0.3em 1.6em 0.6em 0; } .ft-image[data-wrap="droite"] { float: right; margin: 0.3em 0 0.6em 1.6em; }',
      '.ft-image[data-wrap="ligne"] { display: inline-block; margin: 0 0.15em; vertical-align: bottom; }',
      '.ft-image[data-frame] img { border: 1px solid #888; padding: 4px; box-sizing: border-box; }',
      '.ft-image[data-cap-b] .ft-caption { font-weight: bold; } .ft-image[data-cap-i="0"] .ft-caption { font-style: normal; }',
      'h1, h2, h3, .ft-footnotes { clear: both; }',
      '.ft-caption, .ft-legend { display: block; text-align: center; font-size: 0.9em; font-style: italic; text-indent: 0; }',
      '.ft-callout { margin: 1em 0; padding: 0.6em 0.9em; border-left: 3px solid #999; }',
      'pre.ft-code { margin: 1em 0; padding: 0.5em 0.8em; border: 1px solid #d0d7de; border-radius: 4px; background: #f6f8fa; color: #1f2328; font-family: monospace; font-size: 0.85em; line-height: 1.45; white-space: pre-wrap; text-indent: 0; text-align: left; }',
      'pre.ft-code code { font: inherit; }',
      'pre.ft-code { position: relative; } pre.ft-code[data-num] { padding-left: 3.4em; } .ft-code-ln { position: absolute; left: 0; width: 2.6em; text-align: right; color: #8c959f; font-style: normal; }',
      'pre.ft-code[data-frame="trait"] { border-width: 0 0 0 3px; border-radius: 0; } pre.ft-code[data-frame="aucun"] { border: 0; background: none; padding-left: 0; }',
      '.tk-kw, .tk-pp { color: #cf222e; } .tk-ty, .tk-dec { color: #953800; } .tk-lit, .tk-num, .tk-at { color: #0550ae; } .tk-str { color: #0a3069; } .tk-com { color: #6e7781; font-style: italic; } .tk-fn { color: #8250df; } .tk-tag { color: #116329; }',
      '.ft-math[data-display="block"] { display: block; text-align: center; margin: 0.8em 0; }',
      '.ft-math[data-align="gauche"] { text-align: left; } .ft-math[data-align="gauche"] math { margin-left: 0; }',
      '.ft-eq-num { float: right; margin-left: 1em; line-height: 2.4; }',
      'sup { line-height: 0; font-size: 0.75em; }',
      'a { color: inherit; }',
      'a[epub|type~="noteref"] { text-decoration: none; }',
      '.titre { text-align: center; margin-top: 25%; }',
      '.titre p { text-indent: 0; text-align: center; margin: 0.6em 0; }',
      '.titre .t-titre { font-size: 2em; font-weight: bold; }',
      '.titre .t-sous-titre { font-size: 1.3em; }',
      '.titre .t-auteur { font-size: 1.15em; margin-top: 2em; }',
      'aside.note p { text-indent: 0; text-align: left; font-size: 0.92em; }',
      '.note-num { font-weight: bold; text-decoration: none; }'
    );
    return '@namespace epub "http://www.idpf.org/2007/ops";\n' + rules.join('\n') + '\n';
  }

  // ----- Document XHTML -----

  function page(title, lang, body, { notes = false } = {}) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML}" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body${notes ? ' epub:type="backmatter"' : ''}>
${body}
</body>
</html>
`;
  }
  const xml = (node) => new XMLSerializer().serializeToString(node).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');

  // Nom du document, s'il en a un.
  const docTitle = () => { const n = window.FTApp && window.FTApp.docName(); return n && n !== 'Sans titre' ? n : ''; };

  // Listes numérotées : les numéros (1.1., 1.a.…) écrits devant chaque ligne, les liseuses ne savent pas
  // les composer ; même numérotation que dans le logiciel (structure.js).
  const NUM_OLD = { 'romain-min': 'i', 'romain-maj': 'I', 'lettre-min': 'a', 'lettre-maj': 'A' };
  function numberLists(root) {
    const S = window.FTStructure;
    const walk = (ol, prefix, level, formats) => {
      const own = ol.getAttribute('data-num');
      const f = own === 'escalier' ? '1' : NUM_OLD[own] || formats[Math.min(level, formats.length) - 1] || '1';
      let n = (Number(ol.getAttribute('start')) || 1) - 1;
      for (const li of [...ol.children].filter((c) => c.tagName === 'LI')) {
        n++;
        const label = prefix + S.numText(n, f) + '.';
        if (!li.hasAttribute('data-porteur')) {
          const span = root.ownerDocument.createElement('span');
          span.className = 'ft-num';
          span.textContent = label + '\u00a0';
          const first = li.firstChild;
          (first && first.nodeType === 1 && /^(P|H[1-6])$/.test(first.tagName) ? first : li).prepend(span);
        }
        for (const sub of li.querySelectorAll(':scope > ol')) walk(sub, label, level + 1, formats);
      }
      ol.classList.add('ft-nums');
    };
    for (const top of root.querySelectorAll('ol')) {
      if ((top.parentElement && top.parentElement.closest('ol')) || top.closest('.ft-footnotes, .ft-endnotes, .ft-biblio')) continue;
      const formats = S.themeNumbers().map((x, i) => (top.getAttribute('data-num') === 'escalier' ? '1' : top.getAttribute('data-n' + (i + 1)) || x));
      walk(top, '', 1, formats);
    }
  }

  async function build() {
    const P = window.FTPdf;
    const { box } = P.content();
    if (window.FTDiagram) await window.FTDiagram.fontifyAll(box);
    // Dans un document à part, sans fenêtre : les images n'y sont pas chargées quand leur adresse change.
    const doc = document.implementation.createHTMLDocument('');
    doc.adoptNode(box);
    const lang = P.docLang();
    const title = clean((box.querySelector('.ft-cover .ft-cover-field[data-field="titre"]') || {}).textContent) || docTitle() || clean((box.querySelector('h1') || {}).textContent) || 'Sans titre';
    const author = clean((box.querySelector('.ft-cover .ft-cover-field[data-field="auteur"]') || {}).textContent);
    const files = [];
    const manifest = [];
    const props = new Map(); // fichier -> propriétés (svg, mathml)

    // Blocs liés aux pages : pas dans un livre numérique.
    box.querySelectorAll('.ft-toc, .ft-lof, .ft-index, .ft-pg-gap').forEach((e) => e.remove());
    numberLists(box);
    box.querySelectorAll('[contenteditable], [spellcheck], [draggable]').forEach((e) => { e.removeAttribute('contenteditable'); e.removeAttribute('spellcheck'); e.removeAttribute('draggable'); });
    for (const el of box.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^(data-pm-|on|title$)/.test(a.name)) el.removeAttribute(a.name);
    // Liens vers d'autres documents ou fichiers : leur texte seul (le livre numérique ne les contient pas).
    for (const a of box.querySelectorAll('a')) {
      const href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|#)/i.test(href)) continue;
      const span = doc.createElement('span');
      span.append(...a.childNodes);
      a.replaceWith(span);
    }

    // Page de titre.
    const cover = box.querySelector('.ft-cover');
    let titlePage = null;
    if (cover) {
      const lines = [...cover.querySelectorAll('.ft-cover-field')].filter((f) => clean(f.textContent)).map((f) => `<p class="t-${esc(f.dataset.field || 'texte')}">${esc(clean(f.textContent))}</p>`);
      cover.remove();
      if (lines.length) titlePage = `<section class="titre" epub:type="titlepage">\n${lines.join('\n')}\n</section>`;
    }

    // Images : fichiers à part.
    let img = 0;
    const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp' };
    for (const im of box.querySelectorAll('img')) {
      const src = im.getAttribute('src') || '';
      const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
      if (!m || !EXT[m[1]] || m[1] === 'image/webp') {
        // (Image hors du document, ou d'un type que les liseuses ne lisent pas : son texte de remplacement.)
        im.replaceWith(doc.createTextNode(im.getAttribute('alt') || ''));
        continue;
      }
      const name = `images/image-${pad(++img)}.${EXT[m[1]]}`;
      const base64 = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
      files.push({ name: 'OEBPS/' + name, base64 });
      manifest.push({ id: 'img' + img, href: name, type: m[1] });
      im.setAttribute('src', name);
      if (!im.hasAttribute('alt')) im.setAttribute('alt', '');
    }

    // Équations : MathML (formules-latex.js) ; numéro d'une équation numérotée au bord droit.
    let math = false;
    for (const f of box.querySelectorAll('.ft-math[data-latex]')) {
      let node = null;
      const block = f.dataset.display === 'block';
      try {
        const d = new DOMParser().parseFromString(window.FTLatex.toMathML(f.dataset.latex, block), 'application/xml');
        if (!d.querySelector('parsererror')) node = doc.importNode(d.documentElement, true);
      } catch { node = null; }
      f.textContent = '';
      if (node) { f.append(node); math = true; } else f.textContent = f.dataset.latex;
      if (block && f.hasAttribute('data-numero') && f.dataset.eq) {
        const n = doc.createElement('span');
        n.className = 'ft-eq-num';
        n.textContent = f.dataset.eq;
        f.prepend(n);
      }
    }

    // Notes : un fichier à part.
    const notes = [];
    for (const kind of ['fn', 'en']) {
      const zone = box.querySelector(kind === 'fn' ? '.ft-footnotes' : '.ft-endnotes');
      if (!zone) continue;
      for (const li of zone.querySelectorAll(`li[data-${kind}]`)) notes.push({ kind, id: li.getAttribute('data-' + kind), li });
      zone.remove();
    }
    const refs = new Map();
    for (const sup of box.querySelectorAll('sup.ft-fn-ref, sup.ft-en-ref')) {
      const kind = sup.classList.contains('ft-fn-ref') ? 'fn' : 'en';
      const id = sup.getAttribute('data-' + kind);
      if (!id || !notes.some((n) => n.kind === kind && n.id === id)) continue;
      const a = doc.createElement('a');
      a.setAttribute('epub:type', 'noteref');
      a.id = `ref-${kind}-${id}`;
      a.setAttribute('href', `#note-${kind}-${id}`);
      a.textContent = clean(sup.textContent);
      sup.textContent = '';
      sup.append(a);
      refs.set(`${kind}-${id}`, a.textContent);
    }

    // Chapitres : coupés aux titres 1 (premier niveau du texte).
    const chapters = [];
    let cur = null;
    for (const el of [...box.childNodes]) {
      if (el.nodeType === Node.ELEMENT_NODE && el.matches('h1') || !cur) {
        cur = { nodes: [], title: '' };
        chapters.push(cur);
      }
      if (el.nodeType === Node.ELEMENT_NODE && el.matches('h1') && !cur.title) cur.title = clean(el.textContent);
      cur.nodes.push(el);
    }
    const real = chapters.filter((c) => c.nodes.some((n) => clean(n.textContent) || (n.nodeType === Node.ELEMENT_NODE && n.querySelector('img, svg, math, table'))));
    real.forEach((c, i) => {
      c.file = `chapitre-${pad(i + 1)}.xhtml`;
      if (!c.title) c.title = i === 0 ? title : `Partie ${i + 1}`;
    });
    // Titres 2 : dans la table des matières, sous leur chapitre.
    let hid = 0;
    for (const c of real) {
      c.subs = [];
      for (const n of c.nodes) {
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        const hs = n.matches('h2') ? [n] : [];
        for (const h of hs) {
          if (!h.id) h.id = 'titre-' + ++hid;
          c.subs.push({ id: h.id, text: clean(h.textContent) });
        }
      }
    }
    // Liens internes (renvois, notes) : vers le bon fichier.
    const fileOf = new Map();
    for (const c of real) for (const n of c.nodes) if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.id) fileOf.set(n.id, c.file);
      for (const x of n.querySelectorAll('[id]')) fileOf.set(x.id, c.file);
    }
    for (const span of box.querySelectorAll('span.ft-xref[data-target]')) {
      const key = span.dataset.target;
      const id = key.slice(key.indexOf(':') + 1);
      const el = /^[\w-]+$/.test(id) ? box.querySelector(key.startsWith('bm:') ? `[data-bm="${id}"]` : `[data-xid="${id}"]`) : null;
      const text = clean(span.textContent).replace(/,?\s*(page|Page) \S+$/, '').replace(/\s*(ci-dessus|ci-dessous)$/i, '') || 'voir';
      if (!el) { span.textContent = text; continue; }
      if (!el.id) el.id = 'cible-' + id;
      let file = null;
      for (const c of real) if (c.nodes.some((n) => n === el || (n.nodeType === Node.ELEMENT_NODE && n.contains(el)))) file = c.file;
      const a = doc.createElement('a');
      a.setAttribute('href', `${file || ''}#${el.id}`);
      a.textContent = text;
      span.textContent = '';
      span.append(a);
    }
    const notesFile = 'notes.xhtml';
    for (const a of box.querySelectorAll('a[epub\\:type="noteref"], a[href^="#"]')) {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) continue;
      const id = href.slice(1);
      if (id.startsWith('note-')) a.setAttribute('href', notesFile + href);
      else if (fileOf.has(id)) a.setAttribute('href', fileOf.get(id) + href);
    }

    // Fichiers des chapitres.
    for (const c of real) {
      const section = doc.createElementNS(XHTML, 'section');
      section.setAttribute('epub:type', 'chapter');
      for (const n of c.nodes) section.append(n);
      const body = xml(section);
      if (section.querySelector('svg')) props.set(c.file, 'svg');
      if (section.querySelector('math')) props.set(c.file, (props.get(c.file) ? props.get(c.file) + ' ' : '') + 'mathml');
      files.push({ name: 'OEBPS/' + c.file, text: page(c.title, lang, body) });
    }
    if (titlePage) files.push({ name: 'OEBPS/titre.xhtml', text: page(title, lang, titlePage) });
    if (notes.length) {
      const fileOfRef = (key) => { for (const c of real) if (c.nodes.some((n) => n.nodeType === Node.ELEMENT_NODE && n.querySelector('#ref-' + key))) return c.file; return ''; };
      const parts = [];
      for (const kind of ['fn', 'en']) {
        const list = notes.filter((n) => n.kind === kind);
        if (!list.length) continue;
        if (kind === 'en' && notes.some((n) => n.kind === 'fn')) parts.push('<h2>Notes de fin</h2>');
        for (const n of list) {
          const key = `${kind}-${n.id}`;
          const num = refs.get(key) || '';
          const back = num ? `<a class="note-num" href="${fileOfRef(key)}#ref-${key}">${esc(num)}.</a> ` : '';
          const inner = [...n.li.childNodes];
          const holder = doc.createElementNS(XHTML, 'div');
          inner.forEach((x) => holder.append(x));
          let html = [...holder.childNodes].map((x) => (x.nodeType === Node.ELEMENT_NODE ? xml(x) : esc(x.textContent))).join('');
          // Numéro de retour dans le premier paragraphe de la note.
          html = /^<p[\s>]/.test(html) ? html.replace(/^<p([^>]*)>/, `<p$1>${back}`) : `<p>${back}${html}</p>`;
          parts.push(`<aside class="note" epub:type="${kind === 'fn' ? 'footnote' : 'endnote'}" id="note-${key}">${html}</aside>`);
        }
      }
      files.push({ name: 'OEBPS/' + notesFile, text: page('Notes', lang, `<section epub:type="${notes.some((n) => n.kind === 'fn') ? 'footnotes' : 'endnotes'}">\n<h1>Notes</h1>\n${parts.join('\n')}\n</section>`, { notes: true }) });
      if (math) props.set(notesFile, 'mathml');
    }

    // Table des matières.
    const navItems = [];
    if (titlePage) navItems.push({ href: 'titre.xhtml', text: title, subs: [] });
    for (const c of real) navItems.push({ href: c.file, text: c.title, subs: c.subs.map((s) => ({ href: `${c.file}#${s.id}`, text: s.text })) });
    if (notes.length) navItems.push({ href: notesFile, text: 'Notes', subs: [] });
    const li = (it) => `<li><a href="${esc(it.href)}">${esc(it.text || '—')}</a>${it.subs && it.subs.length ? `<ol>${it.subs.map(li).join('')}</ol>` : ''}</li>`;
    files.push({ name: 'OEBPS/nav.xhtml', text: page('Table des matières', lang, `<nav epub:type="toc" id="toc">\n<h1>Table des matières</h1>\n<ol>${navItems.map(li).join('\n')}</ol>\n</nav>`) });
    let order = 0;
    const point = (it) => `<navPoint id="np${++order}" playOrder="${order}"><navLabel><text>${esc(it.text || '—')}</text></navLabel><content src="${esc(it.href)}"/>${(it.subs || []).map(point).join('')}</navPoint>`;
    const uid = 'urn:uuid:' + uuidOf((window.FTApp && window.FTApp.currentId && window.FTApp.currentId()) || title);
    files.push({ name: 'OEBPS/toc.ncx', text: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${uid}"/></head>
<docTitle><text>${esc(title)}</text></docTitle>
<navMap>${navItems.map(point).join('\n')}</navMap>
</ncx>
` });
    files.push({ name: 'OEBPS/style.css', text: stylesheet() });

    // Paquet.
    const items = [
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
      '<item id="css" href="style.css" media-type="text/css"/>'
    ];
    const spine = [];
    const add = (id, href) => {
      items.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"${props.has(href) ? ` properties="${props.get(href)}"` : ''}/>`);
      spine.push(`<itemref idref="${id}"/>`);
    };
    if (titlePage) add('titre', 'titre.xhtml');
    real.forEach((c, i) => add('c' + (i + 1), c.file));
    if (notes.length) add('notes', notesFile);
    for (const m of manifest) items.push(`<item id="${m.id}" href="${m.href}" media-type="${m.type}"/>`);
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({ name: 'OEBPS/content.opf', text: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
<dc:language>${lang}</dc:language>
${author ? `<dc:creator>${esc(author)}</dc:creator>\n` : ''}<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
${items.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>
` });
    files.push({ name: 'META-INF/container.xml', text: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
` });
    return files;
  }

  // Identifiant stable du livre, tiré de l'identifiant du document.
  function uuidOf(s) {
    let h = [0x811c9dc5, 0x1234567, 0x9e3779b9, 0x7f4a7c15];
    for (let i = 0; i < s.length; i++) for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ (s.charCodeAt(i) + k), 16777619) >>> 0;
    const hex = h.map((x) => x.toString(16).padStart(8, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  window.FTEpub = { build, stylesheet };
})();
