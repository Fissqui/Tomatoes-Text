// Composition des paragraphes pour l'impression (export PDF, export livre) : tourne dans la page cachée
// que Chromium met en pages (main.js), avant l'impression.
// 1. Coupure des mots (cesure.js) : traits d'union conditionnels dans le texte, selon la langue du
//    paragraphe ; jamais dans les titres, le sommaire, l'index, les formules.
// 2. Justification par paragraphe entier (algorithme de Knuth et Plass, celui de TeX) : au lieu de remplir
//    chaque ligne l'une après l'autre, toutes les coupures possibles du paragraphe sont pesées ensemble
//    (espaces, coupures de mots), pour que les espaces restent réguliers d'une ligne à l'autre, sans
//    « trous » ni lignes serrées, avec peu de coupures et jamais trois lignes coupées de suite.
//    Mesures : le paragraphe est posé sur une seule ligne (nowrap), chaque mot et chaque espace mesurés
//    sur le rendu même de Chromium ; puis chaque ligne choisie devient un bloc d'une ligne justifié.
//    Lignes resserrées : espacement des mots négatif ; le navigateur fait l'ajustement final au pixel près.
//    Paragraphes laissés au navigateur : non justifiés, à lettrine, avec une image, une formule, un
//    habillage à côté, dans un tableau.
(function () {
  const SHY = '­';
  const INF = 10000;
  // Réglages de la composition (unités de TeX : démérites).
  const P = {
    stretch: 0.6, // étirement d'une espace (part de sa largeur)
    shrink: 0.26, // resserrement d'une espace
    tolerance: 2.2, // étirement relatif accepté au premier essai
    linePenalty: 10,
    hyphenPenalty: 60,
    exHyphenPenalty: 60,
    doubleHyphen: 4000, // deux lignes coupées de suite
    tripleHyphen: 1e7, // trois : évité
    finalHyphen: 50000, // avant-dernière ligne coupée (la dernière ne garde qu’un bout de mot)
    adjacent: 3000 // lignes très lâches à côté de lignes serrées
  };

  const NO_HYPHEN = 'h1, h2, h3, h4, h5, h6, .ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-math, .ft-diagram, svg, code, pre, .ft-xref, .ft-cite, .ft-fn-ref, .ft-en-ref, [data-nocesure]';
  const BLOCKS = 'p, li, dd, dt, td, th, figcaption, blockquote';
  const INNER_BLOCK = 'p, div, ul, ol, li, table, blockquote, h1, h2, h3, h4, h5, h6, pre, hr, figure, dl';
  const ATOMIC = 'img, svg, canvas, video, iframe, input, math, .ft-math, .ft-image, .ft-diagram';

  // ----- Coupure des mots -----

  // Texte des blocs (sans les zones exclues), avec les positions de chaque nœud de texte.
  function textNodes(block, skip) {
    const out = [];
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) out.push({ node: t, skip: !!(skip && t.parentElement.closest(skip)) });
    return out;
  }

  function hyphenateBlock(block, lang) {
    const nodes = textNodes(block, NO_HYPHEN);
    if (!nodes.length) return 0;
    // Texte continu (un mot coupé par du gras reste un mot) ; zones exclues remplacées par des caractères
    // neutres, pour ne pas souder les mots voisins.
    const full = nodes.map((n) => (n.skip ? '￼'.repeat(n.node.data.length) : n.node.data)).join('');
    const at = window.FTCesure.cuts(full, window.FTCesure.codeOf(lang));
    if (!at.length) return 0;
    let k = at.length - 1;
    let end = full.length;
    for (let i = nodes.length - 1; i >= 0 && k >= 0; i--) {
      const t = nodes[i].node;
      const start = end - t.data.length;
      let data = t.data;
      let changed = false;
      while (k >= 0 && at[k] >= start) {
        // (Coupure au bord d'un nœud : dans le nœud précédent, à sa fin.)
        if (at[k] === start && i > 0) break;
        data = data.slice(0, at[k] - start) + SHY + data.slice(at[k] - start);
        changed = true;
        k--;
      }
      if (changed) t.data = data;
      end = start;
    }
    return at.length;
  }

  // ----- Coupure en lignes (Knuth et Plass) -----

  // items : { t: 'box' | 'glue' | 'pen', w, y (étirement), z (resserrement), p (pénalité), f (trait d'union) }
  // width(n) : largeur de la ligne n (0 = première). Renvoie les indices des coupures (la dernière = fin).
  function knuthPlass(items, width, tolerance) {
    const n = items.length;
    let sumW = 0;
    let sumY = 0;
    let sumZ = 0;
    // Nœud actif : coupure possible déjà atteinte.
    let active = [{ i: -1, line: 0, fit: 1, w: 0, y: 0, z: 0, d: 0, hy: 0, prev: null }];
    const after = (b) => {
      // Totaux au début de la ligne qui suit une coupure en b (espaces et pénalités sautés).
      let w = sumW;
      let y = sumY;
      let z = sumZ;
      for (let j = b; j < n; j++) {
        const it = items[j];
        if (it.t === 'box') break;
        if (it.t === 'glue') { w += it.w; y += it.y; z += it.z; } else if (it.p === -INF && j > b) break;
      }
      return { w, y, z };
    };
    for (let b = 0; b < n; b++) {
      const it = items[b];
      let feasible = false;
      if (it.t === 'box') { sumW += it.w; continue; }
      if (it.t === 'glue') feasible = b > 0 && items[b - 1].t === 'box';
      else feasible = it.p < INF;
      if (feasible) {
        const best = [null, null, null, null];
        const keep = [];
        for (const a of active) {
          const natural = sumW - a.w + (it.t === 'pen' ? it.w : 0);
          const L = width(a.line);
          let r;
          if (natural < L) { const y = sumY - a.y; r = y > 0 ? (L - natural) / y : INF; } else if (natural > L) { const z = sumZ - a.z; r = z > 0 ? (L - natural) / z : -INF; } else r = 0;
          if (r < -1 || (it.t === 'pen' && it.p === -INF)) { /* nœud abandonné */ } else keep.push(a);
          if (r >= -1 && (r <= tolerance || (it.t === 'pen' && it.p === -INF && r < INF))) {
            const bad = 100 * Math.abs(r) ** 3;
            const p = it.t === 'pen' ? it.p : 0;
            let d = (P.linePenalty + bad) ** 2;
            if (p > 0) d += p * p;
            else if (p > -INF) d -= p * p;
            const hy = it.t === 'pen' && it.f ? a.hy + 1 : 0;
            if (hy >= 2) d += P.doubleHyphen;
            if (hy >= 3) d += P.tripleHyphen;
            if (it.t === 'pen' && it.p === -INF && a.hy) d += P.finalHyphen;
            const fit = r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3;
            if (Math.abs(fit - a.fit) > 1) d += P.adjacent;
            d += a.d;
            if (!best[fit] || d < best[fit].d) best[fit] = { a, d, hy, r };
          }
        }
        active = keep;
        if (best.some(Boolean)) {
          const t = after(b);
          for (let fit = 0; fit < 4; fit++) {
            const c = best[fit];
            if (c) active.push({ i: b, line: c.a.line + 1, fit, w: t.w, y: t.y, z: t.z, d: c.d, hy: c.hy, r: c.r, prev: c.a });
          }
        }
        if (!active.length) return null;
      }
      if (it.t === 'glue') { sumW += it.w; sumY += it.y; sumZ += it.z; }
    }
    let end = null;
    for (const a of active) if (a.i === n - 1 && (!end || a.d < end.d)) end = a;
    if (!end) return null;
    const breaks = [];
    for (let a = end; a && a.i >= 0; a = a.prev) breaks.unshift({ i: a.i, r: a.r });
    return breaks;
  }

  // Lignes remplies l'une après l'autre (avec coupures de mots et resserrement) : solution de secours,
  // et nombre de lignes à ne pas dépasser quand les pages sont déjà faites.
  function firstFit(items, width, { hyphens = true, shrink = true } = {}) {
    const breaks = [];
    let line = 0;
    let w = 0;
    let z = 0;
    let lastOk = -1;
    const restart = (from) => {
      // Début de ligne : espaces et pénalités sautées.
      let j = from;
      while (j < items.length && items[j].t !== 'box' && !(items[j].t === 'pen' && items[j].p === -INF)) j++;
      line++;
      w = 0;
      z = 0;
      lastOk = -1;
      return j;
    };
    for (let b = 0; b < items.length;) {
      const it = items[b];
      if (it.t === 'box') w += it.w;
      else {
        const can = it.t === 'glue' ? b > 0 && items[b - 1].t === 'box' : it.p < INF && (hyphens || !it.f || it.p === -INF);
        if (can) {
          const natural = w + (it.t === 'pen' ? it.w : 0);
          if (natural - (shrink ? z : 0) <= width(line) + 0.01 || lastOk < 0) {
            if (it.t === 'pen' && it.p === -INF) {
              breaks.push({ i: b });
              b = restart(b + 1);
              continue;
            }
            lastOk = b;
          } else {
            breaks.push({ i: lastOk });
            b = restart(lastOk + 1);
            continue;
          }
        }
        if (it.t === 'glue') { w += it.w; z += it.z; }
      }
      b++;
    }
    return breaks;
  }

  // ----- Mesure d'un paragraphe -----

  const canvas = document.createElement('canvas').getContext('2d');
  const hyphenWidths = new Map();
  function hyphenWidth(el) {
    const cs = getComputedStyle(el);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let w = hyphenWidths.get(font);
    if (w === undefined) {
      canvas.font = font;
      w = canvas.measureText('-').width;
      hyphenWidths.set(font, w);
    }
    return w;
  }

  const isSpace = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
  const isLetter = (c) => !!c && /[\p{L}\p{M}]/u.test(c);

  // Suite d'éléments du paragraphe, avec les positions du texte où couper.
  function itemsOf(block, range) {
    const nodes = [];
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === Node.TEXT_NODE || n.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
    // Coupures possibles : { kind: 'glue' | 'shy' | 'hy' | 'zw' | 'br', node, off, end, endOff }.
    // (Espaces de suite, même d'un nœud de texte à l'autre : une seule.)
    const marks = [];
    let glue = null;
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) {
        glue = null;
        marks.push({ kind: 'br', el: node });
        continue;
      }
      const s = node.data;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (isSpace(c)) {
          if (glue) { glue.end = node; glue.endOff = i + 1; continue; }
          glue = { kind: 'glue', node, off: i, end: node, endOff: i + 1 };
          marks.push(glue);
          continue;
        }
        if (c !== SHY) glue = null;
        if (c === SHY) marks.push({ kind: 'shy', node, off: i });
        else if ((c === '-' || c === '\u2010') && isLetter(s[i - 1]) && isLetter(s[i + 1])) marks.push({ kind: 'hy', node, off: i });
        else if (c === '\u200B') marks.push({ kind: 'zw', node, off: i });
      }
    }
    const items = [];
    const where = []; // pour chaque élément de coupure : la marque
    // Mesure d'un passage du texte (sur une seule ligne).
    const span = (n1, o1, n2, o2) => {
      try {
        range.setStart(n1, o1);
        range.setEnd(n2, o2);
        if (range.collapsed) return 0;
        return range.getBoundingClientRect().width;
      } catch { return 0; }
    };
    const startOf = { node: block, off: 0 };
    let cur = startOf; // début de la boîte en cours
    const pos = (m, end) => {
      if (m.kind === 'br') {
        const i = [...m.el.parentNode.childNodes].indexOf(m.el);
        return { node: m.el.parentNode, off: end ? i + 1 : i };
      }
      if (m.kind === 'glue') return end ? { node: m.end, off: m.endOff } : { node: m.node, off: m.off };
      return end ? { node: m.node, off: m.off + 1 } : { node: m.node, off: m.off };
    };
    for (const m of marks) {
      const a = pos(m, false);
      const b = pos(m, true);
      if (m.kind === 'glue') {
        const bw = span(cur.node, cur.off, a.node, a.off);
        if (bw > 0 || items.length) items.push({ t: 'box', w: bw });
        if (!items.length) { cur = b; continue; } // espaces en tête : ôtées par le navigateur
        const gw = span(a.node, a.off, b.node, b.off);
        items.push({ t: 'glue', w: gw, y: gw * P.stretch, z: gw * P.shrink });
        where[items.length - 1] = m;
        cur = b;
      } else if (m.kind === 'br') {
        items.push({ t: 'box', w: span(cur.node, cur.off, a.node, a.off) });
        items.push({ t: 'glue', w: 0, y: INF, z: 0 });
        items.push({ t: 'pen', w: 0, p: -INF, f: 0 });
        where[items.length - 1] = m;
        cur = b;
      } else {
        // Coupure dans un mot : la boîte se termine juste avant (trait d'union conditionnel compris).
        items.push({ t: 'box', w: span(cur.node, cur.off, a.node, a.off) });
        if (m.kind === 'shy') items.push({ t: 'pen', w: hyphenWidth(m.node.parentElement), p: P.hyphenPenalty, f: 1 });
        else if (m.kind === 'hy') {
          items[items.length - 1].w += span(a.node, a.off, b.node, b.off);
          items.push({ t: 'pen', w: 0, p: P.exHyphenPenalty, f: 1 });
        } else items.push({ t: 'pen', w: 0, p: 0, f: 0 });
        where[items.length - 1] = m;
        cur = b;
      }
    }
    // Fin du paragraphe.
    items.push({ t: 'box', w: span(cur.node, cur.off, block, block.childNodes.length) });
    // (Espaces finales : ôtées par le navigateur.)
    if (items.length > 2 && items[items.length - 1].w === 0 && items[items.length - 2].t === 'glue') items.splice(items.length - 2, 1);
    items.push({ t: 'glue', w: 0, y: INF, z: 0 });
    items.push({ t: 'pen', w: 0, p: -INF, f: 0 });
    return { items, where, pos };
  }

  // ----- Paragraphes à composer -----

  function eligible(block) {
    const cs = getComputedStyle(block);
    if (cs.textAlign !== 'justify') return false;
    if (!/^(block|list-item)$/.test(cs.display) || cs.whiteSpace !== 'normal') return false;
    if (cs.display === 'list-item' && cs.listStylePosition === 'inside') return false;
    // (Contenu ajouté avant ou après le texte : il prendrait une ligne à lui.)
    for (const pseudo of ['::before', '::after']) {
      const c = getComputedStyle(block, pseudo).content;
      if (c && c !== 'none' && c !== 'normal') return false;
    }
    if (cs.float !== 'none' || cs.position === 'absolute' || cs.position === 'fixed') return false;
    if (block.hasAttribute('data-lettrine') || block.closest('td, th, .ft-toc, .ft-lof, .ft-index, .ft-cover')) return false;
    if (block.querySelector(INNER_BLOCK + ', ' + ATOMIC)) return false;
    for (const el of block.querySelectorAll('*')) {
      if (el.tagName === 'BR') continue;
      const d = getComputedStyle(el);
      if (d.display !== 'inline' || d.float !== 'none' || d.position === 'absolute' || d.position === 'fixed') return false;
    }
    if (!block.textContent.trim()) return false;
    return true;
  }

  // Habillages (objets flottants) : un paragraphe à côté garde la mise en ligne du navigateur.
  function floatRects(root) {
    const out = [];
    for (const el of root.querySelectorAll('[data-wrap], .ft-image, .ft-callout, .ft-diagram, table, figure')) {
      const cs = getComputedStyle(el);
      if (cs.float === 'none' && cs.shapeOutside === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push(r);
    }
    return out;
  }
  const overlaps = (r, list) => list.some((f) => f.top < r.bottom - 0.5 && f.bottom > r.top + 0.5);

  // ----- Composition -----

  // opts : { hyphenate, justify, lang (langue du document), keepLines (ne pas allonger les paragraphes) }
  const CSS = `
.ft-kp-mesure { white-space: nowrap !important; }
.ft-kp { display: block; white-space: nowrap; text-indent: 0; text-align: justify; text-align-last: justify; }
.ft-kp.ft-kp-1 { text-indent: inherit; break-after: avoid; }
.ft-kp.ft-kp-der { text-align-last: auto; }
.ft-kp.ft-kp-fin { break-before: avoid; }
`;

  function run(opts = {}) {
    const t0 = performance.now();
    const root = document.getElementById('editor');
    const stats = { hyphens: 0, composed: 0, kept: 0, lines: 0 };
    if (!root) return stats;
    if (!document.getElementById('ft-kp-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'ft-kp-css', textContent: CSS }));
    const blocks = [...root.querySelectorAll(BLOCKS)].filter((b) => !b.querySelector(INNER_BLOCK));
    const docLang = opts.lang || document.documentElement.lang || 'fr';
    if (opts.hyphenate !== false && window.FTCesure) {
      for (const b of blocks) {
        if (b.closest(NO_HYPHEN)) continue;
        const tagged = b.closest('[lang]');
        const lang = tagged && tagged !== document.documentElement ? tagged.getAttribute('lang') : docLang;
        if (!window.FTCesure.has(lang)) continue;
        stats.hyphens += hyphenateBlock(b, lang);
      }
    }
    if (opts.justify !== false) {
      // Lectures d'abord (une seule mise en page), écritures ensuite.
      const floats = floatRects(root);
      const todo = [];
      for (const b of blocks) {
        if (!eligible(b)) continue;
        const r = b.getBoundingClientRect();
        if (overlaps(r, floats)) continue;
        const cs = getComputedStyle(b);
        const width = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        // (Retrait de première ligne : en pixels, au besoin depuis un pourcentage.)
        const indent = cs.textIndent.endsWith('%') ? width * parseFloat(cs.textIndent) / 100 : parseFloat(cs.textIndent) || 0;
        todo.push({ b, width, indent });
      }
      for (const x of todo) x.b.classList.add('ft-kp-mesure');
      const range = document.createRange();
      const plans = [];
      for (const x of todo) {
        // (Largeur changée par la mesure : bloc qui s'ajuste à son contenu.)
        const cs = getComputedStyle(x.b);
        if (Math.abs(x.b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - x.width) > 0.5) continue;
        const { items, where, pos } = itemsOf(x.b, range);
        const width = (line) => x.width - (line === 0 ? x.indent : 0);
        let breaks = knuthPlass(items, width, P.tolerance) || knuthPlass(items, width, 8);
        if (opts.keepLines) {
          // Pages déjà faites : pas une ligne de plus que le navigateur sans coupure de mots.
          const max = firstFit(items, width, { hyphens: false, shrink: false }).length;
          if (!breaks || breaks.length > max) breaks = firstFit(items, width);
          if (breaks.length > max) breaks = null;
        }
        if (!breaks) breaks = firstFit(items, width);
        if (!breaks || breaks.length < 2) { stats.kept++; continue; }
        // Largeur naturelle et nombre d'espaces de chaque ligne (pour le resserrement).
        const lines = [];
        let from = 0;
        for (const br of breaks) {
          let w = 0;
          let spaces = 0;
          let j = from;
          while (j < br.i && items[j].t !== 'box') j++; // espaces en début de ligne : ôtées
          for (; j < br.i; j++) {
            const it = items[j];
            if (it.t === 'box') w += it.w;
            else if (it.t === 'glue' && it.y < INF) { w += it.w; spaces++; }
          }
          // (Espaces juste avant la coupure : ôtées.)
          for (let k = br.i - 1; k >= from && items[k].t === 'glue'; k--) if (items[k].y < INF) { w -= items[k].w; spaces--; }
          const end = items[br.i];
          if (end.t === 'pen' && end.p > -INF) w += end.w;
          lines.push({ w, spaces, end: br.i });
          from = br.i + 1;
        }
        // (Mot plus long que la ligne : mise en ligne du navigateur.)
        if (lines.some((l, k) => l.w - l.spaces * 4 > width(k) + 1 && items[l.end].p !== -INF && l.w * (1 - P.shrink) > width(k) + 1)) { stats.kept++; continue; }
        plans.push({ x, items, where, pos, breaks, lines, width });
      }
      for (const x of todo) x.b.classList.remove('ft-kp-mesure');
      for (const plan of plans) {
        write(plan);
        stats.composed++;
        stats.lines += plan.lines.length;
      }
    }
    stats.ms = Math.round(performance.now() - t0);
    return stats;
  }

  // Le paragraphe devient une suite de blocs d'une ligne, de la dernière à la première.
  function write({ x, items, where, pos, breaks, lines, width }) {
    const b = x.b;
    const range = document.createRange();
    let next = null; // bloc de la ligne qui suit
    const make = (k) => {
      const line = document.createElement('span');
      line.className = 'ft-kp' + (k === 0 ? ' ft-kp-1' : '') + (k === lines.length - 1 ? ' ft-kp-fin' : '');
      const l = lines[k];
      const end = items[l.end];
      const last = k === lines.length - 1 || (end.t === 'pen' && end.p === -INF);
      if (last) line.classList.add('ft-kp-der');
      else {
        // Ligne à resserrer : espaces réduites (le navigateur n'étire qu'ensuite, au pixel près).
        const gap = width(k) - l.w;
        if (gap < 0 && l.spaces > 0) line.style.wordSpacing = (gap / l.spaces - 0.15).toFixed(3) + 'px';
      }
      return line;
    };
    for (let k = breaks.length - 2; k >= -1; k--) {
      const line = make(k + 1);
      if (k >= 0) {
        const m = where[breaks[k].i];
        const at = pos(m, true);
        if (m.kind === 'shy') m.node.replaceData(m.off, 1, '-');
        range.setStart(at.node, at.off);
      } else range.setStart(b, 0);
      if (next) range.setEndBefore(next);
      else range.setEnd(b, b.childNodes.length);
      line.append(range.extractContents());
      b.insertBefore(line, next);
      next = line;
    }
    // (Lignes faites : les autres coupures possibles ne servent plus, et gêneraient la recherche dans le PDF.)
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.data.includes('­')) t.data = t.data.replace(/­/g, '');
    b.classList.add('ft-kp-par');
  }

  window.FTComposition = { run, knuthPlass, firstFit, P };
})();
