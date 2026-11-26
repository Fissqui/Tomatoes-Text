// Coller sans dégâts : un texte venu d'ailleurs (page web, PDF, Word) est nettoyé avant d'entrer dans le
// document. Polices, tailles, couleurs et fonds sont retirés (le texte prend le thème du document) ;
// gras, italique, souligné et liens peuvent rester, ainsi que titres, listes et tableaux ; les lignes
// coupées d'un PDF sont recollées (avec les mots coupés en fin de ligne), les espaces en trop retirés.
// Un collage long ou de plusieurs paragraphes passe par un aperçu ; un court morceau est nettoyé
// directement. Un passage copié dans le logiciel même se colle comme avant.
(function () {
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const dialog = $('paste-dialog');
  const PREFS = 'ft-coller';
  const SHORT = 80; // en dessous (sur une seule ligne), pas d'aperçu

  let lastCopy = null;   // texte du dernier passage copié dans le document
  let plainUntil = 0;    // Ctrl+Maj+V : coller sans mise en forme
  let pending = null;    // { html, text, range }

  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // ----- Texte brut (PDF, bloc-notes…) -----

  const BULLET = /^\s*([•●◦▪▫■□·∙‣⁃*–—-]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/i;
  const ORDERED = /^\s*\(?(\d{1,3}|[a-z])[.)]\s+/i;

  // Les lignes ont-elles été coupées à la largeur d'une page (PDF) ?
  function looksWrapped(lines) {
    const full = lines.map((l) => l.trim()).filter(Boolean);
    if (full.length < 3) return false;
    const max = Math.max(...full.map((l) => l.length));
    if (max < 30) return false;
    const body = full.slice(0, -1);
    const long = body.filter((l) => l.length >= max * 0.7).length;
    const open = body.filter((l) => !/[.!?:;»"”)]$/.test(l)).length;
    return long >= body.length * 0.5 && open >= body.length * 0.4;
  }

  // Recolle les lignes d'un même paragraphe. Une ligne courte qui finit une phrase termine le paragraphe ;
  // une ligne vide, une puce ou un numéro en commencent un nouveau.
  function joinLines(lines) {
    const full = lines.map((l) => l.trim()).filter(Boolean);
    const max = full.length ? Math.max(...full.map((l) => l.length)) : 0;
    const paras = [];
    let cur = null;
    let prevLen = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { cur = null; continue; }
      const ends = cur !== null && /[.!?:»"”)]$/.test(cur) && prevLen < max * 0.75;
      if (cur === null || BULLET.test(line) || ends) {
        cur = line;
        paras.push(cur);
      } else if (/[\p{L}]-$/u.test(cur) && /^\p{Ll}/u.test(line)) {
        // Mot coupé en fin de ligne : « exem- / ple ».
        cur = cur.slice(0, -1) + line;
        paras[paras.length - 1] = cur;
      } else {
        cur = cur + ' ' + line;
        paras[paras.length - 1] = cur;
      }
      prevLen = line.length;
    }
    return paras;
  }

  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ----- Équations (formules-collage.js) -----
  // Chaque équation reconnue est mise de côté et remplacée par un jeton (\uE000n\uE001) que les
  // nettoyages du texte ne touchent pas ; render() remet l'équation à sa place.
  const FC = () => window.FTFormulesCollage;
  const formulas = [];
  const token = (html) => '\uE000' + (formulas.push(html) - 1) + '\uE001';
  const TOKEN = /\uE000(\d+)\uE001/g;
  const isBlockToken = (i) => /^<div\b/.test(formulas[i] || '');
  const inlineToken = (i) => {
    const f = window.FTFormules;
    const info = f && f.infoOf(formulas[i]);
    return info ? token(f.html({ ...info, block: false, numbered: false, align: '' })) : '';
  };
  // Texte : code LaTeX ($…$, \[…\]…) remplacé par des équations.
  const latexIn = (text) => (FC() && window.FTFormules
    ? FC().replaceLatex(text, (latex, block) => token(window.FTFormules.html({ latex: window.FTFormules.clean(latex), block })))
    : text);
  // Équation sur sa ligne au milieu d'un paragraphe : le paragraphe est coupé autour d'elle ; dans une
  // liste, elle reste dans la ligne.
  function splitBlocks(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.type === 'table' || b.type === 'math' || !b.html || !b.html.includes('\uE000')) { out.push(b); continue; }
      if (b.type === 'li') { out.push({ ...b, html: b.html.replace(TOKEN, (m, i) => (isBlockToken(i) ? inlineToken(i) : m)) }); continue; }
      const parts = b.html.split(/(\uE000\d+\uE001)/);
      let acc = '';
      const flush = () => { if (acc.replace(/<[^>]+>|[\s\u00a0]/g, '')) out.push({ ...b, html: acc.trim(), text: acc }); acc = ''; };
      for (const part of parts) {
        const m = /^\uE000(\d+)\uE001$/.exec(part);
        if (m && isBlockToken(m[1])) { flush(); out.push({ type: 'math', html: part, text: '∗' }); } else acc += part;
      }
      flush();
    }
    return out;
  }

  // ----- Notes de bas de page (notes-collage.js) -----
  // Comme les équations : chaque appel est remplacé par un jeton (\uE002n\uE003) ; render() pose l'appel
  // de note du logiciel et, à la fin, le bloc des notes (editor.js le range avec les notes du document).
  const NC = () => window.FTNotesCollage;
  const notes = []; // { kind, html, url, frag }
  const noteToken = (n) => '\uE002' + (notes.push(n) - 1) + '\uE003';
  const NOTE = /\uE002(\d+)\uE003/g;

  function blocksFromText(text, opts) {
    // Texte d'un PDF : appels « mot¹ » et lignes de note « 1 Texte » plus bas.
    if (opts.structure && NC()) {
      const t = NC().fromText(text, (note) => noteToken({ kind: 'fn', html: '<p>' + escape(latexIn(note)) + '</p>' }));
      if (t !== null) text = t;
    }
    // (Équation sur plusieurs lignes, $$…$$ ou \begin{align}… : reconnue avant le découpage en lignes.)
    if (/\$\$|\\\[|\\begin\{/.test(text)) text = text.replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}[\s\S]+?\\end\{\1\*?\}/g, (m) => '\n' + latexIn(m) + '\n');
    const lines = text.replace(/\r\n?/g, '\n').replace(/\u000c/g, '\n').split('\n');
    const paras = opts.lines ? joinLines(lines) : lines.map((l) => l.trim()).filter(Boolean);
    return paras.map((p) => {
      const m = opts.structure && p.match(BULLET);
      if (m) return { type: 'li', list: ORDERED.test(p) ? 'ol' : 'ul', level: 0, html: escape(latexIn(p.slice(m[0].length))) };
      return { type: 'p', html: escape(latexIn(p)) };
    });
  }

  // ----- HTML (page web, Word) -----

  // (Images gardées depuis la version 2.5 : voir image() et resolveImages().)
  const DROP = 'script, style, meta, link, title, head, noscript, iframe, object, embed, svg, canvas, video, audio, button, input, select, textarea, form, template, source';
  const NOISE = 'sup.reference, .mw-editsection, .noprint, .sortkey, .mw-cite-backlink, [hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]';
  const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'BLOCKQUOTE', 'PRE', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'TABLE', 'HR', 'CENTER']);

  // Mise en forme gardée d'un élément : gras, italique, souligné, barré, exposant, indice, lien.
  function marksOf(el) {
    const t = el.tagName;
    const st = el.style || {};
    const marks = [];
    const weight = st.fontWeight;
    if (t === 'B' || t === 'STRONG' || weight === 'bold' || Number(weight) >= 600) marks.push('b');
    if (t === 'I' || t === 'EM' || t === 'CITE' || st.fontStyle === 'italic') marks.push('i');
    if (t === 'U' || /underline/.test(st.textDecoration || st.textDecorationLine || '')) marks.push('u');
    if (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(st.textDecoration || st.textDecorationLine || '')) marks.push('s');
    if (t === 'SUP' || st.verticalAlign === 'super') marks.push('sup');
    if (t === 'SUB' || st.verticalAlign === 'sub') marks.push('sub');
    // « font-weight: normal » à l'intérieur d'un <b> (Google Docs) : pas de gras.
    if (t === 'B' && (weight === 'normal' || weight === '400')) marks.splice(marks.indexOf('b'), 1);
    return marks;
  }

  // Blocs d'une note : un paragraphe chacun (un tableau devient des lignes de texte).
  const noteParas = (parts) => parts
    .flatMap((b) => (b.type === 'table' ? b.rows.map((r) => r.map((c) => c.html).join(' – ')) : [b.html]))
    .map((h) => tidySpaces(h || '').replace(TOKEN, (m, i) => (isBlockToken(i) ? inlineToken(i) : m)).trim()).filter((h) => h.replace(/<[^>]+>/g, '').trim() || h.includes('\uE000'))
    .map((h) => '<p>' + h.replace(/\n/g, '<br>') + '</p>').join('');

  // Zone de texte de Word : son contenu (texte, image) est posé dans des tableaux de mise en page
  // (<span position:absolute><table><tr><td>…<table>…<div v:shape class=shape>), qui en feraient un tableau
  // et perdraient l'image. Ces tableaux sont retirés, le contenu de la zone reste à sa place ; une zone
  // posée à côté du texte garde ses images à côté du texte.
  function unwrapTextBoxes(doc) {
    const boxes = [...doc.querySelectorAll('div.shape, div[v\\:shape], v\\:textbox td > div')].filter((d) => d.closest('table'));
    for (const box of boxes) {
      if (!box.isConnected) continue;
      let top = null;
      let floating = false;
      for (let a = box.parentElement; a && a !== doc.body; a = a.parentElement) {
        if (a.tagName === 'TABLE') { top = a; continue; }
        if (/^(TD|TH|TR|TBODY|THEAD)$/.test(a.tagName)) continue;
        // (Word en emboîte deux : une boîte placée qui contient une autre boîte placée.)
        if (top && a.tagName === 'SPAN' && /position:\s*absolute/i.test(a.getAttribute('style') || '')) { top = a; floating = true; continue; }
        break;
      }
      if (!top) continue;
      // (Seulement des tableaux vides autour de la zone : un vrai tableau qui contient une zone reste un tableau.)
      const bare = (t) => t.replace(/[\s\u00a0]/g, '');
      if (bare(top.textContent) !== bare(box.textContent) || [...top.querySelectorAll('img')].some((i) => !box.contains(i))) continue;
      if (floating) box.querySelectorAll('img:not([align])').forEach((img) => img.setAttribute('align', 'left'));
      top.replaceWith(...box.childNodes);
    }
  }

  function blocksFromHtml(html, opts) {
    const doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : html;
    unwrapTextBoxes(doc);
    // Équations (Word, pages web) : avant le nettoyage, qui en retirerait les morceaux.
    if (FC()) FC().markMath(doc);
    // Notes de bas de page : appels remplacés par un repère, notes mises de côté.
    const found = NC() ? NC().extract(doc) : [];
    const clear = (root) => {
      root.querySelectorAll(DROP).forEach((n) => n.remove());
      // Pages web (Wikipédia…) : appels de note restants, liens « [archive] », « [modifier] », éléments cachés.
      root.querySelectorAll(NOISE).forEach((n) => n.remove());
    };
    clear(doc);
    for (const f of found) if (f.box) clear(f.box);
    // Word : puces et numéros écrits à la main dans les listes (mso-list: Ignore), commentaires conditionnels.
    doc.querySelectorAll('[style*="mso-list"]').forEach((n) => { if (/mso-list:\s*ignore/i.test(n.getAttribute('style'))) n.remove(); });
    const blocks = [];
    let cur = null;
    let listStack = [];

    const open = (type, extra = {}) => { cur = { type, html: '', ...extra }; blocks.push(cur); return cur; };
    const ensure = () => cur || open('p');
    const close = () => { cur = null; };

    function inline(node, marks) {
      if (node.nodeType === Node.TEXT_NODE) {
        let s = node.data.replace(/[\s ]+/g, (m) => (/ /.test(m) && m.length === 1 ? ' ' : ' '));
        if (!s) return;
        const b = ensure();
        if (!b.html || /[ \n]$/.test(b.text || '')) s = s.replace(/^ /, '');
        if (!s) return;
        const tags = opts.inline ? marks : [];
        b.html += tags.map((m) => `<${m}>`).join('') + escape(latexIn(s)) + tags.slice().reverse().map((m) => `</${m.split(' ')[0]}>`).join('');
        b.text = (b.text || '') + s;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      const t = el.tagName;
      if (t === 'BR') {
        const b = ensure();
        b.html += '\n';
        b.text = (b.text || '') + '\n';
        return;
      }
      if (el.classList.contains('ft-math')) {
        const b = ensure();
        b.html += token(el.outerHTML);
        b.text = (b.text || '') + '∗';
        return;
      }
      if (el.classList.contains('ft-paste-fn')) {
        const f = found[Number(el.dataset.k)];
        if (!f) return;
        const b = ensure();
        b.html += noteToken({ kind: f.kind, html: f.box ? noteHtml(f.box) : '', url: f.url, frag: f.frag });
        b.text = (b.text || '') + '¹';
        return;
      }
      if (t === 'TABLE') return table(el);
      if (t === 'IMG') return image(el);
      if (t === 'HR') { close(); return; }
      if (t === 'UL' || t === 'OL') {
        close();
        listStack.push(t.toLowerCase());
        for (const c of el.childNodes) inline(c, marks);
        listStack.pop();
        close();
        return;
      }
      if (t === 'LI') {
        close();
        open('li', { list: listStack[listStack.length - 1] || 'ul', level: Math.max(0, listStack.length - 1) });
        for (const c of el.childNodes) {
          if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) inline(c, marks);
          else { if (!cur || cur.type !== 'li') open('li', { list: listStack[listStack.length - 1] || 'ul', level: Math.max(0, listStack.length - 1), cont: true }); inline(c, marks); }
        }
        close();
        return;
      }
      const heading = /^H([1-6])$/.exec(t);
      const wordList = t === 'P' && /MsoListParagraph/i.test(el.className || '');
      if (heading || wordList || BLOCKS.has(t)) {
        close();
        if (heading) open('h' + Math.min(5, Number(heading[1])));
        else if (wordList) open('li', { list: 'ul', level: 0 });
        for (const c of el.childNodes) inline(c, marks);
        close();
        return;
      }
      let own = marksOf(el);
      if (t === 'A') {
        const href = el.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) own = [...own, `a href="${href.replace(/"/g, '&quot;')}"`];
      }
      for (const c of el.childNodes) inline(c, [...marks, ...own.filter((m) => !marks.includes(m))]);
    }

    // Image (version 2.5) : flottante dans l'original (Word, page web) → déplacement libre, du même côté ;
    // petite (icône, symbole) → dans la ligne du texte ; sinon → par ligne, entre deux paragraphes, avec
    // l'alignement de son paragraphe. Sources déjà lues en données (resolveImages) ; les autres sont laissées.
    function image(el) {
      const src = el.getAttribute('src') || '';
      if (!/^(data:image\/|blob:)/.test(src)) return;
      const px = (v) => { const m = /^([\d.]+)(px)?$/.exec(String(v || '').trim()); return m ? Number(m[1]) : 0; };
      const w = px(el.getAttribute('width')) || px(el.style.width) || Number(el.getAttribute('data-nw')) || 0;
      const h = px(el.getAttribute('height')) || px(el.style.height) || Number(el.getAttribute('data-nh')) || 0;
      const host = document.getElementById('editor');
      const col = Math.max(300, (host && host.clientWidth) || 620);
      const pct = w ? Math.max(5, Math.min(100, Math.round((w / col) * 100))) : 50;
      // Flottante : float ou align (page web), position absolue (Word).
      let side = '';
      const fl = (el.style.float || el.getAttribute('align') || '').toLowerCase();
      if (fl === 'left' || fl === 'right') side = fl === 'left' ? 'gauche' : 'droite';
      for (let a = el.parentElement, k = 0; !side && a && k < 3; a = a.parentElement, k++) {
        const af = ((a.style && a.style.float) || '').toLowerCase();
        if (af === 'left' || af === 'right') side = af === 'left' ? 'gauche' : 'droite';
        else if (a.style && a.style.position === 'absolute') side = px(a.style.marginLeft) + w / 2 > col / 2 ? 'droite' : 'gauche';
      }
      const box = (attrs, width) => `<span class="ft-image" contenteditable="false" style="width: ${width || pct + '%'};"${attrs}><img src="${src.replace(/"/g, '&quot;')}" alt=""></span>`;
      if (side) {
        // (Accrochée au début du paragraphe où elle se trouve.)
        const b = ensure();
        b.html = box(` data-wrap="${side}"`) + b.html;
        b.img = true;
        return;
      }
      if ((h && h <= 32) || (w && w <= 40)) {
        const b = ensure();
        b.html += box(' data-wrap="ligne"', Math.max(1, Math.round((w || h) * 0.75)) + 'pt');
        b.img = true;
        return;
      }
      const at = el.closest('[align], [style*="text-align"]');
      const ta = at ? (at.getAttribute('align') || at.style.textAlign || '').toLowerCase() : '';
      const align = ta === 'center' ? '' : ta === 'right' ? ' data-align="droite"' : ' data-align="gauche"';
      const resume = cur && cur.type !== 'li' ? cur.type : 'p';
      const had = !!cur;
      close();
      blocks.push({ type: 'img', html: box(align), img: true });
      // (Le texte qui suit l'image continue dans un nouveau paragraphe du même genre.)
      if (had) open(resume);
    }

    // Cases fusionnées gardées (rowspan, colspan) ; lignes vides retirées (barres de couleur d'un en-tête).
    function table(el) {
      close();
      const rows = [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el);
      const span = (c, k) => Math.max(1, Math.min(k === 'rowspan' ? 200 : 50, parseInt(c.getAttribute(k), 10) || 1));
      const data = rows.map((tr) => [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName)).map((c) => ({
        head: c.tagName === 'TH',
        html: cellHtml(c),
        rs: span(c, 'rowspan'),
        cs: span(c, 'colspan')
      })));
      // Fusion qui dépasse le tableau : ramenée à sa dernière ligne.
      data.forEach((row, r) => row.forEach((c) => { c.rs = Math.min(c.rs, data.length - r); }));
      const empty = (c) => !c.html.replace(/<[^>]+>|[\s\u00a0]/g, '');
      for (let r = data.length - 1; r >= 0; r--) {
        if (!data[r].every((c) => c.rs === 1 && empty(c))) continue;
        for (let q = 0; q < r; q++) for (const c of data[q]) if (q + c.rs - 1 >= r) c.rs--;
        data.splice(r, 1);
      }
      if (data.some((r) => r.length)) blocks.push({ type: 'table', rows: data });
    }

    // Une cellule : son texte avec la mise en forme gardée, paragraphes séparés par des retours à la ligne.
    function cellHtml(cell) {
      const saved = [blocks.length, cur];
      for (const c of cell.childNodes) inline(c, []);
      const parts = blocks.splice(saved[0]);
      cur = saved[1];
      return parts.filter((b) => b.html).map((b) => b.html.trim()).join('\n');
    }

    // Texte d'une note : ses paragraphes, avec la mise en forme gardée.
    function noteHtml(box) {
      const saved = [blocks.length, cur, listStack];
      cur = null;
      listStack = [];
      if (BLOCKS.has(box.tagName) || box.tagName === 'TD') for (const c of box.childNodes) inline(c, []);
      else inline(box, []);
      const parts = blocks.splice(saved[0]);
      [, cur, listStack] = saved;
      return noteParas(parts);
    }

    for (const c of doc.body.childNodes) inline(c, []);
    // Paragraphes vides, espaces au début et à la fin.
    return blocks.filter((b) => b.type === 'table' || b.img || (b.text || '').replace(/[\s ]/g, '')).map((b) => {
      if (b.type === 'table' || b.type === 'img') return b;
      b.html = b.html.replace(/^(\s|<[^>]+>\s*)*?\s+/, (m) => m.replace(/\s+/g, '')).replace(/\s+$/, '').replace(/ *\n */g, '\n');
      return b;
    });
  }

  // ----- Nettoyage commun -----

  function tidySpaces(html) {
    return html
      .replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.)\]…])/g, '$1')
      .replace(/([(\[]) +/g, '$1')
      .replace(/\n{2,}/g, '\n');
  }

  // Lignes coupées à l'intérieur d'un bloc HTML (<br> à chaque ligne d'un PDF) : recollées.
  function joinBreaks(html) {
    if (!html.includes('\n')) return html;
    const lines = html.split('\n');
    if (!looksWrapped(lines.map((l) => l.replace(/<[^>]+>/g, '')))) return html;
    return lines.reduce((acc, l) => (!acc ? l : /\p{L}-$/u.test(acc) && /^\p{Ll}/u.test(l) ? acc.slice(0, -1) + l : acc + ' ' + l), '');
  }

  function build(source, opts) {
    let blocks = source.html ? blocksFromHtml(source.html, opts) : blocksFromText(source.text, opts);
    blocks = splitBlocks(blocks).map((b) => {
      if (b.type === 'math' || b.type === 'img') return b;
      if (b.type === 'table') {
        if (opts.spaces) b.rows.forEach((r) => r.forEach((c) => { c.html = tidySpaces(c.html); }));
        return b;
      }
      let html = b.html;
      if (source.html && opts.lines) html = joinBreaks(html);
      if (opts.spaces) html = tidySpaces(html).trim();
      return { ...b, html };
    });
    if (!opts.structure) {
      blocks = blocks.flatMap((b) => (b.type === 'img' ? [b] : b.type === 'table'
        ? b.rows.map((r) => ({ type: 'p', html: r.map((c) => c.html.replace(/\n/g, ' ')).join(' – ') }))
        : b.type === 'math' ? [{ type: 'p', html: b.html.replace(TOKEN, (m, i) => inlineToken(i)) }] : [{ type: 'p', html: b.html }]));
    }
    return blocks;
  }

  // Largeurs des colonnes d'un tableau collé, d'après leur contenu (comme « ajuster au contenu » de
  // Word) : chaque colonne reçoit au moins la place de son mot le plus long, puis le reste selon la
  // longueur de ses lignes. Sans cela, toutes les colonnes ont la même largeur et les mots se coupent.
  let measure = null;
  function columnWidths(rows) {
    // Colonne de chaque case (cases fusionnées comprises).
    const taken = [];
    let count = 0;
    const placed = [];
    rows.forEach((row, r) => {
      let col = 0;
      for (const c of row) {
        while (taken[r] && taken[r][col]) col++;
        for (let i = 0; i < (c.rs || 1); i++) for (let j = 0; j < (c.cs || 1); j++) (taken[r + i] = taken[r + i] || [])[col + j] = true;
        placed.push([c, col]);
        col += c.cs || 1;
        count = Math.max(count, col);
      }
    });
    if (count < 2) return null;
    if (!measure) measure = document.createElement('canvas').getContext('2d');
    const sample = editor.querySelector('p') || editor;
    const cs = getComputedStyle(sample);
    const font = (bold) => `${bold ? 700 : 400} ${cs.fontSize} ${cs.fontFamily}`;
    // Place du texte seul (sans les marges des cases).
    const min = new Array(count).fill(24);
    const max = new Array(count).fill(24);
    for (const [c, col] of placed) {
      if ((c.cs || 1) > 1) continue;
      measure.font = font(c.head || /^<b>[\s\S]*<\/b>$/.test(c.html));
      const text = c.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      for (const line of text.split('\n')) {
        max[col] = Math.max(max[col], Math.min(400, measure.measureText(line.trim()).width));
        for (const w of line.split(/\s+/)) if (w) min[col] = Math.max(min[col], measure.measureText(w).width);
      }
    }
    const width = Math.max(300, (sample.clientWidth || editor.clientWidth) - 4);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    // Trop de colonnes pour la page : marges des cases réduites, puis texte plus petit (5 pt au moins)
    // pour que chaque mot tienne sur sa ligne.
    let pad = 20;
    let size = 0;
    if (sum(min) + count * pad > width) {
      pad = 14;
      const base = parseFloat(cs.fontSize) * 0.75;
      const k = (width - count * pad) / sum(min);
      if (k < 1) size = Math.max(5, Math.floor(base * k * 2) / 2);
      const f = size ? size / base : 1;
      for (let i = 0; i < count; i++) { min[i] *= f; max[i] *= f; }
    }
    const lo = min.map((m) => m + pad);
    const hi = max.map((m) => m + pad);
    let w;
    if (sum(hi) <= width) w = hi.map((m) => m * (width / sum(hi)));
    else if (sum(lo) <= width) {
      const extra = width - sum(lo);
      const room = sum(hi) - sum(lo) || 1;
      w = lo.map((m, i) => m + extra * ((hi[i] - lo[i]) / room));
    } else w = lo;
    const total = sum(w);
    const widths = w.map((x) => Math.round((x / total) * 10000) / 100);
    return { widths, tight: pad < 20, size };
  }

  // Les blocs en HTML du document.
  function render(blocks) {
    let out = '';
    let lists = []; // [tag, niveau]
    const closeLists = (level) => { while (lists.length && lists[lists.length - 1][1] >= level) out += `</li></${lists.pop()[0]}>`; };
    const br = (h) => h.replace(/\n/g, '<br>');
    for (const b of blocks) {
      if (b.type === 'li') {
        const level = Math.min(b.level || 0, lists.length);
        if (b.cont && lists.length) { out += ' ' + br(b.html); continue; }
        closeLists(level + 1);
        const top = lists[lists.length - 1];
        if (top && top[1] === level && top[0] === b.list) out += '</li><li>';
        else {
          if (top && top[1] === level) closeLists(level);
          out += `<${b.list}><li>`;
          lists.push([b.list, level]);
        }
        out += br(b.html);
        continue;
      }
      closeLists(0);
      if (b.type === 'img') {
        out += b.html;
      } else if (b.type === 'table') {
        const head = b.rows[0].length && b.rows[0].every((c) => c.head);
        const spans = (c) => (c.rs > 1 ? ` rowspan="${c.rs}"` : '') + (c.cs > 1 ? ` colspan="${c.cs}"` : '');
        const fit = columnWidths(b.rows);
        out += `<table class="ft-table" data-paste="1"${head ? ' data-header="oui"' : ''}${fit && fit.tight ? ' data-fit-pad="serre"' : ''}${fit && fit.size ? ` data-fit-size="${fit.size}"` : ''}>`
          + (fit ? '<colgroup>' + fit.widths.map((w) => `<col style="width: ${w}%">`).join('') + '</colgroup>' : '')
          + '<tbody>'
          + b.rows.map((r) => '<tr>' + r.map((c) => `<td${spans(c)}>${br(c.html) || '<br>'}</td>`).join('') + '</tr>').join('')
          + '</tbody></table>';
      } else if (b.type === 'math') {
        out += b.html;
      } else {
        out += `<${b.type}>${br(b.html)}</${b.type}>`;
      }
    }
    closeLists(0);
    // Notes : appels numérotés dans l'ordre (notes.js les renumérote dans le document) et blocs des notes.
    const used = { fn: [], en: [] };
    const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    out = out.replace(NOTE, (m, i) => {
      const n = notes[i];
      if (!n) return '';
      const id = (n.kind === 'en' ? 'e' : 'n') + Math.random().toString(36).slice(2, 9);
      const list = used[n.kind === 'en' ? 'en' : 'fn'];
      list.push({ ...n, id });
      return n.kind === 'en'
        ? `<sup class="ft-en-ref" data-en="${id}" contenteditable="false">${list.length}</sup>`
        : `<sup class="ft-fn-ref" data-fn="${id}" contenteditable="false">${list.length}</sup>`;
    });
    const items = (list, key) => list.map((n) => `<li data-${key}="${n.id}"${!n.html && n.url ? ` data-paste-url="${attr(n.url + '#' + n.frag)}"` : ''}>${n.html || '<p><br></p>'}</li>`).join('');
    if (used.en.length) out += `<div class="ft-endnotes"><div class="ft-endnotes-title" contenteditable="false">Notes</div><ol>${items(used.en, 'en')}</ol></div>`;
    if (used.fn.length) out += `<div class="ft-footnotes"><ol>${items(used.fn, 'fn')}</ol></div>`;
    return out.replace(TOKEN, (m, i) => formulas[i] || '');
  }

  // Texte d'une note relue sur une page (notes-collage.js) : ses paragraphes, nettoyés comme un collage.
  function noteHtml(box) {
    const doc = new DOMParser().parseFromString('<body></body>', 'text/html');
    doc.body.append(doc.importNode(box, true));
    const opts = { lines: false, spaces: true, inline: loadPrefs().inline !== false, structure: true };
    return noteParas(blocksFromHtml(doc, opts)).replace(NOTE, '').replace(TOKEN, (m, i) => formulas[i] || '');
  }

  // ----- Insertion dans le document -----

  const BLOCK_SEL = 'p, h1, h2, h3, h4, h5, h6, li, div:not(#editor)';

  function insertHtml(html, range) {
    const S = window.FTStructure;
    const frag = document.createRange().createContextualFragment(html);
    if (!frag.childNodes.length) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (window.FTHistory) window.FTHistory.commit();
    const run = (fn) => (window.FTPages ? window.FTPages.bare(fn) : fn());
    run(() => {
      const r = sel.getRangeAt(0);
      if (!r.collapsed) r.deleteContents();
      const at = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
      const cell = at.closest('td, th, .ft-caption, figcaption');
      const block = at.closest(BLOCK_SEL);
      const blocks = [...frag.childNodes];
      const inlineOf = (b) => {
        if (b.tagName === 'TABLE') return [...b.rows].map((tr) => [...tr.cells].map((c) => c.textContent).join(' – ')).join('\n');
        if (/^(UL|OL)$/.test(b.tagName)) return [...b.querySelectorAll('li')].map((li) => li.firstChild ? li.firstChild.textContent || '' : '').join('\n');
        return null;
      };
      // Une seule ligne de texte, ou une cellule de tableau : le texte entre à l'endroit du curseur.
      const single = blocks.length === 1 && blocks[0].tagName === 'P';
      if (single || cell) {
        const nodes = [];
        blocks.forEach((b, i) => {
          if (i) nodes.push(document.createElement('br'));
          const text = inlineOf(b);
          if (text !== null) text.split('\n').forEach((t, k) => { if (k) nodes.push(document.createElement('br')); nodes.push(document.createTextNode(t)); });
          else nodes.push(...b.childNodes);
        });
        const f = document.createDocumentFragment();
        f.append(...nodes);
        const last = f.lastChild;
        r.insertNode(f);
        if (last) { r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
        return;
      }
      // Plusieurs blocs : le bloc du curseur est coupé en deux ; le premier paragraphe collé rejoint son
      // début, le dernier rejoint sa fin, les autres s'intercalent.
      let head = block && editor.contains(block) ? block : null;
      if (!head) {
        head = document.createElement('p');
        r.insertNode(head);
      }
      if (head.tagName === 'LI') {
        // Dans une liste : chaque ligne collée devient une ligne de la liste.
        const lines = blocks.flatMap((b) => (/^(UL|OL)$/.test(b.tagName) ? [...b.querySelectorAll('li')] : [b]));
        const tail = document.createRange();
        tail.setStart(r.startContainer, r.startOffset);
        tail.setEnd(head, head.childNodes.length);
        const rest = tail.extractContents();
        let li = head;
        lines.forEach((b, i) => {
          const kids = b.tagName === 'LI' ? [...b.childNodes].filter((c) => !(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName))) : b.tagName === 'TABLE' ? [document.createTextNode(inlineOf(b).replace(/\n/g, ' '))] : [...b.childNodes];
          if (i) { const n = document.createElement('li'); li.after(n); li = n; }
          li.append(...kids);
        });
        const end = document.createTextNode('');
        li.append(end, ...rest.childNodes);
        placeAt(end);
        return;
      }
      const tail = document.createRange();
      tail.setStart(r.startContainer, r.startOffset);
      tail.setEnd(head, head.childNodes.length);
      const rest = tail.extractContents();
      let after = head;
      blocks.forEach((b, i) => {
        if (i === 0 && b.tagName === 'P' && head.tagName === 'P') {
          // Ligne vide (un simple <br>) : le texte collé la remplit.
          if (head.childNodes.length === 1 && head.firstChild.nodeName === 'BR') head.firstChild.remove();
          head.append(...b.childNodes);
          return;
        }
        after.after(b);
        after = b;
      });
      const restEmpty = !rest.textContent.trim() && !rest.querySelector('img, .ft-math, .ft-image');
      let caretNode = null;
      if (after.tagName === 'P' || /^H[1-6]$/.test(after.tagName)) {
        caretNode = document.createTextNode('');
        after.append(caretNode);
        if (!restEmpty) after.append(...rest.childNodes);
      } else {
        // Après un tableau ou une liste : la fin du paragraphe coupé (ou une ligne vide) pour continuer.
        const p = document.createElement(head.tagName === 'P' ? 'p' : head.tagName.toLowerCase());
        if (!restEmpty) p.append(...rest.childNodes);
        else p.appendChild(document.createElement('br'));
        after.after(p);
        caretNode = p;
      }
      if (!head.textContent && !head.querySelector('img, br, .ft-math')) {
        if (head !== after) head.remove();
      }
      placeAt(caretNode);
    });
    // Tableaux collés : style des prochains tableaux.
    for (const t of editor.querySelectorAll('table.ft-table[data-paste]')) {
      t.removeAttribute('data-paste');
      if (!S || !S.setTableLook) continue;
      const look = S.newTableLook();
      if (t.dataset.header === 'oui') look.header = true;
      // Tableau large : cases serrées et texte réduit pour tenir dans la page (paste.js).
      if (t.dataset.fitPad) look.pad = t.dataset.fitPad;
      if (t.dataset.fitSize) look.size = Number(t.dataset.fitSize);
      t.removeAttribute('data-fit-pad');
      t.removeAttribute('data-fit-size');
      S.setTableLook(t, look);
    }
    editor.dispatchEvent(new Event('input'));
  }

  function placeAt(node) {
    const sel = window.getSelection();
    const r = document.createRange();
    if (node.nodeType === Node.TEXT_NODE) r.setStart(node, node.data.length);
    else r.setStart(node, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // ----- Aperçu -----

  const opt = (id) => $(id).checked;
  const options = () => ({ lines: opt('ps-lines'), spaces: opt('ps-spaces'), inline: opt('ps-inline'), structure: opt('ps-structure') });

  function savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify({ spaces: opt('ps-spaces'), inline: opt('ps-inline'), structure: opt('ps-structure') })); } catch { /* indisponible */ }
  }
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS) || 'null') || {}; } catch { return {}; }
  }

  function preview() {
    if (!pending) return;
    const showOriginal = $('ps-tab-original').classList.contains('on');
    const box = $('ps-preview');
    if (showOriginal) {
      // L'original tel quel, avec sa mise en forme (sans scripts ni images distantes ; images déjà lues,
      // celles de Word comprises, affichées).
      if (pending.html) {
        const doc = new DOMParser().parseFromString(pending.html, 'text/html');
        doc.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach((n) => n.remove());
        doc.querySelectorAll('img').forEach((n) => { if (!/^data:image\//.test(n.getAttribute('src') || '')) n.remove(); });
        box.innerHTML = doc.body.innerHTML;
      } else {
        box.innerHTML = '';
        const pre = document.createElement('pre');
        pre.textContent = pending.text;
        box.append(pre);
      }
    } else {
      box.innerHTML = render(build(pending, options()));
    }
    box.classList.toggle('original', showOriginal);
  }

  // insert(html, raw) : insertion faite par le nouveau moteur (raw : collage sans nettoyage).
  function ask(source, range, insert) {
    pending = { ...source, range, insert };
    const prefs = loadPrefs();
    const lines = (source.html ? '' : source.text).split(/\r?\n/);
    $('ps-lines').checked = source.html ? /<br/i.test(source.html) && looksWrapped(source.html.split(/<br[^>]*>/i).map((l) => l.replace(/<[^>]+>/g, ''))) : looksWrapped(lines);
    $('ps-spaces').checked = prefs.spaces !== false;
    $('ps-inline').checked = prefs.inline !== false;
    $('ps-structure').checked = prefs.structure !== false;
    $('ps-from').textContent = source.html ? (/urn:schemas-microsoft-com:office|class="?Mso/i.test(source.html) ? 'Texte venu de Word' : 'Texte venu d’une page web ou d’un autre logiciel') : 'Texte brut (PDF, bloc-notes…)';
    $('ps-tab-clean').classList.add('on');
    $('ps-tab-original').classList.remove('on');
    preview();
    if (!dialog.open) dialog.showModal();
    $('ps-ok').focus();
  }

  function finish(mode) {
    const p = pending;
    pending = null;
    dialog.close();
    if (!p) return;
    if (p.insert) {
      if (mode === 'clean') { savePrefs(); p.insert(render(build(p, options())), false); }
      else if (mode === 'raw') p.insert(p.html ? rawHtml(p.html) : '', true);
      else if (window.FTMoteur) window.FTMoteur.view.focus();
      return;
    }
    editor.focus({ preventScroll: true });
    if (mode === 'clean') {
      savePrefs();
      insertHtml(render(build(p, options())), p.range);
    } else if (mode === 'raw') {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(p.range);
      if (p.html) document.execCommand('insertHTML', false, rawHtml(p.html));
      else document.execCommand('insertText', false, p.text);
    } else {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(p.range);
    }
  }

  // Collage tel quel. Hors ligne : les images d'un site (adresse distante) ne s'afficheraient pas.
  function rawHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, meta, link, iframe, object, embed').forEach((n) => n.remove());
    doc.querySelectorAll('img').forEach((n) => { if (!/^data:/.test(n.getAttribute('src') || '')) n.remove(); });
    return doc.body.innerHTML;
  }

  $('ps-ok').addEventListener('click', () => finish('clean'));
  $('ps-raw').addEventListener('click', () => finish('raw'));
  $('ps-cancel').addEventListener('click', () => finish('cancel'));
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish('cancel'); });
  for (const id of ['ps-lines', 'ps-spaces', 'ps-inline', 'ps-structure']) $(id).addEventListener('change', () => { savePrefs(); preview(); });
  for (const id of ['ps-tab-clean', 'ps-tab-original']) {
    $(id).addEventListener('click', () => {
      $('ps-tab-clean').classList.toggle('on', id === 'ps-tab-clean');
      $('ps-tab-original').classList.toggle('on', id === 'ps-tab-original');
      preview();
    });
  }

  // ----- Collage -----

  // Copie depuis le document : on garde son texte pour reconnaître le collage qui suit.
  const remember = () => {
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) lastCopy = squash(sel.toString());
  };
  document.addEventListener('copy', remember, true);
  document.addEventListener('cut', remember, true);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') plainUntil = Date.now() + 1000;
  }, true);

  editor.addEventListener('paste', (e) => {
    if (e.defaultPrevented) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const text = cd.getData('text/plain') || '';
    let html = cd.getData('text/html') || '';
    if (!text.trim() && !html) return;
    if ([...cd.files].length && !text.trim()) return; // image seule (layout.js)
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const at = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
    if (at.closest('.ft-math, math-field, .ft-toc, .ft-lof, .ft-index')) return;
    // Copié dans le document : collage habituel (le navigateur garde sa mise en forme).
    if (lastCopy !== null && squash(text) === lastCopy) return;
    const plain = Date.now() < plainUntil;
    if (plain) html = '';
    // Fragment HTML sans balise utile (simple texte) : traité comme du texte.
    if (html && !/<(p|div|br|li|h[1-6]|table|b|strong|i|em|u|a|span|font)\b/i.test(html)) html = '';
    e.preventDefault();
    const range = sel.getRangeAt(0).cloneRange();
    const source = { html, text };
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim()).length;
    if (plain || (lines <= 1 && text.length < SHORT)) {
      const prefs = loadPrefs();
      const opts = { lines: true, spaces: prefs.spaces !== false, inline: !plain && prefs.inline !== false, structure: !plain && prefs.structure !== false };
      insertHtml(render(build(source, opts)), range);
      return;
    }
    ask(source, range);
  });

  // Images d'un texte collé (version 2.5) : chaque source (fichier temporaire de Word, adresse d'une page web)
  // est lue en données, pour que l'image reste dans le document ; taille d'origine notée (data-nw, data-nh),
  // très grandes images réduites. Les images illisibles sont retirées.
  // Word : chaque image y est décrite deux fois, en VML (<v:imagedata src> : le fichier d'origine, en pleine
  // taille) puis par une <img> de secours (copie réduite, parfois une simple vignette), reliées par le nom de
  // la forme (v:shapes). L'original est lu d'abord ; une forme sans <img> de secours en reçoit une.
  function wordOriginals(doc) {
    const originals = new Map();
    const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_COMMENT);
    const vml = [];
    for (let c = walker.nextNode(); c; c = walker.nextNode()) if (/^\[if gte vml 1\]>/.test(c.data) && /<v:imagedata\b/i.test(c.data)) vml.push(c);
    for (const c of vml) {
      for (const m of c.data.matchAll(/<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/gi)) {
        const id = /\bid="([^"]+)"/i.exec(m[1]);
        const src = /<v:imagedata\b[^>]*?\bsrc="([^"]+)"/i.exec(m[2]);
        if (!src) continue;
        const style = (/\bstyle='([^']*)'|\bstyle="([^"]*)"/i.exec(m[1]) || []).slice(1).join('');
        const name = id ? id[1] : '';
        if (name) originals.set(name, src[1]);
        // (Forme sans <img> de secours après elle : image ajoutée à sa place, à sa taille.)
        let n = c.nextSibling;
        while (n && n.nodeType === 3 && !n.data.trim()) n = n.nextSibling;
        const fallback = n && n.nodeType === 8 && /^\[if !vml\]/.test(n.data);
        if (fallback || (name && doc.querySelector(`img[v\\:shapes~="${CSS.escape(name)}"]`))) continue;
        const img = doc.createElement('img');
        img.setAttribute('src', src[1]);
        const pt = (k) => { const v = new RegExp('(?:^|;)\\s*' + k + ':\\s*([\\d.]+)pt', 'i').exec(style); return v ? Math.round(Number(v[1]) * 4 / 3) : 0; };
        if (pt('width')) img.setAttribute('width', String(pt('width')));
        if (pt('height')) img.setAttribute('height', String(pt('height')));
        if (/position:\s*absolute/i.test(style)) img.setAttribute('align', /mso-position-horizontal:\s*right/i.test(style) ? 'right' : 'left');
        if (name) img.setAttribute('v:shapes', name);
        c.after(img);
      }
    }
    // Document Word réglé pour « s'appuyer sur VML » (<o:RelyOnVML/>) : les formes sont écrites telles quelles
    // dans la page, sans commentaire ni <img> de secours. Chaque image devient une <img> à sa place (sauf
    // l'image de secours d'une équation, reprise par formules-collage.js).
    const eq = [];
    const cw = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_COMMENT);
    for (let c = cw.nextNode(), open = null; c; c = cw.nextNode()) {
      if (/^\[if !msEquation\]/.test(c.data)) open = c;
      else if (open && /^\[endif\]/.test(c.data)) { eq.push([open, c]); open = null; }
    }
    const inEquation = (n) => eq.some(([a, b]) => (a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && (n.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    for (const data of [...doc.querySelectorAll('v\\:imagedata')]) {
      const shape = data.closest('v\\:shape');
      const src = data.getAttribute('src');
      if (!shape || !src || inEquation(shape)) continue;
      const name = shape.getAttribute('id') || '';
      if (name) originals.set(name, src);
      if (name && doc.querySelector(`img[v\\:shapes~="${CSS.escape(name)}"]`)) { shape.remove(); continue; }
      const style = shape.getAttribute('style') || '';
      const img = doc.createElement('img');
      img.setAttribute('src', src);
      const pt = (k) => { const v = new RegExp('(?:^|;)\\s*' + k + ':\\s*([\\d.]+)pt', 'i').exec(style); return v ? Math.round(Number(v[1]) * 4 / 3) : 0; };
      if (pt('width')) img.setAttribute('width', String(pt('width')));
      if (pt('height')) img.setAttribute('height', String(pt('height')));
      let after = false;
      if (/position:\s*absolute/i.test(style)) {
        // Image posée sur la page : à côté du texte (habillage carré, étroit ou traversant, sur un côté, s'il reste
        // de la place), sinon seule sur sa ligne, centrée si elle l'est dans Word. Descendue sous le début de
        // son paragraphe (marge du haut d'une ligne au moins) : placée après ce paragraphe, comme dans Word.
        const h = (/mso-position-horizontal:\s*(\w+)/i.exec(style) || [])[1] || '';
        const wrap = shape.querySelector('w\\:wrap');
        const room = !pt('width') || pt('width') <= 360;
        const beside = room && h !== 'center' && /^(square|tight|through)$/i.test((wrap && wrap.getAttribute('type')) || '');
        img.setAttribute('align', beside ? (h === 'right' || h === 'outside' ? 'right' : 'left') : h === 'center' ? 'center' : h === 'right' ? 'right' : 'left');
        const top = /(?:^|;)\s*margin-top:\s*([\d.]+)pt/i.exec(style);
        const rel = (/mso-position-vertical-relative:\s*([\w-]+)/i.exec(style) || [])[1] || 'text';
        after = !beside && top && Number(top[1]) >= 14 && /^(text|paragraph|line)$/i.test(rel);
      }
      if (name) img.setAttribute('v:shapes', name);
      const para = after && shape.closest('p, li, h1, h2, h3, h4, h5, h6');
      if (para) { shape.remove(); para.after(img); } else shape.replaceWith(img);
    }
    return originals;
  }

  async function resolveImages(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const originals = /urn:schemas-microsoft-com:vml|<v:imagedata/i.test(html) ? wordOriginals(doc) : new Map();
    const imgs = [...doc.querySelectorAll('img')];
    imgs.slice(60).forEach((img) => img.remove());
    const api = window.frameText;
    const load = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    // (Image d'une équation, Wikipédia… : laissée telle quelle, formules-collage.js en reprend le code.)
    const MATH_IMG = 'img.tex, img.latex, img[src*="latex"], img[src*="codecogs"], img.mwe-math-fallback-image-inline, img.mwe-math-fallback-image-display';
    await Promise.all(imgs.slice(0, 60).map(async (img) => {
      if (img.matches(MATH_IMG) && /[\\^_{}=]/.test(img.getAttribute('alt') || '')) return;
      const read = async (s) => {
        if (!/^data:image\//.test(s)) s = /^(https?|file):/i.test(s) && api && api.pasteImage ? await api.pasteImage(s).catch(() => null) : null;
        // (Word marque parfois « image/emf » une image qui est en fait un PNG ou un JPEG : type rectifié.)
        const kind = s && /^data:image\/[^;,]+;base64,(iVBOR|\/9j\/|R0lG)/.exec(s);
        if (kind) s = s.replace(/^data:image\/[^;,]+/, 'data:image/' + { iVBOR: 'png', '/9j/': 'jpeg', R0lG: 'gif' }[kind[1]]);
        const im = s && await load(s);
        return im && im.naturalWidth ? [s, im] : [null, null];
      };
      const own = img.getAttribute('src') || '';
      const first = originals.get((img.getAttribute('v:shapes') || '').split(/\s+/)[0]);
      let [src, im] = first && first !== own ? await read(first) : [null, null];
      if (!im) [src, im] = await read(own);
      if (!im || !im.naturalWidth) { img.remove(); return; }
      let w = im.naturalWidth;
      let h = im.naturalHeight;
      if (w > 1800) {
        const k = 1800 / w;
        const c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        src = /^data:image\/(png|gif|webp)/.test(src) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
        w = c.width;
        h = c.height;
      }
      img.setAttribute('src', src);
      img.setAttribute('data-nw', String(w));
      img.setAttribute('data-nh', String(h));
    }));
    return '<html><body>' + doc.body.innerHTML + '</body></html>';
  }

  window.FTPaste = { build, render, looksWrapped, joinLines, open: ask, prefs: loadPrefs, resolveImages, noteHtml };
})();
