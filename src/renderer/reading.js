// Mode lecture (Ctrl+Maj+F, Affichage > « Mode lecture », bouton « Lecture ») : le document en plein écran,
// sans outils, présenté comme un livre ouvert (deux pages côte à côte si l'écran est assez large).
// Le texte n'est pas modifiable. Les pages se tournent au clavier (flèches, Page suivante, Espace), à la
// molette, par un clic sur la page de gauche ou de droite, ou par la barre du bas. Échap en sort.
// Le texte est coupé en pages par des colonnes CSS (#editor devient une suite de colonnes de la taille
// d'une page, #page ne laisse voir que les pages en cours) : la mise en forme du document est conservée.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  let editor = $('editor');
  let V = null; // moteur 2.0 : FTVisibles
  const page = $('page');
  const workspace = $('workspace');
  const bar = $('reading-bar');
  const counter = $('rd-counter');
  const slider = $('rd-slider');

  const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
  let on = false;
  let options = { zoom: 1 };
  let onOptions = () => {};
  let geo = null;     // { n : pages visibles (1 ou 2), pw, ph, stride, x0, y0, mL, mT, colW, colH }
  let total = 1;      // nombre de pages
  let spread = 0;     // vue en cours (index de la première page / n)
  // Double page avec page de garde, comme un livre : la couverture seule à droite (colonne vide avant
  // elle), puis son verso blanc à gauche et la page 2 à droite, puis 3–4, 5–6…
  let lead = 0;
  // Mode avancé (nouveau moteur) : les pages exactes du document, dans la double page du moteur
  // (zoom.js, reader), agrandies ou réduites sans changer. Sinon (mode note) : colonnes CSS ci-dessous.
  let exact = false;
  let wasEditable = 'true';
  let hideTimer = null;
  let turning = false;

  const style = document.createElement('style');
  style.id = 'rd-style';
  const sheets = document.createElement('div');
  sheets.id = 'rd-sheets';
  sheets.setAttribute('aria-hidden', 'true');

  // Format des pages du document (proportions du livre).
  function ratio() {
    const s = window.FTPages.getSettings().pages || {};
    let w = Number(s.w) || 210;
    let h = Number(s.h) || 297;
    if ((s.orient === 'paysage') !== (w > h)) [w, h] = [h, w];
    return Math.min(1.2, Math.max(0.5, w / h));
  }

  function computeGeo() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ph = Math.max(320, H - 84);
    let pw = Math.round(ph * ratio());
    let n = 2;
    if (2 * pw + 80 > W) {
      n = 1;
      pw = Math.min(pw, W - 40);
    }
    const mT = Math.round(ph * 0.08);
    const mB = Math.round(ph * 0.09);
    const mL = Math.round(Math.min(pw * 0.11, 80));
    const mR = mL;
    const colW = pw - mL - mR;
    const colH = ph - mT - mB;
    const x0 = Math.round((W - n * pw) / 2);
    const y0 = Math.max(10, Math.round((H - ph) / 2) - 18); // place pour la barre du bas
    return { n, pw, ph, mL, mR, mT, mB, colW, colH, x0, y0, stride: pw };
  }

  // Feuilles de papier dessinées derrière le texte, avec leur numéro de page.
  function drawSheets() {
    const g = geo;
    const css = getComputedStyle(page);
    const paper = css.getPropertyValue('--page').trim() || '#fff';
    const muted = css.getPropertyValue('--text-muted').trim();
    sheets.style.cssText = `left:${g.x0}px;top:${g.y0}px;width:${g.n * g.pw}px;height:${g.ph}px;`;
    sheets.classList.toggle('rd-spread', g.n === 2);
    while (sheets.children.length < g.n) {
      const s = document.createElement('div');
      s.className = 'rd-sheet';
      s.innerHTML = '<span class="rd-num"></span>';
      sheets.append(s);
    }
    while (sheets.children.length > g.n) sheets.lastChild.remove();
    [...sheets.children].forEach((s, i) => {
      s.style.cssText = `width:${g.pw}px;background:${paper};color:${muted};`;
      s.querySelector('.rd-num').style.bottom = Math.round(g.mB * 0.4) + 'px';
    });
  }

  function writeStyle() {
    const g = geo;
    const z = options.zoom;
    const clipW = g.n * g.pw - g.mL - g.mR;
    const gap = g.mL + g.mR;
    style.textContent = `
#app.reading-mode #page {
  position: absolute !important; left: ${g.x0 + g.mL}px !important; top: ${g.y0 + g.mT}px !important;
  width: ${clipW}px !important; height: ${g.colH}px !important; max-width: none !important; min-height: 0 !important;
  margin: 0 !important; padding: 0 !important; zoom: 1 !important; /* (zoom de l'écriture, zoom.js) */
}
#app.reading-mode #editor {
  zoom: ${z};
  width: ${clipW / z}px !important; height: ${g.colH / z}px !important; min-height: 0 !important;
  column-count: ${g.n} !important; column-gap: ${gap / z}px !important; column-fill: auto !important;
  column-rule: none !important;
}
#app.reading-mode #editor img, #app.reading-mode #editor .ft-image { max-height: ${Math.floor(g.colH / z) - 8}px; }
#app.reading-mode #editor .ft-cover { height: ${Math.floor(g.colH / z) - 1}px !important; aspect-ratio: auto !important; margin: 0 !important; break-after: column; }${lead ? `
#app.reading-mode #editor::before { content: ''; display: block; height: 1px; break-after: column; }` : ''}
#app.reading-mode #editor::after { content: ''; display: block; height: 1px; break-before: column; }`;
  }

  // Pages : colonnes réellement remplies, sans la colonne vide d'avant la page de garde ni celle de la fin
  // (#editor::after : sans elle, une dernière page seule à gauche ne pouvait pas être atteinte, la vue
  // s'arrêtait une page plus tôt et la montrait deux fois).
  function countPages() {
    if (exact) return (total = window.FTZoom.pages());
    const sw = page.scrollWidth;
    const cols = Math.max(1, Math.round((sw + geo.mL + geo.mR) / geo.stride));
    total = Math.max(1, cols - lead - 1);
    return total;
  }

  const spreads = () => (lead ? (total < 2 ? 1 : Math.floor((total + 1) / 2) + 1) : Math.max(1, Math.ceil(total / (exact ? 2 : geo.n))));
  // Première colonne affichée par une vue, et vue où se trouve une colonne.
  const colOf = (i) => (lead ? Math.max(0, 2 * i - 1) : i * geo.n);
  const viewOf = (col) => (lead ? (col <= 1 ? 0 : Math.floor((col + 1) / 2)) : Math.floor(col / geo.n));
  // Vue du verso de la couverture : la couverture (à gauche) est cachée, la feuille reste blanche.
  const verso = (i) => lead && i === 1;
  const hasCover = () => !!(editor.firstElementChild && editor.firstElementChild.classList.contains('ft-cover') && window.FTPages.isPaged());

  // aim : vue demandée (une touche pendant l'animation part de celle-ci, pas de l'ancienne).
  let aim = 0;
  let seq = 0;
  function showSpread(i, animate) {
    const last = spreads() - 1;
    i = Math.max(0, Math.min(last, i));
    const from = spread;
    aim = i;
    const ticket = ++seq;
    const go = () => {
      if (ticket !== seq) return;
      spread = i;
      if (exact) { window.FTZoom.readerShow(i); updateBar(); return; }
      page.scrollLeft = colOf(i) * geo.stride;
      page.style.clipPath = verso(i) ? `inset(0 0 0 ${geo.pw - geo.mL}px)` : '';
      updateBar();
    };
    if (!animate || i === from || turning || matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
    turning = true;
    const dir = i > from ? 1 : -1;
    page.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }], { duration: 110, easing: 'ease-in' }).finished.then(() => {
      go();
      return page.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 150, easing: 'ease-out' }).finished;
    }).catch(() => {}).finally(() => { turning = false; });
  }

  function updateBar() {
    if (exact) return updateExactBar();
    const first = colOf(spread) + 1 - lead;
    const shown = Math.max(1, first + (verso(spread) ? 1 : 0));
    const last = Math.min(total, first + geo.n - 1);
    counter.textContent = last > shown ? `Pages ${shown}–${last} sur ${total}` : `Page ${shown} sur ${total}`;
    slider.max = String(spreads() - 1);
    slider.value = String(spread);
    slider.disabled = spreads() < 2;
    $('rd-prev').disabled = spread <= 0;
    $('rd-next').disabled = spread >= spreads() - 1;
    $('rd-zoom-out').disabled = options.zoom <= ZOOMS[0];
    $('rd-zoom-in').disabled = options.zoom >= ZOOMS[ZOOMS.length - 1];
    // Page de titre en tête : pas de numéro sur la première page.
    const cover = hasCover();
    [...sheets.children].forEach((s, k) => {
      const p = first + k;
      const back = verso(spread) && k === 0;
      s.querySelector('.rd-num').textContent = p >= 1 && p <= total && !back && !(cover && p === 1) ? String(p) : '';
      s.classList.toggle('rd-blank', p > total || back);
      s.classList.toggle('rd-void', p < 1);
    });
  }

  // Pages exactes : numéros des pages affichées (vue 0 avec page de garde : la couverture ; vue 1 : la page 2).
  function updateExactBar() {
    const a = lead ? (spread === 0 ? 1 : spread === 1 ? 2 : 2 * spread - 1) : 2 * spread + 1;
    const b = lead && spread < 2 ? a : Math.min(total, a + 1);
    counter.textContent = b > a ? `Pages ${a}–${b} sur ${total}` : `Page ${a} sur ${total}`;
    slider.max = String(spreads() - 1);
    slider.value = String(spread);
    slider.disabled = spreads() < 2;
    $('rd-prev').disabled = spread <= 0;
    $('rd-next').disabled = spread >= spreads() - 1;
    $('rd-zoom-out').disabled = options.zoom <= ZOOMS[0];
    $('rd-zoom-in').disabled = options.zoom >= ZOOMS[ZOOMS.length - 1];
  }
  const viewOfPage = (i) => (lead ? (i <= 0 ? 0 : i === 1 ? 1 : Math.floor(i / 2) + 1) : Math.floor(i / 2));

  // ----- Position dans le texte -----

  // Page (colonne) où commence un élément ou une position du texte.
  function pageOfRect(rect) {
    const box = page.getBoundingClientRect();
    return Math.max(0, Math.floor((rect.left - box.left + page.scrollLeft + 2) / geo.stride));
  }
  function pageOfNode(node) {
    const r = document.createRange();
    if (node.nodeType === 3) r.setStart(node, 0); else r.selectNodeContents(node);
    r.collapse(true);
    let rect = r.getClientRects()[0] || (node.nodeType === 1 ? node.getClientRects()[0] : null);
    if (!rect && node.nodeType === 1) rect = node.getBoundingClientRect();
    return rect ? pageOfRect(rect) : 0;
  }
  // Premier texte visible en haut de la vue en cours (pour garder sa place au redimensionnement et à la sortie).
  function anchorNow() {
    const box = page.getBoundingClientRect();
    for (let dy = 4; dy < geo.colH; dy += 14) {
      const pos = document.caretRangeFromPoint(box.left + 6, box.top + dy);
      if (pos && editor.contains(pos.startContainer)) return pos.startContainer;
    }
    return null;
  }
  // Premier bloc visible dans la page d'écriture, avant d'entrer.
  function firstVisibleBlock() {
    const top = workspace.getBoundingClientRect().top;
    for (const el of editor.children) {
      if (el.classList.contains('ft-pg-gap')) continue;
      if (el.getBoundingClientRect().bottom > top + 8) return el;
    }
    return editor.firstElementChild;
  }

  function layout(anchor) {
    if (exact) {
      window.FTZoom.readerZoom(options.zoom);
      countPages();
      showSpread(spread, false);
      return;
    }
    geo = computeGeo();
    lead = geo.n === 2 && hasCover() ? 1 : 0;
    drawSheets();
    writeStyle();
    countPages();
    const target = anchor && anchor.isConnected ? viewOf(pageOfNode(anchor)) : spread;
    showSpread(target, false);
  }

  // ----- Entrer, sortir -----

  function set(value) {
    if (value === on) return;
    if (value && !window.FTApp.currentId()) return;
    if (value) enter(); else leave();
  }

  // Champs modifiables à l'intérieur du texte (page de titre) : fermés pendant la lecture.
  function lockFields(lock) {
    // (Nouveau moteur : marques posées hors de sa surveillance, elles n'appartiennent pas au texte.)
    const obs = V && window.FTMoteur.view.domObserver;
    if (obs) obs.stop();
    try { lockFieldsNow(lock); } finally { if (obs) obs.start(); }
  }
  function lockFieldsNow(lock) {
    editor.querySelectorAll(lock ? '[contenteditable="true"]' : '[data-rd-locked]').forEach((el) => {
      if (lock) { el.setAttribute('contenteditable', 'false'); el.dataset.rdLocked = ''; } else { el.setAttribute('contenteditable', 'true'); delete el.dataset.rdLocked; }
    });
  }

  function enter() {
    // (Légende ou champ de la page de titre en cours d'écriture : relu avant de fermer la saisie.)
    if (window.FTObjets && window.FTObjets.finishCaption) window.FTObjets.finishCaption();
    const anchor = firstVisibleBlock();
    on = true;
    if (window.FTMindmap) window.FTMindmap.show(false);
    if (window.FTTimeline) window.FTTimeline.show(false);
    if (window.FTAssistant) window.FTAssistant.toggle(false);
    if (window.FTFind) window.FTFind.reset();
    exact = !!(V && window.FTPages.isPaged());
    // (Page en haut de la vue avant d'entrer : la lecture s'ouvre sur elle.)
    const firstPage = exact ? (V.spreadPage() !== null ? V.spreadPage() : V.pageAtY(workspace.getBoundingClientRect().top + 8) || 0) : 0;
    if (window.FTZoom) window.FTZoom.pause(true);
    window.getSelection().removeAllRanges();
    setEditable(false);
    lockFields(true);
    if (exact) {
      lead = hasCover() ? 1 : 0;
      total = window.FTZoom.pages();
      spread = aim = viewOfPage(firstPage);
      app.classList.add('reading-mode', 'rd-exact');
      window.FTZoom.readerOpen({ zoom: options.zoom, lead, first: firstPage });
      api.setFullScreen(true);
      showSpread(spread, false);
      showBar();
      return;
    }
    // Nouveau moteur : tout le texte est affiché, sans coupures de page (les colonnes font les pages).
    if (V) V.enable(false);
    window.FTPages.suspend(true);
    document.head.append(style);
    workspace.prepend(sheets);
    app.classList.add('reading-mode');
    api.setFullScreen(true);
    // (Pas de page.scrollLeft ici : il ferait mettre en page tout le texte avant les colonnes ; la vue
    // est placée par layout.)
    spread = aim = 0;
    layout(anchor);
    // Le plein écran change la taille de la fenêtre : la mise en page suit (voir resize).
    showBar();
  }

  function leave() {
    if (exact) return leaveExact();
    const anchor = geo ? anchorNow() : null;
    on = false;
    app.classList.remove('reading-mode');
    style.remove();
    sheets.remove();
    // Nouveau moteur : les blocs sont retirés de l'affichage avant toute mise en page, puis seuls ceux
    // autour de l'endroit lu sont remis en page (et pas tout le document).
    if (V) V.enable(true);
    page.scrollLeft = 0;
    page.style.clipPath = '';
    setEditable(true);
    lockFields(false);
    bar.classList.remove('show');
    api.setFullScreen(false);
    window.FTPages.suspend(false);
    geo = null;
    if (window.FTZoom) window.FTZoom.pause(false);
    // Retour à l'endroit lu.
    requestAnimationFrame(() => {
      const el = anchor && anchor.nodeType === 3 ? anchor.parentElement : anchor;
      if (!el || !el.isConnected) return;
      const box = workspace.getBoundingClientRect();
      // (Nouveau moteur : le bloc peut être loin de l'écran, donc pas affiché ; sa place est connue.)
      const top = V ? V.topOf(el) : el.getBoundingClientRect().top;
      if (top !== null) workspace.scrollTop += top - box.top - 40;
    });
  }

  // Pages exactes : la double page du moteur se referme sur la page lue.
  function leaveExact() {
    on = false;
    exact = false;
    app.classList.remove('reading-mode', 'rd-exact');
    setEditable(true);
    lockFields(false);
    bar.classList.remove('show');
    api.setFullScreen(false);
    window.FTZoom.readerClose();
    // (Blocs et notes mesurés avec les styles du mode lecture — champs vides cachés… : tout est remesuré.)
    V.remeasure();
    window.FTZoom.pause(false);
  }

  // Texte modifiable ou non : attribut de la zone d'écriture, ou réglage du nouveau moteur.
  function setEditable(on) {
    if (V) { window.FTMoteur.view.setProps({ editable: () => on }); return; }
    if (!on) wasEditable = editor.getAttribute('contenteditable') || 'true';
    editor.setAttribute('contenteditable', on ? wasEditable : 'false');
  }

  // ----- Barre du bas -----

  function showBar() {
    bar.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!bar.matches(':hover, :focus-within')) bar.classList.remove('show');
    }, 2400);
  }

  function setZoom(delta) {
    const i = ZOOMS.indexOf(options.zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + delta))];
    if (next === options.zoom) return;
    const anchor = exact ? null : anchorNow();
    options.zoom = next;
    onOptions({ ...options });
    layout(anchor);
  }

  // ----- Événements -----

  const next = () => showSpread(aim + 1, true);
  const prev = () => showSpread(aim - 1, true);

  window.addEventListener('keydown', (e) => {
    if (!on || e.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key;
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
    if (k === 'Escape') { e.preventDefault(); set(false); return; }
    // Le texte est fermé pendant la lecture : les raccourcis d'écriture (annuler, gras, palette de
    // commandes, outils…) sont sans effet. Restent copier, tout sélectionner, le zoom et les raccourcis
    // du menu (app.js décide pour eux : sans effet, ou lecture quittée d'abord).
    if (!plain && !['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(k)) {
      const cmd = window.FTShortcuts && window.FTShortcuts.commandAt ? window.FTShortcuts.commandAt(e) : null;
      const ctrl = e.ctrlKey || e.metaKey;
      const kept = (ctrl && !e.altKey && (/^[+=\-0]$/.test(k) || (!e.shiftKey && /^[ca]$/i.test(k)))) || /^F\d{1,2}$/.test(k);
      if (cmd ? cmd.kind !== 'menu' : ctrl && !kept) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if (e.target && e.target.closest && e.target.closest('#reading-bar') && /^(Arrow|Home|End|Page)/.test(k) && e.target.id === 'rd-slider') return;
    if (plain && (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey))) { e.preventDefault(); next(); }
    else if (plain && (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey))) { e.preventDefault(); prev(); }
    else if (plain && k === 'Home') { e.preventDefault(); showSpread(0, true); }
    else if (plain && k === 'End') { e.preventDefault(); showSpread(spreads() - 1, true); }
    else if ((e.ctrlKey || e.metaKey) && (k === '+' || k === '=')) { e.preventDefault(); setZoom(1); }
    else if ((e.ctrlKey || e.metaKey) && k === '-') { e.preventDefault(); setZoom(-1); }
    else if (plain && k.length === 1) e.preventDefault(); // pas de saisie dans le texte
  }, true);

  let wheelSum = 0;
  let wheelAt = 0;
  workspace.addEventListener('wheel', (e) => {
    if (!on) return;
    if (!exact) e.preventDefault();
    if (e.ctrlKey) { e.preventDefault(); if (Math.abs(e.deltaY) > 2) setZoom(e.deltaY < 0 ? 1 : -1); return; }
    // (Pages agrandies plus haut que l'écran : la molette les fait défiler.)
    if (exact && workspace.scrollHeight > workspace.clientHeight + 2) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 400) wheelSum = 0;
    wheelSum += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(wheelSum) < 40 || now - wheelAt < 260) return;
    wheelAt = now;
    if (wheelSum > 0) next(); else prev();
    wheelSum = 0;
  }, { passive: false });

  // Clic sur une page : celle de gauche recule, celle de droite avance (pas pendant une sélection,
  // ni sur un lien, une note ou une ligne de plan).
  let downAt = null;
  workspace.addEventListener('mousedown', (e) => { if (on) downAt = { x: e.clientX, y: e.clientY }; });
  workspace.addEventListener('click', (e) => {
    if (!on || e.button !== 0) return;
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4;
    if (moved) return;
    // (Lien d'abord : un clic sur un renvoi ou sur le plan le sélectionne en entier, ce n'est pas une
    // sélection de texte faite par le lecteur.)
    const t = e.target.closest && e.target.closest('a, sup.ft-fn-ref, sup.ft-en-ref, .ft-toc-item, .ft-lof-item, .ft-xref');
    if (t && editor.contains(t)) { follow(t, e); return; }
    if (!window.getSelection().isCollapsed) return;
    const pr = page.getBoundingClientRect();
    const mid = exact ? (pr.left + pr.right) / 2 : geo.n === 2 ? geo.x0 + geo.pw : geo.x0 + geo.pw * 0.3;
    if (e.clientX < mid) prev(); else next();
  }, true);

  // Liens internes : on va à la page de la cible.
  function follow(t, e) {
    e.preventDefault();
    e.stopPropagation();
    window.getSelection().removeAllRanges();
    let target = null;
    if (t.matches('.ft-toc-item') && window.FTToc.targetOf) target = window.FTToc.targetOf(t);
    if (t.matches('.ft-lof-item') && window.FTCaptions) target = window.FTCaptions.targetOf(t);
    else if (t.matches('sup.ft-fn-ref')) target = editor.querySelector(`.ft-footnotes li[data-fn="${CSS.escape(t.dataset.fn || '')}"]`) || editor.querySelector('.ft-footnotes');
    else if (t.matches('sup.ft-en-ref')) target = editor.querySelector('.ft-endnotes');
    else if (t.matches('.ft-xref') && window.FTXref) target = window.FTXref.targetOf(t);
    else if (t.matches('a.ft-doclink')) {
      if (t.dataset.doc) openLinkedDoc(t.dataset.doc);
      return;
    } else if (t.matches('a[href]') && /^(https?|mailto):/i.test(t.getAttribute('href') || '')) {
      window.open(t.href);
      return;
    }
    if (target && exact) {
      const pg = V.pageOfPos(window.FTMoteur.view.posAtDOM(target, 0));
      if (pg !== null) showSpread(viewOfPage(pg), true);
    } else if (target) showSpread(viewOf(pageOfNode(target)), true);
  }

  // Document lié ouvert par la lecture elle-même : elle reste ouverte (app.js la referme sinon).
  let linking = false;
  async function openLinkedDoc(id) {
    // (Pages exactes : la lecture se referme puis se rouvre sur l'autre document.)
    if (exact) {
      leaveExact();
      if (await window.FTApp.openDocById(id)) requestAnimationFrame(() => set(true));
      return;
    }
    linking = true;
    let done = false;
    try { done = await window.FTApp.openDocById(id); } finally { linking = false; }
    if (!done || !on) return;
    setEditable(false);
    lockFields(true);
    if (V) V.enable(false);
    window.FTPages.suspend(true);
    page.scrollLeft = 0;
    spread = aim = 0;
    requestAnimationFrame(() => layout(null));
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!on || exact) return; // (pages exactes : zoom.js suit la taille de la vue)
    clearTimeout(resizeTimer);
    const anchor = anchorNow();
    resizeTimer = setTimeout(() => { if (on) layout(anchor); }, 80);
  });
  // Images et polices chargées après l'entrée : le nombre de pages peut changer.
  editor.addEventListener('load', () => { if (on) { countPages(); updateBar(); } }, true);
  document.fonts.addEventListener('loadingdone', () => { if (on && !exact) layout(anchorNow()); });
  // Pages exactes : nombre de pages refait par le moteur.
  document.addEventListener('ft-paginated', () => { if (on && exact) { countPages(); updateBar(); } });

  document.addEventListener('mousemove', () => { if (on) showBar(); });
  $('rd-prev').addEventListener('click', prev);
  $('rd-next').addEventListener('click', next);
  $('rd-exit').addEventListener('click', () => set(false));
  $('rd-zoom-in').addEventListener('click', () => setZoom(1));
  $('rd-zoom-out').addEventListener('click', () => setZoom(-1));
  slider.addEventListener('input', () => showSpread(Number(slider.value), false));
  $('reading-btn').addEventListener('click', () => set(true));

  window.FTReading = {
    toggle: () => set(!on),
    set,
    isOn: () => on,
    // Vrai pendant que la lecture ouvre elle-même un document lié.
    following: () => linking,
    // Plein écran quitté autrement (F11) : on sort aussi du mode lecture.
    fullScreenLeft() { if (on) set(false); },
    init(saved, save) {
      if (saved && typeof saved === 'object' && ZOOMS.includes(saved.zoom)) options = { zoom: saved.zoom };
      onOptions = save;
    },
    // Pour les essais : position et nombre de pages.
    state: () => (on ? { spread: aim, total, n: exact ? 2 : geo.n, exact } : null),
    // Moteur 2.0 : la zone d'écriture du nouveau moteur.
    useEngine(mount, visibles) {
      editor = mount;
      V = visibles;
      editor.addEventListener('load', () => { if (on) { countPages(); updateBar(); } }, true);
    }
  };
})();
