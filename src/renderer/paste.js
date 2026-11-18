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

  function blocksFromText(text, opts) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\u000c/g, '\n').split('\n');
    const paras = opts.lines ? joinLines(lines) : lines.map((l) => l.trim()).filter(Boolean);
    return paras.map((p) => {
      const m = opts.structure && p.match(BULLET);
      if (m) return { type: 'li', list: ORDERED.test(p) ? 'ol' : 'ul', level: 0, html: escape(p.slice(m[0].length)) };
      return { type: 'p', html: escape(p) };
    });
  }

  // ----- HTML (page web, Word) -----

  const DROP = 'script, style, meta, link, title, head, noscript, iframe, object, embed, svg, canvas, video, audio, button, input, select, textarea, form, template, img, picture, figure > img';
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

  function blocksFromHtml(html, opts) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll(DROP).forEach((n) => n.remove());
    // Pages web (Wikipédia…) : appels de note, liens « [archive] », « [modifier] », éléments cachés.
    doc.querySelectorAll(NOISE).forEach((n) => n.remove());
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
        b.html += tags.map((m) => `<${m}>`).join('') + escape(s) + tags.slice().reverse().map((m) => `</${m.split(' ')[0]}>`).join('');
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
      if (t === 'TABLE') return table(el);
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

    for (const c of doc.body.childNodes) inline(c, []);
    // Paragraphes vides, espaces au début et à la fin.
    return blocks.filter((b) => b.type === 'table' || (b.text || '').replace(/[\s ]/g, '')).map((b) => {
      if (b.type === 'table') return b;
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
    blocks = blocks.map((b) => {
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
      blocks = blocks.flatMap((b) => (b.type === 'table'
        ? b.rows.map((r) => ({ type: 'p', html: r.map((c) => c.html.replace(/\n/g, ' ')).join(' – ') }))
        : [{ type: 'p', html: b.html }]));
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
      if (b.type === 'table') {
        const head = b.rows[0].length && b.rows[0].every((c) => c.head);
        const spans = (c) => (c.rs > 1 ? ` rowspan="${c.rs}"` : '') + (c.cs > 1 ? ` colspan="${c.cs}"` : '');
        const fit = columnWidths(b.rows);
        out += `<table class="ft-table" data-paste="1"${head ? ' data-header="oui"' : ''}${fit && fit.tight ? ' data-fit-pad="serre"' : ''}${fit && fit.size ? ` data-fit-size="${fit.size}"` : ''}>`
          + (fit ? '<colgroup>' + fit.widths.map((w) => `<col style="width: ${w}%">`).join('') + '</colgroup>' : '')
          + '<tbody>'
          + b.rows.map((r) => '<tr>' + r.map((c) => `<td${spans(c)}>${br(c.html) || '<br>'}</td>`).join('') + '</tr>').join('')
          + '</tbody></table>';
      } else {
        out += `<${b.type}>${br(b.html)}</${b.type}>`;
      }
    }
    closeLists(0);
    return out;
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
      // L'original tel quel, avec sa mise en forme (sans scripts ni images distantes).
      if (pending.html) {
        const doc = new DOMParser().parseFromString(pending.html, 'text/html');
        doc.querySelectorAll('script, style, link, meta, iframe, object, embed, img').forEach((n) => n.remove());
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

  window.FTPaste = { build, render, looksWrapped, joinLines, open: ask, prefs: loadPrefs };
})();
