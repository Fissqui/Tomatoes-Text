// Export en Word (.docx) du document ouvert, tel qu'il s'affiche : polices, couleurs, titres, listes,
// encadrés, tableaux, images, formules (en équations Word modifiables) et notes de bas de page.
// En mode avancé, l'export garde les pages : format, marges, pages tournées, en-tête, pied de page
// et numéros. La bibliothèque docx (vendor/docx, licence MIT) écrit le fichier.
(function () {
  const D = window.docx;
  let editor = document.getElementById('editor');
  let V = null; // moteur 2.0 : affichage du texte par le moteur (moteur/visibles.js)
  // Styles calculés ; un bloc du moteur placé par une marge (coupure de page) garde ses marges propres.
  const getComputedStyle = (el, pseudo) => {
    const cs = window.getComputedStyle(el, pseudo);
    const m = V && !pseudo && el.parentElement === editor ? V.marginsOf(el) : null;
    if (!m) return cs;
    return new Proxy(cs, {
      get: (t, k) => (k === 'marginTop' ? m.mt + 'px' : k === 'marginBottom' ? m.mb + 'px' : typeof t[k] === 'function' ? t[k].bind(t) : t[k])
    });
  };
  const PX = 15;                  // twips par pixel
  const MM_TW = 1440 / 25.4;      // twips par millimètre
  const EMU = 9525;               // EMU par pixel
  const tw = (px) => Math.round((parseFloat(px) || 0) * PX);

  // ----- Couleurs : toute couleur CSS devient « RRGGBB » (posée sur du blanc si elle est transparente) -----

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = 1;
  const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  function hex(css) {
    if (!css || css === 'transparent') return null;
    if (colorCache.has(css)) return colorCache.get(css);
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = css;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    const out = a < 13 ? null : [r, g, b].map((v) => Math.round(255 - (255 - v) * (a / 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
    colorCache.set(css, out);
    return out;
  }

  const GENERIC = { serif: 'Georgia', 'sans-serif': 'Arial', monospace: 'Consolas', cursive: 'Comic Sans MS', 'system-ui': 'Segoe UI' };
  // (Polices employées par le document : celles qui sont intégrées au logiciel sont jointes au fichier.)
  let usedFonts = new Set();
  function family(css) {
    const first = (css || '').split(',')[0].replace(/["']/g, '').trim();
    const name = GENERIC[first] || first || 'Georgia';
    usedFonts.add(name);
    return name;
  }

  const isInlineDisplay = (el) => getComputedStyle(el).display.startsWith('inline');
  let lastZone = null;
  const isGap = (el) => el.classList && el.classList.contains('ft-pg-gap');

  // ----- Texte -----

  // Mise en forme d'un morceau de texte, d'après ce qui est affiché.
  function runProps(el) {
    const cs = getComputedStyle(el);
    let size = parseFloat(cs.fontSize);
    const props = {
      font: family(cs.fontFamily),
      bold: parseInt(cs.fontWeight, 10) >= 600,
      italics: cs.fontStyle !== 'normal',
      color: hex(cs.color) || undefined
    };
    // Appels de citation, de note de fin et renvois : couleur du texte autour, pas celle de l'écran.
    const call = el.closest && el.closest('.ft-cite, sup.ft-en-ref, span.ft-xref');
    if (call) {
      props.color = hex(getComputedStyle(call.parentElement).color) || undefined;
      props.bold = parseInt(getComputedStyle(call.parentElement).fontWeight, 10) >= 600;
    }
    for (let n = el; n && n !== editor; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.textDecorationLine.includes('underline')) props.underline = { type: D.UnderlineType.SINGLE };
      if (c.textDecorationLine.includes('line-through')) props.strike = true;
      const inline = c.display.startsWith('inline');
      if (inline && (c.verticalAlign === 'super' || c.verticalAlign === 'sub') && !props.superScript && !props.subScript) {
        props[c.verticalAlign === 'super' ? 'superScript' : 'subScript'] = true;
        // Word réduit lui-même la taille des exposants : on part de celle du texte autour.
        if (n.parentElement) size = parseFloat(getComputedStyle(n.parentElement).fontSize);
      }
      if (inline && !props.shading) {
        const bg = hex(c.backgroundColor);
        if (bg && bg !== 'FFFFFF') props.shading = { type: D.ShadingType.CLEAR, fill: bg, color: 'auto' };
      }
      if (!inline) break;
    }
    if (cs.fontVariantCaps === 'small-caps') props.smallCaps = true;
    if (cs.textTransform === 'uppercase') props.allCaps = true;
    // Espacement des lettres (surtitres, petites capitales espacées) : en vingtièmes de point.
    const ls = parseFloat(cs.letterSpacing);
    if (ls && Math.abs(ls) >= 0.1) props.characterSpacing = Math.round(ls * 15);
    // Texte atténué (opacité, sous-titres de la page de titre…) : sa couleur mêlée au blanc du papier.
    let alpha = 1;
    for (let n = el; n && n !== editor && n.nodeType === 1; n = n.parentElement) alpha *= parseFloat(getComputedStyle(n).opacity) || 1;
    if (alpha < 0.98 && props.color && /^[0-9A-F]{6}$/i.test(props.color)) {
      props.color = [0, 2, 4].map((i) => Math.round(255 - (255 - parseInt(props.color.slice(i, i + 2), 16)) * alpha).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    props.size = Math.max(2, Math.round(size * 1.5));
    return props;
  }

  // Langue du passage (document en plusieurs langues) : Word vérifie chaque passage dans sa langue.
  function withLanguage(props, node) {
    const L = window.FTLang;
    if (!L || L.list().length < 2 || !window.FTSpell) return props;
    const lang = window.FTSpell.langAt(node, 0);
    if (!lang || lang === L.principal()) return props;
    props.language = lang === 'zh' ? { value: L.TAG[L.principal()], eastAsia: L.TAG.zh } : { value: L.TAG[lang] };
    return props;
  }

  // Langue principale du document (et chinois pour les caractères chinois, s'il en fait partie).
  function docLanguage() {
    const L = window.FTLang;
    if (!L) return {};
    const list = L.list();
    return { language: { value: L.TAG[list[0] === 'zh' ? (list[1] || 'en') : list[0]], ...(list.includes('zh') ? { eastAsia: L.TAG.zh } : {}) } };
  }

  // Morceaux d'un paragraphe : { text, props } ou des objets docx tout prêts.
  function inline(node, out, state) {
    if (node.nodeType === Node.TEXT_NODE) {
      const el = node.parentElement;
      const pre = /^pre/.test(getComputedStyle(el).whiteSpace);
      const clean = (s) => (pre ? s : s.replace(/[ \t\n\r\f]+/g, ' '));
      const props = withLanguage(runProps(el), node);
      if (state.paraTexts) state.paraTexts.push(node);
      const rev = state.rev && state.rev.nodes.get(node);
      if (!rev) {
        const text = clean(node.data);
        if (text) out.push({ text, props });
        return;
      }
      // Modifications suivies : morceaux ajoutés (révision « insertion ») et texte supprimé à sa place.
      const points = [...new Set([0, node.data.length, ...rev.ins.flat(), ...rev.dels.map((d) => d.at)])].sort((a, b) => a - b);
      points.forEach((p, i) => {
        for (const d of rev.dels) if (d.at === p) out.push({ del: d.text, props, rev: state.rev.info() });
        const q = points[i + 1];
        if (q === undefined) return;
        const text = clean(node.data.slice(p, q));
        if (!text) return;
        out.push(rev.ins.some(([a, b]) => a <= p && q <= b) ? { text, props, ins: state.rev.info() } : { text, props });
      });
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && isGap(node) && node.dataset.ftCut) out.push({ cut: +node.dataset.ftCut });
    if (node.nodeType !== Node.ELEMENT_NODE || isGap(node)) return;
    const el = node;
    if (el.classList.contains('ProseMirror-separator')) return;
    if (el.tagName === 'BR') {
      if (el.nextSibling || state.allowTrailingBreak) out.push({ br: true, props: runProps(el.parentElement) });
      return;
    }
    if (el.matches('sup.ft-fn-ref')) {
      const id = state.footnoteId(el.dataset.fn);
      if (id) out.push({ node: new D.FootnoteReferenceRun(id) });
      return;
    }
    if (el.classList.contains('ft-image')) {
      const run = imageRun(el, state);
      if (run) out.push({ node: run });
      const cap = el.querySelector(':scope > .ft-caption');
      if (cap && (cap.textContent.trim() || cap.dataset.cap)) state.captions.push(cap);
      return;
    }
    if (el.tagName === 'IMG') {
      const run = imageRun(el, state);
      if (run) out.push({ node: run });
      return;
    }
    if (el.classList.contains('ft-math')) {
      out.push({ node: equation(el.dataset.latex || '', { block: false, sz: halfPoints(el) }) });
      return;
    }
    // Passage commenté : début et fin du commentaire Word autour du texte.
    const cm = el.matches('span.ft-comment[data-c]') && state.comments ? state.comments.get(el.dataset.c) : null;
    if (cm) {
      if (cm.first === el) for (const id of cm.ids) out.push({ node: new D.CommentRangeStart(id) });
      el.childNodes.forEach((c) => inline(c, out, state));
      if (cm.last === el) {
        for (const id of cm.ids) out.push({ node: new D.CommentRangeEnd(id) });
        for (const id of cm.ids) out.push({ node: new D.TextRun({ children: [new D.CommentReference(id)] }) });
      }
      return;
    }
    if (el.tagName === 'A' && /^(https?:|mailto:)/i.test(el.getAttribute('href') || '')) {
      const inner = [];
      el.childNodes.forEach((c) => inline(c, inner, state));
      out.push({ link: el.getAttribute('href'), items: inner });
      return;
    }
    if (getComputedStyle(el).display === 'none') return;
    el.childNodes.forEach((c) => inline(c, out, state));
  }

  // Transforme les morceaux en objets docx (espaces inutiles retirés au début et à la fin).
  function finish(items) {
    const flat = [];
    const textItems = [];
    (function walk(list) { for (const it of list) { if (it.items) walk(it.items); else if (it.text !== undefined) textItems.push(it); } })(items);
    if (textItems.length) {
      textItems[0].text = textItems[0].text.replace(/^ +/, '');
      const last = textItems[textItems.length - 1];
      last.text = last.text.replace(/ +$/, '');
    }
    const make = (it) => {
      if (it.node) return it.node;
      if (it.br) return new D.TextRun({ ...it.props, break: 1 });
      if (it.del !== undefined) return new D.DeletedTextRun({ ...it.props, text: it.del, ...it.rev });
      if (it.ins) return it.text ? new D.InsertedTextRun({ ...it.props, text: it.text, ...it.ins }) : null;
      if (it.items) return new D.ExternalHyperlink({ link: it.link, children: it.items.map(make).filter(Boolean) });
      return it.text ? new D.TextRun({ ...it.props, text: it.text }) : null;
    };
    for (const it of items) { const n = make(it); if (n) flat.push(n); }
    return flat;
  }

  const ALIGN = { left: 'LEFT', start: 'LEFT', center: 'CENTER', right: 'RIGHT', end: 'RIGHT', justify: 'JUSTIFIED' };
  const HEADINGS = { H1: 'HEADING_1', H2: 'HEADING_2', H3: 'HEADING_3', H4: 'HEADING_4', H5: 'HEADING_5', H6: 'HEADING_6' };

  // Marge du haut telle que l'écran l'affiche : entre deux blocs, seule la plus grande
  // des deux marges compte (Word, lui, les additionne).
  function collapsed(el, cs) {
    let prev = el.previousElementSibling;
    while (prev && prev.classList.contains('ft-pg-gap')) prev = prev.previousElementSibling;
    const top = parseFloat(cs.marginTop) || 0;
    if (!prev) return top;
    return Math.max(0, top - (parseFloat(getComputedStyle(prev).marginBottom) || 0));
  }

  // Un paragraphe Word pour un bloc de texte (p, titre, élément de liste…).
  function paragraph(el, nodes, ctx, extra = {}) {
    const cs = getComputedStyle(el);
    const items = [];
    const state = ctx.state;
    const before = state.captions.length;
    const outer = state.paraTexts;
    const seen = (state.paraTexts = []);
    nodes.forEach((n) => inline(n, items, state));
    state.paraTexts = outer;
    const r = el.getBoundingClientRect();
    const fontPx = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight);
    const left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) - ctx.x0;
    const right = ctx.x1 - (r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight));
    const indent = extra.numbering ? { left: tw(left), hanging: extra.hanging || 360 } : { left: Math.max(0, tw(left)), right: Math.max(0, tw(right)) };
    const ti = parseFloat(cs.textIndent) || 0;
    if (!extra.numbering && ti > 0) indent.firstLine = tw(ti);
    if (!extra.numbering && ti < 0) indent.hanging = tw(-ti);
    // Lettrine : la première lettre part dans un petit paragraphe « lettrine » de Word, juste avant.
    const drop = el.dataset && el.dataset.lettrine && !extra.numbering ? dropCap(el, items, fontPx, lh, tw(collapsed(el, cs))) : null;
    // Coupé là où commence une nouvelle section Word : un paragraphe par morceau.
    const groups = [[]];
    const cutPages = [undefined];
    for (const it of items) {
      if (it.cut !== undefined) { groups.push([]); cutPages.push(it.cut); } else groups[groups.length - 1].push(it);
    }
    const children = finish(groups[0]);
    if (extra.tail) children.push(...extra.tail);
    if (extra.head) children.unshift(...extra.head);
    // Numéro automatique du titre (styles des titres), écrit devant son texte.
    if (HEADINGS[el.tagName] && state.headingNums && state.headingNums.has(el)) children.unshift(new D.TextRun({ ...runProps(el), text: state.headingNums.get(el) + ' ' }));
    // Légende numérotée (captions.js) : « Figure 2 : » devant le texte.
    if (el.dataset && el.dataset.cap && el.matches('.ft-caption, .ft-legend')) {
      // (Numérotation « 1. » : sans deux-points.)
      const sep = el.parentElement && el.parentElement.dataset.capStyle === 'num' ? '\u00a0' : '\u00a0: ';
      children.unshift(new D.TextRun({ ...runProps(el), bold: true, italics: false, text: el.dataset.cap + (el.textContent.trim() ? sep : '') }));
    }
    // Source d'une citation : le tiret « — » posé par la feuille de style (::before) passe aussi dans Word.
    if (el.classList && el.classList.contains('ft-quote-src')) {
      const deco = /^"(.*)"$/.exec(getComputedStyle(el, '::before').content || '');
      if (deco && deco[1]) children.unshift(new D.TextRun({ ...runProps(el), text: deco[1] }));
    }
    // Signet (bookmarks.js) : un vrai signet Word au début du paragraphe.
    if (el.dataset && el.dataset.bm && state.bookmarks && !state.bookmarks.has(el.dataset.bm)) children.unshift(bookmark(el, state));
    const options = {
      children: children.length ? children : [new D.TextRun({ ...runProps(el), text: '' })],
      alignment: D.AlignmentType[ALIGN[cs.textAlign] || 'LEFT'],
      spacing: { before: tw(collapsed(el, cs)) + (extra.before || 0), after: tw(cs.marginBottom) + (extra.after || 0), line: Math.round(lh * PX), lineRule: D.LineRuleType.AT_LEAST },
      indent,
      widowControl: false,
      ...extra.options
    };
    if (state.breakNext) { options.pageBreakBefore = true; state.breakNext = false; }
    if (el.classList && el.classList.contains('ft-legend')) options.keepNext = true;
    if (HEADINGS[el.tagName]) { options.heading = D.HeadingLevel[el.classList.contains('ft-title') ? 'TITLE' : HEADINGS[el.tagName]]; options.keepNext = true; }
    if (HEADINGS[el.tagName] && parseFloat(cs.borderBottomWidth) > 0 && !ctx.border) {
      options.border = { bottom: { style: D.BorderStyle.SINGLE, size: 6, space: 2, color: hex(cs.borderBottomColor) || '000000' } };
    }
    if (extra.numbering) options.numbering = extra.numbering;
    if (ctx.border) options.border = ctx.border;
    if (ctx.shading) options.shading = ctx.shading;
    if (ctx.frame) options.frame = ctx.frame;
    // Paragraphe ajouté pendant le suivi : sa marque de paragraphe aussi (Refuser dans Word le retire en entier).
    const rv = state.rev;
    if (rv && seen.length && seen.every((n) => rv.added.has(n))) options.run = { ...options.run, insertion: rv.info() };
    const out = drop ? [{ node: drop, el }] : [];
    if (drop) options.spacing.before = 0;
    groups.forEach((group, k) => {
      if (groups.length === 1) return out.push({ node: new D.Paragraph(options), el });
      const part = { ...options, spacing: { ...options.spacing }, children: k ? finish(group) : options.children };
      if (k < groups.length - 1) part.spacing.after = 0;
      if (k) {
        part.spacing.before = 0;
        part.indent = { left: Math.max(0, indent.left || 0), right: indent.right };
        delete part.numbering;
        delete part.heading;
        if (!part.children.length) part.children = [new D.TextRun({ ...runProps(el), text: '' })];
      }
      out.push({ node: new D.Paragraph(part), el, cutPage: cutPages[k] });
    });
    // Paragraphes supprimés pendant le suivi : paragraphes supprimés de Word, avant ou après celui-ci.
    if (rv) {
      const removed = (text) => ({ node: new D.Paragraph({ children: [new D.DeletedTextRun({ ...runProps(el), text, ...rv.info() })], run: { deletion: rv.info() } }), el });
      const first = seen.find((n) => rv.before.has(n));
      if (first) out.unshift(...rv.before.get(first).map(removed));
      for (const n of seen) if (rv.after.has(n)) out.push(...rv.after.get(n).map(removed));
    }
    // Légendes des images de ce paragraphe : sous le paragraphe.
    for (const cap of state.captions.splice(before)) out.push(...paragraph(cap, [...cap.childNodes], ctx, { options: {} }));
    return out;
  }

  // Nom Word d'un signet : lettres sans accents, chiffres et _, 40 caractères au plus, unique.
  function bookmark(el, state) {
    const base = ('Signet_' + (el.dataset.bmName || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+$/, '').slice(0, 36);
    let name = base;
    for (let k = 2; [...state.bookmarks.values()].includes(name); k++) name = base + '_' + k;
    state.bookmarks.set(el.dataset.bm, name);
    return new D.Bookmark({ id: name, children: [] });
  }

  // Retire la première lettre (et la ponctuation qui la précède) des morceaux, et la rend en lettrine Word
  // sur 2 à 4 lignes, avec la couleur, la police et le fond de la lettrine à l'écran.
  function dropCap(el, items, fontPx, lh, before) {
    let first = null;
    (function walk(list) { for (const it of list) { if (first) return; if (it.items) walk(it.items); else if (it.text && it.text.trim()) first = it; else if (it.node || it.br) return; } })(items);
    if (!first) return null;
    // Comme l'écran : la ponctuation collée à la lettre en fait partie ; sinon, pas de lettrine.
    const m = /^\s*([«"“‘'(\[]*[\p{L}\p{N}])/u.exec(first.text);
    if (!m) return null;
    first.text = first.text.slice(m[0].length);
    const lines = Math.min(4, Math.max(2, parseInt(el.dataset.lettrine, 10) || 3));
    const fl = getComputedStyle(el, '::first-letter');
    const cap = 0.7;
    const sizePt = ((lines - 1) * lh * 0.75 + cap * fontPx * 0.75) / cap;
    const props = { ...first.props, text: m[1], size: Math.round(sizePt * 2), font: family(fl.fontFamily), italics: fl.fontStyle !== 'normal', color: hex(fl.color) || first.props.color };
    if (parseFloat(fl.borderTopWidth) > 0) props.border = { style: D.BorderStyle.SINGLE, size: Math.round(parseFloat(fl.borderTopWidth) * 6), space: 1, color: hex(fl.borderTopColor) || '000000' };
    return new D.Paragraph({
      frame: { anchor: { horizontal: 'text', vertical: 'text' }, dropCap: 'drop', lines, wrap: 'around', space: { horizontal: tw(fontPx * 0.12) } },
      spacing: { before, after: 0, line: Math.round(lines * lh * PX), lineRule: D.LineRuleType.EXACT },
      children: [new D.TextRun(props)]
    });
  }

  // ----- Blocs -----

  const BLOCK_SKIP = (el) => isGap(el) || el.classList.contains('ft-footnotes');
  // Moteur : texte d'une case, d'une note… dans un paragraphe sans balise une fois enregistré (data-pm-bare) :
  // lu comme le texte de son conteneur, à la façon des versions 1.x (vide : rien).
  const isBare = (el) => el.hasAttribute('data-pm-bare');
  const emptyBare = (el) => !el.firstChild || (el.childNodes.length === 1 && el.firstChild.nodeName === 'BR');

  // Contenu d'un conteneur : ses blocs, et ses morceaux de texte regroupés en paragraphes.
  function flow(container, ctx, out) {
    let buffer = [];
    const flush = () => {
      if (buffer.some((n) => n.nodeType !== Node.TEXT_NODE || n.data.trim())) out.push(...paragraph(container, buffer, ctx));
      buffer = [];
    };
    for (const node of container.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { buffer.push(node); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE || BLOCK_SKIP(node)) continue;
      if (isBare(node)) { if (!emptyBare(node)) buffer.push(node); continue; }
      const loose = ['devant', 'derriere', 'gauche', 'droite'].includes(node.dataset.wrap) && node.classList.contains('ft-image');
      if (loose || isInlineDisplay(node)) { buffer.push(node); continue; }
      flush();
      block(node, inColumn(ctx, node), out);
    }
    flush();
    return out;
  }

  // Zone en colonnes : chaque bloc est mesuré par rapport à la colonne où il se trouve à l'écran,
  // pas par rapport à toute la largeur (sinon Word reçoit un retrait plus large que la colonne).
  function columnsCtx(el, ctx) {
    const cs = getComputedStyle(el);
    const n = parseInt(cs.columnCount, 10);
    if (!(n > 1)) return ctx;
    const r = el.getBoundingClientRect();
    const x0 = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const x1 = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0;
    return { ...ctx, cols: { x0, n, gap, w: (x1 - x0 - gap * (n - 1)) / n } };
  }
  function inColumn(ctx, node) {
    const c = ctx.cols;
    if (!c) return ctx;
    const box = node.getClientRects()[0];
    if (!box) return ctx;
    const k = Math.max(0, Math.min(c.n - 1, Math.floor((box.left - c.x0 + c.gap / 2) / (c.w + c.gap))));
    const x0 = c.x0 + k * (c.w + c.gap);
    return { ...ctx, cols: null, x0, x1: x0 + c.w };
  }

  const hasBlockChild = (el) => [...el.children].some((c) => !isGap(c) && !isBare(c) && !isInlineDisplay(c) && getComputedStyle(c).display !== 'none' &&
    !c.classList.contains('ft-image'));

  function block(el, ctx, out) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') return list(el, ctx, out);
    if (tag === 'TABLE') {
      // Tableau coupé là où commence une nouvelle section Word : un tableau par morceau.
      const parts = [{ rows: [] }];
      for (const r of el.rows) {
        if (!isGap(r)) parts[parts.length - 1].rows.push(r);
        else if (r.dataset.ftCut) parts.push({ rows: [], cutPage: +r.dataset.ftCut });
      }
      parts.forEach((part, k) => { if (part.rows.length) out.push({ node: table(el, ctx, part.rows, k === 0), el, cutPage: part.cutPage }); });
      return;
    }
    if (tag === 'HR') return out.push({ node: rule(el), el });
    // Plan du document : une ligne par titre, le numéro de page aligné à droite après des points.
    if (el.classList.contains('ft-toc-item') || el.classList.contains('ft-lof-item')) {
      const page = el.querySelector('.ft-toc-page, .ft-lof-page');
      const text = el.querySelector('.ft-toc-text, .ft-lof-text');
      const extra = page ? {
        tail: [new D.TextRun({ ...runProps(page), children: [new D.Tab(), page.textContent] })],
        options: { tabStops: [{ type: D.TabStopType.RIGHT, position: tw(ctx.x1 - ctx.x0), leader: D.LeaderType.DOT }] }
      } : {};
      return out.push(...paragraph(el, text ? [...text.childNodes] : [], ctx, extra));
    }
    if (el.classList.contains('ft-math')) return out.push(...mathBlock(el, ctx));
    if (el.classList.contains('ft-cover')) return window.FTPages.isPaged() ? cover(el, ctx, out) : undefined;
    // Bibliographie : un paragraphe par source, en retrait suspendu, [1] devant en style numéroté.
    if (el.classList.contains('ft-biblio')) {
      const title = el.querySelector(':scope > .ft-biblio-title');
      if (title) out.push(...paragraph(title, [...title.childNodes], ctx));
      const items = el.querySelectorAll(':scope > ul > li, :scope > ol > li');
      items.forEach((li, k) => {
        const head = li.parentElement.tagName === 'OL' && !li.classList.contains('empty') ? [new D.TextRun({ ...runProps(li), text: `[${k + 1}] ` })] : null;
        out.push(...paragraph(li, [...li.childNodes], ctx, head ? { head } : {}));
      });
      return;
    }
    if (el.classList.contains('ft-cols')) {
      // Suite d'une zone coupée entre deux pages (pages.js) : la même zone.
      const zone = el.classList.contains('ft-pg-cont') && lastZone ? lastZone : { count: parseInt(el.dataset.cols, 10) || 2, rule: el.hasAttribute('data-rule'), el };
      lastZone = zone;
      const inner = [];
      flow(el, columnsCtx(el, ctx), inner);
      inner.forEach((it) => { it.zone = zone; });
      out.push(...inner);
      return;
    }
    if (el.classList.contains('ft-code')) return out.push(...codeBlock(el, ctx));
    if (tag === 'BLOCKQUOTE' || el.classList.contains('ft-callout') || el.classList.contains('ft-toc') || el.classList.contains('ft-lof') || el.classList.contains('ft-index')) return flow(el, boxCtx(el, ctx), out);
    if (el.classList.contains('ft-image')) {
      // Image entre les paragraphes : à la même distance de la marge que dans le logiciel (centrée, à droite…).
      const extra = el.dataset.wrap ? {} : { options: { alignment: D.AlignmentType.LEFT, indent: { left: Math.max(0, tw(el.getBoundingClientRect().left - ctx.x0)) } } };
      return out.push(...paragraph(el.parentElement === editor ? editor : el.parentElement, [el], ctx, extra));
    }
    if (hasBlockChild(el)) return flow(el, ctx, out);
    // Référence de la bibliographie en style numérique : son numéro (affiché par la feuille de style) devant.
    if (el.classList.contains('ft-bib') && el.dataset.n) return out.push(...paragraph(el, [...el.childNodes], ctx, { head: [new D.TextRun({ ...runProps(el), text: `[${el.dataset.n}] ` })] }));
    out.push(...paragraph(el, [...el.childNodes], ctx));
  }

  const BORDER_STYLE = { solid: 'SINGLE', dashed: 'DASHED', dotted: 'DOTTED', double: 'DOUBLE', groove: 'THREE_D_ENGRAVE', ridge: 'THREE_D_EMBOSS', inset: 'INSET', outset: 'OUTSET' };
  function border(cs, side, space = true) {
    const w = parseFloat(cs[`border${side}Width`]);
    const style = cs[`border${side}Style`];
    const color = hex(cs[`border${side}Color`]);
    if (!w || style === 'none' || style === 'hidden' || !color) return undefined;
    const b = { style: D.BorderStyle[BORDER_STYLE[style] || 'SINGLE'], size: Math.max(2, Math.round(w * 6)), color };
    if (space) b.space = Math.min(31, Math.round(parseFloat(cs[`padding${side}`]) * 0.75));
    return b;
  }

  // Bloc de code (moteur/code.js) : un paragraphe Word par ligne, en Consolas, avec les couleurs de
  // l'écran ; le cadre et le fond sont ceux d'un encadré (Word réunit les lignes en une seule boîte).
  function codeBlock(el, ctx) {
    const cs = getComputedStyle(el);
    const code = el.querySelector(':scope > code') || el;
    // Police du style du bloc (JetBrains Mono par défaut, jointe au fichier).
    const chosen = el.style.getPropertyValue('--code-font').replace(/["']/g, '').trim();
    const font = chosen || 'JetBrains Mono';
    usedFonts.add(font);
    const lines = [[]];
    const cuts = [undefined];
    (function walk(node) {
      for (const c of node.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) {
          const props = { ...runProps(c.parentElement), font };
          c.data.split('\n').forEach((part, k) => {
            if (k) { lines.push([]); cuts.push(undefined); }
            if (part) lines[lines.length - 1].push(new D.TextRun({ ...props, text: part.replace(/\t/g, '    ') }));
          });
          continue;
        }
        if (c.nodeType !== Node.ELEMENT_NODE || c.classList.contains('ft-code-bar') || c.classList.contains('ft-code-ln') || c.tagName === 'BR') continue;
        // Coupure de section Word au milieu du bloc (mode avancé) : la ligne suivante ouvre la section.
        if (isGap(c)) { if (c.dataset.ftCut) cuts[cuts.length - 1] = +c.dataset.ftCut; continue; }
        walk(c);
      }
    })(code);
    const box = boxCtx(el, ctx);
    const r = el.getBoundingClientRect();
    const left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) - ctx.x0;
    const right = ctx.x1 - (r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight));
    const fontPx = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? fontPx * 1.2 : parseFloat(cs.lineHeight);
    const empty = () => new D.TextRun({ ...runProps(code), font, text: '' });
    // Numéros de ligne : dans le retrait suspendu, à gauche du code (comme à l'écran).
    const numbered = el.hasAttribute('data-num');
    const hang = numbered ? Math.max(0, tw(parseFloat(cs.paddingLeft) - parseFloat(getComputedStyle(code).fontSize) * 0.6)) : 0;
    const lnColor = hex(cs.getPropertyValue('--code-ln').trim()) || '8C959F';
    const number = (k) => new D.TextRun({ ...runProps(code), font, color: lnColor, children: [String(k + 1), new D.Tab()] });
    return lines.map((runs, k) => ({
      el,
      cutPage: cuts[k],
      node: new D.Paragraph({
        children: numbered ? [number(k), ...runs] : (runs.length ? runs : [empty()]),
        alignment: D.AlignmentType.LEFT,
        spacing: { before: k ? 0 : tw(collapsed(el, cs)), after: k === lines.length - 1 ? tw(cs.marginBottom) : 0, line: Math.round(lh * PX), lineRule: D.LineRuleType.EXACT },
        indent: { left: Math.max(0, tw(left)), right: Math.max(0, tw(right)), ...(numbered ? { hanging: hang } : {}) },
        widowControl: false,
        ...(box.border ? { border: box.border } : {}),
        ...(box.shading ? { shading: box.shading } : {})
      })
    }));
  }

  // Encadré : chaque paragraphe reçoit le cadre et le fond ; Word les réunit en une seule boîte.
  function boxCtx(el, ctx) {
    const cs = getComputedStyle(el);
    const b = { top: border(cs, 'Top'), bottom: border(cs, 'Bottom'), left: border(cs, 'Left'), right: border(cs, 'Right') };
    const fill = hex(cs.backgroundColor);
    return {
      ...ctx,
      border: Object.values(b).some(Boolean) ? b : ctx.border,
      shading: fill && fill !== 'FFFFFF' ? { type: D.ShadingType.CLEAR, fill, color: 'auto' } : ctx.shading
    };
  }

  // Page de titre (cover.js) : un paragraphe par champ rempli. Les espaces entre les champs sont
  // ceux de l'écran, agrandis ou réduits pour que l'ensemble occupe la page Word comme à l'écran.
  // Les filets, bandes de couleur et cadres des groupes passent en bordures et fonds de paragraphe.
  // Filet plein dessiné par ::before au début d'un groupe de la page de titre (bloc, fond de couleur, sans texte).
  function barOf(group) {
    const b = getComputedStyle(group, '::before');
    if (b.content !== '""' || b.display !== 'block' || b.position !== 'static') return null;
    const color = hex(b.backgroundColor);
    const w = parseFloat(b.width), h = parseFloat(b.height);
    if (!color || !(w > 0) || !(h > 0)) return null;
    const gr = group.getBoundingClientRect(), gs = getComputedStyle(group);
    const left = gr.left + parseFloat(gs.borderLeftWidth) + parseFloat(gs.paddingLeft) + (parseFloat(b.marginLeft) || 0);
    return { color, w, h, left, mb: parseFloat(b.marginBottom) || 0 };
  }

  function cover(el, ctx, out) {
    const filled = (f) => f.textContent.trim() || f.querySelector('img');
    const fields = [...el.querySelectorAll('.ft-cover-field')].filter(filled);
    // Sigle dessiné par le modèle (essais du CEM) : une image devant l'organisme, ou seule à sa place.
    const logo = ctx.state.coverLogo && ctx.state.coverLogo.el === el ? ctx.state.coverLogo : null;
    const head = logo && el.querySelector('.ft-cover-head');
    if (logo && !fields.some((f) => f.parentElement === head)) fields.unshift(head);
    if (!fields.length) return;
    const cr = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // L'organisme et le sigle comptent pour une seule boîte : celle du contenu du groupe du haut.
    const contentBox = (g) => {
      const r = g.getBoundingClientRect(), gs = getComputedStyle(g);
      const top = r.top + parseFloat(gs.borderTopWidth) + parseFloat(gs.paddingTop);
      const bottom = r.bottom - parseFloat(gs.borderBottomWidth) - parseFloat(gs.paddingBottom);
      return { top, bottom, height: bottom - top };
    };
    const boxes = fields.map((f) => (logo && (f === head || f.parentElement === head) ? contentBox(head) : f.getBoundingClientRect()));
    // Un groupe posé à part (la colonne du modèle « Colonne ») passe en tête, sans changer les espaces des autres.
    const aside = fields.map((f) => f.parentElement !== el && getComputedStyle(f.parentElement).position === 'absolute');
    let prev = cr.top + parseFloat(cs.borderTopWidth);
    const gaps = boxes.map((b, i) => { if (aside[i]) return 0; const g = Math.max(0, b.top - prev); prev = b.bottom; return g; });
    const tail = Math.max(0, cr.bottom - parseFloat(cs.borderBottomWidth) - prev);
    const used = boxes.reduce((a, b, i) => a + (aside[i] ? 0 : b.height), 0);
    const room = ctx.state.coverPx ? ctx.state.coverPx * 0.94 : cr.height;
    const free = gaps.reduce((a, g) => a + g, 0) + tail;
    const k = free > 0 ? Math.max(0, (room - used) / free) : 0;
    // Page de titre sur un fond de couleur (nuit, art déco, plan…) : un tableau d'une case, de la hauteur de
    // la page, porte le fond et le cadre ; les paragraphes sont dedans.
    const fill = hex(cs.backgroundColor);
    const boxed = fill && fill !== 'FFFFFF';
    const outer = boxed ? { ...ctx, border: null, shading: null, x0: cr.left, x1: cr.right } : boxCtx(el, ctx);
    const paras = [];
    const logoRuns = () => {
      const image = new D.ImageRun({ type: 'png', data: logo.data, transformation: { width: Math.round(logo.w), height: Math.round(logo.h) }, altText: { name: 'Sigle', description: '' } });
      return logo.column ? [image, new D.TextRun({ text: '', break: 1 })] : [image, new D.TextRun({ text: '\u2003' })];
    };
    fields.forEach((f, i) => {
      if (f === head) {
        const hctx = boxCtx(head, outer);
        paras.push(...paragraph(head, [], hctx, { before: tw(Math.max(0, gaps[i] * k)), head: [logoRuns()[0]] }));
        return;
      }
      const group = f.parentElement;
      const fctx = group && group !== el ? boxCtx(group, outer) : outer;
      const extra = { before: tw(Math.max(0, gaps[i] * k - collapsed(f, getComputedStyle(f)))) };
      // Filet de couleur dessiné avant le groupe (modèle « Rapport ») : la bordure du bas d'un paragraphe
      // vide, aussi large que le filet.
      const bar = group && group !== el && fields.find((x) => x.parentElement === group) === f ? barOf(group) : null;
      if (bar) {
        const space = Math.max(0, gaps[i] - bar.h - bar.mb);
        // (Page de titre plus large que la zone de texte : le filet part du bord du texte, comme le titre.)
        const left = Math.max(0, tw(bar.left - fctx.x0));
        paras.push({ el: group, node: new D.Paragraph({
          children: [new D.TextRun({ text: '', size: 2 })],
          spacing: { before: tw(space * k), after: tw(bar.mb), line: 20, lineRule: D.LineRuleType.EXACT },
          indent: { left, right: Math.max(0, tw(fctx.x1 - fctx.x0) - left - tw(bar.w)) },
          border: { bottom: { style: D.BorderStyle.SINGLE, size: Math.min(96, Math.max(2, Math.round(bar.h * 6))), color: bar.color, space: 0 } }
        }) });
        extra.before = tw(Math.max(0, -collapsed(f, getComputedStyle(f))));
      }
      // Texte vertical, ou champs côte à côte (pied en colonnes du modèle « Suisse ») : Word les écrit
      // l'un sous l'autre, sur toute la largeur de leur groupe.
      if (getComputedStyle(f).writingMode.startsWith('vertical') || getComputedStyle(group).display === 'grid') {
        const g = group.getBoundingClientRect();
        extra.options = { indent: { left: Math.max(0, tw(g.left - outer.x0)), right: Math.max(0, tw(outer.x1 - g.right)) } };
        if (getComputedStyle(f).writingMode.startsWith('vertical')) extra.options.alignment = D.AlignmentType.CENTER;
      }
      if (logo && group === head) {
        extra.head = logoRuns();
        // Sigle à gauche de l'organisme : le paragraphe part du bord du groupe, pas du texte.
        if (!logo.column) {
          const g = head.getBoundingClientRect(), gs = getComputedStyle(head);
          extra.options = { indent: { left: Math.max(0, tw(g.left + parseFloat(gs.paddingLeft) - fctx.x0)), right: Math.max(0, tw(fctx.x1 - g.right + parseFloat(gs.paddingRight))) } };
        }
      }
      paras.push(...paragraph(f, [...f.childNodes], fctx, extra));
    });
    if (!boxed) return out.push(...paras);
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    const side = (s) => border(cs, s, false) || none;
    const width = tw(cr.width * (ctx.state.scale || 1));
    out.push({
      el,
      node: new D.Table({
        rows: [new D.TableRow({
          height: { value: tw((ctx.state.coverPx || cr.height) * 0.97), rule: D.HeightRule.EXACT },
          children: [new D.TableCell({
            children: paras.map((it) => it.node).filter((n) => n instanceof D.Paragraph),
            width: { size: width, type: D.WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            shading: { type: D.ShadingType.CLEAR, fill, color: 'auto' },
            borders: { top: side('Top'), bottom: side('Bottom'), left: side('Left'), right: side('Right') }
          })]
        })],
        columnWidths: [width],
        width: { size: width, type: D.WidthType.DXA },
        layout: D.TableLayoutType.FIXED,
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
      })
    });
  }

  function rule(el) {
    const cs = getComputedStyle(el);
    const side = border(cs, 'Top', false) || border(cs, 'Bottom', false) || { style: D.BorderStyle.SINGLE, size: 6, color: hex(cs.color) || '999999' };
    return new D.Paragraph({
      children: [],
      border: { bottom: side },
      spacing: { before: tw(cs.marginTop), after: tw(cs.marginBottom), line: 20, lineRule: D.LineRuleType.EXACT }
    });
  }

  // ----- Listes -----

  const BULLETS = { disc: '•', circle: '◦', square: '▪', none: '' };
  const NUMBERED = {
    decimal: 'DECIMAL', 'decimal-leading-zero': 'DECIMAL_ZERO', 'lower-alpha': 'LOWER_LETTER', 'lower-latin': 'LOWER_LETTER',
    'upper-alpha': 'UPPER_LETTER', 'upper-latin': 'UPPER_LETTER', 'lower-roman': 'LOWER_ROMAN', 'upper-roman': 'UPPER_ROMAN'
  };

  // La liste elle-même puis ses parents, jusqu'à l'éditeur.
  function* ancestors(el) {
    for (let n = el; n && n.id !== 'editor'; n = n.parentElement) yield n;
  }

  const isCheckList = (listEl) => listEl.tagName === 'UL' && !!listEl.closest('ul.ft-check');

  function levelOf(listEl, depth, ctx) {
    const cs = getComputedStyle(listEl);
    const type = cs.listStyleType;
    const li = [...listEl.children].find((c) => c.tagName === 'LI');
    const marker = li ? getComputedStyle(li, '::marker') : cs;
    const run = { color: hex(marker.color) || undefined, font: family(marker.fontFamily) };
    const left = li ? li.getBoundingClientRect().left - ctx.x0 : 24 * (depth + 1);
    const style = { paragraph: { indent: { left: tw(left), hanging: 360 } }, run };
    // Liste numérotée (structure.js) : 1. 1.1. 1.1.1., chaque niveau avec sa numérotation (--ft-f1…),
    // après les numéros des niveaux numérotés au-dessus.
    if (listEl.tagName === 'OL') {
      const chain = [...ancestors(listEl)].filter((n) => n.tagName === 'OL' || n.tagName === 'UL').slice(0, depth + 1).reverse();
      const text = chain.map((l, i) => (l.tagName === 'OL' ? `%${i + 1}.` : '')).join('');
      const k = [...ancestors(listEl)].filter((n) => n.tagName === 'OL').length;
      const f = cs.getPropertyValue('--ft-f' + k).trim();
      const format = NUMBERED[f] || NUMBERED[type] || 'DECIMAL';
      return { level: depth, format: D.LevelFormat[format], text: text || `%${depth + 1}.`, alignment: D.AlignmentType.LEFT, start: listEl.start || 1, style };
    }
    // Liste à cocher : une case vide (la version cochée est une copie de la numérotation, voir list()).
    if (isCheckList(listEl)) {
      return { level: depth, format: D.LevelFormat.BULLET, text: '☐', alignment: D.AlignmentType.LEFT, style: { ...style, run: { ...run, font: 'Segoe UI Symbol' } } };
    }
    const custom = /^"(.*)"$/.exec(type);
    const symbol = custom ? custom[1].trim() : (BULLETS[type] !== undefined ? BULLETS[type] : '•');
    return { level: depth, format: D.LevelFormat.BULLET, text: symbol || ' ', alignment: D.AlignmentType.LEFT, style };
  }

  function list(listEl, ctx, out, depth = 0, ref = null) {
    const state = ctx.state;
    if (!ref) {
      ref = `liste-${state.numbering.length + 1}`;
      const levels = [];
      let lists = [listEl];
      for (let d = 0; d < 9; d++) {
        const sample = lists[0];
        levels.push(sample ? levelOf(sample, d, ctx) : { level: d, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (d + 1), hanging: 360 } } } });
        lists = lists.flatMap((l) => [...l.querySelectorAll(':scope > li > ul, :scope > li > ol, :scope > ul, :scope > ol')]);
      }
      state.numbering.push({ reference: ref, levels });
      state.numbering.push({ reference: ref + '-coche', levels: levels.map((l) => (l.text === '☐' ? { ...l, text: '☒' } : l)) });
    }
    for (const li of listEl.children) {
      // Sous-liste posée à côté des éléments (c'est ce que fait la touche Tab) : un étage plus bas.
      if (li.tagName === 'UL' || li.tagName === 'OL') { list(li, ctx, out, depth + 1, ref); continue; }
      if (li.tagName !== 'LI') { if (!isGap(li) && li.nodeType === 1) block(li, ctx, out); continue; }
      // Ligne porteuse (moteur/schema.js) : une ligne masquée, qui compte (1.1. sous elle, 2. ensuite),
      // puis sa sous-liste.
      if (li.hasAttribute('data-porteur')) {
        out.push({ node: new D.Paragraph({
          children: [],
          numbering: { reference: ref, level: Math.min(depth, 8) },
          run: { vanish: true },
          spacing: { before: 0, after: 0, line: 20, lineRule: D.LineRuleType.EXACT }
        }), el: li });
        for (const b of li.children) {
          if (b.tagName === 'UL' || b.tagName === 'OL') list(b, ctx, out, depth + 1, ref);
          else if (!isGap(b)) block(b, ctx, out);
        }
        continue;
      }
      const own = [];
      const blocks = [];
      for (const n of li.childNodes) {
        if (n.nodeType === Node.ELEMENT_NODE && !isGap(n) && !isInlineDisplay(n) && !n.classList.contains('ft-image')) blocks.push(n);
        else if (!blocks.length) own.push(n);
        else blocks.push(n);
      }
      let rest = blocks;
      // Ligne qui est un titre : le paragraphe numéroté a le style du titre.
      let line = li;
      if (!own.some((n) => n.nodeType !== Node.TEXT_NODE || n.data.trim()) && rest[0] && /^(P|H[1-6])$/.test(rest[0].tagName)) {
        if (rest[0].tagName !== 'P') line = rest[0];
        own.push(...rest[0].childNodes);
        rest = rest.slice(1);
      }
      const numbering = { reference: li.dataset.checked && isCheckList(listEl) ? ref + '-coche' : ref, level: Math.min(depth, 8) };
      if (listEl.tagName === 'OL' && listEl.start > 1 && depth === 0) numbering.instance = state.numbering.length;
      // Numéros (1.1.1.) : ils prennent toute la marge de la liste, comme dans le logiciel.
      const hanging = listEl.tagName === 'OL' ? Math.max(360, tw(li.getBoundingClientRect().left + parseFloat(getComputedStyle(li).paddingLeft) - listEl.getBoundingClientRect().left)) : undefined;
      out.push(...paragraph(line, own, ctx, { numbering, hanging }));
      for (const b of rest) {
        if (b.nodeType !== Node.ELEMENT_NODE) continue;
        if (b.tagName === 'UL' || b.tagName === 'OL') list(b, ctx, out, depth + 1, ref);
        else block(b, ctx, out);
      }
    }
  }

  // ----- Tableaux -----

  const VALIGN = { middle: 'CENTER', bottom: 'BOTTOM' };

  function table(t, ctx, rows = [...t.rows].filter((r) => !isGap(r)), first = true) {
    const box = t.getBoundingClientRect();
    // Colonnes de la grille : tous les bords de cellules.
    const xs = [box.left, box.right];
    for (const r of rows) for (const c of r.cells) { const b = c.getBoundingClientRect(); xs.push(b.left, b.right); }
    xs.sort((a, b) => a - b);
    const grid = [];
    for (const x of xs) if (!grid.length || x - grid[grid.length - 1] > 1.5) grid.push(x);
    const col = (x) => grid.reduce((best, g, i) => (Math.abs(g - x) < Math.abs(grid[best] - x) ? i : best), 0);
    const tcs = getComputedStyle(t);
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    const header = t.hasAttribute('data-header');
    const k = ctx.state.scale || 1;
    const docRows = rows.map((r, ri) => {
      const cells = [...r.cells].map((c) => {
        const b = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        const span = Math.max(1, col(b.right) - col(b.left));
        const cellCtx = { ...ctx, border: null, shading: null, frame: null, x0: b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), x1: b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
        const items = flow(c, cellCtx, []).filter((it) => it.node instanceof D.Paragraph || it.node instanceof D.Table).map((it) => it.node);
        const fill = hex(cs.backgroundColor) || hex(getComputedStyle(r).backgroundColor);
        const options = {
          children: items.length ? items : [new D.Paragraph({ children: [] })],
          columnSpan: span > 1 ? span : undefined,
          rowSpan: c.rowSpan > 1 ? c.rowSpan : undefined,
          width: { size: tw(b.width * k), type: D.WidthType.DXA },
          margins: { top: tw(cs.paddingTop), bottom: tw(cs.paddingBottom), left: tw(cs.paddingLeft), right: tw(cs.paddingRight) },
          borders: { top: border(cs, 'Top', false) || none, bottom: border(cs, 'Bottom', false) || none, left: border(cs, 'Left', false) || none, right: border(cs, 'Right', false) || none },
          verticalAlign: (D.VerticalAlignTable || D.VerticalAlign)[VALIGN[cs.verticalAlign] || 'TOP']
        };
        if (fill) options.shading = { type: D.ShadingType.CLEAR, fill, color: 'auto' };
        return new D.TableCell(options);
      });
      const rowOptions = { children: cells };
      if (r.style.height) rowOptions.height = { value: tw(r.style.height), rule: D.HeightRule.ATLEAST };
      if (header && t.dataset.repeat && first && ri === 0) rowOptions.tableHeader = true;
      return new D.TableRow(rowOptions);
    });
    // Tableau à côté du texte : tableau flottant de Word, le texte en fait le tour.
    const beside = !ctx.frame && first && (t.dataset.wrap === 'gauche' || t.dataset.wrap === 'droite');
    const centered = tcs.marginLeft === tcs.marginRight && parseFloat(tcs.marginLeft) > 0 && !ctx.frame && !beside;
    const left = ctx.frame || beside ? 0 : box.left - ctx.x0;
    const float = beside ? {
      horizontalAnchor: D.TableAnchorType.TEXT,
      verticalAnchor: D.TableAnchorType.TEXT,
      absoluteHorizontalPosition: tw((box.left - ctx.x0) * k),
      absoluteVerticalPosition: 0,
      leftFromText: t.dataset.wrap === 'droite' ? tw(tcs.marginLeft) : 0,
      rightFromText: t.dataset.wrap === 'gauche' ? tw(tcs.marginRight) : 0,
      topFromText: tw(tcs.marginTop),
      bottomFromText: tw(tcs.marginBottom),
      overlap: D.OverlapType.NEVER
    } : ctx.frame ? {
      horizontalAnchor: D.TableAnchorType.PAGE,
      verticalAnchor: D.TableAnchorType.PAGE,
      absoluteHorizontalPosition: ctx.frame.position.x,
      absoluteVerticalPosition: ctx.frame.position.y,
      topFromText: ctx.frame.space.vertical,
      bottomFromText: ctx.frame.space.vertical,
      overlap: D.OverlapType.NEVER
    } : undefined;
    return new D.Table({
      float,
      rows: docRows,
      columnWidths: grid.slice(1).map((g, i) => tw((g - grid[i]) * k)),
      width: { size: tw(box.width * k), type: D.WidthType.DXA },
      layout: D.TableLayoutType.FIXED,
      alignment: centered ? D.AlignmentType.CENTER : undefined,
      // (Retrait négatif : tableau qui déborde sur la marge de gauche.)
      indent: !centered && Math.abs(left) > 1 ? { size: tw(left * k), type: D.WidthType.DXA } : undefined,
      borders: {
        top: border(tcs, 'Top', false) || none, bottom: border(tcs, 'Bottom', false) || none,
        left: border(tcs, 'Left', false) || none, right: border(tcs, 'Right', false) || none,
        insideHorizontal: none, insideVertical: none
      }
    });
  }

  // ----- Images -----

  const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

  async function loadImage(img) {
    // (Schéma : redessiné avec les polices du logiciel qu'il emploie, diagram.js.)
    if (window.FTDiagram) {
      await window.FTDiagram.fontify(img);
      try { await img.decode(); } catch { /* image déjà prête ou illisible */ }
    }
    // Les images affichées viennent de la mémoire (blob:) ; layout.js garde leurs données d'origine.
    const src = window.FTLayout.serialize(img.currentSrc || img.src);
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(src);
    if (m && TYPES[m[1]]) {
      const bin = atob(m[2]);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { type: TYPES[m[1]], data };
    }
    // Autres formats (webp, svg…) : redessinée en PNG.
    // Les dessins (SVG, schémas) sont redessinés en plus grand pour rester nets.
    const k = m && m[1] === 'image/svg+xml' ? 3 : 1;
    const c = document.createElement('canvas');
    c.width = (img.naturalWidth || img.width || 1) * k;
    c.height = (img.naturalHeight || img.height || 1) * k;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const png = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    return { type: 'png', data: new Uint8Array(await png.arrayBuffer()) };
  }

  // Sigle d'une page de titre des essais du CEM (cover.js) : image de fond du ::before du groupe du haut,
  // redessinée en PNG à sa taille à l'écran.
  async function coverLogo() {
    const el = editor.querySelector(':scope > .ft-cover[data-model^="cem-"]');
    const head = el && el.querySelector('.ft-cover-head');
    if (!head) return null;
    const ps = getComputedStyle(head, '::before');
    const m = /^url\("(.*)"\)$/s.exec(ps.backgroundImage);
    const w = parseFloat(ps.width), h = parseFloat(ps.height);
    if (!m || !(w > 0) || !(h > 0)) return null;
    const img = new Image();
    img.src = m[1];
    try { await img.decode(); } catch (e) { return null; }
    const c = document.createElement('canvas');
    c.width = Math.round(w * 4);
    c.height = Math.round(h * 4);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const png = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    return { el, w, h, column: getComputedStyle(head).flexDirection === 'column', data: new Uint8Array(await png.arrayBuffer()) };
  }

  function imageRun(el, state) {
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    const data = img && state.images.get(img);
    if (!data) return null;
    const r = img.getBoundingClientRect();
    const k = state.fitPx && r.width > state.fitPx ? state.fitPx / r.width : 1;
    const options = { ...data, transformation: { width: Math.max(1, Math.round(r.width * k)), height: Math.max(1, Math.round(r.height * k)) }, altText: { name: 'Image', description: img.alt || '' } };
    const box = el.classList.contains('ft-image') ? el : null;
    if (box && box.hasAttribute('data-frame')) {
      const cs = getComputedStyle(img);
      const color = hex(cs.borderTopColor);
      const w = parseFloat(cs.borderTopWidth);
      if (color && w) options.outline = { type: 'solidFill', solidFillType: 'rgb', value: color, width: Math.round(w * EMU) };
    }
    const wrap = box && box.dataset.wrap;
    if (wrap && wrap !== 'ligne') {
      const cs = getComputedStyle(box);
      const anchor = (box.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, div') || editor).getBoundingClientRect();
      const margins = { top: Math.round(parseFloat(cs.marginTop) * EMU), bottom: Math.round(parseFloat(cs.marginBottom) * EMU), left: Math.round(parseFloat(cs.marginLeft) * EMU), right: Math.round(parseFloat(cs.marginRight) * EMU) };
      const top = Math.round((r.top - anchor.top) * EMU);
      if (wrap === 'devant' || wrap === 'derriere') {
        options.floating = {
          horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.COLUMN, offset: Math.round((r.left - state.x0) * EMU) },
          verticalPosition: { relative: D.VerticalPositionRelativeFrom.PARAGRAPH, offset: top },
          behindDocument: wrap === 'derriere',
          allowOverlap: true,
          wrap: { type: D.TextWrappingType.NONE }
        };
      } else {
        // (Version 2.5 : à la même distance du bord que dans le logiciel — écart choisi, centrage.)
        const right = cs.float === 'right';
        const edge = right ? (state.x1 || r.right) - r.right : r.left - state.x0;
        const flush = Math.abs(edge) < 2;
        if (right) margins.right = 0; else margins.left = 0;
        options.floating = {
          horizontalPosition: flush
            ? { relative: D.HorizontalPositionRelativeFrom.COLUMN, align: right ? D.HorizontalPositionAlign.RIGHT : D.HorizontalPositionAlign.LEFT }
            : { relative: D.HorizontalPositionRelativeFrom.COLUMN, offset: Math.round((r.left - state.x0) * EMU) },
          verticalPosition: { relative: D.VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.max(0, top) },
          wrap: { type: D.TextWrappingType.SQUARE, side: D.TextWrappingSide.BOTH_SIDES },
          margins
        };
      }
    }
    return new D.ImageRun(options);
  }

  // ----- Équations : équations Word natives (OMML écrit par formules-latex.js) -----

  // Équation Word (m:oMath dans la ligne, m:oMathPara sur sa ligne) ; code illisible : le code LaTeX en texte.
  function equation(latex, opts) {
    try {
      const xml = window.FTLatex.toOmml(latex, opts);
      const root = D.ImportedXmlComponent.fromXmlString(xml);
      const node = (root.root || []).find((c) => c instanceof D.ImportedXmlComponent);
      if (node) return node;
    } catch (err) {
      console.warn('Équation non convertie pour Word', err);
    }
    return new D.TextRun({ text: latex });
  }

  // Taille d'une équation à l'écran, en demi-points (comme le texte, runProps).
  const halfPoints = (el) => Math.max(2, Math.round(parseFloat(getComputedStyle(el).fontSize) * 1.5));

  function mathBlock(el, ctx) {
    const cs = getComputedStyle(el);
    const sz = halfPoints(el);
    const latex = el.dataset.latex || '';
    const align = el.dataset.align === 'gauche' ? 'gauche' : '';
    const spacing = { before: tw(cs.marginTop), after: tw(cs.marginBottom) };
    // Équation numérotée : tableau sans bordure, l'équation (centrée ou à gauche) et son numéro au bord droit.
    if (el.hasAttribute('data-numero')) {
      const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
      const total = Math.max(1, Math.round((ctx.x1 - ctx.x0) * (ctx.state && ctx.state.scale ? ctx.state.scale : 1) * PX));
      const numW = Math.round(total * 0.12);
      const sideW = align ? 0 : numW;
      const mainW = total - numW - sideW;
      const num = el.dataset.eq || '';
      const cell = (children, width, opts = {}) => new D.TableCell({
        children,
        width: { size: width, type: D.WidthType.DXA },
        verticalAlign: D.VerticalAlign.CENTER,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        borders: { top: none, bottom: none, left: none, right: none },
        ...opts
      });
      const props = runProps(el);
      const cells = [];
      if (sideW) cells.push(cell([new D.Paragraph({ children: [] })], sideW));
      cells.push(cell([new D.Paragraph({ children: [equation(latex, { block: true, align, sz })], alignment: align ? D.AlignmentType.LEFT : D.AlignmentType.CENTER })], mainW));
      cells.push(cell([new D.Paragraph({ children: [new D.TextRun({ ...props, bold: false, italics: false, text: num })], alignment: D.AlignmentType.RIGHT })], numW));
      const table = new D.Table({
        rows: [new D.TableRow({ children: cells, cantSplit: true })],
        columnWidths: sideW ? [sideW, mainW, numW] : [mainW, numW],
        width: { size: total, type: D.WidthType.DXA },
        layout: D.TableLayoutType.FIXED,
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
      });
      return [
        { node: new D.Paragraph({ children: [], spacing: { before: 0, after: spacing.before, line: 20, lineRule: D.LineRuleType.EXACT } }), el },
        { node: table, el },
        // (Paragraphe après le tableau : deux équations numérotées qui se suivent restent deux tableaux.)
        { node: new D.Paragraph({ children: [], spacing: { before: 0, after: spacing.after, line: 20, lineRule: D.LineRuleType.EXACT } }), el }
      ];
    }
    const options = {
      children: [equation(latex, { block: true, align, sz })],
      alignment: align ? D.AlignmentType.LEFT : D.AlignmentType.CENTER,
      spacing
    };
    const b = { top: border(cs, 'Top'), bottom: border(cs, 'Bottom'), left: border(cs, 'Left'), right: border(cs, 'Right') };
    if (Object.values(b).some(Boolean)) {
      options.border = b;
      const r = el.getBoundingClientRect();
      options.indent = { left: Math.max(0, tw(r.left - ctx.x0 + parseFloat(cs.paddingLeft))), right: Math.max(0, tw(ctx.x1 - r.right + parseFloat(cs.paddingRight))) };
    } else if (ctx.border) {
      options.border = ctx.border;
    }
    const fill = hex(cs.backgroundColor);
    if (fill && fill !== 'FFFFFF') options.shading = { type: D.ShadingType.CLEAR, fill, color: 'auto' };
    else if (ctx.shading) options.shading = ctx.shading;
    if (ctx.frame) options.frame = ctx.frame;
    return [{ node: new D.Paragraph(options), el }];
  }

  // ----- En-tête, pied de page et numéros -----

  const NUMBER_PARTS = {
    1: ['#'], page: ['Page #'], 'page-sur': ['Page # sur *'], sur: ['# / *'], tirets: ['- # -'], p: ['p. #']
  };

  function numberParagraph(info, pageField) {
    const c = info.cfg.numbers;
    const props = runProps(info.number);
    if (c.box === 'cadre' || c.box === 'cercle') props.border = { style: D.BorderStyle.SINGLE, size: 6, color: props.color || 'auto', space: 2 };
    if (c.box === 'souligne') props.underline = { type: D.UnderlineType.SINGLE };
    if (c.box === 'fond') props.shading = { type: D.ShadingType.CLEAR, fill: hex(getComputedStyle(info.number).backgroundColor) || 'F2E6DA', color: 'auto' };
    const pattern = (NUMBER_PARTS[c.format] || NUMBER_PARTS[1])[0];
    const children = [];
    for (const piece of pattern.split(/([#*])/)) {
      if (!piece) continue;
      if (piece === '#') children.push(new D.TextRun({ ...props, children: [D.PageNumber.CURRENT] }));
      else if (piece === '*') children.push(pageField.total());
      else children.push(new D.TextRun({ ...props, text: piece }));
    }
    const h = c.pos.split('-')[1];
    return new D.Paragraph({ children, alignment: h === 'gauche' ? D.AlignmentType.LEFT : h === 'droite' ? D.AlignmentType.RIGHT : D.AlignmentType.CENTER, spacing: { before: 0, after: 0 } });
  }

  function hfParagraphs(el, state) {
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return flow(el, { state, x0: r.left, x1: r.right, border: null, shading: null }, []).map((it) => it.node);
  }

  // ----- Modifications suivies -----

  // Les modifications du suivi (track.js) rangées par nœud de texte du document : morceaux ajoutés,
  // texte supprimé (à sa place), paragraphes ajoutés, paragraphes supprimés (avant ou après un paragraphe).
  function revisions() {
    const t = window.FTTrack && window.FTTrack.exportRows();
    if (!t || !t.rows.length) return null;
    const author = (window.FTComments && window.FTComments.author()) || 'Tomatoes Text';
    const when = new Date(t.since);
    const date = (isNaN(when) ? new Date() : when).toISOString().replace(/\.\d+Z$/, 'Z');
    let id = 1000;
    const out = { nodes: new Map(), added: new Set(), after: new Map(), before: new Map(), info: () => ({ id: id++, author, date }) };
    const of = (n) => out.nodes.get(n) || out.nodes.set(n, { ins: [], dels: [] }).get(n);
    const add = (map, n, text) => (map.get(n) || map.set(n, []).get(n)).push(text);
    for (const row of t.rows) {
      if (row.kind === 'added') {
        for (const { node } of row.unit.nodes) { of(node).ins.push([0, node.data.length]); out.added.add(node); }
      } else if (row.kind === 'change') {
        const nodes = row.unit.nodes;
        for (const op of row.ops) {
          if (op.type === 'ins') {
            for (const { node, start } of nodes) {
              const a = Math.max(op.start, start) - start;
              const b = Math.min(op.end, start + node.data.length) - start;
              if (b > a) of(node).ins.push([a, b]);
            }
          } else {
            const hit = nodes.find(({ node, start }) => op.at <= start + node.data.length) || nodes[nodes.length - 1];
            of(hit.node).dels.push({ at: Math.max(0, Math.min(hit.node.data.length, op.at - hit.start)), text: op.text });
          }
        }
      } else if (row.kind === 'removed') {
        const text = t.base[row.ai].text;
        if (row.after) add(out.after, row.after.nodes[row.after.nodes.length - 1].node, text);
        else if (row.before) add(out.before, row.before.nodes[0].node, text);
      }
    }
    return out;
  }

  // ----- Assemblage -----

  async function build() {
    const info = window.FTPages.exportInfo();
    usedFonts = new Set();
    const state = { numbering: [], footnotes: {}, fnIds: new Map(), captions: [], images: new Map(), bookmarks: new Map(), x0: 0,
      headingNums: window.FTStructure && window.FTStructure.headingNumbers ? window.FTStructure.headingNumbers() : new Map() };
    const unmark = info.mode === 'avance' ? markCuts(info) : () => {};
    try {
      const imgs = [...editor.querySelectorAll('img:not(.ProseMirror-separator)'), ...[info.header, info.footer].filter(Boolean).flatMap((e) => [...e.querySelectorAll('img')])];
      for (const img of imgs) state.images.set(img, await loadImage(img));
      state.coverLogo = await coverLogo();

      // Notes de bas de page, numérotées dans l'ordre du texte.
      const notes = new Map([...editor.querySelectorAll('.ft-footnotes li[data-fn]')].map((li) => [li.dataset.fn, li]));
      state.footnoteId = (fn) => {
        if (!notes.has(fn)) return 0;
        if (!state.fnIds.has(fn)) state.fnIds.set(fn, state.fnIds.size + 1);
        return state.fnIds.get(fn);
      };

      state.rev = revisions();

      // Commentaires en marge : un commentaire Word par message (les réponses rattachées au premier).
      const commentList = [];
      state.comments = new Map();
      for (const t of window.FTComments ? window.FTComments.exportList() : []) {
        const ids = [];
        for (const m of [t, ...t.replies]) {
          const id = commentList.length;
          ids.push(id);
          commentList.push({
            id, author: m.author, initials: m.author.split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase(),
            date: isNaN(new Date(m.date)) ? new Date() : new Date(m.date),
            children: m.text.split('\n').map((line) => new D.Paragraph({ children: [new D.TextRun(line)] })),
            ...(id === ids[0] ? (t.done ? { resolved: true } : {}) : { parentId: ids[0], resolved: t.done })
          });
        }
        state.comments.set(t.id, { ids, first: t.spans[0], last: t.spans[t.spans.length - 1] });
      }

      const er = editor.getBoundingClientRect();
      const ecs = getComputedStyle(editor);
      const baseCtx = columnsCtx(editor, { state, x0: er.left + parseFloat(ecs.paddingLeft), x1: er.right - parseFloat(ecs.paddingRight), border: null, shading: null });
      state.x0 = baseCtx.x0;
      state.x1 = baseCtx.x1;
      // Mode note : la largeur du texte à l'écran n'est pas celle de la page Word ;
      // les tableaux et les images trop larges sont ramenés à la largeur de la page.
      if (info.mode !== 'avance') {
        const [w] = noteFormat(info).size;
        const m = noteFormat(info).margins;
        state.fitPx = (w - m.left - m.right) * 96 / 25.4;
        state.scale = Math.min(1, state.fitPx / (baseCtx.x1 - baseCtx.x0));
      }
      // Hauteur de la zone de texte de la première page Word (page de titre).
      if (info.mode === 'avance') state.coverPx = info.geo[0] ? info.geo[0].cb - info.geo[0].ct : 0;
      else {
        const [, h] = noteFormat(info).size;
        const m = noteFormat(info).margins;
        state.coverPx = (h - m.top - m.bottom) * 96 / 25.4;
      }
      const items = [];
      const keepPages = info.mode === 'avance' && info.cfg.keep;
      const chapters = info.mode === 'avance' ? info.cfg.chapters || 0 : 0;
      const sectionPages = new Set(keepPages ? sectionCuts(info) : []);
      const pageTop0 = document.getElementById('page').getBoundingClientRect().top;
      const pageIndexOf = (el) => {
        const y = el.getBoundingClientRect().top - pageTop0 + 1;
        return info.geo.findIndex((g) => y < g.top + g.h);
      };
      // Les blocs du document ; ceux des pages tournées sont plus larges, leur colonne de texte aussi.
      let buffer = [];
      let afterCover = false;
      const flushTop = () => {
        if (buffer.some((n) => n.nodeType !== Node.TEXT_NODE || n.data.trim())) items.push(...paragraph(editor, buffer, baseCtx));
        buffer = [];
      };
      for (const node of editor.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) { buffer.push(node); continue; }
        if (node.nodeType !== Node.ELEMENT_NODE || BLOCK_SKIP(node)) continue;
        const loose = node.classList.contains('ft-image') && ['devant', 'derriere', 'gauche', 'droite'].includes(node.dataset.wrap);
        if (loose || isInlineDisplay(node)) { buffer.push(node); continue; }
        flushTop();
        let ctx = inColumn(baseCtx, node);
        if (node.classList.contains('ft-pg-alt') || node.hasAttribute('data-pm-alt')) {
          const cs = getComputedStyle(node);
          ctx = { ...baseCtx, x0: baseCtx.x0 + parseFloat(cs.marginLeft), x1: baseCtx.x1 - parseFloat(cs.marginRight) };
        }
        // Bloc qui garde sa place en haut d'une page (mode avancé) : saut de page avant lui dans Word,
        // sauf là où une nouvelle section Word commence déjà une page.
        if (keepPages && node.dataset.pgStart && node.tagName !== 'TABLE' && !sectionPages.has(pageIndexOf(node))) state.breakNext = true;
        // Nouvelle page avant chaque chapitre (titre 1, ou titres 1 et 2) : saut de page avant le titre.
        if (chapters && /^H[1-5]$/.test(node.tagName) && Number(node.tagName[1]) <= chapters && !node.classList.contains('ft-title') && items.length && !sectionPages.has(pageIndexOf(node))) state.breakNext = true;
        // Après la page de titre, le texte commence sur une nouvelle page.
        if (afterCover && !sectionPages.has(pageIndexOf(node))) state.breakNext = true;
        block(node, ctx, items);
        state.breakNext = false;
        afterCover = node.classList.contains('ft-cover') && window.FTPages.isPaged();
      }
      flushTop();
      for (const [fn, n] of [...state.fnIds.entries()].sort((a, b) => a[1] - b[1])) {
        const li = notes.get(fn);
        const r = li.getBoundingClientRect();
        const paras = flow(li, { state, x0: r.left, x1: r.right, border: null, shading: null }, []).map((it) => it.node).filter((p) => p instanceof D.Paragraph);
        state.footnotes[n] = { children: paras.length ? paras : [new D.Paragraph({ children: [] })] };
      }

      const sections = info.mode === 'avance' ? pagedSections(info, items, state) : noteSections(info, items);
      // Polices intégrées au logiciel (Inter, Literata…) : absentes de la plupart des ordinateurs,
      // elles sont jointes au fichier pour que Word affiche le texte comme le logiciel.
      let fonts = [];
      try {
        const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        fonts = ((await window.frameText.fontsForWord([...usedFonts])) || []).map((f) => ({ ...f, data: bytes(f.data) }));
      } catch { fonts = []; }
      return new D.Document({
        creator: 'Tomatoes Text',
        fonts,
        title: window.FTApp.docName(),
        styles: { default: { document: { run: { font: 'Georgia', size: 24, ...docLanguage() } } } },
        numbering: { config: state.numbering },
        footnotes: state.footnotes,
        comments: { children: commentList },
        // Suivi en cours : Word continue de suivre les modifications du relecteur.
        ...(window.FTTrack && window.FTTrack.get() ? { features: { trackRevisions: true } } : {}),
        sections
      });
    } finally {
      unmark();
      info.cleanup();
    }
  }

  const twMM = (mm) => Math.round(mm * MM_TW);

  // Coupe la liste des blocs en sections Word : zones en colonnes, et en mode avancé changements de page.
  function split(items, cuts) {
    const out = [];
    let start = 0;
    let props = cuts.initial;
    for (const cut of cuts.list) {
      if (cut.index > start) out.push({ props, children: items.slice(start, cut.index).map((it) => it.node) });
      else if (out.length && cut.index === start) { /* section vide : on garde les derniers réglages */ }
      props = cut.props(props, cut.index > start || !out.length);
      start = cut.index;
    }
    if (items.length > start || !out.length) out.push({ props, children: items.slice(start).map((it) => it.node) });
    return out;
  }

  function zoneCuts(items) {
    const cuts = [];
    let current = null;
    items.forEach((it, i) => {
      const z = it.zone || null;
      if (z !== current) { cuts.push({ index: i, zone: z }); current = z; }
    });
    return cuts;
  }

  function columnsOf(zone, docCols) {
    if (zone) return { count: zone.count, space: 576, separate: zone.rule };
    if (docCols && docCols.count > 1) return { count: docCols.count, space: 576, separate: !!docCols.rule };
    return { count: 1 };
  }

  // Format de page Word en mode note : celui des réglages s'il a été choisi, sinon A4.
  function noteFormat(info) {
    const c = info.cfg;
    return { size: c.custom ? info.size('portrait') : [210, 297], margins: c.custom ? c.margins : { top: 25, bottom: 25, left: 25, right: 25 } };
  }

  function noteSections(info, items) {
    const [w, h] = noteFormat(info).size;
    const m = noteFormat(info).margins;
    const docCols = window.FTLayout.getColumns();
    const page = { size: { width: twMM(w), height: twMM(h) }, margin: { top: twMM(m.top), bottom: twMM(m.bottom), left: twMM(m.left), right: twMM(m.right) } };
    const list = zoneCuts(items).map((z) => ({ index: z.index, props: () => ({ page, column: columnsOf(z.zone, docCols), type: D.SectionType.CONTINUOUS }) }));
    return split(items, { initial: { page, column: columnsOf(null, docCols) }, list }).map((s, i) => ({
      properties: { ...s.props, type: i ? s.props.type : undefined },
      children: s.children.length ? s.children : [new D.Paragraph({ children: [] })]
    }));
  }

  // Ce qui change d'une page à l'autre ; une nouvelle section Word commence là où ça change.
  // La première page d'un document à page de garde suit la deuxième : Word la cache à part.
  function pageLook(info, i) {
    const p = info.pages[i];
    const q = i === 0 && info.cfg.firstDifferent && info.pages[1] ? info.pages[1] : p;
    return { orient: p.orient, show: q.num.show, n: p.num.n };
  }

  function sectionCuts(info) {
    const cuts = [];
    for (let i = 1; i < info.pages.length; i++) {
      const a = pageLook(info, i - 1);
      const b = pageLook(info, i);
      const restart = b.n !== null && (a.n === null ? true : b.n !== a.n + 1);
      if (a.orient !== b.orient || a.show !== b.show || restart) cuts.push(i);
    }
    return cuts;
  }

  // Repère les intercalaires qui ouvrent une page où commence une section : le paragraphe ou
  // le tableau qui les contient y sera coupé en deux.
  function markCuts(info) {
    const cuts = sectionCuts(info);
    const o = document.getElementById('page').getBoundingClientRect().top;
    const marked = [];
    for (const gap of editor.querySelectorAll('span.ft-pg-gap, tr.ft-pg-gap')) {
      const y = gap.getBoundingClientRect().bottom - o;
      const i = cuts.find((p) => Math.abs(info.geo[p].ct - y) < 4);
      if (i === undefined) continue;
      gap.dataset.ftCut = i;
      marked.push(gap);
    }
    return () => marked.forEach((g) => g.removeAttribute('data-ft-cut'));
  }

  function pagedSections(info, items, state) {
    const c = info.cfg;
    const pages = info.pages;
    const simple = c.numbers.from === 1 && c.numbers.first === 1 && !Object.keys(c.numbers.skip).length && !c.firstDifferent;
    const numProps = runProps(info.number);
    const pageField = { total: () => (simple ? new D.TextRun({ ...numProps, children: [D.PageNumber.TOTAL_PAGES] }) : new D.TextRun({ ...numProps, text: String(info.total) })) };
    const numTop = c.numbers.pos.startsWith('haut');

    const look = (i) => pageLook(info, i);
    const cuts = sectionCuts(info);
    // Le morceau coupé pour la page i, sinon le premier bloc dont une partie s'y trouve.
    const blockAt = (i) => {
      const cut = items.findIndex((it) => it.cutPage === i);
      if (cut >= 0) return cut;
      const ct = info.geo[i].ct;
      const o = document.getElementById('page').getBoundingClientRect().top;
      // (Sans les paragraphes faits du texte posé directement dans la zone d'écriture : ils la désignent tout entière.)
      let idx = items.findIndex((it) => it.el && it.el !== editor && !it.zone && it.el.getBoundingClientRect().bottom - o > ct + 1);
      if (idx < 0) idx = items.length;
      return idx;
    };

    const sectionFor = (i, first) => {
      const p = pages[i];
      const [w, h] = info.size('portrait');
      const m = c.margins;
      const showNum = look(i).show && c.numbers.on;
      const header = [...(showNum && numTop ? [numberParagraph(info, pageField)] : []), ...(c.header.on ? hfParagraphs(info.header, state) : [])];
      const footer = [...(c.footer.on ? hfParagraphs(info.footer, state) : []), ...(showNum && !numTop ? [numberParagraph(info, pageField)] : [])];
      const props = {
        page: {
          size: { width: twMM(w), height: twMM(h), orientation: p.orient === 'paysage' ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
          margin: { top: twMM(m.top), bottom: twMM(m.bottom), left: twMM(m.left), right: twMM(m.right), header: twMM(info.hfDistance), footer: twMM(info.hfDistance) }
        },
        column: { count: 1 }
      };
      if (p.num.n !== null) props.page.pageNumbers = { start: p.num.n };
      if (first && c.firstDifferent) props.titlePage = true;
      return {
        props,
        headers: { default: new D.Header({ children: header.length ? header : [new D.Paragraph({ children: [] })] }), ...(first && c.firstDifferent ? { first: new D.Header({ children: [new D.Paragraph({ children: [] })] }) } : {}) },
        footers: { default: new D.Footer({ children: footer.length ? footer : [new D.Paragraph({ children: [] })] }), ...(first && c.firstDifferent ? { first: new D.Footer({ children: [new D.Paragraph({ children: [] })] }) } : {}) }
      };
    };

    // Toutes les coupures : pages (nouvelle page) et zones en colonnes (continues), dans l'ordre.
    const list = [];
    let pageOf = 0;
    const pageCuts = cuts.map((i) => ({ index: blockAt(i), page: i }));
    const zones = zoneCuts(items);
    const all = [...pageCuts.map((pc) => ({ ...pc, kind: 'page' })), ...zones.map((z) => ({ index: z.index, zone: z.zone, kind: 'zone' }))]
      .sort((a, b) => a.index - b.index || (a.kind === 'page' ? -1 : 1));
    const first = sectionFor(0, true);
    let zone = null;
    for (const cut of all) {
      list.push({
        index: cut.index,
        props: () => {
          if (cut.kind === 'page') pageOf = cut.page;
          else zone = cut.zone;
          const s = sectionFor(pageOf, false);
          s.props.column = columnsOf(zone);
          s.props.type = cut.kind === 'page' ? D.SectionType.NEXT_PAGE : D.SectionType.CONTINUOUS;
          if (cut.kind === 'zone') delete s.props.page.pageNumbers;
          return s;
        }
      });
    }
    return split(items, { initial: first, list }).map((s) => ({
      properties: s.props.props,
      headers: s.props.headers,
      footers: s.props.footers,
      children: s.children.length ? s.children : [new D.Paragraph({ children: [] })]
    }));
  }

  // Exporte le document ouvert. Les couleurs sont celles du mode jour (papier blanc).
  // Les mesures (retraits, tailles d'images, colonnes des tableaux) se font à 100 % (zoom.js).
  const exportWord = () => (window.FTZoom ? window.FTZoom.realSize(exportAtRealSize) : exportAtRealSize());
  async function exportAtRealSize() {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark';
    if (dark) { root.dataset.theme = 'light'; window.FTCustomize.apply(); }
    let blob;
    try {
      window.FTPages.refresh();
      // (Moteur : tous les blocs affichés, avec leurs coupures de page, le temps de l'export.)
      const doc = V ? await V.showAll(build) : await build();
      blob = await D.Packer.toBlob(doc);
    } finally {
      if (dark) { root.dataset.theme = 'dark'; window.FTCustomize.apply(); }
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  window.FTWord = {
    exportWord,
    // Moteur 2.0 : la zone d'écriture du nouveau moteur.
    useEngine(mount, visibles) {
      editor = mount;
      V = visibles;
    }
  };
})();
