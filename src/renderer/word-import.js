// Import Word (.docx) : le fichier (une archive zip de fichiers XML) est lu ici, sans bibliothèque :
// l'archive est ouverte à la main et décompressée par le navigateur (DecompressionStream).
// Repris : titres, paragraphes et leur alignement, gras, italique, souligné, barré, petites
// capitales, exposant/indice, police, taille, couleur, surlignage, listes (tirets, numéros, chiffres
// romains, lettres, escalier), tableaux (cellules fusionnées, largeur des colonnes, ligne d'en-tête),
// images, liens, notes de bas de page et de fin (rangées avec les notes du logiciel), citations
// (en encadré), formules (équations Word converties en LaTeX, refaites par MathLive), commentaires
// (commentaires en marge, réponses et commentaires résolus compris). Les modifications suivies restent
// à relire : le texte arrive avec les modifications, et le suivi des modifications du logiciel part du
// texte d'avant (deuxième lecture du fichier, sans les ajouts et avec les suppressions).
(function () {
  // ----- Archive zip -----

  async function unzip(buffer) {
    const dv = new DataView(buffer);
    let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error("ce fichier n'est pas un document Word (.docx)");
    const count = dv.getUint16(end + 10, true);
    let off = dv.getUint32(end + 16, true);
    const files = new Map();
    const utf8 = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const size = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      const name = utf8.decode(new Uint8Array(buffer, off + 46, nameLen));
      files.set(name.replace(/^\/+/, ''), { method, size, local });
      off += 46 + nameLen + extraLen + commentLen;
    }
    async function bytes(name) {
      const f = files.get(name);
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const data = new Uint8Array(buffer, start, f.size);
      if (f.method === 0) return data.slice();
      if (f.method !== 8) return null;
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return {
      bytes,
      async xml(name) {
        const b = await bytes(name);
        if (!b) return null;
        const doc = new DOMParser().parseFromString(utf8.decode(b), 'application/xml');
        return doc.querySelector('parsererror') ? null : doc;
      }
    };
  }

  // ----- Outils XML -----

  const kids = (el, name) => (el ? [...el.children].filter((c) => !name || c.localName === name) : []);
  const kid = (el, name) => (el ? [...el.children].find((c) => c.localName === name) || null : null);
  const val = (el, attr = 'val') => (el ? el.getAttribute('w:' + attr) : null);
  // Une propriété oui/non de Word : <w:b/> = oui, <w:b w:val="0"/> = non.
  const flag = (pr, name) => {
    const el = kid(pr, name);
    if (!el) return undefined;
    const v = val(el);
    return !(v === '0' || v === 'false' || v === 'none');
  };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const HIGHLIGHT = {
    yellow: 'rgba(255, 221, 0, 0.45)', green: 'rgba(80, 220, 100, 0.4)', cyan: 'rgba(70, 170, 255, 0.4)', blue: 'rgba(70, 170, 255, 0.4)',
    magenta: 'rgba(255, 105, 180, 0.4)', red: 'rgba(255, 105, 180, 0.4)', darkYellow: 'rgba(255, 150, 40, 0.45)', darkMagenta: 'rgba(170, 110, 255, 0.4)',
    lightGray: 'rgba(255, 221, 0, 0.45)', darkGray: 'rgba(170, 110, 255, 0.4)', darkBlue: 'rgba(70, 170, 255, 0.4)', darkCyan: 'rgba(70, 170, 255, 0.4)', darkGreen: 'rgba(80, 220, 100, 0.4)', darkRed: 'rgba(255, 105, 180, 0.4)'
  };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' };

  // ----- Conversion -----

  async function convert(buffer, fileName) {
    const zip = await unzip(buffer);
    const docXml = await zip.xml('word/document.xml');
    if (!docXml) throw new Error("ce fichier n'est pas un document Word (.docx)");
    const rels = await readRels(zip, 'word/_rels/document.xml.rels');
    const styles = readStyles(await zip.xml('word/styles.xml'));
    const numbering = readNumbering(await zip.xml('word/numbering.xml'));
    const notes = new Map();
    for (const [file, tag] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']]) {
      const xml = await zip.xml(file);
      if (!xml) continue;
      const noteRels = await readRels(zip, file.replace('word/', 'word/_rels/') + '.rels');
      for (const n of xml.documentElement.children) {
        if (n.localName !== tag || val(n, 'type')) continue; // séparateurs
        notes.set(tag + ':' + val(n, 'id'), { body: n, rels: noteRels });
      }
    }
    const core = await zip.xml('docProps/core.xml');
    let title = core ? (core.getElementsByTagName('dc:title')[0] || {}).textContent || '' : '';

    const body = kid(docXml.documentElement, 'body');
    const sect = kid(body, 'sectPr');
    const pg = kid(sect, 'pgSz');
    const mar = kid(sect, 'pgMar');
    const textTwips = (pg ? +val(pg, 'w') || 11906 : 11906) - (mar ? (+val(mar, 'left') || 1417) + (+val(mar, 'right') || 1417) : 2834);

    const comments = await readComments(zip);
    const ctx = { zip, rels, styles, numbering, notes, textTwips, noteList: [], noteIds: new Map(), images: new Map(), warnings: new Set(), view: 'after', comments, open: [] };
    ctx.base = commonLook(body, ctx);

    // Le premier paragraphe en style « Titre » (Title), ou celui qui répète le titre du fichier,
    // devient le bloc « Titre du document » en tête du texte ; il donne aussi son nom au document.
    const blocks = [];
    let head = '';
    for (const el of kids(body)) {
      if (el.localName === 'p' && !blocks.length && !head) {
        const style = styles.get(val(kid(kid(el, 'pPr'), 'pStyle')));
        const text = textOf(el).trim();
        if (text && ((style && style.kind === 'title') || (title && text === title.trim()))) {
          head = text;
          if (!title) title = text;
          continue;
        }
      }
      blocks.push(el);
    }
    const whole = async (c) => {
      let html = await blocksHtml(blocks, c, c.rels);
      if (head) html = `<h1 class="ft-title">${esc(head)}</h1>` + html;
      if (c.noteList.length) {
        html += '<div class="ft-footnotes"><ol>' + c.noteList.map((n) => `<li data-fn="${n.id}">${n.html || '<br>'}</li>`).join('') + '</ol></div>';
      }
      return html.trim() ? html : '<p><br></p>';
    };
    const html = await whole(ctx);
    // Modifications suivies : le texte d'avant (ajouts retirés, suppressions remises), pour le suivi.
    const revisions = body.getElementsByTagName('w:ins').length + body.getElementsByTagName('w:del').length +
      body.getElementsByTagName('w:moveFrom').length + body.getElementsByTagName('w:moveTo').length;
    const before = revisions ? await whole({ ...ctx, view: 'before', noteList: [], open: [] }) : null;
    // Fils de commentaires dont le passage est dans le texte, dans l'ordre du texte.
    const threads = [...ctx.comments.used || []].map((id) => ctx.comments.threads.get(id)).filter(Boolean);
    title = title.trim() || String(fileName || 'Document Word').replace(/\.docx$/i, '');
    return { title, html, before, comments: threads, warnings: [...ctx.warnings] };
  }

  // Commentaires Word : leur texte (comments.xml), leurs réponses et leur état résolu (commentsExtended.xml).
  // Une réponse est rattachée au premier commentaire du fil ; son passage (le même) est ignoré.
  async function readComments(zip) {
    const threads = new Map(); // id Word du commentaire de tête → fil du logiciel
    const xml = await zip.xml('word/comments.xml');
    if (!xml) return { threads, rootOf: new Map() };
    const ext = await zip.xml('word/commentsExtended.xml');
    const info = new Map(); // paraId → { parent, done }
    if (ext) {
      for (const c of ext.documentElement.children) {
        if (c.localName !== 'commentEx') continue;
        info.set(c.getAttribute('w15:paraId'), { parent: c.getAttribute('w15:paraIdParent'), done: c.getAttribute('w15:done') === '1' });
      }
    }
    const list = [];
    const byPara = new Map();
    for (const c of xml.documentElement.children) {
      if (c.localName !== 'comment') continue;
      const paras = kids(c, 'p');
      const text = paras.map((p) => textOf(p)).join('\n').replace(/\u0005/g, '').trim();
      const last = paras[paras.length - 1];
      const paraId = last ? last.getAttribute('w14:paraId') : null;
      const item = { id: val(c, 'id'), author: (val(c, 'author') || 'Auteur').slice(0, 60), date: val(c, 'date') || '', text, paraId };
      list.push(item);
      if (paraId) byPara.set(paraId, item);
    }
    const rootOf = new Map(); // id Word → id Word du commentaire de tête
    const headOf = (item) => {
      let it = item;
      for (let i = 0; i < 20; i++) {
        const e = it.paraId && info.get(it.paraId);
        const parent = e && e.parent && byPara.get(e.parent);
        if (!parent || parent === it) break;
        it = parent;
      }
      return it;
    };
    for (const item of list) {
      const head = headOf(item);
      rootOf.set(item.id, head.id);
      if (head === item) {
        const e = item.paraId && info.get(item.paraId);
        threads.set(item.id, { id: 'w' + item.id.replace(/\W/g, '') + '-' + Math.random().toString(36).slice(2, 7), author: item.author, date: item.date, text: item.text, done: !!(e && e.done), replies: [] });
      }
    }
    for (const item of list) {
      const head = rootOf.get(item.id);
      if (head !== item.id && threads.has(head)) threads.get(head).replies.push({ author: item.author, date: item.date, text: item.text });
    }
    return { threads, rootOf };
  }

  // Police, taille et couleur les plus courantes du texte (au moins 40 % des caractères).
  function commonLook(body, ctx) {
    const tally = { font: new Map(), size: new Map(), color: new Map() };
    let total = 0;
    for (const p of body.getElementsByTagName('w:p')) {
      const info = paraInfo(p, ctx);
      if (info.style && info.style.kind === 'heading') continue;
      for (const r of p.getElementsByTagName('w:r')) {
        const n = textOf(r).length;
        if (!n) continue;
        const props = runStyle(kid(r, 'rPr'), ctx, info);
        total += n;
        for (const k of ['font', 'size', 'color']) tally[k].set(props[k], (tally[k].get(props[k]) || 0) + n);
      }
    }
    const base = {};
    for (const k of ['font', 'size', 'color']) {
      let best = null;
      let count = 0;
      for (const [v, c] of tally[k]) if (v !== undefined && c > count) { best = v; count = c; }
      if (best !== null && count >= total * 0.4) base[k] = best;
    }
    return base;
  }

  async function readRels(zip, name) {
    const map = new Map();
    const xml = await zip.xml(name);
    if (!xml) return map;
    for (const r of xml.documentElement.children) {
      map.set(r.getAttribute('Id'), { target: r.getAttribute('Target') || '', external: r.getAttribute('TargetMode') === 'External' });
    }
    return map;
  }

  function textOf(el) {
    let s = '';
    for (const t of el.getElementsByTagName('w:t')) s += t.textContent;
    return s;
  }

  // Styles : leur nom, leur genre (titre de niveau n, citation…) et leurs propriétés de texte.
  function readStyles(xml) {
    const map = new Map();
    if (!xml) return map;
    for (const s of xml.documentElement.children) {
      if (s.localName !== 'style') continue;
      const id = val(s, 'styleId');
      const name = (val(kid(s, 'name')) || id || '').toLowerCase();
      const pPr = kid(s, 'pPr');
      const outline = val(kid(pPr, 'outlineLvl'));
      let kind = null;
      let level = 0;
      const m = /^(heading|titre)\s*(\d)$/.exec(name) || /^(heading|titre)(\d)$/i.exec(id || '');
      if (m) { kind = 'heading'; level = +m[2]; }
      else if (name === 'title' || name === 'titre') kind = 'title';
      else if (/quote|citation/.test(name)) kind = 'quote';
      else if (outline !== null && +outline < 9) { kind = 'heading'; level = +outline + 1; }
      map.set(id, {
        type: val(s, 'type'),
        kind,
        level,
        basedOn: val(kid(s, 'basedOn')),
        isDefault: val(s, 'default') === '1',
        name,
        rPr: kid(s, 'rPr'),
        pPr,
        numPr: kid(pPr, 'numPr')
      });
    }
    // Un style basé sur un titre est aussi un titre.
    for (const st of map.values()) {
      let base = st;
      for (let i = 0; i < 6 && !st.kind && base && base.basedOn; i++) {
        base = map.get(base.basedOn);
        if (base && base.kind) { st.kind = base.kind; st.level = base.level; }
      }
    }
    return map;
  }

  // Numérotation : pour chaque liste (numId) et chaque niveau, le genre de puce ou de numéro.
  function readNumbering(xml) {
    const abstract = new Map();
    const nums = new Map();
    if (!xml) return { level: () => null };
    for (const a of xml.documentElement.children) {
      if (a.localName !== 'abstractNum') continue;
      const levels = {};
      for (const l of kids(a, 'lvl')) levels[val(l, 'ilvl')] = { fmt: val(kid(l, 'numFmt')) || 'decimal', text: val(kid(l, 'lvlText')) || '', style: val(kid(l, 'pStyle')) };
      abstract.set(val(a, 'abstractNumId'), levels);
    }
    for (const n of xml.documentElement.children) {
      if (n.localName === 'num') nums.set(val(n, 'numId'), val(kid(n, 'abstractNumId')));
    }
    return {
      level(numId, ilvl) {
        const levels = abstract.get(nums.get(numId));
        return levels ? levels[ilvl] || levels['0'] || null : null;
      },
      // Niveau lié à un style de paragraphe (« Liste à puces 2 » → niveau 2).
      levelOfStyle(numId, styleId) {
        const levels = abstract.get(nums.get(numId)) || {};
        const found = Object.entries(levels).find(([, l]) => l.style && l.style === styleId);
        return found ? +found[0] : null;
      }
    };
  }

  // ----- Blocs -----

  function paraInfo(p, ctx) {
    const pPr = kid(p, 'pPr');
    const style = ctx.styles.get(val(kid(pPr, 'pStyle'))) || null;
    let numPr = kid(pPr, 'numPr') || (style && style.numPr) || null;
    let list = null;
    if (numPr) {
      const numId = val(kid(numPr, 'numId'));
      let ilvl = +(val(kid(numPr, 'ilvl')) || 0);
      if (!kid(numPr, 'ilvl') && style) {
        // « List Bullet 2 », « List Number 3 »… : le chiffre du style donne le niveau.
        const styleId = val(kid(pPr, 'pStyle'));
        const m = /(\d)$/.exec(styleId || '');
        if (m && +m[1] > 1) ilvl = +m[1] - 1;
        else {
          const fromStyle = ctx.numbering.levelOfStyle(numId, styleId);
          if (fromStyle !== null) ilvl = fromStyle;
        }
      }
      if (numId && numId !== '0') {
        const lvl = ctx.numbering.level(numId, String(ilvl));
        if (lvl && lvl.fmt !== 'none') list = { numId, ilvl: Math.min(ilvl, 5), fmt: lvl.fmt, text: lvl.text };
      }
    }
    const jc = val(kid(pPr, 'jc'));
    const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc] || '';
    return { pPr, style, list, align };
  }

  async function blocksHtml(blocks, ctx, rels) {
    let out = '';
    let lists = []; // listes ouvertes : [{ tag, numId }]
    const closeLists = (depth) => {
      while (lists.length > depth) {
        const l = lists.pop();
        out += `</li></${l.tag}>`;
      }
    };
    for (const el of blocks) {
      if (el.localName === 'sdt') {
        closeLists(0);
        out += await blocksHtml(kids(kid(el, 'sdtContent')), ctx, rels);
        continue;
      }
      if (el.localName === 'tbl') {
        closeLists(0);
        out += await tableHtml(el, ctx, rels);
        continue;
      }
      if (el.localName !== 'p') continue;
      // Paragraphe ajouté ou supprimé en entier (modifications suivies) : absent du texte d'avant, ou d'après.
      const markRev = kid(kid(kid(el, 'pPr'), 'rPr'), ctx.view === 'before' ? 'ins' : 'del');
      if (markRev && !visibleText(el, ctx.view)) continue;
      // Formule seule sur sa ligne : formule centrée.
      const math = displayMath(el);
      if (math) {
        closeLists(0);
        for (const m of math) out += mathHtml(m, true);
        continue;
      }
      const info = paraInfo(el, ctx);
      const inner = await runsHtml(el, ctx, rels, info);
      if (info.list && !(info.style && info.style.kind === 'heading')) {
        const depth = info.list.ilvl + 1;
        const tag = info.list.fmt === 'bullet' ? 'ul' : 'ol';
        if (lists.length > depth) closeLists(depth);
        // Une liste numérotée Word différente (autre numId) recommence sa numérotation : nouvelle liste.
        if (lists.length === depth && (lists[depth - 1].tag !== tag || (depth === 1 && tag === 'ol' && lists[0].numId !== info.list.numId))) closeLists(depth - 1);
        if (lists.length === depth) {
          out += '</li><li>';
        } else {
          while (lists.length < depth) {
            const lvl = lists.length === depth - 1 ? info.list : { fmt: info.list.fmt };
            out += `<${tag}${numAttr(lvl, lists.length)}><li>`;
            lists.push({ tag, numId: info.list.numId });
          }
        }
        out += inner || '<br>';
        continue;
      }
      closeLists(0);
      const style = info.style;
      const alignAttr = info.align ? ` style="text-align: ${info.align};"` : '';
      if (style && style.kind === 'heading') {
        const level = Math.min(5, Math.max(1, style.level));
        out += `<h${level}${alignAttr}>${inner || '<br>'}</h${level}>`;
      } else if (style && style.kind === 'quote') {
        out += `<blockquote class="ft-callout"><p${alignAttr}>${inner || '<br>'}</p></blockquote>`;
      } else {
        out += `<p${alignAttr}>${inner || '<br>'}</p>`;
      }
    }
    closeLists(0);
    // Deux encadrés de citation qui se suivent n'en font qu'un.
    return out.replace(/<\/blockquote><blockquote class="ft-callout">/g, '');
  }

  // Texte d'un paragraphe vu avant (sans les ajouts) ou après (sans les suppressions) les modifications.
  function visibleText(p, view) {
    let s = '';
    const walk = (el) => {
      for (const c of kids(el)) {
        const n = c.localName;
        if (view === 'before' ? n === 'ins' || n === 'moveTo' : n === 'del' || n === 'moveFrom') continue;
        if (n === 't' || n === 'delText') s += c.textContent;
        else if (n === 'drawing' || n === 'pict' || n === 'oMath') s += '*';
        else if (n !== 'pPr' && n !== 'rPr') walk(c);
      }
    };
    walk(p);
    return s.trim();
  }

  // Formule du logiciel (comme insert.js) : son code LaTeX et son dessin par MathLive.
  function mathHtml(latex, block) {
    let drawn = esc(latex);
    try { if (window.MathLive) drawn = window.MathLive.convertLatexToMarkup(latex, { defaultMode: block ? 'math' : 'inline-math' }); } catch { /* code gardé tel quel */ }
    return block
      ? `<div class="ft-math" contenteditable="false" data-display="block" data-latex="${esc(latex)}">${drawn}</div>`
      : `<span class="ft-math" contenteditable="false" data-latex="${esc(latex)}">${drawn}</span>`;
  }

  // Les formules d'un paragraphe qui ne contient qu'elles (m:oMathPara, ou m:oMath sans texte autour).
  function displayMath(p) {
    let maths = [];
    let other = false;
    for (const c of kids(p)) {
      const n = c.localName;
      if (n === 'oMathPara') maths.push(...kids(c, 'oMath'));
      else if (n === 'oMath') { if (!kid(p, 'oMathPara') && kids(p, 'oMath').length === 1 && kids(p).every((k) => ['pPr', 'oMath', 'bookmarkStart', 'bookmarkEnd', 'proofErr'].includes(k.localName))) maths.push(c); else other = true; }
      else if (!['pPr', 'bookmarkStart', 'bookmarkEnd', 'proofErr'].includes(n)) {
        if (n !== 'r' || textOf(c).trim() || kids(c).some((k) => !['rPr', 't'].includes(k.localName))) other = true;
      }
    }
    if (other || !maths.length) return null;
    maths = maths.map((m) => window.FTOmml.latex(m)).filter((t) => t.trim());
    return maths.length ? maths : null;
  }

  function numAttr(list, depth) {
    const fmt = list.fmt;
    if (fmt === 'lowerRoman') return ' data-num="romain-min"';
    if (fmt === 'upperRoman') return ' data-num="romain-maj"';
    if (fmt === 'lowerLetter') return ' data-num="lettre-min"';
    if (fmt === 'upperLetter') return ' data-num="lettre-maj"';
    if (fmt === 'decimal' && depth > 0 && /%1\.%2/.test(list.text || '')) return ' data-num="escalier"';
    return '';
  }

  // ----- Texte d'un paragraphe -----

  // Propriétés de texte : celles du style de caractère, puis celles posées directement.
  function runStyle(rPr, ctx, info) {
    const props = {};
    const apply = (pr) => {
      if (!pr) return;
      for (const [k, name] of [['b', 'b'], ['i', 'i'], ['strike', 'strike'], ['dstrike', 'dstrike'], ['smallCaps', 'smallCaps'], ['caps', 'caps'], ['vanish', 'vanish']]) {
        const f = flag(pr, name);
        if (f !== undefined) props[k] = f;
      }
      const u = kid(pr, 'u');
      if (u) props.u = val(u) !== 'none' && val(u) !== '0';
      const color = val(kid(pr, 'color'));
      if (color) props.color = color;
      const sz = val(kid(pr, 'sz'));
      if (sz) props.size = +sz / 2;
      const fonts = kid(pr, 'rFonts');
      if (fonts && (val(fonts, 'ascii') || val(fonts, 'hAnsi'))) props.font = val(fonts, 'ascii') || val(fonts, 'hAnsi');
      const hl = val(kid(pr, 'highlight'));
      if (hl) props.highlight = hl;
      const shd = kid(pr, 'shd');
      if (shd && val(shd, 'fill') && !/^(auto|FFFFFF)$/i.test(val(shd, 'fill'))) props.shade = val(shd, 'fill');
      const va = val(kid(pr, 'vertAlign'));
      if (va) props.vert = va;
    };
    // Style de paragraphe personnalisé (ni « Normal » ni titre) : ses gras, italique, couleur… comptent.
    const chain = (id) => {
      const list = [];
      for (let st = ctx.styles.get(id), i = 0; st && i < 8; st = ctx.styles.get(st.basedOn), i++) list.unshift(st);
      return list;
    };
    if (info && info.style && !info.style.kind && !info.style.isDefault) {
      for (const st of chain(val(kid(info.pPr, 'pStyle')))) if (!st.isDefault) apply(st.rPr);
    }
    const rStyle = val(kid(rPr, 'rStyle'));
    if (rStyle) for (const st of chain(rStyle)) apply(st.rPr);
    apply(rPr);
    return props;
  }

  function wrapText(text, props, ctx, info) {
    if (!text) return '';
    if (props.vanish) return '';
    // Police, taille et couleur du texte courant : laissées au logiciel (comme pour un texte tapé).
    // Dans les titres, leur apparence vient des styles des titres du logiciel.
    const base = ctx.base || {};
    const heading = info && info.style && info.style.kind === 'heading';
    props = { ...props };
    if (heading || props.font === base.font) delete props.font;
    if (heading || ctx.inNote || props.size === base.size) delete props.size;
    if (heading || props.color === base.color) delete props.color;
    if (heading) delete props.b;
    let html = esc(props.caps ? text.toUpperCase() : text);
    const css = [];
    if (props.b) css.push('font-weight: bold');
    if (props.i) css.push('font-style: italic');
    const deco = [props.u && 'underline', (props.strike || props.dstrike) && 'line-through'].filter(Boolean);
    if (deco.length) css.push('text-decoration-line: ' + deco.join(' '));
    if (props.smallCaps) css.push('font-variant-caps: small-caps');
    if (props.color && props.color !== 'auto' && /^[0-9a-f]{6}$/i.test(props.color) && props.color !== '000000') css.push('color: #' + props.color.toLowerCase());
    if (props.size) css.push(`font-size: ${Math.round(props.size * 2) / 2}pt`);
    if (props.font) css.push(`font-family: '${props.font.replace(/["'\\<>&]/g, '')}'`);
    const SHADES = { FFFF00: 'yellow', '00FF00': 'green', '00FFFF': 'cyan', FF00FF: 'magenta', FF0000: 'red', '0000FF': 'blue' };
    const shadeName = props.shade && SHADES[props.shade.toUpperCase()];
    const hl = props.highlight && props.highlight !== 'none' ? HIGHLIGHT[props.highlight] : shadeName ? HIGHLIGHT[shadeName] : null;
    if (hl) css.push('background-color: ' + hl);
    else if (props.shade && /^[0-9a-f]{6}$/i.test(props.shade)) css.push('background-color: #' + props.shade.toLowerCase());
    if (css.length) html = `<span style="${css.join('; ')};">${html}</span>`;
    if (props.vert === 'superscript') html = `<sup>${html}</sup>`;
    else if (props.vert === 'subscript') html = `<sub>${html}</sub>`;
    return html;
  }

  async function runsHtml(p, ctx, rels, info) {
    let out = '';
    let field = 0; // dans un champ Word : 1 = instruction (ignorée), 2 = résultat (gardé)
    let inLink = false;
    const walk = async (el) => {
      for (const node of kids(el)) {
        switch (node.localName) {
          case 'r':
            out += await runHtml(node, ctx, rels, info, () => field, (f) => { field = f; }, inLink);
            break;
          case 'hyperlink': {
            const rel = rels.get(node.getAttribute('r:id'));
            const href = rel && rel.external ? rel.target : '';
            const before = out;
            out = '';
            inLink = true;
            await walk(node);
            inLink = false;
            const inner = out;
            out = before + (/^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}">${inner}</a>` : inner);
            break;
          }
          case 'smartTag': case 'customXml': case 'fldSimple': case 'bdo': case 'dir':
            await walk(node);
            break;
          // Modifications suivies : le texte ajouté n'est lu que dans le texte d'après, le texte supprimé
          // que dans le texte d'avant.
          case 'ins': case 'moveTo':
            if (ctx.view !== 'before') await walk(node);
            break;
          case 'del': case 'moveFrom':
            if (ctx.view === 'before') await walk(node);
            break;
          case 'sdt':
            await walk(kid(node, 'sdtContent'));
            break;
          case 'commentRangeStart': {
            const head = ctx.comments.rootOf.get(val(node, 'id'));
            if (head === val(node, 'id') && ctx.comments.threads.has(head)) ctx.open.push(head);
            break;
          }
          case 'commentRangeEnd': {
            const i = ctx.open.indexOf(val(node, 'id'));
            if (i >= 0) ctx.open.splice(i, 1);
            break;
          }
          case 'pPr': case 'proofErr': case 'bookmarkStart': case 'bookmarkEnd':
            break;
          case 'oMath': case 'oMathPara':
            for (const m of node.localName === 'oMath' ? [node] : kids(node, 'oMath')) {
              const latex = window.FTOmml.latex(m);
              if (latex.trim()) out += mathHtml(latex, false);
            }
            break;
          default:
            break;
        }
      }
    };
    await walk(p);
    return out;
  }

  async function runHtml(r, ctx, rels, info, getField, setField, inLink) {
    const rPr = kid(r, 'rPr');
    const props = runStyle(rPr, ctx, info);
    // Dans un lien : la couleur et le soulignement du style « Lien » de Word sont laissés au logiciel.
    if (inLink) { delete props.color; delete props.u; }
    let out = '';
    let text = '';
    const flush = () => {
      const html = wrapText(text, props, ctx, info);
      text = '';
      if (!html) return;
      // Passage d'un commentaire Word : passage commenté du logiciel (le dernier commentaire ouvert).
      const head = ctx.open[ctx.open.length - 1];
      if (head) {
        if (ctx.view !== 'before') (ctx.comments.used || (ctx.comments.used = new Set())).add(head);
        out += `<span class="ft-comment" data-c="${esc(ctx.comments.threads.get(head).id)}">${html}</span>`;
      } else out += html;
    };
    for (const c of kids(r)) {
      const name = c.localName;
      if (name === 'fldChar') {
        const t = val(c, 'fldCharType');
        setField(t === 'begin' ? 1 : t === 'separate' ? 2 : 0);
        continue;
      }
      if (getField() === 1) continue;
      if (name === 't' || name === 'delText') text += c.textContent;
      else if (name === 'tab' || name === 'ptab') text += '\u2003';
      else if (name === 'noBreakHyphen') text += '\u2011';
      else if (name === 'softHyphen') text += '\u00ad';
      else if (name === 'sym') {
        let code = parseInt(val(c, 'char') || '20', 16) || 32;
        if (code >= 0xf000) code -= 0xf000; // police Symbol : caractères rangés à partir de F000
        text += String.fromCharCode(code);
      }
      else if (name === 'br' || name === 'cr') {
        if (val(c, 'type') === 'page' || val(c, 'type') === 'column') continue;
        flush();
        out += '<br>';
      } else if (name === 'drawing' || name === 'pict' || name === 'object') {
        flush();
        out += await imageHtml(c, ctx, rels);
      } else if (name === 'footnoteReference' || name === 'endnoteReference') {
        flush();
        out += await noteRef(name === 'footnoteReference' ? 'footnote' : 'endnote', val(c, 'id'), ctx);
      }
    }
    flush();
    return out;
  }

  async function noteRef(kind, id, ctx) {
    const note = ctx.notes.get(kind + ':' + id);
    if (!note) return '';
    // Même identifiant de note dans les deux lectures du fichier (texte d'après, texte d'avant).
    let fn = ctx.noteIds.get(kind + ':' + id);
    if (!fn) ctx.noteIds.set(kind + ':' + id, (fn = 'n' + Math.random().toString(36).slice(2, 9)));
    const entry = { id: fn, html: '' };
    ctx.noteList.push(entry);
    // Le texte de la note, sur une ligne (ses paragraphes séparés par des retours à la ligne).
    const parts = [];
    ctx.inNote = true; // les notes ont la taille des notes du logiciel
    for (const p of note.body.getElementsByTagName('w:p')) {
      const html = (await runsHtml(p, ctx, note.rels, paraInfo(p, ctx))).trim();
      if (html) parts.push(html);
    }
    ctx.inNote = false;
    entry.html = parts.join('<br>').replace(/^(\s|\u2003)+/, '');
    return `<sup class="ft-fn-ref" data-fn="${fn}" contenteditable="false">${ctx.noteList.length}</sup>`;
  }

  // ----- Images -----

  async function imageHtml(el, ctx, rels) {
    const blip = el.getElementsByTagName('a:blip')[0];
    const imageData = el.getElementsByTagName('v:imagedata')[0];
    const id = blip ? blip.getAttribute('r:embed') : imageData ? imageData.getAttribute('r:id') : null;
    const rel = id && rels.get(id);
    if (!rel || rel.external) return '';
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target.replace(/^\.\//, '');
    const ext = path.split('.').pop().toLowerCase();
    const mime = MIME[ext];
    if (!mime) {
      ctx.warnings.add('images');
      return '';
    }
    let src = ctx.images.get(path);
    if (!src) {
      const bytes = await ctx.zip.bytes(path);
      if (!bytes) return '';
      src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(new Blob([bytes], { type: mime }));
      });
      ctx.images.set(path, src);
    }
    const extent = el.getElementsByTagName('wp:extent')[0];
    let pct = 50;
    if (extent) {
      const px = +extent.getAttribute('cx') / 9525;
      const full = ctx.textTwips / 15;
      if (px > 0 && full > 0) pct = Math.max(5, Math.min(100, Math.round((px / full) * 100)));
    }
    const anchor = el.getElementsByTagName('wp:anchor')[0];
    let wrap = '';
    if (anchor) {
      const side = anchor.getElementsByTagName('wp:wrapSquare')[0] || anchor.getElementsByTagName('wp:wrapTight')[0];
      const pos = anchor.getElementsByTagName('wp:align')[0];
      if (side) wrap = pos && /right/.test(pos.textContent) ? ' data-wrap="droite"' : ' data-wrap="gauche"';
    }
    return `<span class="ft-image" contenteditable="false"${wrap} style="width: ${pct}%;"><img src="${src}" alt=""></span>`;
  }

  // ----- Tableaux -----

  async function tableHtml(tbl, ctx, rels) {
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => +val(g, 'w') || 0);
    const total = grid.reduce((a, b) => a + b, 0);
    const rows = kids(tbl, 'tr');
    const look = kid(kid(tbl, 'tblPr'), 'tblLook');
    const lookFirst = look ? (val(look, 'firstRow') === '1' || (parseInt(val(look) || '0', 16) & 0x20) !== 0) : false;
    const repeatRow = rows.length > 1 && !!kid(kid(rows[0], 'trPr'), 'tblHeader');
    const headerRow = rows.length > 1 && (lookFirst || repeatRow);
    // Cellules fusionnées verticalement : la première reçoit le nombre de lignes couvertes.
    const matrix = [];
    for (const tr of rows) {
      const cells = [];
      let col = 0;
      for (const tc of kids(tr).flatMap((c) => (c.localName === 'sdt' ? kids(kid(c, 'sdtContent'), 'tc') : c.localName === 'tc' ? [c] : []))) {
        const tcPr = kid(tc, 'tcPr');
        const span = +(val(kid(tcPr, 'gridSpan')) || 1);
        const vm = kid(tcPr, 'vMerge');
        const merge = vm ? (val(vm) === 'restart' ? 'start' : 'cont') : null;
        cells.push({ tc, col, span, merge, rowspan: 1 });
        col += span;
      }
      matrix.push(cells);
    }
    for (let r = 0; r < matrix.length; r++) {
      for (const cell of matrix[r]) {
        if (cell.merge !== 'start') continue;
        for (let k = r + 1; k < matrix.length; k++) {
          const below = matrix[k].find((c) => c.col === cell.col);
          if (!below || below.merge !== 'cont') break;
          cell.rowspan++;
          below.skip = true;
        }
      }
    }
    let html = `<table class="ft-table" data-style="quadrille"${headerRow ? ' data-header="oui"' : ''}${repeatRow ? ' data-repeat="oui"' : ''} data-t="2">`;
    if (total > 0 && grid.length > 1) html += '<colgroup>' + grid.map((w) => `<col style="width: ${((w / total) * 100).toFixed(2)}%;">`).join('') + '</colgroup>';
    html += '<tbody>';
    for (let r = 0; r < matrix.length; r++) {
      html += '<tr>';
      for (const cell of matrix[r]) {
        if (cell.skip) continue;
        const tag = 'td';
        const valign = { center: 'milieu', bottom: 'bas' }[val(kid(kid(cell.tc, 'tcPr'), 'vAlign'))];
        const attrs = (cell.span > 1 ? ` colspan="${cell.span}"` : '') + (cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '') + (valign ? ` data-valign="${valign}"` : '');
        const parts = [];
        for (const child of kids(cell.tc)) {
          if (child.localName === 'p') {
            const info = paraInfo(child, ctx);
            parts.push(await runsHtml(child, ctx, rels, info));
          } else if (child.localName === 'tbl') {
            parts.push(esc(textOf(child)));
          }
        }
        const inner = parts.join('<br>').replace(/(<br>)+$/, '');
        html += `<${tag}${attrs}>${inner || '<br>'}</${tag}>`;
      }
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  window.FTWordImport = { convert };
})();
