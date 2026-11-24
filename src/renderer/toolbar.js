// Barres d'outils : la barre principale (écriture et mise en forme) et la barre d'insertion
// (tableau, image, formule, note, caractères, cases). On déplace un bouton en maintenant le clic
// dessus, et une barre avec sa poignée (en haut, en bas, ou verticale sur un côté). Le cadenas
// fermé fait bouger les deux barres ensemble. La disposition est gardée dans les réglages
// ({ v: 7, pos, pos2, linked, folded, groups: { nom du groupe: [identifiants des boutons] } }).
// La barre d'insertion se range comme un tiroir avec la flèche de la barre principale (folded : rangée).
// Mode raccourcis (side.on) : les outils courants passent sur deux barres verticales de part et d'autre
// du document (à gauche ce qui s'insère, à droite la mise en forme du texte) ; les autres outils restent
// sur une seule barre horizontale. Chaque outil déplacé laisse à sa place une marque cachée (.tb-home),
// où il revient quand le mode s'arrête ; side.groups garde le contenu des barres latérales.
(function () {
  const main = document.getElementById('main');
  const bars = [document.getElementById('toolbar'), document.getElementById('toolbar2')];
  const NAMES = ['La barre principale', "La barre d'insertion"];
  const HOLD = 350;          // durée du clic maintenu avant de saisir un bouton (ms)
  const POSITIONS = [['haut', 'En haut'], ['bas', 'En bas'], ['gauche', 'À gauche (verticale)'], ['droite', 'À droite (verticale)']];

  // Barres latérales du mode raccourcis : leurs groupes et les outils qu'elles reçoivent d'origine.
  const SIDE = [
    ['tb-side-l', 'Insertion', [
      ['objets', ['table', 'image', 'diagram', 'math', 'bio']],
      ['blocs', ['quote', 'callout', 'code']],
      ['symboles', ['chars', 'date']],
      ['notes', ['note', 'endnote', 'cite']],
      ['liens', ['weblink', 'xref']]
    ]],
    ['tb-side-r', 'Mise en forme du texte', [
      ['police', ['font', 'size']],
      ['caracteres', ['bold', 'italic', 'underline', 'strike', 'smallcaps', 'case', 'color', 'highlight']],
      ['paragraphe', ['align-left', 'align-center', 'align-right', 'align-justify', 'indent', 'bullets', 'check', 'structure', 'lettrine']]
    ]]
  ];
  const SIDE_DEFAULT = Object.fromEntries(SIDE.flatMap(([, , gs]) => gs));
  const sides = SIDE.map(([id, label, gs]) => {
    const bar = document.createElement('div');
    bar.id = id;
    bar.className = 'ft-toolbar tb-side tb-vertical';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', label);
    bar.hidden = true;
    for (const [name] of gs) {
      const g = document.createElement('div');
      g.className = 'tb-group';
      g.dataset.side = name;
      g.setAttribute('role', 'group');
      g.hidden = true;
      bar.append(g);
    }
    return bar;
  });
  bars[1].after(...sides);

  const allBars = () => [...bars, ...sides];
  const barOf = (el) => allBars().find((b) => b.contains(el)) || null;
  const inBars = (el) => !!barOf(el);
  const inSide = (el) => sides.some((s) => s.contains(el));
  const groups = () => bars.flatMap((b) => [...b.querySelectorAll(':scope > .tb-group')]);
  const sideGroups = () => sides.flatMap((b) => [...b.querySelectorAll(':scope > .tb-group')]);
  const groupNamed = (name) => groups().find((g) => g.dataset.group === name);
  const byId = (id) => allBars().map((b) => b.querySelector(`.tb-group > [data-tb="${id}"]`)).find(Boolean) || null;
  const isHome = (c) => c.classList.contains('tb-home');
  const homeMark = (id) => {
    const m = document.createElement('span');
    m.className = 'tb-home';
    m.dataset.home = id;
    m.hidden = true;
    return m;
  };
  const homesOf = (id) => bars.flatMap((b) => [...b.querySelectorAll('.tb-home')]).filter((m) => m.dataset.home === id);
  const itemOf = (el) => {
    const it = el && el.closest && el.closest('.tb-group > [data-tb]');
    return it && inBars(it) ? it : null;
  };
  const DEFAULT = groups().map((g) => [g.dataset.group, [...g.children].map((c) => c.dataset.tb)]);
  const HOME2 = [...bars[1].querySelectorAll(':scope > .tb-group')].map((g) => g.dataset.group);

  const pos = ['haut', 'haut'];
  let linked = true;
  let folded = false;
  let sideOn = false;
  let sideSaved = cleanSide(null);
  let onChange = () => {};

  // Contenu des barres latérales : celui des réglages (outils connus, chacun une seule fois) ou celui d'origine.
  function cleanSide(saved) {
    if (!saved || typeof saved !== 'object') return JSON.parse(JSON.stringify(SIDE_DEFAULT));
    const seen = new Set();
    return Object.fromEntries(Object.keys(SIDE_DEFAULT).map((name) => [name, (Array.isArray(saved[name]) ? saved[name] : [])
      .filter((id) => typeof id === 'string' && !seen.has(id) && seen.add(id))]));
  }
  const sideLists = () => (sideOn
    ? Object.fromEntries(sideGroups().map((g) => [g.dataset.side, [...g.children].map((c) => c.dataset.tb).filter(Boolean)]))
    : sideSaved);

  const layout = () => ({
    v: 7,
    pos: pos[0],
    pos2: pos[1],
    linked,
    folded,
    groups: Object.fromEntries(groups().map((g) => [g.dataset.group, [...g.children].map((c) => c.dataset.tb || c.dataset.home).filter(Boolean)])),
    side: { on: sideOn, groups: sideLists() }
  });
  const save = () => onChange(layout());
  const tidy = () => [...groups(), ...sideGroups()].forEach((g) => { g.hidden = ![...g.children].some((c) => !isHome(c)); });

  // Nom des groupes sous une barre horizontale : un groupe d'un seul outil s'élargit à la taille de son
  // nom, pour que les noms voisins ne se chevauchent pas (mode raccourcis surtout).
  const measure = document.createElement('canvas').getContext('2d');
  function fitCaptions() {
    for (const g of groups()) {
      g.style.minWidth = '';
      g.style.justifyContent = '';
      const bar = barOf(g);
      if (g.hidden || !g.dataset.caption || !bar || bar.classList.contains('tb-vertical')) continue;
      const cs = getComputedStyle(g, '::after');
      if (cs.display === 'none' || cs.content === 'none') continue;
      measure.font = cs.font;
      const need = Math.ceil(measure.measureText(g.dataset.caption).width) + 14;
      if (g.getBoundingClientRect().width < need) {
        g.style.minWidth = need + 'px';
        g.style.justifyContent = 'center';
      }
    }
  }

  // Entrer dans le mode raccourcis : chaque outil prévu passe sur sa barre latérale (une marque cachée
  // garde sa place) ; les groupes de la barre d'insertion rejoignent la barre principale.
  function enterSide() {
    if (sideOn) return;
    sideOn = true;
    for (const g of sideGroups()) {
      for (const id of sideSaved[g.dataset.side] || []) {
        const el = byId(id);
        if (!el || inSide(el)) continue;
        el.before(homeMark(id));
        g.append(el);
      }
    }
    const last = [...bars[0].querySelectorAll(':scope > .tb-group')].pop();
    last.after(...bars[1].querySelectorAll(':scope > .tb-group'));
  }

  // En sortir : chaque outil revient à sa marque, les groupes de la barre d'insertion dans leur barre.
  function leaveSide() {
    if (!sideOn) return;
    sideSaved = sideLists();
    sideOn = false;
    for (const m of bars.flatMap((b) => [...b.querySelectorAll('.tb-home')])) {
      const el = byId(m.dataset.home);
      if (el && inSide(el)) m.replaceWith(el);
      else m.remove();
    }
    for (const el of sideGroups().flatMap((g) => [...g.children])) {
      const d = DEFAULT.find(([, ids]) => ids.includes(el.dataset.tb));
      (d ? groupNamed(d[0]) : groups()[0]).append(el);
    }
    HOME2.forEach((name) => bars[1].append(groupNamed(name)));
  }

  function setSide(on) {
    on = !!on;
    if (on === sideOn) return;
    if (on) enterSide();
    else leaveSide();
    tidy();
    place(true);
    save();
  }
  const isVertical = (p) => p === 'gauche' || p === 'droite';
  const valid = (p) => (POSITIONS.some((x) => x[0] === p) ? p : 'haut');

  // Flèche du tiroir : dans la barre principale, juste après le cadenas.
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'tb-fold';
  fold.innerHTML = '<svg viewBox="0 0 16 16"><path d="M5 9.5l3-3 3 3"/></svg>';
  bars[0].querySelector('.tb-lock').after(fold);
  fold.addEventListener('mousedown', (e) => e.preventDefault());
  // Ranger : la barre se replie en douceur (sa place se referme avec elle) ; sortir : elle glisse dehors.
  let closing = null;
  function setFolded(on) {
    const bar = bars[1];
    on = !!on;
    if (closing) { closing.cancel(); closing = null; }
    bar.classList.remove('tb-opening', 'tb-closing');
    if (on && !folded) {
      const v = isVertical(pos[1]);
      const size = v ? bar.offsetWidth : bar.offsetHeight;
      const prop = v ? 'width' : 'height';
      const pad = v ? ['paddingLeft', 'paddingRight'] : ['paddingTop', 'paddingBottom'];
      const cs = getComputedStyle(bar);
      bar.classList.add('tb-closing');
      closing = bar.animate([
        { [prop]: size + 'px', minWidth: 0, [pad[0]]: cs[pad[0]], [pad[1]]: cs[pad[1]], opacity: 1, overflow: 'hidden' },
        { [prop]: '0px', minWidth: 0, [pad[0]]: '0px', [pad[1]]: '0px', opacity: 0, overflow: 'hidden' }
      ], { duration: document.documentElement.dataset.uiAnim === 'aucune' ? 1 : 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
      closing.onfinish = () => { closing = null; bar.classList.remove('tb-closing'); };
    } else if (!on && folded) {
      void bar.offsetWidth;
      bar.classList.add('tb-opening');
    }
    folded = on;
    place();
    save();
  }
  bars[1].addEventListener('animationend', () => bars[1].classList.remove('tb-opening'));
  fold.addEventListener('click', () => setFolded(!folded));

  // Barres latérales collées aux bords de la feuille (la page en interface note, les feuilles en
  // interface avancée, les deux feuilles en double page), en haut de la page puis fixes au défilement.
  const workspace = document.getElementById('workspace');
  const pageEl = document.getElementById('page');
  const GAP = 8;
  function paperRect() {
    const sheets = pageEl.classList.contains('paged') ? [...pageEl.querySelectorAll('#pg-sheets > .pg-sheet')].slice(0, 2) : [];
    const rects = (sheets.length ? sheets : [pageEl]).map((el) => el.getBoundingClientRect()).filter((r) => r.width);
    if (!rects.length) return null;
    return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)) };
  }
  function placeSides() {
    if (!sideOn) return;
    const paper = pageEl.hidden ? null : paperRect();
    const ws = workspace.getBoundingClientRect();
    sides.forEach((s) => s.classList.toggle('tb-side-away', !paper || !ws.width));
    if (!paper || !ws.width) return;
    const inner = ws.left + workspace.clientWidth;   // (sans la barre de défilement)
    const top = Math.max(ws.top + 10, Math.min(paper.top, ws.bottom - 60));
    const [l, r] = sides;
    l.style.left = Math.max(ws.left + 4, paper.left - GAP - l.offsetWidth) + 'px';
    r.style.left = Math.min(inner - r.offsetWidth - 4, paper.right + GAP) + 'px';
    for (const s of sides) {
      s.style.top = top + 'px';
      s.style.maxHeight = Math.max(80, ws.bottom - top - 10) + 'px';
    }
  }
  let placing = 0;
  const replace = () => { if (!sideOn) return; cancelAnimationFrame(placing); placing = requestAnimationFrame(placeSides); };
  workspace.addEventListener('scroll', replace, { passive: true });
  window.addEventListener('resize', replace);
  const watchSize = new ResizeObserver(replace);
  [workspace, pageEl, document.getElementById('editor')].forEach((el) => el && watchSize.observe(el));
  // Zoom (style de la page), interface avancée (classe), feuilles ajoutées ou retirées.
  new MutationObserver(replace).observe(pageEl, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  new MutationObserver(replace).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });

  const sideSwitch = document.getElementById('sidemode-switch');
  if (sideSwitch) {
    sideSwitch.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => setSide(b.dataset.side === 'on'));
    });
  }

  // Rangée et colonne de chaque barre dans la grille de #main (voir styles.css) :
  // en haut rangées 2 et 3, en bas 5 et 6, à gauche colonnes 1 et 2, à droite 4 et 5.
  // Mode raccourcis : la barre d'insertion (vidée dans la barre principale) est cachée ; les barres
  // latérales sont placées par placeSides().
  function place(animate = false) {
    bars.forEach((bar, i) => {
      const p = pos[i];
      bar.classList.remove('tb-haut', 'tb-bas', 'tb-gauche', 'tb-droite', 'tb-vertical');
      bar.classList.add('tb-' + p);
      if (isVertical(p)) bar.classList.add('tb-vertical');
      const row = { haut: 2 + i, bas: 5 + i, gauche: 4, droite: 4 }[p];
      const col = { gauche: String(1 + i), droite: String(4 + i) }[p] || '1 / -1';
      bar.style.gridRow = String(row);
      bar.style.gridColumn = col;
    });
    sides.forEach((s) => {
      if (s.hidden === sideOn && sideOn && animate && document.documentElement.dataset.uiAnim !== 'aucune') {
        s.classList.remove('tb-opening');
        void s.offsetWidth;
        s.classList.add('tb-opening');
      }
      s.hidden = !sideOn;
    });
    workspace.classList.toggle('side-mode', sideOn);
    placeSides();
    bars[1].classList.toggle('tb-merged', sideOn);
    fold.hidden = sideOn;
    if (sideSwitch) {
      sideSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.side === 'on') === sideOn)));
      if (window.FTSwitch) requestAnimationFrame(() => window.FTSwitch.place(sideSwitch, animate));
    }
    requestAnimationFrame(fitCaptions);
    fold.title = folded ? "Sortir la barre d'insertion" : "Ranger la barre d'insertion";
    fold.setAttribute('aria-expanded', String(!folded));
    bars[1].classList.toggle('tb-folded', folded);
    for (const b of document.querySelectorAll('.tb-lock')) {
      b.classList.toggle('on', linked);
      b.setAttribute('aria-pressed', String(linked));
      b.title = linked
        ? "Cadenas fermé : les deux barres d'outils se déplacent ensemble. Cliquez pour les déplacer séparément."
        : "Cadenas ouvert : chaque barre d'outils se déplace de son côté. Cliquez pour les attacher ensemble.";
    }
  }

  function setPos(i, p) {
    p = valid(p);
    if (linked) pos[0] = pos[1] = p;
    else pos[i] = p;
    place();
  }

  function setLinked(on) {
    linked = !!on;
    if (linked) pos[1] = pos[0];
    place();
  }

  // Ordre d'origine, puis celui des réglages (un bouton qu'ils ne connaissent pas reste à sa place d'origine).
  // Les réglages d'avant les deux barres (sans « v: 2 ») ne gardent que la place de la barre.
  function apply(saved) {
    leaveSide();
    DEFAULT.forEach(([name, ids]) => { const g = groupNamed(name); ids.forEach((id) => { const el = byId(id); if (el) g.append(el); }); });
    // Version 2.4.19 : les deux barres sont rangées par étapes (écrire et mettre en forme ; ajouter) ; un
    // rangement enregistré avant (v < 7) est oublié, seule la place des barres est gardée.
    if (saved && saved.v === 7 && saved.groups && typeof saved.groups === 'object') {
      for (const [name, ids] of Object.entries(saved.groups)) {
        const g = groupNamed(name);
        if (!g || !Array.isArray(ids)) continue;
        ids.forEach((id) => {
          const el = typeof id === 'string' && byId(id);
          if (el) g.append(el);
        });
      }
    }
    tidy();
    linked = !saved || saved.linked !== false;
    folded = !!(saved && saved.folded);
    pos[0] = valid(saved && saved.pos);
    pos[1] = linked ? pos[0] : valid(saved && saved.pos2);
    const side = saved && saved.side && typeof saved.side === 'object' ? saved.side : null;
    sideSaved = cleanSide(side && side.groups);
    if (side && side.on) enterSide();
    tidy();
    place();
  }

  // ----- Fenêtres des boutons : sous le bouton, ou à côté quand la barre est verticale -----

  function placePop(pop, anchor, gap = 4) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const bar = barOf(anchor);
    const p = !bar ? null : bar === sides[0] ? 'gauche' : bar === sides[1] ? 'droite' : pos[bars.indexOf(bar)];
    let left = r.left;
    let top = r.bottom + gap;
    // (Barres latérales : la fenêtre s'ouvre contre la barre, sur le document.)
    const edge = sides.includes(bar) ? bar.getBoundingClientRect() : r;
    if (p === 'gauche') { left = edge.right + gap; top = r.top; }
    if (p === 'droite') { left = edge.left - w - gap; top = r.top; }
    if (p === 'bas') top = r.top - h - gap;
    pop.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
  }

  // ----- Déplacer un bouton : clic maintenu, puis glisser -----

  let dragging = null;

  function nearest(g, x, y, skip) {
    let best = null;
    for (const c of g.children) {
      if (c === skip || isHome(c)) continue;
      const r = c.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (!best || d < best.d) best = { c, d, after: x > r.left + r.width / 2 };
    }
    return best;
  }

  function groupAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const g = hit && hit.closest && hit.closest('.tb-group');
    if (g && inBars(g)) return g;
    // Une barre latérale vidée reçoit encore des outils.
    const side = hit && hit.closest && hit.closest('.tb-side');
    if (side && sides.includes(side)) return [...side.children].find((c) => !c.hidden) || side.firstElementChild;
    let best = null;
    for (const c of [...groups(), ...(sideOn ? sideGroups() : [])]) {
      if (c.hidden && c !== (dragging && dragging.from)) continue;
      const r = c.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { c, d };
    }
    return best && best.d < 60 ? best.c : null;
  }

  function startItemDrag(it, x, y) {
    const r = it.getBoundingClientRect();
    const ghost = it.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.querySelectorAll('[hidden], .ft-pop').forEach((n) => n.remove());
    ghost.className += ' tb-ghost';
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    document.body.append(ghost);
    dragging = { it, ghost, dx: x - r.left, dy: y - r.top, from: it.parentElement };
    // Mode raccourcis : un outil de la barre horizontale garde sa place, au cas où il irait sur le côté.
    if (sideOn && !inSide(it) && !homesOf(it.dataset.tb).length) it.before(homeMark(it.dataset.tb));
    it.classList.add('tb-dragging');
    document.body.classList.add('tb-moving');
    moveItem(x, y);
  }

  function moveItem(x, y) {
    const { it, ghost, dx, dy } = dragging;
    ghost.style.left = x - dx + 'px';
    ghost.style.top = y - dy + 'px';
    const g = groupAt(x, y);
    if (!g) return;
    const n = nearest(g, x, y, it);
    if (!n) g.append(it);
    else if (n.after) n.c.after(it);
    else n.c.before(it);
    tidy();
  }

  function endItemDrag() {
    const { it, ghost } = dragging;
    ghost.remove();
    // Posé sur la barre horizontale : c'est sa nouvelle place, la marque laissée ne sert plus.
    if (sideOn && !inSide(it)) homesOf(it.dataset.tb).forEach((m) => m.remove());
    it.classList.remove('tb-dragging');
    document.body.classList.remove('tb-moving');
    dragging = null;
    tidy();
    fitCaptions();
    save();
    // Le clic qui suit le relâchement ne doit pas actionner le bouton.
    const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, true), 50);
  }

  const onPointerDown = (e) => {
    if (e.button !== 0 || dragging) return;
    if (e.target.closest('#color-pop, .ft-pop, .ft-num-arrows')) return;
    const it = itemOf(e.target);
    if (!it) return;
    const select = e.target.tagName === 'SELECT' ? e.target : null;
    // Une liste s'ouvrirait tout de suite : on l'ouvre au relâchement, sauf si on l'a saisie.
    if (select) e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last = e;
    const timer = setTimeout(() => startItemDrag(it, last.clientX, last.clientY), HOLD);
    const move = (ev) => {
      last = ev;
      if (dragging) { moveItem(ev.clientX, ev.clientY); return; }
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) clearTimeout(timer);
    };
    const up = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      if (dragging) { endItemDrag(); return; }
      if (select) {
        select.focus();
        try { select.showPicker(); } catch { /* pas de liste à ouvrir */ }
      }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  };
  bars.forEach((b) => b.addEventListener('pointerdown', onPointerDown, true));

  // ----- Déplacer la barre : la poignée -----

  const drop = document.createElement('div');
  drop.id = 'tb-drop';
  drop.hidden = true;
  document.body.append(drop);

  function zoneAt(x, y) {
    const r = main.getBoundingClientRect();
    if (y < r.top + r.height * 0.25) return 'haut';
    if (y > r.bottom - r.height * 0.25) return 'bas';
    return x < r.left + r.width / 2 ? 'gauche' : 'droite';
  }

  function showZone(z, i) {
    const r = main.getBoundingClientRect();
    const tabs = document.getElementById('view-tabs').getBoundingClientRect();
    const top = tabs.bottom;
    const box = {
      haut: [r.left, top, r.width, 52],
      bas: [r.left, r.bottom - 80, r.width, 52],
      gauche: [r.left, top, 90, r.bottom - top - 28],
      droite: [r.right - 90, top, 90, r.bottom - top - 28]
    }[z];
    Object.assign(drop.style, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
    const who = linked ? 'Les deux barres' : NAMES[i];
    drop.textContent = who + ' : ' + POSITIONS.find((p) => p[0] === z)[1].toLowerCase();
    drop.hidden = false;
  }

  function gripDown(e, i) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let zone = pos[i];
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      moved = true;
      document.body.classList.add('tb-moving');
      zone = zoneAt(ev.clientX, ev.clientY);
      showZone(zone, i);
    };
    const up = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.body.classList.remove('tb-moving');
      drop.hidden = true;
      if (moved && zone !== pos[i]) { setPos(i, zone); save(); }
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }
  bars.forEach((b, i) => {
    b.querySelector('.tb-grip').addEventListener('pointerdown', (e) => gripDown(e, i));
    const lock = b.querySelector('.tb-lock');
    if (!lock) return;
    lock.addEventListener('mousedown', (e) => e.preventDefault());
    lock.addEventListener('click', () => { setLinked(!linked); save(); });
  });

  function menuItems(i) {
    return [
      { label: linked ? "Place des barres d'outils" : `Place de ${NAMES[i].toLowerCase()}` },
      ...POSITIONS.map(([p, name]) => ({ text: (p === pos[i] ? '✓ ' : '  ') + name, action: () => { setPos(i, p); save(); } })),
      '-',
      { text: (sideOn ? '✓ ' : '  ') + 'Mode raccourcis (barres latérales)', action: () => setSide(!sideOn) },
      ...(i === 1 && !sideOn ? [{ text: folded ? "Sortir la barre d'insertion" : "Ranger la barre d'insertion", action: () => setFolded(!folded) }] : []),
      ...(sideOn ? [] : [{ text: (linked ? '✓ ' : '  ') + 'Déplacer les deux barres ensemble', action: () => { setLinked(!linked); save(); } }]),
      { text: "Remettre les boutons à leur place d'origine", action: resetItems }
    ];
  }
  function resetItems() {
    apply({ v: 7, pos: pos[0], pos2: pos[1], linked, folded, side: { on: sideOn } });
    save();
  }

  sides.forEach((s) => {
    s.addEventListener('pointerdown', onPointerDown, true);
    s.addEventListener('animationend', () => s.classList.remove('tb-opening'));
    s.addEventListener('contextmenu', (e) => {
      if (e.defaultPrevented || e.target.closest('#color-pop, .ft-pop')) return;
      e.preventDefault();
      if (window.FTSidebar) {
        window.FTSidebar.showMenu(e.clientX, e.clientY, [
          { label: 'Mode raccourcis' },
          { text: 'Revenir aux barres horizontales', action: () => setSide(false) },
          { text: "Remettre les boutons à leur place d'origine", action: resetItems }
        ]);
      }
    });
  });

  bars.forEach((b, i) => b.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || e.target.closest('#color-pop, .ft-pop')) return;
    e.preventDefault();
    if (window.FTSidebar) window.FTSidebar.showMenu(e.clientX, e.clientY, menuItems(i));
  }));

  place();
  // Les noms des groupes changent de taille avec le thème du logiciel et la largeur de la fenêtre.
  let fitting = 0;
  const refit = () => { cancelAnimationFrame(fitting); fitting = requestAnimationFrame(fitCaptions); };
  new MutationObserver(refit).observe(document.documentElement, { attributes: true });
  window.addEventListener('resize', refit);

  window.FTToolbar = {
    apply,
    placePop,
    setSide,
    toggleSide() { setSide(!sideOn); },
    isSide: () => sideOn,
    layout,
    onChange(fn) { onChange = fn; }
  };
})();
