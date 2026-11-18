// Suivi des modifications (Édition > « Suivi des modifications », bouton « Suivi » de la barre d'insertion).
// Quand le suivi commence, le texte de chaque paragraphe est gardé comme référence dans le document
// (doc.settings.track = { since, base: [{ tag, text }] }). Le texte actuel est comparé à cette référence,
// mot à mot : les mots ajoutés sont soulignés en vert (sans toucher au texte, par la surbrillance du
// navigateur), les mots supprimés sont signalés par une petite marque rouge à leur place. Le panneau
// « Modifications » liste chaque paragraphe changé : Accepter (la référence prend le texte actuel) ou
// Refuser (le texte revient comme avant, sa mise en forme gardée pour le reste du paragraphe).
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js) ; le texte lu est celui affiché par le
  // moteur (les blocs loin de l'écran y sont, cachés), les refus passent par son pont (une étape d'annulation).
  let G = null;
  const page = $('page');
  const panel = $('track-panel');
  const listBox = $('track-list');
  const layer = document.createElement('div');
  layer.id = 'track-layer';
  page.appendChild(layer);

  const UNITS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, div, .ft-caption';
  const SKIP = '.ft-pg-gap, .ft-toc, .ft-lof, .ft-index, #track-layer, .ft-math';
  const insHighlight = window.Highlight ? new Highlight() : null;
  if (insHighlight) CSS.highlights.set('ft-track-ins', insHighlight);

  let track = null; // { since, base } ou null
  let rows = [];
  let timer = null;
  let showMarks = true;
  let onChange = () => {};

  // ----- Paragraphes et leur texte -----

  // Les paragraphes d'un élément, avec leurs nœuds de texte (pour retrouver la place d'un mot).
  function unitsOf(root) {
    const units = [];
    const byEl = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement.closest(UNITS);
      const unitEl = el && root.contains(el) && el !== root ? el : root;
      let u = byEl.get(unitEl);
      if (!u) {
        u = { el: unitEl, tag: unitEl.tagName.toLowerCase(), nodes: [], text: '' };
        byEl.set(unitEl, u);
        units.push(u);
      }
      u.nodes.push({ node: n, start: u.text.length });
      u.text += n.data;
    }
    return units.filter((u) => u.text.trim());
  }

  const tokenize = (s) => {
    const out = [];
    // Chaque mot avec les espaces qui le suivent : les espaces seuls ne servent pas d'appui à la comparaison
    // (« dort profondément » → « noir dort » : « noir » ajouté, « profondément » retiré).
    for (const m of s.matchAll(/[\p{L}\p{N}'’-]+\s*|[^\s\p{L}\p{N}]\s*|\s+/gu)) out.push({ t: m[0], i: m.index });
    return out;
  };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // Plus longue suite commune (avec début et fin communs retirés d'abord).
  function lcs(a, b, same, limit) {
    let start = 0;
    while (start < a.length && start < b.length && same(a[start], b[start])) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) { endA--; endB--; }
    const pairs = [];
    for (let i = 0; i < start; i++) pairs.push([i, i]);
    const n = endA - start;
    const m = endB - start;
    if (n && m && n * m <= limit) {
      const w = m + 1;
      const t = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          t[i * w + j] = same(a[start + i], b[start + j]) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (same(a[start + i], b[start + j])) { pairs.push([start + i, start + j]); i++; j++; }
        else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
        else j++;
      }
    }
    for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
    return pairs;
  }

  function diff(a, b, same, limit) {
    const out = [];
    let i = 0;
    let j = 0;
    for (const [pi, pj] of [...lcs(a, b, same, limit), [a.length, b.length]]) {
      while (i < pi) out.push({ type: 'del', ai: i++ });
      while (j < pj) out.push({ type: 'ins', bj: j++ });
      if (pi < a.length) out.push({ type: 'same', ai: i++, bj: j++ });
    }
    return out;
  }

  function similar(x, y) {
    const a = new Set(x.toLowerCase().split(/\s+/));
    const b = new Set(y.toLowerCase().split(/\s+/));
    let common = 0;
    a.forEach((w) => { if (b.has(w)) common++; });
    return common / Math.max(a.size, b.size) >= 0.3;
  }

  // Mot à mot dans un paragraphe changé : [{ type: 'ins', start, end } | { type: 'del', at, text }].
  function wordOps(oldText, newText) {
    const a = tokenize(oldText);
    const b = tokenize(newText);
    const parts = diff(a, b, (x, y) => x.t.trimEnd() === y.t.trimEnd(), 4e6);
    const ops = [];
    let pos = 0; // place dans le texte actuel
    for (const p of parts) {
      if (p.type === 'same') { pos = b[p.bj].i + b[p.bj].t.length; continue; }
      if (p.type === 'ins') {
        const tok = b[p.bj];
        const last = ops[ops.length - 1];
        if (last && last.type === 'ins' && last.end === tok.i) last.end = tok.i + tok.t.length;
        else ops.push({ type: 'ins', start: tok.i, end: tok.i + tok.t.length });
        pos = tok.i + tok.t.length;
      } else {
        const last = ops[ops.length - 1];
        if (last && last.type === 'del' && last.at === pos) last.text += a[p.ai].t;
        else ops.push({ type: 'del', at: pos, text: a[p.ai].t });
      }
    }
    // Les espaces seuls ne comptent pas comme une modification.
    return ops.filter((o) => (o.type === 'ins' ? newText.slice(o.start, o.end) : o.text).trim());
  }

  // Compare la référence au texte actuel : une ligne par paragraphe ajouté, supprimé ou changé.
  function compare() {
    const units = unitsOf(editor);
    rows = rowsOf(track.base, units).filter((r) => r.kind !== 'same');
    rows.units = units;
    return rows;
  }

  function rowsOf(base, units) {
    const parts = diff(base, units, (x, y) => norm(x.text) === norm(y.text), 9e6);
    const out = [];
    let lastUnit = -1;
    for (let k = 0; k < parts.length;) {
      if (parts[k].type === 'same') { lastUnit = parts[k].bj; k++; continue; }
      const dels = [];
      const inss = [];
      while (k < parts.length && parts[k].type !== 'same') (parts[k].type === 'del' ? dels : inss).push(parts[k++]);
      const used = new Set();
      for (const d of dels) {
        const pair = inss.find((s) => !used.has(s) && similar(base[d.ai].text, units[s.bj].text));
        if (pair) {
          used.add(pair);
          const ops = wordOps(base[d.ai].text, units[pair.bj].text);
          out.push({ kind: ops.length ? 'change' : 'same', ai: d.ai, bj: pair.bj, unit: units[pair.bj], ops });
        } else {
          out.push({ kind: 'removed', ai: d.ai, after: lastUnit >= 0 ? units[lastUnit] : null, before: inss.length ? units[inss[0].bj] : units[lastUnit + 1] || null });
        }
      }
      for (const s of inss) if (!used.has(s)) out.push({ kind: 'added', bj: s.bj, unit: units[s.bj] });
      if (inss.length) lastUnit = Math.max(lastUnit, ...inss.map((s) => s.bj));
    }
    return out;
  }

  // ----- Marques dans le texte -----

  function rangeAt(unit, start, end) {
    const r = document.createRange();
    const place = (offset, isEnd) => {
      for (let i = 0; i < unit.nodes.length; i++) {
        const { node, start: s } = unit.nodes[i];
        const len = node.data.length;
        if (offset < s + len || (offset === s + len && (isEnd || i === unit.nodes.length - 1))) return [node, Math.max(0, Math.min(len, offset - s))];
      }
      const last = unit.nodes[unit.nodes.length - 1];
      return [last.node, last.node.data.length];
    };
    const [sn, so] = place(start, false);
    const [en, eo] = place(end, true);
    r.setStart(sn, so);
    r.setEnd(en, eo);
    return r;
  }

  function marker(rect, text, row, title) {
    const pr = page.getBoundingClientRect();
    const z = page.currentCSSZoom || 1; // zoom de la page (zoom.js)
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'track-del-mark';
    m.style.left = ((rect.left - pr.left) / z - 3) + 'px';
    m.style.top = ((rect.top - pr.top) / z) + 'px';
    m.style.height = Math.max(12, rect.height / z) + 'px';
    m.title = (title || 'Supprimé') + ' : « ' + text.trim().slice(0, 300) + ' »';
    m.addEventListener('mousedown', (e) => e.preventDefault());
    m.addEventListener('click', () => { openPanel(); focusRow(row); });
    layer.appendChild(m);
  }

  // Bloc retiré de l'affichage (très long document, loin de l'écran) : pas de marque à placer.
  const far = (el) => !!(G && el && el.closest && el.closest('[data-pm-far]'));

  function paint() {
    if (insHighlight) insHighlight.clear();
    layer.textContent = '';
    if (!track || !showMarks) return;
    for (const row of rows) {
      try {
        if (row.kind === 'added') {
          insHighlight && insHighlight.add(rangeAt(row.unit, 0, row.unit.text.length));
        } else if (row.kind === 'change') {
          for (const op of row.ops) {
            if (op.type === 'ins') insHighlight && insHighlight.add(rangeAt(row.unit, op.start, op.end));
            else if (!far(row.unit.el)) {
              const r = rangeAt(row.unit, op.at, op.at);
              const rect = r.getClientRects()[0] || r.getBoundingClientRect();
              if (rect && (rect.height || rect.top)) marker(rect, op.text, row);
            }
          }
        } else if (row.kind === 'removed') {
          const near = row.after || row.before;
          if (!near || far(near.el)) continue;
          const r = rangeAt(near, row.after ? near.text.length : 0, row.after ? near.text.length : 0);
          const rect = r.getClientRects()[0] || r.getBoundingClientRect();
          if (rect) marker(rect, track.base[row.ai].text, row, 'Paragraphe supprimé');
        }
      } catch { /* paragraphe déjà retiré de la page */ }
    }
  }

  // ----- Panneau -----

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cut = (s, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s);

  function rowHtml(row) {
    if (row.kind === 'added') return `<span class="tk-kind add">Ajouté</span><ins>${esc(cut(row.unit.text.trim()))}</ins>`;
    if (row.kind === 'removed') return `<span class="tk-kind del">Supprimé</span><del>${esc(cut(track.base[row.ai].text.trim()))}</del>`;
    // Paragraphe changé : les mots autour des changements, les ajouts en vert, les retraits barrés.
    const text = row.unit.text;
    let html = '';
    let pos = 0;
    const pieces = [];
    for (const op of row.ops) {
      const at = op.type === 'ins' ? op.start : op.at;
      pieces.push({ plain: text.slice(pos, at) });
      if (op.type === 'ins') { pieces.push({ ins: text.slice(op.start, op.end) }); pos = op.end; }
      else { pieces.push({ del: op.text }); pos = op.at; }
    }
    pieces.push({ plain: text.slice(pos) });
    pieces.forEach((p, i) => {
      if (p.ins) html += `<ins>${esc(p.ins)}</ins>`;
      else if (p.del) html += `<del>${esc(p.del)}</del>`;
      else {
        let s = p.plain;
        if (s.length > 70) s = (i === 0 ? '…' + s.slice(-40) : i === pieces.length - 1 ? s.slice(0, 40) + '…' : s.slice(0, 30) + ' … ' + s.slice(-30));
        html += esc(s);
      }
    });
    return `<span class="tk-kind chg">Modifié</span>${html}`;
  }

  function renderPanel() {
    if (panel.hidden) return;
    listBox.textContent = '';
    $('track-count').textContent = rows.length ? `${rows.length} paragraphe${rows.length > 1 ? 's' : ''} modifié${rows.length > 1 ? 's' : ''}` : 'Aucune modification';
    $('track-since').textContent = track ? 'Depuis le ' + new Date(track.since).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'tk-item';
      item.dataset.i = i;
      const text = document.createElement('div');
      text.className = 'tk-text';
      text.innerHTML = rowHtml(row);
      text.addEventListener('click', () => reveal(row));
      const acts = document.createElement('div');
      acts.className = 'tk-acts';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = '✓ Accepter';
      ok.addEventListener('click', () => accept([row]));
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = '✗ Refuser';
      no.addEventListener('click', () => reject([row]));
      acts.append(ok, no);
      item.append(text, acts);
      listBox.appendChild(item);
    });
    $('track-accept-all').disabled = !rows.length;
    $('track-reject-all').disabled = !rows.length;
  }

  function reveal(row) {
    const el = row.unit ? row.unit.el : (row.after || row.before || {}).el;
    if (!el || !el.isConnected) return;
    if (G) { G.reveal(el, 120); G.flash(el); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function focusRow(row) {
    const i = rows.indexOf(row);
    const item = listBox.querySelector(`[data-i="${i}"]`);
    if (!item) return;
    item.scrollIntoView({ block: 'nearest' });
    item.classList.remove('flash');
    void item.offsetWidth;
    item.classList.add('flash');
  }

  function placePanel() {
    const box = $('workspace').getBoundingClientRect();
    panel.style.top = box.top + 8 + 'px';
    panel.style.right = Math.max(8, window.innerWidth - box.right + 22) + 'px';
    panel.style.maxHeight = Math.max(200, box.height - 16) + 'px';
  }

  function openPanel() {
    if (!track) return;
    panel.hidden = false;
    placePanel();
    renderPanel();
  }

  // ----- Accepter, refuser -----

  // La référence prend le texte actuel de ces paragraphes.
  function accept(list) {
    const units = rows.units;
    const set = new Set(list);
    // Nouvelle référence : la comparaison refaite, avec le côté actuel pour les lignes acceptées.
    const parts = diff(track.base, units, (x, y) => norm(x.text) === norm(y.text), 9e6);
    const byAi = new Map();
    const byBj = new Map();
    for (const r of rows) {
      if (r.ai !== undefined) byAi.set(r.ai, r);
      if (r.bj !== undefined) byBj.set(r.bj, r);
    }
    const next = [];
    for (const p of parts) {
      if (p.type === 'same') { next.push(track.base[p.ai]); continue; }
      if (p.type === 'del') {
        const r = byAi.get(p.ai);
        if (r && r.kind === 'removed') { if (!set.has(r)) next.push(track.base[p.ai]); continue; }
        if (r && r.kind === 'change') {
          if (set.has(r)) next.push({ tag: r.unit.tag, text: r.unit.text }); else next.push(track.base[p.ai]);
          continue;
        }
        next.push(track.base[p.ai]);
      } else {
        const r = byBj.get(p.bj);
        if (r && r.kind === 'added' && set.has(r)) next.push({ tag: r.unit.tag, text: r.unit.text });
      }
    }
    track.base = next;
    save();
    refresh();
  }

  // Remet le texte comme dans la référence, pour ces paragraphes.
  function reject(list) {
    if (G) {
      G.edit(() => undo(list));
      refresh();
      return;
    }
    if (window.FTHistory) window.FTHistory.commit();
    undo(list);
    editor.dispatchEvent(new Event('input'));
    if (window.FTHistory) window.FTHistory.commit();
    refresh();
  }

  function undo(list) {
    const ordered = [...list].sort((x, y) => rows.indexOf(y) - rows.indexOf(x));
    for (const row of ordered) {
      try {
        if (row.kind === 'change') {
          for (const op of [...row.ops].sort((x, y) => (y.type === 'ins' ? y.start : y.at) - (x.type === 'ins' ? x.start : x.at))) {
            if (op.type === 'ins') rangeAt(row.unit, op.start, op.end).deleteContents();
            else rangeAt(row.unit, op.at, op.at).insertNode(document.createTextNode(op.text));
          }
        } else if (row.kind === 'added') {
          const el = row.unit.el;
          if (el === editor) continue;
          if (/^(TD|TH)$/.test(el.tagName)) el.replaceChildren(document.createElement('br'));
          else {
            const list = el.tagName === 'LI' ? el.parentElement : null;
            el.remove();
            if (list && !list.querySelector('li')) list.remove();
          }
        } else if (row.kind === 'removed') {
          const base = track.base[row.ai];
          const tag = /^(p|h[1-6]|li)$/.test(base.tag) ? base.tag : 'p';
          const near = row.after || row.before;
          let anchor = near ? near.el : null;
          const el = document.createElement(tag === 'li' && !(anchor && anchor.tagName === 'LI') ? 'p' : tag);
          el.textContent = base.text;
          if (!anchor || anchor === editor) editor.insertBefore(el, editor.firstChild);
          else if (el.tagName === 'LI' || /^(P|H[1-6]|DIV)$/.test(anchor.tagName) && anchor.parentElement === editor) (row.after ? anchor.after(el) : anchor.before(el));
          else {
            while (anchor.parentElement && anchor.parentElement !== editor) anchor = anchor.parentElement;
            if (row.after) anchor.after(el); else anchor.before(el);
          }
        }
      } catch { /* paragraphe déjà changé entre-temps */ }
    }
    editor.normalize();
  }

  // ----- Marche / arrêt -----

  function snapshot() {
    return unitsOf(editor).map((u) => ({ tag: u.tag, text: u.text }));
  }

  function start() {
    track = { since: new Date().toISOString(), base: snapshot() };
    save();
    refresh();
    openPanel();
  }

  async function stop() {
    if (!track) return;
    if (rows.length) {
      const ok = await window.FTApp.ask(`Désactiver le suivi des modifications ? Le texte est conservé en l'état : ${rows.length > 1 ? `les ${rows.length} modifications en cours sont acceptées` : 'la modification en cours est acceptée'}.`, '', { okLabel: 'Désactiver le suivi', input: false });
      if (!ok) return;
    }
    track = null;
    rows = [];
    panel.hidden = true;
    save();
    paint();
    updateButton();
  }

  function save() {
    onChange();
    updateButton();
  }

  function updateButton() {
    const b = $('track-btn');
    if (b) {
      b.classList.toggle('on', !!track);
      b.setAttribute('aria-pressed', String(!!track));
    }
    const st = $('status-track');
    st.hidden = !track;
    if (track) st.textContent = rows.length ? `Suivi : ${rows.length} modification${rows.length > 1 ? 's' : ''}` : 'Suivi des modifications';
  }

  function refresh() {
    clearTimeout(timer);
    if (!track) { paint(); updateButton(); return; }
    compare();
    paint();
    renderPanel();
    updateButton();
  }

  const later = () => {
    if (!track) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, 450);
  };
  editor.addEventListener('input', later);
  document.addEventListener('ft-paginated', () => { if (track) paint(); });
  const resized = new ResizeObserver(() => { if (track) paint(); });
  resized.observe(editor);
  window.addEventListener('resize', () => { if (!panel.hidden) placePanel(); });

  // Le bouton allume ou éteint le suivi ; le panneau s'ouvre depuis la barre d'état (« Suivi : … »).
  $('track-btn').addEventListener('click', () => {
    if (!window.FTApp.currentId()) return;
    if (!track) start();
    else stop();
  });
  $('status-track').addEventListener('click', openPanel);
  $('track-close').addEventListener('click', () => { panel.hidden = true; });
  $('track-accept-all').addEventListener('click', () => accept(rows));
  $('track-reject-all').addEventListener('click', async () => {
    const ok = await window.FTApp.ask(`Refuser les ${rows.length} modifications ? Le texte revient comme au début du suivi.`, '', { okLabel: 'Tout refuser', input: false });
    if (ok) reject(rows);
  });
  $('track-stop').addEventListener('click', stop);
  $('track-marks').addEventListener('change', () => { showMarks = $('track-marks').checked; paint(); });

  window.FTTrack = {
    // Nouveau document ouvert.
    load(settings) {
      const t = settings && settings.track;
      track = t && Array.isArray(t.base) ? { since: t.since || new Date().toISOString(), base: t.base } : null;
      panel.hidden = true;
      rows = [];
      requestAnimationFrame(refresh);
    },
    get: () => (track ? { since: track.since, base: track.base } : undefined),
    // Référence du suivi pour un texte (import Word : le texte d'avant les modifications suivies).
    baseOf(html) {
      const box = document.createElement('div');
      box.innerHTML = html;
      return unitsOf(box).map((u) => ({ tag: u.tag, text: u.text }));
    },
    // Nombre de paragraphes changés entre une référence et un texte.
    countOf(base, html) {
      const box = document.createElement('div');
      box.innerHTML = html;
      return rowsOf(base, unitsOf(box)).filter((r) => r.kind !== 'same').length;
    },
    // Export Word : les modifications en cours (paragraphes et mots), avec les nœuds de texte du document.
    exportRows() {
      if (!track) return null;
      compare();
      return { since: track.since, base: track.base, rows: rows.slice() };
    },
    onChange(fn) { onChange = fn; },
    toggle() {
      if (!window.FTApp.currentId()) return;
      if (track) stop(); else start();
    },
    openPanel,
    refresh,
    useEngine(mount, api) {
      editor = mount;
      G = api;
      resized.disconnect();
      resized.observe(mount);
      window.FTMoteur.onUpdate((tr) => { if (tr.docChanged) later(); });
      // Blocs affichés après un défilement ou un nouveau découpage : marques des suppressions reposées.
      let raf = 0;
      const soon = () => { if (track && !raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
      $('workspace').addEventListener('scroll', soon, { passive: true });
      if (window.FTVisibles) window.FTVisibles.onLayout(soon);
    }
  };
})();
