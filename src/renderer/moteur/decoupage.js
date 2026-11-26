// Mode avancé du nouveau moteur : découpage du texte en pages, par le calcul.
// Chaque bloc du haut est mesuré une fois, tel qu'il s'affiche sans pages (sa hauteur, ses marges, et
// les endroits où il peut être coupé : début de chaque ligne de texte, de chaque ligne de tableau, de
// chaque bloc qu'il contient). Le découpage se fait ensuite sur ces nombres, sans toucher à l'affichage :
// il ne coûte presque rien, même sur des centaines de pages, et il est refait en entier à chaque
// modification. Les coupures ne sont dessinées que dans les blocs affichés (moteur/visibles.js) :
//   - avant un bloc du haut : une marge en haut du bloc ;
//   - au milieu d'un paragraphe : un intercalaire (.ft-pg-gap) au début de la ligne qui passe à la page
//     suivante, de toute la largeur (il occupe sa propre ligne, la justification ne change pas) ;
//   - entre deux lignes de tableau : une ligne intercalaire, puis la copie de la ligne d'en-tête si
//     elle se répète ;
//   - avant un bloc contenu dans un autre (élément de liste, paragraphe d'un encadré…) : un intercalaire.
(function () {
  const EPS = 0.5;
  // Débord toléré sur la marge du bas d'une page tournée, pour un bloc qui y garde la largeur de la page (px).
  const HANG = 30;

  const isGap = (n) => n.nodeType === 1 && n.classList.contains('ft-pg-gap');
  // Objets qui ne suivent pas le texte : habillage « carré », devant ou derrière le texte.
  const isLoose = (el) => ['gauche', 'droite', 'devant', 'derriere'].includes(el.dataset && el.dataset.wrap);
  const INLINE = new Set(['SPAN', 'B', 'I', 'U', 'S', 'EM', 'STRONG', 'A', 'SUB', 'SUP', 'FONT', 'MARK', 'CODE', 'SMALL', 'BIG', 'Q', 'ABBR', 'STRIKE', 'DEL', 'INS', 'LABEL', 'KBD', 'VAR', 'CITE', 'BR', 'IMG']);
  const ATOM_BLOCK = new Set(['TABLE', 'HR', 'IMG', 'FIGURE', 'PRE', 'SVG', 'VIDEO', 'CANVAS', 'IFRAME']);
  const CONTAINER = new Set(['UL', 'OL', 'LI', 'BLOCKQUOTE', 'DL', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'DIV']);

  function isBlock(el) {
    if (INLINE.has(el.tagName) && !el.classList.contains('ft-cols') && !el.classList.contains('ft-image')) return false;
    const d = getComputedStyle(el).display;
    return !d.startsWith('inline') && d !== 'contents' && d !== 'none';
  }
  const isAtom = (el) => (ATOM_BLOCK.has(el.tagName) && !el.classList.contains('ft-code')) || el.classList.contains('ft-math') || el.classList.contains('ft-cols') ||
    el.classList.contains('ft-image') || el.classList.contains('ft-cover') || el.getAttribute('contenteditable') === 'false';
  const flowKids = (el) => [...el.children].filter((c) => !isGap(c) && !isLoose(c) && isBlock(c) && !/^(absolute|fixed)$/.test(getComputedStyle(c).position));

  // Les morceaux d'une ligne de texte : nœuds de texte et petits objets dans la ligne.
  function leavesOf(root) {
    const out = [];
    (function walk(node) {
      for (const c of node.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) { if (c.data.length) out.push(c); continue; }
        if (c.nodeType !== Node.ELEMENT_NODE || isGap(c) || isLoose(c) || c.classList.contains('ft-code-bar') || c.classList.contains('ft-code-ln')) continue;
        if (c.tagName === 'IMG' || c.tagName === 'BR' || c.getAttribute('contenteditable') === 'false' || c.classList.contains('ft-image')) { out.push(c); continue; }
        if (isBlock(c)) continue;
        walk(c);
      }
    })(root);
    return out;
  }

  const range = document.createRange();
  function rectsOf(leaf) {
    if (leaf.nodeType === Node.TEXT_NODE) {
      range.selectNodeContents(leaf);
      return range.getClientRects();
    }
    return [leaf.getBoundingClientRect()];
  }

  // Lignes d'un bloc de texte : { top, bottom } à l'écran.
  function linesOf(el) {
    const rects = [];
    for (const leaf of leavesOf(el)) {
      for (const r of rectsOf(leaf)) if (r.height > 0) rects.push({ top: r.top, bottom: r.bottom });
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

  // Première ligne du groupe de lignes de tableau liées à la ligne k par des cases fusionnées.
  function mergedStart(rows, k) {
    let start = k;
    for (let guard = 0; guard < rows.length; guard++) {
      let moved = false;
      for (let i = 0; i < start && !moved; i++) {
        for (const c of rows[i].cells) if (c.rowSpan > 1 && i + c.rowSpan - 1 >= start) { start = i; moved = true; break; }
      }
      if (!moved) return start;
    }
    return start;
  }

  // Appels de note de bas de page d'un bloc : chacun est rangé avec l'endroit de coupure où commence sa
  // ligne (fn : identifiants des notes, dans l'ordre du texte). relY : hauteur à l'écran → px depuis le
  // haut du bloc.
  function attachNotes(el, units, relY) {
    const refs = el.querySelectorAll('sup.ft-fn-ref[data-fn]');
    for (const s of refs) {
      const r = s.getBoundingClientRect();
      if (!r.height) continue;
      const y = relY(r.top + r.height / 2);
      let x = 0;
      while (x + 1 < units.length && units[x + 1].y <= y + EPS) x++;
      (units[x].fn || (units[x].fn = [])).push(s.getAttribute('data-fn'));
    }
  }

  // Mesure d'un bloc du haut affiché tel qu'il est sans pages. Les endroits où il peut être coupé :
  // { y, b, kind, at } — y : haut de ce qui passerait à la page suivante, b : bas de son premier morceau
  // (px depuis le haut du bloc) ; kind : 'line' (ligne d'un paragraphe), 'row' (ligne de tableau),
  // 'block' (bloc contenu) ; at : l'élément (pour retrouver l'endroit dans le texte), et pour une ligne
  // son rang dans le paragraphe. Le premier endroit est le début du bloc.
  // Zone en colonnes : coupée entre ses paragraphes ; chaque page a ses colonnes, équilibrées (un
  // intercalaire de toute la largeur, voir moteur.css). Les endroits se mesurent sur la zone en une seule
  // colonne de même largeur (el est une copie : sa mise en forme peut changer), puis se divisent par le
  // nombre de colonnes ; une ligne de marge couvre l'écart de l'équilibrage.
  function measureCols(el, k) {
    const cs = getComputedStyle(el);
    const c = parseInt(cs.columnCount, 10);
    const kids = flowKids(el);
    if (!(c > 1) || kids.length < 2) return null;
    const height = el.getBoundingClientRect().height / k;
    const px = (v) => parseFloat(v) || 0;
    const head = px(cs.paddingTop) + px(cs.borderTopWidth);
    const kcs = getComputedStyle(kids[0]);
    const lh = px(kcs.lineHeight) || 1.4 * px(kcs.fontSize) || 20;
    const inner = el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
    const colW = Math.max(40, (inner - (c - 1) * px(cs.columnGap)) / c);
    // (Mise en une colonne le temps de la mesure, puis remise comme avant : la zone imprimée reste en colonnes.)
    const saved = ['column-count', 'box-sizing', 'width'].map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
    el.style.setProperty('column-count', '1', 'important');
    el.style.setProperty('box-sizing', 'content-box', 'important');
    el.style.setProperty('width', colW + 'px', 'important');
    const top0 = el.getBoundingClientRect().top;
    const at = (v) => head + ((v - top0) / k - head) / c;
    const units = [{ y: 0, b: height, kind: 'start', at: el }];
    for (let i = 1; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      const y = at(r.top);
      if (y <= units[units.length - 1].y + EPS) continue;
      units.push({ y, b: Math.min(height, at(r.bottom) + lh), kind: 'block', at: kids[i] });
    }
    if (units.length > 1) units[0].b = Math.min(height, units[1].y + lh);
    attachNotes(el, units, at);
    for (const [p, v, prio] of saved) if (v) el.style.setProperty(p, v, prio); else el.style.removeProperty(p);
    return { height, mt: px(cs.marginTop), mb: px(cs.marginBottom), units };
  }

  function measure(el, k) {
    if (el.classList.contains('ft-cols')) {
      const m = measureCols(el, k);
      if (m) return m;
    }
    const r0 = el.getBoundingClientRect();
    const top0 = r0.top;
    const rel = (v) => (v - top0) / k;
    const cs = getComputedStyle(el);
    const units = [];
    const add = (u) => {
      const last = units[units.length - 1];
      // Même hauteur que l'endroit d'avant (début d'un élément de liste et de son paragraphe) : le
      // premier (le plus large) reste, avec le bas du morceau le plus petit.
      if (last && Math.abs(u.y - last.y) < EPS) { last.b = Math.min(last.b, u.b); return; }
      if (last && u.y < last.y) return;
      units.push(u);
    };
    const visit = (node) => {
      if (node.tagName === 'TABLE') {
        const rows = [...node.rows].filter((r) => !isGap(r));
        for (let i = 0; i < rows.length; i++) {
          if (mergedStart(rows, i) !== i) continue;
          let j = i + 1;
          while (j < rows.length && mergedStart(rows, j) <= i) j++;
          const t = rows[i].getBoundingClientRect().top;
          let b = t;
          for (let x = i; x < j; x++) b = Math.max(b, rows[x].getBoundingClientRect().bottom);
          add({ y: rel(t), b: rel(b), kind: 'row', at: rows[i], row: i });
        }
        return;
      }
      if (isAtom(node)) return;
      const kids = CONTAINER.has(node.tagName) || node.classList.contains('ft-callout') ? flowKids(node) : [];
      if (kids.length) {
        // Texte propre au bloc avant ses blocs (début d'un élément de liste qui contient une sous-liste).
        const own = linesOf(node);
        for (let i = 0; i < own.length; i++) {
          if (own[i].top >= kids[0].getBoundingClientRect().top - EPS) break;
          add({ y: rel(i ? (own[i - 1].bottom + own[i].top) / 2 : own[i].top), b: rel(own[i].bottom), kind: 'line', at: node, line: i });
        }
        for (const c of kids) {
          const r = c.getBoundingClientRect();
          add({ y: rel(r.top), b: rel(r.bottom), kind: 'block', at: c });
          visit(c);
        }
        return;
      }
      const lines = linesOf(node);
      lines.forEach((line, i) => {
        // Haut d'une ligne : à mi-chemin entre le bas du texte de la ligne d'avant et le haut du sien.
        const y = i ? (lines[i - 1].bottom + line.top) / 2 : node.getBoundingClientRect().top;
        add({ y: rel(y), b: rel(line.bottom), kind: 'line', at: node, line: i });
      });
    };
    const height = r0.height / k;
    units.push({ y: 0, b: height, kind: 'start', at: el });
    visit(el);
    // Le premier morceau va jusqu'au deuxième endroit de coupure ; un endroit tout près du haut (sous la
    // bordure d'un tableau, la marge intérieure d'un encadré) fait partie du premier morceau.
    if (units.length > 1 && units[0].b === height) {
      if (units[1].y < 8) { units[0].b = units[1].b; units.splice(1, 1); } else units[0].b = units[1].y;
    }
    // Image habillée par le texte (moteur/images.js) : la ligne où elle est accrochée ne passe pas à la page
    // suivante sans elle ; le bas de son morceau est celui de l'image, qui peut dépasser du bloc. Une image
    // ne chevauche donc jamais deux pages.
    for (const f of el.querySelectorAll('.ft-image[data-wrap="gauche"], .ft-image[data-wrap="droite"]')) {
      const r = f.getBoundingClientRect();
      if (!r.height) continue;
      const fcs = getComputedStyle(f);
      const top = rel(r.top - (parseFloat(fcs.marginTop) || 0));
      const bottom = rel(r.bottom + (parseFloat(fcs.marginBottom) || 0));
      let x = 0;
      while (x + 1 < units.length && units[x + 1].y <= top + EPS) x++;
      if (bottom > units[x].b) { units[x].b = bottom; units[x].fb = true; }
    }
    attachNotes(el, units, rel);
    return {
      height,
      mt: parseFloat(cs.marginTop) || 0,
      mb: parseFloat(cs.marginBottom) || 0,
      units: units.map((u) => ({ y: u.y, b: u.fb ? Math.max(u.b, u.y) : Math.min(height, Math.max(u.b, u.y)), kind: u.kind, at: u.at, line: u.line, fn: u.fn }))
    };
  }

  // Premier endroit d'un paragraphe (nœud, rang) qui se trouve sur sa ligne n° line.
  function lineStart(el, line) {
    const lines = linesOf(el);
    if (!lines[line]) return null;
    const lineTop = lines[line].top;
    const on = (r) => r.top >= lineTop - 1;
    for (const leaf of leavesOf(el)) {
      if (leaf.nodeType === Node.ELEMENT_NODE) {
        if (on(leaf.getBoundingClientRect())) return { node: leaf, offset: -1 };
        continue;
      }
      const rs = rectsOf(leaf);
      if (!rs.length || rs[rs.length - 1].bottom <= lineTop + 1) continue;
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

  // Le découpage. o : {
  //   n, head (haut du premier bloc dans la zone d'écriture), slot(i) (du haut du bloc i au haut du
  //   suivant), meas(i) ({ height, units }), keep(i) (le bloc ouvre une page), legend(i) (légende d'un
  //   tableau, qui le suit), withNext(i) (facultatif : titre, qui reste avec le bloc suivant), repeat(i) (hauteur de l'en-tête répété du tableau i, ou 0),
  //   region(r) (zone de texte n° r : { page, ct, cb, full, turned }, depuis le haut de la zone d'écriture),
  //   alt(i) (facultatif : { m, slot } du bloc i à la largeur d'une page tournée),
  //   note(id) (facultatif : notes de bas de page, { h, cuts } : hauteur de la note et endroits où elle
  //   peut être coupée, haut de chacune de ses lignes après la première), sep (place du filet qui les
  //   précède), cover (le bloc 0 est la page de titre : il reste sur la première page) }
  // Renvoie { R (haut de chaque bloc, pages comprises ; R[n] : bas du texte), breaks (Map i →
  // [{ j, kind, target }] : coupures dans le bloc i, avant son morceau j ; target : où ce morceau
  // commence), pageOf (page du haut de chaque bloc), opens (blocs entiers poussés en haut d'une page),
  // alt (blocs à la largeur d'une page tournée), S (place de chaque bloc, sans pages), last (dernière
  // zone utilisée), notes (notes de chaque zone : [{ id, y0, y1 }], la partie de la note posée là), fh
  // (place prise par les notes au bas de chaque zone, filet compris) }.
  // Page tournée (versions 1.x) : un bloc qui y commence prend sa largeur s'il y tient entier ; sinon
  // il garde la largeur ordinaire et se coupe comme ailleurs. Plus haut de HANG au plus : il garde la largeur
  // de la page tournée et mord sur la marge du bas.
  // Notes de bas de page : chaque note va au bas de la zone où se trouve la ligne de son appel, et la
  // place du texte de cette zone diminue d'autant. Une note qui ne tient pas entière y laisse ses
  // premières lignes (une au moins) ; la suite passe en tête des notes de la zone suivante.
  function paginate(o) {
    const n = o.n;
    const R = new Float64Array(n + 1);
    const pageOf = new Int32Array(n);
    const opens = new Uint8Array(n); // bloc entier poussé en haut d'une page
    const alt = new Uint8Array(n);
    const S = new Float64Array(n);
    const breaks = new Map();
    let cur = 0;
    let D = 0;       // ce que les coupures ont ajouté jusqu'ici
    let t = o.head;  // haut naturel du bloc

    // ----- Notes de bas de page -----
    const withNotes = !!o.note;
    const sep = o.sep || 0;
    const fh = [];      // place prise par les notes au bas de la zone r
    const placed = [];  // notes posées sur la zone r
    let carry = [];     // suites de notes à poser en tête de la zone suivante : { id, y0, x }
    let ready = -1;     // dernière zone préparée (suites posées)
    const noteOf = (id) => { const x = o.note(id); return x && x.h > 0 ? x : null; };
    // Dernier endroit de coupure de la note x entre from (exclu) et to (compris), ou from.
    const lastCut = (x, from, to) => {
      let c = from;
      for (const y of x.cuts) { if (y > from + EPS && y <= to + EPS) c = y; else if (y > to) break; }
      return c;
    };
    const put = (r, id, y0, y1) => {
      if (!fh[r]) fh[r] = sep;
      placed[r].push({ id, y0, y1 });
      fh[r] += y1 - y0;
    };
    function ensure(r) {
      while (ready < r) {
        ready++;
        fh[ready] = 0;
        placed[ready] = [];
        if (!carry.length) continue;
        const g = o.region(ready);
        // (Les suites prennent au plus les trois cinquièmes de la page : il reste de la place au texte.)
        const room = Math.max(60, (g.cb - g.ct) * 0.6) - sep;
        const list = carry;
        carry = [];
        let used = 0;
        for (const c of list) {
          if (carry.length) { carry.push(c); continue; }
          if (used + c.x.h - c.y0 <= room + EPS) { put(ready, c.id, c.y0, c.x.h); used += c.x.h - c.y0; continue; }
          let cut = lastCut(c.x, c.y0, c.y0 + room - used);
          if (cut <= c.y0 && !used) cut = c.x.cuts.find((y) => y > c.y0 + EPS) || c.x.h;
          if (cut > c.y0) { put(ready, c.id, c.y0, cut); used += cut - c.y0; }
          if (cut < c.x.h - EPS) carry.push({ ...c, y0: cut });
        }
      }
    }
    const reg = (r) => { if (withNotes) ensure(r); return o.region(r); };
    // Bas du texte de la zone r : au-dessus de ses notes.
    const bot = (r) => reg(r).cb - (withNotes ? fh[r] : 0);
    // Bloc plus haut que la place restante sur la page tournée c (long tableau…) : il en prend la largeur si
    // les pages qu'il occupera ensuite sont tournées aussi. (Compté large : chaque page peut perdre la hauteur
    // de son plus grand morceau, qui ne se coupe pas.)
    const turnedRun = (m, top, c) => {
      if (m.units.length < 2) return false;
      let unit = 0;
      for (const u of m.units) unit = Math.max(unit, u.b - u.y);
      let left = top + m.height - bot(c);
      for (let r = c + 1; left > EPS && r < c + 40; r++) {
        const g = reg(r);
        if (!g || !g.turned || !g.full) return false;
        left -= Math.max(0, bot(r) - g.ct - unit);
      }
      return left <= EPS;
    };
    // Place que demandent les notes de l'endroit u sur la zone r (acc : déjà demandée par les endroits
    // d'avant, sur cette zone).
    const need = (u, r, acc) => {
      if (!withNotes || !u.fn) return 0;
      let h = 0;
      for (const id of u.fn) { const x = noteOf(id); if (x) h += x.h; }
      return h && !fh[r] && !acc ? h + sep : h;
    };
    const commit = (r, units, from, to) => {
      if (!withNotes) return;
      for (let x = from; x < to; x++) {
        if (!units[x].fn) continue;
        for (const id of units[x].fn) { const nt = noteOf(id); if (nt) put(r, id, 0, nt.h); }
      }
    };
    // Endroit u (bas : bottom) dont les notes ne tiennent pas entières sur la zone r : ses notes entières
    // sauf la dernière, et le début de celle-ci, une ligne au moins. Renvoie { id, x, cut }, ou null.
    const trySplit = (u, r, acc, bottom) => {
      if (!withNotes || !u.fn) return null;
      const ids = u.fn.filter((id) => noteOf(id));
      if (!ids.length) return null;
      let room = bot(r) - acc - bottom - (fh[r] || acc ? 0 : sep);
      for (let x = 0; x < ids.length - 1; x++) room -= noteOf(ids[x]).h;
      const id = ids[ids.length - 1];
      const x = noteOf(id);
      const cut = lastCut(x, 0, room);
      return cut > EPS && cut < x.h - EPS ? { id, x, cut } : null;
    };
    const commitSplit = (r, u, sp) => {
      for (const id of u.fn) {
        const nt = noteOf(id);
        if (!nt) continue;
        if (id === sp.id) { put(r, id, 0, sp.cut); carry.push({ id, y0: sp.cut, x: nt }); } else put(r, id, 0, nt.h);
      }
    };

    for (let i = 0; i < n; i++) {
      let m = o.meas(i);
      let slot = o.slot(i);
      let Y = t + D;
      if (o.alt) {
        let c = cur;
        while (bot(c) < Y + m.units[0].b - EPS && c < cur + 50) c++;
        const g = reg(c);
        if (g.turned) {
          const a = o.alt(i);
          // (Avec ses notes de bas de page : un bloc qui tient sans elles, mais pas avec, passe à la page
          // suivante, où il ne doit pas garder la largeur de la page tournée.)
          let notes = 0;
          if (a) for (const u of a.m.units) notes += need(u, c, notes);
          const over = a ? Math.max(Y, g.ct) + a.m.height + notes - bot(c) : 0;
          if (a && (over <= EPS || turnedRun(a.m, Math.max(Y, g.ct) + notes, c))) {
            m = a.m;
            slot = a.slot;
            alt[i] = 1;
          } else if (a && over <= HANG) {
            // À peine plus haut que la place qui reste (tableau d'une page pleine, ses lignes ne raccourcissent
            // pas en s'élargissant) : il garde la largeur de la page tournée, entier, et mord un peu sur la
            // marge du bas, plutôt que de reprendre la largeur ordinaire ou de laisser sa dernière ligne seule
            // sur la page suivante (qui n'est pas tournée).
            const lim = a.m.height - over;
            m = { ...a.m, height: lim, units: a.m.units.map((u) => ({ ...u, y: Math.min(u.y, lim), b: Math.min(u.b, lim) })) };
            slot = a.slot;
            alt[i] = 1;
          }
        }
      }
      // Bloc qui ouvre une page (« pages qui restent en place »), légende d'un tableau ou titre qui
      // resterait seul en bas de la page : il passe à la page suivante avec la première ligne du bloc
      // qui le suit (plusieurs titres à la suite passent ensemble).
      const tied = i + 1 < n && (o.legend(i) || (o.withNext && o.withNext(i)));
      if (o.keep(i) || tied) {
        while (bot(cur) < Y + EPS) cur++;
        let move = o.keep(i) && Y > reg(cur).ct + EPS;
        if (!move && tied) {
          let ny = t + slot + D;
          let j = i + 1;
          while (j + 1 < n && j - i < 6 && o.withNext && o.withNext(j)) ny += o.slot(j++);
          // (Lignes du bloc suivant qui doivent tenir sur la page : deux pour un paragraphe simple, qui ne
          // laisse pas sa première ligne seule en bas de page ; toutes s'il n'en a que trois ou moins.)
          const nu = o.meas(j).units;
          const simple = nu.length > 1 && nu.every((u, x) => !x || (u.kind === 'line' && u.at === nu[0].at));
          const next = nu[simple ? (nu.length <= 3 ? nu.length - 1 : 1) : 0];
          move = Y > reg(cur).ct + EPS && Y < bot(cur) - EPS && ny + next.b > bot(cur) + EPS;
        }
        if (move) {
          D += reg(cur + 1).ct - Y;
          cur++;
          Y = t + D;
          opens[i] = 1;
          // (Poussé hors de la page tournée : il reprend la largeur ordinaire.)
          if (alt[i] && !reg(cur).turned) {
            alt[i] = 0;
            m = o.meas(i);
            slot = o.slot(i);
          }
        }
      }
      const units = m.units;
      let k = 0;        // premier morceau qui reste à placer
      let shift = 0;    // coupures déjà faites dans ce bloc
      // Paragraphe simple (rien que des lignes de texte) : ni sa première ligne seule en bas d'une page,
      // ni sa dernière ligne seule en haut de la suivante (comme Word et l'export PDF).
      const plain = units.length > 1 && units.every((u, x) => !x || (u.kind === 'line' && u.at === units[0].at));
      for (let guard = 0; guard < 2000; guard++) {
        const g = reg(cur);
        const top = Y + shift + units[k].y;
        if (top > bot(cur) - EPS) { cur++; continue; }
        if (k === 0 && top < g.ct - EPS && cur > 0) {
          // Dans la marge du haut de la page (le bloc d'avant a fini au bas de la page) : en haut de la zone.
          D += g.ct - top;
          Y = t + D;
          opens[i] = 1;
          continue;
        }
        let j = k;
        let acc = 0;      // place des notes des morceaux k à j - 1
        while (j < units.length) {
          const a = need(units[j], cur, acc);
          if (Y + shift + units[j].b > bot(cur) - acc - a + EPS) break;
          acc += a;
          j++;
        }
        // Morceau qui tient, mais pas ses notes entières : il reste ici avec le début de sa dernière note.
        let split = null;
        if (j < units.length && units[j].fn && Y + shift + units[j].b <= bot(cur) - acc + EPS) split = trySplit(units[j], cur, acc, Y + shift + units[j].b);
        let jj = split ? j + 1 : j;
        if (jj === units.length) {
          commit(cur, units, k, j);
          if (split) commitSplit(cur, units[j], split);
          break;
        }
        if (plain && jj > k) {
          if (units.length - jj === 1 && jj - k >= 2) jj--;
          if (jj === 1 && k === 0 && Y + units[0].y > g.ct + EPS) jj = 0;
        }
        if (jj <= j) split = null;
        j = jj;
        // Le morceau j ne tient pas. S'il commence déjà en haut de la page, plus grand qu'elle : il dépasse.
        const uTop = Y + shift + units[j].y;
        // (Page de titre en tête du document : elle couvre la première page, même mesurée avant d'en
        // prendre la place, par exemple sous les tags du document.)
        if (uTop <= g.ct + EPS || (j === 0 && !g.full) || (i === 0 && cur === 0 && o.cover)) {
          commit(cur, units, k, j);
          if (split) commitSplit(cur, units[j - 1], split);
          while (bot(cur) < Y + shift + units[j].b - EPS && guard++ < 2000) cur++;
          commit(cur, units, j, j + 1);
          k = j + 1;
          if (k >= units.length) break;
          continue;
        }
        if (split) {
          commit(cur, units, k, j - 1);
          commitSplit(cur, units[j - 1], split);
        } else commit(cur, units, k, j);
        const next = reg(cur + 1);
        let target = next.ct;
        if (j === 0) {
          D += target - uTop;
          Y = t + D;
          opens[i] = 1;
        } else {
          if (units[j].kind === 'row') target += o.repeat(i);
          shift += target - uTop;
          if (!breaks.has(i)) breaks.set(i, []);
          breaks.get(i).push({ j, kind: units[j].kind, target, gapTarget: next.ct, add: target - uTop });
        }
        cur++;
        k = j;
      }
      R[i] = Y;
      let r = cur;
      while (r > 0 && reg(r).ct > Y + EPS) r--;
      pageOf[i] = reg(r).page;
      D += shift;
      S[i] = slot;
      t += slot;
    }
    R[n] = t + D;
    // Suites de notes après la fin du texte : sur les pages qui suivent.
    for (let guard = 0; withNotes && carry.length && guard < 500; guard++) reg(++cur);
    return { R, breaks, pageOf, opens, alt, S, last: cur, notes: withNotes ? placed : null, fh: withNotes ? fh : null };
  }

  // Copie de la ligne d'en-tête d'un tableau : même apparence (styles calculés posés sur les cases),
  // sans identifiants ni marques que d'autres outils compteraient.
  const HEAD_PROPS = ['backgroundColor', 'color', 'fontWeight', 'fontStyle', 'fontSize', 'fontFamily', 'letterSpacing', 'textTransform', 'textAlign',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor',
    'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor', 'borderRightWidth', 'borderRightStyle', 'borderRightColor',
    'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'verticalAlign'];
  function fillHeadCopy(copy, row) {
    copy.replaceChildren(...[...row.cells].map((c) => {
      const to = c.cloneNode(true);
      const cs = getComputedStyle(c);
      to.removeAttribute('style');
      for (const p of HEAD_PROPS) to.style[p] = cs[p];
      to.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('id');
        for (const a of [...el.attributes]) if (a.name.startsWith('data-') || a.name === 'class') el.removeAttribute(a.name);
      });
      for (const a of [...to.attributes]) if (a.name !== 'style' && a.name !== 'colspan' && a.name !== 'rowspan') to.removeAttribute(a.name);
      return to;
    }));
  }

  window.FTDecoupage = { measure, lineStart, linesOf, paginate, fillHeadCopy, isGap, EPS };
})();
