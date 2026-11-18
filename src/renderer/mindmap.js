// Mindmap : les documents du projet (des points) et leurs liens (( )) (des lignes).
// Les points se repoussent, chaque lien les retient comme un ressort, et le tout baigne dans un
// liquide qui freine les mouvements : un point qu'on tire entraîne doucement ses voisins, puis
// l'ensemble se remet en place (même principe que la vue graphique d'Obsidian).
(function () {
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  const box = $('mindmap');
  const canvas = $('mindmap-canvas');
  const ctx = canvas.getContext('2d');
  const tabDocument = $('tab-document');
  const tabMindmap = $('tab-mindmap');
  const App = () => window.FTApp;

  // ----- Réglages de la simulation -----
  const REPULSION = 420; // force qui écarte les points les uns des autres
  const LINK_LENGTH = 95; // longueur de repos d'un lien
  const GRAVITY = 0.06; // rappel vers le centre (les points sans lien ne s'éloignent pas)
  const FRICTION = 0.42; // part de la vitesse perdue à chaque image : c'est « l'eau »
  const COOLING = 0.0228; // vitesse à laquelle l'agitation retombe
  const DRAG_HEAT = 0.3; // agitation entretenue pendant qu'on tire un point
  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 4;

  // ----- Apparence (Réglages, en haut à droite), gardée avec les réglages du logiciel -----
  const LOOK = { size: 'normal', degree: true, color: 'theme', shape: 'rond', line: 'normal', curve: false,
    label: 'normal', names: 'zoom', spacing: 'normal', background: 'uni' };
  let look = { ...LOOK };
  let onSave = () => {};
  const SIZE = { petit: 0.7, normal: 1, grand: 1.5 };
  const LINE = { fine: 0.8, normal: 1.3, epaisse: 2.4 };
  const LABEL = { petit: 10, normal: 12, grand: 15 };
  const SPACING = { serre: [0.55, 0.7], normal: [1, 1], large: [1.9, 1.5] };
  const spacing = () => SPACING[look.spacing] || SPACING.normal;
  const radiusOf = (n) => (5 + (look.degree ? 1.7 * Math.sqrt(n.degree) : 0)) * (SIZE[look.size] || 1);

  let visible = false;
  let project = null;
  let nodes = [];
  let links = [];
  let byId = new Map();
  let alpha = 0;
  let alphaTarget = 0;
  let frame = 0;
  const view = { x: 0, y: 0, k: 1 }; // décalage (pixels écran) et zoom
  let size = { w: 0, h: 0, dpr: 1 };
  let hover = null;
  let hoverLink = null;
  let gesture = null; // { kind: 'node' | 'pan', node, startX, startY, lastX, lastY, moved }
  const remembered = new Map(); // projet -> (id -> {x, y}) : la disposition reste d'une ouverture à l'autre

  // ----- Filtre : recherche (nom ou #tag) et tags choisis -----
  const filter = { query: '', tags: new Set(), mode: 'surligner', showTags: false };
  let allTags = [];
  const fold = (s) => window.FTTags.fold(s);

  function filtering() {
    return !!filter.query.replace(/^#/, '').trim() || filter.tags.size > 0;
  }

  // Le document correspond : à la recherche (nom ou tag) et à l'un des tags choisis.
  function matches(d) {
    const tags = d.tags || [];
    if (filter.tags.size && !tags.some((t) => filter.tags.has(fold(t.name)))) return false;
    const raw = filter.query.trim();
    const q = fold(raw.replace(/^#/, ''));
    if (!q) return true;
    const tagHit = tags.some((t) => fold(t.name).includes(q));
    return tagHit || (!raw.startsWith('#') && fold(d.title).includes(q));
  }

  function renderTagFilter() {
    const box = $('mindmap-filter-tags');
    box.replaceChildren();
    for (const t of allTags) {
      const el = window.FTTags.chip(t, true);
      const key = fold(t.name);
      el.classList.add('toggle');
      el.classList.toggle('on', filter.tags.has(key));
      el.setAttribute('role', 'button');
      el.title = filter.tags.has(key) ? 'Ne plus filtrer sur ce tag' : 'Ne garder que les documents qui ont ce tag';
      el.addEventListener('click', () => {
        if (filter.tags.has(key)) filter.tags.delete(key); else filter.tags.add(key);
        changeFilter();
      });
      box.append(el);
    }
    box.hidden = !allTags.length;
  }

  function changeFilter() {
    renderTagFilter();
    if (!visible) return;
    if (build()) {
      alpha = Math.max(alpha, 0.5);
      heat(0);
    } else {
      redraw();
    }
  }

  // ----- Données -----

  function build() {
    const graph = App().graph();
    if (project !== graph.project) {
      if (project !== null) filter.tags.clear();
      project = graph.project;
      nodes = [];
    }
    allTags = graph.tags || [];
    const known = new Set(allTags.map((t) => fold(t.name)));
    for (const k of [...filter.tags]) if (!known.has(k)) filter.tags.delete(k);
    renderTagFilter();
    const old = new Map(nodes.map((n) => [n.id, n]));
    const saved = remembered.get(project) || new Map();
    // « Afficher seulement » : les autres documents sortent de la mindmap (et leurs liens avec).
    const only = filter.mode === 'seuls' && filtering();
    const kept = graph.nodes.filter((d) => !only || matches(d));
    // Les points qui sortent gardent leur place pour quand ils reviennent.
    for (const n of nodes) saved.set(n.id, { x: n.x, y: n.y });
    remembered.set(project, saved);
    nodes = kept.map((d, i) => {
      const n = old.get(d.id) || { id: d.id, vx: 0, vy: 0, ...(saved.get(d.id) || spiral(i)) };
      n.title = d.title;
      n.tags = d.tags || [];
      n.hit = !filtering() || matches(d);
      n.degree = 0;
      return n;
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    // Un lien dans un sens ou dans l'autre : une seule ligne.
    const seen = new Set();
    links = [];
    for (const [a, b] of graph.links) {
      if (a === b || !byId.has(a) || !byId.has(b)) continue;
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(key)) continue;
      seen.add(key);
      const link = { source: byId.get(a), target: byId.get(b) };
      link.source.degree++;
      link.target.degree++;
      links.push(link);
    }
    for (const n of nodes) {
      n.radius = radiusOf(n);
      n.neighbours = new Set();
    }
    for (const l of links) {
      l.source.neighbours.add(l.target);
      l.target.neighbours.add(l.source);
    }
    $('mindmap-empty').hidden = nodes.length > 0;
    const hits = nodes.filter((n) => n.hit).length;
    $('mindmap-count').textContent = graph.nodes.length
      ? `${project} · ${nodes.length} document${nodes.length > 1 ? 's' : ''} · ${links.length} lien${links.length > 1 ? 's' : ''}` +
        (filtering() ? ` · ${hits} correspond${hits > 1 ? 'ent' : ''}` : '')
      : project || '';
    $('mindmap-empty').textContent = graph.nodes.length ? 'Aucun document ne correspond au filtre.' : 'Aucun document dans ce projet.';
    const fresh = nodes.some((n) => !old.has(n.id));
    return fresh || old.size !== nodes.length;
  }

  // Position de départ des nouveaux points : une spirale autour du centre.
  function spiral(i) {
    const r = 18 * Math.sqrt(0.5 + i);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  function remember() {
    if (!project) return;
    const saved = remembered.get(project) || new Map();
    for (const n of nodes) saved.set(n.id, { x: n.x, y: n.y });
    remembered.set(project, saved);
  }

  // ----- Simulation -----

  function tick() {
    alpha += (alphaTarget - alpha) * COOLING;
    // Les points se repoussent (plus fort de près).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        if (d2 > 250000) continue; // trop loin pour compter
        const f = (REPULSION * spacing()[0] * alpha) / Math.max(d2, 400);
        a.vx -= dx * f; a.vy -= dy * f;
        b.vx += dx * f; b.vy += dy * f;
      }
    }
    // Les liens tirent comme des ressorts ; un point très relié bouge moins.
    for (const l of links) {
      const s = l.source;
      const t = l.target;
      const dx = t.x + t.vx - s.x - s.vx || 0.01;
      const dy = t.y + t.vy - s.y - s.vy || 0.01;
      const d = Math.sqrt(dx * dx + dy * dy);
      const strength = 1 / Math.min(s.degree, t.degree);
      const f = ((d - LINK_LENGTH * spacing()[1]) / d) * alpha * strength;
      const bias = s.degree / (s.degree + t.degree);
      t.vx -= dx * f * bias; t.vy -= dy * f * bias;
      s.vx += dx * f * (1 - bias); s.vy += dy * f * (1 - bias);
    }
    for (const n of nodes) {
      n.vx -= n.x * GRAVITY * alpha;
      n.vy -= n.y * GRAVITY * alpha;
      if (n.fixed) {
        n.x = n.fixed.x; n.y = n.fixed.y; n.vx = 0; n.vy = 0;
        continue;
      }
      n.vx *= 1 - FRICTION;
      n.vy *= 1 - FRICTION;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  function heat(target) {
    alphaTarget = target;
    alpha = Math.max(alpha, Math.min(1, target + 0.12));
    loop();
  }

  function loop() {
    if (frame || !visible) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      tick();
      draw();
      if (alpha > 0.002 || alphaTarget > 0) loop();
      else remember();
    });
  }

  // Un seul dessin par image de l'écran, même si la souris ou la molette en demandent plusieurs.
  let drawFrame = 0;
  function redraw() {
    if (visible && !frame && !drawFrame) drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); });
  }

  // ----- Vue (zoom et déplacement) -----

  const toWorld = (sx, sy) => ({ x: (sx - size.w / 2 - view.x) / view.k, y: (sy - size.h / 2 - view.y) / view.k });

  function fit() {
    if (!nodes.length || !size.w) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    }
    const k = Math.min((size.w - 160) / Math.max(x1 - x0, 1), (size.h - 160) / Math.max(y1 - y0, 1), 1.6);
    view.k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    view.x = -((x0 + x1) / 2) * view.k;
    view.y = -((y0 + y1) / 2) * view.k;
  }

  function resize() {
    const r = box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    size = { w: r.width, h: r.height, dpr };
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }

  // ----- Dessin -----

  function colors() {
    const css = getComputedStyle(document.documentElement);
    const get = (name) => css.getPropertyValue(name).trim();
    return { text: get('--text'), muted: get('--text-muted'), accent: get('--accent'), bg: get('--bg'), line: get('--border') };
  }

  function draw() {
    if (!visible) return;
    const c = colors();
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * (w / 2 + view.x), dpr * (h / 2 + view.y));
    const focus = hover || (gesture && gesture.kind === 'node' ? gesture.node : null);
    // « Atténuer » : les documents qui ne correspondent pas au filtre pâlissent.
    const faded = (n) => filter.mode === 'attenuer' && !n.hit;
    const lit = (n) => (!focus || n === focus || focus.neighbours.has(n)) && !faded(n);
    const current = App().currentId();
    background(c);

    // Lignes
    ctx.lineWidth = (LINE[look.line] || 1.3) / view.k;
    for (const l of links) {
      const on = (focus && (l.source === focus || l.target === focus)) || l === hoverLink;
      const dim = faded(l.source) || faded(l.target);
      ctx.globalAlpha = on ? 0.95 : focus || dim ? 0.12 : 0.5;
      ctx.strokeStyle = on ? c.accent : c.muted;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      if (look.curve) {
        const { x, y } = bend(l);
        ctx.quadraticCurveTo(x, y, l.target.x, l.target.y);
      } else ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
    }

    // Points
    for (const n of nodes) {
      const own = n === focus || n.id === current;
      ctx.globalAlpha = (lit(n) || n === focus ? 1 : faded(n) ? 0.14 : 0.25) * (own || !n.degree ? 1 : 0.72);
      ctx.fillStyle = n === focus ? c.accent : fillOf(n, c, n.id === current);
      ctx.beginPath();
      if (look.shape === 'carre') ctx.rect(n.x - n.radius * 0.9, n.y - n.radius * 0.9, n.radius * 1.8, n.radius * 1.8);
      else ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();
      // Filtre actif : un anneau autour des documents qui correspondent.
      if (n.hit && filtering() && filter.mode === 'surligner') {
        ctx.strokeStyle = c.accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2 / view.k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (n.id === current && n !== focus) {
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.5 / view.k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Noms, juste au-dessus des points. De loin, ils s'effacent (sauf autour du point survolé).
    // Réglage « Noms » : toujours, selon le zoom, ou seulement autour du point survolé.
    const far = look.names === 'toujours' ? 1 : look.names === 'survol' ? 0 : Math.max(0, Math.min(1, (view.k - 0.35) / 0.35));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const fontSize = (LABEL[look.label] || 12) / Math.max(view.k, 0.75); // lisible même un peu dézoomé
    ctx.font = `${fontSize}px "Segoe UI", system-ui, sans-serif`;
    for (const n of nodes) {
      const near = focus && (lit(n) || n === focus);
      const a = (near ? 1 : focus ? 0.2 * far : far) * (!faded(n) || n === focus ? 1 : 0.3);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = n === focus ? c.accent : c.text;
      const label = n.title.length > 40 ? n.title.slice(0, 38) + '…' : n.title;
      ctx.lineWidth = 3 / view.k;
      ctx.strokeStyle = c.bg;
      ctx.lineJoin = 'round';
      ctx.strokeText(label, n.x, n.y - n.radius - 4 / view.k);
      ctx.fillText(label, n.x, n.y - n.radius - 4 / view.k);
    }

    // Tags, discrets : un petit point de couleur et le nom, sous le document.
    if (filter.showTags) {
      const tagSize = 10 / Math.max(view.k, 0.75);
      ctx.font = `${tagSize}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      for (const n of nodes) {
        if (!n.tags.length) continue;
        const a = (focus ? (lit(n) || n === focus ? 0.85 : 0.15) : 0.7 * far) * (faded(n) ? 0.3 : 1);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        const parts = n.tags.slice(0, 3);
        const dot = tagSize * 0.32;
        const gap = tagSize * 0.5;
        const widths = parts.map((t) => dot * 2 + tagSize * 0.3 + ctx.measureText(t.name).width);
        let x = n.x - (widths.reduce((s, w) => s + w, 0) + gap * (parts.length - 1)) / 2;
        const y = n.y + n.radius + 4 / view.k;
        parts.forEach((t, i) => {
          ctx.fillStyle = window.FTTags.colorOf(t.color);
          ctx.beginPath();
          ctx.arc(x + dot, y + tagSize * 0.55, dot, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = c.muted;
          ctx.fillText(t.name, x + dot * 2 + tagSize * 0.3, y);
          x += widths[i] + gap;
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  // Couleur d'un point : celle du thème, du premier tag du document, ou la couleur d'accent.
  function fillOf(n, c, isCurrent) {
    if (look.color === 'tag') return n.tags.length ? window.FTTags.colorOf(n.tags[0].color) : c.muted;
    if (look.color === 'accent') return c.accent;
    return isCurrent ? c.accent : n.degree ? c.text : c.muted;
  }
  // Point de contrôle d'un lien courbe : sur le côté, au milieu du lien.
  function bend(l) {
    const dx = l.target.x - l.source.x;
    const dy = l.target.y - l.source.y;
    return { x: (l.source.x + l.target.x) / 2 - dy * 0.18, y: (l.source.y + l.target.y) / 2 + dx * 0.18 };
  }
  // Fond : uni, points ou quadrillage, sur la partie visible.
  function background(c) {
    if (look.background === 'uni') return;
    const step = 40;
    const a = toWorld(0, 0);
    const b = toWorld(size.w, size.h);
    const x0 = Math.floor(a.x / step) * step;
    const y0 = Math.floor(a.y / step) * step;
    ctx.globalAlpha = look.background === 'points' ? 0.4 : 0.12;
    ctx.fillStyle = c.muted;
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1 / view.k;
    if (look.background === 'points') {
      if ((b.x - a.x) / step * (b.y - a.y) / step > 40000) { ctx.globalAlpha = 1; return; }
      const r = 1.3 / view.k;
      for (let x = x0; x <= b.x; x += step) for (let y = y0; y <= b.y; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.beginPath();
      for (let x = x0; x <= b.x; x += step) { ctx.moveTo(x, a.y); ctx.lineTo(x, b.y); }
      for (let y = y0; y <= b.y; y += step) { ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ----- Souris -----

  function nodeAt(sx, sy) {
    const p = toWorld(sx, sy);
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const reach = n.radius + 6 / view.k;
      if (d <= reach && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  // Lien sous la souris (à quelques pixels de la ligne).
  function linkAt(sx, sy) {
    const p = toWorld(sx, sy);
    const reach = 5 / view.k;
    let best = null;
    let bestD = Infinity;
    for (const l of links) {
      const { source: a, target: b } = l;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
      if (d <= reach && d < bestD) { best = l; bestD = d; }
    }
    return best;
  }

  // ----- Infobulles : un point (titre, tags, mots, date) ou un lien (la phrase qui le contient) -----

  const tip = $('mindmap-tip');
  const TIP_DELAY = 550;
  let tipTimer = null;
  let tipRequest = 0;

  function hideTip() {
    clearTimeout(tipTimer);
    tipRequest++;
    tip.hidden = true;
  }

  function scheduleTip(p) {
    hideTip();
    if (!hover && !hoverLink) return;
    const node = hover;
    const link = hoverLink;
    const id = tipRequest;
    tipTimer = setTimeout(async () => {
      const content = node ? await nodeTip(node) : await linkTip(link);
      if (id !== tipRequest || !content) return;
      tip.replaceChildren(...content);
      tip.hidden = false;
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      tip.style.left = Math.max(8, Math.min(p.x + 16, size.w - w - 8)) + 'px';
      tip.style.top = (p.y + 18 + h > size.h - 8 ? Math.max(8, p.y - h - 12) : p.y + 18) + 'px';
    }, TIP_DELAY);
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  async function nodeTip(n) {
    const info = await App().docInfo(n.id);
    if (!info) return null;
    const out = [el('div', 'tip-title', info.title)];
    if (info.tags.length) {
      const row = el('div', 'tip-tags');
      info.tags.forEach((t) => row.append(window.FTTags.chip(t, true)));
      out.push(row);
    }
    const date = new Date(info.modified);
    const when = isNaN(date) ? '' : ` · modifié le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    out.push(el('div', 'tip-meta', `${info.words.toLocaleString('fr-FR')} mot${info.words > 1 ? 's' : ''}${when}`));
    return out;
  }

  // Un lien peut aller dans les deux sens : les phrases de chaque côté.
  async function linkTip(l) {
    const out = [];
    for (const [a, b] of [[l.source, l.target], [l.target, l.source]]) {
      const list = await App().linkSnippets(a.id, b.id);
      if (!list.length) continue;
      out.push(el('div', 'tip-title', `${a.title} → ${b.title}`));
      for (const s of list) {
        const q = el('div', 'tip-quote');
        q.append(s.before, el('b', '', `((${s.link}))`), s.after);
        out.push(q);
      }
    }
    return out.length ? out : null;
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    hideTip();
    if (e.button !== 0) return;
    const p = local(e);
    const node = nodeAt(p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
    gesture = { kind: node ? 'node' : 'pan', node, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, moved: false };
    if (node) {
      node.fixed = { x: node.x, y: node.y };
      canvas.style.cursor = 'grabbing';
    } else {
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!gesture) {
      const n = nodeAt(p.x, p.y);
      const l = n ? null : linkAt(p.x, p.y);
      if (n !== hover || l !== hoverLink) {
        hover = n;
        hoverLink = l;
        canvas.style.cursor = n ? 'pointer' : 'grab';
        redraw();
        scheduleTip(p);
      }
      return;
    }
    if (Math.hypot(p.x - gesture.startX, p.y - gesture.startY) > 4) gesture.moved = true;
    if (gesture.kind === 'node') {
      if (!gesture.moved) return;
      gesture.node.fixed = toWorld(p.x, p.y);
      heat(DRAG_HEAT);
    } else {
      view.x += p.x - gesture.lastX;
      view.y += p.y - gesture.lastY;
      redraw();
    }
    gesture.lastX = p.x;
    gesture.lastY = p.y;
  });

  function endGesture(e, cancelled) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = hover ? 'pointer' : 'grab';
    if (g.kind !== 'node') return;
    g.node.fixed = null;
    if (g.moved) {
      alphaTarget = 0; // l'ensemble se calme tout seul
      loop();
    } else if (!cancelled) {
      App().openDocById(g.node.id);
    }
  }
  canvas.addEventListener('pointerup', (e) => endGesture(e, false));
  canvas.addEventListener('pointercancel', (e) => endGesture(e, true));
  canvas.addEventListener('pointerleave', () => {
    hideTip();
    if (!gesture && (hover || hoverLink)) { hover = null; hoverLink = null; redraw(); }
  });

  // Molette : zoom autour de la souris.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    hideTip();
    const p = local(e);
    const before = toWorld(p.x, p.y);
    view.k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x = p.x - size.w / 2 - before.x * view.k;
    view.y = p.y - size.h / 2 - before.y * view.k;
    redraw();
  }, { passive: false });

  $('mindmap-center').addEventListener('click', () => { fit(); redraw(); });

  $('mindmap-search').addEventListener('input', (e) => { filter.query = e.target.value; changeFilter(); });
  $('mindmap-search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; filter.query = ''; changeFilter(); } });
  $('mindmap-filter-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    filter.mode = b.dataset.mode;
    $('mindmap-filter-mode').querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    changeFilter();
  }));
  $('mindmap-show-tags').addEventListener('change', (e) => { filter.showTags = e.target.checked; redraw(); });

  // ----- Affichage -----

  function show(on) {
    if (on === visible) return;
    visible = on;
    if (on && window.FTTimeline && window.FTTimeline.isVisible()) window.FTTimeline.show(false);
    box.hidden = !on;
    main.classList.toggle('view-mindmap', on);
    tabDocument.setAttribute('aria-selected', String(!on));
    tabMindmap.setAttribute('aria-selected', String(on));
    if (!on) {
      hideTip();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      remember();
      return;
    }
    resize();
    const changed = build();
    if (changed) {
      // La disposition est calculée d'avance, sans animation, puis tout est cadré.
      alpha = 1;
      alphaTarget = 0;
      for (let i = 0; i < 200 && alpha > 0.02; i++) tick();
      fit();
    }
    hover = null;
    draw();
    loop();
  }

  function refresh() {
    if (!visible) return;
    if (build()) heat(0);
    else redraw();
  }

  tabDocument.addEventListener('click', () => show(false));
  tabMindmap.addEventListener('click', () => show(true));
  new ResizeObserver(() => { if (visible) resize(); }).observe(box);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  // Position des points à l'écran, par titre (pour les essais automatiques).
  function positions() {
    const r = canvas.getBoundingClientRect();
    return Object.fromEntries(nodes.map((n) => [n.title, { x: r.left + size.w / 2 + view.x + n.x * view.k, y: r.top + size.h / 2 + view.y + n.y * view.k }]));
  }

  // ----- Réglages de l'apparence -----

  const settings = window.FTViewSettings.build({
    panel: $('mindmap-settings'),
    button: $('mindmap-settings-btn'),
    title: 'Réglages de la mindmap',
    rows: [
      { key: 'size', label: 'Points', choices: [['petit', 'Petits'], ['normal', 'Normaux'], ['grand', 'Grands']] },
      { key: 'shape', label: 'Forme', choices: [['rond', 'Ronds'], ['carre', 'Carrés']] },
      { key: 'color', label: 'Couleur', choices: [['theme', 'Thème'], ['tag', 'Premier tag'], ['accent', 'Accent']] },
      { key: 'line', label: 'Liens', choices: [['fine', 'Fins'], ['normal', 'Normaux'], ['epaisse', 'Épais']] },
      { key: 'label', label: 'Taille des noms', choices: [['petit', 'Petite'], ['normal', 'Normale'], ['grand', 'Grande']] },
      { key: 'names', label: 'Noms affichés', choices: [['toujours', 'Toujours'], ['zoom', 'Selon le zoom'], ['survol', 'Au survol']] },
      { key: 'spacing', label: 'Espacement', choices: [['serre', 'Serré'], ['normal', 'Normal'], ['large', 'Large']] },
      { key: 'background', label: 'Fond', choices: [['uni', 'Uni'], ['points', 'Points'], ['quadrillage', 'Quadrillage']] },
      { label: 'Options', checks: [['degree', 'Taille selon le nombre de liens'], ['curve', 'Liens courbes']] }
    ],
    get: () => look,
    set: (k, v) => setLook({ ...look, [k]: v }),
    reset: () => setLook({ ...LOOK })
  });
  function setLook(next) {
    const moved = next.spacing !== look.spacing;
    look = next;
    onSave({ ...look });
    settings.sync();
    for (const n of nodes) n.radius = radiusOf(n);
    if (!visible) return;
    if (moved) heat(0); else redraw();
  }

  window.FTMindmap = {
    init(saved, save) {
      if (saved && typeof saved === 'object') {
        look = { ...LOOK };
        for (const k of Object.keys(LOOK)) if (saved[k] != null && typeof saved[k] === typeof LOOK[k]) look[k] = saved[k];
      }
      onSave = save || (() => {});
      settings.sync();
    },
    look: () => ({ ...look }),
    show, toggle: () => show(!visible), refresh, isVisible: () => visible, positions
  };
})();
