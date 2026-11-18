// Mode avancé : le texte est découpé en pages, comme dans un traitement de texte.
// Le texte reste une seule zone d'écriture. Là où une page se termine, on glisse un
// « intercalaire » invisible (.ft-pg-gap) qui repousse la suite en haut de la page suivante ;
// les feuilles, les en-têtes, les pieds de page et les numéros sont dessinés autour du texte.
// Les intercalaires ne sont jamais enregistrés (voir clean()).
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur découpe lui-même le texte (moteur/visibles.js) ; ce fichier garde
  // les feuilles, les en-têtes, les pieds de page, les numéros et la fenêtre des réglages.
  let engine = null;
  const page = $('page');
  const workspace = $('workspace');
  const modeButtons = [...document.querySelectorAll('#mode-switch button')];
  const setupBtn = $('page-setup');
  const dialog = $('pages-dialog');

  const MM = 96 / 25.4;      // pixels par millimètre
  const SPACING = 28;        // espace entre deux feuilles (px)
  const HF_DIST = 12;        // distance entre l'en-tête (ou le pied de page) et le bord de la feuille (mm)
  const HF_GAP = 4;          // espace minimal entre l'en-tête et le texte (mm)
  const EPS = 0.5;

  const SIZES = [
    { id: 'A4', label: 'A4 (21 × 29,7 cm)', w: 210, h: 297 },
    { id: 'A5', label: 'A5 (14,8 × 21 cm)', w: 148, h: 210 },
    { id: 'A3', label: 'A3 (29,7 × 42 cm)', w: 297, h: 420 },
    { id: 'B5', label: 'B5 (17,6 × 25 cm)', w: 176, h: 250 },
    { id: 'A6', label: 'A6 (10,5 × 14,8 cm)', w: 105, h: 148 },
    { id: 'lettre', label: 'Lettre US (21,6 × 27,9 cm)', w: 215.9, h: 279.4 },
    { id: 'legal', label: 'Légal US (21,6 × 35,6 cm)', w: 215.9, h: 355.6 },
    { id: 'executive', label: 'Exécutif US (18,4 × 26,7 cm)', w: 184.2, h: 266.7 },
    { id: 'perso', label: 'Personnalisée…' }
  ];
  const MARGINS = {
    normales: { top: 25, bottom: 25, left: 25, right: 25 },
    etroites: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
    moyennes: { top: 25.4, bottom: 25.4, left: 19.1, right: 19.1 },
    larges: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 }
  };
  const POSITIONS = [
    ['haut-gauche', 'En haut à gauche'], ['haut-centre', 'En haut au centre'], ['haut-droite', 'En haut à droite'],
    ['bas-gauche', 'En bas à gauche'], ['bas-centre', 'En bas au centre'], ['bas-droite', 'En bas à droite']
  ];
  const FORMATS = [
    ['1', '1'], ['page', 'Page 1'], ['page-sur', 'Page 1 sur 12'], ['sur', '1 / 12'], ['tirets', '- 1 -'], ['p', 'p. 1']
  ];
  const BOXES = [['aucun', 'Aucun'], ['cadre', 'Cadre'], ['cercle', 'Cercle'], ['souligne', 'Souligné'], ['fond', 'Fond coloré']];

  function defaults() {
    return {
      size: 'A4', w: 210, h: 297, orient: 'portrait',
      turned: {},  // pages tournées une à une : { "3": "paysage" }
      margins: { ...MARGINS.normales },
      // skip : pages exclues une à une ({ "3": "saute" } pas de numéro ni de compte, "cache" : comptée sans numéro).
      numbers: { on: true, pos: 'bas-centre', format: '1', from: 1, first: 1, font: '', size: 10, color: '', bold: false, italic: false, box: 'aucun', skip: {} },
      header: { on: true, html: '' },
      footer: { on: true, html: '' },
      firstDifferent: false,
      keep: true,   // chaque page garde son début quand on écrit au-dessus (voir « Pages qui restent en place »)
      chapters: 0,  // nouvelle page avant chaque titre de niveau 1 (1), de niveau 1 ou 2 (2), ou non (0)
      tagsAfterCover: true, // avec une page de titre, les tags du document vont en haut de la page 2
      custom: false  // format et marges choisis par l'utilisateur (sinon le mode note garde sa page habituelle)
    };
  }

  const num = (v, min, max, def) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const pick = (v, list, def) => (list.some((x) => x[0] === v) ? v : def);

  function normalize(s) {
    const d = defaults();
    if (!s || typeof s !== 'object') return d;
    const size = SIZES.find((z) => z.id === s.size) ? s.size : d.size;
    const n = s.numbers || {};
    const m = s.margins || {};
    const turned = {};
    for (const [k, v] of Object.entries(s.turned || {})) {
      if (/^\d+$/.test(k) && (v === 'paysage' || v === 'portrait')) turned[k] = v;
    }
    const skip = {};
    for (const [k, v] of Object.entries(n.skip || {})) {
      if (/^\d+$/.test(k) && (v === 'saute' || v === 'cache')) skip[k] = v;
    }
    const hf = (x) => ({ on: !(x && x.on === false), html: x && typeof x.html === 'string' ? sanitize(x.html) : '' });
    return {
      size,
      w: num(s.w, 40, 1000, d.w),
      h: num(s.h, 40, 1000, d.h),
      orient: s.orient === 'paysage' ? 'paysage' : 'portrait',
      turned,
      margins: {
        top: num(m.top, 0, 120, d.margins.top), bottom: num(m.bottom, 0, 120, d.margins.bottom),
        left: num(m.left, 0, 120, d.margins.left), right: num(m.right, 0, 120, d.margins.right)
      },
      numbers: {
        on: n.on !== false,
        pos: pick(n.pos, POSITIONS, d.numbers.pos),
        format: pick(n.format, FORMATS, d.numbers.format),
        from: Math.round(num(n.from, 1, 9999, 1)),
        first: Math.round(num(n.first, 0, 99999, 1)),
        font: typeof n.font === 'string' ? n.font.slice(0, 120) : '',
        size: num(n.size, 6, 72, 10),
        color: /^#[0-9a-f]{6}$/i.test(n.color || '') ? n.color : '',
        bold: !!n.bold,
        italic: !!n.italic,
        box: pick(n.box, BOXES, 'aucun'),
        skip
      },
      header: hf(s.header),
      footer: hf(s.footer),
      firstDifferent: !!s.firstDifferent,
      keep: s.keep !== false,
      chapters: [1, 2].includes(Number(s.chapters)) ? Number(s.chapters) : 0,
      tagsAfterCover: s.tagsAfterCover !== false,
      custom: !!s.custom
    };
  }

  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form, input, textarea, button').forEach((n) => n.remove());
    doc.body.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'contenteditable') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    });
    const text = doc.body.textContent.trim();
    return text || doc.body.querySelector('img') ? doc.body.innerHTML : '';
  }

  // Retire des intercalaires et des marques de mise en page un morceau de HTML (pour l'enregistrer).
  function clean(html) {
    return html
      .replace(/<(div|span) class="ft-pg-gap"[^>]*><\/\1>/g, '')
      .replace(/<tr class="ft-pg-gap"[^>]*><td[^>]*><\/td><\/tr>/g, '')
      .replace(/<tr class="ft-pg-gap ft-pg-rhead"[^>]*>[\s\S]*?<\/tr>/g, '')
      // Zone en colonnes coupée entre deux pages : ses morceaux redeviennent une seule zone.
      .replace(/<\/div><div [^>]*class="[^"]*\bft-pg-cont\b[^"]*"[^>]*>/g, '')
      .replace(/ class="ft-pg-alt"/g, '')
      .replace(/(class="[^"]*?)\s*\bft-pg-alt\b/g, '$1')
      .replace(/ data-anchor="\d+:[^"]*"/g, '') // ancien ancrage des blocs (retiré en 1.1.5)
      .replace(/ (?:style|class)=""/g, '');
  }

  let mode = 'note';
  let cfg = defaults();
  let geo = [];          // feuilles calculées : { top, left, w, h, ct, cb, turned } (px, depuis le haut de #page)
  let count = 1;         // nombre de pages
  let cur = 0;           // zone en cours pendant le découpage (voir regionAt)
  let regions = [];      // zones où coule le texte : { page, ct, cb, turned }
  let regionPage = 0;    // prochaine page à découper en zones
  let busy = false;
  let frame = 0;
  let composing = false;
  let followCaret = false;
  let editing = null;    // en-tête ou pied de page en cours d'écriture : { kind, i }
  let chrome = { head: 0, foot: 0, num: 0 };
  let onChange = () => {};
  // Découpage après une modification (voir paginateEdit) :
  let dirty = null;            // null : rien ; 'tout' : tout refaire ; { from, to } : blocs du haut modifiés
  const tops = new WeakMap();  // haut de chaque bloc du haut (px depuis #page) après le dernier découpage
  let pending = null;          // découpage pas fini : { el : prochain bloc, cur : sa zone, to : dernier bloc modifié }

  // ----- Feuilles -----

  const sheetsLayer = document.createElement('div');
  sheetsLayer.id = 'pg-sheets';
  const overLayer = document.createElement('div');
  overLayer.id = 'pg-over';
  page.prepend(sheetsLayer);
  page.append(overLayer);
  const parts = { sheet: [], head: [], foot: [], num: [] };

  const orientOf = (i) => cfg.turned[i + 1] || cfg.orient;
  function dims(orient) {
    const [a, b] = [cfg.w, cfg.h];
    return orient === 'paysage' ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
  }
  const baseW = () => dims(cfg.orient)[0] * MM;

  const hasHtml = (kind) => cfg[kind].html !== '';
  // Page de titre en tête du document (cover.js) : la première page n'a ni en-tête, ni pied de page, ni numéro.
  // La page de titre n'existe qu'en mode avancé (en mode note, elle est masquée).
  const coverFirst = () => { const f = editor.firstElementChild; return mode === 'avance' && !!f && f.classList.contains('ft-cover'); };
  const blankFirst = () => cfg.firstDifferent || coverFirst();
  // Tags du document en haut de la page 2 (après la page de titre), décalage du texte de cette page.
  const docTags = $('doc-tags');
  const tagsLater = () => cfg.tagsAfterCover && coverFirst() && !docTags.hidden;
  let tagShift = 0;
  const showsHf = (kind, i) => (editing && editing.kind === kind && editing.i === i) ||
    (cfg[kind].on && hasHtml(kind) && !(i === 0 && blankFirst()));
  // Numéro de la page i : { n, show } (n vaut null pour une page qui n'est pas comptée).
  // Calculé directement, sans repasser par toutes les pages précédentes : il est demandé pour
  // chaque page à chaque découpage.
  function numInfo(i) {
    const c = cfg.numbers;
    const p = i + 1;
    const skip = c.skip[p];
    if (!c.on || p < c.from || skip === 'saute') return { n: null, show: false };
    // Pages comptées avant celle-ci : celles depuis « from », moins les pages sautées.
    let n = c.first + p - c.from;
    for (const key in c.skip) {
      const q = Number(key);
      if (c.skip[key] === 'saute' && String(q) === key && q >= c.from && q < p) n--;
    }
    return { n, show: skip !== 'cache' && !(i === 0 && blankFirst()) };
  }
  const showsNum = (i) => numInfo(i).show;
  function lastNumber() {
    for (let i = count - 1; i >= 0; i--) { const x = numInfo(i); if (x.n !== null) return x.n; }
    return cfg.numbers.first;
  }
  const numTop = () => cfg.numbers.pos.startsWith('haut');

  function pageAt(i) {
    while (geo.length <= i) {
      const k = geo.length;
      const prev = geo[k - 1];
      const [wmm, hmm] = dims(orientOf(k));
      const w = wmm * MM;
      const h = hmm * MM;
      const top = prev ? prev.top + prev.h + SPACING : 0;
      const m = cfg.margins;
      const rt = Math.max(showsHf('header', k) ? chrome.head : 0, showsNum(k) && numTop() ? chrome.num : 0);
      const rb = Math.max(showsHf('footer', k) ? chrome.foot : 0, showsNum(k) && !numTop() ? chrome.num : 0);
      const reserve = (r, margin) => (r ? Math.max(margin * MM, (HF_DIST + HF_GAP) * MM + r) : margin * MM);
      const ct = top + reserve(rt, m.top) + (k === 1 ? tagShift : 0);
      const cb = Math.max(ct + 60, top + h - reserve(rb, m.bottom));
      geo.push({ top, left: (baseW() - w) / 2, w, h, ct, cb, turned: orientOf(k) !== cfg.orient });
    }
    return geo[i];
  }

  // Zones où le texte peut couler : la zone de texte de chaque page.
  function regionAt(r) {
    while (regions.length <= r) {
      const k = regionPage++;
      const g = pageAt(k);
      regions.push({ page: k, ct: g.ct, cb: g.cb, turned: g.turned, full: true });
    }
    return regions[r];
  }

  // Hauteurs de l'en-tête, du pied de page et du numéro, mesurées une fois par découpage.
  function measureChrome() {
    const probe = document.createElement('div');
    probe.className = 'pg-hf';
    probe.style.cssText = `visibility:hidden;width:${contentWidth()}px;left:0;top:0`;
    overLayer.append(probe);
    const height = (kind) => {
      const live = editing && editing.kind === kind && parts[kind === 'header' ? 'head' : 'foot'][editing.i];
      probe.innerHTML = live ? live.innerHTML : cfg[kind].html;
      if (!probe.textContent.trim() && !probe.querySelector('img')) probe.innerHTML = '&nbsp;';
      return probe.offsetHeight;
    };
    chrome.head = height('header');
    chrome.foot = height('footer');
    probe.innerHTML = '';
    const n = numberElement(12, 12);
    probe.append(n);
    chrome.num = n.offsetHeight;
    probe.remove();
  }

  const contentWidth = () => Math.max(80, baseW() - (cfg.margins.left + cfg.margins.right) * MM);

  // ----- Découpage du texte -----

  // Zoom de la zone d'écriture (zoom.js) : les mesures de l'écran sont ramenées à la taille réelle.
  const zk = () => page.currentCSSZoom || 1;
  const pageTop = () => page.getBoundingClientRect().top;
  function box(el) {
    const r = el.getBoundingClientRect();
    const o = pageTop();
    const k = zk();
    return { top: (r.top - o) / k, bottom: (r.bottom - o) / k, height: r.height / k, width: r.width / k };
  }

  const INLINE = new Set(['SPAN', 'B', 'I', 'U', 'S', 'EM', 'STRONG', 'A', 'SUB', 'SUP', 'FONT', 'MARK', 'CODE', 'SMALL', 'BIG', 'Q', 'ABBR', 'STRIKE', 'DEL', 'INS', 'LABEL', 'KBD', 'VAR', 'CITE']);
  const ATOM = new Set(['IMG', 'BR', 'SVG', 'VIDEO', 'CANVAS', 'MATH-FIELD', 'INPUT']);
  const ATOM_BLOCK = new Set(['TABLE', 'HR', 'IMG', 'FIGURE', 'PRE', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME']);
  const CONTAINER = new Set(['UL', 'OL', 'BLOCKQUOTE', 'DL', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'HEADER', 'FOOTER', 'MAIN']);

  const isGap = (n) => n.nodeType === 1 && n.classList.contains('ft-pg-gap');
  // Objets qui ne suivent pas le texte : habillage « carré », devant ou derrière le texte.
  const isLoose = (el) => ['gauche', 'droite', 'devant', 'derriere'].includes(el.dataset && el.dataset.wrap);
  const isAtomInline = (el) => ATOM.has(el.tagName) || el.classList.contains('ft-image') || el.classList.contains('ft-math') ||
    el.getAttribute('contenteditable') === 'false';
  function isBlock(el) {
    if (INLINE.has(el.tagName) && !el.classList.contains('ft-cols')) return false;
    const d = getComputedStyle(el).display;
    return !d.startsWith('inline') && d !== 'contents' && d !== 'none';
  }
  const isAtomBlock = (el) => ATOM_BLOCK.has(el.tagName) || el.classList.contains('ft-math') || el.classList.contains('ft-cols') ||
    el.classList.contains('ft-image') || el.getAttribute('contenteditable') === 'false';
  const hasBlockChild = (el) => [...el.children].some((c) => !isGap(c) && !isLoose(c) && isBlock(c));
  const isZoneEl = (el) => el.parentNode === editor && el.classList.contains('ft-cols');
  const isContainer = (el) => CONTAINER.has(el.tagName) || el.classList.contains('ft-callout') || el.classList.contains('ft-footnotes') ||
    ((el.tagName === 'DIV' || el.tagName === 'LI') && !isZoneEl(el) && hasBlockChild(el));

  // Le curseur et la sélection suivent les blocs déplacés d'une zone à l'autre.
  function keepSelection(fn) {
    const sel = window.getSelection();
    const mark = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
    fn();
    if (mark && mark[0].isConnected && mark[2].isConnected) {
      try { sel.setBaseAndExtent(...mark); } catch { /* la sélection reste où elle est */ }
    }
  }

  // Zone en colonnes plus haute que la place qui reste sur la page : ses premiers blocs restent (en
  // colonnes équilibrées), les suivants passent dans une suite de la zone (.ft-pg-cont), sur la page
  // suivante. La suite n'est jamais enregistrée (voir clean() et mergeZones()). Renvoie la suite, ou null.
  function splitZone(el) {
    const pg = regionAt(cur);
    const kids = [...el.children].filter((c) => !isGap(c));
    if (kids.length < 2) return null;
    const cont = el.cloneNode(false);
    cont.classList.add('ft-pg-cont');
    cont.removeAttribute('id');
    for (const k of ['bm', 'pgStart']) delete cont.dataset[k];
    let best = 0;
    keepSelection(() => {
      el.after(cont);
      const setK = (k) => {
        for (let i = 0; i < kids.length; i++) (i < k ? el : cont).appendChild(kids[i]);
      };
      let lo = 1;
      let hi = kids.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        setK(mid);
        if (box(el).bottom <= pg.cb + EPS) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      setK(best || kids.length);
      if (!best) cont.remove();
    });
    return best ? cont : null;
  }

  // Les suites de zones rejoignent leur zone (avant un nouveau découpage, ou pour l'historique).
  function mergeZones() {
    const conts = editor.querySelectorAll(':scope > .ft-pg-cont');
    if (!conts.length) return;
    keepSelection(() => {
      for (const c of conts) {
        let z = c.previousElementSibling;
        while (z && isGap(z)) z = z.previousElementSibling;
        if (z && z.classList.contains('ft-cols')) { z.append(...c.childNodes); c.remove(); } else c.classList.remove('ft-pg-cont');
      }
    });
  }

  // Les morceaux d'une ligne de texte : nœuds de texte et petits objets dans la ligne.
  function leavesOf(root) {
    const out = [];
    (function collect(node) {
      for (const c of node.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) { if (c.data.length) out.push(c); continue; }
        if (c.nodeType !== Node.ELEMENT_NODE || isGap(c) || isLoose(c)) continue;
        if (isAtomInline(c)) { out.push(c); continue; }
        if (isBlock(c)) continue;
        collect(c);
      }
    })(root);
    return out;
  }

  const range = document.createRange();
  function rectsOf(leaf) {
    if (leaf.nodeType === Node.TEXT_NODE) {
      range.selectNodeContents(leaf);
      return [...range.getClientRects()];
    }
    return [leaf.getBoundingClientRect()];
  }

  // Les lignes d'un paragraphe : { top, bottom } depuis le haut de #page.
  function linesOf(el) {
    const o = pageTop();
    const k = zk();
    const rects = [];
    for (const leaf of leavesOf(el)) {
      for (const r of rectsOf(leaf)) if (r.height > 0) rects.push({ top: (r.top - o) / k, bottom: (r.bottom - o) / k });
    }
    rects.sort((a, b) => a.top - b.top);
    const lines = [];
    for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last && r.top < last.bottom - 2) last.bottom = Math.max(last.bottom, r.bottom);
      else lines.push({ ...r });
    }
    return lines;
  }

  // Premier endroit du paragraphe qui se trouve sur la ligne commençant à lineTop.
  function lineStart(el, lineTop) {
    const o = pageTop();
    const k = zk();
    const on = (r) => (r.top - o) / k >= lineTop - 1;
    for (const leaf of leavesOf(el)) {
      if (leaf.nodeType === Node.ELEMENT_NODE) {
        if (on(leaf.getBoundingClientRect())) return { node: leaf, offset: -1 };
        continue;
      }
      const rs = rectsOf(leaf);
      if (!rs.length || (rs[rs.length - 1].bottom - o) / k <= lineTop + 1) continue;
      const charOn = (i) => {
        range.setStart(leaf, i);
        range.setEnd(leaf, i + 1);
        const cr = [...range.getClientRects()].filter((r) => r.width > 0);
        return cr.length ? on(cr[cr.length - 1]) : false;
      };
      let lo = 0;
      let hi = leaf.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (charOn(mid)) hi = mid;
        else lo = mid + 1;
      }
      if (lo < leaf.length) return { node: leaf, offset: lo };
    }
    return null;
  }

  function makeGap(tag) {
    const gap = document.createElement(tag);
    gap.className = 'ft-pg-gap';
    gap.contentEditable = 'false';
    gap.style.height = '1px';
    return gap;
  }

  // Intercalaire avant un bloc entier : le bloc commence en haut de la page suivante.
  function gapBefore(el, target) {
    const gap = makeGap('div');
    el.parentNode.insertBefore(gap, el);
    const t = box(el).top;
    gap.style.height = Math.max(1, 1 + target - t) + 'px';
  }

  // Intercalaire au milieu d'un paragraphe, au début de la ligne qui ne tient plus.
  function gapInside(pos, target) {
    const gap = makeGap('span');
    let next = pos.node;
    if (pos.offset > 0) next = pos.node.splitText(pos.offset);
    next.parentNode.insertBefore(gap, next);
    const t = box(gap).top;
    gap.style.height = Math.max(1, target - t) + 'px';
  }

  // Découpe un paragraphe entre plusieurs pages. Renvoie false si sa première ligne ne tient déjà pas.
  function splitLines(el) {
    let did = false;
    for (let guard = 0; guard < 400; guard++) {
      const pg = regionAt(cur);
      const lines = linesOf(el);
      const k = lines.findIndex((l) => l.bottom > pg.cb + EPS);
      if (k < 0) return true;
      if (k === 0 && !did) return false;
      if (overdue()) return true;
      if (lines[k].top <= pg.ct + EPS && pg.full) {
        // Une seule ligne plus haute que la page (grande image dans le texte) : on la laisse dépasser.
        while (regionAt(cur).cb < lines[k].bottom - EPS) cur++;
        continue;
      }
      const pos = lineStart(el, lines[k].top);
      if (!pos) return did;
      gapInside(pos, regionAt(cur + 1).ct);
      cur++;
      did = true;
    }
    return did;
  }

  // Première ligne du groupe de lignes liées à la ligne k par des cases fusionnées (rowspan).
  function mergedStart(rows, k) {
    let start = k;
    for (let guard = 0; guard < rows.length; guard++) {
      let moved = false;
      for (let i = 0; i < start; i++) {
        for (const c of rows[i].cells) {
          if (c.rowSpan > 1 && i + c.rowSpan - 1 >= start) { start = i; moved = true; break; }
        }
        if (moved) break;
      }
      if (!moved) return start;
    }
    return start;
  }

  // Découpe un tableau entre deux lignes. Renvoie false si sa première ligne ne tient déjà pas.
  function splitTable(table) {
    let did = false;
    for (let guard = 0; guard < 400; guard++) {
      const pg = regionAt(cur);
      const rows = [...table.rows].filter((r) => !isGap(r));
      let k = rows.findIndex((r) => box(r).bottom > pg.cb + EPS);
      if (k < 0) return true;
      // Case fusionnée sur plusieurs lignes : la coupure passe avant la première de ces lignes,
      // sauf si elles commencent déjà en haut de la page (plus hautes qu'une page).
      const start = mergedStart(rows, k);
      if (start < k && box(rows[start]).top > pg.ct + EPS) k = start;
      if (k === 0 && !did) return false;
      const r = box(rows[k]);
      if (overdue()) return true;
      if (r.top <= pg.ct + EPS && !pg.full && k === 0 && !did) return false;
      if (r.top <= pg.ct + EPS && pg.full) {
        // Une ligne du tableau plus haute que la page : on la laisse dépasser.
        while (regionAt(cur).cb < r.bottom - EPS) cur++;
        continue;
      }
      const gap = document.createElement('tr');
      gap.className = 'ft-pg-gap';
      gap.contentEditable = 'false';
      const cell = document.createElement('td');
      cell.colSpan = 99;
      cell.style.height = '1px';
      gap.append(cell);
      rows[k].parentNode.insertBefore(gap, rows[k]);
      // Ligne d'en-tête répétée en haut de la page suivante (copie d'affichage, jamais enregistrée).
      const head = k > 0 && table.dataset.header && table.dataset.repeat ? headCopy(rows[0]) : null;
      if (head) rows[k].parentNode.insertBefore(head, rows[k]);
      cell.style.height = Math.max(1, 1 + regionAt(cur + 1).ct - box(head || rows[k]).top) + 'px';
      cur++;
      did = true;
    }
    return did;
  }

  // Copie de la ligne d'en-tête : même apparence (styles calculés posés sur les cases, car les règles
  // visent la première ligne), sans identifiants ni marques que d'autres outils compteraient.
  const HEAD_PROPS = ['backgroundColor', 'color', 'fontWeight', 'fontStyle', 'fontSize', 'fontFamily', 'letterSpacing', 'textTransform', 'textAlign',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor',
    'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor', 'borderRightWidth', 'borderRightStyle', 'borderRightColor',
    'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'verticalAlign'];
  function headCopy(row) {
    const copy = row.cloneNode(true);
    copy.className = 'ft-pg-gap ft-pg-rhead';
    copy.contentEditable = 'false';
    copy.setAttribute('aria-hidden', 'true');
    copy.removeAttribute('style');
    [...row.cells].forEach((c, i) => {
      const cs = getComputedStyle(c);
      const to = copy.cells[i];
      for (const p of HEAD_PROPS) to.style[p] = cs[p];
    });
    copy.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('id');
      for (const a of [...el.attributes]) if (a.name.startsWith('data-') || a.name === 'class') el.removeAttribute(a.name);
    });
    return copy;
  }

  // Garde-fou : un découpage trop long s'arrête plutôt que de bloquer le logiciel.
  let deadline = 0;
  const overdue = () => performance.now() > deadline;

  function place(el, top) {
    let wide = true;
    // Bloc qui ouvrait une page (voir « Pages qui restent en place ») : s'il n'est plus en haut
    // d'une page, il passe en haut de la suivante, avec toute la suite.
    if (top && cfg.keep && el.dataset.pgStart) {
      for (let guard = 0; guard < 400 && box(el).top > regionAt(cur).cb - EPS; guard++) cur++;
      if (box(el).top > regionAt(cur).ct + EPS) {
        gapBefore(el, regionAt(cur + 1).ct);
        cur++;
      }
    }
    // Légende d'un tableau (captions.js) : elle passe à la page suivante avec le tableau
    // si la première ligne de celui-ci ne tient plus sous elle.
    if (el.classList.contains('ft-legend')) {
      let next = el.nextElementSibling;
      while (next && isGap(next)) next = next.nextElementSibling;
      const pg = regionAt(cur);
      const r = box(el);
      if (next && next.tagName === 'TABLE' && next.rows[0] && r.top > pg.ct + EPS && r.top < pg.cb - EPS &&
          box(next.rows[0]).bottom > pg.cb + EPS) {
        gapBefore(el, regionAt(cur + 1).ct);
        cur++;
      }
    }
    for (let guard = 0; guard < 400; guard++) {
      if (overdue()) return;
      const pg = regionAt(cur);
      if (top) el.classList.toggle('ft-pg-alt', pg.turned && wide);
      const r = box(el);
      if (!r.height && !r.width) return;
      if (r.top > pg.cb - EPS) {
        // Commence plus bas que la zone de texte de cette page.
        cur++;
        continue;
      }
      if (r.top < pg.ct - EPS && cur > 0) { gapBefore(el, pg.ct); continue; }
      if (r.bottom <= pg.cb + EPS) return;
      if (top && pg.turned && wide) {
        // Un bloc à cheval sur une page tournée et la suivante garde la largeur ordinaire.
        wide = false;
        continue;
      }
      if (isZoneEl(el)) {
        const cont = splitZone(el);
        if (cont) {
          gapBefore(cont, regionAt(cur + 1).ct);
          cur++;
          place(cont, top);
          return;
        }
      }
      if (isContainer(el)) {
        // Texte propre au bloc (début d'un élément de liste qui contient une sous-liste…), puis ses blocs.
        const own = leavesOf(el).some((l) => l.nodeType === Node.ELEMENT_NODE || l.data.trim());
        if (own && !splitLines(el) && r.top > pg.ct + EPS) {
          gapBefore(el, regionAt(cur + 1).ct);
          cur++;
          continue;
        }
        walk(el, false);
        return;
      }
      if (el.tagName === 'TABLE' && splitTable(el)) return;
      const text = !isAtomBlock(el);
      if (text && splitLines(el)) return;
      if (r.top > pg.ct + EPS || !pg.full) {
        gapBefore(el, regionAt(cur + 1).ct);
        cur++;
        continue;
      }
      // Déjà en haut de la page et plus grand qu'elle : on le laisse dépasser.
      while (regionAt(cur).cb < r.bottom - EPS) cur++;
      return;
    }
  }

  function walk(container, top) {
    for (const el of [...container.children]) {
      if (isGap(el) || isLoose(el)) continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') continue;
      place(el, top);
    }
  }

  function removeGaps() {
    if (engine) return;
    mergeZones();
    const parents = new Set();
    editor.querySelectorAll('.ft-pg-gap').forEach((g) => { parents.add(g.parentNode); g.remove(); });
    parents.forEach((p) => { if (p.isConnected) p.normalize(); });
    editor.querySelectorAll('.ft-pg-alt').forEach((el) => {
      el.classList.remove('ft-pg-alt');
      if (!el.classList.length) el.removeAttribute('class');
    });
  }

  // ----- Pages qui restent en place -----
  // Quand on modifie le texte, chaque page qui suit et qui commence par un bloc entier (un titre,
  // un paragraphe…) garde ce bloc en haut : data-pg-start sur le bloc. Si le texte d'avant grandit
  // et déborde, ce bloc passe en haut de la page suivante avec toute la suite ; s'il raccourcit,
  // la page garde son début. « Remettre le texte à la suite » (Réglages des pages) les libère.

  // Seules les pages déjà là sont gardées : une page qui vient de se former parce que le texte
  // d'au-dessus a débordé (« flowing ») suit le texte, sinon chaque touche ajouterait une page.
  let keepSeq = Date.now() % 100000;
  let flowing = new WeakSet();
  // Les blocs du haut qui ouvrent une page (intercalaire de page juste avant eux).
  function pageStarts() {
    const out = new Set();
    for (const gap of editor.querySelectorAll(':scope > div.ft-pg-gap')) {
      const b = realBlock(gap.nextElementSibling, false);
      if (b && !isLoose(b)) out.add(b);
    }
    return out;
  }
  // Avant de refaire les pages après une modification : les pages qui suivent gardent leur début.
  function keepStartsAfter(after, starts) {
    if (!cfg.keep || !after) return;
    for (const b of starts) {
      if (b.dataset.pgStart || flowing.has(b) || !before(after, b)) continue;
      b.dataset.pgStart = (++keepSeq).toString(36);
    }
  }
  // Après : les nouveaux débuts de page sous la modification viennent du débordement.
  function noteFlowing(after, old) {
    const now = pageStarts();
    for (const b of now) if (!old.has(b) && before(after, b)) flowing.add(b);
    for (const b of old) if (!now.has(b)) flowing.delete(b);
  }
  // Entrée au milieu d'un bloc gardé recopie sa marque sur le nouveau bloc : on n'en garde qu'une,
  // sur le bloc qui a du texte (le premier si les deux en ont).
  function tidyStarts() {
    const seen = new Map();
    const empty = (el) => !el.textContent.trim() && !el.querySelector('img, table, .ft-image, .ft-math, hr');
    for (const el of editor.querySelectorAll('[data-pg-start]')) {
      if (el.parentNode !== editor) { delete el.dataset.pgStart; continue; }
      const prev = seen.get(el.dataset.pgStart);
      if (!prev) { seen.set(el.dataset.pgStart, el); continue; }
      if (empty(prev) && !empty(el)) { delete prev.dataset.pgStart; seen.set(el.dataset.pgStart, el); } else delete el.dataset.pgStart;
    }
    // Ancien ancrage des blocs (avant la 1.1.5) : le bloc suit à nouveau le texte.
    editor.querySelectorAll(':scope > [data-anchor]').forEach((el) => { if (/^\d+:/.test(el.dataset.anchor)) delete el.dataset.anchor; });
  }
  const keptCount = () => (engine ? engine.keptCount() : editor.querySelectorAll(':scope > [data-pg-start]').length);
  function releaseAll() {
    if (engine) return engine.releaseAll();
    const kept = editor.querySelectorAll(':scope > [data-pg-start]');
    if (!kept.length) return;
    const S = window.FTStructure;
    if (S) S.checkpoint();
    kept.forEach((el) => { delete el.dataset.pgStart; });
    if (S) S.changed();
    paginate();
  }

  // Mode lecture (reading.js) : les pages sont suspendues, le texte reste sans intercalaires.
  let suspended = false;
  let coverWas = false;
  const visible = () => mode === 'avance' && !suspended && !page.hidden && page.offsetParent !== null;

  // Page de titre : elle tient la place du reste de la zone de texte de la première page (sous les tags
  // du document) et s'étend sous les marges jusqu'aux bords de la feuille (la place qu'elle prend dans
  // le texte ne change pas : marges négatives).
  function coverSize(first) {
    coverWas = coverFirst();
    page.classList.toggle('pg-cover', coverWas);
    const edTop = (editor.getBoundingClientRect().top - pageTop()) / zk();
    const h = Math.floor(first.cb - Math.max(first.ct, edTop));
    // (Sur la page, pas sur la zone d'écriture : un geste en cours sur le texte y défait ce qui change.)
    const set = (k, v) => page.style.setProperty(k, Math.max(0, v) + 'px');
    set('--ft-cover-h', h);
    set('--ft-cover-t', edTop - first.top);
    set('--ft-cover-b', first.top + first.h - edTop - h);
    set('--ft-cover-l', cfg.margins.left * MM - first.left);
    set('--ft-cover-r', cfg.margins.right * MM - (baseW() - first.left - first.w));
  }

  function paginate() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    if (!visible() || composing) return;
    if (engine) return paginateEngine();
    busy = true;
    // Le temps du découpage, la page raccourcit : la vue revient ensuite là où elle était
    // (sinon elle remonte au début, par exemple quand un objet change de place).
    const scroll = workspace.scrollTop;
    try {
      removeGaps();
      geo = [];
      regions = [];
      regionPage = 0;
      tidyStarts();
      measureChrome();
      // Tags après la page de titre : hors du flux, posés en haut de la zone de texte de la page 2.
      const later = tagsLater();
      page.classList.toggle('pg-tags-later', later);
      tagShift = 0;
      if (later) {
        const shift = docTags.offsetHeight + parseFloat(getComputedStyle(docTags).marginBottom || 0) + 4;
        docTags.style.top = pageAt(1).ct + 'px';
        docTags.style.left = cfg.margins.left * MM + 'px';
        docTags.style.right = cfg.margins.right * MM + 'px';
        geo = [];
        tagShift = shift;
      } else {
        for (const k of ['top', 'left', 'right']) docTags.style[k] = '';
      }
      const first = pageAt(0);
      const w = baseW();
      page.style.width = w + 'px';
      page.style.paddingTop = first.ct + 'px';
      page.style.paddingLeft = cfg.margins.left * MM + 'px';
      page.style.paddingRight = cfg.margins.right * MM + 'px';
      // Page de titre : le reste de la zone de texte de la première page (sous les tags du document).
      coverSize(first);
      // Les pages tournées sont plus larges ou plus étroites que les autres.
      const [tw] = dims(cfg.orient === 'paysage' ? 'portrait' : 'paysage');
      page.style.setProperty('--pg-shift', (w - tw * MM) / 2 + 'px');
      cur = 0;
      deadline = performance.now() + 1500;
      try {
        walk(editor, true);
      } catch (err) {
        console.error('Découpage en pages :', err);
      }
      count = Math.max(regionAt(cur).page + 1, 1);
      draw();
      rememberTops(editor.firstElementChild);
    } finally {
      observer.takeRecords();
      busy = false;
      dirty = null;
      if (workspace.scrollTop !== scroll) workspace.scrollTop = scroll;
    }
    if (followCaret) {
      followCaret = false;
      keepCaretVisible();
    }
    document.dispatchEvent(new Event('ft-paginated'));
  }

  // Moteur 2.0 : les réglages des pages sont posés, puis le moteur refait tout le découpage.
  let drawn = false;
  let engineReady = false; // réglages posés depuis le dernier changement de mode
  function paginateEngine() {
    geo = [];
    regions = [];
    regionPage = 0;
    measureChrome();
    const later = tagsLater();
    page.classList.toggle('pg-tags-later', later);
    tagShift = 0;
    if (later) {
      const shift = docTags.offsetHeight + parseFloat(getComputedStyle(docTags).marginBottom || 0) + 4;
      docTags.style.top = pageAt(1).ct + 'px';
      docTags.style.left = cfg.margins.left * MM + 'px';
      docTags.style.right = cfg.margins.right * MM + 'px';
      geo = [];
      tagShift = shift;
    } else {
      for (const k of ['top', 'left', 'right']) docTags.style[k] = '';
    }
    const first = pageAt(0);
    const w = baseW();
    page.style.width = w + 'px';
    page.style.paddingTop = first.ct + 'px';
    page.style.paddingLeft = cfg.margins.left * MM + 'px';
    page.style.paddingRight = cfg.margins.right * MM + 'px';
    coverSize(first);
    const [tw] = dims(cfg.orient === 'paysage' ? 'portrait' : 'paysage');
    page.style.setProperty('--pg-shift', (w - tw * MM) / 2 + 'px');
    drawn = false;
    engineReady = true;
    engine.repaginate();
    if (!drawn) engineCount(count);
  }
  function engineCount(n) {
    if (mode !== 'avance') return;
    if (n === count && drawn) return;
    count = Math.max(1, n);
    drawn = true;
    draw();
    document.dispatchEvent(new Event('ft-paginated'));
  }

  function schedule() {
    if (engine) {
      // Page affichée après coup (document ouvert alors qu'elle était cachée), ou en-tête / pied de page
      // en cours d'écriture (sa hauteur change la zone de texte) : réglages et découpage.
      if (mode === 'avance' && (!engineReady || editing) && !frame) frame = requestAnimationFrame(() => { frame = 0; paginate(); });
      return;
    }
    dirty = 'tout';
    if (!frame && mode === 'avance') frame = requestAnimationFrame(paginateEdit);
  }

  // ----- Découpage après une modification du texte : seulement à partir de l'endroit modifié -----
  // Dans un long document, refaire toutes les pages à chaque touche serait trop lent. On garde les
  // intercalaires d'avant le premier bloc modifié, on refait les blocs à partir de lui, et on s'arrête
  // dès qu'un bloc suivant (non modifié) retombe exactement à la même place qu'avant : la suite des
  // pages est alors inchangée.


  const topBlockOf = (n) => {
    while (n && n.parentNode !== editor) n = n.parentNode;
    return n || null;
  };
  // Le premier vrai bloc à partir de n (en sautant les intercalaires), vers l'avant ou l'arrière.
  function realBlock(n, back) {
    while (n && n.nodeType === Node.ELEMENT_NODE && isGap(n)) n = back ? n.previousElementSibling : n.nextElementSibling;
    return n && n.nodeType === Node.ELEMENT_NODE ? n : null;
  }
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  function markDirty(records) {
    if (dirty === 'tout') return;
    for (const r of records) {
      const blocks = [];
      if (r.target === editor) {
        // Blocs ajoutés ou retirés : le bloc d'avant (s'il existe) et ceux ajoutés.
        const prev = r.previousSibling && realBlock(r.previousSibling.nodeType === Node.ELEMENT_NODE ? r.previousSibling : r.previousSibling.previousElementSibling, true);
        if (prev && prev.parentNode === editor) blocks.push(prev);
        for (const a of r.addedNodes) if (a.parentNode === editor && a.nodeType === Node.ELEMENT_NODE && !isGap(a)) blocks.push(a);
        const next = r.nextSibling && realBlock(r.nextSibling.nodeType === Node.ELEMENT_NODE ? r.nextSibling : r.nextSibling.nextElementSibling, false);
        if (next && next.parentNode === editor) blocks.push(next);
        if (!blocks.length) { dirty = 'tout'; return; }
      } else {
        const b = topBlockOf(r.target);
        if (!b || !b.isConnected) continue;
        if (b.nodeType !== Node.ELEMENT_NODE) { dirty = 'tout'; return; }
        blocks.push(isGap(b) ? realBlock(b, false) || realBlock(b, true) : b);
      }
      for (const b of blocks) {
        if (!b) continue;
        if (!dirty) dirty = { from: b, to: b };
        if (before(b, dirty.from)) dirty.from = b;
        if (before(dirty.to, b)) dirty.to = b;
      }
    }
  }

  function scheduleEdit(records) {
    if (engine) return;
    markDirty(records || []);
    if (!dirty && !pending) return;
    if (!frame && mode === 'avance') frame = requestAnimationFrame(paginateEdit);
  }

  function rememberTops(from) {
    const o = pageTop();
    const k = zk();
    for (let b = from; b; b = b.nextElementSibling) if (!isGap(b)) tops.set(b, (b.getBoundingClientRect().top - o) / k);
  }

  // Retire les intercalaires d'un bloc du haut (et celui juste avant lui).
  function strip(el) {
    for (let g = el.previousElementSibling; g && isGap(g); g = el.previousElementSibling) g.remove();
    const gaps = el.querySelectorAll('.ft-pg-gap');
    if (gaps.length) {
      const parents = new Set();
      gaps.forEach((g) => { parents.add(g.parentNode); g.remove(); });
      parents.forEach((p) => { if (p.isConnected) p.normalize(); });
    }
    if (el.classList.contains('ft-pg-alt')) {
      el.classList.remove('ft-pg-alt');
      if (!el.classList.length) el.removeAttribute('class');
    }
    el.querySelectorAll('.ft-pg-alt').forEach((x) => x.classList.remove('ft-pg-alt'));
  }

  const SLICE = 25; // ms de travail par image, au plus
  const later = (a, b) => (!a ? b : !b ? a : before(a, b) ? b : a);
  const okBlock = (el) => el && el.isConnected && el.parentNode === editor;

  function paginateEdit() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const d = dirty;
    if (!d && !pending) return;
    if (!visible() || composing) return;
    // Cas à tout refaire : premier découpage, modifications difficiles à situer, zone coupée entre deux pages.
    if (d === 'tout' || editor.querySelector(':scope > .ft-pg-cont') || !geo.length || coverFirst() !== coverWas || (d && (!okBlock(d.from) || !okBlock(d.to))) ||
        (pending && !okBlock(pending.el))) return paginate();
    busy = true;
    let reachedEnd = true;
    const oldStarts = pageStarts();
    let editEnd = null;
    try {
      deadline = performance.now() + 1500;
      const sliceEnd = performance.now() + SLICE;
      let el;
      let to;
      if (pending && (!d || !before(d.from, pending.el))) {
        // On reprend là où la tranche précédente s'était arrêtée (rien n'a changé avant).
        el = pending.el;
        cur = pending.cur;
        to = later(pending.to, d && d.to);
        strip(el);
      } else {
        el = d.from;
        to = later(d.to, pending && pending.el);
        // Les pages d'après la modification gardent leur début.
        tidyStarts();
        keepStartsAfter(to, pageStarts());
        strip(el);
        // La zone où commence ce bloc : celle où l'a laissé le bloc d'avant (inchangé).
        const t = box(el).top;
        cur = 0;
        while (regionAt(cur).cb < t - EPS && cur < 100000) cur++;
      }
      pending = null;
      editEnd = to;
      let pastEdit = false;
      while (el) {
        const pos = getComputedStyle(el).position;
        if (!isLoose(el) && pos !== 'absolute' && pos !== 'fixed') place(el, true);
        if (el === to || before(to, el)) pastEdit = true;
        tops.set(el, box(el).top);
        const next = realBlock(el.nextElementSibling, false);
        if (!next) break;
        if (pastEdit) {
          const old = tops.get(next);
          if (old !== undefined && Math.abs(box(next).top - old) < 0.5) { reachedEnd = false; break; }
        }
        if (performance.now() > sliceEnd) {
          pending = { el: next, cur, to };
          reachedEnd = false;
          break;
        }
        strip(next);
        el = next;
      }
      if (reachedEnd) {
        count = Math.max(regionAt(cur).page + 1, 1);
        draw();
      }
      if (editEnd && editEnd.isConnected) noteFlowing(editEnd, oldStarts);
    } catch (err) {
      console.error('Découpage en pages :', err);
      pending = null;
    } finally {
      observer.takeRecords();
      busy = false;
      dirty = null;
    }
    if (followCaret) {
      followCaret = false;
      keepCaretVisible();
    }
    if (pending) frame = requestAnimationFrame(paginateEdit);
    else document.dispatchEvent(new Event('ft-paginated'));
  }

  function keepCaretVisible() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.focusNode)) return;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(false);
    let rect = r.getBoundingClientRect();
    if (!rect.height) {
      let elNode = sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode : sel.focusNode.parentElement;
      // Objet sélectionné (tableau, image…) : la sélection l'entoure, c'est lui qui doit rester visible
      // (et non tout le texte, ce qui ramenait la vue au début du document).
      const child = sel.focusNode.nodeType === Node.ELEMENT_NODE && (sel.focusNode.childNodes[sel.focusOffset - 1] || sel.focusNode.childNodes[sel.focusOffset]);
      if (child && child.nodeType === Node.ELEMENT_NODE) elNode = child;
      rect = elNode.getBoundingClientRect();
      const v = workspace.getBoundingClientRect();
      if (elNode === child && rect.bottom > v.top && rect.top < v.bottom) return; // déjà en vue, même en partie
    }
    const view = workspace.getBoundingClientRect();
    if (rect.bottom > view.bottom - 16) workspace.scrollTop += rect.bottom - view.bottom + 40;
    else if (rect.top < view.top + 16) workspace.scrollTop -= view.top - rect.top + 40;
  }

  // ----- Dessin des feuilles, en-têtes, pieds de page et numéros -----

  function sync(list, layer, n, make) {
    while (list.length < n) { const e = make(); layer.append(e); list.push(e); }
    while (list.length > n) list.pop().remove();
  }

  function numberText(i) {
    const n = numInfo(i).n;
    const total = lastNumber();
    return formatNumber(n, total);
  }

  function formatNumber(n, total) {
    switch (cfg.numbers.format) {
      case 'page': return `Page ${n}`;
      case 'page-sur': return `Page ${n} sur ${total}`;
      case 'sur': return `${n} / ${total}`;
      case 'tirets': return `- ${n} -`;
      case 'p': return `p. ${n}`;
      default: return String(n);
    }
  }

  function numberElement(n, total) {
    const s = document.createElement('span');
    s.className = 'pg-num';
    styleNumber(s);
    s.textContent = cfg.numbers.format.includes('sur') ? `${n} ${total}` : String(n);
    return s;
  }

  function styleNumber(s) {
    const c = cfg.numbers;
    s.dataset.box = c.box;
    s.style.fontFamily = c.font ? `"${c.font}", Georgia, serif` : '';
    s.style.fontSize = c.size + 'pt';
    s.style.color = c.color || '';
    s.style.fontWeight = c.bold ? '700' : '';
    s.style.fontStyle = c.italic ? 'italic' : '';
  }

  function draw() {
    const m = cfg.margins;
    sync(parts.sheet, sheetsLayer, count, () => Object.assign(document.createElement('div'), { className: 'pg-sheet' }));
    sync(parts.head, overLayer, count, () => hfElement('header'));
    sync(parts.foot, overLayer, count, () => hfElement('footer'));
    sync(parts.num, overLayer, count, () => {
      const row = Object.assign(document.createElement('div'), { className: 'pg-num-row' });
      row.append(Object.assign(document.createElement('span'), { className: 'pg-num' }));
      return row;
    });
    const [vert, horiz] = cfg.numbers.pos.split('-');
    let minLeft = 0;
    for (let i = 0; i < count; i++) {
      const g = pageAt(i);
      minLeft = Math.min(minLeft, g.left);
      Object.assign(parts.sheet[i].style, { top: g.top + 'px', left: g.left + 'px', width: g.w + 'px', height: g.h + 'px' });
      const x = g.left + m.left * MM;
      const w = Math.max(40, g.w - (m.left + m.right) * MM);
      for (const [kind, el] of [['header', parts.head[i]], ['footer', parts.foot[i]]]) {
        const isEditing = editing && editing.kind === kind && editing.i === i;
        el.hidden = !showsHf(kind, i);
        el.dataset.page = String(i);
        const y = kind === 'header' ? g.top + HF_DIST * MM : g.top + g.h - HF_DIST * MM;
        Object.assign(el.style, { top: y + 'px', left: x + 'px', width: w + 'px' });
        if (!isEditing && el.innerHTML !== cfg[kind].html) el.innerHTML = cfg[kind].html;
      }
      const row = parts.num[i];
      row.hidden = !showsNum(i);
      const y = vert === 'haut' ? g.top + HF_DIST * MM : g.top + g.h - HF_DIST * MM;
      Object.assign(row.style, { top: y + 'px', left: x + 'px', width: w + 'px' });
      row.dataset.v = vert;
      row.dataset.h = horiz;
      const s = row.firstChild;
      styleNumber(s);
      if (!row.hidden) s.textContent = numberText(i);
    }
    const last = pageAt(count - 1);
    page.style.height = last.top + last.h + 'px';
    const extra = Math.ceil(-minLeft);
    page.style.marginLeft = page.style.marginRight = extra > 0 ? `max(${extra}px, calc(50% - ${baseW() / 2}px))` : '';
  }

  function hfElement(kind) {
    const el = document.createElement('div');
    el.className = 'pg-hf ' + (kind === 'header' ? 'pg-head' : 'pg-foot');
    el.dataset.placeholder = kind === 'header' ? 'En-tête' : 'Pied de page';
    el.spellcheck = true;
    el.addEventListener('input', () => {
      if (!editing || editing.kind !== kind) return;
      const list = kind === 'header' ? parts.head : parts.foot;
      for (const other of list) if (other !== el) other.innerHTML = el.innerHTML;
      schedule();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
    });
    el.addEventListener('focusout', () => {
      if (editing && editing.kind === kind && el.isContentEditable) endEdit();
    });
    return el;
  }

  // ----- En-tête et pied de page : écriture par double-clic -----

  function startEdit(kind, i) {
    if (mode !== 'avance') return;
    if (editing) endEdit();
    cfg[kind].on = true;
    editing = { kind, i: Math.min(i, count - 1) };
    page.classList.add('pg-hf-editing');
    paginate();
    const el = (kind === 'header' ? parts.head : parts.foot)[editing.i];
    if (!el) { editing = null; return; }
    el.hidden = false;
    el.contentEditable = 'true';
    el.classList.add('editing');
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function endEdit() {
    if (!editing) return;
    const { kind, i } = editing;
    const el = (kind === 'header' ? parts.head : parts.foot)[i];
    editing = null;
    page.classList.remove('pg-hf-editing');
    if (el) {
      cfg[kind].html = sanitize(el.innerHTML);
      el.contentEditable = 'false';
      el.classList.remove('editing');
    }
    onChange();
    paginate();
    if (dialog.open) fillDialog();
  }

  // Page sous un point de l'écran (index, ou -1).
  function pageIndexAt(clientY) {
    const y = (clientY - pageTop()) / zk();
    for (let i = 0; i < count; i++) {
      const g = pageAt(i);
      if (y >= g.top - SPACING / 2 && y < g.top + g.h + SPACING / 2) return i;
    }
    return -1;
  }

  function zoneAt(clientY) {
    const i = pageIndexAt(clientY);
    if (i < 0) return null;
    const g = pageAt(i);
    const y = (clientY - pageTop()) / zk();
    if (y >= g.top && y < g.ct) return { kind: 'header', i };
    if (y > g.cb && y <= g.top + g.h) return { kind: 'footer', i };
    return { kind: 'text', i };
  }

  page.addEventListener('dblclick', (e) => {
    if (mode !== 'avance' || e.target.closest('.pg-hf.editing')) return;
    const z = zoneAt(e.clientY);
    if (!z || z.kind === 'text') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    startEdit(z.kind, z.i);
  }, true);

  // Un clic dans la marge du haut ou du bas d'une page coupée au milieu d'un tableau ne sélectionne pas le tableau.
  page.addEventListener('mousedown', (e) => {
    if (mode !== 'avance' || !e.target.closest('#editor table')) return;
    const z = zoneAt(e.clientY);
    if (!z || z.kind === 'text') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // ----- Pages tournées et clic droit -----

  function turn(i) {
    const want = orientOf(i) === 'paysage' ? 'portrait' : 'paysage';
    if (want === cfg.orient) delete cfg.turned[i + 1];
    else cfg.turned[i + 1] = want;
    changed();
  }

  function menuItems(clientY) {
    if (mode !== 'avance') return [];
    const z = zoneAt(clientY);
    if (!z) return [];
    const items = [];
    if (z.kind === 'header') items.push({ text: "Modifier l'en-tête", action: () => startEdit('header', z.i) });
    if (z.kind === 'footer') items.push({ text: 'Modifier le pied de page', action: () => startEdit('footer', z.i) });
    items.push({ text: 'Réglages des pages…', action: openDialog });
    return items;
  }

  page.addEventListener('contextmenu', (e) => {
    if (mode !== 'avance' || editor.contains(e.target) || e.target.closest('.pg-hf.editing')) return;
    const items = menuItems(e.clientY);
    if (!items.length || !window.FTSidebar) return;
    e.preventDefault();
    window.FTSidebar.showMenu(e.clientX, e.clientY, items);
  });

  // ----- Suivi des modifications du texte -----

  const observer = new MutationObserver((records) => { if (!busy) scheduleEdit(records); });

  editor.addEventListener('input', () => {
    if (mode !== 'avance') return;
    followCaret = true;
    scheduleEdit(observer.takeRecords());
  });
  editor.addEventListener('compositionstart', () => { composing = true; });
  editor.addEventListener('compositionend', () => { composing = false; schedule(); });
  editor.addEventListener('load', schedule, true);
  if (document.fonts) document.fonts.addEventListener('loadingdone', schedule);
  new ResizeObserver(schedule).observe(workspace);

  // Effacer juste avant ou juste après un intercalaire efface le texte voisin, pas l'intercalaire.
  editor.addEventListener('keydown', (e) => {
    if (mode !== 'avance' || (e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.altKey || e.metaKey) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const back = e.key === 'Backspace';
    const gap = gapNextTo(sel.anchorNode, sel.anchorOffset, back);
    if (!gap) return;
    if (gap.tagName === 'SPAN') {
      // Au début d'une ligne en haut de page : on efface le caractère de la fin de la page d'avant.
      const leaf = back ? previousLeaf(gap) : nextLeaf(gap);
      const block = (n) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : n).closest('p, li, h1, h2, h3, h4, h5, h6, div, td, th, blockquote');
      if (leaf && block(leaf) === block(gap) && block(sel.anchorNode) === block(gap) && deleteOne(leaf, back)) {
        e.preventDefault();
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: back ? 'deleteContentBackward' : 'deleteContentForward' }));
        return;
      }
    }
    // Entre deux paragraphes : on retire l'intercalaire et le navigateur réunit les paragraphes.
    busy = true;
    gap.remove();
    observer.takeRecords();
    busy = false;
    followCaret = true;
    schedule();
  }, true);

  function deleteOne(leaf, back) {
    if (leaf.nodeType === Node.TEXT_NODE) {
      if (!leaf.length) return false;
      let i = back ? leaf.length - 1 : 0;
      let n = 1;
      const code = leaf.data.charCodeAt(i);
      if (back && i > 0 && code >= 0xdc00 && code <= 0xdfff) { i--; n = 2; }
      if (!back && code >= 0xd800 && code <= 0xdbff && leaf.length > 1) n = 2;
      leaf.deleteData(i, n);
      return true;
    }
    if (leaf.tagName === 'BR' || leaf.classList.contains('ft-image') || leaf.classList.contains('ft-math') || leaf.tagName === 'IMG') {
      leaf.remove();
      return true;
    }
    return false;
  }

  // L'intercalaire collé au curseur, du côté où l'on efface.
  function gapNextTo(node, offset, back) {
    let side;
    if (node.nodeType === Node.TEXT_NODE) {
      if (back ? offset > 0 : offset < node.length) return null;
      side = back ? previousLeaf(node) : nextLeaf(node);
    } else {
      const child = node.childNodes[back ? offset - 1 : offset];
      side = child ? (back ? deepLast(child) : deepFirst(child)) : (back ? previousLeaf(node) : nextLeaf(node));
    }
    // Les nœuds vides et les retours à la ligne entre deux blocs ne comptent pas.
    for (let i = 0; side && i < 6 && side.nodeType === Node.TEXT_NODE &&
      (!side.length || (!side.data.trim() && (side.parentNode === editor || CONTAINER.has(side.parentNode.tagName)))); i++) {
      side = back ? previousLeaf(side) : nextLeaf(side);
    }
    return side && isGap(side) ? side : null;
  }

  const deepLast = (n) => { while (n && n.lastChild && !isGap(n)) n = n.lastChild; return n; };
  const deepFirst = (n) => { while (n && n.firstChild && !isGap(n)) n = n.firstChild; return n; };
  function previousLeaf(n) {
    while (n && n !== editor && !n.previousSibling) n = n.parentNode;
    return n && n !== editor ? deepLast(n.previousSibling) : null;
  }
  function nextLeaf(n) {
    while (n && n !== editor && !n.nextSibling) n = n.parentNode;
    return n && n !== editor ? deepFirst(n.nextSibling) : null;
  }

  // Le curseur ne reste jamais collé à un intercalaire (clic dans l'espace entre deux pages,
  // flèches, découpage pendant la frappe) : il y serait dessiné aussi haut que l'intercalaire,
  // à cheval sur les deux pages. On le met dans le texte voisin, au même endroit du texte.
  // C'est seulement l'affichage du curseur : le texte et les intercalaires ne sont pas touchés.
  let lastFix = null; // { node, offset } : où était le curseur juste avant
  function fixCaret() {
    if (mode !== 'avance' || busy || engine) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode;
    const o = sel.anchorOffset;
    const previous = lastFix;
    lastFix = { node: n, offset: o };
    if (!n || !editor.contains(n)) return;
    const put = (node, offset) => { lastFix = { node, offset }; sel.collapse(node, offset); };
    if (n.nodeType === Node.TEXT_NODE) {
      // Fin d'un morceau de texte (ou ses espaces de fin, invisibles en bout de ligne) juste
      // avant un intercalaire : c'est le même endroit que le début du texte de la page suivante.
      // (Seulement l'intercalaire au milieu d'un paragraphe : la fin d'un paragraphe et le début
      // du suivant sont deux endroits différents.)
      const trimmed = n.data.replace(/\s+$/, '').length;
      if (!/^\s*$/.test(n.data.slice(o)) || (o <= trimmed && o < n.length)) return;
      const gap = gapNextTo(n, n.length, false);
      if (!gap || gap.tagName !== 'SPAN') return;
      let leaf = nextLeaf(gap);
      while (leaf && isGap(leaf)) leaf = nextLeaf(leaf);
      // Flèche gauche depuis le haut de la page suivante : on recule vraiment d'un caractère.
      if (previous && leaf && previous.node === leaf && previous.offset === 0) return put(n, trimmed);
      if (!leaf || !editor.contains(leaf)) return;
      if (leaf.nodeType === Node.TEXT_NODE) put(leaf, 0);
      else if (leaf.parentNode) put(leaf.parentNode, [...leaf.parentNode.childNodes].indexOf(leaf));
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const after = n.childNodes[o];
    const before = n.childNodes[o - 1];
    // Flèche gauche depuis le haut de la page suivante : le texte d'avant, avant ses espaces de fin.
    const gapEl = after && isGap(after) ? after : before && isGap(before) ? before : null;
    if (gapEl && gapEl.tagName === 'SPAN' && previous && previous.offset === 0 && previous.node === nextLeaf(gapEl)) {
      const prev = previousLeaf(gapEl);
      if (prev && prev.nodeType === Node.TEXT_NODE && editor.contains(prev)) return put(prev, prev.data.replace(/\s+$/, '').length);
    }
    let leaf = null;
    let end = false;
    if (after && isGap(after)) { leaf = previousLeaf(after); end = true; }
    if (!leaf && before && isGap(before)) leaf = nextLeaf(before);
    if (!leaf && after && isGap(after)) leaf = nextLeaf(after), end = false;
    if (!leaf || isGap(leaf) || !editor.contains(leaf)) return;
    // Texte juste avant l'intercalaire : plutôt le début du texte de la page suivante (voir plus haut).
    if (end && after.tagName === 'SPAN' && leaf.nodeType === Node.TEXT_NODE) {
      let next = nextLeaf(after);
      while (next && isGap(next)) next = nextLeaf(next);
      if (next && next.nodeType === Node.TEXT_NODE && editor.contains(next) && next.parentNode === leaf.parentNode) return put(next, 0);
    }
    if (leaf.nodeType === Node.TEXT_NODE) put(leaf, end ? leaf.length : 0);
    else if (leaf.parentNode) put(leaf.parentNode, [...leaf.parentNode.childNodes].indexOf(leaf) + (end ? 1 : 0));
  }
  document.addEventListener('selectionchange', fixCaret);
  // Après un découpage (pendant la frappe), le curseur a pu se retrouver collé à un intercalaire.
  document.addEventListener('ft-paginated', fixCaret);

  // ----- Mode note / mode avancé -----

  // Outils propres au mode avancé : grisés et inactifs en mode note (bouton « Numéros de page », onglets et
  // réglages de la fenêtre « Réglages des pages » qui ne valent que pour des pages).
  const numTitle = $('pagenum-btn').title;
  function syncAdvanced() {
    const adv = mode === 'avance';
    const btn = $('pagenum-btn');
    btn.disabled = !adv;
    btn.title = adv ? numTitle : 'Numéros de page : disponible en mode avancé';
    for (const el of dialog.querySelectorAll('.pg-adv-only')) {
      el.inert = !adv;
      if (el.matches('button')) el.disabled = !adv;
      if (el.dataset.title === undefined) el.dataset.title = el.title;
      el.title = adv ? el.dataset.title : 'Disponible en mode avancé';
    }
  }

  function setMode(m, byUser) {
    const next = m === 'avance' ? 'avance' : 'note';
    if (editing) endEdit();
    mode = next;
    engineReady = false;
    page.classList.toggle('paged', mode === 'avance');
    workspace.classList.toggle('paged', mode === 'avance');
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    window.FTSwitch.place($('mode-switch'), byUser);
    dialog.classList.toggle('note-mode', mode === 'note');
    syncAdvanced();
    if (mode === 'avance') {
      page.style.maxWidth = '';
      page.style.paddingBottom = '';
      if (!engine) observer.observe(editor, { childList: true, subtree: true, characterData: true, attributes: true });
      paginate();
    } else {
      observer.disconnect();
      busy = true;
      if (!engine) removeGaps();
      busy = false;
      for (const prop of ['width', 'height', 'paddingTop', 'paddingLeft', 'paddingRight', 'marginLeft', 'marginRight']) page.style[prop] = '';
      page.classList.remove('pg-tags-later', 'pg-cover');
      for (const k of ['top', 'left', 'right']) docTags.style[k] = '';
      page.style.removeProperty('--pg-shift');
      sync(parts.sheet, sheetsLayer, 0);
      sync(parts.head, overLayer, 0);
      sync(parts.foot, overLayer, 0);
      sync(parts.num, overLayer, 0);
      noteFormat();
      if (engine) engine.repaginate();
      // Plan, illustrations, index, renvois : leurs numéros de page disparaissent tout de suite.
      document.dispatchEvent(new Event('ft-paginated'));
    }
    if (byUser) onChange();
    if (window.FTZoom) window.FTZoom.refresh();
  }

  for (const b of modeButtons) {
    b.addEventListener('click', () => {
      if (b.disabled || b.dataset.mode === mode) return;
      setMode(b.dataset.mode, true);
      workspace.scrollTop = 0;
    });
  }
  setupBtn.addEventListener('click', openDialog);
  // Numéros de page : l'onglet « Numéros de page » de la même fenêtre, directement. Les numéros n'existent
  // qu'en mode avancé (texte découpé en pages) : en mode note, le bouton est grisé.
  const numBtn = $('pagenum-btn');
  numBtn.addEventListener('click', () => {
    if (mode !== 'avance') return;
    dialogTab = 'numeros';
    if (editing) endEdit();
    fillDialog();
    if (!dialog.open) dialog.showModal();
  });

  function changed() {
    onChange();
    if (mode === 'avance') paginate();
    if (window.FTZoom && window.FTZoom.isDouble()) window.FTZoom.refresh();
    else noteFormat();
  }

  // Mode note : la page garde sa largeur habituelle, sauf si un format et des marges ont été choisis.
  function noteFormat() {
    if (mode !== 'note') return;
    const set = (k, v) => { page.style[k] = v; };
    if (!cfg.custom) {
      for (const k of ['width', 'maxWidth', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']) set(k, '');
      return;
    }
    const m = cfg.margins;
    set('width', dims('portrait')[0] * MM + 'px');
    set('maxWidth', 'none');
    set('paddingTop', m.top * MM + 'px');
    set('paddingBottom', m.bottom * MM + 'px');
    set('paddingLeft', m.left * MM + 'px');
    set('paddingRight', m.right * MM + 'px');
  }

  // ----- Fenêtre « Réglages des pages » -----

  const field = (id) => $(id);
  let dialogTab = 'format';

  function fillSelect(sel, list) {
    sel.replaceChildren(...list.map(([v, t]) => Object.assign(document.createElement('option'), { value: v, textContent: t })));
  }
  fillSelect(field('pg-size'), SIZES.map((s) => [s.id, s.label]));
  fillSelect(field('pg-num-pos'), POSITIONS);
  fillSelect(field('pg-num-format'), FORMATS);
  fillSelect(field('pg-num-box'), BOXES);

  function fillFonts() {
    const sel = field('pg-num-font');
    const source = $('font-family');
    sel.replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: 'Comme le texte (Georgia)' }));
    for (const node of source.children) sel.append(node.cloneNode(true));
    sel.value = cfg.numbers.font;
    if (sel.value !== cfg.numbers.font) sel.value = '';
  }

  const mmText = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

  function fillDialog() {
    const size = SIZES.find((s) => s.id === cfg.size);
    field('pg-size').value = cfg.size;
    field('pg-custom').hidden = cfg.size !== 'perso';
    field('pg-w').value = mmText(size && size.w ? size.w : cfg.w);
    field('pg-h').value = mmText(size && size.h ? size.h : cfg.h);
    for (const r of dialog.querySelectorAll('input[name="pg-orient"]')) r.checked = r.value === cfg.orient;
    const turned = Object.keys(cfg.turned).map(Number).sort((a, b) => a - b);
    field('pg-turned').hidden = !turned.length;
    field('pg-turned-list').textContent = turned.length
      ? (turned.length > 1 ? 'Pages tournées une à une : ' : 'Page tournée à part : ') + turned.join(', ')
      : '';
    field('pg-keep').checked = cfg.keep;
    field('pg-chapters').value = String(cfg.chapters);
    const kept = keptCount();
    field('pg-kept').hidden = !kept;
    field('pg-kept-count').textContent = kept > 1 ? `${kept} sauts de page conservés` : kept ? '1 saut de page conservé' : '';
    for (const side of ['top', 'bottom', 'left', 'right']) field('pg-m-' + side).value = mmText(cfg.margins[side]);
    for (const b of dialog.querySelectorAll('[data-margins]')) {
      const p = MARGINS[b.dataset.margins];
      b.classList.toggle('on', ['top', 'bottom', 'left', 'right'].every((k) => Math.abs(p[k] - cfg.margins[k]) < 0.05));
    }
    const n = cfg.numbers;
    field('pg-num-on').checked = n.on;
    field('pg-num-pos').value = n.pos;
    field('pg-num-format').value = n.format;
    field('pg-num-from').value = n.from;
    field('pg-num-first').value = n.first;
    fillFonts();
    field('pg-num-size').value = mmText(n.size);
    field('pg-num-color').value = n.color || (document.documentElement.dataset.theme === 'dark' && !document.documentElement.dataset.paper ? '#e8e6e3' : '#1f1f1f');
    field('pg-num-color-auto').classList.toggle('on', !n.color);
    field('pg-num-bold').classList.toggle('on', n.bold);
    field('pg-num-italic').classList.toggle('on', n.italic);
    field('pg-num-box').value = n.box;
    field('pg-num-fields').classList.toggle('off', !n.on);
    const preview = field('pg-num-preview');
    preview.replaceChildren(Object.assign(document.createElement('span'), { className: 'pg-num' }));
    styleNumber(preview.firstChild);
    preview.firstChild.textContent = formatNumber(n.first, Math.max(lastNumber(), n.first));
    const skips = Object.keys(n.skip).map(Number).sort((a, b) => a - b);
    field('pg-skip-list').replaceChildren(...(skips.length ? skips.map((p) => {
      const row = document.createElement('div');
      row.className = 'pg-skip-row';
      const label = document.createElement('span');
      label.textContent = `Page ${p} : ` + (n.skip[p] === 'saute' ? 'sautée (pas de numéro, pas comptée)' : 'numéro caché (comptée quand même)');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'small';
      del.textContent = 'Numéroter à nouveau';
      del.addEventListener('click', () => update(() => { delete cfg.numbers.skip[p]; }));
      row.append(label, del);
      return row;
    }) : [Object.assign(document.createElement('span'), { className: 'pg-help', textContent: 'Aucune page exclue.' })]));
    field('pg-head-on').checked = cfg.header.on;
    field('pg-foot-on').checked = cfg.footer.on;
    field('pg-first-diff').checked = cfg.firstDifferent;
    showTab(dialogTab);
  }

  function showTab(tab) {
    dialogTab = tab;
    for (const b of dialog.querySelectorAll('.styles-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const p of dialog.querySelectorAll('.pg-panel')) p.hidden = p.dataset.panel !== tab;
  }

  function openDialog() {
    if (editing) endEdit();
    if (mode === 'note') dialogTab = 'format';
    fillDialog();
    if (!dialog.open) dialog.showModal();
  }

  function update(fn) {
    fn();
    changed();
    fillDialog();
  }

  for (const b of dialog.querySelectorAll('.styles-tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
  field('pg-close').addEventListener('click', () => dialog.close());
  field('pg-skip-add').addEventListener('click', () => update(() => {
    const p = Math.round(num(field('pg-skip-page').value, 1, 9999, 0));
    if (p) cfg.numbers.skip[p] = field('pg-skip-kind').value;
    field('pg-skip-page').value = '';
  }));

  field('pg-size').addEventListener('change', (e) => update(() => {
    const s = SIZES.find((z) => z.id === e.target.value);
    if (!s) return;
    cfg.size = s.id;
    cfg.custom = true;
    if (s.w) { cfg.w = s.w; cfg.h = s.h; }
  }));
  for (const id of ['pg-w', 'pg-h']) {
    field(id).addEventListener('change', (e) => update(() => {
      const v = num(e.target.value, 40, 1000, null);
      if (v === null) return;
      cfg.size = 'perso';
      cfg.custom = true;
      if (id === 'pg-w') cfg.w = v; else cfg.h = v;
    }));
  }
  for (const r of dialog.querySelectorAll('input[name="pg-orient"]')) {
    r.addEventListener('change', () => update(() => { cfg.orient = r.value; cfg.turned = {}; }));
  }
  field('pg-turned-reset').addEventListener('click', () => update(() => { cfg.turned = {}; }));
  field('pg-turn-add').addEventListener('click', () => {
    const p = Math.round(num(field('pg-turn-page').value, 1, 9999, 0));
    field('pg-turn-page').value = '';
    if (p) turn(p - 1);
    fillDialog();
  });
  field('pg-keep').addEventListener('change', (e) => update(() => { cfg.keep = e.target.checked; }));
  field('pg-chapters').addEventListener('change', (e) => update(() => { cfg.chapters = Number(e.target.value) || 0; }));
  field('pg-release').addEventListener('click', () => { releaseAll(); fillDialog(); });
  for (const side of ['top', 'bottom', 'left', 'right']) {
    field('pg-m-' + side).addEventListener('change', (e) => update(() => {
      const v = num(e.target.value, 0, 120, null);
      if (v !== null) { cfg.margins[side] = v; cfg.custom = true; }
    }));
  }
  for (const b of dialog.querySelectorAll('[data-margins]')) {
    b.addEventListener('click', () => update(() => { cfg.margins = { ...MARGINS[b.dataset.margins] }; cfg.custom = true; }));
  }
  field('pg-num-on').addEventListener('change', (e) => update(() => { cfg.numbers.on = e.target.checked; }));
  field('pg-num-pos').addEventListener('change', (e) => update(() => { cfg.numbers.pos = e.target.value; }));
  field('pg-num-format').addEventListener('change', (e) => update(() => { cfg.numbers.format = e.target.value; }));
  field('pg-num-box').addEventListener('change', (e) => update(() => { cfg.numbers.box = e.target.value; }));
  field('pg-num-from').addEventListener('change', (e) => update(() => { cfg.numbers.from = Math.round(num(e.target.value, 1, 9999, 1)); }));
  field('pg-num-first').addEventListener('change', (e) => update(() => { cfg.numbers.first = Math.round(num(e.target.value, 0, 99999, 1)); }));
  field('pg-num-font').addEventListener('change', (e) => update(() => {
    cfg.numbers.font = e.target.value;
    if (e.target.value && window.FTEditor && window.FTEditor.loadFont) window.FTEditor.loadFont(e.target.value).then(schedule);
  }));
  field('pg-num-size').addEventListener('change', (e) => update(() => { cfg.numbers.size = num(e.target.value, 6, 72, 10); }));
  field('pg-num-color').addEventListener('input', (e) => update(() => { cfg.numbers.color = e.target.value; }));
  field('pg-num-color-auto').addEventListener('click', () => update(() => { cfg.numbers.color = ''; }));
  field('pg-num-bold').addEventListener('click', () => update(() => { cfg.numbers.bold = !cfg.numbers.bold; }));
  field('pg-num-italic').addEventListener('click', () => update(() => { cfg.numbers.italic = !cfg.numbers.italic; }));
  field('pg-head-on').addEventListener('change', (e) => update(() => { cfg.header.on = e.target.checked; }));
  field('pg-foot-on').addEventListener('change', (e) => update(() => { cfg.footer.on = e.target.checked; }));
  field('pg-first-diff').addEventListener('change', (e) => update(() => { cfg.firstDifferent = e.target.checked; }));
  for (const [id, kind] of [['pg-head-edit', 'header'], ['pg-foot-edit', 'footer']]) {
    field(id).addEventListener('click', () => {
      dialog.close();
      const i = blankFirst() && count > 1 ? 1 : 0;
      startEdit(kind, i);
      const el = (kind === 'header' ? parts.head : parts.foot)[i];
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }

  // ----- Pour les autres fichiers -----

  window.FTPages = {
    // Document ouvert : son mode et ses réglages de pages.
    load(settings) {
      editing = null;
      page.classList.remove('pg-hf-editing');
      cfg = normalize(settings && settings.pages);
      setMode(settings && settings.mode === 'avance' ? 'avance' : 'note', false);
    },
    getSettings: () => ({ mode, pages: JSON.parse(JSON.stringify(cfg)) }),
    // Marges données par le thème du document (theme.js).
    setMargins(m) {
      cfg.margins = { top: num(m.top, 0, 120, 25), bottom: num(m.bottom, 0, 120, 25), left: num(m.left, 0, 120, 25), right: num(m.right, 0, 120, 25) };
      cfg.custom = true;
      changed();
    },
    isPaged: () => mode === 'avance',
    // Modèle de mise en page (modeles.js) : format, marges, numéros, en-tête, pied de page, nouvelle page
    // avant les chapitres ; le document passe en mode avancé. Les réglages absents restent ceux du document.
    applyLayout(p) {
      if (editing) endEdit();
      const n = { ...cfg.numbers, ...(p.numbers || {}), skip: {} };
      const next = normalize({
        ...cfg,
        size: p.size || cfg.size, w: p.w || cfg.w, h: p.h || cfg.h, orient: p.orient || cfg.orient, turned: {},
        margins: p.margins || cfg.margins,
        numbers: n,
        header: p.header !== undefined ? { on: true, html: p.header } : cfg.header,
        footer: p.footer !== undefined ? { on: true, html: p.footer } : cfg.footer,
        firstDifferent: false,
        keep: true,
        chapters: p.chapters !== undefined ? p.chapters : cfg.chapters
      });
      // Taille connue : ses dimensions exactes.
      const size = SIZES.find((z) => z.id === next.size);
      if (size && size.w) { next.w = size.w; next.h = size.h; }
      next.custom = true;
      cfg = next;
      if (mode !== 'avance') setMode('avance', true);
      else changed();
    },
    // Mise en page du document, pour en faire un modèle.
    layout: () => {
      const c = JSON.parse(JSON.stringify(cfg));
      return { size: c.size, w: c.w, h: c.h, orient: c.orient, margins: c.margins,
        numbers: { on: c.numbers.on, pos: c.numbers.pos, format: c.numbers.format, from: c.numbers.from, first: c.numbers.first },
        header: c.header.on ? c.header.html : '', footer: c.footer.on ? c.footer.html : '', chapters: c.chapters };
    },
    sizes: () => SIZES.filter((z) => z.w).map(({ id, label, w, h }) => ({ id, label, w, h })),
    positions: () => POSITIONS.slice(),
    formats: () => FORMATS.slice(),
    // Tags du document après la page de titre (bouton « Tags »).
    hasCover: () => coverFirst(),
    tagsAfterCover: () => cfg.tagsAfterCover,
    setTagsAfterCover(on) { cfg.tagsAfterCover = !!on; changed(); },
    // Mode lecture : intercalaires retirés et découpage arrêté, puis découpage refait au retour.
    suspend(on) {
      on = !!on;
      if (on === suspended) return;
      suspended = on;
      if (mode !== 'avance') return;
      if (on) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        pending = null;
        observer.disconnect();
        busy = true;
        removeGaps();
        busy = false;
      } else {
        if (!engine) observer.observe(editor, { childList: true, subtree: true, characterData: true, attributes: true });
        paginate();
      }
      if (on && engine) engine.repaginate();
    },
    refresh() { if (mode === 'avance') paginate(); },
    enable(on) {
      for (const b of modeButtons) b.disabled = !on;
      setupBtn.hidden = !on;
      numBtn.hidden = !on;
      document.getElementById('doc-theme-tab').hidden = !on;
      document.getElementById('layout-tab').hidden = !on;
      document.getElementById('reading-btn').hidden = !on;
      document.getElementById('docstyles-btn').hidden = !on;
    },
    clean,
    // Lance fn sur le texte sans intercalaires (pour l'historique), puis redécoupe.
    bare(fn) {
      if (engine || mode !== 'avance' || !editor.querySelector('.ft-pg-gap, .ft-pg-alt')) return fn();
      busy = true;
      let result;
      try {
        removeGaps();
        result = fn();
      } finally {
        observer.takeRecords();
        busy = false;
      }
      paginate();
      return result;
    },
    // Clic droit dans la marge d'une page (pas dans le texte).
    menuItems,
    // Tout ce qu'il faut pour l'export Word (voir word.js). cleanup() retire les éléments de mesure.
    exportInfo() {
      const probes = [];
      const sample = (kind) => {
        const live = (kind === 'header' ? parts.head : parts.foot).find((e) => !e.hidden && e.innerHTML);
        if (live) return live;
        if (!cfg[kind].html) return null;
        const el = hfElement(kind);
        el.innerHTML = cfg[kind].html;
        el.style.cssText = `visibility:hidden;left:0;top:0;width:${contentWidth()}px`;
        overLayer.append(el);
        probes.push(el);
        return el;
      };
      const numEl = document.createElement('span');
      numEl.className = 'pg-num';
      styleNumber(numEl);
      numEl.textContent = '1';
      numEl.style.visibility = 'hidden';
      overLayer.append(numEl);
      probes.push(numEl);
      return {
        mode,
        cfg: { ...JSON.parse(JSON.stringify(cfg)), firstDifferent: blankFirst() },
        count: mode === 'avance' ? count : 1,
        geo: mode === 'avance' ? geo.slice(0, count).map((g) => ({ ...g })) : [],
        pages: mode === 'avance' ? Array.from({ length: count }, (_, i) => ({
          orient: orientOf(i),
          num: numInfo(i),
          head: cfg.header.on && hasHtml('header') && !(i === 0 && blankFirst()),
          foot: cfg.footer.on && hasHtml('footer') && !(i === 0 && blankFirst())
        })) : [],
        total: mode === 'avance' ? lastNumber() : 0,
        header: sample('header'),
        footer: sample('footer'),
        number: numEl,
        size: (orient) => dims(orient),
        hfDistance: HF_DIST,
        cleanup: () => probes.forEach((e) => e.remove())
      };
    },
    pageCount: () => (mode === 'avance' ? count : 0),
    // Double page (zoom.js) : format d'une page, marges et zone de texte (pixels, taille réelle).
    frame() {
      const [wmm, hmm] = dims(cfg.orient);
      const k = Math.min(1, Math.max(0, geo.length - 1));
      const g = pageAt(k);
      // (Sans la place des tags en haut de la page 2, après une page de titre : la double page ne les
      // montre pas, et tout le texte y descendait d'autant.)
      const shift = k === 1 ? tagShift : 0;
      return { w: wmm * MM, h: hmm * MM, left: cfg.margins.left * MM, right: cfg.margins.right * MM, ct: g.ct - g.top - shift, cb: g.cb - g.top, spacing: SPACING, hfDistance: HF_DIST * MM };
    },
    // Double page : en-tête, pied de page et numéro de la page i sur total.
    decor(i, total) {
      const info = numInfo(i);
      const last = (() => { for (let j = total - 1; j >= 0; j--) { const x = numInfo(j); if (x.n !== null) return x.n; } return cfg.numbers.first; })();
      const hf = (kind) => (cfg[kind].on && hasHtml(kind) && !(i === 0 && blankFirst()) ? cfg[kind].html : null);
      return { head: hf('header'), foot: hf('footer'), num: info.show ? formatNumber(info.n, last) : null, pos: cfg.numbers.pos, style: styleNumber };
    },
    // Numéro affiché de la page où se trouve un élément (mode avancé), ou null.
    pageNumberOf(el) {
      if (mode !== 'avance' || !count) return null;
      // Nouveau moteur : un bloc retiré de l'affichage (très long document) a sa page dans le découpage.
      const far = engine && engine.blockOf ? engine.blockOf(el) : null;
      const i = far && far.far ? engine.pageOfNode(el) : pageIndexAt(el.getBoundingClientRect().top + 1);
      if (i === null || i === undefined) return null;
      if (i < 0) return null;
      // Numéros de page masqués ou sautés : on donne quand même le rang de la page.
      const n = numInfo(i).n;
      return n === null ? i + 1 : n;
    },
    // Numéro affiché de la page où commence un passage (mode avancé), ou null.
    pageNumberOfRange(r) {
      const far = engine && engine.blockOf ? engine.blockOf(r.startContainer) : null;
      if (far && far.far) return window.FTPages.pageNumberOf(far.el);
      return window.FTPages.pageNumberAtY(r.getBoundingClientRect().top + 1);
    },
    // Numéro affiché de la page à une hauteur de l'écran (mode avancé), ou null.
    pageNumberAtY(clientY) {
      if (mode !== 'avance' || !count) return null;
      const i = pageIndexAt(clientY);
      if (i < 0) return null;
      const n = numInfo(i).n;
      return n === null ? i + 1 : n;
    },
    onChange(fn) { onChange = fn; },
    // Moteur 2.0 : la zone d'écriture du nouveau moteur, qui découpe lui-même le texte.
    useEngine(el, api) {
      editor = el;
      engine = api;
      api.usePages({
        paged: () => mode === 'avance' && !suspended && !page.hidden && engineReady,
        // Mode avancé dont les réglages ne sont pas encore posés (page cachée jusque-là) : on les pose.
        pending: () => mode === 'avance' && !suspended && !engineReady && visible(),
        prepare: () => paginate(),
        keep: () => cfg.keep,
        chapters: () => cfg.chapters,
        turned: () => Object.keys(cfg.turned).length > 0,
        // Zone de texte n° r et haut de la zone d'écriture, depuis le haut de #page (px, taille réelle).
        region: (r) => regionAt(r),
        offset: () => (editor.getBoundingClientRect().top - pageTop()) / zk(),
        setCount: engineCount
      });
      // Page de titre ajoutée ou retirée : la première page change (tags du document, hauteur de la page
      // de titre), tout est refait.
      let coverTimer = 0;
      window.FTMoteur.onUpdate((tr) => {
        if (!tr.docChanged || coverTimer || mode !== 'avance' || coverFirst() === coverWas) return;
        coverTimer = setTimeout(() => {
          coverTimer = 0;
          if (mode === 'avance' && engineReady && coverFirst() !== coverWas) paginate();
        });
      });
    },
    _geo: () => geo.slice(0, count)
  };
})();

