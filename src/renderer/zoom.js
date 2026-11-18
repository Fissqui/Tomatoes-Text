// Zoom de la zone d'écriture : Ctrl + molette, Ctrl + / Ctrl − / Ctrl 0, ou la barre de zoom en bas à
// droite (curseur et valeur). Seule la page est agrandie ou réduite (zoom CSS sur #page), pas les outils.
// En mode avancé, sous DOUBLE % la vue passe en double page : deux pages côte à côte. Le texte y est
// coupé en pages par des colonnes CSS (comme en mode lecture), les feuilles sont dessinées derrière ;
// la molette passe aux deux pages suivantes. En revenant au-dessus de DOUBLE %, la vue redevient normale.
// Moteur 2.0 : les pages sont celles du mode avancé (moteur/visibles.js n'affiche que
// les blocs des deux pages, chaque coupure y ouvre une colonne) ; seules deux feuilles sont dessinées.
(function () {
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const page = $('page');
  let editor = $('editor');
  let V = null; // nouveau moteur : FTVisibles
  const workspace = $('workspace');
  const slider = $('zoom-slider');
  const field = $('zoom-value');

  const MIN = 25;
  const MAX = 300;
  const DOUBLE = 60;
  const STEPS = [25, 33, 40, 50, 60, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];

  let zoom = 100;
  let onSave = () => {};
  let double = false;
  let paused = false;  // mode lecture : la double page s'efface le temps de la lecture
  let geo = null;      // double page : { pw, ph, stride, mL, ct, colW, colH, gap, pages }
  let spread = 0;
  let topPage = null;  // nouveau moteur : page en haut de la vue ordinaire, juste avant le zoom
  // Mode lecture du mode avancé (reading.js) : la double page du moteur, en plein écran, aux pages
  // exactes du document. { zoom, lead (page de garde : couverture seule à droite), view, shift, verso }.
  let reader = null;

  const style = document.createElement('style');
  style.id = 'zoom-style';
  const sheets = document.createElement('div');
  sheets.id = 'dp-sheets';
  sheets.setAttribute('aria-hidden', 'true');
  // Verso blanc de la couverture (mode lecture) : feuille vide posée sur la page de gauche.
  const veil = document.createElement('div');
  veil.id = 'dp-veil';
  veil.hidden = true;

  const clamp = (v) => Math.max(MIN, Math.min(MAX, Math.round(v)));
  const k = () => zoom / 100;
  // Échelle affichée : en double page, les deux pages prennent toute la place de la vue.
  let fitK = 0;
  const shown = () => (double && fitK ? fitK : k());
  function applyScale() {
    const z = shown();
    page.style.zoom = z === 1 ? '' : String(z);
    page.style.setProperty('--pz', String(z));
  }

  // ----- Zoom -----

  function set(value, opts = {}) {
    const next = clamp(value);
    const anchor = opts.keep === false ? null : anchorNow(opts.at);
    // Nouveau moteur : page en haut de la vue avant le changement (la double page qui la montre).
    topPage = V && !double && !page.hidden ? V.pageAtY(workspace.getBoundingClientRect().top + 48) : null;
    zoom = next;
    applyScale();
    showValue();
    const was = double;
    updateDouble();
    if (!double && !was) {
      window.FTPages.refresh();
      restore(anchor);
    }
    if (!opts.silent) onSave(zoom);
    document.dispatchEvent(new Event('ft-zoom'));
  }

  function step(dir, at) {
    const i = dir > 0 ? STEPS.findIndex((s) => s > zoom) : STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s < zoom);
    const next = dir > 0 ? (i < 0 ? MAX : STEPS[i]) : (i >= STEPS.length ? MIN : STEPS[i]);
    if (next !== zoom) set(next, { at });
  }

  function showValue() {
    slider.value = String(zoom);
    if (document.activeElement !== field) field.value = String(zoom);
    $('zoom-out').disabled = zoom <= MIN;
    $('zoom-in').disabled = zoom >= MAX;
  }

  // Point du texte qui reste en place pendant le zoom (sous la souris, sinon en haut de la vue).
  function anchorNow(at) {
    if (double || page.hidden) return null;
    const v = workspace.getBoundingClientRect();
    const y = at ? at.y : v.top + 8;
    const r = page.getBoundingClientRect();
    if (!r.height) return null;
    return { frac: (y - r.top) / r.height, y: y - v.top };
  }
  function restore(anchor) {
    if (!anchor) return;
    const v = workspace.getBoundingClientRect();
    const r = page.getBoundingClientRect();
    workspace.scrollTop += r.top + anchor.frac * r.height - v.top - anchor.y;
  }

  // ----- Double page -----

  const wanted = () => zoom < DOUBLE && !paused && window.FTPages.isPaged() && !page.hidden && !app.classList.contains('reading-mode');

  function updateDouble() {
    if (reader) return;
    const want = wanted();
    if (want && !double) enter();
    else if (!want && double) leave();
    else if (double) layout();
  }

  function enter() {
    if (V) return enterEngine();
    double = true;
    const anchor = firstVisibleNode();
    window.FTPages.suspend(true);
    document.head.append(style);
    page.prepend(sheets);
    app.classList.add('zoom-double');
    workspace.scrollTop = 0;
    spread = 0;
    layout();
    if (anchor) showNode(anchor);
    $('zoom-pages').hidden = false;
  }

  function leave() {
    if (V) return leaveEngine();
    const anchor = double ? firstShownNode() : null;
    double = false;
    app.classList.remove('zoom-double');
    style.remove();
    sheets.remove();
    page.scrollLeft = 0;
    geo = null;
    fitK = 0;
    applyScale();
    $('zoom-pages').hidden = true;
    window.FTPages.suspend(false);
    requestAnimationFrame(() => {
      const el = anchor && anchor.nodeType === 3 ? anchor.parentElement : anchor;
      if (!el || !el.isConnected) return;
      const box = workspace.getBoundingClientRect();
      workspace.scrollTop += el.getBoundingClientRect().top - box.top - 40;
    });
  }

  function layout() {
    if (V) return layoutEngine();
    const f = window.FTPages.frame();
    const pw = f.w;
    const ph = f.h;
    const mL = f.left;
    const colW = Math.max(80, pw - f.left - f.right);
    const colH = Math.max(60, f.cb - f.ct);
    const gap = pw + f.spacing - colW;
    const stride = pw + f.spacing;
    geo = { pw, ph, stride, mL, ct: f.ct, colW, colH, gap, f, pages: 1 };
    // Les deux pages au plus grand qui tient dans la vue (largeur et hauteur), centrées.
    const spreadW = 2 * pw + f.spacing;
    const cs = getComputedStyle(workspace);
    const availW = workspace.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // Hauteur libre : du haut de la page (sous le nom du document) au bas de la vue.
    const pr = page.getBoundingClientRect();
    const marginNow = parseFloat(getComputedStyle(page).marginTop) * (page.currentCSSZoom || 1);
    const availH = workspace.getBoundingClientRect().bottom - (pr.top - marginNow) - 20;
    fitK = Math.max(0.2, Math.min(1.5, availW / spreadW, availH / ph));
    applyScale();
    const z = fitK;
    const top = 4 / z;
    style.textContent = `
#app.zoom-double #page {
  width: ${spreadW}px !important; height: ${ph}px !important; min-height: 0 !important; max-width: none !important;
  padding: 0 !important; margin: ${top}px auto 0 !important; overflow: hidden !important;
}
#app.zoom-double #editor {
  position: absolute !important; left: ${mL}px; top: ${f.ct}px; margin: 0 !important;
  width: ${2 * colW + gap}px !important; height: ${colH}px !important; min-height: 0 !important;
  column-count: 2 !important; column-gap: ${gap}px !important; column-fill: auto !important; column-rule: none !important;
}
#app.zoom-double #editor img, #app.zoom-double #editor .ft-image { max-height: ${Math.floor(colH) - 8}px; }
#app.zoom-double #editor .ft-cover { height: ${Math.floor(colH) - 1}px !important; aspect-ratio: auto !important; margin: 0 !important; break-after: column; }`;
    countPages();
    drawSheets();
    showSpread(spread);
  }

  function countPages() {
    const sw = editor.scrollWidth;
    geo.pages = Math.max(1, Math.round((sw + geo.gap) / geo.stride));
    return geo.pages;
  }
  const spreads = () => Math.max(1, Math.ceil(geo.pages / 2));

  // Feuilles, en-têtes, pieds de page et numéros, côte à côte derrière les colonnes du texte.
  function drawSheets() {
    const g = geo;
    const n = spreads() * 2;
    while (sheets.children.length < n) {
      const s = document.createElement('div');
      s.className = 'dp-sheet';
      s.innerHTML = '<div class="pg-hf pg-head"></div><div class="pg-hf pg-foot"></div><div class="pg-num-row"><span class="pg-num"></span></div>';
      sheets.append(s);
    }
    while (sheets.children.length > n) sheets.lastChild.remove();
    const x = g.f.left;
    const w = g.colW;
    [...sheets.children].forEach((s, i) => {
      Object.assign(s.style, { left: i * g.stride + 'px', width: g.pw + 'px', height: g.ph + 'px' });
      const blank = i >= g.pages;
      s.classList.toggle('dp-blank', blank);
      const d = window.FTPages.decor(i, g.pages);
      const [head, foot, row] = s.children;
      for (const [el, html, y] of [[head, d.head, g.f.hfDistance], [foot, d.foot, g.ph - g.f.hfDistance]]) {
        el.hidden = blank || !html;
        if (!el.hidden && el.innerHTML !== html) el.innerHTML = html;
        Object.assign(el.style, { top: y + 'px', left: x + 'px', width: w + 'px' });
      }
      const [vert, horiz] = d.pos.split('-');
      row.hidden = blank || !d.num;
      row.dataset.v = vert;
      row.dataset.h = horiz;
      Object.assign(row.style, { top: (vert === 'haut' ? g.f.hfDistance : g.ph - g.f.hfDistance) + 'px', left: x + 'px', width: w + 'px' });
      d.style(row.firstChild);
      row.firstChild.textContent = d.num || '';
    });
  }

  function showSpread(i) {
    if (!geo) return;
    if (V) {
      geo.pages = Math.max(1, window.FTPages.pageCount());
      spread = Math.max(0, Math.min(spreads() - 1, i));
      if (V.spreadPage() !== spread * 2) V.spread(spread * 2);
      showPages();
      return;
    }
    spread = Math.max(0, Math.min(spreads() - 1, i));
    page.scrollLeft = spread * 2 * geo.stride;
    const first = spread * 2 + 1;
    const last = Math.min(geo.pages, first + 1);
    $('zoom-spread').textContent = last > first ? `${first}–${last} / ${geo.pages}` : `${first} / ${geo.pages}`;
    $('zoom-prev').disabled = spread <= 0;
    $('zoom-next').disabled = spread >= spreads() - 1;
  }

  // Page (colonne) d'un rectangle de l'écran.
  function pageOfRect(r) {
    const box = page.getBoundingClientRect();
    return Math.max(0, Math.floor(((r.left - box.left) / shown() + page.scrollLeft - geo.mL + 2) / geo.stride));
  }
  function rectOf(node) {
    const r = document.createRange();
    if (node.nodeType === 3) r.setStart(node, 0); else r.selectNodeContents(node);
    r.collapse(true);
    return r.getClientRects()[0] || (node.nodeType === 1 ? node.getBoundingClientRect() : null);
  }
  function showNode(node) {
    const r = rectOf(node);
    if (r) showSpread(Math.floor(pageOfRect(r) / 2));
  }

  // Premier texte visible en haut de la vue normale (pour arriver au même endroit en double page).
  function firstVisibleNode() {
    const top = workspace.getBoundingClientRect().top;
    for (const el of editor.children) {
      if (el.classList.contains('ft-pg-gap')) continue;
      if (el.getBoundingClientRect().bottom > top + 8) return el;
    }
    return null;
  }
  // Premier texte de la double page affichée (pour revenir au même endroit en vue normale).
  function firstShownNode() {
    if (!geo) return null;
    const box = page.getBoundingClientRect();
    const z = shown();
    for (let dy = 4; dy < geo.colH * z; dy += 10) {
      const pos = document.caretRangeFromPoint(box.left + (geo.mL + 6) * z, box.top + geo.ct * z + dy);
      if (pos && editor.contains(pos.startContainer)) return pos.startContainer;
    }
    return null;
  }

  // ----- Double page du nouveau moteur -----

  function enterEngine(first) {
    // (Légende ou champ de la page de titre en cours d'écriture : relu d'abord. Tant qu'il reste ouvert,
    // le moteur ne retouche pas l'affichage, et les pages ne seraient pas réparties sur les deux feuilles.)
    if (window.FTObjets && window.FTObjets.finishCaption) window.FTObjets.finishCaption();
    double = true;
    // Page en haut de la vue ordinaire : la double page qui la montre.
    const top = first !== undefined ? first : topPage !== null ? topPage : V.pageAtY(workspace.getBoundingClientRect().top + 8) || 0;
    // (Vue ramenée en haut d'abord : la double page ne fait qu'une hauteur de page, et le navigateur
    // mettrait des secondes à rapprocher une vue restée tout en bas d'un long document.)
    workspace.scrollTop = 0;
    document.head.append(style);
    page.prepend(sheets);
    app.classList.add('zoom-double');
    spread = Math.floor(top / 2);
    layoutEngine();
    V.spread(spread * 2);
    $('zoom-pages').hidden = false;
  }

  function leaveEngine() {
    const first = V.spreadPage() || 0;
    double = false;
    app.classList.remove('zoom-double');
    style.remove();
    sheets.remove();
    page.scrollLeft = 0;
    geo = null;
    fitK = 0;
    applyScale();
    $('zoom-pages').hidden = true;
    // (Une fois la page revenue à sa taille : les blocs sont replacés et remesurés à la bonne largeur.)
    V.spread(null);
    window.FTPages.refresh();
    requestAnimationFrame(() => V.scrollToPage(first));
  }

  // Deux feuilles côte à côte ; derrière elles, la zone d'écriture en colonnes de la hauteur d'une page,
  // décalée pour que la colonne de la première page affichée soit sur la feuille de gauche.
  function layoutEngine() {
    const f = window.FTPages.frame();
    const pw = f.w;
    const ph = f.h;
    const colW = Math.max(80, pw - f.left - f.right);
    const gap = pw + f.spacing - colW;
    const stride = pw + f.spacing;
    geo = { pw, ph, stride, mL: f.left, ct: f.ct, colW, colH: ph - f.ct, gap, f, pages: Math.max(1, window.FTPages.pageCount()) };
    const spreadW = 2 * pw + f.spacing;
    let top;
    if (reader) {
      // Mode lecture : les deux pages au plus grand dans l'écran (sous la barre du bas), à l'échelle
      // demandée ; centrées.
      const W = window.innerWidth;
      const H = window.innerHeight;
      fitK = Math.max(0.2, Math.min(4, Math.min((W - 60) / spreadW, (H - 84) / ph) * reader.zoom));
      applyScale();
      top = Math.max(10, (H - ph * fitK) / 2 - 18) / fitK;
    } else {
      const cs = getComputedStyle(workspace);
      const availW = workspace.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const pr = page.getBoundingClientRect();
      const marginNow = parseFloat(getComputedStyle(page).marginTop) * (page.currentCSSZoom || 1);
      const availH = workspace.getBoundingClientRect().bottom - (pr.top - marginNow) - 20;
      fitK = Math.max(0.2, Math.min(1.5, availW / spreadW, availH / ph));
      applyScale();
      top = 4 / fitK;
    }
    style.textContent = `
#app.zoom-double #page {
  width: ${spreadW}px !important; height: ${ph}px !important; min-height: 0 !important; max-width: none !important;
  padding: 0 !important; margin: ${top}px auto 0 !important; overflow: hidden !important;
}
#app.zoom-double #editor {
  position: absolute !important; left: calc(${f.left}px + (var(--rd-shift, 0) - var(--pm-col0, 0)) * ${stride}px); top: ${f.ct}px; margin: 0 !important;
  width: ${colW}px !important; min-height: 0 !important;
}
#app.zoom-double #editor.pm-spread {
  width: ${2 * colW + gap}px !important; height: ${ph - f.ct}px !important;
  column-count: 2 !important; column-gap: ${gap}px !important; column-fill: auto !important; column-rule: none !important;
}
#app.zoom-double #page.pg-cover #editor > .ft-cover:first-child { margin-top: ${-f.ct}px !important; }
#app.zoom-double #dp-veil { width: ${pw}px; height: ${ph}px; }`;
    if (reader) readerShow(reader.view); else showSpread(spread);
  }

  // Mode lecture : vue i. Avec une page de garde, comme un livre : vue 0 = la couverture seule à droite
  // (pages 0–1 décalées d'une feuille, la page 1 sort de la vue), vue 1 = son verso blanc et la page 1,
  // puis vues 2–3, 4–5…
  function readerShow(i) {
    if (!reader || !geo) return;
    reader.view = i;
    const p = reader.lead ? Math.max(0, 2 * i - 2) : 2 * i;
    reader.shift = reader.lead && i === 0 ? 1 : 0;
    reader.verso = reader.lead && i === 1;
    if (reader.shift) page.style.setProperty('--rd-shift', '1'); else page.style.removeProperty('--rd-shift');
    veil.hidden = !reader.verso;
    geo.pages = Math.max(1, window.FTPages.pageCount());
    spread = p / 2;
    if (V.spreadPage() !== p) V.spread(p);
    showPages();
  }

  // Feuilles, en-têtes, pieds de page et numéros des deux pages affichées ; compteur.
  function showPages() {
    const g = geo;
    const p0 = spread * 2;
    const shift = reader ? reader.shift : 0;
    const verso = !!(reader && reader.verso);
    while (sheets.children.length < 2) {
      const s = document.createElement('div');
      s.className = 'dp-sheet';
      s.innerHTML = '<div class="pg-hf pg-head"></div><div class="pg-hf pg-foot"></div><div class="pg-num-row"><span class="pg-num"></span></div>';
      sheets.append(s);
    }
    [...sheets.children].forEach((s, k) => {
      const i = p0 + k - shift;
      Object.assign(s.style, { left: k * g.stride + 'px', width: g.pw + 'px', height: g.ph + 'px' });
      // (Mode lecture : pas de feuille avant la couverture ; verso de la couverture blanc, sans numéro.)
      s.classList.toggle('dp-void', i < 0);
      const blank = i < 0 || i >= g.pages || (verso && k === 0);
      s.classList.toggle('dp-blank', blank && !reader);
      const d = window.FTPages.decor(i, g.pages);
      const [head, foot, row] = s.children;
      for (const [el, html, y] of [[head, d.head, g.f.hfDistance], [foot, d.foot, g.ph - g.f.hfDistance]]) {
        el.hidden = blank || !html;
        if (!el.hidden && el.innerHTML !== html) el.innerHTML = html;
        Object.assign(el.style, { top: y + 'px', left: g.f.left + 'px', width: g.colW + 'px' });
      }
      const [vert, horiz] = d.pos.split('-');
      row.hidden = blank || !d.num;
      row.dataset.v = vert;
      row.dataset.h = horiz;
      Object.assign(row.style, { top: (vert === 'haut' ? g.f.hfDistance : g.ph - g.f.hfDistance) + 'px', left: g.f.left + 'px', width: g.colW + 'px' });
      d.style(row.firstChild);
      row.firstChild.textContent = d.num || '';
    });
    if (reader) return;
    const first = p0 + 1;
    const last = Math.min(g.pages, first + 1);
    $('zoom-spread').textContent = last > first ? `${first}–${last} / ${g.pages}` : `${first} / ${g.pages}`;
    $('zoom-prev').disabled = spread <= 0;
    $('zoom-next').disabled = spread >= spreads() - 1;
  }

  // Le curseur passe sur une autre page : la double page qui la montre s'affiche.
  function followCaret() {
    if (V) return;
    if (!double || !geo) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.focusNode)) return;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(false);
    let rect = r.getClientRects()[0];
    if (!rect) {
      const el = sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement;
      rect = el && el.getBoundingClientRect();
    }
    if (!rect) return;
    const s = Math.floor(pageOfRect(rect) / 2);
    if (s !== spread) showSpread(s);
  }

  // ----- Événements -----

  // Ctrl + molette : partout dans la zone d'écriture (les schémas, la frise et la mindmap gardent le leur).
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || e.defaultPrevented) return;
    e.preventDefault(); // jamais le zoom de toute la fenêtre
    if (!workspace.contains(e.target) || app.classList.contains('reading-mode') || page.hidden) return;
    if (Math.abs(e.deltaY) < 1) return;
    step(e.deltaY < 0 ? 1 : -1, { y: e.clientY });
  }, { passive: false, capture: false });

  // Ctrl + / Ctrl − / Ctrl 0 (pavé numérique compris).
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented || e.ftReplay) return;
    if (page.hidden || document.querySelector('dialog[open]') || app.classList.contains('reading-mode')) return;
    if ($('main').matches('.view-mindmap, .view-timeline')) return;
    let dir = 0;
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') dir = 1;
    else if (e.key === '-' || e.code === 'NumpadSubtract') dir = -1;
    else if (e.code === 'Digit0' || e.code === 'Numpad0') dir = 0.5;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    if (dir === 0.5) set(100); else step(dir);
  }, true);

  // Double page : la molette tourne les pages deux par deux.
  let wheelSum = 0;
  let wheelAt = 0;
  workspace.addEventListener('wheel', (e) => {
    if (!double || reader || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 400) wheelSum = 0;
    wheelSum += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheelSum) < 40 || now - wheelAt < 220) return;
    wheelAt = now;
    showSpread(spread + (wheelSum > 0 ? 1 : -1));
    wheelSum = 0;
  }, { passive: false });

  // Le navigateur fait défiler #page tout seul vers le curseur : on revient toujours à une double page entière.
  page.addEventListener('scroll', () => {
    if (!double || !geo) return;
    if (V) { if (page.scrollLeft) page.scrollLeft = 0; return; }
    const want = spread * 2 * geo.stride;
    if (Math.abs(page.scrollLeft - want) > 1) {
      followCaret();
      page.scrollLeft = spread * 2 * geo.stride;
    }
  });

  document.addEventListener('selectionchange', () => { if (double) requestAnimationFrame(followCaret); });
  let recount = null;
  editor.addEventListener('input', () => {
    if (!double || V) return;
    clearTimeout(recount);
    recount = setTimeout(() => {
      if (!double || !geo) return;
      const before = geo.pages;
      countPages();
      if (geo.pages !== before) { drawSheets(); showSpread(spread); }
      followCaret();
    }, 120);
  });
  editor.addEventListener('load', () => { if (double) layout(); }, true);
  let resizeTimer = null;
  new ResizeObserver(() => {
    if (!double) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (double) layout(); }, 80);
  }).observe(workspace);

  $('zoom-in').addEventListener('click', () => step(1));
  $('zoom-out').addEventListener('click', () => step(-1));
  slider.addEventListener('input', () => set(Number(slider.value)));
  field.addEventListener('change', () => {
    const v = parseFloat(String(field.value).replace(',', '.'));
    if (Number.isFinite(v)) set(v); else showValue();
  });
  field.addEventListener('blur', showValue);
  slider.addEventListener('dblclick', () => set(100));
  $('zoom-prev').addEventListener('click', () => showSpread(spread - 1));
  $('zoom-next').addEventListener('click', () => showSpread(spread + 1));

  window.FTZoom = {
    init(saved, save) {
      onSave = save || (() => {});
      const v = Number(saved);
      if (Number.isFinite(v) && v !== zoom) set(v, { silent: true, keep: false });
      else showValue();
    },
    set: (v) => set(v),
    in: () => step(1),
    out: () => step(-1),
    reset: () => set(100),
    get: () => zoom,
    k,
    isDouble: () => double,
    // Lance fn avec la page à 100 % (export Word : mesures en taille réelle), puis remet le zoom.
    async realSize(fn) {
      if (zoom === 100) return fn();
      const was = zoom;
      set(100, { silent: true });
      try { return await fn(); } finally { set(was, { silent: true }); }
    },
    // Mode, réglages des pages ou document changés : la double page suit.
    refresh() {
      updateDouble();
    },
    // Mode lecture : la double page s'efface pendant la lecture.
    pause(on) {
      paused = !!on;
      updateDouble();
    },
    // Mode lecture du mode avancé : ouvrir à la vue de la page first (à partir de 0), échelle (1 : les deux
    // pages au plus grand dans l'écran), vue affichée, fermer.
    readerOpen({ zoom: z, lead, first }) {
      reader = { zoom: z || 1, lead: !!lead, view: 0, shift: 0, verso: false };
      page.append(veil);
      enterEngine(first || 0);
    },
    readerZoom(z) {
      if (!reader) return;
      reader.zoom = z;
      layoutEngine();
    },
    readerShow,
    readerClose() {
      if (!reader) return;
      reader = null;
      veil.hidden = true;
      veil.remove();
      page.style.removeProperty('--rd-shift');
      leaveEngine();
    },
    pages: () => Math.max(1, window.FTPages.pageCount()),
    // Pour les essais.
    state: () => (double && geo ? { spread, pages: geo.pages } : null),
    showSpread,
    // Moteur 2.0 : la zone d'écriture du nouveau moteur.
    useEngine(mount, visibles) {
      editor = mount;
      V = visibles;
      // Le curseur a fait changer les pages affichées ; le nombre de pages a changé.
      V.onSpread((p) => { if (double && geo && p !== null) { spread = p / 2; showPages(); } });
      document.addEventListener('ft-paginated', () => {
        if (!double || !geo) return;
        geo.pages = Math.max(1, window.FTPages.pageCount());
        showPages();
      });
      editor.addEventListener('load', () => { if (double) layout(); }, true);
    }
  };
})();
